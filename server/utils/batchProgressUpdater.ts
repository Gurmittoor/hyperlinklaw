import { storage } from '../storage.js';

export class BatchProgressUpdater {
  private static updateIntervals: Map<string, NodeJS.Timeout> = new Map();
  
  // Start real-time progress updates for a document
  static startProgressTracking(documentId: string): void {
    // Clear existing interval if any
    this.stopProgressTracking(documentId);
    
    const interval = setInterval(async () => {
      try {
        await this.updateAllBatchProgress(documentId);
      } catch (error) {
        console.warn(`⚠️ Progress update failed for ${documentId}:`, error);
      }
    }, 5000); // Update every 5 seconds
    
    this.updateIntervals.set(documentId, interval);
    console.log(`📊 Started real-time progress tracking for document ${documentId}`);
  }
  
  // Stop progress tracking
  static stopProgressTracking(documentId: string): void {
    const interval = this.updateIntervals.get(documentId);
    if (interval) {
      clearInterval(interval);
      this.updateIntervals.delete(documentId);
      console.log(`📊 Stopped progress tracking for document ${documentId}`);
    }
  }
  
  // Update progress for all batches of a document
  static async updateAllBatchProgress(documentId: string): Promise<void> {
    try {
      const { db } = await import('../db');
      
      // Update all batch progress counts in one query
      await db.execute(`
        UPDATE ocr_batches 
        SET pages_done = (
          SELECT COUNT(*) 
          FROM ocr_pages 
          WHERE ocr_pages.document_id = ocr_batches.document_id 
            AND ocr_pages.page_number >= ocr_batches.start_page 
            AND ocr_pages.page_number <= ocr_batches.end_page
        )
        WHERE document_id = $1
      `, [documentId]);
      
    } catch (error) {
      console.error(`❌ Failed to update batch progress for ${documentId}:`, error);
    }
  }
  
  // Check if document OCR is complete and stop tracking
  static async checkAndCompleteDocument(documentId: string): Promise<void> {
    try {
      const batches = await storage.getOcrBatchesByDocument(documentId);
      const allComplete = batches.every(batch => 
        batch.pagesDone >= (batch.endPage - batch.startPage + 1)
      );
      
      if (allComplete) {
        console.log(`🎉 Document ${documentId} OCR completed! Stopping progress tracking.`);
        this.stopProgressTracking(documentId);
        
        // Mark all completed batches
        for (const batch of batches) {
          if (batch.status === 'processing') {
            await storage.updateOcrBatch(batch.id, {
              status: 'completed',
              completedAt: new Date()
            });
          }
        }
      }
      
    } catch (error) {
      console.error(`❌ Failed to check completion for ${documentId}:`, error);
    }
  }
}