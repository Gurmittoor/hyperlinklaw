import { db } from '../db';
import { ocrPages } from '@shared/schema';
import { eq } from 'drizzle-orm';

interface FamilyLawItem {
  id: string;
  text: string;
  pageNumber: number;
  confidence: number;
  type: 'form' | 'application' | 'answer' | 'motion' | 'affidavit' | 'exhibit' | 'other';
  formNumber?: string;
  isManuallyEdited: boolean;
}

interface FamilyLawDetectionResult {
  documentId: string;
  indexPages: number[];
  indexItems: FamilyLawItem[];
  isAnalyzed: boolean;
  detectionMethod: string;
  confidence: number;
  totalPages: number;
  documentType: string;
}

export class FamilyLawIndexDetector {
  
  async detectFamilyLawIndex(documentId: string): Promise<FamilyLawDetectionResult> {
    console.log(`🔍 FAMILY LAW INDEX: Starting analysis for document ${documentId}`);
    
    try {
      // Direct query to OCR pages
      const allPages = await db.query.ocrPages.findMany({
        where: eq(ocrPages.documentId, documentId),
        orderBy: (ocrPages, { asc }) => [asc(ocrPages.pageNumber)]
      });

      if (allPages.length === 0) {
        console.log(`❌ No OCR pages found for document ${documentId}`);
        return this.createEmptyResult(documentId);
      }

      console.log(`📄 Analyzing ${allPages.length} pages of family law trial record`);

      // Analyze first few pages to identify document type
      const firstPageText = allPages[0]?.text || '';
      const documentType = this.identifyDocumentType(firstPageText);
      console.log(`📋 Document type identified: ${documentType}`);

      // Extract family law items (forms, applications, etc.)
      const familyLawItems = this.extractFamilyLawItems(allPages);
      console.log(`📝 Extracted ${familyLawItems.length} family law items`);

      const result: FamilyLawDetectionResult = {
        documentId,
        indexPages: [1], // Family law trial records don't have traditional index pages
        indexItems: familyLawItems,
        isAnalyzed: true,
        detectionMethod: 'family_law_analysis',
        confidence: familyLawItems.length > 0 ? 85 : 0,
        totalPages: allPages.length,
        documentType
      };

      console.log(`🎉 FAMILY LAW INDEX COMPLETE: Found ${familyLawItems.length} items`);
      return result;

    } catch (error) {
      console.error(`❌ Family law index detection failed for document ${documentId}:`, error);
      return this.createEmptyResult(documentId);
    }
  }

  private identifyDocumentType(firstPageText: string): string {
    const text = firstPageText.toLowerCase();
    
    if (text.includes('trial record')) {
      return 'Trial Record';
    } else if (text.includes('application')) {
      return 'Family Law Application';
    } else if (text.includes('motion')) {
      return 'Family Law Motion';
    } else if (text.includes('factum')) {
      return 'Family Law Factum';
    } else {
      return 'Family Law Document';
    }
  }

  private extractFamilyLawItems(pages: any[]): FamilyLawItem[] {
    const items: FamilyLawItem[] = [];
    
    for (const page of pages) {
      const pageItems = this.extractItemsFromPage(page);
      items.push(...pageItems);
    }

    return this.deduplicateItems(items);
  }

  private extractItemsFromPage(page: any): FamilyLawItem[] {
    const items: FamilyLawItem[] = [];
    const text = page.text;
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length < 5) continue;

      // Family law specific patterns
      const patterns = [
        // Forms: "Form 8: Application (General)"
        {
          regex: /^form\s+(\d+[a-z]?)\s*[:.]?\s*(.+?)$/i,
          type: 'form' as const,
          confidence: 0.95
        },
        // Applications: "Application (General)"
        {
          regex: /^application\s*\(([^)]+)\)/i,
          type: 'application' as const,
          confidence: 0.9
        },
        // Answers: "Form 10: Answer"
        {
          regex: /^(.*answer.*?)(?:\s*\(page\s*\d+\))?$/i,
          type: 'answer' as const,
          confidence: 0.85
        },
        // Motions: "Motion for..."
        {
          regex: /^(motion\s+(?:for|to)\s+.+?)$/i,
          type: 'motion' as const,
          confidence: 0.8
        },
        // Affidavits: "Affidavit of..."
        {
          regex: /^(affidavit\s+of\s+.+?)$/i,
          type: 'affidavit' as const,
          confidence: 0.8
        }
      ];

      for (const pattern of patterns) {
        const match = line.match(pattern.regex);
        if (match) {
          let itemText = match[1] || match[0];
          let formNumber = null;
          
          if (pattern.type === 'form' && match[2]) {
            formNumber = match[1];
            itemText = `Form ${match[1]}: ${match[2]}`;
          }

          // Clean up the text
          itemText = itemText.replace(/\s+/g, ' ').trim();
          
          // Skip very short or generic items
          if (itemText.length < 8 || this.isGenericText(itemText)) {
            continue;
          }

          items.push({
            id: `${page.pageNumber}-${i}`,
            text: itemText,
            pageNumber: page.pageNumber,
            confidence: pattern.confidence,
            type: pattern.type,
            formNumber,
            isManuallyEdited: false
          });
          
          console.log(`📋 Found ${pattern.type}: "${itemText}" on page ${page.pageNumber}`);
          break; // Only match one pattern per line
        }
      }
    }

    return items;
  }

  private isGenericText(text: string): boolean {
    const genericPhrases = [
      'page', 'court', 'file', 'number', 'ontario', 'justice',
      'name', 'address', 'telephone', 'email', 'date'
    ];

    const lowText = text.toLowerCase();
    return genericPhrases.some(phrase => 
      lowText === phrase || lowText.startsWith(phrase + ' ')
    );
  }

  private deduplicateItems(items: FamilyLawItem[]): FamilyLawItem[] {
    const unique: FamilyLawItem[] = [];
    
    for (const item of items) {
      const isDuplicate = unique.some(existing => 
        this.textSimilarity(item.text, existing.text) > 0.8 ||
        (item.formNumber && existing.formNumber === item.formNumber)
      );
      
      if (!isDuplicate) {
        unique.push(item);
      }
    }

    return unique.sort((a, b) => a.pageNumber - b.pageNumber);
  }

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

  private createEmptyResult(documentId: string): FamilyLawDetectionResult {
    return {
      documentId,
      indexPages: [],
      indexItems: [],
      isAnalyzed: false,
      detectionMethod: 'failed',
      confidence: 0,
      totalPages: 0,
      documentType: 'Unknown'
    };
  }
}

export const familyLawIndexDetector = new FamilyLawIndexDetector();