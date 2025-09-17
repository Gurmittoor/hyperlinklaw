/**
 * Parallel OCR System Entry Point
 * 
 * This module initializes the parallel OCR processing system using BullMQ and Redis.
 * It starts the document and batch workers that enable high-speed parallel processing
 * of large legal documents using Google Cloud Vision API.
 */

import './docWorker';
import './batchWorker';
import { docQueue, batchQueue, getQueueStats } from './queues';

console.log('🚀 Parallel OCR system initialized');
console.log('📋 Document queue ready for parallel processing');
console.log('⚡ Batch queue ready for Vision OCR processing');

// Export queue functions for use in API endpoints
export { enqueueDoc, getQueueStats } from './queues';
export { docQueue, batchQueue };

// Optional: Log queue stats periodically in development
if (process.env.NODE_ENV === 'development') {
  setInterval(async () => {
    try {
      const stats = await getQueueStats();
      const totalJobs = stats.documents.waiting + stats.documents.active + 
                       stats.batches.waiting + stats.batches.active;
      
      if (totalJobs > 0) {
        console.log(`📊 Queue Stats - Docs: ${stats.documents.waiting} waiting, ${stats.documents.active} active | Batches: ${stats.batches.waiting} waiting, ${stats.batches.active} active`);
      }
    } catch (error) {
      // Silently fail to avoid spam
    }
  }, 30000); // Every 30 seconds
}