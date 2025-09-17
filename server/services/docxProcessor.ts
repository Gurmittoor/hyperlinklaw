import mammoth from 'mammoth';
import fs from 'fs/promises';
import { PDFDocument } from 'pdf-lib';

export interface DocxProcessingResult {
  success: boolean;
  pageCount: number;
  textContent?: string;
  pdfPath?: string;
  error?: string;
}

export class DocxProcessor {
  
  /**
   * Convert DOCX to PDF and extract text content
   * This allows DOCX files to be processed through the same OCR pipeline as PDFs
   */
  async processDocxFile(docxPath: string, outputDir: string = 'temp-uploads'): Promise<DocxProcessingResult> {
    try {
      console.log(`📄 Processing DOCX file: ${docxPath}`);
      
      // Extract text content from DOCX
      const textResult = await this.extractTextFromDocx(docxPath);
      if (!textResult.success) {
        return { success: false, pageCount: 0, error: textResult.error };
      }

      // Convert DOCX to PDF for consistent processing
      const pdfResult = await this.convertDocxToPdf(docxPath, outputDir);
      if (!pdfResult.success) {
        return { 
          success: false, 
          pageCount: 0, 
          error: pdfResult.error,
          textContent: textResult.text 
        };
      }

      console.log(`✅ DOCX processing complete: ${pdfResult.pageCount} pages`);
      
      return {
        success: true,
        pageCount: pdfResult.pageCount,
        textContent: textResult.text,
        pdfPath: pdfResult.pdfPath
      };

    } catch (error) {
      console.error(`❌ DOCX processing failed:`, error);
      return {
        success: false,
        pageCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Extract text content from DOCX using mammoth
   */
  private async extractTextFromDocx(docxPath: string): Promise<{ success: boolean; text?: string; error?: string }> {
    try {
      const buffer = await fs.readFile(docxPath);
      const result = await mammoth.extractRawText({ buffer });
      
      if (result.messages && result.messages.length > 0) {
        console.log(`⚠️ DOCX extraction warnings:`, result.messages);
      }

      return {
        success: true,
        text: result.value
      };

    } catch (error) {
      console.error(`❌ Text extraction from DOCX failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Convert DOCX to PDF for consistent processing pipeline
   * This creates a simple PDF with the extracted text content
   */
  private async convertDocxToPdf(docxPath: string, outputDir: string): Promise<{ success: boolean; pageCount: number; pdfPath?: string; error?: string }> {
    try {
      // Extract text first
      const textResult = await this.extractTextFromDocx(docxPath);
      if (!textResult.success || !textResult.text) {
        return { success: false, pageCount: 0, error: 'Failed to extract text for PDF conversion' };
      }

      // Create a simple PDF with the text content
      const pdfDoc = await PDFDocument.create();
      
      // Split text into pages (roughly 3000 characters per page)
      const textChunks = this.splitTextIntoPages(textResult.text, 3000);
      
      for (const chunk of textChunks) {
        const page = pdfDoc.addPage([612, 792]); // Standard letter size
        
        // Add text to page with simple formatting
        page.drawText(chunk, {
          x: 50,
          y: 750,
          size: 11,
          maxWidth: 500,
          lineHeight: 14
        });
      }

      // Save PDF
      const pdfBytes = await pdfDoc.save();
      const pdfPath = `${outputDir}/${Date.now()}-converted.pdf`;
      await fs.writeFile(pdfPath, pdfBytes);

      return {
        success: true,
        pageCount: textChunks.length,
        pdfPath
      };

    } catch (error) {
      console.error(`❌ DOCX to PDF conversion failed:`, error);
      return {
        success: false,
        pageCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Split text into manageable chunks for PDF pages
   */
  private splitTextIntoPages(text: string, maxCharsPerPage: number): string[] {
    const chunks: string[] = [];
    const lines = text.split('\n');
    let currentChunk = '';
    
    for (const line of lines) {
      // If adding this line would exceed the limit, start a new chunk
      if (currentChunk.length + line.length > maxCharsPerPage && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = line + '\n';
      } else {
        currentChunk += line + '\n';
      }
    }
    
    // Add the last chunk if it has content
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }
    
    // Ensure at least one page
    if (chunks.length === 0) {
      chunks.push('Empty document');
    }
    
    return chunks;
  }

  /**
   * Check if a file is a DOCX file based on MIME type
   */
  static isDocxFile(mimeType: string): boolean {
    return mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
}

export const docxProcessor = new DocxProcessor();