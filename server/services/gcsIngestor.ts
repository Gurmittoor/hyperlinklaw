import { PubSub } from '@google-cloud/pubsub';
import { Storage } from '@google-cloud/storage';
import { db } from '../db';
import { ocrPages, documents } from '@shared/schema';
import { eq, sql, and } from 'drizzle-orm';

const {
  GCP_PROJECT_ID,
  GCP_CREDENTIALS_JSON,
  GCP_OUTPUT_BUCKET,
  GCP_PUBSUB_SUBSCRIPTION = 'vision-ocr-outputs-sub'
} = process.env;

if (!GCP_PROJECT_ID || !GCP_CREDENTIALS_JSON || !GCP_OUTPUT_BUCKET) {
  console.warn('⚠️ GCS Ingestor: Missing GCP environment variables - real-time ingestion disabled');
}

// Only initialize GCP clients if credentials are available
let pubsub: PubSub | null = null;
let storage: Storage | null = null;

if (GCP_PROJECT_ID && GCP_CREDENTIALS_JSON && GCP_OUTPUT_BUCKET) {
  try {
    const credentials = JSON.parse(GCP_CREDENTIALS_JSON);
    pubsub = new PubSub({ projectId: GCP_PROJECT_ID, credentials });
    storage = new Storage({ projectId: GCP_PROJECT_ID, credentials });
  } catch (error) {
    console.warn('⚠️ Failed to initialize GCP clients:', error);
  }
}

/**
 * Parse Vision asyncBatchAnnotateFiles JSON and ingest into database.
 * Expected file structure: vision/{caseId}/{documentId}/p1-50/output-x.json
 */
async function ingestVisionJson(bucketName: string, objectName: string): Promise<void> {
  if (!objectName.startsWith('vision/')) return;
  if (!objectName.endsWith('.json')) return;
  if (!storage) {
    console.warn('⚠️ Storage client not initialized - skipping ingestion');
    return;
  }

  console.log(`📥 Ingesting Vision OCR result: ${objectName}`);

  try {
    // Download and parse the JSON file
    const file = storage.bucket(bucketName).file(objectName);
    const [buffer] = await file.download();
    const payload = JSON.parse(buffer.toString());

    // Extract caseId & documentId from path: vision/{caseId}/{documentId}/...
    const parts = objectName.split('/');
    if (parts.length < 3) {
      console.warn(`⚠️ Invalid Vision OCR path structure: ${objectName}`);
      return;
    }

    const caseId = parts[1];
    const documentId = parts[2];
    const batchName = parts[3]; // e.g., "p1-50"

    console.log(`📄 Processing batch ${batchName} for document ${documentId}`);

    // Vision's JSON structure varies - handle both direct responses and nested
    const responses = payload.responses?.[0]?.responses || payload.responses || [];
    if (!responses.length) {
      console.log(`ℹ️ No OCR responses found in ${objectName}`);
      return;
    }

    let pagesIngested = 0;
    let totalConfidence = 0;
    let confidenceCount = 0;

    // Process each page response
    for (let i = 0; i < responses.length; i++) {
      const response = responses[i];
      if (!response.fullTextAnnotation) continue;

      // Determine page number from context or infer from batch + index
      let pageNumber = response.context?.pageNumber;
      if (!pageNumber && batchName.match(/p(\d+)-(\d+)/)) {
        // Extract page range from batch name like "p1-50"
        const [, start] = batchName.match(/p(\d+)-(\d+)/) || [];
        pageNumber = parseInt(start) + i;
      } else {
        pageNumber = pageNumber || (i + 1);
      }

      const text = response.fullTextAnnotation.text || '';
      
      // Calculate confidence from page-level data
      let pageConfidence = 0.95; // Default high confidence for Vision
      try {
        const pages = response.fullTextAnnotation.pages || [];
        const confidences: number[] = [];
        
        for (const page of pages) {
          for (const block of page.blocks || []) {
            for (const paragraph of block.paragraphs || []) {
              for (const word of paragraph.words || []) {
                if (typeof word.confidence === 'number') {
                  confidences.push(word.confidence);
                }
              }
            }
          }
        }
        
        if (confidences.length > 0) {
          pageConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
        }
      } catch (error) {
        console.warn(`⚠️ Error calculating confidence for page ${pageNumber}:`, error);
      }

      // Extract words for bounding box data
      const words: any[] = [];
      try {
        const pages = response.fullTextAnnotation.pages || [];
        for (const page of pages) {
          for (const block of page.blocks || []) {
            for (const paragraph of block.paragraphs || []) {
              for (const word of paragraph.words || []) {
                const wordText = (word.symbols || [])
                  .map((symbol: any) => symbol.text)
                  .join('');
                
                words.push({
                  text: wordText,
                  confidence: word.confidence || pageConfidence,
                  boundingBox: word.boundingBox?.vertices || []
                });
              }
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ Error extracting words for page ${pageNumber}:`, error);
      }

      // Insert/update OCR page record
      await db
        .insert(ocrPages)
        .values({
          documentId,
          pageNumber,
          engine: 'vision',
          extractedText: text,
          confidence: pageConfidence.toString(),
          wordsJson: words,
          status: 'completed',
          processingTimeMs: null, // Vision doesn't provide per-page timing
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: [ocrPages.documentId, ocrPages.pageNumber],
          set: {
            extractedText: text,
            confidence: pageConfidence.toString(),
            wordsJson: words,
            engine: 'vision',
            status: 'completed',
            updatedAt: new Date()
          }
        });

      pagesIngested++;
      totalConfidence += pageConfidence;
      confidenceCount++;

      console.log(`✅ Page ${pageNumber}: ${text.length} chars, ${(pageConfidence * 100).toFixed(1)}% confidence`);
    }

    // Update document progress based on completed OCR pages
    const completedPagesResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(ocrPages)
      .where(and(
        eq(ocrPages.documentId, documentId),
        eq(ocrPages.status, 'completed')
      ));

    const completedPages = completedPagesResult[0]?.count || 0;
    const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : null;

    // Get document total pages to determine if OCR is complete
    const documentResult = await db
      .select({ totalPages: documents.totalPages, pageCount: documents.pageCount })
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    const document = documentResult[0];
    const totalPages = document?.totalPages || document?.pageCount || 0;
    const isComplete = completedPages >= totalPages;

    await db
      .update(documents)
      .set({
        ocrPagesDone: completedPages,
        ocrConfidenceAvg: avgConfidence ? avgConfidence.toFixed(3) : undefined,
        ocrStatus: isComplete ? 'completed' : 'processing',
        ocrCompletedAt: isComplete ? new Date() : undefined,
        updatedAt: new Date()
      })
      .where(eq(documents.id, documentId));

    console.log(`🎯 Document ${documentId}: ${completedPages}/${totalPages} pages completed (${avgConfidence ? (avgConfidence * 100).toFixed(1) + '%' : 'N/A'} confidence)`);

    if (isComplete) {
      console.log(`🎉 Vision OCR completed for document ${documentId}!`);
    }

  } catch (error) {
    console.error(`❌ Error ingesting Vision OCR result ${objectName}:`, error);
    throw error;
  }
}

/**
 * Start the GCS watcher that listens for Vision OCR results
 */
export async function startGcsWatcher(): Promise<void> {
  if (!pubsub || !GCP_CREDENTIALS_JSON || !GCP_PROJECT_ID || !GCP_OUTPUT_BUCKET) {
    console.log('ℹ️ GCS Watcher: Skipped - missing GCP configuration or client not initialized');
    return;
  }

  try {
    const subscription = pubsub.subscription(GCP_PUBSUB_SUBSCRIPTION, {
      flowControl: { maxMessages: 10, allowExcessMessages: false }
    });

    subscription.on('message', async (message) => {
      try {
        const data = JSON.parse(Buffer.from(message.data).toString());
        
        // Check if this is a GCS object finalize notification for our output bucket
        if (
          data.kind === 'storage#object' && 
          data.bucket === GCP_OUTPUT_BUCKET && 
          data.name &&
          data.eventType === 'OBJECT_FINALIZE'
        ) {
          console.log(`📡 GCS notification: ${data.name}`);
          await ingestVisionJson(data.bucket, data.name);
        }
        
        message.ack();
      } catch (error) {
        console.error('❌ GCS watcher error:', error);
        // Don't ack on hard failures - let Pub/Sub retry
        message.nack();
      }
    });

    subscription.on('error', (error) => {
      console.error('❌ Pub/Sub subscription error:', error);
    });

    console.log(`📡 GCS watcher started - listening on subscription: ${GCP_PUBSUB_SUBSCRIPTION}`);
  } catch (error) {
    console.error('❌ Failed to start GCS watcher:', error);
  }
}

/**
 * Fallback: Polling mode for environments without Pub/Sub
 * Checks for new Vision OCR results every 10 seconds
 */
export async function startGcsPollingWatcher(documentId: string, caseId: string): Promise<void> {
  if (!storage || !GCP_CREDENTIALS_JSON || !GCP_PROJECT_ID || !GCP_OUTPUT_BUCKET) {
    console.log('ℹ️ GCS Polling Watcher: Skipped - missing GCP configuration or client not initialized');
    return;
  }

  const prefix = `vision/${caseId}/${documentId}/`;
  const processedFiles = new Set<string>();

  console.log(`📡 Starting GCS polling watcher for document ${documentId}`);

  const pollInterval = setInterval(async () => {
    try {
      const [files] = await storage!.bucket(GCP_OUTPUT_BUCKET).getFiles({ prefix });
      
      for (const file of files) {
        if (file.name.endsWith('.json') && !processedFiles.has(file.name)) {
          console.log(`📥 Found new Vision OCR result: ${file.name}`);
          await ingestVisionJson(GCP_OUTPUT_BUCKET, file.name);
          processedFiles.add(file.name);
        }
      }

      // Check if document is complete to stop polling
      const documentResult = await db
        .select({ 
          ocrStatus: documents.ocrStatus,
          ocrPagesDone: documents.ocrPagesDone,
          totalPages: documents.totalPages,
          pageCount: documents.pageCount
        })
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);

      const doc = documentResult[0];
      if (doc?.ocrStatus === 'completed') {
        console.log(`✅ Polling complete for document ${documentId}`);
        clearInterval(pollInterval);
      }
    } catch (error) {
      console.error(`❌ GCS polling error for ${documentId}:`, error);
    }
  }, 10000); // Poll every 10 seconds

  // Auto-stop polling after 2 hours
  setTimeout(() => {
    clearInterval(pollInterval);
    console.log(`⏰ GCS polling timeout for document ${documentId}`);
  }, 2 * 60 * 60 * 1000);
}

/**
 * Clear all Vision OCR outputs and database records for a document (full restart)
 */
export async function clearVisionOcrData(documentId: string, caseId: string): Promise<void> {
  if (!storage || !GCP_CREDENTIALS_JSON || !GCP_PROJECT_ID || !GCP_OUTPUT_BUCKET) {
    throw new Error('GCP configuration missing or storage client not initialized');
  }

  console.log(`🗑️ Clearing Vision OCR data for document ${documentId}`);

  try {
    // Delete GCS outputs
    const prefix = `vision/${caseId}/${documentId}/`;
    await storage!.bucket(GCP_OUTPUT_BUCKET).deleteFiles({ prefix });
    console.log(`🗑️ Deleted GCS files with prefix: ${prefix}`);

    // Clear OCR pages from database
    await db.delete(ocrPages).where(eq(ocrPages.documentId, documentId));
    console.log(`🗑️ Cleared OCR pages from database for document ${documentId}`);

    // Reset document OCR status
    await db
      .update(documents)
      .set({
        ocrStatus: 'queued',
        ocrPagesDone: 0,
        ocrConfidenceAvg: null,
        ocrCompletedAt: null,
        ocrErrorMessage: null,
        updatedAt: new Date()
      })
      .where(eq(documents.id, documentId));

    console.log(`✅ Reset OCR status for document ${documentId}`);
  } catch (error) {
    console.error(`❌ Error clearing Vision OCR data for ${documentId}:`, error);
    throw error;
  }
}