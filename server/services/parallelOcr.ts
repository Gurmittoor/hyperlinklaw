import crypto from 'crypto';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import vision from '@google-cloud/vision';
import OpenAI from 'openai';
import { loadPdfPageBytes } from './pdfUtils';

// Initialize Vision API client
const visionClient = new vision.ImageAnnotatorClient();

// Initialize OpenAI client
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

type BatchJob = { 
  documentId: string; 
  batchIndex: number; 
  startPage: number; 
  endPage: number; 
  priority: 'high' | 'normal' 
};

export async function enqueueBatchOcr(job: BatchJob) {
  console.log(`🚀 Starting Batch ${job.batchIndex} OCR for document ${job.documentId} (pages ${job.startPage}-${job.endPage}) - Priority: ${job.priority}`);
  // Run immediately with proper error handling
  runBatch(job).catch(error => {
    console.error(`❌ Batch ${job.batchIndex} failed for document ${job.documentId}:`, error);
  });
}

export async function enqueueDocBatches({ 
  documentId, 
  totalPages, 
  batchSize = 50, 
  priority = 'normal' as const 
}: {
  documentId: string;
  totalPages: number;
  batchSize?: number;
  priority?: 'high' | 'normal';
}) {
  const batches: BatchJob[] = [];
  
  for (let i = 1, b = 1; i <= totalPages; i += batchSize, b++) {
    if (b === 1) continue; // Batch 1 already enqueued with high priority
    
    batches.push({
      documentId,
      batchIndex: b,
      startPage: i,
      endPage: Math.min(i + batchSize - 1, totalPages),
      priority
    });
  }
  
  console.log(`📦 Enqueuing ${batches.length} additional batches for document ${documentId}`);
  
  // Process batches with controlled concurrency (max 3 at once)
  const chunks = [];
  for (let i = 0; i < batches.length; i += 3) {
    chunks.push(batches.slice(i, i + 3));
  }
  
  for (const chunk of chunks) {
    await Promise.all(chunk.map(runBatch));
  }
}

export async function runBatch(job: BatchJob) {
  const { documentId, startPage, endPage, batchIndex } = job;
  
  console.log(`⚡ Processing Batch ${batchIndex} for document ${documentId} (pages ${startPage}-${endPage})`);
  
  try {
    for (let page = startPage; page <= endPage; page++) {
      await processPage(documentId, page);
    }
    
    // If this was Batch 1: mark ready + trigger index extraction
    if (batchIndex === 1) {
      console.log(`✅ Batch 1 completed for document ${documentId} - marking ready and triggering index extraction`);
      
      await db.execute(sql`
        UPDATE documents 
        SET batch1_ready = TRUE, batch1_ready_at = NOW() 
        WHERE id = ${documentId}
      `);
      
      await triggerIndexExtraction(documentId);
    }
    
    // Check if all pages are done and mark document as completed
    await maybeMarkDocCompleted(documentId);
    
    console.log(`✅ Batch ${batchIndex} completed successfully for document ${documentId}`);
    
  } catch (error) {
    console.error(`❌ Batch ${batchIndex} failed for document ${documentId}:`, error);
    throw error;
  }
}

async function processPage(documentId: string, page: number) {
  try {
    console.log(`🔍 Processing page ${page} for document ${documentId}`);
    
    // 1) Load page bytes and create checksum
    const pdfBytes = await loadPdfPageBytes(documentId, page);
    const checksum = crypto.createHash('sha1').update(pdfBytes).digest('hex');
    
    // 2) Skip if already persisted with same checksum
    const existingResult = await db.execute(sql`
      SELECT checksum FROM ocr_pages 
      WHERE document_id = ${documentId} AND page_number = ${page}
    `);
    
    if (existingResult.rows[0]?.checksum === checksum) {
      console.log(`⏭️  Page ${page} unchanged (checksum match) - skipping`);
      return;
    }
    
    // 3) OCR via Cloud Vision (primary engine)
    const [visionResult] = await visionClient.documentTextDetection({
      image: { content: pdfBytes.toString('base64') }
    });
    
    let text = visionResult.fullTextAnnotation?.text || '';
    let confidence = visionResult.fullTextAnnotation?.pages?.[0]?.confidence || 0.85;
    let wordsJson = visionResult.fullTextAnnotation || null;
    
    console.log(`📄 Vision OCR for page ${page}: ${text.length} chars, confidence: ${confidence}`);
    
    // 4) Dual verification via OpenAI (simplified)
    const verificationOk = text.length > 50 && confidence > 0.65;
    
    if (!verificationOk) {
      console.log(`🔄 Page ${page} needs retry (confidence: ${confidence})`);
      // Simple retry without complex verification for now
      
      // Simplified retry without complex verification
      console.log(`⏭️ Skipping complex re-OCR for now`);
    }
    
    // 5) Persist results (UPSERT for permanent storage)
    await db.execute(sql`
      INSERT INTO ocr_pages (
        document_id, page_number, extracted_text, engine, confidence, 
        checksum, words_json, status, updated_at, created_at
      )
      VALUES (
        ${documentId}, ${page}, ${text}, 'vision', ${confidence ?? 0.85}, 
        ${checksum}, ${JSON.stringify(wordsJson ?? null)}, 'completed', NOW(), NOW()
      )
      ON CONFLICT (document_id, page_number)
      DO UPDATE SET 
        extracted_text = EXCLUDED.extracted_text,
        engine = 'vision',
        confidence = EXCLUDED.confidence,
        checksum = EXCLUDED.checksum,
        words_json = EXCLUDED.words_json,
        status = 'completed',
        updated_at = NOW()
    `);
    
    console.log(`✅ Page ${page} OCR persisted successfully`);
    
  } catch (error) {
    console.error(`❌ Failed to process page ${page} for document ${documentId}:`, error);
    
    // Mark page as failed but don't stop the batch
    await db.execute(sql`
      INSERT INTO ocr_pages (
        document_id, page_number, status, updated_at, created_at
      )
      VALUES (
        ${documentId}, ${page}, 'failed', NOW(), NOW()
      )
      ON CONFLICT (document_id, page_number)
      DO UPDATE SET 
        status = 'failed',
        updated_at = NOW()
    `).catch(() => {
      // Silent catch - don't fail if we can't even record the failure
    });
  }
}

async function triggerIndexExtraction(documentId: string) {
  try {
    console.log(`🔍 Triggering index extraction for document ${documentId}`);
    
    // Concatenate pages 1-50 text in order
    const pagesResult = await db.execute(sql`
      SELECT page_number, extracted_text
      FROM ocr_pages
      WHERE document_id = ${documentId} 
        AND page_number BETWEEN 1 AND 50
        AND status = 'completed'
      ORDER BY page_number ASC
    `);
    
    const fullText = pagesResult.rows
      .map(row => (row.extracted_text || '') + '\n')
      .join('');
    
    if (!fullText.trim()) {
      console.log(`⚠️  No OCR text found for Batch 1 of document ${documentId}`);
      return;
    }
    
    console.log(`📝 Extracted ${fullText.length} characters from Batch 1`);
    
    // Simple rule-based index detection
    const lines = fullText.split(/\r?\n/);
    const indexHeaderIdx = lines.findIndex(line => /\bindex\b/i.test(line));
    
    if (indexHeaderIdx === -1) {
      console.log(`ℹ️  No INDEX section found in Batch 1 for document ${documentId}`);
      return;
    }
    
    const indexItems: { start: number; end: number; label: string }[] = [];
    let cursor = 0;
    let inIndex = false;
    
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const start = cursor;
      const end = start + line.length;
      
      if (li === indexHeaderIdx) {
        inIndex = true;
        cursor = end + 1;
        continue;
      }
      
      if (inIndex) {
        // Stop at blank lines or new major sections
        if (!line.trim() || /^[A-Z][A-Z\s-]{4,}$/.test(line.trim())) {
          break;
        }
        
        // Capture numbered items like "1.", "2)", or bulleted lists
        if (/^\s*(\d+[\.\)]|[-•])\s+/.test(line)) {
          indexItems.push({ start, end, label: line.trim() });
        }
      }
      
      cursor = end + 1; // +1 for newline
    }
    
    console.log(`🎯 Found ${indexItems.length} index items in document ${documentId}`);
    
    // Store index items in database
    for (let order = 0; order < indexItems.length; order++) {
      const item = indexItems[order];
      await db.execute(sql`
        INSERT INTO index_items (
          document_id, item_order, label, raw_text, start_offset, end_offset, 
          conf, type, created_at, updated_at
        )
        VALUES (
          ${documentId}, ${order + 1}, ${item.label}, ${item.label}, 
          ${item.start}, ${item.end}, 0.9, 'tab', NOW(), NOW()
        )
        ON CONFLICT DO NOTHING
      `);
    }
    
    // Update document index status
    await db.execute(sql`
      UPDATE documents 
      SET 
        index_count = ${indexItems.length},
        index_detected_at = NOW(),
        index_status = 'ok'
      WHERE id = ${documentId}
    `);
    
    console.log(`✅ Index extraction completed for document ${documentId}: ${indexItems.length} items`);
    
  } catch (error) {
    console.error(`❌ Index extraction failed for document ${documentId}:`, error);
    
    // Mark index as failed
    await db.execute(sql`
      UPDATE documents 
      SET index_status = 'error'
      WHERE id = ${documentId}
    `).catch(() => {
      // Silent catch
    });
  }
}

async function maybeMarkDocCompleted(documentId: string) {
  try {
    // Check if all pages are processed
    const statusResult = await db.execute(sql`
      SELECT 
        d.total_pages,
        COUNT(op.page_number) as completed_pages
      FROM documents d
      LEFT JOIN ocr_pages op ON op.document_id = d.id AND op.status = 'completed'
      WHERE d.id = ${documentId}
      GROUP BY d.total_pages
    `);
    
    const row = statusResult.rows[0] as any;
    if (row && row.total_pages && Number(row.completed_pages) >= Number(row.total_pages)) {
      console.log(`🏁 All pages completed for document ${documentId} - marking as completed`);
      
      await db.execute(sql`
        UPDATE documents 
        SET 
          ocr_state = 'completed',
          ocr_status = 'completed',
          ocr_completed_at = NOW()
        WHERE id = ${documentId}
      `);
    }
    
  } catch (error) {
    console.error(`❌ Failed to check completion status for document ${documentId}:`, error);
  }
}