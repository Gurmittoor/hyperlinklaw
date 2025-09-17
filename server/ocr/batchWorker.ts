// Temporarily disabled for development (Redis-free mode)
// import { Worker } from 'bullmq';
// import { redis } from './queues';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { Storage } from '@google-cloud/storage';
import { db } from '../db';
import { documents, ocrPages } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';

// Configuration
const BATCH_CONCURRENCY = parseInt(process.env.OCR_MAX_BATCH_CONCURRENCY || '8', 10);
const {
  GCP_PROJECT_ID,
  GCP_CREDENTIALS_JSON,
  GCP_INPUT_BUCKET,
  GCP_OUTPUT_BUCKET
} = process.env;

// Initialize GCP clients
let visionClient: ImageAnnotatorClient;
let storage: Storage;

if (GCP_CREDENTIALS_JSON && GCP_PROJECT_ID) {
  const credentials = JSON.parse(GCP_CREDENTIALS_JSON);
  visionClient = new ImageAnnotatorClient({ 
    projectId: GCP_PROJECT_ID, 
    credentials 
  });
  storage = new Storage({ 
    projectId: GCP_PROJECT_ID, 
    credentials 
  });
  console.log(`🔧 Vision client initialized for project: ${GCP_PROJECT_ID}`);
} else {
  console.warn('⚠️ GCP credentials not found - batch worker will not function');
}

/**
 * Process a batch of pages using Google Cloud Vision OCR
 */
async function processBatchWithVision(
  documentId: string, 
  caseId: string,
  fileName: string,
  range: { start: number; end: number }
): Promise<number> {
  if (!visionClient || !storage) {
    throw new Error('GCP clients not initialized');
  }

  const inputUri = `gs://${GCP_INPUT_BUCKET}/${documentId}.pdf`;
  const outputPrefix = `vision/${caseId}/${documentId}/batch-${range.start}-${range.end}/`;
  
  console.log(`🔍 Processing pages ${range.start}-${range.end} for document ${fileName}`);

  // Create Vision API request
  const request = {
    requests: [{
      inputConfig: {
        gcsSource: { uri: inputUri },
        mimeType: 'application/pdf'
      },
      features: [{ type: 'DOCUMENT_TEXT_DETECTION' as const }],
      pages: Array.from(
        { length: range.end - range.start + 1 }, 
        (_, i) => range.start + i
      ),
      outputConfig: {
        gcsDestination: { 
          uri: `gs://${GCP_OUTPUT_BUCKET}/${outputPrefix}`
        },
        batchSize: range.end - range.start + 1
      }
    }]
  };

  // Execute async Vision OCR
  const [operation] = await visionClient.asyncBatchAnnotateFiles(request);
  console.log(`⏳ Waiting for Vision OCR operation to complete: ${operation.name}`);
  
  await operation.promise();
  console.log(`✅ Vision OCR completed for pages ${range.start}-${range.end}`);

  // Download and process results
  let processedPages = 0;
  const [files] = await storage.bucket(GCP_OUTPUT_BUCKET!).getFiles({ 
    prefix: outputPrefix 
  });

  const jsonFiles = files.filter(file => file.name.endsWith('.json'));
  console.log(`📄 Processing ${jsonFiles.length} result files`);

  for (const file of jsonFiles) {
    try {
      const [buffer] = await file.download();
      const payload = JSON.parse(buffer.toString());
      
      // Handle both nested and flat response structures
      const responses = payload.responses?.[0]?.responses || payload.responses || [];
      
      for (const response of responses) {
        if (!response.fullTextAnnotation) continue;

        const pageNumber = response.context?.pageNumber || 0;
        const text = response.fullTextAnnotation.text || '';
        
        // Calculate confidence from word-level data
        let confidence = 0.95; // Default high confidence for Vision
        try {
          const pages = response.fullTextAnnotation.pages || [];
          const confidenceValues: number[] = [];
          
          for (const page of pages) {
            for (const block of page.blocks || []) {
              for (const paragraph of block.paragraphs || []) {
                for (const word of paragraph.words || []) {
                  if (typeof word.confidence === 'number') {
                    confidenceValues.push(word.confidence);
                  }
                }
              }
            }
          }
          
          if (confidenceValues.length > 0) {
            confidence = confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length;
          }
        } catch (error) {
          console.warn(`⚠️ Error calculating confidence for page ${pageNumber}:`, error);
        }

        // Extract word-level data for bounding boxes
        const wordsData: any[] = [];
        try {
          const pages = response.fullTextAnnotation.pages || [];
          for (const page of pages) {
            for (const block of page.blocks || []) {
              for (const paragraph of block.paragraphs || []) {
                for (const word of paragraph.words || []) {
                  const wordText = (word.symbols || [])
                    .map((symbol: any) => symbol.text)
                    .join('');
                  
                  wordsData.push({
                    text: wordText,
                    confidence: word.confidence || confidence,
                    boundingBox: word.boundingBox?.vertices || []
                  });
                }
              }
            }
          }
        } catch (error) {
          console.warn(`⚠️ Error extracting word data for page ${pageNumber}:`, error);
        }

        // Idempotent upsert to database
        await db
          .insert(ocrPages)
          .values({
            documentId,
            pageNumber,
            provider: 'gcv',
            extractedText: text,
            confidence: confidence.toString(),
            wordsJson: wordsData,
            status: 'completed',
            processingTimeMs: null,
            createdAt: new Date()
          })
          .onConflictDoUpdate({
            target: [ocrPages.documentId, ocrPages.pageNumber],
            set: {
              extractedText: text,
              confidence: confidence.toString(),
              wordsJson: wordsData,
              provider: 'gcv',
              status: 'completed'
            }
          });

        processedPages++;
        console.log(`📝 Saved page ${pageNumber}: ${text.length} characters, ${(confidence * 100).toFixed(1)}% confidence`);
      }
    } catch (error) {
      console.error(`❌ Error processing result file ${file.name}:`, error);
    }
  }

  return processedPages;
}

/**
 * Update document progress after batch completion
 */
async function updateDocumentProgress(documentId: string, totalPages: number): Promise<void> {
  // Count completed pages
  const completedResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(ocrPages)
    .where(and(
      eq(ocrPages.documentId, documentId),
      eq(ocrPages.status, 'completed')
    ));

  const completedPages = completedResult[0]?.count || 0;
  
  // Calculate average confidence
  const avgConfidenceResult = await db
    .select({ 
      avgConfidence: sql<number>`avg(cast(confidence as numeric))` 
    })
    .from(ocrPages)
    .where(and(
      eq(ocrPages.documentId, documentId),
      eq(ocrPages.status, 'completed')
    ));

  const avgConfidence = avgConfidenceResult[0]?.avgConfidence || 0;
  const isComplete = completedPages >= totalPages;

  // Update document
  await db
    .update(documents)
    .set({
      ocrPagesDone: completedPages,
      ocrConfidenceAvg: avgConfidence.toFixed(3),
      ocrStatus: isComplete ? 'completed' : 'processing',
      ocrCompletedAt: isComplete ? new Date() : undefined,
      updatedAt: new Date()
    })
    .where(eq(documents.id, documentId));

  console.log(`📊 Updated document ${documentId}: ${completedPages}/${totalPages} pages (${(avgConfidence * 100).toFixed(1)}% avg confidence)`);
  
  if (isComplete) {
    console.log(`🎉 Document ${documentId} OCR processing completed!`);
  }
}

/**
 * Batch Worker - Processes page ranges using Google Cloud Vision OCR
 */
// Temporarily disabled for development (Redis-free mode)
// export const batchWorker = new Worker('ocr-batch', async (job) => {
export const batchWorker = {
  on: () => {},
  process: () => {},
}; 
/* DISABLED WORKER CODE:
const _batchWorker = async (job) => {
  const { 
    documentId, 
    caseId,
    fileName,
    range, 
    totalPages,
    batchIndex,
    totalBatches 
  } = job.data as {
    documentId: string;
    caseId: string;
    fileName: string;
    range: { start: number; end: number };
    totalPages: number;
    batchIndex: number;
    totalBatches: number;
  };

  console.log(`🚀 Starting batch ${batchIndex}/${totalBatches} for document ${fileName} (pages ${range.start}-${range.end})`);

  try {
    // Process the batch using Vision OCR
    const processedPages = await processBatchWithVision(
      documentId, 
      caseId, 
      fileName,
      range
    );

    console.log(`✅ Batch ${batchIndex}/${totalBatches} completed: ${processedPages} pages processed`);

    // Update document progress
    await updateDocumentProgress(documentId, totalPages);

    return { processedPages, batchIndex, totalBatches };

  } catch (error) {
    console.error(`❌ Batch worker error for ${documentId} (batch ${batchIndex}):`, error);
    
    // Mark pages in this range as failed
    for (let pageNum = range.start; pageNum <= range.end; pageNum++) {
      await db
        .insert(ocrPages)
        .values({
          documentId,
          pageNumber: pageNum,
          provider: 'gcv',
          extractedText: '',
          confidence: '0',
          status: 'failed',
          createdAt: new Date()
        })
        .onConflictDoUpdate({
          target: [ocrPages.documentId, ocrPages.pageNumber],
          set: {
            status: 'failed'
          }
        })
        .catch(() => {}); // Ignore conflicts, we just want to track the failure
    }

    throw error;
  }
}, {
  concurrency: BATCH_CONCURRENCY,
  connection: redis,
  removeOnComplete: { count: 10 },
  removeOnFail: { count: 20 }
});

// Worker event listeners
batchWorker.on('completed', (job, result) => {
  console.log(`✅ Batch worker completed: batch ${result?.batchIndex}/${result?.totalBatches} (${result?.processedPages} pages)`);
});

batchWorker.on('failed', (job, error) => {
  console.error(`❌ Batch worker failed job ${job?.id}:`, error);
});

batchWorker.on('error', (error) => {
  console.error('❌ Batch worker error:', error);
});

*/ // End of disabled worker code

console.log('⚡ Batch worker disabled (Redis-free mode)');