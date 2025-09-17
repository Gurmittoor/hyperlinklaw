import { storage } from '../storage.ts';
import { runVisionParallel } from './visionParallel.ts';
import type { Document, OcrBatch, InsertOcrBatch } from '../../shared/schema.ts';

// Redis-free parallel batch processing with Promise.all concurrency
export class ParallelBatchProcessor {
  private static activeBatches = new Map<string, BatchProgress>();
  
  // Create batches for a document (50 pages per batch for optimal performance)
  static async createBatches(documentId: string, totalPages: number, batchSize: number = 50): Promise<OcrBatch[]> {
    console.log(`📦 Creating batches for document ${documentId}: ${totalPages} pages, ${batchSize} per batch`);
    
    const batches: InsertOcrBatch[] = [];
    
    for (let startPage = 1; startPage <= totalPages; startPage += batchSize) {
      const endPage = Math.min(startPage + batchSize - 1, totalPages);
      
      batches.push({
        documentId,
        startPage,
        endPage,
        status: 'queued',
        pagesDone: 0
      });
    }
    
    // Insert all batches into database
    const insertedBatches: OcrBatch[] = [];
    for (const batch of batches) {
      const inserted = await storage.createOcrBatch(batch);
      insertedBatches.push(inserted);
    }
    
    console.log(`✅ Created ${insertedBatches.length} batches for document ${documentId}`);
    return insertedBatches;
  }
  
  // Process all batches for a document in parallel using Promise.all
  static async processDocumentParallel(
    documentId: string, 
    concurrency: number = 2  // Reduced from 4 to avoid rate limits
  ): Promise<BatchProgressSummary> {
    console.log(`🚀 Starting parallel processing for document ${documentId} with ${concurrency} concurrent workers`);
    
    // Get document and create batches
    const document = await storage.getDocument(documentId);
    if (!document) {
      throw new Error(`Document ${documentId} not found`);
    }
    
    const totalPages = document.pageCount || 0;
    if (totalPages === 0) {
      throw new Error(`Document ${documentId} has no pages`);
    }
    
    // Create batches if they don't exist
    let batches = await storage.getBatchesByDocument(documentId);
    if (batches.length === 0) {
      batches = await this.createBatches(documentId, totalPages);
    }
    
    // Initialize progress tracking
    const progress: BatchProgress = {
      documentId,
      totalBatches: batches.length,
      completedBatches: 0,
      totalPages,
      processedPages: 0,
      startedAt: new Date(),
      status: 'processing',
      averageConfidence: 0,
      errors: []
    };
    
    this.activeBatches.set(documentId, progress);
    
    try {
      // Process batches in parallel with controlled concurrency
      await this.processBatchesConcurrent(batches, concurrency, progress);
      
      // Final status
      progress.status = progress.errors.length > 0 ? 'completed_with_errors' : 'completed';
      progress.completedAt = new Date();
      
      // *** CRITICAL FIX *** Update document OCR status in database
      await this.updateDocumentOcrStatus(documentId, progress);
      
      console.log(`✅ Parallel processing completed for document ${documentId}`);
      console.log(`📊 Results: ${progress.processedPages}/${progress.totalPages} pages, avg confidence: ${progress.averageConfidence.toFixed(2)}%`);
      
      return this.getBatchProgress(documentId);
      
    } catch (error) {
      progress.status = 'failed';
      progress.error = error instanceof Error ? error.message : 'Unknown error';
      progress.completedAt = new Date();
      
      console.error(`❌ Parallel processing failed for document ${documentId}:`, error);
      throw error;
    }
  }
  
  // Process batches with controlled concurrency using Promise.all
  private static async processBatchesConcurrent(
    batches: OcrBatch[], 
    concurrency: number, 
    progress: BatchProgress
  ): Promise<void> {
    // Split batches into chunks for controlled concurrency
    const chunks: OcrBatch[][] = [];
    for (let i = 0; i < batches.length; i += concurrency) {
      chunks.push(batches.slice(i, i + concurrency));
    }
    
    console.log(`🔄 Processing ${batches.length} batches in ${chunks.length} chunks of ${concurrency}`);
    
    // Process each chunk in parallel
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      console.log(`📦 Processing chunk ${chunkIndex + 1}/${chunks.length} with ${chunk.length} batches`);
      
      // Process all batches in current chunk in parallel
      const chunkPromises = chunk.map(batch => this.processSingleBatch(batch, progress));
      
      // Wait for all batches in chunk to complete
      await Promise.all(chunkPromises);
      
      console.log(`✅ Completed chunk ${chunkIndex + 1}/${chunks.length}`);
    }
  }
  
  // Process a single batch
  private static async processSingleBatch(batch: OcrBatch, progress: BatchProgress): Promise<void> {
    const batchId = batch.id;
    const startTime = Date.now();
    
    try {
      console.log(`🔄 Starting batch ${batchId}: pages ${batch.startPage}-${batch.endPage}`);
      
      // Update batch status to processing
      await storage.updateOcrBatch(batchId, {
        status: 'processing',
        startedAt: new Date(),
        workerInfo: `worker-${Date.now()}`
      });
      
      // Process pages in this batch
      const batchPages = batch.endPage - batch.startPage + 1;
      const confidenceScores: number[] = [];
      
      // Get document for PDF path
      const document = await storage.getDocument(batch.documentId);
      if (!document) {
        throw new Error(`Document ${batch.documentId} not found for batch ${batchId}`);
      }

      for (let pageNum = batch.startPage; pageNum <= batch.endPage; pageNum++) {
        try {
          console.log(`🔄 Processing page ${pageNum} with Google Cloud Vision OCR...`);
          
          // Use Google Cloud Vision OCR for real processing
          const { processPageWithVision } = await import('./vision');
          const result = await processPageWithVision(document.storagePath, pageNum, batch.documentId);
          
          if (result.success && result.text && result.confidence) {
            // Save OCR result to database
            await this.saveOCRResult(batch.documentId, pageNum, result.text, result.confidence);
            
            confidenceScores.push(result.confidence * 100); // Convert to percentage
            console.log(`✅ Page ${pageNum} completed: ${result.text.length} chars, ${(result.confidence * 100).toFixed(1)}% confidence`);
          } else {
            console.warn(`⚠️ Page ${pageNum} OCR failed: ${result.error}`);
            // Use fallback confidence for failed pages
            confidenceScores.push(50);
          }
          
          // Update progress
          progress.processedPages++;
          
        } catch (error) {
          console.error(`❌ Error processing page ${pageNum} in batch ${batchId}:`, error);
          progress.errors.push(`Page ${pageNum}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          // Add low confidence for failed pages
          confidenceScores.push(0);
        }
      }
      
      // Calculate batch statistics
      const batchConfidence = confidenceScores.length > 0 
        ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length 
        : 0;
        
      const processingTime = Date.now() - startTime;
      
      // Update batch as completed
      await storage.updateOcrBatch(batchId, {
        status: 'completed',
        pagesDone: batchPages,
        confidenceAvg: batchConfidence.toString(),
        completedAt: new Date()
      });
      
      // *** CRITICAL: Check if this is Batch 1 completion for Index Identification ***
      if (batch.startPage === 1 && batch.endPage >= 50) {
        console.log(`🎉 Batch 1 completed! Enabling Index Identification for document ${batch.documentId}`);
        await this.enableIndexIdentification(batch.documentId);
      }
      
      // Update overall progress
      progress.completedBatches++;
      progress.averageConfidence = (progress.averageConfidence * (progress.completedBatches - 1) + batchConfidence) / progress.completedBatches;
      
      console.log(`✅ Batch ${batchId} completed in ${processingTime}ms: ${batchPages} pages, ${batchConfidence.toFixed(2)}% confidence`);
      
    } catch (error) {
      console.error(`❌ Batch ${batchId} failed:`, error);
      
      await storage.updateOcrBatch(batchId, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date()
      });
      
      progress.errors.push(`Batch ${batchId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  // Save OCR result to database
  private static async saveOCRResult(documentId: string, pageNumber: number, text: string, confidence: number): Promise<void> {
    try {
      const { db } = await import('../db');
      const { ocrPages } = await import('../../shared/schema');
      const { sql } = await import('drizzle-orm');
      
      // Upsert OCR result into database - simplified columns that definitely exist
      await db.execute(sql`
        INSERT INTO ocr_pages (document_id, page_number, extracted_text, confidence, created_at, updated_at)
        VALUES (${documentId}, ${pageNumber}, ${text}, ${confidence}, NOW(), NOW())
        ON CONFLICT (document_id, page_number) 
        DO UPDATE SET 
          extracted_text = EXCLUDED.extracted_text,
          confidence = EXCLUDED.confidence,
          updated_at = NOW()
      `);
      
      console.log(`💾 Saved OCR result for page ${pageNumber}: ${text.length} characters`);
    } catch (error) {
      console.error(`❌ Failed to save OCR result for page ${pageNumber}:`, error);
      throw error;
    }
  }
  
  // Enable Index Identification when Batch 1 completes
  private static async enableIndexIdentification(documentId: string): Promise<void> {
    try {
      await storage.updateDocument(documentId, {
        batch1Ready: true,
        batch1ReadyAt: new Date()
      });
      
      console.log(`✅ Document ${documentId} - Index Identification now available (Batch 1 ready)`);
    } catch (error) {
      console.error(`❌ Failed to enable Index Identification for ${documentId}:`, error);
    }
  }

  // Update document OCR status in database when all batches complete
  private static async updateDocumentOcrStatus(documentId: string, progress: BatchProgress): Promise<void> {
    try {
      console.log(`💾 Updating document ${documentId} OCR status to: ${progress.status}`);
      
      const finalStatus = progress.status === 'completed_with_errors' ? 'completed' : progress.status;
      
      await storage.updateDocument(documentId, {
        ocrStatus: finalStatus as 'pending' | 'processing' | 'completed' | 'failed',
        ocrCompletedAt: progress.completedAt || new Date()
      });
      
      console.log(`✅ Document ${documentId} OCR status updated to: ${finalStatus}`);
    } catch (error) {
      console.error(`❌ Failed to update document OCR status for ${documentId}:`, error);
      // Don't throw - this shouldn't fail the entire operation
    }
  }

  // Get current progress for a document
  static getBatchProgress(documentId: string): BatchProgressSummary {
    const progress = this.activeBatches.get(documentId);
    
    if (!progress) {
      return {
        documentId,
        status: 'not_found',
        message: 'No active processing found for this document'
      };
    }
    
    return {
      documentId,
      status: progress.status,
      totalBatches: progress.totalBatches,
      completedBatches: progress.completedBatches,
      totalPages: progress.totalPages,
      processedPages: progress.processedPages,
      progressPercentage: Math.round((progress.processedPages / progress.totalPages) * 100),
      averageConfidence: progress.averageConfidence,
      startedAt: progress.startedAt,
      completedAt: progress.completedAt,
      processingTimeSeconds: progress.completedAt 
        ? Math.round((progress.completedAt.getTime() - progress.startedAt.getTime()) / 1000)
        : Math.round((Date.now() - progress.startedAt.getTime()) / 1000),
      errors: progress.errors,
      message: this.getProgressMessage(progress)
    };
  }
  
  private static getProgressMessage(progress: BatchProgress): string {
    switch (progress.status) {
      case 'processing':
        return `Processing ${progress.processedPages}/${progress.totalPages} pages (${progress.completedBatches}/${progress.totalBatches} batches)`;
      case 'completed':
        return `Successfully processed all ${progress.totalPages} pages`;
      case 'completed_with_errors':
        return `Completed with ${progress.errors.length} errors: ${progress.processedPages}/${progress.totalPages} pages processed`;
      case 'failed':
        return `Processing failed: ${progress.error}`;
      default:
        return 'Unknown status';
    }
  }
  
  // Clear completed progress (cleanup)
  static clearProgress(documentId: string): void {
    this.activeBatches.delete(documentId);
  }
}

// Types for progress tracking
interface BatchProgress {
  documentId: string;
  totalBatches: number;
  completedBatches: number;
  totalPages: number;
  processedPages: number;
  startedAt: Date;
  completedAt?: Date;
  status: 'processing' | 'completed' | 'completed_with_errors' | 'failed';
  averageConfidence: number;
  errors: string[];
  error?: string;
}

export interface BatchProgressSummary {
  documentId: string;
  status: string;
  totalBatches?: number;
  completedBatches?: number;
  totalPages?: number;
  processedPages?: number;
  progressPercentage?: number;
  averageConfidence?: number;
  startedAt?: Date;
  completedAt?: Date;
  processingTimeSeconds?: number;
  errors?: string[];
  message: string;
}