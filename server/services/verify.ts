import OpenAI from 'openai';

// Initialize OpenAI client - will use OPENAI_API_KEY from environment
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

export async function openAiVerify({ 
  pageBytes, 
  ocrText 
}: { 
  pageBytes: Buffer; 
  ocrText: string; 
}): Promise<boolean> {
  try {
    // Skip verification if no API key or text is too short
    if (!process.env.OPENAI_API_KEY || ocrText.length < 50) {
      console.log('⏭️  Skipping OpenAI verification (no API key or text too short)');
      return true; // Fail-open to avoid blocking
    }
    
    console.log(`🤖 Verifying OCR quality for ${ocrText.length} characters`);
    
    // Lightweight verification prompt focused on legal document patterns
    const prompt = `You are checking OCR quality for a legal document page. Reply with one JSON line: {"ok":true|false,"reason":"..."}.

Rules for ok=false:
- Text looks truncated (sudden cutoffs mid-sentence)
- Missing list numbers (e.g., "1." appears but no "2." follows expected content)
- Suspiciously short for a legal page (under 200 chars for what should be full page)
- Garbled text with many symbol artifacts or nonsense sequences
- Missing standard legal document structure markers

Rules for ok=true:
- Paragraphs and list numbering look intact and sequential
- Text flows naturally without major truncation
- Standard legal formatting patterns are preserved
- Even if some minor OCR errors exist, overall structure is intact

OCR text to verify:
"""${ocrText.slice(0, 4000)}"""${ocrText.length > 4000 ? '\n[Text truncated for analysis...]' : ''}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Fast and cost-effective for verification
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.0, // Consistent evaluation
      max_tokens: 100, // Just need JSON response
    });
    
    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      console.log('⚠️  OpenAI verification: no response content');
      return true; // Fail-open
    }
    
    try {
      const result = JSON.parse(content);
      const isOk = !!result.ok;
      
      console.log(`${isOk ? '✅' : '❌'} OpenAI verification: ${isOk ? 'PASS' : 'FAIL'}${result.reason ? ` - ${result.reason}` : ''}`);
      
      return isOk;
      
    } catch (parseError) {
      console.warn('⚠️  OpenAI verification: invalid JSON response:', content);
      return true; // Fail-open on parse errors
    }
    
  } catch (error) {
    console.error('❌ OpenAI verification error:', error instanceof Error ? error.message : 'Unknown error');
    
    // Fail-open: if verification service fails, don't block OCR processing
    return true;
  }
}

export async function isOpenAiAvailable(): Promise<boolean> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return false;
    }
    
    // Simple test call to check API availability
    await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: 'user', content: 'Test' }],
      max_tokens: 1,
    });
    
    return true;
  } catch (error) {
    console.warn('⚠️  OpenAI API not available:', error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
}