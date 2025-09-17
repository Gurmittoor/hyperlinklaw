import mammoth from 'mammoth';
import fs from 'fs/promises';
import { db } from '../db';
import { ocrPages } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface DocxExtractionResult {
  success: boolean;
  pageCount: number;
  textContent?: string;
  error?: string;
  indexItems?: Array<{
    type: 'tab' | 'exhibit' | 'form' | 'other';
    number: string;
    text: string;
    pageNumber: number;
  }>;
}

export class DocxTextExtractor {
  
  /**
   * Extract text directly from DOCX without OCR
   * This is much faster and more accurate than OCR for text-based documents
   */
  async extractTextFromDocx(docxPath: string, documentId: string): Promise<DocxExtractionResult> {
    try {
      console.log(`📝 Extracting text directly from DOCX: ${docxPath}`);
      
      // Extract raw text and HTML from DOCX
      const buffer = await fs.readFile(docxPath);
      const textResult = await mammoth.extractRawText({ buffer });
      const htmlResult = await mammoth.convertToHtml({ buffer });
      
      if (textResult.messages && textResult.messages.length > 0) {
        console.log(`⚠️ DOCX extraction warnings:`, textResult.messages);
      }

      const fullText = textResult.value;
      console.log(`✅ Extracted ${fullText.length} characters from DOCX`);

      // Split text into logical pages (DOCX doesn't have real pages)
      const pages = this.splitTextIntoPages(fullText);
      console.log(`📄 Split into ${pages.length} logical pages`);

      // Save text as OCR pages in database for consistent processing
      await this.saveTextAsOcrPages(documentId, pages);

      // Analyze for index items (tabs, exhibits, forms)
      const indexItems = this.analyzeIndexItems(pages);
      console.log(`📋 Found ${indexItems.length} index items`);

      return {
        success: true,
        pageCount: pages.length,
        textContent: fullText,
        indexItems
      };

    } catch (error) {
      console.error(`❌ DOCX text extraction failed:`, error);
      return {
        success: false,
        pageCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Split DOCX text into logical pages based on content structure
   */
  private splitTextIntoPages(text: string): string[] {
    const pages: string[] = [];
    
    // Split by common page break indicators in legal documents
    const pageBreakPatterns = [
      /\f/g, // Form feed characters
      /Page \d+/g, // Explicit page numbers
      /\n\s*\n\s*\n/g, // Multiple line breaks
      /(?=Tab \d+)/g, // Start of new tabs
      /(?=Exhibit [A-Z])/g, // Start of new exhibits
      /(?=Form \d+)/g // Start of new forms
    ];

    let currentText = text;
    
    // Try to split by explicit page indicators first
    if (text.includes('Page ')) {
      const pageMatches = text.split(/(?=Page \d+)/);
      if (pageMatches.length > 1) {
        return pageMatches.filter(page => page.trim().length > 50);
      }
    }

    // Split by paragraphs and group into logical pages
    const paragraphs = text.split(/\n\s*\n/);
    let currentPage = '';
    let charCount = 0;
    const maxCharsPerPage = 2000; // Adjust based on typical legal document density

    for (const paragraph of paragraphs) {
      // If adding this paragraph would make the page too long, start a new page
      if (charCount + paragraph.length > maxCharsPerPage && currentPage.length > 0) {
        pages.push(currentPage.trim());
        currentPage = paragraph + '\n\n';
        charCount = paragraph.length;
      } else {
        currentPage += paragraph + '\n\n';
        charCount += paragraph.length;
      }
    }

    // Add the last page
    if (currentPage.trim().length > 0) {
      pages.push(currentPage.trim());
    }

    // Ensure we have at least one page
    if (pages.length === 0) {
      pages.push(text || 'Empty document');
    }

    return pages;
  }

  /**
   * Save extracted text as OCR pages for consistent processing pipeline
   */
  private async saveTextAsOcrPages(documentId: string, pages: string[]): Promise<void> {
    console.log(`💾 Saving ${pages.length} pages to database for document ${documentId}`);
    
    // Delete existing OCR pages for this document
    await db.delete(ocrPages).where(eq(ocrPages.documentId, documentId));

    // Insert new pages
    const ocrData = pages.map((text, index) => ({
      documentId,
      pageNumber: index + 1,
      text,
      confidence: 100, // Perfect confidence for direct text extraction
      boundingBoxes: null
    }));

    await db.insert(ocrPages).values(ocrData);
    console.log(`✅ Saved ${pages.length} pages as OCR data`);
  }

  /**
   * Analyze text for index items (tabs, exhibits, forms)
   */
  private analyzeIndexItems(pages: string[]): Array<{
    type: 'tab' | 'exhibit' | 'form' | 'other';
    number: string;
    text: string;
    pageNumber: number;
  }> {
    const indexItems: Array<{
      type: 'tab' | 'exhibit' | 'form' | 'other';
      number: string;
      text: string;
      pageNumber: number;
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
            text: context,
            pageNumber
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
    type: 'tab' | 'exhibit' | 'form' | 'other';
    number: string;
    text: string;
    pageNumber: number;
  }>): Array<{
    type: 'tab' | 'exhibit' | 'form' | 'other';
    number: string;
    text: string;
    pageNumber: number;
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

export const docxTextExtractor = new DocxTextExtractor();