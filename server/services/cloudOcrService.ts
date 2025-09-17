import { gcvOcr } from './gcvOcr';
import { OCRProviderRouter } from './ocrProviderRouter';
import { db } from '../db';
import { documents, ocrPages, ocrJobs } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import type { Document } from '@shared/schema';
import path from 'path';

export class CloudOcrService {
  
  /**
   * Start OCR processing with automatic provider selection
   */
  async startOcrProcessing(
    documentId: string, 
    options: {
      forceProvider?: 'tesseract' | 'gcv';
      prioritizeSpeed?: boolean;
    } = {}
  ): Promise<{ provider: string; jobId?: string; estimated: { time: number; cost: number } }> {
    
    // Get document details
    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId));
      
    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    // Choose optimal provider
    const recommendedProviders = OCRProviderRouter.getRecommendedProvider(document, options);
    let provider = options.forceProvider || recommendedProviders.primary;
    
    // Fallback if primary provider isn't available
    if (!OCRProviderRouter.isProviderAvailable(provider)) {
      provider = recommendedProviders.fallback;
      if (!OCRProviderRouter.isProviderAvailable(provider)) {
        throw new Error('No OCR providers are available');
      }
    }

    const totalPages = document.totalPages || document.pageCount || 0;
    const estimatedTime = OCRProviderRouter.getEstimatedProcessingTime(provider, totalPages);
    const estimatedCost = OCRProviderRouter.getEstimatedCost(provider, totalPages);

    console.log(`🚀 Starting OCR with ${provider.toUpperCase()} for document ${documentId} (${totalPages} pages)`);
    console.log(`📊 Estimated: ${Math.round(estimatedTime / 1000)}s, $${estimatedCost.toFixed(2)}`);

    // Update document status
    await db
      .update(documents)
      .set({ 
        ocrStatus: 'processing',
        ocrStartedAt: new Date()
      })
      .where(eq(documents.id, documentId));

    if (provider === 'gcv') {
      return this.startGcvOcr(document);
    } else {
      // For Tesseract, delegate to existing system
      return { 
        provider: 'tesseract',
        estimated: { time: estimatedTime, cost: estimatedCost }
      };
    }
  }

  /**
   * Start Google Cloud Vision OCR processing
   */
  private async startGcvOcr(document: Document): Promise<{ provider: string; jobId: string; estimated: { time: number; cost: number } }> {
    try {
      // Upload PDF to Google Cloud Storage
      const documentPath = document.storagePath;
      const gcsPath = `pdfs/${document.id}/${Date.now()}.pdf`;
      
      const gcsInputUri = await gcvOcr.uploadPdfToGCS(documentPath, gcsPath);
      console.log(`📤 Uploaded to GCS: ${gcsInputUri}`);

      // Start async OCR operation
      const { operationName, outputPrefix } = await gcvOcr.startGcvPdfOcr(gcsInputUri, document.id);
      
      // Create job record
      const [job] = await db
        .insert(ocrJobs)
        .values({
          documentId: document.id,
          provider: 'gcv',
          status: 'processing',
          operationName,
          outputPrefix,
          totalPages: document.totalPages || document.pageCount || 0
        })
        .returning({ id: ocrJobs.id });

      const totalPages = document.totalPages || document.pageCount || 0;
      const estimatedTime = OCRProviderRouter.getEstimatedProcessingTime('gcv', totalPages);
      const estimatedCost = OCRProviderRouter.getEstimatedCost('gcv', totalPages);

      console.log(`✅ GCV job started: ${job.id}, operation: ${operationName}`);
      
      // Start polling in background (don't await)
      this.pollGcvJob(job.id, operationName, outputPrefix, document.id);

      return { 
        provider: 'gcv',
        jobId: job.id,
        estimated: { time: estimatedTime, cost: estimatedCost }
      };
      
    } catch (error) {
      console.error('Error starting GCV OCR:', error);
      
      // Update document status to failed
      await db
        .update(documents)
        .set({ 
          ocrStatus: 'failed',
          lastError: `GCV OCR failed: ${error.message}`
        })
        .where(eq(documents.id, document.id));
        
      throw error;
    }
  }

  /**
   * Poll Google Cloud Vision job status and ingest results
   */
  private async pollGcvJob(jobId: string, operationName: string, outputPrefix: string, documentId: string): Promise<void> {
    const maxPollAttempts = 60; // Poll for up to 10 minutes
    let attempt = 0;

    const pollInterval = setInterval(async () => {
      try {
        attempt++;
        console.log(`🔄 Polling GCV job ${jobId}, attempt ${attempt}/${maxPollAttempts}`);

        const result = await gcvOcr.pollAndIngestGcvResult(
          operationName,
          outputPrefix,
          documentId,
          // On page processed callback
          async (pageNo: number, text: string, confidence: number, words: any[]) => {
            await this.saveOcrPage(documentId, pageNo, text, confidence, words, 'gcv');
          },
          // On progress callback
          async (done: number, total: number, avgConfidence: number) => {
            await this.updateDocumentProgress(documentId, done, total, avgConfidence);
          }
        );

        if (result.done) {
          console.log(`✅ GCV job completed: ${jobId}, processed ${result.pagesProcessed} pages`);
          
          // Mark job as completed
          await db
            .update(ocrJobs)
            .set({ 
              status: 'completed',
              completedAt: new Date(),
              pagesProcessed: result.pagesProcessed || 0
            })
            .where(eq(ocrJobs.id, jobId));

          // Mark document as completed
          await db
            .update(documents)
            .set({ 
              ocrStatus: 'completed',
              ocrCompletedAt: new Date()
            })
            .where(eq(documents.id, documentId));

          clearInterval(pollInterval);
          return;
        }

        if (attempt >= maxPollAttempts) {
          console.error(`❌ GCV job ${jobId} polling timeout after ${attempt} attempts`);
          
          await db
            .update(ocrJobs)
            .set({ 
              status: 'failed',
              errorDetails: { error: 'Polling timeout' }
            })
            .where(eq(ocrJobs.id, jobId));
            
          clearInterval(pollInterval);
          return;
        }

      } catch (error) {
        console.error(`❌ Error polling GCV job ${jobId}:`, error);
        
        await db
          .update(ocrJobs)
          .set({ 
            status: 'failed',
            errorDetails: { error: error.message }
          })
          .where(eq(ocrJobs.id, jobId));
          
        clearInterval(pollInterval);
      }
    }, 10000); // Poll every 10 seconds
  }

  /**
   * Save OCR page result to database
   */
  private async saveOcrPage(
    documentId: string,
    pageNumber: number,
    text: string,
    confidence: number,
    words: any[],
    provider: 'tesseract' | 'gcv'
  ): Promise<void> {
    await db
      .insert(ocrPages)
      .values({
        documentId,
        pageNumber,
        provider,
        extractedText: text,
        confidence: confidence.toString(),
        wordsJson: words,
        status: 'completed',
        processingTimeMs: null // GCV doesn't provide per-page timing
      })
      .onConflictDoUpdate({
        target: [ocrPages.documentId, ocrPages.pageNumber],
        set: {
          extractedText: text,
          confidence: confidence.toString(),
          wordsJson: words,
          provider,
          status: 'completed'
        }
      });
  }

  /**
   * Update document processing progress
   */
  private async updateDocumentProgress(
    documentId: string,
    done: number,
    total: number,
    avgConfidence: number
  ): Promise<void> {
    await db
      .update(documents)
      .set({
        ocrPagesDone: done,
        ocrConfidenceAvg: avgConfidence.toString(),
        ocrStatus: done >= total ? 'completed' : 'processing'
      })
      .where(eq(documents.id, documentId));

    console.log(`📊 Document ${documentId} progress: ${done}/${total} pages (${Math.round(avgConfidence * 100)}% avg confidence)`);
  }

  /**
   * Get OCR job status
   */
  async getJobStatus(jobId: string) {
    const [job] = await db
      .select()
      .from(ocrJobs)
      .where(eq(ocrJobs.id, jobId));
      
    return job;
  }

  /**
   * Get all jobs for a document
   */
  async getDocumentJobs(documentId: string) {
    return db
      .select()
      .from(ocrJobs)
      .where(eq(ocrJobs.documentId, documentId));
  }
}

export const cloudOcrService = new CloudOcrService();