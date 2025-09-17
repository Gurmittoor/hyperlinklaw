import { RealOcrProcessor } from './realOcrProcessor';
import { db } from '../db';
import { ocrPages, documents } from '@shared/schema';
import { eq, and, lte, count } from 'drizzle-orm';

export interface IndexAnalysisResult {
  totalTabs: number;
  totalExhibits: number;
  totalForms: number;
  indexItems: Array<{
    type: 'tab' | 'exhibit' | 'form';
    number: string;
    pageNumber: number;
    text: string;
  }>;
  analysisCompleted: boolean;
}

export class PriorityOcrProcessor {
  private realOcrProcessor: RealOcrProcessor;

  constructor(eventEmitter?: (documentId: string, eventType: string, data: any) => void) {
    this.realOcrProcessor = new RealOcrProcessor(eventEmitter);
  }

  /**
   * IMMEDIATE INDEX ANALYSIS: Process first 15 pages immediately for index extraction
   * Then continue background OCR for remaining pages
   */
  async processWithPriorityIndex(documentId: string): Promise<IndexAnalysisResult> {
    console.log(`🚀 PRIORITY INDEX ANALYSIS for document: ${documentId}`);
    
    try {
      // Get document info
      const [document] = await db.select().from(documents).where(eq(documents.id, documentId));
      if (!document) {
        throw new Error('Document not found');
      }

      console.log(`📄 Document: ${document.title} (${document.pageCount} pages)`);

      // STEP 1: Process first 15 pages IMMEDIATELY for index analysis
      console.log(`🔥 STEP 1: Processing first 15 pages for IMMEDIATE index analysis`);
      
      const firstPagesResult = await this.realOcrProcessor.processSpecificPages(
        documentId, 
        1, 
        Math.min(15, document.pageCount || 15)
      );

      if (!firstPagesResult.success) {
        throw new Error(`Failed to process first 15 pages: ${firstPagesResult.error}`);
      }

      // STEP 2: Analyze the first 15 pages for index structure
      console.log(`📋 STEP 2: Analyzing first 15 pages for index structure`);
      const indexAnalysis = await this.analyzeIndexStructure(documentId, 15);

      console.log(`✅ INDEX ANALYSIS COMPLETE:`);
      console.log(`   📑 Tabs found: ${indexAnalysis.totalTabs}`);
      console.log(`   📋 Exhibits found: ${indexAnalysis.totalExhibits}`);
      console.log(`   📄 Forms found: ${indexAnalysis.totalForms}`);
      console.log(`   🎯 Total index items: ${indexAnalysis.indexItems.length}`);

      // STEP 3: Start background processing for remaining pages
      if (document.pageCount && document.pageCount > 15) {
        console.log(`🔄 STEP 3: Starting background OCR for remaining ${document.pageCount - 15} pages`);
        
        // Continue processing remaining pages in background (don't await)
        this.processRemainingPagesBackground(documentId, 16, document.pageCount)
          .catch(error => {
            console.error(`❌ Background OCR failed for document ${documentId}:`, error);
          });
      }

      return indexAnalysis;

    } catch (error) {
      console.error(`❌ Priority index processing failed for ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Analyze OCR text from first 15 pages to extract index structure
   */
  private async analyzeIndexStructure(documentId: string, maxPage: number): Promise<IndexAnalysisResult> {
    console.log(`🔍 Analyzing index structure from pages 1-${maxPage}`);

    // Get OCR text from first pages
    const pages = await db.select()
      .from(ocrPages)
      .where(and(
        eq(ocrPages.documentId, documentId),
        lte(ocrPages.pageNumber, maxPage)
      ))
      .orderBy(ocrPages.pageNumber);

    const indexItems: Array<{
      type: 'tab' | 'exhibit' | 'form';
      number: string;
      pageNumber: number;
      text: string;
    }> = [];

    // Analyze each page for index elements
    for (const page of pages) {
      const text = page.text || '';
      const pageNumber = page.pageNumber;

      // Pattern matching for legal document elements
      const patterns = [
        // Tabs: "Tab 1", "Tab A", "Tab No. 1", "Tab No:"
        {
          regex: /(?:^|\n)\s*Tab\s+(?:No\.?\s*)?([A-Z0-9]+)/gim,
          type: 'tab' as const
        },
        // Exhibits: "Exhibit A", "Exhibit 1", "EXHIBIT A"
        {
          regex: /(?:^|\n)\s*EXHIBIT\s+([A-Z0-9]+)/gim,
          type: 'exhibit' as const
        },
        // Forms: "Form 8", "Form 10A", "FORM 20"
        {
          regex: /(?:^|\n)\s*FORM\s+([A-Z0-9]+)/gim,
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

    // Remove duplicates and count by type
    const uniqueItems = this.deduplicateIndexItems(indexItems);
    const totalTabs = uniqueItems.filter(item => item.type === 'tab').length;
    const totalExhibits = uniqueItems.filter(item => item.type === 'exhibit').length;
    const totalForms = uniqueItems.filter(item => item.type === 'form').length;

    return {
      totalTabs,
      totalExhibits,
      totalForms,
      indexItems: uniqueItems,
      analysisCompleted: true
    };
  }

  /**
   * Continue processing remaining pages in background
   */
  private async processRemainingPagesBackground(documentId: string, startPage: number, endPage: number): Promise<void> {
    console.log(`🔄 Background processing pages ${startPage}-${endPage} for document ${documentId}`);

    try {
      const result = await this.realOcrProcessor.processSpecificPages(documentId, startPage, endPage);
      
      if (result.success) {
        console.log(`✅ Background OCR completed for pages ${startPage}-${endPage}`);
        
        // Update document status to completed
        await db.update(documents)
          .set({ ocrStatus: 'completed' })
          .where(eq(documents.id, documentId));
        
      } else {
        console.error(`❌ Background OCR failed for pages ${startPage}-${endPage}:`, result.error);
      }
    } catch (error) {
      console.error(`❌ Background OCR error for pages ${startPage}-${endPage}:`, error);
    }
  }

  /**
   * Get current OCR progress
   */
  async getOcrProgress(documentId: string): Promise<{
    totalPages: number;
    processedPages: number;
    percentage: number;
    isProcessing: boolean;
  }> {
    // Get document info
    const [document] = await db.select().from(documents).where(eq(documents.id, documentId));
    if (!document) {
      throw new Error('Document not found');
    }

    // Count processed pages
    const processedCount = await db.select({ count: ocrPages.pageNumber })
      .from(ocrPages)
      .where(eq(ocrPages.documentId, documentId));

    const processedPages = processedCount.length;
    const totalPages = document.pageCount || 0;
    const percentage = totalPages > 0 ? Math.round((processedPages / totalPages) * 100) : 0;
    const isProcessing = document.ocrStatus === 'processing' || document.ocrStatus === 'queued';

    return {
      totalPages,
      processedPages,
      percentage,
      isProcessing
    };
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

export const priorityOcrProcessor = new PriorityOcrProcessor();