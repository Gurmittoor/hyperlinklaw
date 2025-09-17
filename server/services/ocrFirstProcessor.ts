import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { db } from "../db";
import { documents, ocrCache } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import type { Document, InsertOcrCache } from "@shared/schema";

/**
 * OCR-First Document Processing Architecture
 * 
 * This service implements the enhanced workflow:
 * 1. Upload Stage: Document uploaded → Immediate full-document OCR → Store cached results
 * 2. Processing Stage: All operations use pre-processed OCR text from cache
 * 3. Performance: Fast, reliable processing since text extraction is complete upfront
 */
export class OcrFirstProcessor {
  
  /**
   * Main entry point: Process OCR immediately after document upload
   * This ensures all subsequent operations work with cached OCR data
   */
  async processDocumentOcr(document: Document): Promise<void> {
    console.log(`🔍 Starting OCR-first processing for document: ${document.title}`);
    
    // Update document status to processing
    await this.updateDocumentStatus(document.id, 'processing', 0);
    
    try {
      // Extract text from all pages and cache results
      const ocrResults = await this.extractAllPagesOcr(document);
      
      // Store OCR results in database cache
      await this.storeOcrCache(document.id, ocrResults);
      
      // Update document status to completed
      await this.updateDocumentStatus(document.id, 'completed', 100);
      
      console.log(`✅ OCR-first processing completed for ${document.title}: ${ocrResults.length} pages cached`);
      
    } catch (error) {
      console.error(`❌ OCR-first processing failed for ${document.title}:`, error);
      await this.updateDocumentStatus(document.id, 'failed', 0, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
  
  /**
   * Extract OCR text from all pages using enhanced OCR system
   * Returns page-by-page OCR results with confidence scores
   */
  private async extractAllPagesOcr(document: Document): Promise<PageOcrResult[]> {
    const pdfPath = document.storagePath;
    
    // Get page count first
    const pageCount = await this.getPageCount(pdfPath);
    console.log(`📄 Document ${document.title} has ${pageCount} pages - processing all pages with OCR`);
    
    const ocrResults: PageOcrResult[] = [];
    
    // Process each page with OCR
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      console.log(`🔍 Processing page ${pageNum}/${pageCount} with enhanced OCR...`);
      
      const pageResult = await this.extractPageOcr(pdfPath, pageNum);
      ocrResults.push({
        pageNumber: pageNum,
        ocrText: pageResult.text,
        confidence: pageResult.confidence,
        metadata: pageResult.metadata
      });
      
      // Update progress
      const progress = Math.floor((pageNum / pageCount) * 100);
      await this.updateDocumentStatus(document.id, 'processing', progress);
    }
    
    return ocrResults;
  }
  
  /**
   * Extract OCR text from a single page using enhanced Python OCR system
   */
  private async extractPageOcr(pdfPath: string, pageNumber: number): Promise<{
    text: string;
    confidence: number;
    metadata: any;
  }> {
    return new Promise((resolve, reject) => {
      // Use our enhanced OCR system for page extraction
      const pythonScript = path.join(process.cwd(), 'server/services/pageOcrExtractor.py');
      const python = spawn('python3', [pythonScript, pdfPath, pageNumber.toString()], {
        cwd: process.cwd(),
        env: { ...process.env, PYTHONPATH: process.cwd() }
      });

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          console.warn(`Page OCR extraction returned code ${code}: ${stderr}`);
          // Fallback to basic text extraction for this page
          resolve({
            text: `[OCR failed for page ${pageNumber}]`,
            confidence: 0.0,
            metadata: { error: stderr, fallback: true }
          });
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve({
            text: result.text || '',
            confidence: result.confidence || 0.0,
            metadata: result.metadata || {}
          });
        } catch (parseError) {
          console.warn(`Failed to parse page OCR results: ${parseError}`);
          resolve({
            text: `[OCR parse failed for page ${pageNumber}]`,
            confidence: 0.0,
            metadata: { error: parseError instanceof Error ? parseError.message : String(parseError), fallback: true }
          });
        }
      });

      python.on('error', (error) => {
        console.warn(`Failed to spawn page OCR process: ${error}`);
        resolve({
          text: `[OCR process failed for page ${pageNumber}]`,
          confidence: 0.0,
          metadata: { error: error.message, fallback: true }
        });
      });

      // Timeout per page
      setTimeout(() => {
        python.kill();
        resolve({
          text: `[OCR timeout for page ${pageNumber}]`,
          confidence: 0.0,
          metadata: { error: 'timeout', fallback: true }
        });
      }, 30000); // 30 seconds per page
    });
  }
  
  /**
   * Get PDF page count using pdf-lib
   */
  private async getPageCount(pdfPath: string): Promise<number> {
    try {
      const { PDFDocument } = await import('pdf-lib');
      const pdfBytes = fs.readFileSync(pdfPath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      return pdfDoc.getPageCount();
    } catch (error) {
      console.warn(`Failed to get page count for ${pdfPath}:`, error);
      return 1; // Default to 1 page if we can't determine
    }
  }
  
  /**
   * Store OCR results in database cache for fast retrieval
   */
  private async storeOcrCache(documentId: string, ocrResults: PageOcrResult[]): Promise<void> {
    console.log(`💾 Storing OCR cache for ${ocrResults.length} pages...`);
    
    // Clear any existing cache for this document
    await db.delete(ocrCache).where(eq(ocrCache.documentId, documentId));
    
    // Insert new OCR cache entries
    const cacheEntries: InsertOcrCache[] = ocrResults.map(result => ({
      documentId,
      pageNumber: result.pageNumber,
      ocrText: result.ocrText,
      confidence: result.confidence.toString(),
      metadata: result.metadata,
      ocrEngine: 'enhanced-pytesseract',
      language: 'eng'
    }));
    
    if (cacheEntries.length > 0) {
      await db.insert(ocrCache).values(cacheEntries);
      console.log(`✅ OCR cache stored successfully: ${cacheEntries.length} pages`);
    }
  }
  
  /**
   * Retrieve cached OCR text for a specific page
   */
  async getCachedOcrText(documentId: string, pageNumber: number): Promise<string | null> {
    const [cached] = await db
      .select()
      .from(ocrCache)
      .where(and(
        eq(ocrCache.documentId, documentId),
        eq(ocrCache.pageNumber, pageNumber)
      ));
    
    return cached?.ocrText || null;
  }
  
  /**
   * Retrieve all cached OCR text for a document
   */
  async getAllCachedOcrText(documentId: string): Promise<Map<number, string>> {
    const cached = await db
      .select()
      .from(ocrCache)
      .where(eq(ocrCache.documentId, documentId))
      .orderBy(ocrCache.pageNumber);
    
    const ocrMap = new Map<number, string>();
    cached.forEach(entry => {
      ocrMap.set(entry.pageNumber, entry.ocrText);
    });
    
    return ocrMap;
  }
  
  /**
   * Check if OCR cache exists for a document
   */
  async isOcrCached(documentId: string): Promise<boolean> {
    const result = await db
      .select({ count: sql`count(*)` })
      .from(ocrCache)
      .where(eq(ocrCache.documentId, documentId));
    
    return Number(result[0]?.count || 0) > 0;
  }
  
  /**
   * Update document OCR processing status
   */
  private async updateDocumentStatus(
    documentId: string,
    status: 'processing' | 'completed' | 'failed',
    progress: number,
    error?: string
  ): Promise<void> {
    await db
      .update(documents)
      .set({
        ocrStatus: status,
        parseProgress: progress,
        lastError: error || null,
        updatedAt: new Date()
      })
      .where(eq(documents.id, documentId));
  }
}

interface PageOcrResult {
  pageNumber: number;
  ocrText: string;
  confidence: number;
  metadata: any;
}

export const ocrFirstProcessor = new OcrFirstProcessor();