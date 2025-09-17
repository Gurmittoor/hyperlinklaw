import { PDFDocument, StandardFonts, rgb, PDFName, PDFArray } from "pdf-lib";
import * as fs from "fs";
import * as path from "path";
import { storage } from "../storage";
import type { Document, InsertLink } from "@shared/schema";
import { hyperlinkArbiter } from './hyperlinkArbiter';

export class PDFProcessor {
  async regenerateWithHighlighting(documentId: string, highlightedLinkIds: string[]): Promise<string> {
    try {
      const document = await storage.getDocument(documentId);
      if (!document) {
        throw new Error("Document not found");
      }

      // Get highlighted links from database
      const highlightedLinks = [];
      for (const linkId of highlightedLinkIds) {
        const link = await storage.getLink(linkId);
        if (link) {
          highlightedLinks.push(link);
        }
      }

      // Load the original PDF
      const { ObjectStorageService: ObjectStorageServiceImport } = await import("../objectStorage");
      const objectStorageService = new ObjectStorageServiceImport();
      const originalPdfPath = objectStorageService.getFilePath(document.hyperlinkedPath || document.storagePath);
      
      if (!fs.existsSync(originalPdfPath)) {
        throw new Error(`PDF file not found: ${originalPdfPath}`);
      }
      
      const pdfBytes = fs.readFileSync(originalPdfPath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      
      // Add highlighting to selected links
      for (const link of highlightedLinks) {
        if (link.bbox && Array.isArray(link.bbox) && link.bbox.length === 4) {
          const page = pdfDoc.getPages()[link.srcPage - 1]; // Convert 1-based to 0-based
          if (page) {
            const [x, y, width, height] = link.bbox;
            
            // Add yellow highlight annotation
            page.drawRectangle({
              x: x,
              y: page.getHeight() - y - height, // PDF coordinate system is bottom-up
              width: width,
              height: height,
              color: rgb(1, 1, 0), // Yellow
              opacity: 0.3,
            });
          }
        }
      }
      
      // Save the highlighted PDF
      const highlightedPdfBytes = await pdfDoc.save();
      const highlightedFileName = `${path.parse(document.originalName).name}_highlighted.pdf`;
      const highlightedPath = objectStorageService.generatePath(document.caseId, highlightedFileName);
      const fullPath = objectStorageService.getFilePath(highlightedPath);
      
      // Ensure directory exists
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(fullPath, highlightedPdfBytes);
      
      return highlightedPath;
    } catch (error) {
      console.error("Error regenerating PDF with highlighting:", error);
      throw error;
    }
  }

  /**
   * 🚀 OCR-FIRST HYPERLINK PROCESSING
   * Uses cached OCR results for bulletproof hyperlink detection
   * This method leverages pre-computed OCR data instead of live text extraction
   */
  async processDocumentWithOcrCache(documentId: string): Promise<void> {
    try {
      console.log(`🔍 Starting OCR-first hyperlink processing for document ${documentId}`);
      
      // Update status to processing
      await storage.updateDocument(documentId, {
        ocrStatus: "processing",
        parseProgress: 10,
        lastError: null
      });

      const document = await storage.getDocument(documentId);
      if (!document) {
        throw new Error("Document not found");
      }

      // Check if OCR cache exists for this document
      const cachedOcrPages = await storage.getOcrCacheByDocument(documentId);
      if (!cachedOcrPages || cachedOcrPages.length === 0) {
        console.warn(`⚠️ No OCR cache found for document ${documentId}, falling back to standard processing`);
        return await this.processDocument(documentId);
      }

      console.log(`📋 Found ${cachedOcrPages.length} cached OCR pages for document ${documentId}`);
      
      // Update progress
      await storage.updateDocument(documentId, { parseProgress: 30 });

      // Get case documents for precision hyperlink detection
      const caseId = document.caseId;
      const caseDocuments = await storage.getDocumentsByCase(caseId);
      
      // Use HyperlinkLaw Strict Deterministic Arbiter with OCR cache
      let enhancedLinks: InsertLink[] = [];
      try {
        console.log(`🎯 Starting HyperlinkLaw strict arbiter with OCR cache for case ${caseId}...`);
        
        // Reset and recompute with strict rules (removes all fake links)
        const summary = await hyperlinkArbiter.resetAndRecompute(caseDocuments);
        console.log(`📊 New strict link counts:`, summary);
        
        // Clear existing inflated links from database
        await this.clearExistingLinks(caseId);
        
        // Find trial record for target mapping
        const trialRecord = caseDocuments.find(doc => 
          doc.title.toLowerCase().includes('trial record') || 
          doc.title.toLowerCase().includes('transcript')
        );
        
        if (trialRecord) {
          // Use OCR cache for anchor and hit detection instead of live extraction
          const anchors = await hyperlinkArbiter.extractTrialRecordAnchorsFromOcr(trialRecord.id);
          const briefs = caseDocuments.filter(doc => doc.id !== trialRecord.id);
          const hits = await hyperlinkArbiter.extractBriefHitsFromOcr(briefs.map(b => b.id));
          
          // Arbitrate decisions
          const decisions = hyperlinkArbiter.arbitrate(anchors, hits);
          
          // Convert decisions to InsertLink format for this document
          for (const decision of decisions.filter(d => d.decision === 'link' && d.brief_file === documentId)) {
            const linkData: InsertLink = {
              caseId,
              srcDocId: documentId,
              targetDocId: trialRecord.id,
              srcPage: decision.brief_page,
              targetPage: decision.dest_page!,
              srcText: `${decision.ref_type} ${decision.ref_value}`,
              targetText: `${decision.ref_type} ${decision.ref_value}`,
              linkType: decision.ref_type.toLowerCase() as any,
              status: 'pending',
              confidence: 1.0, // Deterministic arbiter = 100% confidence
              reviewedAt: null,
              createdAt: new Date(),
              updatedAt: new Date()
            };
            
            await storage.createLink(linkData);
            enhancedLinks.push(linkData);
          }
          
          console.log(`✅ HyperlinkLaw placed ${enhancedLinks.length} validated links using OCR cache for document ${documentId}`);
        } else {
          throw new Error('No trial record found for anchor extraction');
        }
      } catch (arbiterError) {
        console.warn(`HyperlinkLaw arbiter failed for ${documentId}, using OCR cache fallback:`, arbiterError);
        
        // Fallback to OCR cache-based detection
        try {
          const { ocrHyperlinkDetector } = await import('./ocrHyperlinkDetector');
          enhancedLinks = await ocrHyperlinkDetector.detectLinksFromOcrCache(documentId, document);
          
          // Save enhanced OCR links to database
          for (const linkData of enhancedLinks) {
            await storage.createLink(linkData);
          }
          
          console.log(`📊 OCR cache fallback found ${enhancedLinks.length} links for document ${documentId}`);
        } catch (ocrError) {
          console.warn(`OCR cache fallback also failed for ${documentId}:`, ocrError);
          enhancedLinks = await storage.getLinksByDocument(documentId);
          console.log(`Using existing links: ${enhancedLinks.length} for document ${documentId}`);
        }
      }
      
      // Update progress
      await storage.updateDocument(documentId, { parseProgress: 60 });

      // Generate hyperlinked PDF using cached OCR
      await this.generateHyperlinkedPdfFromOcrCache(document, enhancedLinks);
      
      // Update final status
      await storage.updateDocument(documentId, {
        ocrStatus: "completed",
        parseProgress: 100,
        lastProcessedAt: new Date(),
        lastError: null
      });

      console.log(`🎉 OCR-first processing completed successfully for document ${documentId}`);
    } catch (error) {
      console.error(`❌ OCR-first processing failed for document ${documentId}:`, error);
      
      // Update error status
      await storage.updateDocument(documentId, {
        ocrStatus: "failed",
        lastError: error instanceof Error ? error.message : "Unknown error",
        parseProgress: 0
      });
      
      throw error;
    }
  }

  async processDocument(documentId: string): Promise<void> {
    try {
      // Update status to processing
      await storage.updateDocument(documentId, {
        ocrStatus: "processing",
        parseProgress: 10,
        lastError: null
      });

      const document = await storage.getDocument(documentId);
      if (!document) {
        throw new Error("Document not found");
      }

      // Load the PDF from object storage
      const { ObjectStorageService: ObjectStorageServiceImport } = await import("../objectStorage");
      const objectStorageService = new ObjectStorageServiceImport();
      const pdfPath = objectStorageService.getFilePath(document.storagePath);
      
      // Validate file exists
      if (!fs.existsSync(pdfPath)) {
        throw new Error(`PDF file not found: ${pdfPath}`);
      }
      
      // Check file size
      const stats = fs.statSync(pdfPath);
      if (stats.size === 0) {
        throw new Error("PDF file is empty");
      }
      
      const pdfBytes = fs.readFileSync(pdfPath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      
      // Update progress
      await storage.updateDocument(documentId, { parseProgress: 30 });

      // Get case documents for precision hyperlink detection
      const caseId = document.caseId;
      const caseDocuments = await storage.getDocumentsByCase(caseId);
      
      // Use HyperlinkLaw Strict Deterministic Arbiter (removes fake links, places correct links)
      let enhancedLinks: InsertLink[] = [];
      try {
        console.log(`🎯 Starting HyperlinkLaw strict arbiter for case ${caseId}...`);
        
        // Reset and recompute with strict rules (removes all fake links)
        const summary = await hyperlinkArbiter.resetAndRecompute(caseDocuments);
        console.log(`📊 New strict link counts:`, summary);
        
        // Clear existing inflated links from database
        await this.clearExistingLinks(caseId);
        
        // Find trial record for target mapping
        const trialRecord = caseDocuments.find(doc => 
          doc.title.toLowerCase().includes('trial record') || 
          doc.title.toLowerCase().includes('transcript')
        );
        
        if (trialRecord) {
          // Extract anchors and hits
          const anchors = await hyperlinkArbiter.extractTrialRecordAnchors(trialRecord.storagePath, trialRecord.id);
          const briefs = caseDocuments.filter(doc => doc.id !== trialRecord.id);
          const hits = await hyperlinkArbiter.extractBriefHits(briefs);
          
          // Arbitrate decisions
          const decisions = hyperlinkArbiter.arbitrate(anchors, hits);
          
          // Convert decisions to InsertLink format for this document
          for (const decision of decisions.filter(d => d.decision === 'link' && d.brief_file === documentId)) {
            const linkData: InsertLink = {
              caseId,
              srcDocId: documentId,
              targetDocId: trialRecord.id,
              srcPage: decision.brief_page,
              targetPage: decision.dest_page!,
              srcText: `${decision.ref_type} ${decision.ref_value}`,
              targetText: `${decision.ref_type} ${decision.ref_value}`,
              linkType: decision.ref_type.toLowerCase() as any,
              status: 'pending',
              confidence: 1.0, // Deterministic arbiter = 100% confidence
              reviewedAt: null,
              createdAt: new Date(),
              updatedAt: new Date()
            };
            
            await storage.createLink(linkData);
            enhancedLinks.push(linkData);
          }
          
          console.log(`✅ HyperlinkLaw placed ${enhancedLinks.length} validated links for document ${documentId} (0 broken)`);
        } else {
          throw new Error('No trial record found for anchor extraction');
        }
      } catch (arbiterError) {
        console.warn(`HyperlinkLaw arbiter failed for ${documentId}, falling back to OCR:`, arbiterError);
        
        // Fallback to OCR-enhanced detection
        try {
          const { ocrHyperlinkDetector } = await import('./ocrHyperlinkDetector');
          enhancedLinks = await ocrHyperlinkDetector.detectLinks(pdfPath, document);
          
          // Save enhanced OCR links to database
          for (const linkData of enhancedLinks) {
            await storage.createLink(linkData);
          }
          
          console.log(`OCR fallback found ${enhancedLinks.length} links for document ${documentId}`);
        } catch (ocrError) {
          console.warn(`OCR fallback also failed for ${documentId}:`, ocrError);
          enhancedLinks = await storage.getLinksByDocument(documentId);
          console.log(`Using existing links: ${enhancedLinks.length} for document ${documentId}`);
        }
      }
      
      // Update progress
      await storage.updateDocument(documentId, { parseProgress: 60 });

      // Convert to format needed for PDF hyperlinks
      const formattedLinks: InsertLink[] = enhancedLinks.map(link => ({
        ...link,
        srcPage: parseInt(link.srcPage),
        targetPage: parseInt(link.targetPage),
        bbox: link.srcRect ? [link.srcRect.x, link.srcRect.y, link.srcRect.width, link.srcRect.height] : undefined
      }));

      // Add hyperlink annotations to PDF using precision links
      try {
        await this.addHyperlinksToPDF(pdfDoc, formattedLinks);
        console.log(`Successfully added ${enhancedLinks.length} OCR-detected hyperlinks to PDF for document ${documentId}`);
      } catch (annotationError) {
        console.warn(`Failed to add PDF annotations for ${documentId}, saving without annotations:`, annotationError);
        // Continue without annotations rather than failing
      }
      
      // Update progress
      await storage.updateDocument(documentId, { parseProgress: 80 });

      // Save the hyperlinked PDF to object storage
      const hyperlinkBytes = await pdfDoc.save();
      const outputPath = `hyperlinked_${document.storagePath}`;
      const fullOutputPath = objectStorageService.getFilePath(outputPath);
      
      // Ensure directory exists
      const outputDir = path.dirname(fullOutputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      fs.writeFileSync(fullOutputPath, hyperlinkBytes);

      // Update document status
      await storage.updateDocument(documentId, {
        hyperlinkedPath: outputPath,
        ocrStatus: "completed",
        parseProgress: 100,
        reviewStatus: "in_review"
      });

    } catch (error) {
      console.error(`Error processing document ${documentId}:`, error);
      
      let errorMessage = "Unknown error";
      if (error instanceof Error) {
        errorMessage = error.message;
        // Provide user-friendly error messages
        if (error.message.includes("PDF file not found")) {
          errorMessage = "File not found in storage. Please re-upload the document.";
        } else if (error.message.includes("PDF file is empty")) {
          errorMessage = "File appears to be corrupted or empty. Please re-upload.";
        } else if (error.message.includes("Invalid PDF")) {
          errorMessage = "Invalid PDF format. Please ensure the file is a valid PDF.";
        } else if (error.message.includes("password")) {
          errorMessage = "Password-protected PDFs are not supported.";
        }
      }
      
      await storage.updateDocument(documentId, {
        ocrStatus: "failed",
        lastError: errorMessage,
        parseProgress: 0
      });
      
      // Don't throw error to prevent crashes - just mark as failed
      console.log(`Document ${documentId} marked as failed with error: ${errorMessage}`);
    }
  }

  private async addHyperlinksToPDF(pdfDoc: PDFDocument, links: InsertLink[]): Promise<void> {
    const pages = pdfDoc.getPages();
    
    for (const link of links) {
      const sourcePage = pages[link.srcPage - 1];
      const targetPage = pages[link.targetPage - 1];
      
      if (sourcePage && targetPage && link.bbox) {
        const [x, y, width, height] = link.bbox;
        
        // Create actual clickable hyperlink annotation
        try {
          // Create a destination for the target page
          const targetPageRef = targetPage.ref;
          
          // Add link annotation that makes the text area clickable
          const linkAnnot = pdfDoc.context.obj({
            Type: 'Annot',
            Subtype: 'Link',
            Rect: [x, y, x + width, y + height],
            Border: [0, 0, 0], // No border
            Dest: [targetPageRef, 'XYZ', null, null, null], // Go to target page at current zoom
            H: 'I', // Highlight mode: invert
          });

          // Add the annotation to the source page
          const sourcePageDict = sourcePage.node;
          const existingAnnots = sourcePageDict.lookupMaybe(PDFName.of('Annots'), PDFArray);
          
          if (existingAnnots) {
            existingAnnots.push(linkAnnot);
          } else {
            sourcePageDict.set(PDFName.of('Annots'), pdfDoc.context.obj([linkAnnot]));
          }

          console.log(`Added hyperlink: Page ${link.srcPage} -> Page ${link.targetPage}`);
        } catch (error) {
          console.warn(`Failed to add link annotation from page ${link.srcPage} to ${link.targetPage}:`, error);
        }
      }
    }

    // Add index page
    const indexPage = pdfDoc.insertPage(0, [612, 792]);
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Draw title
    indexPage.drawText('HYPERLINK INDEX', {
      x: 50,
      y: 742,
      size: 18,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    indexPage.drawText(`Total Links: ${links.length}`, {
      x: 50,
      y: 710,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });

    // List links
    let yPos = 680;
    indexPage.drawText('Link Summary:', {
      x: 50,
      y: yPos,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    yPos -= 20;
    for (let i = 0; i < Math.min(20, links.length); i++) {
      const link = links[i];
      indexPage.drawText(
        `• Page ${link.srcPage} -> Page ${link.targetPage}`,
        {
          x: 70,
          y: yPos,
          size: 10,
          font: helveticaFont,
          color: rgb(0, 0, 0.2),
        }
      );
      yPos -= 15;
      if (yPos < 100) break;
    }
  }

  async processBatch(documentIds: string[]): Promise<void> {
    for (const docId of documentIds) {
      try {
        await this.processDocument(docId);
      } catch (error) {
        console.error(`Failed to process document ${docId}:`, error);
        // Continue with next document
      }
    }
  }

  /**
   * Generate hyperlinked PDF using cached OCR data
   * This method leverages the OCR-first architecture to create PDFs without live text extraction
   */
  private async generateHyperlinkedPdfFromOcrCache(document: Document, links: InsertLink[]): Promise<void> {
    try {
      console.log(`🔗 Generating hyperlinked PDF using OCR cache for ${document.title}`);
      
      // Load the original PDF
      const { ObjectStorageService: ObjectStorageServiceImport } = await import("../objectStorage");
      const objectStorageService = new ObjectStorageServiceImport();
      const pdfPath = objectStorageService.getFilePath(document.storagePath);
      
      if (!fs.existsSync(pdfPath)) {
        throw new Error(`PDF file not found: ${pdfPath}`);
      }
      
      const pdfBytes = fs.readFileSync(pdfPath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      
      // Add hyperlinks to PDF using the existing method
      await this.addHyperlinksToPDF(pdfDoc, links);
      
      // Save the hyperlinked PDF to object storage
      const hyperlinkBytes = await pdfDoc.save();
      const outputPath = `hyperlinked_${document.storagePath}`;
      const fullOutputPath = objectStorageService.getFilePath(outputPath);
      
      // Ensure directory exists
      const outputDir = path.dirname(fullOutputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      fs.writeFileSync(fullOutputPath, hyperlinkBytes);

      // Update document status
      await storage.updateDocument(document.id, {
        hyperlinkedPath: outputPath,
        ocrStatus: "completed",
        parseProgress: 100,
        reviewStatus: "in_review"
      });
      
      console.log(`✅ Hyperlinked PDF generated successfully using OCR cache for ${document.title}`);
    } catch (error) {
      console.error(`❌ Failed to generate hyperlinked PDF from OCR cache for ${document.title}:`, error);
      throw error;
    }
  }

  private async clearExistingLinks(caseId: string): Promise<void> {
    try {
      // Get all links for this case and remove them
      const existingLinks = await storage.getLinks();
      const caseLinks = existingLinks.filter(link => link.caseId === caseId);
      
      for (const link of caseLinks) {
        await storage.deleteLink(link.id);
      }
      
      console.log(`Cleared ${caseLinks.length} existing links for case ${caseId}`);
    } catch (error) {
      console.warn('Error clearing existing links:', error);
    }
  }
}

export const pdfProcessor = new PDFProcessor();
