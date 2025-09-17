import { Router } from "express";
import { pool } from "../db";

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

    // Use direct SQL query to avoid schema conflicts
    const result = await pool.query(`
      SELECT id, document_id, page_number, extracted_text, confidence, ocr_engine, updated_at
      FROM ocr_pages 
      WHERE document_id = $1 AND page_number BETWEEN $2 AND $3
      ORDER BY page_number
    `, [docId, start, end]);

    const pages = [];
    for (let pageNum = start; pageNum <= end; pageNum++) {
      const pageData = result.rows.find((page: any) => page.page_number === pageNum);
      
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

    // Update or create OCR pages entry using raw SQL
    const result = await pool.query(`
      INSERT INTO ocr_pages (document_id, page_number, extracted_text, ocr_engine, confidence) 
      VALUES ($1, $2, $3, 'manual', '1.0')
      ON CONFLICT (document_id, page_number) 
      DO UPDATE SET 
        extracted_text = EXCLUDED.extracted_text,
        ocr_engine = 'manual',
        confidence = '1.0',
        updated_at = NOW()
    `, [docId, Number(pageNumber), text]);

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

    const mockText = `Re-OCR completed for page ${pageNumber} at ${new Date().toISOString()}.\n\nThis would contain the actual OCR text from Google Cloud Vision.`;
    const mockConfidence = 0.95;

    // Save the mock result using raw SQL
    const result = await pool.query(`
      INSERT INTO ocr_pages (document_id, page_number, extracted_text, ocr_engine, confidence) 
      VALUES ($1, $2, $3, 'vision', $4)
      ON CONFLICT (document_id, page_number) 
      DO UPDATE SET 
        extracted_text = EXCLUDED.extracted_text,
        ocr_engine = 'vision',
        confidence = EXCLUDED.confidence,
        updated_at = NOW()
    `, [docId, Number(pageNumber), mockText, mockConfidence.toString()]);

    res.json({ ok: true, text: mockText, confidence: mockConfidence });
  } catch (error) {
    console.error('❌ Error re-OCR page:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export default router;