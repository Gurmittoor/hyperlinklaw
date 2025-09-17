import { db } from '../db';
import { ocrPages, indexItems, documents } from '@shared/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { HighlightGenerator } from './highlightGenerator';

interface IndexItem {
  id: string;
  text: string;
  pageNumber: number | null;
  confidence: number;
  type: 'exhibit' | 'tab' | 'motion' | 'affidavit' | 'section' | 'appendix' | 'schedule' | 'other';
  isManuallyEdited: boolean;
}

interface IndexDetectionResult {
  documentId: string;
  indexPages: number[];
  indexItems: IndexItem[];
  isAnalyzed: boolean;
  detectionMethod: string;
  confidence: number;
}

export class IndexDetector {
  
  /**
   * Detect and extract index items from the actual OCR text of a document
   */
  async detectRealIndex(documentId: string): Promise<IndexDetectionResult> {
    console.log(`🔍 INDEX DETECTION: Starting analysis for document ${documentId}`);
    
    try {
      // Get all OCR pages for this document, ordered by page number
      const pages = await db
        .select({
          pageNumber: ocrPages.pageNumber,
          text: ocrPages.extractedText,
          confidence: ocrPages.confidence
        })
        .from(ocrPages)
        .where(eq(ocrPages.documentId, documentId))
        .orderBy(ocrPages.pageNumber);

      if (pages.length === 0) {
        console.log(`❌ No OCR pages found for document ${documentId}`);
        return this.createEmptyResult(documentId);
      }

      console.log(`📄 Analyzing ${pages.length} pages of OCR text for index detection`);

      // Step 1: Find likely index/TOC pages (usually in first 30 pages)
      const indexPages = this.findIndexPages(pages);
      console.log(`📋 Found potential index pages: ${indexPages.join(', ')}`);

      // Step 2: Extract structured index items from these pages
      const indexItems = this.extractIndexItems(pages, indexPages);
      console.log(`📝 Extracted ${indexItems.length} index items`);

      // Step 3: Validate and enhance items by searching full document
      const validatedItems = await this.validateAndEnhanceItems(indexItems, pages);
      console.log(`✅ Validated ${validatedItems.length} index items`);

      const result: IndexDetectionResult = {
        documentId,
        indexPages,
        indexItems: validatedItems,
        isAnalyzed: true,
        detectionMethod: 'real_ocr_analysis',
        confidence: this.calculateOverallConfidence(validatedItems)
      };

      // Store results in database
      await this.storeIndexResults(documentId, validatedItems);

      // Generate visual highlights for the detected index items
      await HighlightGenerator.generateIndexHighlights(documentId);

      console.log(`🎉 INDEX DETECTION COMPLETE: Found ${validatedItems.length} items with ${result.confidence}% confidence`);
      return result;

    } catch (error) {
      console.error(`❌ Index detection failed for document ${documentId}:`, error);
      return this.createEmptyResult(documentId);
    }
  }

  /**
   * Find pages that likely contain index/table of contents
   */
  private findIndexPages(pages: any[]): number[] {
    const indexPages: number[] = [];
    
    // Check first 30 pages for index indicators
    const searchPages = pages.slice(0, Math.min(30, pages.length));
    
    for (const page of searchPages) {
      const text = page.text.toLowerCase();
      
      // Strong indicators of index/TOC pages
      const strongIndicators = [
        'table of contents',
        'index',
        'table of exhibits',
        'list of exhibits',
        'appendix list',
        'schedule of documents',
        'tab list',
        'exhibit list'
      ];

      // Weak indicators (need additional evidence)
      const weakIndicators = [
        'tab ',
        'exhibit ',
        'appendix ',
        'schedule ',
        'motion ',
        'affidavit '
      ];

      // Count indicator strength
      let score = 0;
      
      for (const indicator of strongIndicators) {
        if (text.includes(indicator)) {
          score += 10;
        }
      }
      
      for (const indicator of weakIndicators) {
        const matches = (text.match(new RegExp(indicator, 'g')) || []).length;
        if (matches >= 3) { // Multiple mentions suggest index page
          score += matches * 2;
        }
      }

      // Additional scoring for page number patterns
      const pageRefPattern = /page\s+\d+/gi;
      const pageRefs = (text.match(pageRefPattern) || []).length;
      if (pageRefs >= 5) {
        score += pageRefs;
      }

      // Numbered list patterns (1., 2., A., B., etc.)
      const numberedPattern = /^\s*\d+\./gm;
      const lettered = /^\s*[A-Z]\./gm;
      const numbered = (text.match(numberedPattern) || []).length;
      const letters = (text.match(lettered) || []).length;
      
      if (numbered >= 5 || letters >= 3) {
        score += Math.max(numbered, letters);
      }

      if (score >= 15) {
        indexPages.push(page.pageNumber);
        console.log(`📋 Page ${page.pageNumber} identified as index page (score: ${score})`);
      }
    }

    return indexPages;
  }

  /**
   * Extract structured index items from identified index pages
   */
  private extractIndexItems(pages: any[], indexPages: number[]): IndexItem[] {
    const items: IndexItem[] = [];
    
    // If no specific index pages found, analyze first 15 pages
    const pagesToAnalyze = indexPages.length > 0 
      ? pages.filter(p => indexPages.includes(p.pageNumber))
      : pages.slice(0, 15);

    for (const page of pagesToAnalyze) {
      const pageItems = this.extractItemsFromPage(page);
      items.push(...pageItems);
    }

    return this.deduplicateItems(items);
  }

  /**
   * Extract individual items from a single page
   */
  private extractItemsFromPage(page: any): IndexItem[] {
    const items: IndexItem[] = [];
    const text = page.text;
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length < 5) continue; // Skip very short lines

      const item = this.parseIndexLine(line, i, page.pageNumber);
      if (item) {
        items.push(item);
      }
    }

    return items;
  }

  /**
   * Parse a single line to extract index item information
   */
  private parseIndexLine(line: string, lineIndex: number, pageNumber: number): IndexItem | null {
    const originalLine = line;
    line = line.toLowerCase();

    // Patterns for different types of legal documents
    const patterns = [
      // Exhibits: "Exhibit A", "Exhibit 1", "Tab A", "Tab 1"
      {
        regex: /^(exhibit|tab)\s+([a-z0-9-]+)[:.]?\s*(.+?)(?:\s+page\s+(\d+))?$/i,
        type: 'exhibit' as const,
        confidence: 0.9
      },
      // Motions: "Motion for...", "Plaintiff's Motion..."
      {
        regex: /^(.*motion\s+(?:for|to|in)\s+.+?)(?:\s+page\s+(\d+))?$/i,
        type: 'motion' as const,
        confidence: 0.85
      },
      // Affidavits: "Affidavit of...", "Sworn Statement of..."
      {
        regex: /^(affidavit\s+of\s+.+?|sworn\s+statement\s+of\s+.+?)(?:\s+page\s+(\d+))?$/i,
        type: 'affidavit' as const,
        confidence: 0.85
      },
      // Appendices: "Appendix A", "Schedule 1"
      {
        regex: /^(appendix|schedule)\s+([a-z0-9-]+)[:.]?\s*(.+?)(?:\s+page\s+(\d+))?$/i,
        type: 'appendix' as const,
        confidence: 0.8
      },
      // Numbered sections: "1. Introduction", "2.1 Background"
      {
        regex: /^(\d+\.(?:\d+\.?)*)\s+(.+?)(?:\s+page\s+(\d+))?$/i,
        type: 'section' as const,
        confidence: 0.75
      },
      // Lettered sections: "A. Overview", "B. Analysis"
      {
        regex: /^([A-Z]\.)\s+(.+?)(?:\s+page\s+(\d+))?$/i,
        type: 'section' as const,
        confidence: 0.7
      }
    ];

    for (const pattern of patterns) {
      const match = originalLine.match(pattern.regex);
      if (match) {
        let itemText = match[1];
        let pageRef: number | null = null;

        // Extract title and page reference based on pattern
        if (pattern.type === 'exhibit' || pattern.type === 'appendix') {
          itemText = `${match[1]} ${match[2]}`;
          if (match[3]) itemText += `: ${match[3]}`;
          pageRef = match[4] ? parseInt(match[4]) : null;
        } else if (pattern.type === 'section') {
          itemText = `${match[1]} ${match[2]}`;
          pageRef = match[3] ? parseInt(match[3]) : null;
        } else {
          itemText = match[1];
          pageRef = match[2] ? parseInt(match[2]) : null;
        }

        // Clean up the text
        itemText = itemText.replace(/\s+/g, ' ').trim();
        
        // Skip if text is too generic or short
        if (itemText.length < 8 || this.isGenericText(itemText)) {
          continue;
        }

        return {
          id: `${pageNumber}-${lineIndex}`,
          text: itemText,
          pageNumber: pageRef,
          confidence: pattern.confidence,
          type: pattern.type,
          isManuallyEdited: false
        };
      }
    }

    return null;
  }

  /**
   * Check if text is too generic to be a useful index item
   */
  private isGenericText(text: string): boolean {
    const genericPhrases = [
      'page',
      'document',
      'filed',
      'dated',
      'court',
      'case',
      'number',
      'title',
      'name',
      'address',
      'phone',
      'email'
    ];

    const lowText = text.toLowerCase();
    return genericPhrases.some(phrase => 
      lowText === phrase || lowText.startsWith(phrase + ' ') || lowText.endsWith(' ' + phrase)
    );
  }

  /**
   * Remove duplicate items based on text similarity
   */
  private deduplicateItems(items: IndexItem[]): IndexItem[] {
    const unique: IndexItem[] = [];
    
    for (const item of items) {
      const isDuplicate = unique.some(existing => 
        this.textSimilarity(item.text, existing.text) > 0.8
      );
      
      if (!isDuplicate) {
        unique.push(item);
      }
    }

    return unique;
  }

  /**
   * Calculate text similarity between two strings
   */
  private textSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().replace(/[^\w\s]/g, '');
    const s2 = str2.toLowerCase().replace(/[^\w\s]/g, '');
    
    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;
    
    const words1 = s1.split(/\s+/);
    const words2 = s2.split(/\s+/);
    
    const intersection = words1.filter(word => words2.includes(word));
    const uniqueWords = new Set([...words1, ...words2]);
    const union = Array.from(uniqueWords);
    
    return intersection.length / union.length;
  }

  /**
   * Validate items by searching for references in the full document
   */
  private async validateAndEnhanceItems(items: IndexItem[], pages: any[]): Promise<IndexItem[]> {
    const validated: IndexItem[] = [];
    
    for (const item of items) {
      // If we don't have a page reference, try to find it
      if (!item.pageNumber) {
        const foundPage = this.searchForItemInDocument(item, pages);
        if (foundPage) {
          item.pageNumber = foundPage;
          item.confidence = Math.min(item.confidence + 0.1, 1.0);
        }
      }

      // Validate that the referenced page actually exists
      if (item.pageNumber) {
        const pageExists = pages.some(p => p.pageNumber === item.pageNumber);
        if (!pageExists) {
          // Try to find the correct page
          const correctedPage = this.searchForItemInDocument(item, pages);
          if (correctedPage) {
            item.pageNumber = correctedPage;
          } else {
            item.confidence *= 0.5; // Reduce confidence for missing page
          }
        }
      }

      // Only include items with reasonable confidence
      if (item.confidence >= 0.5) {
        validated.push(item);
      }
    }

    return validated.sort((a, b) => {
      // Sort by page number, then by confidence
      if (a.pageNumber && b.pageNumber) {
        return a.pageNumber - b.pageNumber;
      }
      if (a.pageNumber && !b.pageNumber) return -1;
      if (!a.pageNumber && b.pageNumber) return 1;
      return b.confidence - a.confidence;
    });
  }

  /**
   * Search for an item reference in the full document
   */
  private searchForItemInDocument(item: IndexItem, pages: any[]): number | null {
    const searchTerms = this.generateSearchTerms(item);
    
    for (const term of searchTerms) {
      for (const page of pages) {
        if (page.text.toLowerCase().includes(term.toLowerCase())) {
          return page.pageNumber;
        }
      }
    }
    
    return null;
  }

  /**
   * Generate search terms for finding an item in the document
   */
  private generateSearchTerms(item: IndexItem): string[] {
    const terms: string[] = [];
    
    // Use the full text
    terms.push(item.text);
    
    // Extract key parts
    if (item.type === 'exhibit') {
      const match = item.text.match(/exhibit\s+([a-z0-9-]+)/i);
      if (match) {
        terms.push(`exhibit ${match[1]}`);
        terms.push(match[1]);
      }
    }
    
    if (item.type === 'motion') {
      terms.push(item.text);
      // Also try without "motion"
      const withoutMotion = item.text.replace(/^.*motion\s+/i, '');
      if (withoutMotion !== item.text) {
        terms.push(withoutMotion);
      }
    }
    
    return terms;
  }

  /**
   * Calculate overall confidence for the index detection
   */
  private calculateOverallConfidence(items: IndexItem[]): number {
    if (items.length === 0) return 0;
    
    const avgConfidence = items.reduce((sum, item) => sum + item.confidence, 0) / items.length;
    const countBonus = Math.min(items.length / 10, 0.2); // Bonus for having many items
    
    return Math.min(avgConfidence + countBonus, 1.0) * 100;
  }

  /**
   * Store index results in indexItems database table
   */
  private async storeIndexResults(documentId: string, items: IndexItem[]): Promise<void> {
    try {
      console.log(`💾 Saving ${items.length} index items to database for document: ${documentId}`);
      
      // Clear existing index items for this document
      await db.delete(indexItems).where(eq(indexItems.documentId, documentId));
      
      if (items.length === 0) {
        console.log(`✅ No index items to save for document: ${documentId}`);
        return;
      }

      // Insert new index items
      const insertData = items.map((item, index) => ({
        documentId,
        tabNumber: this.extractItemNumber(item.text) || `${index + 1}`,
        tabTitle: item.text,
        pageNumber: item.pageNumber || 0,
        orderIndex: index + 1,
        confidence: item.confidence.toString(),
        rawText: item.text,
        boundingBox: null // Will be enhanced later with bounding box data
      }));

      await db.insert(indexItems).values(insertData);
      
      // Update document with index detection results
      await db
        .update(documents)
        .set({
          indexStatus: 'completed',
          indexCount: items.length,
          indexDetectedAt: new Date()
        })
        .where(eq(documents.id, documentId));

      console.log(`✅ Saved ${items.length} index items to database for document: ${documentId}`);
      
    } catch (error) {
      console.error(`❌ Failed to save index items for document ${documentId}:`, error);
      
      // Update document with failed status
      await db
        .update(documents)
        .set({
          indexStatus: 'failed',
          indexCount: 0,
          indexDetectedAt: new Date()
        })
        .where(eq(documents.id, documentId));
        
      throw error;
    }
  }

  /**
   * Extract item number/identifier from text
   */
  private extractItemNumber(text: string): string | null {
    const patterns = [
      /^(exhibit\s+[a-z0-9-]+)/i,
      /^(tab\s+[a-z0-9-]+)/i,
      /^(appendix\s+[a-z0-9-]+)/i,
      /^(schedule\s+[a-z0-9-]+)/i,
      /^(\d+\.(?:\d+\.?)*)/,
      /^([A-Z]\.)/
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Create empty result for failed detection
   */
  private createEmptyResult(documentId: string): IndexDetectionResult {
    return {
      documentId,
      indexPages: [],
      indexItems: [],
      isAnalyzed: false,
      detectionMethod: 'failed',
      confidence: 0
    };
  }
}

export const indexDetector = new IndexDetector();