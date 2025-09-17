import { db } from '../db';
import { ocrPages, indexItems, indexHighlights, documents } from '@shared/schema';
import { eq, and, lte } from 'drizzle-orm';
import { dynamicIndexDetector, type IndexDetectionResult, type DetectedIndexItem } from './dynamicIndexDetector';
import { highlightHyperlinkService } from './highlightHyperlinkService';

export interface AutoHighlightResult {
  success: boolean;
  documentId: string;
  highlightsCreated: number;
  itemsDetected: number;
  indexPages: number[];
  processingTimeMs: number;
  error?: string;
  detectedItems: DetectedIndexItem[];
}

export interface HighlightUpdate {
  documentId: string;
  pageNumber: number;
  highlightId: string;
  rect: { x: number; y: number; w: number; h: number };
  text: string;
  confidence: number;
  type: 'tab' | 'exhibit' | 'form' | 'motion' | 'affidavit' | 'schedule' | 'other';
}

/**
 * Enhanced auto-highlighting service that works with real OCR text and adapts to any document type
 * Provides yellow-on-dark contrast highlighting with AI-powered hyperlink generation
 */
export class AutoHighlightingService {
  
  /**
   * Monitor OCR progress and automatically create highlights for detected INDEX items
   */
  async autoHighlightDocument(documentId: string, options: {
    maxPagesToSearch?: number;
    minConfidenceThreshold?: number;
    enableAiHyperlinking?: boolean;
  } = {}): Promise<AutoHighlightResult> {
    
    const startTime = Date.now();
    const { 
      maxPagesToSearch = 15, 
      minConfidenceThreshold = 0.6,
      enableAiHyperlinking = true 
    } = options;
    
    console.log(`🎯 Auto-highlighting starting for document ${documentId}`);
    
    try {
      // Step 1: Detect INDEX items from OCR text
      const detectionResult = await dynamicIndexDetector.detectIndexItemsFromOcr(
        documentId, 
        maxPagesToSearch
      );

      if (detectionResult.itemsFound === 0) {
        console.log(`No INDEX items detected in document ${documentId}`);
        return {
          success: true,
          documentId,
          highlightsCreated: 0,
          itemsDetected: 0,
          indexPages: [],
          processingTimeMs: Date.now() - startTime,
          detectedItems: []
        };
      }

      console.log(`✨ Detected ${detectionResult.itemsFound} INDEX items, creating highlights...`);

      // Step 2: Create visual highlights for detected items
      const highlights = await this.createHighlightsForDetectedItems(
        documentId, 
        detectionResult.detectedItems,
        minConfidenceThreshold
      );

      console.log(`🖍️ Created ${highlights.length} visual highlights`);

      // Step 3: Generate AI-powered hyperlinks (if enabled)
      if (enableAiHyperlinking && highlights.length > 0) {
        console.log(`🤖 Starting AI hyperlink generation for ${highlights.length} highlights...`);
        
        // Process in background to avoid blocking
        this.generateHyperlinksInBackground(documentId, highlights);
      }

      return {
        success: true,
        documentId,
        highlightsCreated: highlights.length,
        itemsDetected: detectionResult.itemsFound,
        indexPages: detectionResult.indexPages,
        processingTimeMs: Date.now() - startTime,
        detectedItems: detectionResult.detectedItems
      };

    } catch (error) {
      console.error(`❌ Auto-highlighting failed for document ${documentId}:`, error);
      return {
        success: false,
        documentId,
        highlightsCreated: 0,
        itemsDetected: 0,
        indexPages: [],
        processingTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        detectedItems: []
      };
    }
  }

  /**
   * Create visual highlights with yellow-on-dark contrast for detected INDEX items
   */
  private async createHighlightsForDetectedItems(
    documentId: string, 
    detectedItems: DetectedIndexItem[],
    minConfidenceThreshold: number
  ): Promise<HighlightUpdate[]> {
    
    const highlights: HighlightUpdate[] = [];
    
    // Filter items by confidence threshold
    const qualifiedItems = detectedItems.filter(item => item.confidence >= minConfidenceThreshold);
    console.log(`📊 ${qualifiedItems.length}/${detectedItems.length} items meet confidence threshold (${minConfidenceThreshold})`);

    // Group items by page for efficient processing
    const itemsByPage = new Map<number, DetectedIndexItem[]>();
    for (const item of qualifiedItems) {
      if (!itemsByPage.has(item.pageHint)) {
        itemsByPage.set(item.pageHint, []);
      }
      itemsByPage.get(item.pageHint)!.push(item);
    }

    // Create highlights for each page
    for (const [pageNum, pageItems] of Array.from(itemsByPage)) {
      console.log(`📄 Creating highlights for ${pageItems.length} items on page ${pageNum}`);
      
      for (let i = 0; i < pageItems.length; i++) {
        const item = pageItems[i];
        
        // Calculate highlight position (evenly distributed on page)
        const rect = this.calculateHighlightRect(i, pageItems.length, item.type);
        
        // Store highlight in database using indexHighlights table
        const [savedHighlight] = await db
          .insert(indexHighlights)
          .values({
            documentId,
            pageNumber: pageNum,
            rect: rect,
            text: item.label,
            status: 'new'
          })
          .returning({ id: indexHighlights.id });

        const highlight: HighlightUpdate = {
          documentId,
          pageNumber: pageNum,
          highlightId: savedHighlight.id,
          rect,
          text: item.label,
          confidence: item.confidence,
          type: item.type
        };

        highlights.push(highlight);
        console.log(`✅ Created highlight for "${item.label.substring(0, 50)}..." on page ${pageNum}`);
      }
    }

    return highlights;
  }

  /**
   * Calculate optimal highlight rectangle with yellow-on-dark contrast positioning
   */
  private calculateHighlightRect(
    index: number, 
    totalItems: number, 
    itemType: DetectedIndexItem['type']
  ): { x: number; y: number; w: number; h: number } {
    
    // Base positioning - left-aligned with good spacing
    const baseX = 0.05; // 5% from left edge
    const baseWidth = 0.9; // 90% width for good visibility
    const itemHeight = 0.06; // 6% height per item
    
    // Vertical spacing calculation
    const availableHeight = 0.8; // 80% of page height available
    const spacing = totalItems > 1 ? availableHeight / (totalItems + 1) : 0.1;
    const startY = 0.15; // Start at 15% from top
    
    // Calculate Y position with even distribution
    const y = startY + (index * spacing);
    
    // Adjust width based on item type (longer items get more space)
    let width = baseWidth;
    if (['motion', 'affidavit', 'form'].includes(itemType)) {
      width = Math.min(0.95, baseWidth * 1.1); // Slightly wider for longer documents
    }

    return {
      x: baseX,
      y: Math.min(y, 0.85), // Ensure it doesn't go below 85% of page
      w: width,
      h: itemHeight
    };
  }

  /**
   * Generate AI-powered hyperlinks in background (non-blocking)
   */
  private async generateHyperlinksInBackground(
    documentId: string, 
    highlights: HighlightUpdate[]
  ): Promise<void> {
    
    // Process without await to avoid blocking main thread
    setTimeout(async () => {
      try {
        console.log(`🤖 Processing ${highlights.length} highlights for AI hyperlink generation...`);
        
        const result = await highlightHyperlinkService.processDocumentHighlights(documentId);
        
        console.log(`✅ AI hyperlink generation complete: ${result.processed} processed, ${result.linksFound} links created`);
        
        if (result.errors.length > 0) {
          console.warn(`⚠️ AI hyperlink generation warnings:`, result.errors);
        }
        
      } catch (error) {
        console.error(`❌ AI hyperlink generation failed:`, error);
      }
    }, 1000); // Wait 1 second to allow highlights to be saved
  }

  /**
   * Get current highlighting status for a document
   */
  async getHighlightingStatus(documentId: string): Promise<{
    totalHighlights: number;
    processedHighlights: number;
    pendingHighlights: number;
    linksGenerated: number;
    indexItemsDetected: number;
  }> {
    
    try {
      // Get highlight counts
      const highlights = await db
        .select({
          status: indexHighlights.status
        })
        .from(indexHighlights)
        .where(eq(indexHighlights.documentId, documentId));

      // Get index items count
      const indexItemCount = await db
        .select({ count: indexItems.id })
        .from(indexItems)
        .where(eq(indexItems.documentId, documentId));

      const totalHighlights = highlights.length;
      const processedHighlights = highlights.filter(h => h.status === 'linked').length;
      const pendingHighlights = highlights.filter(h => h.status === 'new').length;
      const linksGenerated = highlights.filter(h => h.status === 'linked').length;

      return {
        totalHighlights,
        processedHighlights,
        pendingHighlights,
        linksGenerated,
        indexItemsDetected: indexItemCount.length
      };

    } catch (error) {
      console.error('Error getting highlighting status:', error);
      return {
        totalHighlights: 0,
        processedHighlights: 0,
        pendingHighlights: 0,
        linksGenerated: 0,
        indexItemsDetected: 0
      };
    }
  }

  /**
   * Clear all auto-generated highlights for a document (cleanup)
   */
  async clearAutoHighlights(documentId: string): Promise<number> {
    try {
      const deleted = await db
        .delete(indexHighlights)
        .where(eq(indexHighlights.documentId, documentId))
        .returning({ id: indexHighlights.id });

      // Also clear detected index items
      await db
        .delete(indexItems)
        .where(eq(indexItems.documentId, documentId));

      console.log(`🗑️ Cleared ${deleted.length} auto-highlights for document ${documentId}`);
      return deleted.length;

    } catch (error) {
      console.error('Error clearing auto-highlights:', error);
      return 0;
    }
  }

  /**
   * Trigger auto-highlighting when OCR reaches sufficient pages
   */
  async checkAndTriggerAutoHighlighting(documentId: string): Promise<boolean> {
    try {
      // Check how many pages have been OCR'd
      const ocrCount = await db
        .select({ count: ocrPages.pageNumber })
        .from(ocrPages)
        .where(eq(ocrPages.documentId, documentId));

      const pagesProcessed = ocrCount.length;
      
      // Trigger auto-highlighting when we have at least 5 pages
      if (pagesProcessed >= 5) {
        console.log(`📊 ${pagesProcessed} pages processed, triggering auto-highlighting...`);
        
        const result = await this.autoHighlightDocument(documentId, {
          maxPagesToSearch: Math.min(pagesProcessed, 15),
          enableAiHyperlinking: true
        });

        return result.success;
      }

      return false;
    } catch (error) {
      console.error('Error checking auto-highlighting trigger:', error);
      return false;
    }
  }
}

export const autoHighlightingService = new AutoHighlightingService();