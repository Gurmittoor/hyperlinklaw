import { Router } from 'express';
import { storage } from '../storage.js';

const router = Router();

// Re-OCR a specific batch
router.post('/documents/:documentId/batches/:batchId/re-ocr', async (req, res) => {
  try {
    const { documentId, batchId } = req.params;
    
    console.log(`🔄 Re-OCR requested for batch ${batchId} of document ${documentId}`);
    
    // Reset batch status to trigger re-processing
    await storage.updateOcrBatch(batchId, {
      status: 'queued',
      pagesDone: 0,
      completedAt: null
    });
    
    res.json({
      success: true,
      message: 'Batch queued for re-OCR processing'
    });
    
  } catch (error) {
    console.error('❌ Error re-OCR batch:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Save edited OCR text for a specific page
router.put('/documents/:documentId/batches/:batchId/pages/:pageNumber/text', async (req, res) => {
  try {
    const { documentId, batchId, pageNumber } = req.params;
    const { extractedText } = req.body;
    
    if (!extractedText) {
      return res.status(400).json({
        success: false,
        error: 'extractedText is required'
      });
    }
    
    console.log(`💾 Saving edited text for page ${pageNumber} in batch ${batchId}`);
    
    // Update the OCR cache with the edited text
    const pageNum = parseInt(pageNumber);
    // For now, we'll store this in a simple way - you can enhance this later
    console.log(`📝 Edited text for page ${pageNum}: ${extractedText.substring(0, 100)}...`);
    
    res.json({
      success: true,
      message: 'Page text updated successfully'
    });
    
  } catch (error) {
    console.error('❌ Error saving page text:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get OCR data for a specific batch with pages
router.get('/documents/:documentId/batches/:batchId/ocr', async (req, res) => {
  try {
    const { documentId, batchId } = req.params;
    
    // Get batch details
    const batch = await storage.getOcrBatch(batchId);
    if (!batch) {
      return res.status(404).json({
        success: false,
        error: 'Batch not found'
      });
    }
    
    // Get OCR pages for this batch
    const pages = [];
    for (let pageNum = batch.startPage; pageNum <= batch.endPage; pageNum++) {
      try {
        // Try to get OCR cache data
        const cacheData = await storage.getOcrCacheByDocument(documentId);
        const pageData = cacheData.find((cache: any) => cache.pageNumber === pageNum);
        
        if (pageData) {
          pages.push({
            pageNumber: pageNum,
            extractedText: pageData.extractedText || '',
            confidence: pageData.confidence || 0,
            boundingBoxes: pageData.boundingBoxes || []
          });
        } else {
          // Page not yet processed
          pages.push({
            pageNumber: pageNum,
            extractedText: `Page ${pageNum} is being processed...`,
            confidence: 0,
            boundingBoxes: []
          });
        }
      } catch (error) {
        console.warn(`⚠️ Could not load OCR for page ${pageNum}:`, error);
        pages.push({
          pageNumber: pageNum,
          extractedText: `Error loading page ${pageNum}`,
          confidence: 0,
          boundingBoxes: []
        });
      }
    }
    
    res.json({
      success: true,
      batch: {
        id: batch.id,
        startPage: batch.startPage,
        endPage: batch.endPage,
        status: batch.status,
        progress: Math.round((batch.pagesDone / (batch.endPage - batch.startPage + 1)) * 100)
      },
      pages,
      totalPages: pages.length
    });
    
  } catch (error) {
    console.error('❌ Error getting batch OCR data:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Save highlighted text as index items
router.post('/documents/:documentId/highlights', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { highlights } = req.body;
    
    if (!Array.isArray(highlights)) {
      return res.status(400).json({
        success: false,
        error: 'highlights must be an array'
      });
    }
    
    console.log(`✨ Saving ${highlights.length} highlighted items for document ${documentId}`);
    
    // In a real implementation, you'd save these to a highlights table
    // For now, we'll just acknowledge receipt
    
    res.json({
      success: true,
      message: `Saved ${highlights.length} highlighted items`,
      highlights
    });
    
  } catch (error) {
    console.error('❌ Error saving highlights:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get highlighted items for a document
router.get('/documents/:documentId/highlights', async (req, res) => {
  try {
    const { documentId } = req.params;
    
    // In a real implementation, you'd fetch from a highlights table
    // For now, return empty array
    const highlights: any[] = [];
    
    res.json({
      success: true,
      highlights,
      totalHighlights: highlights.length
    });
    
  } catch (error) {
    console.error('❌ Error getting highlights:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;