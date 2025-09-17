// Temporarily disabled for development (Redis-free mode)
// import { Worker } from 'bullmq';
// import { batchQueue, redis } from './queues';
import { db } from '../db';
import { documents, ocrPages } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

// Configuration from environment variables
const DOC_CONCURRENCY = parseInt(process.env.OCR_MAX_DOC_CONCURRENCY || '2', 10);
const BATCH_SIZE = parseInt(process.env.OCR_BATCH_SIZE || '50', 10);

/**
 * Create page ranges for parallel processing
 */
function createPageRanges(totalPages: number, batchSize: number): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  
  for (let start = 1; start <= totalPages; start += batchSize) {
    const end = Math.min(start + batchSize - 1, totalPages);
    ranges.push({ start, end });
  }
  
  return ranges;
}

/**
 * Check if a page range has any incomplete pages
 */
async function rangeHasIncompletPages(documentId: string, range: { start: number; end: number }, completedPages: Set<number>): Promise<boolean> {
  for (let pageNum = range.start; pageNum <= range.end; pageNum++) {
    if (!completedPages.has(pageNum)) {
      return true;
    }
  }
  return false;
}

/**
 * Document Worker - Slices documents into parallel batches for OCR processing
 */
// Temporarily disabled for development (Redis-free mode)  
// export const docWorker = new Worker('ocr-doc', async (job) => {
export const docWorker = {
  on: () => {},
  process: () => {},
};
/* DISABLED WORKER CODE:
const _docWorker = async (job) => {
  const { documentId, batchSize = BATCH_SIZE, maxConcurrent = 10 } = job.data as {
    documentId: string;
    batchSize?: number;
    maxConcurrent?: number;
  };

  console.log(`📄 Processing document ${documentId} with ${batchSize} pages per batch, max ${maxConcurrent} concurrent batches`);

  try {
    // Get document information
    const documentResult = await db
      .select({
        id: documents.id,
        totalPages: documents.totalPages,
        pageCount: documents.pageCount,
        caseId: documents.caseId,
        originalName: documents.originalName
      })
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    const document = documentResult[0];
    if (!document) {
      throw new Error(`Document ${documentId} not found`);
    }

    const totalPages = document.totalPages || document.pageCount || 0;
    if (totalPages === 0) {
      throw new Error(`Document ${documentId} has no pages to process`);
    }

    console.log(`📊 Document ${documentId}: ${totalPages} total pages`);

    // Find already completed pages for resume capability
    const completedPagesResult = await db
      .select({ pageNumber: ocrPages.pageNumber })
      .from(ocrPages)
      .where(and(
        eq(ocrPages.documentId, documentId),
        eq(ocrPages.status, 'completed')
      ));

    const completedPages = new Set<number>(
      completedPagesResult.map(row => row.pageNumber)
    );

    console.log(`✅ Found ${completedPages.size} already completed pages`);

    // Create page ranges and filter out fully completed ranges
    const allRanges = createPageRanges(totalPages, batchSize);
    const pendingRanges: Array<{ start: number; end: number }> = [];

    for (const range of allRanges) {
      if (await rangeHasIncompletPages(documentId, range, completedPages)) {
        pendingRanges.push(range);
      }
    }

    console.log(`🔄 Processing ${pendingRanges.length} ranges out of ${allRanges.length} total ranges`);

    if (pendingRanges.length === 0) {
      console.log(`✅ Document ${documentId} already fully processed`);
      
      // Update document status to completed
      await db
        .update(documents)
        .set({
          ocrStatus: 'completed',
          ocrPagesDone: completedPages.size,
          ocrCompletedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(documents.id, documentId));

      return;
    }

    // Enqueue batch jobs for parallel processing
    const batchPromises = pendingRanges.map(async (range, index) => {
      return batchQueue.add('processRange', {
        documentId,
        caseId: document.caseId,
        originalName: document.originalName,
        range,
        totalPages,
        batchIndex: index + 1,
        totalBatches: pendingRanges.length
      }, {
        attempts: 3,
        removeOnComplete: true,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        // Stagger batch jobs to avoid overwhelming the system
        delay: index * 1000
      });
    });

    await Promise.all(batchPromises);

    // Update document status to processing
    await db
      .update(documents)
      .set({
        ocrStatus: 'processing',
        ocrPagesDone: completedPages.size,
        updatedAt: new Date()
      })
      .where(eq(documents.id, documentId));

    console.log(`🚀 Enqueued ${pendingRanges.length} batch jobs for document ${documentId}`);

  } catch (error) {
    console.error(`❌ Document worker error for ${documentId}:`, error);
    
    // Update document status to failed
    await db
      .update(documents)
      .set({
        ocrStatus: 'failed',
        ocrErrorMessage: error instanceof Error ? error.message : 'Document processing failed',
        updatedAt: new Date()
      })
      .where(eq(documents.id, documentId))
      .catch(dbError => {
        console.error(`❌ Failed to update document status:`, dbError);
      });

    throw error;
  }
}, { 
  concurrency: DOC_CONCURRENCY, 
  connection: redis,
  removeOnComplete: { count: 5 },
  removeOnFail: { count: 20 }
});

// Worker event listeners
docWorker.on('completed', (job) => {
  console.log(`✅ Document worker completed job ${job.id} for document ${job.data?.documentId}`);
});

docWorker.on('failed', (job, error) => {
  console.error(`❌ Document worker failed job ${job?.id}:`, error);
});

docWorker.on('error', (error) => {
  console.error('❌ Document worker error:', error);
});

*/ // End of disabled worker code

console.log('📋 Document worker disabled (Redis-free mode)');