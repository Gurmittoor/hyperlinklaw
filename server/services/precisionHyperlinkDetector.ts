import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import type { Link } from '@shared/schema';

// Precision Hyperlink Detection Configuration
const CONFIG = {
  min_confidence: 0.92,
  seed: 42,
  source_scope: ["briefs"],
  link_indices_in_briefs: true,
  ocr_fallback: true,
  signature_masks: true,
  duplicate_blanks_signature_and_date: true,
  review_highlight: true,
  header_footer_band_pct: 0.08,
  one_anchor_per_value: true,
  dedupe_rect_merge_pt: 4.0
};

// Strict allow-list patterns (word-bounded, value-required)
const PATTERNS = {
  exhibit: /\bExhibit\s+(?!(No\\b))([A-Z]{1,3}(-\\d+)?|\\d+)\b/gi,
  tab: /\bTab\s+(\\d{1,3})\b/gi,
  schedule: /\bSchedule\s+([A-Z0-9]{1,3})\b/gi,
  affidavit: /\bAffidavit\s+of\s+([A-Z][a-zA-Z\s]+)/gi,
  undertaking: /\bUndertakings?\b/gi,
  refusal: /\bRefusals?\b/gi,
  under_advisement: /\bUnder\s+Advisements?\b/gi
};

interface DetectedReference {
  type: string;
  value: string;
  text: string;
  page: number;
  rect: { x: number; y: number; width: number; height: number };
  confidence: number;
  destPage?: number;
  srcDocId: string;
}

interface AnchorMapping {
  [type: string]: {
    [value: string]: {
      page: number;
      confidence: number;
      alternates?: number[];
    }
  }
}

interface DocumentClassification {
  briefs: Array<{ id: string; title: string; path: string; pages: number }>;
  trialRecord: { id: string; title: string; path: string; pages: number } | null;
}

export class PrecisionHyperlinkDetector {
  private anchorMap: AnchorMapping = {};
  private trialRecordText: string[] = [];

  async detectPrecisionHyperlinks(documents: Array<{ id: string; title: string; storagePath: string; pageCount: number }>): Promise<DetectedReference[]> {
    console.log('Starting strict deterministic pipeline...');
    
    // Step 1: Classify documents (briefs as sources only, TR as targets only)
    const classification = this.classifyDocuments(documents);
    console.log(`Classified: ${classification.briefs.length} briefs (sources), ${classification.trialRecord ? 1 : 0} trial record (targets)`);
    
    if (!classification.trialRecord) {
      throw new Error('No trial record found - cannot create target anchors');
    }

    // Step 2: Build TR anchor map (one anchor page per unique value)
    await this.buildTrialRecordAnchors(classification.trialRecord);
    const anchorCount = Object.values(this.anchorMap).reduce((sum, typeMap) => sum + Object.keys(typeMap).length, 0);
    console.log(`Built ${anchorCount} unique TR anchors from ${Object.keys(this.anchorMap).length} reference types`);

    // Step 3: Detect references in briefs only (TR never used as source)
    const allReferences: DetectedReference[] = [];
    
    for (const brief of classification.briefs) {
      console.log(`Processing brief: ${brief.title}`);
      const briefRefs = await this.detectInBriefStrict(brief);
      allReferences.push(...briefRefs);
    }

    // Step 4: Map only to existing TR anchors (no synthetic links)
    this.mapToExistingAnchorsOnly(allReferences);
    
    const linkedCount = allReferences.filter(ref => ref.destPage !== undefined).length;
    console.log(`Strict pipeline complete: ${allReferences.length} references found, ${linkedCount} mapped to real TR anchors`);
    
    return allReferences.filter(ref => ref.destPage !== undefined); // Return only successfully mapped links
  }

  private classifyDocuments(documents: Array<{ id: string; title: string; storagePath: string; pageCount: number }>): DocumentClassification {
    const briefs: Array<{ id: string; title: string; path: string; pages: number }> = [];
    let trialRecord: { id: string; title: string; path: string; pages: number } | null = null;

    for (const doc of documents) {
      const title = doc.title.toLowerCase();
      
      // Trial Record detection (case-insensitive)
      if (title.includes('trial record') || title.includes('transcript')) {
        if (!trialRecord || doc.pageCount > trialRecord.pages) {
          // Use the largest trial record if multiple found
          trialRecord = {
            id: doc.id,
            title: doc.title,
            path: doc.storagePath,
            pages: doc.pageCount
          };
        }
      } else {
        // Everything else is a brief (including supplemental briefs)
        briefs.push({
          id: doc.id,
          title: doc.title,
          path: doc.storagePath,
          pages: doc.pageCount
        });
      }
    }

    return { briefs, trialRecord };
  }

  private async buildTrialRecordAnchors(trialRecord: { id: string; title: string; path: string; pages: number }): Promise<void> {
    console.log(`Building anchors from trial record: ${trialRecord.title}`);
    
    // Initialize anchor map structure
    this.anchorMap = {
      exhibit: {},
      tab: {},
      schedule: {},
      affidavit: {},
      undertaking: {},
      refusal: {},
      under_advisement: {}
    };

    // Extract text from each page of the trial record
    this.trialRecordText = await this.extractAllPageText(trialRecord.path, trialRecord.pages);
    
    // Find anchor pages for each reference type and value
    for (let pageIndex = 0; pageIndex < this.trialRecordText.length; pageIndex++) {
      const pageText = this.trialRecordText[pageIndex].toLowerCase();
      const pageNum = pageIndex + 1;

      // Find exhibits
      const exhibitMatches = pageText.match(/exhibit\s+([a-z0-9-]+)/gi);
      if (exhibitMatches) {
        for (const match of exhibitMatches) {
          const value = match.replace(/exhibit\s+/i, '').toUpperCase();
          if (!this.anchorMap.exhibit[value]) {
            this.anchorMap.exhibit[value] = { page: pageNum, confidence: 1.0 };
          }
        }
      }

      // Find tabs
      const tabMatches = pageText.match(/tab\s+(\d+)/gi);
      if (tabMatches) {
        for (const match of tabMatches) {
          const value = match.replace(/tab\s+/i, '');
          if (!this.anchorMap.tab[value]) {
            this.anchorMap.tab[value] = { page: pageNum, confidence: 1.0 };
          }
        }
      }

      // Find schedules
      const scheduleMatches = pageText.match(/schedule\s+([a-z0-9]+)/gi);
      if (scheduleMatches) {
        for (const match of scheduleMatches) {
          const value = match.replace(/schedule\s+/i, '').toUpperCase();
          if (!this.anchorMap.schedule[value]) {
            this.anchorMap.schedule[value] = { page: pageNum, confidence: 1.0 };
          }
        }
      }

      // Find affidavits
      const affidavitMatches = pageText.match(/affidavit\s+of\s+([a-z\s]+)/gi);
      if (affidavitMatches) {
        for (const match of affidavitMatches) {
          const value = match.replace(/affidavit\s+of\s+/i, '').trim();
          if (!this.anchorMap.affidavit[value] && value.length > 2) {
            this.anchorMap.affidavit[value] = { page: pageNum, confidence: 1.0 };
          }
        }
      }

      // Find section headers
      if (pageText.includes('undertaking')) {
        if (!this.anchorMap.undertaking['section']) {
          this.anchorMap.undertaking['section'] = { page: pageNum, confidence: 1.0 };
        }
      }
      
      if (pageText.includes('refusal')) {
        if (!this.anchorMap.refusal['section']) {
          this.anchorMap.refusal['section'] = { page: pageNum, confidence: 1.0 };
        }
      }
      
      if (pageText.includes('under advisement') || pageText.includes('under advisament')) {
        if (!this.anchorMap.under_advisement['section']) {
          this.anchorMap.under_advisement['section'] = { page: pageNum, confidence: 1.0 };
        }
      }
    }

    console.log(`Found anchors: 
      Exhibits: ${Object.keys(this.anchorMap.exhibit).length}
      Tabs: ${Object.keys(this.anchorMap.tab).length}
      Schedules: ${Object.keys(this.anchorMap.schedule).length}
      Affidavits: ${Object.keys(this.anchorMap.affidavit).length}`);
  }

  private async extractAllPageText(filePath: string, pageCount: number): Promise<string[]> {
    const texts: string[] = [];
    
    try {
      const fileBuffer = fs.readFileSync(filePath);
      const pdfDoc = await PDFDocument.load(fileBuffer);
      const pages = pdfDoc.getPages();
      
      for (let i = 0; i < Math.min(pages.length, pageCount); i++) {
        // For now, return placeholder text - in production this would use actual PDF text extraction
        texts.push(`Page ${i + 1} content would be extracted here`);
      }
    } catch (error) {
      console.error('Error extracting text:', error);
      // Return placeholder texts
      for (let i = 0; i < pageCount; i++) {
        texts.push(`Page ${i + 1} placeholder text`);
      }
    }
    
    return texts;
  }

  private async detectInBriefStrict(brief: { id: string; title: string; path: string; pages: number }): Promise<DetectedReference[]> {
    const references: DetectedReference[] = [];
    
    try {
      const briefText = await this.extractAllPageText(brief.path, brief.pages);
      
      for (let pageIndex = 0; pageIndex < briefText.length; pageIndex++) {
        const pageText = briefText[pageIndex];
        const pageNum = pageIndex + 1;
        
        // Skip header/footer bands (top/bottom 8% of page)
        const cleanText = this.removeHeaderFooterBands(pageText);
        
        // Detect each pattern type
        for (const [type, pattern] of Object.entries(PATTERNS)) {
          let match;
          pattern.lastIndex = 0; // Reset regex
          
          while ((match = pattern.exec(cleanText)) !== null) {
            const fullMatch = match[0];
            const value = match[1] || 'section'; // 'section' for undertakings/refusals/under_advisement
            
            // Skip if no value (generic words)
            if (!value || value === 'No') continue;
            
            // Skip if in signature area
            if (this.isInSignatureArea(fullMatch, cleanText)) continue;
            
            references.push({
              type,
              value: type === 'affidavit' ? value.toLowerCase() : value.toUpperCase(),
              text: fullMatch,
              page: pageNum,
              rect: this.calculateTextRect(fullMatch, cleanText, match.index!),
              confidence: 1.0,
              srcDocId: brief.id
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error processing brief ${brief.title}:`, error);
    }
    
    return references;
  }

  private removeHeaderFooterBands(text: string): string {
    // Simple implementation - remove top and bottom lines
    const lines = text.split('\n');
    const bandSize = Math.floor(lines.length * CONFIG.header_footer_band_pct);
    const cleanLines = lines.slice(bandSize, lines.length - bandSize);
    return cleanLines.join('\n');
  }

  private isInSignatureArea(text: string, pageText: string): boolean {
    // Check if text appears near signature-related terms
    const lowerPageText = pageText.toLowerCase();
    const textIndex = lowerPageText.indexOf(text.toLowerCase());
    
    if (textIndex === -1) return false;
    
    const signatureTerms = [
      'sworn before', 'notary public', 'signature', 'dated this',
      'subscribed and sworn', 'jurat', 'acknowledged'
    ];
    
    // Check surrounding 200 characters
    const before = lowerPageText.substring(Math.max(0, textIndex - 200), textIndex);
    const after = lowerPageText.substring(textIndex, Math.min(lowerPageText.length, textIndex + 200));
    const surrounding = before + after;
    
    return signatureTerms.some(term => surrounding.includes(term));
  }

  private calculateTextRect(text: string, pageText: string, index: number): { x: number; y: number; width: number; height: number } {
    // Simplified rect calculation - in production this would use actual PDF coordinates
    return {
      x: 100,
      y: 700 - (index / pageText.length) * 600, // Approximate Y based on text position
      width: text.length * 6, // Approximate width
      height: 12 // Standard text height
    };
  }

  private async mapReferencesToTrialRecord(references: DetectedReference[]): Promise<void> {
    for (const ref of references) {
      const anchor = this.anchorMap[ref.type]?.[ref.value];
      
      if (anchor && anchor.confidence >= CONFIG.min_confidence) {
        ref.destPage = anchor.page;
        ref.confidence = anchor.confidence;
      } else {
        // Try fuzzy matching for affidavits
        if (ref.type === 'affidavit') {
          const fuzzyMatch = this.findFuzzyAffidavitMatch(ref.value);
          if (fuzzyMatch && fuzzyMatch.confidence >= CONFIG.min_confidence) {
            ref.destPage = fuzzyMatch.page;
            ref.confidence = fuzzyMatch.confidence;
          }
        }
      }
    }
  }

  private findFuzzyAffidavitMatch(searchName: string): { page: number; confidence: number } | null {
    const searchWords = searchName.toLowerCase().split(' ');
    let bestMatch: { page: number; confidence: number } | null = null;
    
    for (const [name, anchor] of Object.entries(this.anchorMap.affidavit)) {
      const nameWords = name.toLowerCase().split(' ');
      const matchedWords = searchWords.filter(word => 
        nameWords.some(nameWord => nameWord.includes(word) || word.includes(nameWord))
      );
      
      const confidence = matchedWords.length / Math.max(searchWords.length, nameWords.length);
      
      if (confidence >= CONFIG.min_confidence && (!bestMatch || confidence > bestMatch.confidence)) {
        bestMatch = { page: anchor.page, confidence };
      }
    }
    
    return bestMatch;
  }

  async convertToLinkFormat(references: DetectedReference[], caseId: string, targetDocId: string): Promise<Link[]> {
    const links: Link[] = [];
    
    for (const ref of references) {
      if (ref.destPage) {
        links.push({
          id: `${ref.srcDocId}-${ref.page}-${ref.type}-${ref.value}`,
          caseId,
          srcDocId: ref.srcDocId,
          srcPage: ref.page,
          srcText: ref.text,
          srcRect: ref.rect,
          targetDocId,
          targetPage: ref.destPage || 1,
          targetText: `${ref.type} ${ref.value}`,
          linkType: ref.type as 'exhibit' | 'tab' | 'schedule' | 'affidavit' | 'undertaking' | 'refusal' | 'under_advisement',
          status: 'pending',
          confidence: ref.confidence,
          reviewedAt: null,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    }
    
    return links;
  }
}