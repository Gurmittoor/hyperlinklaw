// Service to automatically generate visual review highlights from index detection and OCR data

import { db } from "../db";
import { reviewHighlights, ocrPages, indexItems } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { BoundingBoxComputer } from "./bboxComputer";

interface OcrWord {
  text: string;
  bbox: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export class HighlightGenerator {
  
  /**
   * Generate highlights for all detected index items in a document
   * Called after index detection completes
   */
  static async generateIndexHighlights(documentId: string): Promise<void> {
    try {
      console.log(`🎯 Generating index highlights for document ${documentId}...`);
      
      // Get all index items for this document
      const items = await db
        .select()
        .from(indexItems)
        .where(eq(indexItems.documentId, documentId))
        .orderBy(indexItems.orderIndex);
      
      if (!items.length) {
        console.log('No index items found, skipping highlight generation');
        return;
      }
      
      // Clear existing index-row highlights for this document
      await db
        .delete(reviewHighlights)
        .where(and(
          eq(reviewHighlights.documentId, documentId),
          eq(reviewHighlights.kind, 'index-row')
        ));
      
      let highlightsCreated = 0;
      
      // Generate highlights for each index item
      for (const item of items) {
        const pageNum = item.pageNumber;
        if (!pageNum) continue;
        
        // Get OCR data for the page containing this index item
        const ocrData = await db
          .select({
            wordsJson: ocrPages.wordsJson,
            extractedText: ocrPages.extractedText
          })
          .from(ocrPages)
          .where(and(
            eq(ocrPages.documentId, documentId),
            eq(ocrPages.pageNumber, pageNum)
          ))
          .limit(1);
        
        if (!ocrData.length) {
          console.log(`No OCR data found for page ${pageNum}, skipping`);
          continue;
        }
        
        const words: OcrWord[] = ocrData[0].wordsJson as OcrWord[] || [];
        if (!words.length) {
          console.log(`No word data found for page ${pageNum}, creating fallback highlight`);
          
          // Create a fallback highlight at the top of the page
          await db.insert(reviewHighlights).values({
            documentId,
            pageNumber: pageNum,
            bbox: { x: 0.05, y: 0.05, width: 0.9, height: 0.05 },
            kind: 'index-row',
            label: `${item.tabNumber}: ${item.tabTitle}`,
            sourceItemId: item.id,
            confidence: 0.5
          });
          
          highlightsCreated++;
          continue;
        }
        
        // Compute bounding box for this index row
        const bbox = BoundingBoxComputer.generateIndexRowBbox(
          words,
          item.tabNumber || '',
          item.tabTitle || ''
        );
        
        if (bbox) {
          await db.insert(reviewHighlights).values({
            documentId,
            pageNumber: pageNum,
            bbox,
            kind: 'index-row',
            label: `${item.tabNumber}: ${item.tabTitle}`,
            sourceItemId: item.id,
            confidence: 0.8
          });
          
          highlightsCreated++;
          console.log(`✅ Created highlight for ${item.tabNumber}: ${item.tabTitle} on page ${pageNum}`);
        } else {
          console.log(`⚠️ Could not generate bbox for ${item.tabNumber}: ${item.tabTitle} on page ${pageNum}`);
          
          // Create a fallback highlight
          await db.insert(reviewHighlights).values({
            documentId,
            pageNumber: pageNum,
            bbox: { x: 0.05, y: 0.1, width: 0.9, height: 0.03 },
            kind: 'index-row',
            label: `${item.tabNumber}: ${item.tabTitle}`,
            sourceItemId: item.id,
            confidence: 0.3
          });
          
          highlightsCreated++;
        }
      }
      
      console.log(`🎯 Generated ${highlightsCreated} index highlights for document ${documentId}`);
      
    } catch (error) {
      console.error('Error generating index highlights:', error);
    }
  }
  
  /**
   * Generate highlights for link candidates (hyperlink targets found in briefs)
   * Called after hyperlink resolution completes
   */
  static async generateCandidateHighlights(documentId: string, candidateMatches: Array<{
    text: string;
    pageNumber: number;
    indexItemId?: string;
    confidence: number;
  }>): Promise<void> {
    try {
      console.log(`🔗 Generating candidate highlights for document ${documentId}...`);
      
      if (!candidateMatches.length) {
        console.log('No candidate matches provided, skipping');
        return;
      }
      
      // Clear existing candidate-link highlights for this document
      await db
        .delete(reviewHighlights)
        .where(and(
          eq(reviewHighlights.documentId, documentId),
          eq(reviewHighlights.kind, 'candidate-link')
        ));
      
      let highlightsCreated = 0;
      
      // Generate highlights for each candidate
      for (const candidate of candidateMatches) {
        // Get OCR data for the page
        const ocrData = await db
          .select({
            wordsJson: ocrPages.wordsJson
          })
          .from(ocrPages)
          .where(and(
            eq(ocrPages.documentId, documentId),
            eq(ocrPages.pageNumber, candidate.pageNumber)
          ))
          .limit(1);
        
        if (!ocrData.length) continue;
        
        const words: OcrWord[] = ocrData[0].wordsJson as OcrWord[] || [];
        if (!words.length) continue;
        
        // Compute bounding box for this candidate match
        const bbox = BoundingBoxComputer.generateCandidateBbox(words, candidate.text);
        
        if (bbox) {
          await db.insert(reviewHighlights).values({
            documentId,
            pageNumber: candidate.pageNumber,
            bbox,
            kind: 'candidate-link',
            label: `Link candidate: ${candidate.text.substring(0, 50)}...`,
            sourceItemId: candidate.indexItemId,
            confidence: candidate.confidence
          });
          
          highlightsCreated++;
          console.log(`✅ Created candidate highlight for "${candidate.text.substring(0, 30)}..." on page ${candidate.pageNumber}`);
        }
      }
      
      console.log(`🔗 Generated ${highlightsCreated} candidate highlights for document ${documentId}`);
      
    } catch (error) {
      console.error('Error generating candidate highlights:', error);
    }
  }
  
  /**
   * Clear all highlights for a document (useful for regeneration)
   */
  static async clearHighlights(documentId: string, kind?: 'index-row' | 'candidate-link' | 'custom'): Promise<void> {
    try {
      let query = db
        .delete(reviewHighlights)
        .where(eq(reviewHighlights.documentId, documentId));
      
      if (kind) {
        query = db
          .delete(reviewHighlights)
          .where(and(
            eq(reviewHighlights.documentId, documentId),
            eq(reviewHighlights.kind, kind)
          ));
      }
      
      await query;
      console.log(`🧹 Cleared ${kind || 'all'} highlights for document ${documentId}`);
    } catch (error) {
      console.error('Error clearing highlights:', error);
    }
  }
  
  /**
   * Generate highlight for a specific exhibit
   */
  static async generateExhibitHighlight(documentId: string, exhibit: any): Promise<void> {
    try {
      console.log(`🏷️ Generating highlight for exhibit ${exhibit.exhibitLabel} on page ${exhibit.pageNumber}`);
      
      const pageNum = exhibit.pageNumber;
      if (!pageNum) {
        console.log(`No page number for exhibit ${exhibit.exhibitLabel}, skipping`);
        return;
      }

      // Get OCR data for the page containing this exhibit
      const ocrData = await db
        .select({
          wordsJson: ocrPages.wordsJson,
          extractedText: ocrPages.extractedText
        })
        .from(ocrPages)
        .where(and(
          eq(ocrPages.documentId, documentId),
          eq(ocrPages.pageNumber, pageNum)
        ))
        .limit(1);

      if (!ocrData.length) {
        console.log(`No OCR data found for page ${pageNum}, skipping exhibit ${exhibit.exhibitLabel}`);
        return;
      }

      const words: OcrWord[] = ocrData[0].wordsJson as OcrWord[] || [];
      if (!words.length) {
        console.log(`No word data found for page ${pageNum}, creating fallback highlight for exhibit ${exhibit.exhibitLabel}`);
        
        // Create a fallback highlight at the top of the page
        await db.insert(reviewHighlights).values({
          documentId,
          pageNumber: pageNum,
          bbox: { x: 0.1, y: 0.05, width: 0.3, height: 0.05 },
          kind: 'exhibit',
          confidence: 0.5,
          label: `Exhibit ${exhibit.exhibitLabel}`,
          source_item_id: exhibit.id
        });
        return;
      }

      // Try to find the exhibit label text (like "Exhibit A", "EXHIBIT B", etc.)
      const exhibitText = `exhibit ${exhibit.exhibitLabel.toLowerCase()}`;
      const bbox = BoundingBoxComputer.generateCandidateBbox(words, exhibitText);
      
      if (bbox) {
        await db.insert(reviewHighlights).values({
          documentId,
          pageNumber: pageNum,
          bbox,
          kind: 'exhibit',
          confidence: 0.8,
          label: `Exhibit ${exhibit.exhibitLabel}`,
          source_item_id: exhibit.id
        });
        
        console.log(`✅ Generated highlight for exhibit ${exhibit.exhibitLabel} on page ${pageNum}`);
      } else {
        console.log(`Could not find exhibit text for ${exhibit.exhibitLabel}, creating fallback highlight`);
        
        // Create a fallback highlight
        await db.insert(reviewHighlights).values({
          documentId,
          pageNumber: pageNum,
          bbox: { x: 0.1, y: 0.05, width: 0.3, height: 0.05 },
          kind: 'exhibit',
          confidence: 0.3,
          label: `Exhibit ${exhibit.exhibitLabel}`,
          source_item_id: exhibit.id
        });
      }
      
    } catch (error) {
      console.error(`❌ Error generating exhibit highlight for ${exhibit.exhibitLabel}:`, error);
      throw error;
    }
  }

  /**
   * Get highlight statistics for a document
   */
  static async getHighlightStats(documentId: string): Promise<{
    indexRows: number;
    candidateLinks: number;
    custom: number;
    total: number;
  }> {
    try {
      const highlights = await db
        .select({ kind: reviewHighlights.kind })
        .from(reviewHighlights)
        .where(eq(reviewHighlights.documentId, documentId));
      
      const stats = {
        indexRows: highlights.filter(h => h.kind === 'index-row').length,
        candidateLinks: highlights.filter(h => h.kind === 'candidate-link').length,
        custom: highlights.filter(h => h.kind === 'custom').length,
        total: highlights.length
      };
      
      return stats;
    } catch (error) {
      console.error('Error getting highlight stats:', error);
      return { indexRows: 0, candidateLinks: 0, custom: 0, total: 0 };
    }
  }
}

// HighlightGenerator already exported above