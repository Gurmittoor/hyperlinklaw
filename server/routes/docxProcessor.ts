import type { Express } from "express";
import { docxTextExtractor } from "../services/docxTextExtractor";
import { storage } from "../storage";

export function registerDocxRoutes(app: Express) {
  // Process failed DOCX document with direct text extraction
  app.post("/api/documents/:documentId/process-docx", async (req, res) => {
    const { documentId } = req.params;
    
    try {
      console.log(`📝 Starting direct DOCX text extraction for document: ${documentId}`);
      
      // Get document info
      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      if (!document.mimeType.includes('wordprocessingml.document')) {
        return res.status(400).json({ error: "Document is not a DOCX file" });
      }

      // Get file path from object storage
      const filePath = `storage/${document.storagePath}`;
      
      // Extract text directly from DOCX
      const result = await docxTextExtractor.extractTextFromDocx(filePath, documentId);
      
      if (result.success) {
        // Update document status
        await storage.updateDocument(documentId, {
          pageCount: result.pageCount,
          ocrStatus: "completed"
        });

        console.log(`✅ DOCX processing completed: ${result.pageCount} pages, ${result.indexItems?.length || 0} index items`);
        
        res.json({
          success: true,
          pageCount: result.pageCount,
          indexItems: result.indexItems,
          message: `Successfully extracted text from ${result.pageCount} pages`
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error
        });
      }
      
    } catch (error) {
      console.error("DOCX processing error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
}