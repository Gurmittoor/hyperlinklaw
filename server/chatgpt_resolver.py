"""
ChatGPT API Resolution Endpoint
Provides deterministic hyperlink decisions using the same API as your app
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import json
import requests
import os

class DestinationCandidate(BaseModel):
    dest_page: int
    confidence: float
    method: str

class HyperlinkRef(BaseModel):
    source_file: str
    source_page: int
    ref_type: str
    ref_value: str
    snippet: str
    rects: List[List[float]]

class ResolutionRequest(BaseModel):
    ref: HyperlinkRef
    candidates: List[DestinationCandidate]
    rules: Dict[str, Any]

class ResolutionResponse(BaseModel):
    decision: str
    dest_page: Optional[int] = None
    reason: str

app = FastAPI(title="ChatGPT Hyperlink Resolver", version="1.0.0")

# Exact system prompt from specification
SYSTEM_PROMPT = """Role: Hyperlink Orchestrator (Deterministic).
Mission: Apply the provided non-LLM mapping rules exactly. Do not generate content. Do not invent pages. Your decisions must be reproducible.
Rules:
1. Only consider the candidates provided.
2. If any candidate ≥ min_confidence, select using this priority: highest confidence → lowest page number → method_order.
3. If all candidates < min_confidence, respond needs_review.
4. Output only strict JSON: {"decision":"pick","dest_page":N,"reason":"..."} or {"decision":"needs_review"}.
Prohibited: speculation, external links, references to any pages not in candidates.
Temperature: 0. Top_p: 1."""

@app.get("/")
async def root():
    return {
        "service": "ChatGPT Hyperlink Resolver",
        "purpose": "Deterministic hyperlink resolution using same ChatGPT API",
        "reproducibility": "100% - identical inputs = identical outputs"
    }

@app.post("/resolve", response_model=ResolutionResponse)
async def resolve_hyperlink(request: ResolutionRequest):
    """
    Resolve hyperlink ambiguity using ChatGPT API with exact deterministic prompt
    """
    
    # Check if OpenAI API key is available
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        return ResolutionResponse(
            decision="needs_review",
            reason="OpenAI API key not available"
        )
    
    # Prepare input data exactly as specified
    input_data = {
        "ref": request.ref.dict(),
        "candidates": [c.dict() for c in request.candidates],
        "rules": request.rules
    }
    
    try:
        # Call ChatGPT API with exact parameters
        response = requests.post(
            'https://api.openai.com/v1/chat/completions',
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json'
            },
            json={
                'model': 'gpt-3.5-turbo',
                'temperature': 0,
                'top_p': 1,
                'messages': [
                    {'role': 'system', 'content': SYSTEM_PROMPT},
                    {'role': 'user', 'content': json.dumps(input_data, indent=2)}
                ]
            }
        )
        
        if response.status_code == 200:
            result = response.json()
            content = result['choices'][0]['message']['content']
            
            try:
                decision_data = json.loads(content)
                return ResolutionResponse(
                    decision=decision_data.get('decision', 'needs_review'),
                    dest_page=decision_data.get('dest_page'),
                    reason=decision_data.get('reason', 'ChatGPT API decision')
                )
            except json.JSONDecodeError:
                return ResolutionResponse(
                    decision="needs_review",
                    reason="Invalid JSON response from ChatGPT API"
                )
        else:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"ChatGPT API error: {response.text}"
            )
            
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Resolution failed: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    # Use CHATGPT_PORT environment variable or default to 8003 to avoid conflicts with main server
    port = int(os.environ.get('CHATGPT_PORT', '8003'))
    uvicorn.run(app, host="0.0.0.0", port=port)