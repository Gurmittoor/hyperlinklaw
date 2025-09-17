import { Router } from "express";
import { db, pool } from "../db";
import { ocrPages } from "../../shared/schema";
import { eq, sql } from "drizzle-orm";

const router = Router();

/**
 * GET all OCR pages for a batch (e.g., 1–50, 51–100)
 * /api/documents/:docId/batches/:batchNo/pages?size=50
 */
router.get("/documents/:docId/batches/:batchNo/pages", async (req, res) => {
  try {
    const { docId, batchNo } = req.params;
    const size = Number(req.query.size ?? 50);

    const start = (Number(batchNo) - 1) * size + 1;
    const end = start + size - 1;

    console.log(`📄 Fetching OCR pages for batch ${batchNo}, pages ${start}-${end}`);

    // Get OCR pages data for this document and page range - use raw SQL to avoid schema issues
    const result = await pool.query(`
      SELECT id, document_id, page_number, extracted_text, confidence, ocr_engine, updated_at
      FROM ocr_pages 
      WHERE document_id = $1
    `, [docId]);
    const pagesData = result;
    const pagesInRange = pagesData.rows.filter((page: any) => 
      page.page_number >= start && page.page_number <= end
    );

    const pages = [];
    for (let pageNum = start; pageNum <= end; pageNum++) {
      const pageData = pagesInRange.find((page: any) => page.page_number === pageNum);
      
      if (pageData) {
        pages.push({
          pageNumber: pageNum,
          text: pageData.extracted_text || "",
          confidence: pageData.confidence ? parseFloat(pageData.confidence.toString()) : null,
          provider: pageData.ocr_engine || null,
          updatedAt: pageData.updated_at,
        });
      } else {
        // Page not yet processed
        pages.push({
          pageNumber: pageNum,
          text: `Page ${pageNum} is being processed...`,
          confidence: null,
          provider: null,
          updatedAt: null,
        });
      }
    }

    res.json({
      documentId: docId,
      batchNo: Number(batchNo),
      start,
      end,
      pages,
    });
  } catch (error) {
    console.error('❌ Error fetching batch OCR pages:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * PUT save edited text for a page
 * body: { text }
 */
router.put("/documents/:docId/pages/:pageNumber", async (req, res) => {
  try {
    const { docId, pageNumber } = req.params;
    const { text } = req.body ?? {};
    
    if (typeof text !== "string") {
      return res.status(400).json({ error: "text required" });
    }

    console.log(`💾 Saving OCR text for page ${pageNumber} of document ${docId}`);

    // Update or create OCR pages entry
    await db.insert(ocrPages).values({
      documentId: docId,
      pageNumber: Number(pageNumber),
      extractedText: text,
      ocrEngine: "manual",
      confidence: "1.0", // Manual edits have 100% confidence
    }).onConflictDoUpdate({
      target: [ocrPages.documentId, ocrPages.pageNumber],
      set: {
        extractedText: text,
        ocrEngine: "manual",
        confidence: "1.0",
      }
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('❌ Error saving OCR text:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * POST re-OCR a single page with Google Cloud Vision
 */
router.post("/documents/:docId/pages/:pageNumber/reocr", async (req, res) => {
  try {
    const { docId, pageNumber } = req.params;

    console.log(`🔄 Re-OCR requested for page ${pageNumber} of document ${docId}`);

    // For now, return a placeholder. In a full implementation, you would:
    // 1. Get the document PDF path
    // 2. Extract the specific page as an image
    // 3. Send to Google Cloud Vision
    // 4. Save the result
    
    const mockText = `Re-OCR completed for page ${pageNumber} at ${new Date().toISOString()}.\n\nThis would contain the actual OCR text from Google Cloud Vision.`;
    const mockConfidence = 0.95;

    // Save the mock result
    await db.insert(ocrPages).values({
      documentId: docId,
      pageNumber: Number(pageNumber),
      extractedText: mockText,
      ocrEngine: "vision",
      confidence: mockConfidence.toString(),
    }).onConflictDoUpdate({
      target: [ocrPages.documentId, ocrPages.pageNumber],
      set: {
        extractedText: mockText,
        ocrEngine: "vision",
        confidence: mockConfidence.toString(),
      }
    });

    res.json({ ok: true, text: mockText, confidence: mockConfidence });
  } catch (error) {
    console.error('❌ Error re-OCR page:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export default router;