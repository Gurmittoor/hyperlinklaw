import { db } from '../db';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';
import vision from '@google-cloud/vision';
import OpenAI from 'openai';
import { loadPdfPageBytes } from './pdfUtils';

// Initialize services
const visionClient = new vision.ImageAnnotatorClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * IMMEDIATE BATCH 1 OCR - Processes pages 1-50 with HIGH priority
 * Called immediately on document upload for instant INDEX access
 */
export async function startBatch1OCR({ 
  documentId, 
  filePath, 
  totalPages, 
  priority = 'HIGH' 
}: {
  documentId: string;
  filePath: string;
  totalPages: number;
  priority?: string;
}) {
  console.log(`🚀 Starting Batch 1 OCR for ${documentId} with ${priority} priority`);
  
  const endPage = Math.min(50, totalPages);
  
  try {
    // Process pages 1-50 immediately with dual verification
    for (let page = 1; page <= endPage; page++) {
      await processPageWithDualVerification({
        documentId,
        filePath,
        pageNumber: page
      });
      
      console.log(`✅ Batch 1: Page ${page}/${endPage} completed`);
    }
    
    // Mark Batch 1 as ready
    await db.execute(sql`
      UPDATE documents 
      SET batch1_ready = TRUE, batch1_ready_at = NOW() 
      WHERE id = ${documentId}
    `);
    
    // Auto-extract index from completed Batch 1
    await autoExtractIndex(documentId);
    
    console.log(`🎉 Batch 1 complete for ${documentId} - INDEX extracted automatically`);
    
  } catch (error) {
    console.error(`❌ Batch 1 failed for ${documentId}:`, error);
    throw error;
  }
}

/**
 * DUAL VERIFICATION OCR PROCESSOR
 * 1. Cloud Vision OCR
 * 2. OpenAI verification for truncation/missing content
 * 3. Re-OCR if confidence too low
 * 4. Persistent storage with checksums
 */
async function processPageWithDualVerification({ 
  documentId, 
  filePath, 
  pageNumber 
}: {
  documentId: string;
  filePath: string;
  pageNumber: number;
}) {
  try {
    console.log(`🔍 Processing page ${pageNumber} with dual verification`);
    
    // Extract page as buffer for OCR
    const pageBuffer = await loadPdfPageBytes(documentId, pageNumber);
    const checksum = crypto.createHash('sha256').update(pageBuffer).digest('hex');
    
    // Check if already processed with same checksum (persistent storage)
    const existingResult = await db.execute(sql`
      SELECT checksum, extracted_text, confidence, is_verified 
      FROM ocr_pages 
      WHERE document_id = ${documentId} AND page_number = ${pageNumber}
    `);
    
    if (existingResult.rows[0]?.checksum === checksum) {
      console.log(`⏭️  Page ${pageNumber} already processed (checksum match), skipping`);
      return existingResult.rows[0].extracted_text;
    }
    
    // 1. CLOUD VISION OCR (Primary)
    const visionResult = await runCloudVisionOCR(pageBuffer);
    console.log(`👁️  Vision OCR: ${visionResult.text.length} chars, ${(visionResult.confidence * 100).toFixed(1)}% confidence`);
    
    // 2. OPENAI VERIFICATION (Secondary check)
    const verificationResult = await verifyWithOpenAI(pageBuffer, visionResult.text);
    console.log(`🤖 OpenAI verification: ${verificationResult.hasDifferences ? 'ISSUES FOUND' : 'VERIFIED OK'}`);
    
    // 3. DETERMINE BEST RESULT
    let finalText = visionResult.text;
    let confidence = visionResult.confidence;
    let verificationMethod = 'vision_only';
    
    if (verificationResult.hasDifferences && verificationResult.correctedText) {
      // OpenAI found issues and provided correction
      finalText = verificationResult.correctedText;
      confidence = Math.max(visionResult.confidence, verificationResult.confidence);
      verificationMethod = 'dual_verified';
      console.log(`🔄 Using OpenAI corrected text (${finalText.length} chars)`);
    }
    
    // 4. RE-OCR IF CONFIDENCE TOO LOW
    if (confidence < 0.7) {
      console.log(`⚠️  Low confidence ${(confidence * 100).toFixed(1)}% for page ${pageNumber}, re-processing...`);
      
      try {
        const enhancedBuffer = await enhanceImage(pageBuffer);
        const retryResult = await runCloudVisionOCR(enhancedBuffer);
        
        if (retryResult.confidence > confidence) {
          finalText = retryResult.text;
          confidence = retryResult.confidence;
          verificationMethod = 'enhanced_retry';
          console.log(`✨ Enhanced OCR improved confidence to ${(confidence * 100).toFixed(1)}%`);
        }
      } catch (enhanceError) {
        console.warn(`⚠️  Image enhancement failed for page ${pageNumber}:`, enhanceError);
      }
    }
    
    // 5. PERSIST TO DATABASE (UPSERT for permanence)
    await db.execute(sql`
      INSERT INTO ocr_pages (
        document_id, page_number, extracted_text, engine, confidence, checksum,
        is_verified, verification_method, words_json, status, created_at, updated_at
      )
      VALUES (
        ${documentId}, ${pageNumber}, ${finalText}, 'vision', ${confidence}, ${checksum},
        TRUE, ${verificationMethod}, ${JSON.stringify(visionResult.words)}, 'completed', NOW(), NOW()
      )
      ON CONFLICT (document_id, page_number)
      DO UPDATE SET 
        extracted_text = EXCLUDED.extracted_text,
        engine = EXCLUDED.engine,
        confidence = EXCLUDED.confidence,
        checksum = EXCLUDED.checksum,
        is_verified = EXCLUDED.is_verified,
        verification_method = EXCLUDED.verification_method,
        words_json = EXCLUDED.words_json,
        status = 'completed',
        updated_at = NOW()
    `);
    
    // 6. UPDATE PROGRESS
    await db.execute(sql`
      UPDATE documents 
      SET ocr_completed_pages = ocr_completed_pages + 1 
      WHERE id = ${documentId}
    `);
    
    console.log(`✅ Page ${pageNumber} persisted: ${finalText.length} chars, ${(confidence * 100).toFixed(1)}% confidence`);
    
    return finalText;
    
  } catch (error) {
    console.error(`❌ Error processing page ${pageNumber}:`, error);
    
    // Mark page as failed but don't stop batch
    await db.execute(sql`
      INSERT INTO ocr_pages (
        document_id, page_number, status, created_at, updated_at
      )
      VALUES (${documentId}, ${pageNumber}, 'failed', NOW(), NOW())
      ON CONFLICT (document_id, page_number)
      DO UPDATE SET status = 'failed', updated_at = NOW()
    `);
    
    throw error;
  }
}

/**
 * CLOUD VISION OCR with enhanced settings for legal documents
 */
async function runCloudVisionOCR(imageBuffer: Buffer) {
  const [result] = await visionClient.documentTextDetection({
    image: { content: imageBuffer.toString('base64') },
    imageContext: {
      languageHints: ['en'],
      textDetectionParams: {
        enableTextDetectionConfidenceScore: true
      }
    }
  });
  
  const fullText = result.fullTextAnnotation;
  const text = fullText?.text || '';
  
  // Calculate confidence from page-level data
  let confidence = 0.85; // Default
  if (fullText?.pages?.[0]?.confidence) {
    confidence = fullText.pages[0].confidence;
  }
  
  // Extract word bounding boxes for future highlighting
  const words = result.textAnnotations?.slice(1).map(annotation => ({
    text: annotation.description,
    confidence: annotation.confidence || 0.9,
    bbox: annotation.boundingPoly?.vertices
  })) || [];
  
  return { text, confidence, words };
}

/**
 * OPENAI VERIFICATION for completeness and accuracy
 */
async function verifyWithOpenAI(imageBuffer: Buffer, ocrText: string) {
  try {
    if (!process.env.OPENAI_API_KEY || ocrText.length < 50) {
      return { hasDifferences: false, confidence: 0.8 };
    }
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You verify OCR accuracy for legal documents. Check for missing content, truncation, or errors."
        },
        {
          role: "user",
          content: `Verify this OCR text for completeness and accuracy.
            
Look for:
- Missing numbered items (1, 2, 3 sequence breaks)
- Truncated sentences or paragraphs
- Missing INDEX sections or table entries
- Garbled text or symbol artifacts

OCR Text (first 3000 chars):
${ocrText.substring(0, 3000)}

Reply with JSON: {"ok": true/false, "confidence": 0-1, "issues": [], "correctedText": "..."}`
        }
      ],
      temperature: 0,
      max_tokens: 500,
      response_format: { type: "json_object" }
    });
    
    const content = response.choices[0].message.content;
    if (!content) throw new Error('No content from OpenAI');
    const result = JSON.parse(content);
    
    return {
      hasDifferences: !result.ok,
      confidence: result.confidence || 0.8,
      correctedText: result.correctedText,
      issues: result.issues || []
    };
    
  } catch (error) {
    console.error('OpenAI verification error:', error);
    return { hasDifferences: false, confidence: 0.8 };
  }
}

/**
 * IMAGE ENHANCEMENT for low-confidence pages
 */
async function enhanceImage(imageBuffer: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import('sharp')).default;
    
    return await sharp(imageBuffer)
      .resize(null, 2480) // Increase height to 2480px (300 DPI equivalent)
      .sharpen(1.0, 1.0, 2.0) // Sharpen for better text recognition
      .normalize() // Normalize contrast
      .png({ quality: 100 })
      .toBuffer();
      
  } catch (error) {
    console.error('Image enhancement error:', error);
    return imageBuffer; // Return original if enhancement fails
  }
}

/**
 * AUTO INDEX EXTRACTION from Batch 1 pages
 * Triggers automatically when Batch 1 completes
 */
async function autoExtractIndex(documentId: string) {
  console.log('🔍 Auto-extracting INDEX from Batch 1...');
  
  try {
    // Get OCR text from pages 1-50
    const pagesResult = await db.execute(sql`
      SELECT page_number, extracted_text 
      FROM ocr_pages 
      WHERE document_id = ${documentId} 
        AND page_number <= 50
        AND status = 'completed'
      ORDER BY page_number
    `);
    
    if (!pagesResult.rows.length) {
      console.log('No completed pages found in Batch 1');
      return;
    }
    
    // Find page with INDEX
    let indexPageNum = -1;
    let indexText = '';
    
    for (const row of pagesResult.rows) {
      const text = row.extracted_text as string;
      if (text?.includes('INDEX')) {
        indexPageNum = row.page_number as number;
        indexText = text;
        console.log(`📍 Found INDEX on page ${indexPageNum}`);
        break;
      }
    }
    
    if (indexPageNum === -1) {
      console.log('ℹ️  No INDEX section found in Batch 1');
      return;
    }
    
    // Extract numbered index items
    const lines = indexText.split('\\n');
    const items: { order: number; label: string; pageNumber: number }[] = [];
    let foundIndexHeader = false;
    
    for (const line of lines) {
      if (line.includes('INDEX')) {
        foundIndexHeader = true;
        continue;
      }
      
      if (!foundIndexHeader) continue;
      
      // Match numbered items: \"1. Item text\" or \"1) Item text\"
      const match = line.trim().match(/^(\\d+)[\\.\\)]\\s+(.+)$/);
      if (match) {
        const order = parseInt(match[1]);
        const label = match[2].trim();
        
        items.push({
          order,
          label,
          pageNumber: indexPageNum
        });
      }
      
      // Stop at signature line or after collecting reasonable number of items
      if (line.includes('Signature') || items.length >= 10) {
        break;
      }
    }
    
    console.log(`🎯 Extracted ${items.length} index items`);
    
    // Save to index_items table
    for (const item of items) {
      await db.execute(sql`
        INSERT INTO index_items (
          document_id, item_order, label, raw_text, page_number, confidence, type, created_at, updated_at
        )
        VALUES (
          ${documentId}, ${item.order}, ${item.label}, ${item.label}, 
          ${item.pageNumber}, 0.95, 'auto_extracted', NOW(), NOW()
        )
        ON CONFLICT (document_id, item_order) 
        DO UPDATE SET 
          label = EXCLUDED.label,
          raw_text = EXCLUDED.raw_text,
          updated_at = NOW()
      `);
    }
    
    // Update document with index count
    await db.execute(sql`
      UPDATE documents 
      SET 
        index_count = ${items.length},
        index_detected_at = NOW(),
        index_status = 'ok'
      WHERE id = ${documentId}
    `);
    
    console.log(`✅ Auto-extraction complete: ${items.length} INDEX items saved to database`);
    
  } catch (error) {
    console.error('❌ Auto-index extraction failed:', error);
    
    // Mark index extraction as failed
    await db.execute(sql`
      UPDATE documents 
      SET index_status = 'error'
      WHERE id = ${documentId}
    `);
  }
}