import fs from 'fs/promises';
import path from 'path';
import { db } from '../db';
import { ocrPages, documents } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Use pdf-parse for direct text extraction from PDFs
import pdfParse from 'pdf-parse';

export interface PdfTextResult {
  success: boolean;
  processedPages: number;
  totalPages: number;
  hasTextContent: boolean;
  indexItems?: Array<{
    type: 'tab' | 'exhibit' | 'form';
    number: string;
    pageNumber: number;
    text: string;
  }>;
  error?: string;
}

export class PdfTextExtractor {
  
  /**
   * Extract text directly from PDF without OCR (for text-based PDFs)
   */
  async extractTextFromPdf(documentId: string): Promise<PdfTextResult> {
    try {
      console.log(`📝 Extracting text directly from PDF: ${documentId}`);
      
      // Get document info
      const [document] = await db.select().from(documents).where(eq(documents.id, documentId));
      if (!document) {
        throw new Error('Document not found');
      }

      const filePath = path.join(process.cwd(), 'storage', document.storagePath);
      console.log(`📁 Reading PDF file: ${filePath}`);

      // Read PDF file
      const fileBuffer = await fs.readFile(filePath);
      
      // Extract text using pdf-parse
      const pdfData = await pdfParse(fileBuffer);
      
      console.log(`📄 PDF Info: ${pdfData.numpages} pages, ${pdfData.text.length} characters`);

      if (!pdfData.text || pdfData.text.trim().length === 0) {
        console.log(`❌ No text content found - document requires OCR`);
        return {
          success: true,
          hasTextContent: false,
          processedPages: 0,
          totalPages: pdfData.numpages || 0
        };
      }

      // Split text into logical pages
      const pages = this.splitTextIntoPages(pdfData.text, pdfData.numpages);
      console.log(`📄 Split into ${pages.length} logical pages`);

      // Clear existing OCR data and save new text data
      await db.delete(ocrPages).where(eq(ocrPages.documentId, documentId));

      // Save each page as OCR data for consistency with the system
      for (let i = 0; i < pages.length; i++) {
        const pageNumber = i + 1;
        const pageText = pages[i];

        await db.insert(ocrPages).values({
          documentId,
          pageNumber,
          text: pageText,
          confidence: 100, // Perfect confidence for direct text extraction
          boundingBoxes: null
        });
      }

      // Analyze for index items
      const indexItems = this.analyzeIndexItems(pages);

      // Update document status
      await db.update(documents)
        .set({ 
          ocrStatus: 'completed',
          ocrPagesDone: pages.length,
          ocrCompletedAt: new Date(),
          ocrConfidenceAvg: 100
        })
        .where(eq(documents.id, documentId));

      console.log(`✅ Direct text extraction completed: ${pages.length}/${pdfData.numpages} pages`);
      console.log(`📋 Found ${indexItems.length} index items`);

      return {
        success: true,
        hasTextContent: true,
        processedPages: pages.length,
        totalPages: pdfData.numpages,
        indexItems
      };

    } catch (error) {
      console.error(`❌ PDF text extraction failed:`, error);
      return {
        success: false,
        hasTextContent: false,
        processedPages: 0,
        totalPages: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Split text into logical pages
   */
  private splitTextIntoPages(text: string, totalPages: number): string[] {
    // Split by common page break indicators
    let pages: string[] = [];
    
    // Try to split by page numbers first
    const pageRegex = /(?=Page\s+\d+)/gi;
    if (text.match(pageRegex)) {
      pages = text.split(pageRegex).filter(page => page.trim().length > 0);
    } else {
      // Split by form feeds or multiple line breaks
      const sections = text.split(/\f|\n\s*\n\s*\n/).filter(section => section.trim().length > 0);
      
      if (sections.length >= totalPages * 0.8) {
        // If we have roughly the right number of sections, use them
        pages = sections;
      } else {
        // Fallback: split into equal chunks
        const chunkSize = Math.ceil(text.length / totalPages);
        for (let i = 0; i < text.length; i += chunkSize) {
          pages.push(text.slice(i, i + chunkSize));
        }
      }
    }

    // Ensure we have the right number of pages
    while (pages.length < totalPages) {
      pages.push(`Page ${pages.length + 1} content`);
    }

    return pages.slice(0, totalPages);
  }

  /**
   * Analyze text for index items (tabs, exhibits, forms)
   */
  private analyzeIndexItems(pages: string[]): Array<{
    type: 'tab' | 'exhibit' | 'form';
    number: string;
    pageNumber: number;
    text: string;
  }> {
    const indexItems: Array<{
      type: 'tab' | 'exhibit' | 'form';
      number: string;
      pageNumber: number;
      text: string;
    }> = [];

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const text = pages[pageIndex];
      const pageNumber = pageIndex + 1;

      // Pattern matching for legal document elements
      const patterns = [
        // Tabs: "Tab 1", "Tab A", "Tab No. 1"
        {
          regex: /(?:^|\n)\s*Tab\s+(?:No\.?\s*)?([A-Z0-9]+)/gim,
          type: 'tab' as const
        },
        // Exhibits: "Exhibit A", "Exhibit 1"
        {
          regex: /(?:^|\n)\s*Exhibit\s+([A-Z0-9]+)/gim,
          type: 'exhibit' as const
        },
        // Forms: "Form 8", "Form 10A"
        {
          regex: /(?:^|\n)\s*Form\s+([A-Z0-9]+)/gim,
          type: 'form' as const
        }
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.regex.exec(text)) !== null) {
          const number = match[1];
          const context = this.getContext(text, match.index, 100);
          
          indexItems.push({
            type: pattern.type,
            number,
            pageNumber,
            text: context
          });
        }
      }
    }

    return this.deduplicateIndexItems(indexItems);
  }

  /**
   * Get surrounding context for a match
   */
  private getContext(text: string, matchIndex: number, contextLength: number): string {
    const start = Math.max(0, matchIndex - contextLength);
    const end = Math.min(text.length, matchIndex + contextLength);
    return text.slice(start, end).trim();
  }

  /**
   * Remove duplicate index items
   */
  private deduplicateIndexItems(items: Array<{
    type: 'tab' | 'exhibit' | 'form';
    number: string;
    pageNumber: number;
    text: string;
  }>): Array<{
    type: 'tab' | 'exhibit' | 'form';
    number: string;
    pageNumber: number;
    text: string;
  }> {
    const seen = new Set<string>();
    return items.filter(item => {
      const key = `${item.type}-${item.number}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
}

export const pdfTextExtractor = new PdfTextExtractor();