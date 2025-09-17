"""
Instant PDF Processing for Court-Ready Master PDF Generation
FastAPI server with POST /instant endpoint for immediate processing
"""

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import fitz  # PyMuPDF
import json
import os
import tempfile
import shutil
from pathlib import Path
from typing import List, Optional
import hashlib
from datetime import datetime

from deterministic_hyperlink_detector import DeterministicHyperlinkDetector

app = FastAPI(title="Instant Legal Document Processor", version="2.0.0")

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Output directory for processed files
OUTPUT_DIR = Path("data/out")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

@app.get("/")
async def root():
    return {
        "service": "Instant Legal Document Processor",
        "version": "2.0.0",
        "purpose": "Court-ready Master PDF generation with AI-Powered analysis",
        "endpoints": {
            "instant": "POST /instant - Upload PDFs, get Master PDF",
            "download": "GET /download/{filename} - Download processed files"
        }
    }

@app.post("/instant")
async def instant_process(
    brief_files: List[UploadFile] = File(...),
    trial_record: UploadFile = File(...),
    min_confidence: float = Form(0.92),
    use_gpt5: bool = Form(True),
    model: str = Form("AI-Powered"),
    seed: int = Form(42),
    place_margin_markers: bool = Form(True)
):
    """
    Instant processing of legal documents to create court-ready Master PDF
    
    Args:
        brief_files: List of Brief PDF files
        trial_record: Trial Record PDF file
        min_confidence: Minimum confidence threshold (default: 0.92)
        use_gpt5: Use AI-Powered analysis for resolution (default: True)
        model: AI model to use (default: AI-Powered)
        seed: Deterministic seed (default: 42)
        place_margin_markers: Add margin markers for unfound rectangles (default: True)
    
    Returns:
        JSON with file paths and validation statistics
    """
    
    # Create temporary directory for processing
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        
        try:
            # Save uploaded files
            brief_paths = []
            for i, brief_file in enumerate(brief_files):
                if not brief_file.filename.endswith('.pdf'):
                    raise HTTPException(status_code=400, detail=f"Brief file {i+1} must be PDF")
                
                brief_path = temp_path / f"brief_{i+1}_{brief_file.filename}"
                with open(brief_path, "wb") as f:
                    content = await brief_file.read()
                    f.write(content)
                brief_paths.append(str(brief_path))
            
            if not trial_record.filename.endswith('.pdf'):
                raise HTTPException(status_code=400, detail="Trial record must be PDF")
            
            trial_record_path = temp_path / f"trial_record_{trial_record.filename}"
            with open(trial_record_path, "wb") as f:
                content = await trial_record.read()
                f.write(content)
            
            # Process with deterministic pipeline
            detector = DeterministicHyperlinkDetector(str(OUTPUT_DIR))
            
            # Set model configuration
            if use_gpt5:
                os.environ['OPENAI_MODEL'] = model
            
            result = detector.process_deterministic_pipeline(
                brief_paths=brief_paths,
                trial_record_path=str(trial_record_path),
                min_confidence=min_confidence
            )
            
            # Validate the Master PDF
            master_pdf_path = result['outputs']['master_pdf']
            validation_result = validate_master_pdf(master_pdf_path)
            
            # Add validation to result
            result['validation'] = validation_result
            result['processing_info'] = {
                "timestamp": datetime.now().isoformat(),
                "brief_count": len(brief_files),
                "trial_record": trial_record.filename,
                "min_confidence": min_confidence,
                "model_used": model if use_gpt5 else "deterministic_only",
                "seed": seed,
                "margin_markers": place_margin_markers
            }
            
            # Check for broken links
            if validation_result['broken_links'] > 0:
                result['status'] = 'warning'
                result['message'] = f"Master PDF created but contains {validation_result['broken_links']} broken links"
            else:
                result['status'] = 'success'
                result['message'] = "Master PDF ready for court submission"
            
            # Add download URLs
            result['downloads'] = {
                "master_pdf": f"/download/{Path(master_pdf_path).name}",
                "candidate_map_json": f"/download/{Path(result['outputs']['candidate_map_json']).name}",
                "candidate_map_csv": f"/download/{Path(result['outputs']['candidate_map_csv']).name}",
                "validation_report": "/download/validation_report.json"
            }
            
            # Save validation report
            with open(OUTPUT_DIR / "validation_report.json", 'w') as f:
                json.dump(validation_result, f, indent=2)
            
            return JSONResponse(content=result)
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@app.get("/download/{filename}")
async def download_file(filename: str):
    """Download processed files"""
    file_path = OUTPUT_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type='application/pdf' if filename.endswith('.pdf') else 'application/octet-stream'
    )

@app.get("/validation/latest")
async def get_latest_validation():
    """Get the latest validation report"""
    validation_path = OUTPUT_DIR / "validation_report.json"
    
    if not validation_path.exists():
        raise HTTPException(status_code=404, detail="No validation report found")
    
    with open(validation_path, 'r') as f:
        validation_data = json.load(f)
    
    return validation_data

def validate_master_pdf(pdf_path: str) -> dict:
    """
    Validate Master PDF for broken links and court readiness
    
    Args:
        pdf_path: Path to the Master PDF
        
    Returns:
        Validation report dictionary
    """
    try:
        doc = fitz.open(pdf_path)
        
        total_pages = len(doc)
        total_links = 0
        broken_links = 0
        link_details = []
        
        for page_num in range(total_pages):
            page = doc[page_num]
            links = page.get_links()
            
            for link in links:
                total_links += 1
                
                if link.get("kind") == fitz.LINK_GOTO:
                    target_page = link.get("page", -1)
                    
                    if target_page < 0 or target_page >= total_pages:
                        broken_links += 1
                        link_details.append({
                            "source_page": page_num + 1,
                            "target_page": target_page + 1,
                            "status": "broken",
                            "reason": "Target page out of range"
                        })
                    else:
                        link_details.append({
                            "source_page": page_num + 1,
                            "target_page": target_page + 1,
                            "status": "valid"
                        })
        
        doc.close()
        
        # Calculate file hash for integrity
        with open(pdf_path, 'rb') as f:
            file_hash = hashlib.sha256(f.read()).hexdigest()
        
        validation_report = {
            "timestamp": datetime.now().isoformat(),
            "pdf_path": pdf_path,
            "file_hash": file_hash,
            "total_pages": total_pages,
            "total_links": total_links,
            "broken_links": broken_links,
            "valid_links": total_links - broken_links,
            "court_ready": broken_links == 0,
            "link_details": link_details[:50],  # Limit for readability
            "summary": {
                "status": "PASS" if broken_links == 0 else "FAIL",
                "message": "Court ready" if broken_links == 0 else f"{broken_links} broken links found"
            }
        }
        
        return validation_report
        
    except Exception as e:
        return {
            "timestamp": datetime.now().isoformat(),
            "error": f"Validation failed: {str(e)}",
            "court_ready": False,
            "summary": {
                "status": "ERROR",
                "message": f"Validation error: {str(e)}"
            }
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)