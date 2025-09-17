import express from 'express';
import { ParallelBatchProcessor } from '../services/parallelBatch.ts';
import { storage } from '../storage.ts';

const router = express.Router();

// Start parallel OCR processing for a document
router.post('/documents/:documentId/parallel-ocr', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { concurrency = 4 } = req.body; // Default 4 concurrent batches
    
    console.log(`🚀 Starting parallel OCR for document ${documentId} with concurrency ${concurrency}`);
    
    // Start parallel processing
    const result = await ParallelBatchProcessor.processDocumentParallel(documentId, concurrency);
    
    res.json({
      success: true,
      message: 'Parallel OCR processing completed',
      result
    });
    
  } catch (error) {
    console.error('❌ Parallel OCR processing failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get progress of parallel OCR processing
router.get('/documents/:documentId/parallel-progress', async (req, res) => {
  try {
    const { documentId } = req.params;
    
    const progress = ParallelBatchProcessor.getBatchProgress(documentId);
    
    res.json({
      success: true,
      progress
    });
    
  } catch (error) {
    console.error('❌ Error getting parallel OCR progress:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create batches for a document (for manual batch creation)
router.post('/documents/:documentId/batches', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { totalPages, batchSize = 50 } = req.body;
    
    if (!totalPages) {
      return res.status(400).json({
        success: false,
        error: 'totalPages is required'
      });
    }
    
    console.log(`📦 Creating batches for document ${documentId}: ${totalPages} pages, ${batchSize} per batch`);
    
    const batches = await ParallelBatchProcessor.createBatches(documentId, totalPages, batchSize);
    
    res.json({
      success: true,
      message: `Created ${batches.length} batches`,
      batches
    });
    
  } catch (error) {
    console.error('❌ Error creating batches:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all batches for a document (with enhanced progress tracking)
router.get('/documents/:documentId/batches', async (req, res) => {
  try {
    const { documentId } = req.params;
    
    const batches = await storage.getBatchesByDocument(documentId);
    
    // Add computed progress percentage for each batch
    const batchesWithProgress = batches.map(batch => ({
      ...batch,
      progress: batch.pagesDone / (batch.endPage - batch.startPage + 1) * 100,
      totalPages: batch.endPage - batch.startPage + 1
    }));
    
    res.json({
      success: true,
      batches: batchesWithProgress
    });
    
  } catch (error) {
    console.error('❌ Error getting batches:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Clear completed progress (cleanup)
router.delete('/documents/:documentId/parallel-progress', async (req, res) => {
  try {
    const { documentId } = req.params;
    
    ParallelBatchProcessor.clearProgress(documentId);
    
    res.json({
      success: true,
      message: 'Progress cleared'
    });
    
  } catch (error) {
    console.error('❌ Error clearing progress:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Re-process a specific batch with enhanced OCR
router.post('/documents/:documentId/batches/:batchId/re-ocr', async (req, res) => {
  try {
    const { documentId, batchId } = req.params;
    const { startPage, endPage } = req.body;
    
    console.log(`🔄 Re-OCR request for batch ${batchId} (pages ${startPage}-${endPage})`);
    
    if (!startPage || !endPage) {
      return res.status(400).json({
        success: false,
        error: 'startPage and endPage are required'
      });
    }
    
    // Update batch status to processing
    await storage.updateOcrBatch(batchId, {
      status: 'processing',
      pagesDone: 0,
      completedAt: null,
      startedAt: new Date()
    });
    
    // Enqueue the batch for re-processing using the existing system
    const { enqueueBatchOcr } = await import('../services/parallelOcr');
    const batchJob = {
      documentId,
      batchId,
      batchIndex: 1,
      startPage,
      endPage,
      priority: 'high' as const
    };
    
    // Start re-processing immediately
    enqueueBatchOcr(batchJob);
    const result = { message: 'Re-OCR processing started', batchId };
    
    res.json({
      success: true,
      message: `Re-OCR processing started for batch ${batchId}`,
      result
    });
    
  } catch (error) {
    console.error('❌ Re-OCR processing failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;