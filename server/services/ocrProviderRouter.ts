import type { Document } from '@shared/schema';

export type OCRProvider = 'tesseract' | 'gcv';

export interface OCRProviderConfig {
  provider: OCRProvider;
  priority: number;
  maxConcurrency: number;
  costPerPage: number; // in cents
}

export const OCR_PROVIDERS: Record<OCRProvider, OCRProviderConfig> = {
  tesseract: {
    provider: 'tesseract',
    priority: 1, // Default choice
    maxConcurrency: Number(process.env.OCR_MAX_CONCURRENCY) || 4,
    costPerPage: 0, // Free
  },
  gcv: {
    provider: 'gcv',
    priority: 2, // Higher performance choice
    maxConcurrency: 10, // Cloud Vision can handle more concurrent requests
    costPerPage: 0.15, // $1.50 per 1000 pages
  }
};

export interface DocumentAnalysis {
  isScanned: boolean;
  hasEmbeddedText: boolean;
  totalPages: number;
  estimatedComplexity: 'low' | 'medium' | 'high';
  documentType: 'legal' | 'form' | 'mixed' | 'unknown';
}

/**
 * OCR Provider Router - Intelligently selects the best OCR provider
 * based on document characteristics and system preferences
 */
export class OCRProviderRouter {
  
  /**
   * Choose the optimal OCR provider for a document
   */
  static chooseProvider(
    document: Partial<Document>, 
    options: {
      forceProvider?: OCRProvider;
      prioritizeSpeed?: boolean;
      prioritizeCost?: boolean;
      maxPages?: number;
    } = {}
  ): OCRProvider {
    
    // If a specific provider is forced, use it
    if (options.forceProvider) {
      return options.forceProvider;
    }

    const analysis = this.analyzeDocument(document);
    const totalPages = document.totalPages || document.pageCount || 0;

    // Decision matrix based on document characteristics
    
    // For large documents (>100 pages), prefer Cloud Vision for speed
    if (totalPages > 100 && options.prioritizeSpeed !== false) {
      return 'gcv';
    }

    // For cost-conscious processing of small documents
    if (totalPages < 50 && options.prioritizeCost) {
      return 'tesseract';
    }

    // For scanned documents, Cloud Vision typically performs better
    if (analysis.isScanned && !analysis.hasEmbeddedText) {
      return 'gcv';
    }

    // For documents with embedded text, Tesseract might be sufficient
    if (analysis.hasEmbeddedText && totalPages < 30) {
      return 'tesseract';
    }

    // For legal documents with complex formatting, prefer Cloud Vision
    if (analysis.documentType === 'legal' && analysis.estimatedComplexity === 'high') {
      return 'gcv';
    }

    // Default to Cloud Vision for better accuracy and speed
    return 'gcv';
  }

  /**
   * Analyze document characteristics to inform provider selection
   */
  private static analyzeDocument(document: Partial<Document>): DocumentAnalysis {
    const totalPages = document.totalPages || document.pageCount || 0;
    const hasEmbeddedText = document.hasSearchableText || false;
    const fileName = document.originalName || document.title || '';
    
    // Heuristic analysis based on available data
    const isScanned = !hasEmbeddedText;
    
    // Estimate complexity based on page count and file name
    let estimatedComplexity: 'low' | 'medium' | 'high' = 'medium';
    if (totalPages < 10) estimatedComplexity = 'low';
    if (totalPages > 100) estimatedComplexity = 'high';
    
    // Detect document type from filename or other hints
    let documentType: 'legal' | 'form' | 'mixed' | 'unknown' = 'unknown';
    if (fileName.toLowerCase().includes('brief') || 
        fileName.toLowerCase().includes('motion') ||
        fileName.toLowerCase().includes('application')) {
      documentType = 'legal';
    } else if (fileName.toLowerCase().includes('form')) {
      documentType = 'form';
    }

    return {
      isScanned,
      hasEmbeddedText,
      totalPages,
      estimatedComplexity,
      documentType
    };
  }

  /**
   * Get estimated processing time for a provider
   */
  static getEstimatedProcessingTime(provider: OCRProvider, totalPages: number): number {
    const config = OCR_PROVIDERS[provider];
    
    switch (provider) {
      case 'tesseract':
        // Tesseract: ~3-6 seconds per page on CPU
        return totalPages * 4.5 * 1000; // milliseconds
        
      case 'gcv':
        // Cloud Vision: ~1-2 seconds per page effective (includes batching)
        return totalPages * 1.5 * 1000; // milliseconds
        
      default:
        return totalPages * 5000; // Default estimate
    }
  }

  /**
   * Get estimated cost for processing a document
   */
  static getEstimatedCost(provider: OCRProvider, totalPages: number): number {
    const config = OCR_PROVIDERS[provider];
    return (config.costPerPage * totalPages) / 100; // Convert cents to dollars
  }

  /**
   * Check if a provider is available and properly configured
   */
  static isProviderAvailable(provider: OCRProvider): boolean {
    switch (provider) {
      case 'tesseract':
        return true; // Always available
        
      case 'gcv':
        return !!(
          process.env.GCP_CREDENTIALS_JSON && 
          process.env.GCP_PROJECT_ID &&
          process.env.GCP_INPUT_BUCKET &&
          process.env.GCP_OUTPUT_BUCKET
        );
        
      default:
        return false;
    }
  }

  /**
   * Get recommended provider with fallback
   */
  static getRecommendedProvider(
    document: Partial<Document>,
    options: Parameters<typeof OCRProviderRouter.chooseProvider>[1] = {}
  ): { primary: OCRProvider; fallback: OCRProvider } {
    
    const primary = this.chooseProvider(document, options);
    
    // Determine fallback provider
    const fallback: OCRProvider = primary === 'gcv' ? 'tesseract' : 'gcv';
    
    // Ensure both providers are available
    if (!this.isProviderAvailable(primary)) {
      return { primary: fallback, fallback: primary };
    }
    
    return { primary, fallback };
  }
}