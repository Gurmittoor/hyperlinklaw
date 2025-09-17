import { db } from '../db';
import { ocrPages, indexItems, documents } from '@shared/schema';
import { eq, and, lte } from 'drizzle-orm';

export interface DetectedIndexItem {
  ordinal: number;
  label: string;
  rawRow: string;
  pageHint: number;
  confidence: number;
  type: 'tab' | 'exhibit' | 'form' | 'motion' | 'affidavit' | 'schedule' | 'other';
}

export interface IndexDetectionResult {
  documentId: string;
  itemsFound: number;
  indexPages: number[];
  detectedItems: DetectedIndexItem[];
  processingTimeMs: number;
  confidence: number;
}

/**
 * Enhanced INDEX detection that works with real OCR text and adapts to any document type
 * Replaces hardcoded approach with intelligent pattern recognition
 */
export class DynamicIndexDetector {
  
  /**
   * Continuously monitor OCR progress and detect INDEX items as pages are processed
   */
  async detectIndexItemsFromOcr(documentId: string, maxPagesToSearch = 15): Promise<IndexDetectionResult> {
    const startTime = Date.now();
    console.log(`🔍 Dynamic INDEX detection starting for document ${documentId} (searching first ${maxPagesToSearch} pages)`);
    
    try {
      // Get OCR pages that have been processed (up to maxPagesToSearch)
      const ocrPagesData = await db
        .select({
          pageNumber: ocrPages.pageNumber,
          extractedText: ocrPages.extractedText,
          correctedText: ocrPages.correctedText,
          confidence: ocrPages.confidence
        })
        .from(ocrPages)
        .where(
          and(
            eq(ocrPages.documentId, documentId),
            lte(ocrPages.pageNumber, maxPagesToSearch)
          )
        )
        .orderBy(ocrPages.pageNumber);

      if (ocrPagesData.length === 0) {
        console.log(`No OCR data available yet for document ${documentId}`);
        return this.createEmptyResult(documentId, Date.now() - startTime);
      }

      console.log(`📄 Analyzing ${ocrPagesData.length} OCR pages for INDEX patterns`);

      // Find pages that likely contain index/table of contents
      const indexPages = this.identifyIndexPages(ocrPagesData);
      console.log(`📑 Identified potential index pages: ${indexPages.join(', ')}`);

      // Extract items from identified index pages
      let allDetectedItems: DetectedIndexItem[] = [];
      
      for (const pageNum of indexPages) {
        const page = ocrPagesData.find(p => p.pageNumber === pageNum);
        if (page) {
          const pageItems = this.extractIndexItemsFromPage(page);
          allDetectedItems.push(...pageItems);
          console.log(`📋 Found ${pageItems.length} items on page ${pageNum}`);
        }
      }

      // Deduplicate and enhance items
      const uniqueItems = this.deduplicateAndEnhanceItems(allDetectedItems);
      console.log(`✨ After deduplication: ${uniqueItems.length} unique INDEX items`);

      // Calculate overall confidence
      const overallConfidence = this.calculateOverallConfidence(uniqueItems);

      // Store detected items in database
      if (uniqueItems.length > 0) {
        await this.storeDetectedItems(documentId, uniqueItems);
        console.log(`💾 Stored ${uniqueItems.length} INDEX items in database`);
      }

      const processingTime = Date.now() - startTime;
      
      return {
        documentId,
        itemsFound: uniqueItems.length,
        indexPages,
        detectedItems: uniqueItems,
        processingTimeMs: processingTime,
        confidence: overallConfidence
      };

    } catch (error) {
      console.error(`❌ Dynamic INDEX detection failed:`, error);
      return this.createEmptyResult(documentId, Date.now() - startTime);
    }
  }

  /**
   * Identify pages that likely contain index/table of contents
   */
  private identifyIndexPages(pages: any[]): number[] {
    const candidatePages: { pageNumber: number; score: number }[] = [];
    
    for (const page of pages) {
      const text = (page.correctedText || page.extractedText || '').toLowerCase();
      let score = 0;
      
      // Strong indicators of index pages
      const strongIndicators = [
        'table of contents',
        'index',
        'table of exhibits',
        'list of exhibits',
        'tab list',
        'exhibit list',
        'schedule of documents',
        'application record',
        'trial record',
        'case record'
      ];

      // Count strong indicators
      for (const indicator of strongIndicators) {
        if (text.includes(indicator)) {
          score += 15;
        }
      }

      // Numbered/lettered item patterns
      const numberedPatterns = [
        /^\s*\d+\.\s+/gm,           // "1. Item"
        /^\s*[A-Z]\.\s+/gm,         // "A. Item"
        /Tab\s+\d+/gi,              // "Tab 1"
        /Tab\s+[A-Z]/gi,            // "Tab A"
        /Exhibit\s+\d+/gi,          // "Exhibit 1"
        /Exhibit\s+[A-Z]/gi,        // "Exhibit A"
      ];

      let totalMatches = 0;
      for (const pattern of numberedPatterns) {
        const matches = text.match(pattern) || [];
        totalMatches += matches.length;
      }
      
      // Bonus points for multiple numbered items
      if (totalMatches >= 3) score += totalMatches * 3;
      if (totalMatches >= 5) score += 10; // Bonus for high item count

      // Legal document keywords
      const legalKeywords = [
        'pleading', 'affidavit', 'motion', 'application', 
        'transcript', 'order', 'endorsement', 'statement'
      ];
      
      for (const keyword of legalKeywords) {
        const keywordMatches = (text.match(new RegExp(keyword, 'gi')) || []).length;
        if (keywordMatches >= 2) score += keywordMatches * 2;
      }

      // Page reference patterns suggest index
      const pageRefMatches = (text.match(/page\s+\d+/gi) || []).length;
      if (pageRefMatches >= 3) score += pageRefMatches;

      candidatePages.push({ pageNumber: page.pageNumber, score });
    }

    // Sort by score and take top candidates
    candidatePages.sort((a, b) => b.score - a.score);
    
    // Return pages with score >= 10
    return candidatePages
      .filter(p => p.score >= 10)
      .slice(0, 5) // Max 5 index pages
      .map(p => p.pageNumber);
  }

  /**
   * Extract INDEX items from a single page
   */
  private extractIndexItemsFromPage(page: any): DetectedIndexItem[] {
    const text = page.correctedText || page.extractedText || '';
    const lines = text.split('\n');
    const items: DetectedIndexItem[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length < 5) continue; // Skip very short lines

      const item = this.parseIndexLine(line, page.pageNumber);
      if (item) {
        items.push(item);
      }
    }

    return items;
  }

  /**
   * Parse a single line to extract index item information
   */
  private parseIndexLine(line: string, pageHint: number): DetectedIndexItem | null {
    const originalLine = line;
    const lowerLine = line.toLowerCase();

    // Skip generic text that's not useful for hyperlinks
    if (this.isGenericText(lowerLine)) {
      return null;
    }

    let ordinal = 0;
    let label = '';
    let type: DetectedIndexItem['type'] = 'other';
    let confidence = 0.6;

    // Pattern 1: Numbered items "1. Item description"
    const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (numberedMatch) {
      ordinal = parseInt(numberedMatch[1]);
      label = numberedMatch[2].trim();
      type = 'other';
      confidence = 0.8;
    }

    // Pattern 2: Tab items "Tab 1" or "Tab A"
    const tabMatch = line.match(/Tab\s+([A-Z0-9]+)[\s\-—]*(.*)$/i);
    if (tabMatch) {
      ordinal = this.parseOrdinal(tabMatch[1]);
      label = tabMatch[2].trim() || `Tab ${tabMatch[1]}`;
      type = 'tab';
      confidence = 0.9;
    }

    // Pattern 3: Exhibit items "Exhibit A" or "Exhibit 1"
    const exhibitMatch = line.match(/Exhibit\s+([A-Z0-9]+)[\s\-—]*(.*)$/i);
    if (exhibitMatch) {
      ordinal = this.parseOrdinal(exhibitMatch[1]);
      label = exhibitMatch[2].trim() || `Exhibit ${exhibitMatch[1]}`;
      type = 'exhibit';
      confidence = 0.9;
    }

    // Pattern 4: Legal document types
    const legalPatterns = [
      { regex: /pleading|application|answer|reply/i, type: 'form' as const },
      { regex: /motion|application for/i, type: 'motion' as const },
      { regex: /affidavit|sworn\s+statement/i, type: 'affidavit' as const },
      { regex: /transcript|examination/i, type: 'other' as const },
      { regex: /order|endorsement/i, type: 'form' as const },
      { regex: /schedule|list/i, type: 'schedule' as const }
    ];

    for (const pattern of legalPatterns) {
      if (pattern.regex.test(line)) {
        if (!ordinal) {
          // Try to extract number from beginning of line
          const numberMatch = line.match(/^(\d+)/);
          ordinal = numberMatch ? parseInt(numberMatch[1]) : 0;
        }
        if (!label) {
          label = line.trim();
        }
        type = pattern.type;
        confidence = Math.max(confidence, 0.7);
        break;
      }
    }

    // Only return items that have some meaningful content
    if (ordinal > 0 || label.length > 10) {
      return {
        ordinal,
        label: label || originalLine.trim(),
        rawRow: originalLine.trim(),
        pageHint,
        confidence,
        type
      };
    }

    return null;
  }

  /**
   * Parse ordinal from string (handles both numbers and letters)
   */
  private parseOrdinal(str: string): number {
    // If it's a number, return it
    const num = parseInt(str);
    if (!isNaN(num)) return num;
    
    // If it's a letter, convert to number (A=1, B=2, etc.)
    if (str.length === 1 && str >= 'A' && str <= 'Z') {
      return str.charCodeAt(0) - 64;
    }
    if (str.length === 1 && str >= 'a' && str <= 'z') {
      return str.charCodeAt(0) - 96;
    }
    
    return 0;
  }

  /**
   * Check if text is too generic to be useful
   */
  private isGenericText(text: string): boolean {
    const genericPhrases = [
      'page', 'document', 'filed', 'dated', 'court', 'case number',
      'phone', 'email', 'address', 'name', 'title', 'copy', 'original'
    ];

    return genericPhrases.some(phrase => 
      text === phrase || text.startsWith(phrase + ' ') || text.endsWith(' ' + phrase)
    ) || text.length < 10;
  }

  /**
   * Deduplicate and enhance detected items
   */
  private deduplicateAndEnhanceItems(items: DetectedIndexItem[]): DetectedIndexItem[] {
    const unique: DetectedIndexItem[] = [];
    
    for (const item of items) {
      const isDuplicate = unique.some(existing => 
        this.textSimilarity(item.label, existing.label) > 0.8 ||
        (item.ordinal > 0 && item.ordinal === existing.ordinal)
      );
      
      if (!isDuplicate) {
        unique.push(item);
      }
    }

    // Sort by ordinal if available, otherwise by appearance order
    return unique.sort((a, b) => {
      if (a.ordinal > 0 && b.ordinal > 0) {
        return a.ordinal - b.ordinal;
      }
      return 0;
    });
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
    
    return intersection.length / uniqueWords.size;
  }

  /**
   * Calculate overall confidence based on detected items
   */
  private calculateOverallConfidence(items: DetectedIndexItem[]): number {
    if (items.length === 0) return 0;
    
    const avgConfidence = items.reduce((sum, item) => sum + item.confidence, 0) / items.length;
    
    // Boost confidence for finding multiple items
    const countBonus = Math.min(items.length * 0.05, 0.2);
    
    // Boost confidence for finding ordinal sequence
    const hasSequence = items.filter(item => item.ordinal > 0).length >= 3;
    const sequenceBonus = hasSequence ? 0.1 : 0;
    
    return Math.min(avgConfidence + countBonus + sequenceBonus, 1.0);
  }

  /**
   * Store detected items in database
   */
  private async storeDetectedItems(documentId: string, items: DetectedIndexItem[]): Promise<void> {
    // Clear existing items for this document
    await db.delete(indexItems).where(eq(indexItems.documentId, documentId));

    // Insert new items
    if (items.length > 0) {
      await db.insert(indexItems).values(
        items.map(item => ({
          documentId,
          ordinal: item.ordinal || null,
          label: item.label,
          rawRow: item.rawRow,
          pageHint: item.pageHint
        }))
      );
    }
  }

  /**
   * Create empty result when detection fails
   */
  private createEmptyResult(documentId: string, processingTimeMs: number): IndexDetectionResult {
    return {
      documentId,
      itemsFound: 0,
      indexPages: [],
      detectedItems: [],
      processingTimeMs,
      confidence: 0
    };
  }
}

export const dynamicIndexDetector = new DynamicIndexDetector();