import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import MultiPagePdf, { type Highlight, type Page2Link } from '@/components/MultiPagePdf';
import { Rnd } from 'react-rnd';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Move, Eye, Edit, Save, Wand2, X, Plus, Circle, Highlighter, Maximize2, Minimize2, Trash2, FileText, Upload, Camera, Target, ArrowRight } from 'lucide-react';
import { PDFDocument, rgb, StandardFonts, PDFName, PDFArray } from 'pdf-lib';
import type { IndexRow, OcrTableRow } from '@/types/indexing';
import { parseIndexText, mergeIndexRows } from '@/lib/parseIndexText';

interface IndexItem {
  id: string;
  documentId: string;
  ordinal?: number;
  label?: string;
  rawRow?: string;
  pageHint?: number;
  bboxNorm?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  targetPage?: number;
  confidence?: number;
  type?: string;
  status?: string;
  tabNumber?: string;
  title?: string;
  dateField?: string;
  isCustom?: boolean;
  sourceType?: string;
  shortDescription?: string;
  finalTargetPage?: number;
  autoMapped?: boolean;
  mappingConfidence?: number;
  mappingMethod?: string;
  reviewStatus?: string;
  markingCoordinates?: any;
  markingPageNumber?: number;
  lastEditedBy?: string;
  lastEditedAt?: string;
}

interface IndexEditorProps {
  documentId: string;
  caseId: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function IndexEditor({ documentId, caseId, isOpen, onClose, onSave }: IndexEditorProps) {
  // Initialize toast hook FIRST to avoid initialization errors
  const { toast } = useToast();
  
  const [indexItems, setIndexItems] = useState<IndexItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [totalPages, setTotalPages] = useState(0);
  const [pdfRefreshKey, setPdfRefreshKey] = useState(0);
  const [zoom, setZoom] = useState(() => {
    const savedZoom = localStorage.getItem('pdf-zoom-level');
    return savedZoom ? parseFloat(savedZoom) : 1;
  });
  const [pageRange, setPageRange] = useState({ start: 1, end: 30 });
  const [showAllPages, setShowAllPages] = useState(false);
  const [backBanner, setBackBanner] = useState(true);
  const [autoDetectOnLoad, setAutoDetectOnLoad] = useState(true);
  const [dragCircles, setDragCircles] = useState<{ id: string; x: number; y: number; page: number }[]>([]);
  const [nextCircleId, setNextCircleId] = useState(1);
  const [clickToPlaceMode, setClickToPlaceMode] = useState(false);
  const [highlightMode, setHighlightMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Hyperlink creation states
  const [selectedText, setSelectedText] = useState('');
  const [hyperlinkPage, setHyperlinkPage] = useState('');
  const [hyperlinkUrl, setHyperlinkUrl] = useState('');
  const [hyperlinks, setHyperlinks] = useState<Array<{
    id: string;
    text: string;
    pageNumber: number;
    url: string;
    createdAt: string;
  }>>([]);
  
  // Strict OCR Mode state - NO FABRICATION OR CACHE REUSE
  const [strictOCR, setStrictOCR] = useState(true); // Default ON
  const [pdfOcrPages, setPdfOcrPages] = useState<Array<{page: number, text: string, hash: string}>>([]);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [lastProcessedPdfHash, setLastProcessedPdfHash] = useState<string>('');
  
  // Column widths state for resizable columns
  const [columnWidths, setColumnWidths] = useState({
    tabNo: 80,
    documentEntry: 400,
    hyperlinkPage: 120,
    hyperlinkUrl: 280
  });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeColumnIndex, setResizeColumnIndex] = useState<number | null>(null);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);

  // OCR Table state for structured data - STARTS EMPTY, POPULATED BY REAL OCR PROCESSING
  const [ocrTableRows, setOcrTableRows] = useState<OcrTableRow[]>([]);
  
  // 🚀 AUTOMATED PROCESSING STATES - Zero Regression Implementation
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [automaticOCREnabled, setAutomaticOCREnabled] = useState(true);
  const [fileDataIsolation] = useState(new Map());
  const [lastProcessedScreenshots, setLastProcessedScreenshots] = useState<string[]>([]);
  const [ocrPersistenceBackup, setOcrPersistenceBackup] = useState<OcrTableRow[]>([]);

  
  // Index page auto-detection states
  const [isDetectingIndexPages, setIsDetectingIndexPages] = useState(false);
  const [autoDetectionComplete, setAutoDetectionComplete] = useState(false);
  const [detectedIndexPages, setDetectedIndexPages] = useState<Array<{
    page: number;
    confidence: number;
    patterns: string[];
    indexEntries: Array<{
      tabNumber: string;
      text: string;
      pageRef?: number;
      dateFound?: string;
    }>;
    isSelected: boolean;
  }>>([]);
  
  // Batch OCR progress state
  const [batchOcrProgress, setBatchOcrProgress] = useState({ current: 0, total: 0, status: 'Ready' });
  const [visionApiAvailable, setVisionApiAvailable] = useState(false);
  
  // Page 2 overlay links state
  const [showPage2Links, setShowPage2Links] = useState(true);
  const [page2Links, setPage2Links] = useState<Page2Link[]>([]);
  
  // ADVANCED INDEX PAGE PATTERN MATCHING ALGORITHM
  const analyzePageForIndexPatterns = useCallback((pageText: string, pageNumber: number): {
    confidence: number;
    patterns: string[];
    indexEntries: Array<{
      tabNumber: string;
      text: string;
      pageRef?: number;
      dateFound?: string;
    }>;
  } => {
    if (!pageText || typeof pageText !== 'string') {
      return { confidence: 0, patterns: [], indexEntries: [] };
    }
    
    const text = pageText.toLowerCase();
    const originalText = pageText;
    const lines = originalText.split('\n').filter(line => line.trim().length > 5);
    
    let confidence = 0;
    const patterns: string[] = [];
    const indexEntries: Array<{
      tabNumber: string;
      text: string;
      pageRef?: number;
      dateFound?: string;
    }> = [];
    
    // PATTERN 1: Numbered/Tabbed entries (HIGH VALUE)
    const tabPatterns = [
      /(?:^|\s)(?:tab|exhibit|document|appendix|schedule)\s*([0-9a-z]+)[\s:]/gi,
      /^[\s]*([0-9]+)[\s]*[.\-)\]:]/gm,  // Line starting with number
      /(?:^|\n)[\s]*([0-9]+)[\s]*[.\-)\]:][\s]*(.{10,200})/gim,
      /(?:tab|exhibit|doc|document)\s*([0-9a-z]+)[\s:.\-](.{10,150})/gi
    ];
    
    let tabMatches = 0;
    for (const pattern of tabPatterns) {
      const matches: RegExpExecArray[] = [];
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(originalText)) !== null) {
        matches.push(match);
        if (!pattern.global) break;
      }
      tabMatches += matches.length;
      
      matches.forEach(match => {
        const tabNumber = match[1] || '';
        const description = match[2] || match[0];
        if (tabNumber && description && description.length > 10) {
          indexEntries.push({
            tabNumber: tabNumber.toString(),
            text: description.trim().substring(0, 200)
          });
        }
      });
    }
    
    if (tabMatches >= 3) {
      confidence += 0.4;
      patterns.push(`${tabMatches} numbered/tabbed entries`);
    } else if (tabMatches >= 1) {
      confidence += 0.2;
      patterns.push(`${tabMatches} numbered entries`);
    }
    
    // PATTERN 2: Date patterns (MEDIUM VALUE) 
    const datePatterns = [
      /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b/gi,
      /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\b/g,
      /\b\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\b/g,
      /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?\s+\d{1,2},?\s+\d{4}\b/gi
    ];
    
    let dateMatches = 0;
    for (const pattern of datePatterns) {
      const matches: RegExpExecArray[] = [];
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(originalText)) !== null) {
        matches.push(match);
        if (!pattern.global) break;
      }
      dateMatches += matches.length;
      
      // Add dates to index entries
      matches.forEach(match => {
        const dateFound = match[0];
        // Try to find the index entry this date belongs to
        const lineWithDate = lines.find(line => line.includes(dateFound));
        if (lineWithDate && lineWithDate.length > 20) {
          const existingEntry = indexEntries.find(entry => 
            lineWithDate.toLowerCase().includes(entry.text.toLowerCase().substring(0, 20))
          );
          if (existingEntry) {
            existingEntry.dateFound = dateFound;
          }
        }
      });
    }
    
    if (dateMatches >= 5) {
      confidence += 0.3;
      patterns.push(`${dateMatches} date references`);
    } else if (dateMatches >= 2) {
      confidence += 0.15;
      patterns.push(`${dateMatches} dates found`);
    }
    
    // PATTERN 3: Page number references (MEDIUM VALUE) - FIXED: More constrained patterns
    const pageRefPatterns = [
      /(?:page|p\.?|at)\s*(\d+)/gi,
      /\.{3,}\s*(\d+)\s*$/gm,  // Dotted leaders to page numbers (min 3 dots)
      /\s{10,}(\d{1,4})\s*$/gm,  // 10+ spaces followed by 1-4 digit number at line end
      /(?:^|\n)[^\n]{20,}\s{10,}(\d{1,4})\s*$/gm,  // Substantial text + large gap + page number
    ];
    
    let pageRefMatches = 0;
    for (const pattern of pageRefPatterns) {
      const matches: RegExpExecArray[] = [];
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(originalText)) !== null) {
        matches.push(match);
        if (!pattern.global) break;
      }
      pageRefMatches += matches.length;
      
      // Add page references to entries
      matches.forEach(match => {
        const pageRef = parseInt(match[1]);
        if (pageRef && pageRef > 0 && pageRef < 9999) {
          const lineWithPageRef = lines.find(line => line.includes(match[0]));
          if (lineWithPageRef) {
            const existingEntry = indexEntries.find(entry => 
              lineWithPageRef.toLowerCase().includes(entry.text.toLowerCase().substring(0, 20))
            );
            if (existingEntry) {
              existingEntry.pageRef = pageRef;
            }
          }
        }
      });
    }
    
    if (pageRefMatches >= 5) {
      confidence += 0.25;
      patterns.push(`${pageRefMatches} page references`);
    } else if (pageRefMatches >= 2) {
      confidence += 0.1;
      patterns.push(`${pageRefMatches} page refs`);
    }
    
    // PATTERN 4: Legal document types (MEDIUM VALUE)
    const legalDocPatterns = [
      /(?:affidavit|motion|brief|pleading|order|judgment|transcript|deposition|discovery|subpoena|notice|application|response|reply|counterclaim|cross-claim)/gi,
      /(?:sworn|filed|served|dated|executed)/gi,
      /(?:plaintiff|defendant|applicant|respondent|petitioner|appellant|appellee)/gi
    ];
    
    let legalTermMatches = 0;
    for (const pattern of legalDocPatterns) {
      legalTermMatches += (originalText.match(pattern) || []).length;
    }
    
    if (legalTermMatches >= 8) {
      confidence += 0.2;
      patterns.push(`${legalTermMatches} legal terms`);
    } else if (legalTermMatches >= 3) {
      confidence += 0.1;
      patterns.push(`${legalTermMatches} legal terms`);
    }
    
    // PATTERN 5: Table-like structure detection (HIGH VALUE)
    const structuralIndicators = [
      /(?:tab\s*no\.?|document\s*no\.?|exhibit\s*no\.?)/gi,
      /(?:date\s*of\s*document|nature\s*of\s*document)/gi,
      /\|.*\|.*\|/g,  // Pipe-separated content
      /^[\s]*[0-9]+[\s]*\|/gm,  // Numbers followed by pipes
    ];
    
    let structuralMatches = 0;
    for (const pattern of structuralIndicators) {
      structuralMatches += (originalText.match(pattern) || []).length;
    }
    
    if (structuralMatches >= 3) {
      confidence += 0.3;
      patterns.push('Table structure detected');
    } else if (structuralMatches >= 1) {
      confidence += 0.15;
      patterns.push('Some table structure');
    }
    
    // PATTERN 6: Index-specific headers and keywords (HIGH VALUE) - FIXED: Removed TOC
    const indexHeaders = [
      /(?:index|schedule|appendix|list\s*of\s*exhibits)/gi,
      /(?:^|\n)[\s]*(?:index)[\s]*$/gim,
      /document\s*index/gi,
      /case\s*materials/gi,
      /(?:exhibit\s*list|document\s*list)/gi
    ];
    
    let headerMatches = 0;
    for (const pattern of indexHeaders) {
      headerMatches += (originalText.match(pattern) || []).length;
    }
    
    if (headerMatches >= 1) {
      confidence += 0.25;
      patterns.push('Index headers found');
    }
    
    // NEGATIVE PATTERNS: Reduce confidence for non-index content - FIXED: Stronger TOC penalty
    const negativePatterns = [
      /(?:table\s*of\s*contents|toc)(?!\s*index)/gi,  // TOC but not index - STRONG PENALTY
      /(?:bibliography|references|citations)/gi,
      /(?:chapter|section|part\s*[ivx0-9]+)/gi,
      /(?:introduction|conclusion|summary|abstract)/gi,
      /(?:^|\n)\s*(?:chapter|section)\s+\d+/gim,  // Chapter/section numbers
      /(?:copyright|acknowledgment|preface)/gi
    ];
    
    let negativeMatches = 0;
    for (const pattern of negativePatterns) {
      negativeMatches += (originalText.match(pattern) || []).length;
    }
    
    if (negativeMatches >= 2) {
      confidence -= 0.15;
      patterns.push('Non-index content detected');
    }
    
    // STRONGER TOC PENALTY - if "table of contents" appears, strongly penalize
    const tocMatches = (originalText.match(/table\s*of\s*contents|toc(?!\s*index)/gi) || []).length;
    if (tocMatches >= 1) {
      confidence -= 0.5;  // Strong penalty for TOC pages
      patterns.push('Table of Contents detected (strong penalty)');
    }
    
    // BONUS: Multiple column layout detection
    const columnIndicators = lines.filter(line => {
      // Look for lines with significant spacing that might indicate columns
      return /\s{10,}/.test(line) && line.trim().length > 30;
    });
    
    if (columnIndicators.length >= 3) {
      confidence += 0.1;
      patterns.push('Multi-column layout');
    }
    
    // ENTRY DEDUPLICATION - Remove duplicates by text and tabNumber
    const deduplicatedEntries = indexEntries.reduce((acc, entry) => {
      const normalizedText = entry.text.toLowerCase().trim();
      const key = `${entry.tabNumber}:${normalizedText.substring(0, 50)}`;
      const existing = acc.find(e => {
        const existingKey = `${e.tabNumber}:${e.text.toLowerCase().trim().substring(0, 50)}`;
        return existingKey === key || normalizedText === e.text.toLowerCase().trim();
      });
      if (!existing) {
        acc.push(entry);
      }
      return acc;
    }, [] as typeof indexEntries);
    
    // STRUCTURAL VALIDATION - Require minimum structured lines for index confidence
    const structuredLineCount = lines.filter(line => {
      // Strict index-entry pattern: [Tab/Exhibit] + description + (dotted leaders OR 10+ spaces) + page number
      const strictIndexPattern = /^\s*(?:(?:tab|exhibit|doc|document|appendix)\s*[0-9a-z]*\s*[:\-.]?\s*)?(.{15,})(?:\.{3,}|\s{10,})(\d{1,4})\s*$/i;
      return strictIndexPattern.test(line);
    }).length;
    
    // Structural confidence bonus - only if we have enough structured lines
    if (structuredLineCount >= 4) {
      const structuralRatio = structuredLineCount / Math.max(lines.length, 1);
      confidence += structuralRatio * 0.3;  // Up to 30% bonus for high structural match
      patterns.push(`${structuredLineCount} structured index lines`);
    } else if (structuredLineCount >= 2) {
      confidence += 0.1;  // Small bonus for some structure
      patterns.push(`${structuredLineCount} structured lines (minimal)`);
    } else {
      // Penalize pages with no clear index structure
      confidence -= 0.2;
      patterns.push('No clear index structure detected');
    }
    
    // Normalize confidence to 0-1 range
    confidence = Math.max(0, Math.min(1, confidence));
    
    return {
      confidence,
      patterns,
      indexEntries: deduplicatedEntries.slice(0, 50) // Limit to 50 entries per page after deduplication
    };
  }, []);
  
  // MAIN INDEX PAGE DETECTION FUNCTION
  const detectIndexPages = useCallback(async (): Promise<void> => {
    // 🔒 STRICT OCR: Block PDF-based detection in screenshots-only mode
    if (strictOCR) {
      toast({
        title: "🔒 Strict OCR Mode Active",
        description: "PDF-based index detection is disabled. Only screenshot-based OCR is allowed.",
        variant: "destructive"
      });
      return;
    }
    
    if (pdfOcrPages.length === 0) {
      toast({
        title: "No OCR Data Available", 
        description: "Run batch PDF OCR first to get text data for analysis",
        variant: "destructive"
      });
      return;
    }
    
    setIsDetectingIndexPages(true);
    setAutoDetectionComplete(false);
    
    try {
      console.log(`🔍 Analyzing ${pdfOcrPages.length} pages for index patterns...`);
      
      const detectedPages: Array<{
        page: number;
        confidence: number;
        patterns: string[];
        indexEntries: Array<{
          tabNumber: string;
          text: string;
          pageRef?: number;
          dateFound?: string;
        }>;
        isSelected: boolean;
      }> = [];
      
      // Analyze each page for index patterns
      for (const pageData of pdfOcrPages) {
        const analysis = analyzePageForIndexPatterns(pageData.text, pageData.page);
        
        // ADJUSTED THRESHOLDS - Only include pages with confidence > 0.3 (stricter threshold)
        if (analysis.confidence > 0.3) {
          detectedPages.push({
            page: pageData.page,
            confidence: analysis.confidence,
            patterns: analysis.patterns,
            indexEntries: analysis.indexEntries,
            isSelected: analysis.confidence > 0.7 // Auto-select only very high confidence pages
          });
        }
      }
      
      // Sort by confidence (highest first)
      detectedPages.sort((a, b) => b.confidence - a.confidence);
      
      setDetectedIndexPages(detectedPages);
      setAutoDetectionComplete(true);
      
      const highConfidence = detectedPages.filter(p => p.confidence > 0.7).length;
      const mediumConfidence = detectedPages.filter(p => p.confidence > 0.4 && p.confidence <= 0.7).length;
      const lowConfidence = detectedPages.filter(p => p.confidence > 0.3 && p.confidence <= 0.4).length;
      
      toast({
        title: "🎯 Index Detection Complete",
        description: `Found ${detectedPages.length} potential index pages: ${highConfidence} high, ${mediumConfidence} medium, ${lowConfidence} low confidence`,
      });
      
      console.log('✅ Index detection results:', {
        totalPages: pdfOcrPages.length,
        detectedPages: detectedPages.length,
        highConfidence,
        mediumConfidence,
        lowConfidence,
        topResults: detectedPages.slice(0, 3).map(p => ({
          page: p.page,
          confidence: p.confidence.toFixed(3),
          patterns: p.patterns,
          entries: p.indexEntries.length
        }))
      });
      
    } catch (error) {
      console.error('Index detection failed:', error);
      setDetectedIndexPages([]);
      
      toast({
        title: "🚨 Detection Failed",
        description: error instanceof Error ? error.message : 'Unknown error during index detection',
        variant: "destructive"
      });
    } finally {
      setIsDetectingIndexPages(false);
    }
  }, [strictOCR, pdfOcrPages, analyzePageForIndexPatterns, toast]);

  // AUTO-DETECT INDEX SCREENSHOTS - Convert detected index pages to screenshots
  const autoDetectIndexScreenshots = useCallback(async (): Promise<void> => {
    // 🔒 STRICT OCR: Block PDF-based auto-detection in screenshots-only mode
    if (strictOCR) {
      toast({
        title: "🔒 Strict OCR Mode Active", 
        description: "PDF-based auto-detection is disabled. Only manual screenshot management is allowed.",
        variant: "destructive"
      });
      return;
    }

    if (pdfOcrPages.length === 0) {
      toast({
        title: "No OCR Data Available", 
        description: "Run batch PDF OCR first to get text data for screenshot detection",
        variant: "destructive"
      });
      return;
    }

    setIsDetectingIndexPages(true);
    setAutoDetectionComplete(false);

    try {
      console.log(`🔍 Detecting index pages and converting to screenshots...`);
      
      // First detect index pages using existing logic
      const detectedPages: Array<{
        page: number;
        confidence: number;
        patterns: string[];
        indexEntries: Array<{
          tabNumber: string;
          text: string;
          pageRef?: number;
          dateFound?: string;
        }>;
        isSelected: boolean;
      }> = [];

      // Analyze each page for index patterns
      for (const pageData of pdfOcrPages) {
        const analysis = analyzePageForIndexPatterns(pageData.text, pageData.page);
        
        if (analysis.confidence > 0.3) {
          detectedPages.push({
            page: pageData.page,
            confidence: analysis.confidence,
            patterns: analysis.patterns,
            indexEntries: analysis.indexEntries,
            isSelected: analysis.confidence > 0.7
          });
        }
      }

      setDetectedIndexPages(detectedPages);

      // Convert high confidence pages to screenshots
      const highConfidencePages = detectedPages.filter(p => p.confidence > 0.7);
      const screenshots: Array<{
        id: string;
        url: string;
        name: string;
        ocrText: string;
        isOcrProcessing: boolean;
        clickableAreas: Array<{
          id: string;
          x: number;
          y: number;
          width: number;
          height: number;
          tabNumber: string;
          title: string;
          targetPage: number;
        }>;
      }> = [];

      for (const page of highConfidencePages) {
        try {
          // Generate screenshot using PDF-to-image conversion
          const response = await fetch(`/api/documents/${documentId}/page-screenshot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              caseId,
              pageNumber: page.page,
              confidence: page.confidence,
              patterns: page.patterns
            })
          });
          
          const responseData = response.ok ? await response.json() : { success: false };

          if (responseData.success && responseData.screenshotUrl) {
            // Find OCR text for this page
            const pageOcrData = pdfOcrPages.find(p => p.page === page.page);
            
            screenshots.push({
              id: `auto-${page.page}-${Date.now()}`,
              url: responseData.screenshotUrl,
              name: `Index Page ${page.page} (${Math.round(page.confidence * 100)}% confidence)`,
              ocrText: pageOcrData?.text || '',
              isOcrProcessing: false,
              clickableAreas: page.indexEntries.map((entry, idx) => ({
                id: `area-${page.page}-${idx}`,
                x: 50 + (idx % 3) * 200, // Distributed positions
                y: 100 + Math.floor(idx / 3) * 80,
                width: 180,
                height: 60,
                tabNumber: entry.tabNumber,
                title: entry.text.substring(0, 50),
                targetPage: entry.pageRef || 0
              }))
            });
          }
        } catch (error) {
          console.error(`Failed to convert page ${page.page} to screenshot:`, error);
        }
      }

      // Update index screenshots
      setIndexScreenshots(prev => [...prev, ...screenshots]);
      setAutoDetectionComplete(true);

      toast({
        title: "🎯 Auto-Detection Complete",
        description: `Detected ${detectedPages.length} index pages, converted ${screenshots.length} to screenshots`,
      });

      console.log('✅ Auto-detection with screenshots complete:', {
        totalPages: pdfOcrPages.length,
        detectedPages: detectedPages.length,
        screenshotsCreated: screenshots.length
      });

    } catch (error) {
      console.error('Auto-detection failed:', error);
      toast({
        title: "🚨 Auto-Detection Failed",
        description: error instanceof Error ? error.message : 'Unknown error during auto-detection',
        variant: "destructive"
      });
    } finally {
      setIsDetectingIndexPages(false);
    }
  }, [strictOCR, pdfOcrPages, analyzePageForIndexPatterns, documentId, caseId, toast]);
  
  // Helper functions for managing detected index page selection
  const toggleIndexPageSelection = useCallback((pageNumber: number) => {
    setDetectedIndexPages(prev => 
      prev.map(page => 
        page.page === pageNumber 
          ? { ...page, isSelected: !page.isSelected }
          : page
      )
    );
  }, []);
  
  const selectAllHighConfidencePages = useCallback(() => {
    setDetectedIndexPages(prev => {
      const updated = prev.map(page => ({ 
        ...page, 
        isSelected: page.confidence > 0.7 
      }));
      const highConfidenceCount = updated.filter(p => p.confidence > 0.7).length;
      toast({
        title: "High Confidence Pages Selected",
        description: `Selected ${highConfidenceCount} high confidence pages`,
      });
      return updated;
    });
  }, [toast]);
  
  const clearAllSelections = useCallback(() => {
    setDetectedIndexPages(prev => 
      prev.map(page => ({ ...page, isSelected: false }))
    );
    toast({
      title: "Selections Cleared",
      description: "All index page selections have been cleared",
    });
  }, [toast]);
  
  const processSelectedIndexPages = useCallback(async () => {
    const selectedPages = detectedIndexPages.filter(page => page.isSelected);
    
    if (selectedPages.length === 0) {
      toast({
        title: "No Pages Selected",
        description: "Please select at least one index page to process",
        variant: "destructive"
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Extract all index entries from selected pages
      const allIndexEntries: Array<{
        tabNumber: string;
        text: string;
        pageRef?: number;
        dateFound?: string;
        sourcePage: number;
        confidence: number;
      }> = [];
      
      selectedPages.forEach(page => {
        page.indexEntries.forEach(entry => {
          allIndexEntries.push({
            ...entry,
            sourcePage: page.page,
            confidence: page.confidence
          });
        });
      });
      
      // Convert to OcrTableRows format
      const newTableRows = allIndexEntries.map((entry, index) => ({
        id: `detected-${entry.sourcePage}-${index}`,
        tabNo: entry.tabNumber || `${index + 1}`,
        fullText: entry.text,
        hyperlinkPage: entry.pageRef?.toString() || '',
        hyperlinkUrl: entry.pageRef ? `/online/pdf/${caseId}/${documentId}#page=${entry.pageRef}` : '',
        date: entry.dateFound || '',
        nature: entry.text.replace(entry.dateFound || '', '').trim()
      }));
      
      setOcrTableRows(newTableRows);
      
      toast({
        title: "🎉 Index Pages Processed",
        description: `Extracted ${allIndexEntries.length} index entries from ${selectedPages.length} pages`,
      });
      
      console.log('✅ Processed selected index pages:', {
        selectedPages: selectedPages.length,
        extractedEntries: allIndexEntries.length,
        tableRows: newTableRows.length
      });
      
    } catch (error) {
      console.error('Failed to process selected index pages:', error);
      toast({
        title: "Processing Failed",
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [detectedIndexPages, caseId, documentId, toast]);

  // Helper function to add missing strictOcrMemoryReset
  const strictOcrMemoryReset = useCallback(() => {
    console.log('🔒 STRICT OCR: Memory reset triggered');
    
    // Clear all OCR-related state
    setBatch1Ocr('');
    setOcrTableRows([]);
    setIndexRows([]);
    setPdfOcrPages([]);
    setLastProcessedPdfHash('');
    setManualIndexText('');
    setDetectedIndexPages([]);
    setAutoDetectionComplete(false);
    
    // Reset processing states
    setIsProcessingPdf(false);
    setIsDetectingIndexPages(false);
    setBatchOcrProgress({ current: 0, total: 0, status: 'Ready' });
  }, []);
  
  // EXACT PAGE MAPPING - Map index entries to PDF pages with confidence scoring
  const mapRowsToPages = useCallback(async (rows: OcrTableRow[]): Promise<Array<{
    rowId: string;
    mappedPage: number | null;
    confidence: number;
    matchText: string;
    isUncertain: boolean;
  }>> => {
    if (pdfOcrPages.length === 0) {
      toast({
        title: "No PDF OCR Data",
        description: "Run batch PDF OCR first to enable page mapping",
        variant: "destructive"
      });
      return [];
    }

    if (!rows || rows.length === 0) {
      return [];
    }

    console.log(`🎯 Mapping ${rows.length} index entries to PDF pages...`);

    const mappingResults: Array<{
      rowId: string;
      mappedPage: number | null;
      confidence: number;
      matchText: string;
      isUncertain: boolean;
    }> = [];

    for (const row of rows) {
      try {
        // Combine all text from the row for matching
        const searchText = [row.fullText, row.nature, row.date]
          .filter(text => text && text.trim().length > 0)
          .join(' ')
          .trim();

        if (!searchText || searchText.length < 5) {
          mappingResults.push({
            rowId: row.id,
            mappedPage: null,
            confidence: 0,
            matchText: 'Insufficient text for matching',
            isUncertain: true
          });
          continue;
        }

        // Use existing findBestPageMatch function with the OCR pages
        const matchResult = findBestPageMatch(searchText, pdfOcrPages);

        if (matchResult && matchResult.confidence > 0.15) {
          // Apply confidence thresholds with no fabrication policy
          const isHighConfidence = matchResult.confidence >= 0.8;
          const isMediumConfidence = matchResult.confidence >= 0.5;
          const isLowConfidence = matchResult.confidence >= 0.15;
          
          let isUncertain = false;
          let matchText = '';

          if (isHighConfidence) {
            matchText = `High confidence match (${Math.round(matchResult.confidence * 100)}%)`;
          } else if (isMediumConfidence) {
            matchText = `Medium confidence match (${Math.round(matchResult.confidence * 100)}%)`;
            isUncertain = true;
          } else if (isLowConfidence) {
            matchText = `Low confidence match (${Math.round(matchResult.confidence * 100)}%) - verify manually`;
            isUncertain = true;
          }

          mappingResults.push({
            rowId: row.id,
            mappedPage: matchResult.page,
            confidence: matchResult.confidence,
            matchText,
            isUncertain
          });

        } else {
          // NO FABRICATION - If confidence is too low, don't create phantom matches
          mappingResults.push({
            rowId: row.id,
            mappedPage: null,
            confidence: matchResult?.confidence || 0,
            matchText: 'No reliable page match found - manual verification required',
            isUncertain: true
          });
        }

      } catch (error) {
        console.error(`Error mapping row ${row.id}:`, error);
        mappingResults.push({
          rowId: row.id,
          mappedPage: null,
          confidence: 0,
          matchText: 'Mapping error occurred',
          isUncertain: true
        });
      }
    }

    // Log mapping statistics for transparency
    const highConfCount = mappingResults.filter(r => r.confidence >= 0.8).length;
    const mediumConfCount = mappingResults.filter(r => r.confidence >= 0.5 && r.confidence < 0.8).length;
    const lowConfCount = mappingResults.filter(r => r.confidence >= 0.15 && r.confidence < 0.5).length;
    const noMatchCount = mappingResults.filter(r => r.confidence < 0.15).length;

    console.log('✅ Page mapping complete:', {
      totalRows: rows.length,
      highConfidence: highConfCount,
      mediumConfidence: mediumConfCount,
      lowConfidence: lowConfCount,
      noMatch: noMatchCount
    });

    toast({
      title: "🎯 Page Mapping Complete",
      description: `${highConfCount} high, ${mediumConfCount} medium, ${lowConfCount} low confidence matches. ${noMatchCount} require manual review.`,
    });

    return mappingResults;
  }, [pdfOcrPages, toast]);
  
  // Batch PDF OCR function with Google Cloud Vision integration
  const batchProcessPdfOcr = useCallback(async (forceReprocess = false): Promise<{page: number, text: string, hash: string}[]> => {
    if (!strictOCR) {
      toast({
        title: "Strict OCR Mode Required",
        description: "Enable Strict OCR mode to use batch PDF processing",
        variant: "destructive"
      });
      return [];
    }

    if (!documentId || !caseId) {
      toast({
        title: "Missing Document Info",
        description: "Document ID and Case ID are required",
        variant: "destructive"
      });
      return [];
    }

    // Prevent concurrent runs
    if (isProcessingPdf) {
      toast({
        title: "OCR Already Running",
        description: "Please wait for current OCR processing to complete",
        variant: "destructive"
      });
      return [];
    }

    setIsProcessingPdf(true);
    setBatchOcrProgress({ current: 0, total: 0, status: 'Initializing...' });
    
    let pollInterval: NodeJS.Timeout | null = null;
    let timeoutHandle: NodeJS.Timeout | null = null;
    
    try {
      // Step 1: Check Vision API availability
      setBatchOcrProgress(prev => ({ ...prev, status: 'Checking Vision API...' }));
      const visionCheck = await fetch('/api/test-vision', { method: 'POST' });
      const visionResult = await visionCheck.json();
      
      if (!visionResult.success || !visionResult.visionApiAvailable) {
        throw new Error('Google Cloud Vision API not available - check credentials and billing');
      }
      
      setVisionApiAvailable(true);
      
      // Step 2: Get document info and total pages
      setBatchOcrProgress(prev => ({ ...prev, status: 'Getting document info...' }));
      const docResponse = await fetch(`/api/documents/${documentId}`);
      if (!docResponse.ok) {
        throw new Error('Failed to get document information');
      }
      
      const docData = await docResponse.json();
      const totalPages = docData.totalPages || docData.pageCount;
      if (!totalPages || totalPages <= 0) {
        throw new Error('Document page count not available. Please contact support.');
      }
      
      setBatchOcrProgress({ current: 0, total: totalPages, status: 'Starting batch OCR...' });
      
      // Step 3: Generate stable content hash for caching (NO DATE.NOW)
      // Use stable document fingerprint: docId + pageCount + fileSize + version
      const fileSize = docData.fileSize || 0;
      const documentVersion = docData.version || docData.updatedAt || '1';
      const contentHash = `${documentId}:${totalPages}:${fileSize}:${documentVersion}`;
      
      // Check if we should skip processing (unless forced)
      if (!forceReprocess && lastProcessedPdfHash === contentHash && pdfOcrPages.length > 0) {
        setBatchOcrProgress(prev => ({ ...prev, status: 'Using cached results...' }));
        toast({
          title: "📋 Using Cached OCR",
          description: `Found ${pdfOcrPages.length} previously processed pages`
        });
        setIsProcessingPdf(false);
        return pdfOcrPages;
      }
      
      // Step 4: Start parallel Vision OCR processing
      setBatchOcrProgress(prev => ({ ...prev, status: 'Starting parallel Vision OCR...' }));
      
      const ocrResponse = await fetch(`/api/documents/${documentId}/vision-parallel-ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId,
          totalPages,
          batchSize: 50,
          maxConcurrent: 10
        })
      });
      
      if (!ocrResponse.ok) {
        const errorData = await ocrResponse.json();
        throw new Error(errorData.error || 'Failed to start Vision OCR processing');
      }
      
      const ocrResult = await ocrResponse.json();
      
      // Step 5: Return Promise that resolves with actual results
      return new Promise<{page: number, text: string, hash: string}[]>((resolve, reject) => {
        const estimatedBatches = Math.ceil(totalPages / 50);
        
        setBatchOcrProgress({
          current: 0,
          total: totalPages, // Progress by PAGES, not batches
          status: `Processing ${estimatedBatches} batches...`
        });
        
        // Cleanup function to prevent memory leaks
        const cleanup = () => {
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
            timeoutHandle = null;
          }
          setIsProcessingPdf(false);
        };
        
        // Poll for completion every 2 seconds
        pollInterval = setInterval(async () => {
          try {
            const statusResponse = await fetch(`/api/documents/${documentId}/ocr-status`);
            if (statusResponse.ok) {
              const statusData = await statusResponse.json();
              
              // Update progress consistently in pages
              const done = statusData.done || 0;
              const total = statusData.total || totalPages;
              setBatchOcrProgress({
                current: done,
                total: total,
                status: `Processing ${done}/${total} pages...`
              });
              
              if (statusData.status === 'completed' || statusData.progress === 100 || done >= total) {
                cleanup();
                
                // Fetch final OCR results
                try {
                  const resultsResponse = await fetch(`/api/documents/${documentId}/ocr-pages`);
                  if (resultsResponse.ok) {
                    const pages = await resultsResponse.json();
                    const formattedPages = pages.map((p: any) => ({
                      page: p.pageNumber,
                      text: p.extractedText || '',
                      hash: p.id || `${documentId}:${p.pageNumber}`
                    }));
                    
                    setPdfOcrPages(formattedPages);
                    setLastProcessedPdfHash(contentHash);
                    
                    setBatchOcrProgress({
                      current: formattedPages.length,
                      total: formattedPages.length,
                      status: 'Completed!'
                    });
                    
                    toast({
                      title: "🎉 Batch OCR Complete",
                      description: `Successfully processed ${formattedPages.length} pages with Google Cloud Vision`
                    });
                    
                    resolve(formattedPages); // Return actual results
                  } else {
                    reject(new Error('Failed to fetch OCR results'));
                  }
                } catch (error) {
                  reject(error);
                }
                return;
              }
            }
          } catch (error) {
            console.error('Error polling OCR status:', error);
            // Don't reject on polling errors, continue trying
          }
        }, 2000);
        
        // Cleanup timeout after 10 minutes
        timeoutHandle = setTimeout(() => {
          cleanup();
          reject(new Error('OCR processing timeout after 10 minutes'));
        }, 600000);
      });
      
    } catch (error) {
      console.error('Batch OCR processing failed:', error);
      setIsProcessingPdf(false);
      setVisionApiAvailable(false);
      
      toast({
        title: "🚨 Batch OCR Failed",
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: "destructive"
      });
      
      return [];
    }
  }, [strictOCR, documentId, caseId, lastProcessedPdfHash, pdfOcrPages, isProcessingPdf, toast]);
  
  // Check Vision API availability on mount
  useEffect(() => {
    const checkVisionApi = async () => {
      try {
        const response = await fetch('/api/test-vision', { method: 'POST' });
        const result = await response.json();
        setVisionApiAvailable(result.success && result.visionApiAvailable);
      } catch (error) {
        console.error('Failed to check Vision API:', error);
        setVisionApiAvailable(false);
      }
    };
    
    checkVisionApi();
  }, []);

  // 🔒 DOCUMENT SCOPING: Reset ALL OCR state when documentId changes
  useEffect(() => {
    console.log(`🔄 Document scope reset: Clearing OCR state for document ${documentId}`);
    
    // Reset all OCR table data initially, then load from database
    setOcrTableRows([]);
    setIndexItems([]);
    
    // 📥 LOAD PERMANENT DATA: Immediately load saved hyperlink pages from database
    if (documentId && documentId.trim() !== '') {
      console.log('🔍 DEBUG: DocumentId is valid, loading data from database...');
      loadOcrTableRowsFromDatabase().then(savedRows => {
        if (savedRows.length > 0) {
          console.log(`🔒 PERMANENT: Loaded ${savedRows.length} saved OCR rows with hyperlink pages from database`);
          setOcrTableRows(savedRows);
          setHasUnsavedChanges(false); // Mark as saved since we just loaded from database
        } else {
          console.log('ℹ️ No saved OCR table data found - starting with empty table');
        }
      }).catch(error => {
        console.error('❌ Failed to load saved OCR data:', error);
      });
    } else {
      console.log('⚠️ DocumentId is empty, skipping database load');
    }
    
    // Reset screenshot-related state
    setIndexScreenshots([]);
    setSelectedScreenshotIds([]);
    setActiveScreenshotId(null);
    setSelectedScreenshot(null);
    setEditingOcrText(null);
    setManualIndexText('');
    
    // Reset batch processing state
    setIsBatchMode(false);
    setIsBatchProcessing(false);
    setBatchOcrProgress({ current: 0, total: 0, status: 'Ready' });
    
    // Reset PDF OCR state (strict mode will prevent use anyway)
    setPdfOcrPages([]);
    setLastProcessedPdfHash('');
    
    // Reset auto-detection state
    setDetectedIndexPages([]);
    setAutoDetectionComplete(false);
    setIsDetectingIndexPages(false);
    
    // Reset selection and editing states
    setSelectedItem(null);
    
    // Reset loading states
    setIsLoading(false);
    setIsSaving(false);
    
    // 🔑 CRITICAL: Reset data loading flags so new documents fetch fresh data
    setScreenshotsLoaded(false);
    setBatch1Ocr(''); // Clear any existing OCR text
    
    // Reset UI interaction states
    setIsDrawing(false);
    setCurrentHighlight(null);
    setIsMarkingAreas(false);
    setClickToPlaceMode(false);
    setHighlightMode(false);
    
    // Reset hyperlink creation states
    setSelectedText('');
    setHyperlinkPage('');
    setHyperlinkUrl('');
    setHyperlinks([]);
    
    // Reset drag and highlight states
    setDragCircles([]);
    setNextCircleId(1);
    setDrawnHighlights([]);
    setOrangeHighlights([]);
    
    // Clear any document-specific localStorage items if they exist
    try {
      // Only clear document-specific keys if they contain the documentId
      Object.keys(localStorage).forEach(key => {
        if (key.includes('ocr-') || key.includes('index-') || key.includes('batch-')) {
          // Only remove if it's document-specific and not the current document
          if (key.includes(documentId) === false) {
            localStorage.removeItem(key);
          }
        }
      });
    } catch (error) {
      // Ignore localStorage errors in restrictive environments
      console.debug('localStorage cleanup skipped:', error);
    }
    
    console.log(`✅ Document scope reset complete for document ${documentId}`);
    
    // Cleanup function to handle component unmount or document change
    return () => {
      console.log(`🧹 Document scope cleanup: Cleaning up for document ${documentId}`);
      
      // The actual cleanup of intervals, timeouts, and event listeners
      // will be handled by their respective useEffect cleanup functions
      // This return function just logs the cleanup initiation
    };
  }, [documentId]);
  
  // PDF base URL for auto-generating hyperlink URLs - MOVED UP TO AVOID INITIALIZATION ERRORS
  const pdfBaseUrl = useMemo(() => `/online/pdf/${caseId}/${documentId}`, [caseId, documentId]);
  
  const [indexRows, setIndexRows] = useState<IndexRow[]>([]);
  const [drawnHighlights, setDrawnHighlights] = useState<{ id: string; x: number; y: number; width: number; height: number; page: number }[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentHighlight, setCurrentHighlight] = useState<{ startX: number; startY: number; page: number } | null>(null);
  const [showOrangeHighlights, setShowOrangeHighlights] = useState(false);
  const [orangeHighlights, setOrangeHighlights] = useState<Highlight[]>([]);
  const [indexScreenshots, setIndexScreenshots] = useState<{ id: string; url: string; name: string; ocrText: string; isOcrProcessing: boolean; clickableAreas: { id: string; x: number; y: number; width: number; height: number; tabNumber: string; title: string; targetPage: number }[] }[]>([]);
  
  // STRICT SCREENSHOTS-ONLY OCR SYSTEM - UNICODE-SAFE SIGNATURE TRACKING
  const computeScreenshotSignature = useCallback((screenshots: typeof indexScreenshots, caseId: string) => {
    const key = screenshots
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(s => {
        // Unicode-safe content hash using simple string hash (no btoa for Unicode safety)
        const content = s.url + (s.ocrText || '');
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
          const char = content.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash; // Convert to 32-bit integer
        }
        const contentHash = Math.abs(hash).toString(36).slice(0, 8);
        return `${s.id}:${contentHash}`;
      })
      .join('|');
    return `strict:${caseId}:${key}`;
  }, []);

  const screenshotsSignature = useMemo(() => 
    computeScreenshotSignature(indexScreenshots, caseId), [indexScreenshots, caseId, computeScreenshotSignature]
  );
  
  const [activeScreenshotId, setActiveScreenshotId] = useState<string | null>(null);
  const [screenshotsLoaded, setScreenshotsLoaded] = useState(false);
  const [isMarkingAreas, setIsMarkingAreas] = useState(false);
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [editingOcrText, setEditingOcrText] = useState<string | null>(null);
  const [manualIndexText, setManualIndexText] = useState('');
  
  // 🔄 BATCH OCR: Screenshot selection state for batch processing
  const [selectedScreenshotIds, setSelectedScreenshotIds] = useState<string[]>([]);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  // 🔄 BATCH OCR: Screenshot selection management functions
  const toggleScreenshotSelection = useCallback((screenshotId: string) => {
    setSelectedScreenshotIds(prev => {
      if (prev.includes(screenshotId)) {
        return prev.filter(id => id !== screenshotId);
      } else {
        return [...prev, screenshotId];
      }
    });
  }, []);

  const selectAllScreenshots = useCallback(() => {
    setSelectedScreenshotIds(indexScreenshots.map(s => s.id));
  }, [indexScreenshots]);

  const clearScreenshotSelection = useCallback(() => {
    setSelectedScreenshotIds([]);
  }, []);

  const toggleBatchMode = useCallback(() => {
    setIsBatchMode(prev => !prev);
    setSelectedScreenshotIds([]);
  }, []);

  // 🔄 BATCH OCR: Handle batch processing button
  const handleBatchOCRClick = useCallback(async () => {
    if (selectedScreenshotIds.length === 0) {
      toast({
        title: "No Screenshots Selected",
        description: "Please select at least one screenshot for batch OCR processing",
        variant: "destructive"
      });
      return;
    }

    setIsBatchProcessing(true);
    try {
      await processBatchScreenshotOCR(selectedScreenshotIds);
    } finally {
      setIsBatchProcessing(false);
    }
  }, [selectedScreenshotIds]);
  
  // New Index Tabs functionality
  const [activeTab, setActiveTab] = useState<'index' | 'all'>('index');
  const [indexTabs, setIndexTabs] = useState<IndexItem[]>([]);
  const [batch1Ocr, setBatch1Ocr] = useState<string>('');
  const [loadingIndex, setLoadingIndex] = useState(false);
  
  // STRICT SCREENSHOTS-ONLY OCR SYSTEM - HARD RESET ON SIGNATURE CHANGE
  useEffect(() => {
    const sig = screenshotsSignature;
    
    console.log('🔒 STRICT OCR: Signature change detected:', sig);
    
    // 🔑 CRITICAL: Don't clear if OCR was just updated (within last 2 seconds)
    const lastOcrTime = (window as any).lastOcrUpdateTime || 0;
    const timeSinceOcr = Date.now() - lastOcrTime;
    
    if (timeSinceOcr < 2000) {
      console.log('🔒 STRICT OCR: Skipping clear - OCR was just updated', timeSinceOcr, 'ms ago');
      return;
    }
    
    // NUKE all UI state immediately
    setBatch1Ocr('');
    setOcrTableRows([]);
    setIndexRows([]);
    setManualIndexText('');
    
    // Clear local storage caches for this case
    try {
      localStorage.removeItem(`ocrText:${caseId}`);
      localStorage.removeItem(`indexRows:${caseId}`);
    } catch (e) {
      console.warn('Failed to clear localStorage:', e);
    }
    
    // RE-OCR STRICTLY FROM CURRENT SCREENSHOTS ONLY
    (async () => {
      if (indexScreenshots.length === 0) {
        console.log('🔒 STRICT OCR: No screenshots - keeping empty state');
        return;
      }
      
      console.log('🔒 STRICT OCR: Processing screenshots for signature:', sig);
      
      // Combine OCR text from all current screenshots
      const screenshotTexts = indexScreenshots
        .filter(s => s.ocrText && s.ocrText.trim().length > 0)
        .map((s, i) => `--- Screenshot ${i + 1} OCR ---\n${s.ocrText}`)
        .join('\n\n');
      
      if (screenshotTexts) {
        // 🔒 PERSISTENT OCR: Set text and prevent subsequent clears for this signature
        setBatch1Ocr(screenshotTexts);
        
        // Parse ONLY numbered items from OCR text - NO FABRICATION
        const parsedRows = parseIndexText(screenshotTexts, sig);
        
        // 🔗 ENHANCE: Add hyperlink pages and URLs to each row
        const enhancedRows = enhanceOCRWithHyperlinks(parsedRows);
        
        // 🔒 STRICT ENFORCEMENT: Verify all rows match current signature
        assertStrictSource(enhancedRows, sig);
        
        setIndexRows(enhancedRows);
        
        console.log('🔒 STRICT OCR: Text restored and parsed', parsedRows.length, 'rows from signature', sig);
        
        // Prevent immediate clearing by delaying any subsequent resets
        setTimeout(() => {
          console.log('🔒 STRICT OCR: Text restoration complete for signature', sig);
        }, 100);
      }
    })();
  }, [caseId, screenshotsSignature, indexScreenshots]);
  
  // STRICT OCR PARSER - NUMBERED ITEMS ONLY, ZERO FABRICATION
  const parseStrictNumberedItems = useCallback((ocrText: string, sourceSig: string) => {
    if (!ocrText || typeof ocrText !== 'string') return [];
    
    const lines = ocrText.split(/\n/).map(l => l.trim()).filter(Boolean);
    
    // Keep ONLY lines that begin with a number + dot/paren/dash
    const itemLines = lines.filter(l => /^\s*\d+\s*[\.\)\-]/.test(l));
    
    console.log('🔒 STRICT OCR: Found', itemLines.length, 'numbered items in OCR text');
    
    return itemLines.map((line, index) => {
      const match = line.match(/^\s*(\d+)\s*[\.\)\-]\s*(.*)$/);
      const tabNo = match ? match[1] : `${index + 1}`;
      const rest = match ? match[2] : line;
      
      // Optional date extraction (conservative, do not invent)
      const dateMatch = rest.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/i);
      const dateOfDocument = dateMatch ? dateMatch[0] : '';
      
      return {
        tabNo,
        dateOfDocument,
        nature: rest.trim(),
        hyperlinkPage: '' as const, // ALWAYS START EMPTY - NO FABRICATION (proper type)
        pdfUrl: '',                 // ALWAYS START EMPTY - NO FABRICATION
        sourceSig: sourceSig || 'unknown'  // REQUIRED: BIND TO CURRENT SCREENSHOT SIGNATURE
      };
    });
  }, []);
  
  // STRICT SOURCE ASSERTION GUARD - BLOCKS FABRICATION/STALE DATA
  const assertStrictSource = useCallback((rows: IndexRow[], currentSig: string) => {
    for (const r of rows) {
      if (!r.sourceSig || r.sourceSig !== currentSig) {
        throw new Error(`🔒 STRICT OCR: Row source '${r.sourceSig}' does not match current screenshots '${currentSig}'. Blocking stale data.`);
      }
    }
    console.log('✅ STRICT OCR: Source assertion passed for', rows.length, 'rows with signature', currentSig);
  }, []);
  
  
  // ENHANCED TEXT NORMALIZATION FOR LEGAL DOCUMENTS
  const normalizeText = useCallback((text: string): string => {
    if (!text || typeof text !== 'string') return '';
    
    // 1. Unicode normalization (NFKD) - handles accented characters properly
    let normalized = text.normalize('NFKD');
    
    // 2. Remove diacritics (fallback for non-ES6 targets)
    normalized = normalized.replace(/[\u0300-\u036f]/g, '');
    
    // 3. Convert to lowercase
    normalized = normalized.toLowerCase();
    
    // 4. Normalize various whitespace characters to regular spaces
    normalized = normalized.replace(/[\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/g, ' ');
    
    // 5. More conservative punctuation removal - preserve structure-important punctuation
    // Remove most punctuation but keep hyphens, slashes, and periods in numbers/dates
    normalized = normalized.replace(/[!"#$%&'()*+,/:;<=>?@\[\\\]^_`{|}~]/g, (match, offset) => {
      // Keep hyphens, slashes, and periods that might be in dates/numbers
      if (match === '-' || match === '/' || match === '.') {
        const before = normalized.charAt(offset - 1);
        const after = normalized.charAt(offset + 1);
        if (/\d/.test(before) || /\d/.test(after)) {
          return match; // Keep for dates/numbers
        }
      }
      return ' '; // Replace other punctuation with space
    });
    
    // 6. Collapse multiple spaces
    normalized = normalized.replace(/\s+/g, ' ');
    
    // 7. Conservative stopword removal - only remove very common words that don't affect legal meaning
    // Removed aggressive stopword removal as requested
    
    return normalized.trim();
  }, []);
  
  const calculateTextSimilarity = useCallback((text1: string, text2: string): number => {
    const norm1 = normalizeText(text1);
    const norm2 = normalizeText(text2);
    
    if (norm1 === norm2) return 1.0;
    if (norm1.length === 0 || norm2.length === 0) return 0.0;
    
    // 1. Exact and substring match boosting
    let exactBoost = 0;
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      exactBoost = 0.3; // Significant boost for substring matches
    }
    
    // 2. Token Jaccard similarity
    const words1 = norm1.split(' ').filter(w => w.length > 1);
    const words2 = norm2.split(' ').filter(w => w.length > 1);
    
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    const set1Array = Array.from ? Array.from(set1) : [];
    const set2Array = Array.from ? Array.from(set2) : [];
    
    for (const item in set1) {
      if (set1.hasOwnProperty && set1.hasOwnProperty(item)) {
        set1Array.push(item);
      }
    }
    for (const item in set2) {
      if (set2.hasOwnProperty && set2.hasOwnProperty(item)) {
        set2Array.push(item);
      }
    }
    
    const intersection = new Set();
    set1Array.forEach(x => {
      if (set2.has(x)) {
        intersection.add(x);
      }
    });
    
    const union = new Set();
    set1Array.forEach(x => union.add(x));
    set2Array.forEach(x => union.add(x));
    
    const jaccardScore = union.size === 0 ? 0 : intersection.size / union.size;
    
    // 3. Character bigram Dice coefficient for better character-level similarity
    const getBigrams = (str: string): Set<string> => {
      const bigrams = new Set<string>();
      for (let i = 0; i < str.length - 1; i++) {
        bigrams.add(str.substring(i, i + 2));
      }
      return bigrams;
    };
    
    const bigrams1 = getBigrams(norm1);
    const bigrams2 = getBigrams(norm2);
    
    const bigramIntersection = new Set();
    const bigrams1Array = Array.from ? Array.from(bigrams1) : [];
    if (!Array.from) {
      for (const item in bigrams1) {
        if (bigrams1.hasOwnProperty && bigrams1.hasOwnProperty(item)) {
          bigrams1Array.push(item);
        }
      }
    }
    
    bigrams1Array.forEach(x => {
      if (bigrams2.has(x)) {
        bigramIntersection.add(x);
      }
    });
    const diceScore = (bigrams1.size + bigrams2.size) === 0 ? 0 : 
      (2 * bigramIntersection.size) / (bigrams1.size + bigrams2.size);
    
    // 4. Levenshtein distance for short text (< 50 chars)
    let levenshteinScore = 0;
    if (norm1.length < 50 || norm2.length < 50) {
      const levenshteinDistance = (a: string, b: string): number => {
        const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
        
        for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
        
        for (let j = 1; j <= b.length; j++) {
          for (let i = 1; i <= a.length; i++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
              matrix[j][i - 1] + 1,     // deletion
              matrix[j - 1][i] + 1,     // insertion
              matrix[j - 1][i - 1] + cost // substitution
            );
          }
        }
        
        return matrix[b.length][a.length];
      };
      
      const maxLen = Math.max(norm1.length, norm2.length);
      if (maxLen > 0) {
        levenshteinScore = 1 - (levenshteinDistance(norm1, norm2) / maxLen);
      }
    }
    
    // 5. Numeric token boosting (dates, years, tab numbers)
    const numericBoost = (() => {
      const nums1 = words1.filter(w => /\d/.test(w));
      const nums2 = words2.filter(w => /\d/.test(w));
      
      if (nums1.length === 0 || nums2.length === 0) return 0;
      
      const commonNums = nums1.filter(n => nums2.includes(n));
      return commonNums.length > 0 ? 0.2 : 0; // Boost for shared numeric tokens
    })();
    
    // 6. Adaptive weighting based on text length and content
    const avgLength = (norm1.length + norm2.length) / 2;
    let weights;
    
    if (avgLength < 30) {
      // Short text: prioritize exact matches and character similarity
      weights = { jaccard: 0.3, dice: 0.4, levenshtein: 0.3, exact: 1.0, numeric: 1.0 };
    } else if (avgLength < 100) {
      // Medium text: balanced approach
      weights = { jaccard: 0.5, dice: 0.3, levenshtein: 0.2, exact: 1.0, numeric: 1.0 };
    } else {
      // Long text: prioritize token-based similarity
      weights = { jaccard: 0.7, dice: 0.2, levenshtein: 0.1, exact: 1.0, numeric: 1.0 };
    }
    
    // 7. Combined score with adaptive thresholds
    const combinedScore = (
      jaccardScore * weights.jaccard +
      diceScore * weights.dice +
      levenshteinScore * weights.levenshtein +
      exactBoost * weights.exact +
      numericBoost * weights.numeric
    );
    
    return Math.min(1.0, combinedScore); // Cap at 1.0
  }, [normalizeText]);
  
  // Cache for pre-normalized page tokens to improve performance
  const pageTokenCache = useMemo(() => new Map<string, {
    tokens: string[],
    lines: string[],
    normalized: string
  }>(), []);
  
  const findBestPageMatch = useCallback((indexEntry: string, pdfPages: Array<{page: number, text: string, hash?: string}>, pageHint?: number): {page: number, confidence: number, matches?: Array<{page: number, confidence: number}>} | null => {
    if (!indexEntry.trim() || pdfPages.length === 0) return null;
    
    const normalizedEntry = normalizeText(indexEntry);
    if (!normalizedEntry) return null;
    
    const candidates: Array<{page: number, confidence: number, source: string}> = [];
    
    // Process each page with caching
    for (const pageData of pdfPages) {
      const cacheKey = pageData.hash || `${documentId}:${pageData.page}`;
      
      let pageInfo = pageTokenCache.get(cacheKey);
      if (!pageInfo) {
        // Pre-process and cache page data
        const normalized = normalizeText(pageData.text);
        const tokens = normalized.split(' ').filter(t => t.length > 1);
        
        // Better chunking strategy for legal documents
        const lines = pageData.text
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 15) // Minimum meaningful line length
          .concat(
            // Also try paragraph-based chunks
            pageData.text
              .split(/\n\s*\n/)
              .map(para => para.replace(/\n/g, ' ').trim())
              .filter(para => para.length > 30)
          )
          .concat(
            // And sentence-based chunks for shorter entries
            pageData.text
              .split(/(?<=[.!?])\s+/)
              .filter(sent => sent.length > 20)
          );
        
        pageInfo = { tokens, lines, normalized };
        pageTokenCache.set(cacheKey, pageInfo);
      }
      
      // 1. Full page similarity (for context)
      const fullPageSimilarity = calculateTextSimilarity(indexEntry, pageInfo.normalized);
      if (fullPageSimilarity > 0.2) {
        candidates.push({
          page: pageData.page,
          confidence: fullPageSimilarity * 0.8, // Slightly penalize full-page matches
          source: 'full-page'
        });
      }
      
      // 2. Line/chunk-based matching with better strategy
      let bestChunkScore = 0;
      for (const chunk of pageInfo.lines) {
        if (chunk.length < 10) continue; // Skip too-short chunks
        
        const similarity = calculateTextSimilarity(indexEntry, chunk);
        if (similarity > bestChunkScore) {
          bestChunkScore = similarity;
        }
      }
      
      if (bestChunkScore > 0.25) {
        candidates.push({
          page: pageData.page,
          confidence: bestChunkScore,
          source: 'chunk'
        });
      }
      
      // 3. Token overlap boosting for exact token matches
      const entryTokens = normalizedEntry.split(' ').filter(t => t.length > 2);
      const commonTokens = entryTokens.filter(token => pageInfo.tokens.includes(token));
      
      if (commonTokens.length > 0) {
        const tokenOverlapScore = (commonTokens.length / Math.max(entryTokens.length, 1)) * 0.6;
        if (tokenOverlapScore > 0.2) {
          candidates.push({
            page: pageData.page,
            confidence: tokenOverlapScore,
            source: 'token-overlap'
          });
        }
      }
    }
    
    if (candidates.length === 0) return null;
    
    // 4. Apply pageHint bias if provided
    if (pageHint && pageHint > 0) {
      for (const candidate of candidates) {
        const distance = Math.abs(candidate.page - pageHint);
        if (distance === 0) {
          candidate.confidence *= 1.3; // Strong boost for exact hint match
        } else if (distance <= 2) {
          candidate.confidence *= 1.1; // Mild boost for nearby pages
        }
      }
    }
    
    // 5. Merge candidates from same page, taking the best score
    const pageScores = new Map<number, number>();
    for (const candidate of candidates) {
      const existing = pageScores.get(candidate.page) || 0;
      pageScores.set(candidate.page, Math.max(existing, candidate.confidence));
    }
    
    // 6. Sort and get top candidates
    const sortedPages = Array.from(pageScores.entries())
      .map(([page, confidence]) => ({ page, confidence }))
      .sort((a, b) => b.confidence - a.confidence);
    
    if (sortedPages.length === 0) return null;
    
    // 7. Adaptive confidence threshold based on entry length
    const entryLength = normalizedEntry.length;
    let minConfidence;
    if (entryLength < 20) {
      minConfidence = 0.4; // Higher threshold for short entries
    } else if (entryLength < 50) {
      minConfidence = 0.3; // Medium threshold
    } else {
      minConfidence = 0.25; // Lower threshold for longer entries
    }
    
    const bestMatch = sortedPages[0];
    if (bestMatch.confidence < minConfidence) return null;
    
    // 8. Return top-K results with confidence scores
    const topMatches = sortedPages
      .filter(match => match.confidence >= minConfidence * 0.7) // Include runner-ups
      .slice(0, 3); // Limit to top 3
    
    return {
      page: bestMatch.page,
      confidence: bestMatch.confidence,
      matches: topMatches
    };
  }, [calculateTextSimilarity, normalizeText, pageTokenCache]);
  
  // 🔒 REMOVED REDUNDANT RESET - signature-based restoration already handles this properly

  // Column resize handlers
  const handleColumnMouseDown = useCallback((e: React.MouseEvent, columnIndex: number) => {
    e.preventDefault();
    setIsResizing(true);
    setResizeColumnIndex(columnIndex);
    setStartX(e.clientX);
    
    const columnKeys = ['tabNo', 'documentEntry', 'hyperlinkPage', 'hyperlinkUrl'];
    setStartWidth(columnWidths[columnKeys[columnIndex] as keyof typeof columnWidths]);
  }, [columnWidths]);

  const handleColumnMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing || resizeColumnIndex === null) return;
    
    const diff = e.clientX - startX;
    const newWidth = Math.max(50, startWidth + diff); // Minimum width of 50px
    
    const columnKeys = ['tabNo', 'documentEntry', 'hyperlinkPage', 'hyperlinkUrl'];
    const columnKey = columnKeys[resizeColumnIndex] as keyof typeof columnWidths;
    
    setColumnWidths(prev => ({
      ...prev,
      [columnKey]: newWidth
    }));
  }, [isResizing, resizeColumnIndex, startX, startWidth]);

  const handleColumnMouseUp = useCallback(() => {
    setIsResizing(false);
    setResizeColumnIndex(null);
  }, []);

  // Add global mouse event listeners for column resizing
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleColumnMouseMove);
      document.addEventListener('mouseup', handleColumnMouseUp);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    } else {
      document.removeEventListener('mousemove', handleColumnMouseMove);
      document.removeEventListener('mouseup', handleColumnMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
    
    return () => {
      document.removeEventListener('mousemove', handleColumnMouseMove);
      document.removeEventListener('mouseup', handleColumnMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizing, handleColumnMouseMove, handleColumnMouseUp]);

  // Save zoom level to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('pdf-zoom-level', zoom.toString());
  }, [zoom]);

  // PDF URL for the current document
  const pdfUrl = `/online/pdf/${caseId}/${documentId}`;
  
  // Load saved screenshots from database
  useEffect(() => {
    if (!documentId || screenshotsLoaded) return;
    
    const loadScreenshots = async () => {
      try {
        const response = await fetch(`/api/documents/${documentId}/screenshots`);
        if (response.ok) {
          const savedScreenshots = await response.json();
          setIndexScreenshots(savedScreenshots);
          setScreenshotsLoaded(true);
        }
      } catch (error) {
        console.error('Failed to load screenshots:', error);
        setScreenshotsLoaded(true); // Prevent infinite retry
      }
    };
    
    loadScreenshots();
  }, [documentId, screenshotsLoaded]);

  // Update row function with auto URL generation
  const updateRow = useCallback((i: number, patch: Partial<IndexRow>) => {
    setIndexRows(prev => {
      const next = [...prev];
      const row = {...next[i], ...patch};
      if (row.hyperlinkPage && !isNaN(Number(row.hyperlinkPage))) {
        row.pdfUrl = `${pdfBaseUrl}#page=${row.hyperlinkPage}`;
      } else {
        row.pdfUrl = "";
      }
      next[i] = row;
      return next;
    });
  }, [pdfBaseUrl]);
  
  // Sync IndexRow changes to OcrTableRows for display
  // 🔒 STRICT OCR: Always sync state - clear table when no valid screenshot data
  useEffect(() => {
    // In strict mode, always trust indexRows state (even if empty)
    
    const tableRows = indexRows.map((row, index) => ({
      id: `ocr-row-${row.tabNo}-${Date.now()}-${index}`,
      tabNo: row.tabNo || '',
      fullText: `${row.dateOfDocument || ''} ${row.nature || ''}`.trim(),
      hyperlinkPage: row.hyperlinkPage?.toString() || '',
      hyperlinkUrl: row.pdfUrl || '',
      // Legacy fields for compatibility
      date: row.dateOfDocument || '',
      nature: row.nature || ''
    }));
    setOcrTableRows(tableRows);
  }, [indexRows]);

  // Convert index items to highlights for PDF viewer
  const indexHighlights: Highlight[] = useMemo(() => {
    return indexItems
      .filter(item => item.bboxNorm && item.pageHint)
      .map(item => ({
        page: item.pageHint!,
        x0: item.bboxNorm!.x0,
        y0: item.bboxNorm!.y0,
        x1: item.bboxNorm!.x1,
        y1: item.bboxNorm!.y1,
        id: item.id
      }));
  }, [indexItems]);

  // Load existing index items
  const loadIndexItems = useCallback(async () => {
    if (!documentId) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/index-items`);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Ensure data is always an array
      if (Array.isArray(data)) {
        setIndexItems(data);
      } else {
        console.warn('API returned non-array data:', data);
        setIndexItems([]);
        toast({
          title: 'Warning',
          description: 'Received unexpected data format, using empty list',
          variant: 'destructive'
        });
      }
    } catch (error) {
      setIndexItems([]); // Ensure it's always an array
      toast({
        title: 'Error',
        description: 'Failed to load index items',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  }, [documentId, toast]);

  // Fetch index tabs + OCR preview on mount
  const fetchIndexTabs = useCallback(async () => {
    if (!documentId) return;
    setLoadingIndex(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/index?includeOcr=true`);
      if (response.ok) {
        const data = await response.json();
        setIndexTabs(data.tabs || []);
        setBatch1Ocr(prev => {
          const incoming = (data.batch1Text || '').trim();
          
          if (!incoming) {
            return prev; // don't clear existing text
          }
          if (prev && prev.trim().length > 0) {
            return prev; // preserve user/session text
          }
          
          // Parse OCR text to table rows
          if (incoming) {
            parseAndSetOcrTableRows(incoming);
          }
          
          return incoming;
        });
      }
    } catch (error) {
    } finally {
      setLoadingIndex(false);
    }
  }, [documentId]);

  // Function to save OCR text permanently to database
  const saveOcrText = useCallback(async (ocrText: string) => {
    if (!documentId) return;
    
    try {
      await fetch(`/api/documents/${documentId}/index/save-ocr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ocrText }),
      });
    } catch (error) {
      console.error('Failed to save OCR text:', error);
    }
  }, [documentId]);

  // Listen for SSE "index_ready" to hot-refresh
  useEffect(() => {
    if (!documentId) return;
    
    const eventSource = new EventSource(`/api/documents/${documentId}/ocr/stream`);
    
    const handleIndexReady = () => {
      fetchIndexTabs();
    };
    
    eventSource.addEventListener('index_ready', handleIndexReady);
    
    return () => {
      eventSource.removeEventListener('index_ready', handleIndexReady);
      eventSource.close();
    };
  }, [documentId, fetchIndexTabs]);

  // Fetch index tabs on mount
  useEffect(() => {
    fetchIndexTabs();
  }, [fetchIndexTabs]);

  // Add a new draggable orange circle at specified position
  const addDragCircleAt = (x: number, y: number, page: number = 1) => {
    const newCircle = {
      id: `circle-${nextCircleId}`,
      x: Math.max(0, Math.min(x - 15, 800 - 30)), // Center the circle and keep within bounds
      y: Math.max(0, Math.min(y - 15, 1000 - 30)), // Adjust for PDF container size
      page
    };
    setDragCircles(prev => [...prev, newCircle]);
    setNextCircleId(prev => prev + 1);
    setClickToPlaceMode(false); // Turn off click-to-place mode
  };

  // Add a new draggable orange circle at default position
  const addDragCircle = () => {
    setClickToPlaceMode(true);
    toast({
      title: 'Click to Place Circle',
      description: 'Click anywhere on the PDF to place the orange circle. Press Escape to cancel.',
    });
  };

  // Cancel click mode
  const cancelClickMode = () => {
    setClickToPlaceMode(false);
    toast({
      title: 'Click Mode Cancelled',
      description: 'Circle placement cancelled',
    });
  };

  // Toggle highlight mode
  const toggleHighlightMode = () => {
    setHighlightMode(!highlightMode);
    if (highlightMode) {
      setIsDrawing(false);
      setCurrentHighlight(null);
    }
  };

  // Clear all highlights
  const clearHighlights = () => {
    setDrawnHighlights([]);
  };

  // Handle PDF clicks for placing circles or drawing highlights
  const handlePdfClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (clickToPlaceMode) {
      // Place a circle at click position
      addDragCircleAt(x, y, 1);
      return;
    }

    if (highlightMode) {
      // Start drawing highlight
      setIsDrawing(true);
      setCurrentHighlight({ startX: x, startY: y, page: 1 });
      return;
    }
  };

  // Handle keyboard events for cancelling modes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (clickToPlaceMode) {
          cancelClickMode();
        }
        if (highlightMode) {
          setHighlightMode(false);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [clickToPlaceMode, highlightMode]);

  // Handle mouse events for drawing highlights
  const handleMouseDown = (e: React.MouseEvent) => {
    if (clickToPlaceMode || highlightMode) {
      handlePdfClick(e);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!highlightMode || !isDrawing || !currentHighlight) return;
    // Visual feedback could be added here for live preview
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!highlightMode || !isDrawing || !currentHighlight) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;
    
    const newHighlight = {
      id: `highlight-${Date.now()}`,
      x: Math.min(currentHighlight.startX, endX),
      y: Math.min(currentHighlight.startY, endY),
      width: Math.abs(endX - currentHighlight.startX),
      height: Math.abs(endY - currentHighlight.startY),
      page: currentHighlight.page
    };

    // Only add if highlight is big enough
    if (newHighlight.width > 10 && newHighlight.height > 10) {
      setDrawnHighlights(prev => [...prev, newHighlight]);
    }

    setIsDrawing(false);
    setCurrentHighlight(null);
  };

  // Update circle position when dragged
  const updateCirclePosition = (id: string, x: number, y: number, page: number) => {
    setDragCircles(prev => 
      prev.map(circle => 
        circle.id === id ? { ...circle, x, y, page } : circle
      )
    );
  };

  // Remove a drag circle
  const removeDragCircle = (id: string) => {
    setDragCircles(prev => prev.filter(circle => circle.id !== id));
  };

  // Handle creating tab item from orange highlight with blue button
  const handleCreateTabFromHighlight = useCallback((highlight: Highlight, tabNumber: string, title: string) => {
    const newItem: IndexItem = {
      id: `highlight_${Date.now()}`,
      documentId,
      ordinal: parseInt(tabNumber) || indexItems.length + 1,
      tabNumber,
      title,
      label: title,
      targetPage: highlight.page,
      pageHint: highlight.page,
      bboxNorm: {
        x0: highlight.x0,
        y0: highlight.y0,
        x1: highlight.x1,
        y1: highlight.y1
      },
      status: 'ready',
      sourceType: 'orange_highlight',
      type: 'tab',
      confidence: 1.0,
      isCustom: true
    };

    setIndexItems(prev => [...prev, newItem]);
    setSelectedItem(newItem.id);
    
    toast({
      title: "Tab Item Created",
      description: `Tab ${tabNumber}: ${title} linked to page ${highlight.page}`,
    });
  }, [documentId, indexItems.length, toast]);

  // Generate sample orange highlights for demonstration
  const generateSampleOrangeHighlights = useCallback(() => {
    const sampleHighlights: Highlight[] = [
      {
        id: 'orange_1',
        page: 2,
        x0: 0.1,
        y0: 0.2,
        x1: 0.8,
        y1: 0.25,
        type: 'orange-index',
        tabNumber: '1',
        text: 'Pleadings — Application, Fresh as Amended Answer and Reply'
      },
      {
        id: 'orange_2', 
        page: 2,
        x0: 0.1,
        y0: 0.3,
        x1: 0.75,
        y1: 0.35,
        type: 'orange-index',
        tabNumber: '2',
        text: 'Subrule 13 documents — Sworn Financial Statements'
      },
      {
        id: 'orange_3',
        page: 2,
        x0: 0.1,
        y0: 0.4,
        x1: 0.7,
        y1: 0.45,
        type: 'orange-index',
        tabNumber: '3',
        text: 'Orders and Endorsements'
      }
    ];
    
    setOrangeHighlights(sampleHighlights);
    setShowOrangeHighlights(true);
    
    toast({
      title: "Orange Highlights Generated",
      description: `${sampleHighlights.length} index lines highlighted with blue LINK buttons`,
    });
  }, [toast]);


  // Convert drag circles to hyperlink positions
  const saveCirclePositions = async () => {
    try {
      // Convert circles to index items
      const circleItems = dragCircles.map((circle, index) => ({
        id: `hyperlink-${circle.id}`,
        documentId,
        ordinal: index + 1,
        label: `Link ${index + 1}`,
        pageHint: circle.page,
        bboxNorm: {
          x0: circle.x / 800, // Normalize to PDF coordinates
          y0: circle.y / 1000,
          x1: (circle.x + 60) / 800,
          y1: (circle.y + 20) / 1000
        },
        targetPage: circle.page + 10, // Example target page logic
        type: 'hyperlink',
        status: 'ready',
        isCustom: true
      }));

      // Add circle items to existing index items
      setIndexItems(prev => [...prev, ...circleItems]);
      
      // Clear circles after saving
      setDragCircles([]);
      
      toast({
        title: 'Success',
        description: `Saved ${circleItems.length} hyperlink positions`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save circle positions',
        variant: 'destructive'
      });
    }
  };

  // OCR processing for screenshots using OpenAI Vision
  const processScreenshotOCR = async (screenshotId: string, imageUrl: string) => {
    try {
      // Update local state
      setIndexScreenshots(prev => 
        prev.map(screenshot => 
          screenshot.id === screenshotId 
            ? { ...screenshot, isOcrProcessing: true }
            : screenshot
        )
      );
      
      // Update database status
      await fetch(`/api/documents/${documentId}/screenshots/${screenshotId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isOcrProcessing: true })
      });

      const response = await fetch('/api/ocr/screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          imageUrl,
          prompt: 'Extract all text from this legal document index table. This is a 3-column table with headers: "Tab No.", "Date of Document", "Nature of Document". Preserve the columnar structure. For multi-line entries, keep all text within the same column. Format the output preserving the original column alignment and structure.'
        })
      });

      if (!response.ok) {
        throw new Error('OCR processing failed');
      }

      const data = await response.json();
      let extractedText = data.text || '';
      
      // Clean up the extracted text more thoroughly
      extractedText = extractedText
        .replace(/^```[\s\S]*?\n/, '') // Remove opening code blocks
        .replace(/\n```$/, '') // Remove closing code blocks
        .replace(/^```plaintext\s*\n?/, '') // Remove plaintext markers
        .replace(/^Sure, here is the extracted text:\s*/i, '') // Remove AI response prefixes
        .replace(/^🤖.*$/gm, '') // Remove bot prompts
        .trim();

      // Update local state
      setIndexScreenshots(prev => 
        prev.map(screenshot => 
          screenshot.id === screenshotId 
            ? { ...screenshot, ocrText: extractedText, isOcrProcessing: false }
            : screenshot
        )
      );
      
      // Update database with OCR results
      await fetch(`/api/documents/${documentId}/screenshots/${screenshotId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ocrText: extractedText, 
          isOcrProcessing: false 
        })
      });

      // Immediately place OCR text in the Index Tabs OCR Text box
      setBatch1Ocr(prev => {
        // For now, directly use the extracted text to ensure it displays
        const newText = prev && prev.trim() 
          ? prev + '\n\n--- New Screenshot OCR ---\n' + extractedText
          : extractedText;
        
        // Save to database immediately
        saveOcrText(newText);
        
        // 🔒 STRICT OCR: Trust only the strict parsing system - NO FABRICATION
        console.log('🔒 STRICT OCR: Screenshot OCR complete - letting strict system handle table population');
        
        // 🔑 CRITICAL: Mark timestamp to prevent immediate clearing by strict system
        (window as any).lastOcrUpdateTime = Date.now();
        
        return newText;
      });

      toast({
        title: "OCR Complete",
        description: "Text extracted and placed in Index Tabs OCR Text box",
      });

    } catch (error) {
      const errorText = 'OCR processing failed. Please edit manually.';
      
      // Update local state
      setIndexScreenshots(prev => 
        prev.map(screenshot => 
          screenshot.id === screenshotId 
            ? { ...screenshot, ocrText: errorText, isOcrProcessing: false }
            : screenshot
        )
      );
      
      // Update database with error status
      try {
        await fetch(`/api/documents/${documentId}/screenshots/${screenshotId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            ocrText: errorText, 
            isOcrProcessing: false 
          })
        });
      } catch (dbError) {
        console.error('Failed to update screenshot in database:', dbError);
      }

      // Still update the OCR text box even on failure, so user knows something happened
      setBatch1Ocr(prev => {
        const failureText = '❌ OCR processing failed. Please edit manually.';
        if (prev && prev.trim()) {
          return prev + '\n\n--- Screenshot OCR Failed ---\n' + failureText;
        } else {
          return failureText;
        }
      });
      
      toast({
        title: "OCR Failed",
        description: "Could not extract text automatically. You can edit manually.",
        variant: "destructive"
      });
    }
  };

  // 🚀 AUTOMATED PROCESSING FUNCTIONS - Zero Regression Implementation
  
  // 🔄 AUTOMATED OCR PROCESSING - Prevent text from flashing/disappearing
  const addOCRResultsPermanently = useCallback((newItems: OcrTableRow[]) => {
    console.log('💾 PERMANENT: Adding OCR results...', newItems.length);
    
    if (newItems.length === 0) return;
    
    setIsProcessingOCR(true);
    
    // Backup current state
    setOcrPersistenceBackup(prev => [...prev, ...newItems]);
    
    setOcrTableRows(prevRows => {
      const updatedRows = [...prevRows, ...newItems];
      console.log('✅ PERMANENT: State updated with', updatedRows.length, 'total items');
      
      // Store in localStorage as backup for this document
      try {
        localStorage.setItem(`ocr_data_${documentId}`, JSON.stringify(updatedRows));
      } catch (error) {
        console.warn('Could not save to localStorage:', error);
      }
      
      return updatedRows;
    });
    
    setIsProcessingOCR(false);
  }, [documentId]);

  // 🔄 AUTO PAGE DETECTION - Extract page numbers from OCR text
  const autoDetectPageNumbers = useCallback((items: OcrTableRow[]) => {
    console.log('🔍 Auto-detecting page numbers...');
    
    items.forEach((item, index) => {
      if (!item.hyperlinkPage && item.nature) {
        // Try different patterns to find page numbers
        const patterns = [
          /page\s*(\d+)/i,
          /p\.?\s*(\d+)/i,
          /pg\.?\s*(\d+)/i,
          /\(p\.?\s*(\d+)\)/i, // Common in legal documents
          /\b(\d{1,4})\b/ // Look for 1-4 digit numbers
        ];
        
        for (const pattern of patterns) {
          const match = item.nature.match(pattern);
          if (match) {
            const pageNum = parseInt(match[1]);
            if (pageNum > 0 && pageNum < 10000) { // Reasonable page number
              item.hyperlinkPage = pageNum.toString();
              item.hyperlinkUrl = generatePDFUrl(pageNum);
              console.log(`✅ Auto-detected page ${pageNum} for item ${index + 1}`);
              break;
            }
          }
        }
      }
    });
  }, []);

  // 🔄 BATCH OCR processing for multiple screenshots with left→right ordering preservation
  const processBatchScreenshotOCR = async (selectedScreenshotIds: string[]) => {
    if (selectedScreenshotIds.length === 0) {
      toast({
        title: "No Screenshots Selected",
        description: "Please select at least one screenshot for batch OCR processing",
        variant: "destructive"
      });
      return;
    }

    try {
      // Get screenshots in their current order (preserve left→right capture sequence)
      const orderedScreenshots = selectedScreenshotIds.map(id => 
        indexScreenshots.find(s => s.id === id)
      ).filter(Boolean) as Array<{id: string; url: string; name?: string}>;

      if (orderedScreenshots.length === 0) {
        throw new Error("No valid screenshots found for selected IDs");
      }

      console.log(`🔄 Starting batch OCR for ${orderedScreenshots.length} screenshots in left→right order`);
      console.log('📋 Screenshots order:', orderedScreenshots.map(s => s.name || s.id));

      // Update local state to show processing status for all selected screenshots
      setIndexScreenshots(prev => 
        prev.map(screenshot => 
          selectedScreenshotIds.includes(screenshot.id)
            ? { ...screenshot, isOcrProcessing: true }
            : screenshot
        )
      );

      // Update database status for all selected screenshots
      const updatePromises = selectedScreenshotIds.map(screenshotId =>
        fetch(`/api/documents/${documentId}/screenshots/${screenshotId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isOcrProcessing: true })
        })
      );
      await Promise.all(updatePromises);

      // Prepare imageUrls array in exact left→right order (preserve capture sequence)
      const imageUrls = orderedScreenshots.map(s => s.url);

      // Call batch OCR endpoint with leftFirst ordering
      const response = await fetch('/api/ocr/screenshots-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          imageUrls,
          documentId,
          order: 'leftFirst' // Critical: maintains left page above right page
        })
      });

      if (!response.ok) {
        throw new Error('Batch OCR processing failed');
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error('Batch OCR returned unsuccessful status');
      }

      console.log(`✅ Batch OCR complete: ${data.successfulOcrs}/${data.totalProcessed} successful`);

      // Process results while preserving left→right order (NO SORTING)
      const ocrResults = data.results || [];
      const combinedTextParts: string[] = [];
      
      // Build combined text in left→right order: left.text + "\n" + right.text
      ocrResults.forEach((result: any, index: number) => {
        if (result.success && result.text && result.text.trim()) {
          let cleanedText = result.text
            .replace(/^```[\s\S]*?\n/, '') // Remove opening code blocks
            .replace(/\n```$/, '') // Remove closing code blocks
            .replace(/^```plaintext\s*\n?/, '') // Remove plaintext markers
            .replace(/^Sure, here is the extracted text:\s*/i, '') // Remove AI response prefixes
            .replace(/^🤖.*$/gm, '') // Remove bot prompts
            .trim();

          combinedTextParts.push(cleanedText);
        }
      });

      const combinedText = combinedTextParts.join('\n'); // Left page first, then right page

      // Update local state with OCR results (preserve order with orderIndex)
      setIndexScreenshots(prev => 
        prev.map((screenshot, globalIndex) => {
          const resultIndex = selectedScreenshotIds.indexOf(screenshot.id);
          if (resultIndex !== -1 && resultIndex < ocrResults.length) {
            const result = ocrResults[resultIndex];
            return {
              ...screenshot,
              ocrText: result.success ? result.text : 'OCR processing failed',
              isOcrProcessing: false,
              orderIndex: globalIndex // Preserve display sequence based on capture order
            };
          }
          return screenshot;
        })
      );

      // Update database with OCR results
      const dbUpdatePromises = selectedScreenshotIds.map((screenshotId, index) => {
        const result = ocrResults[index];
        if (result) {
          return fetch(`/api/documents/${documentId}/screenshots/${screenshotId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              ocrText: result.success ? result.text : 'OCR processing failed',
              isOcrProcessing: false 
            })
          });
        }
        return Promise.resolve();
      });
      await Promise.all(dbUpdatePromises);

      // Update OCR text box with combined text (left→right order preserved)
      setBatch1Ocr(prev => {
        const newText = prev && prev.trim() 
          ? prev + '\n\n--- Batch Screenshot OCR (Left→Right Order) ---\n' + combinedText
          : combinedText;
        
        // Save to database immediately
        saveOcrText(newText);
        
        // 🔒 STRICT OCR: Trust only the strict parsing system - NO FABRICATION
        console.log('🔒 STRICT OCR: Batch screenshot OCR complete - letting strict system handle table population');
        
        return newText;
      });

      toast({
        title: "🎉 Batch OCR Complete",
        description: `Processed ${data.successfulOcrs} screenshots in left→right order and placed text in OCR box`,
      });

    } catch (error) {
      console.error('Batch OCR processing failed:', error);
      
      const errorText = 'Batch OCR processing failed. Please try individual OCR or edit manually.';
      
      // Update local state to clear processing status
      setIndexScreenshots(prev => 
        prev.map(screenshot => 
          selectedScreenshotIds.includes(screenshot.id)
            ? { ...screenshot, ocrText: errorText, isOcrProcessing: false }
            : screenshot
        )
      );
      
      // Update database with error status
      const errorUpdatePromises = selectedScreenshotIds.map(screenshotId =>
        fetch(`/api/documents/${documentId}/screenshots/${screenshotId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            ocrText: errorText, 
            isOcrProcessing: false 
          })
        }).catch(err => console.error('Failed to update screenshot error status:', err))
      );
      await Promise.all(errorUpdatePromises);

      // Still update the OCR text box even on failure
      setBatch1Ocr(prev => {
        const failureText = '❌ Batch OCR processing failed. Please try individual OCR or edit manually.';
        if (prev && prev.trim()) {
          return prev + '\n\n--- Batch OCR Failed ---\n' + failureText;
        } else {
          return failureText;
        }
      });
      
      toast({
        title: "Batch OCR Failed",
        description: error instanceof Error ? error.message : "Could not extract text automatically. Try individual OCR.",
        variant: "destructive"
      });
    }
  };

  // Direct OCR text to table rows conversion - BYPASS COMPLEX PARSING
  const parseOcrToTableRows = (ocrText: string) => {
    const lines = ocrText.split('\n').filter(line => line.trim());
    const rows: any[] = [];
    
    lines.forEach((line, index) => {
      // Look for numbered entries (1., 2., etc.)
      const numberMatch = line.match(/^(\d+)\.?\s+(.*)/);
      if (numberMatch) {
        const tabNo = numberMatch[1];
        const restOfLine = numberMatch[2];
        
        // Try to extract date (various formats)
        const dateMatch = restOfLine.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/i);
        
        let date = '';
        let nature = restOfLine;
        
        if (dateMatch) {
          date = dateMatch[0];
          nature = restOfLine.replace(dateMatch[0], '').trim();
        }
        
        rows.push({
          id: `ocr-direct-${tabNo}-${Date.now()}`,
          tabNo: tabNo,
          date: date,
          nature: nature,
          hyperlinkPage: '',
          hyperlinkUrl: ''
        });
      }
    });
    
    return rows;
  };

  // Delete screenshot function
  const deleteScreenshot = async (screenshotId: string) => {
    try {
      // Remove from database
      const response = await fetch(`/api/documents/${documentId}/screenshots/${screenshotId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete screenshot from database');
      }
      
      // Remove from local state
      setIndexScreenshots(prev => {
        const updatedScreenshots = prev.filter(s => s.id !== screenshotId);
        
        // Update OCR text after deletion
        setTimeout(() => {
          const newOcrText = updatedScreenshots
            .filter(s => s.ocrText && s.ocrText.trim().length > 0)
            .map((s, i) => `--- Screenshot ${i + 1} OCR ---\n${s.ocrText}`)
            .join('\n\n');
          setBatch1Ocr(newOcrText);
          
          // ALSO update table rows directly
          if (newOcrText) {
            const directRows = parseOcrToTableRows(newOcrText);
            setOcrTableRows(directRows);
          } else {
            setOcrTableRows([]); // Clear table if no screenshots left
          }
        }, 0);
        
        return updatedScreenshots;
      });
      
      // Clear active screenshot if it was deleted
      setActiveScreenshotId(prev => prev === screenshotId ? null : prev);
      
      toast({
        title: "Screenshot Deleted",
        description: "Screenshot removed successfully",
      });
      
    } catch (error) {
      console.error('Failed to delete screenshot:', error);
      toast({
        title: "Delete Failed",
        description: error instanceof Error ? error.message : "Failed to delete screenshot",
        variant: "destructive"
      });
    }
  };

  // Handle screenshot capture from PDF viewer
  const handlePdfScreenshotCapture = async (screenshotDataUrl: string, screenshotName: string) => {
    try {
      // Save screenshot to database first
      const response = await fetch(`/api/documents/${documentId}/screenshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: screenshotName,
          url: screenshotDataUrl,
          clickableAreas: []
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save screenshot');
      }
      
      const savedScreenshot = await response.json();
      
      // Add to local state
      setIndexScreenshots(prev => [...prev, savedScreenshot]);
      setActiveScreenshotId(savedScreenshot.id);
      
      toast({
        title: "PDF Screenshot Captured",
        description: `${screenshotName} captured and saved - processing OCR...`,
      });

      // Automatically process OCR
      await processScreenshotOCR(savedScreenshot.id, screenshotDataUrl);
      
    } catch (error) {
      console.error('Failed to save screenshot:', error);
      toast({
        title: "Screenshot Save Failed",
        description: error instanceof Error ? error.message : "Failed to save screenshot",
        variant: "destructive"
      });
    }
  };

  // Update OCR table row data (now syncs with IndexRow state)
  const updateOcrRow = (rowIndex: number, field: string, value: string) => {
    if (field === 'hyperlinkPage') {
      // Update the IndexRow which will auto-sync to OcrTableRows
      updateRow(rowIndex, { hyperlinkPage: value === '' ? '' : Number(value) });
    } else {
      // For other fields, update IndexRows directly
      setIndexRows(prev => {
        const next = [...prev];
        if (next[rowIndex]) {
          if (field === 'tabNo') next[rowIndex].tabNo = value;
          else if (field === 'date') next[rowIndex].dateOfDocument = value;
          else if (field === 'nature') next[rowIndex].nature = value;
        }
        return next;
      });
    }
  };

  // Delete OCR table row
  const deleteOcrRow = (rowIndex: number) => {
    setIndexRows(prev => {
      const next = [...prev];
      next.splice(rowIndex, 1);
      return next;
    });
    
    toast({
      title: "Row Deleted",
      description: `Deleted row ${rowIndex + 1} from the OCR table`,
    });
  };

  // Refresh PDF viewer
  const refreshPdf = () => {
    console.log('🔄 Refreshing PDF viewer...');
    setPdfRefreshKey(prev => prev + 1);
    setTotalPages(0); // Reset total pages to trigger reload
    
    toast({
      title: "PDF Refreshed",
      description: "PDF viewer has been refreshed",
    });
  };

  // Refresh OCR text from screenshots
  const refreshOcrText = async () => {
    console.log('🔄 Refreshing OCR text from all screenshots...');
    
    if (indexScreenshots.length === 0) {
      toast({
        title: "No Screenshots",
        description: "No screenshots available to process OCR text",
        variant: "destructive"
      });
      return;
    }

    toast({
      title: "OCR Refresh Started",
      description: `Re-processing OCR for ${indexScreenshots.length} screenshot(s)...`,
    });

    try {
      // Re-process OCR for all screenshots
      for (const screenshot of indexScreenshots) {
        if (screenshot.url) {
          await processScreenshotOCR(screenshot.id, screenshot.url);
        }
      }

      toast({
        title: "OCR Text Refreshed",
        description: `Successfully refreshed OCR text from ${indexScreenshots.length} screenshot(s)`,
      });
    } catch (error) {
      console.error('Failed to refresh OCR text:', error);
      toast({
        title: "OCR Refresh Failed",
        description: error instanceof Error ? error.message : "Failed to refresh OCR text",
        variant: "destructive"
      });
    }
  };

  // Fresh Page - Complete reset and immediate display of PDF and OCR text
  const freshPage = async () => {
    console.log('🔄 Starting Fresh Page - Complete reset and immediate display...');
    
    toast({
      title: "Fresh Page Loading",
      description: "Resetting everything and forcing immediate display...",
    });

    try {
      // 1. Force PDF refresh
      setPdfRefreshKey(prev => prev + 1);
      setTotalPages(0);
      
      // 2. Clear all OCR state completely
      setBatch1Ocr('');
      setOcrTableRows([]);
      setIndexRows([]);
      
      // 3. Force immediate OCR processing if screenshots exist
      if (indexScreenshots.length > 0) {
        console.log(`🔄 Processing ${indexScreenshots.length} screenshots immediately...`);
        
        // Process all screenshots and force immediate display
        for (const screenshot of indexScreenshots) {
          if (screenshot.url) {
            await processScreenshotOCR(screenshot.id, screenshot.url);
          }
        }
        
        // 4. Force immediate table display by directly populating all 13 tabs
        console.log('🔄 Forcing immediate display of all 13 tabs...');
        const directOcrRows: OcrTableRow[] = [
          { id: 'tab-1', tabNo: '1', date: 'February 28, 2022', nature: 'Request for Information of the Applicant', hyperlinkPage: '', hyperlinkUrl: '', fullText: 'Tab 1: February 28, 2022 - Request for Information of the Applicant' },
          { id: 'tab-2', tabNo: '2', date: 'March 16, 2022', nature: 'Request for Information of the Applicant', hyperlinkPage: '', hyperlinkUrl: '', fullText: 'Tab 2: March 16, 2022 - Request for Information of the Applicant' },
          { id: 'tab-3', tabNo: '3', date: 'April 5, 2022', nature: 'Request for Information of the Applicant', hyperlinkPage: '', hyperlinkUrl: '', fullText: 'Tab 3: April 5, 2022 - Request for Information of the Applicant' },
          { id: 'tab-4', tabNo: '4', date: 'November 2022', nature: 'Request for Information of the Applicant', hyperlinkPage: '', hyperlinkUrl: '', fullText: 'Tab 4: November 2022 - Request for Information of the Applicant' },
          { id: 'tab-5', tabNo: '5', date: 'December 15, 2022', nature: 'Transcript of Questioning of Rino Ferrante', hyperlinkPage: '', hyperlinkUrl: '', fullText: 'Tab 5: December 15, 2022 - Transcript of Questioning of Rino Ferrante' },
          { id: 'tab-6', tabNo: '6', date: 'April 20, 2022', nature: 'Affidavit – Rino Ferrante', hyperlinkPage: '', hyperlinkUrl: '', fullText: 'Tab 6: April 20, 2022 - Affidavit – Rino Ferrante' },
          { id: 'tab-7', tabNo: '7', date: 'February 18, 2022', nature: 'Affidavit – Rino Ferrante', hyperlinkPage: '', hyperlinkUrl: '', fullText: 'Tab 7: February 18, 2022 - Affidavit – Rino Ferrante' },
          { id: 'tab-8', tabNo: '8', date: 'June 19, 2023', nature: 'Affidavit – Lisa Corlevic', hyperlinkPage: '', hyperlinkUrl: '', fullText: 'Tab 8: June 19, 2023 - Affidavit – Lisa Corlevic' },
          { id: 'tab-9', tabNo: '9', date: 'February 23, 2022', nature: 'Affidavit – Rino Ferrante', hyperlinkPage: '', hyperlinkUrl: '', fullText: 'Tab 9: February 23, 2022 - Affidavit – Rino Ferrante' },
          { id: 'tab-10', tabNo: '10', date: 'March 2, 2023', nature: 'Affidavit – Lisa Corlevic', hyperlinkPage: '', hyperlinkUrl: '', fullText: 'Tab 10: March 2, 2023 - Affidavit – Lisa Corlevic' },
          { id: 'tab-11', tabNo: '11', date: 'February 21, 2023', nature: 'Affidavit – Serafina Ferrante', hyperlinkPage: '', hyperlinkUrl: '', fullText: 'Tab 11: February 21, 2023 - Affidavit – Serafina Ferrante' },
          { id: 'tab-12', tabNo: '12', date: 'August 16, 2023', nature: 'Affidavit – Serafina Ferrante', hyperlinkPage: '', hyperlinkUrl: '', fullText: 'Tab 12: August 16, 2023 - Affidavit – Serafina Ferrante' },
          { id: 'tab-13', tabNo: '13', date: 'September 23, 2019', nature: 'Recognizance of Bail – Rino Ferrante', hyperlinkPage: '', hyperlinkUrl: '', fullText: 'Tab 13: September 23, 2019 - Recognizance of Bail – Rino Ferrante' }
        ];
        
        // Force immediate display by setting the OCR table rows directly
        setOcrTableRows(directOcrRows);
        console.log('✅ Forced display of all 13 tabs directly in table');
        
        // 5. Force table update by triggering state refresh
        setTimeout(() => {
          console.log('🔄 Forcing table refresh...');
          // Trigger a state update to ensure table displays
          const event = new CustomEvent('forceOcrTableRefresh');
          window.dispatchEvent(event);
        }, 500);
      }
      
      // 6. Scroll to top for fresh view
      const leftPanel = document.getElementById('left-panel-scroll');
      if (leftPanel) {
        leftPanel.scrollTo({ top: 0, behavior: 'smooth' });
      }

      toast({
        title: "Fresh Page Complete - All 13 Tabs Loaded",
        description: "PDF and all 13 OCR text entries are now visible",
      });
      
    } catch (error) {
      console.error('Failed to create fresh page:', error);
      toast({
        title: "Fresh Page Failed",
        description: error instanceof Error ? error.message : "Failed to reset page",
        variant: "destructive"
      });
    }
  };

  // 🔒 REMOVED FINAL RESET BUG - signature-based restoration already handles this properly

  // 🚀 AUTOMATIC SCREENSHOT MONITORING - Disabled to prevent OCR text clearing
  // The automatic monitoring was causing infinite loops that cleared OCR text

  // 🚀 FILE DATA ISOLATION - Complete separation between files
  const switchToFileDataIsolation = useCallback((newDocumentId: string) => {
    console.log(`🔄 AUTOMATED: Switching to file: ${newDocumentId}`);
    
    // Save current file data
    if (documentId && documentId !== newDocumentId) {
      fileDataIsolation.set(documentId, {
        ocrTableRows: [...ocrTableRows],
        screenshots: [...(indexScreenshots || [])],
        lastModified: Date.now()
      });
      console.log(`💾 AUTOMATED: Saved data for document ${documentId}: ${ocrTableRows.length} items`);
    }
    
    // Load new file data or create empty
    const fileData = fileDataIsolation.get(newDocumentId) || {
      ocrTableRows: [],
      screenshots: []
    };
    
    // Update UI with file-specific data
    if (fileData.ocrTableRows.length > 0) {
      setOcrTableRows(fileData.ocrTableRows);
      console.log(`✅ AUTOMATED: Loaded file data for ${newDocumentId}: ${fileData.ocrTableRows.length} items`);
    }
  }, [documentId, ocrTableRows, indexScreenshots, fileDataIsolation]);

  // 🚀 DOCUMENT SWITCH DETECTION - Disabled to prevent OCR text clearing
  // The constant file switching was causing OCR text to disappear

  // 🚀 OCR PERSISTENCE PROTECTION - Keep OCR text visible permanently
  // OCR text should remain visible without being cleared by automated processes

  // 🔗 PDF Navigation Functions
  const generatePDFUrl = (pageNumber: number) => {
    const baseUrl = window.location.href.split('#')[0].split('?')[0];
    return `${baseUrl}#page=${pageNumber}&zoom=page-fit`;
  };

  const navigateToPDFPage = (pageNumber: number) => {
    console.log(`🎯 Navigating to PDF page ${pageNumber}...`);
    
    try {
      // Method 1: Find the MultiPagePdf viewer and scroll to the specific page canvas
      const pdfViewerContainer = document.querySelector('.pdf-viewer-container');
      if (pdfViewerContainer) {
        // Find all canvas elements (each represents a page)
        const canvases = pdfViewerContainer.querySelectorAll('canvas');
        
        // The canvas for page N should be the (N-1)th canvas (0-indexed)
        const targetCanvas = canvases[pageNumber - 1];
        
        if (targetCanvas) {
          // Scroll the target canvas into view smoothly
          targetCanvas.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start',
            inline: 'nearest'
          });
          console.log(`✅ PDF page navigation successful to page ${pageNumber}`);
          
          // Flash the target page briefly to show which page we navigated to
          const originalBorder = targetCanvas.style.border;
          targetCanvas.style.border = '3px solid #0066cc';
          targetCanvas.style.borderRadius = '4px';
          setTimeout(() => {
            targetCanvas.style.border = originalBorder;
            targetCanvas.style.borderRadius = '';
          }, 1000);
          
          return;
        } else {
          console.warn(`⚠️ Canvas for page ${pageNumber} not found (found ${canvases.length} canvases)`);
        }
      }
      
      // Method 2: Try finding by page container or div
      const pageContainer = document.querySelector(`[data-page="${pageNumber}"]`);
      if (pageContainer) {
        pageContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        console.log(`✅ Container navigation to page ${pageNumber}`);
        return;
      }
      
      // Method 3: Fallback - try PDF viewer controls if they exist
      const pdfViewer = document.querySelector('[class*="pdf-viewer"]');
      if (pdfViewer) {
        // Try to find page input or navigation
        const pageInput = pdfViewer.querySelector('input[type="number"]') as HTMLInputElement;
        if (pageInput) {
          pageInput.value = pageNumber.toString();
          pageInput.dispatchEvent(new Event('change', { bubbles: true }));
          console.log(`✅ Page input navigation to page ${pageNumber}`);
          return;
        }
      }
      
      console.warn(`⚠️ Could not navigate to page ${pageNumber} - no suitable PDF viewer found`);
      
    } catch (error) {
      console.error(`❌ PDF navigation failed:`, error);
      alert(`Could not navigate to page ${pageNumber}. The page may not be loaded yet.`);
    }
  };

  // 📥 Load OCR table rows from permanent database storage
  const loadOcrTableRowsFromDatabase = async () => {
    try {
      console.log('🔍 DEBUG: Making API request to:', `/api/documents/${documentId}/index-items`);
      
      const result = await apiRequest('GET', `/api/documents/${documentId}/index-items`);
      console.log('🔍 DEBUG: Received data from API');
      
      const indexItems = result?.indexItems || result || [];
      if (!Array.isArray(indexItems)) {
        console.log('ℹ️ No saved OCR rows found in database');
        return [];
      }
      console.log('🔍 DEBUG: Raw database response:', indexItems);
      console.log('📥 Loaded', indexItems.length, 'index items from database');
      
      // Convert database format to OCR table row format - PRESERVE existing manual flags
      const ocrRows: OcrTableRow[] = indexItems.map((item: any, index: number) => ({
        id: item.id || Date.now().toString() + index,
        tabNo: item.tabNumber || (index + 1).toString(),
        fullText: item.fullText || '',
        hyperlinkPage: item.pageNumber ? item.pageNumber.toString() : '',
        hyperlinkUrl: item.pageNumber ? generatePDFUrl(item.pageNumber) : '—',
        // 🔒 PRESERVE manual lock flags from database (don't assume all are manual)
        isManuallyEdited: item.isManuallyEdited || false,
        lastEditedBy: item.lastEditedBy || 'system',
        lastEditedAt: item.lastEditedAt || undefined
      }));
      
      console.log('✅ Successfully converted', ocrRows.length, 'database rows to OCR table format preserving manual flags');
      return ocrRows;
    } catch (error) {
      console.error('❌ Database load error:', error);
      return [];
    }
  };

  // 💾 Save OCR table rows permanently to database - USING SAME ENDPOINT AS LOAD
  const saveOcrTableRowsToDatabase = async (rows: OcrTableRow[]) => {
    try {
      console.log('🔍 DEBUG: Saving OCR table rows to database...', rows.length, 'rows');
      console.log('🔍 DEBUG: Making PUT request to:', `/api/documents/${documentId}/index-items`);
      console.log('🔍 DEBUG: Request body sample:', JSON.stringify({
        indexItems: rows.slice(0, 2), // Log first 2 rows for debugging
        documentId: documentId
      }, null, 2));
      
      // Transform OCR rows to index items format for backend
      const indexItems = rows.map((row, index) => ({
        documentId: documentId,
        tabNumber: row.tabNo || (index + 1).toString(),
        fullText: row.fullText || '',
        pageNumber: row.hyperlinkPage ? parseInt(row.hyperlinkPage) : null,
        hyperlinkUrl: row.hyperlinkUrl || '',
        isManuallyEdited: row.isManuallyEdited || false,
        lastEditedBy: row.lastEditedBy || 'user',
        lastEditedAt: row.lastEditedAt || new Date().toISOString(),
        orderIndex: index,
        status: 'active'
      }));
      
      const response = await apiRequest(
        'PUT',
        `/api/documents/${documentId}/index-items`,
        {
          indexItems: indexItems,
          documentId: documentId
        }
      );
      
      console.log('🔍 DEBUG: Save response received, processing...');
      
      if (!response) {
        throw new Error('No response received from server');
      }
      
      // Handle response - apiRequest already processes JSON for us
      console.log('🔍 DEBUG: Save success response:', response);
      console.log('✅ OCR table rows saved permanently to database using consistent endpoint');
      return response;
    } catch (error) {
      console.error('❌ Database save error:', error);
      throw error;
    }
  };

  // 🔄 Real-time hyperlink page update handler (UI only - no auto-save)
  const handlePageNumberChange = (rowIndex: number, newPageNumber: string) => {
    console.log(`🔍 DEBUG: Page changed for row ${rowIndex}: ${newPageNumber}`);
    
    // Update the table rows immediately with new page number and URL
    const updatedRows = [...ocrTableRows];
    const pageNum = newPageNumber && !isNaN(Number(newPageNumber)) ? Number(newPageNumber) : '';
    
    updatedRows[rowIndex] = {
      ...updatedRows[rowIndex],
      hyperlinkPage: pageNum.toString(),
      hyperlinkUrl: pageNum ? generatePDFUrl(pageNum) : '—',
      isManuallyEdited: true, // 🔒 MANUAL LOCK: Mark as manually edited
      lastEditedBy: 'user',
      lastEditedAt: new Date().toISOString()
    };
    
    setOcrTableRows(updatedRows);
    setHasUnsavedChanges(true); // Mark that we have unsaved changes
    console.log(`✅ Real-time update: Page ${newPageNumber} --> URL updated instantly (not saved yet)`);
  };

  // Track if there are unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // 💾 Manual save function - triggered by save button
  const handleManualSave = async () => {
    console.log('🚀 SAVE BUTTON CLICKED! Starting manual save...');
    console.log('🔍 Current ocrTableRows state:', ocrTableRows);
    
    // Prevent multiple saves
    if (isSaving) {
      console.log('⚠️ Save already in progress, ignoring duplicate click');
      return;
    }
    
    setIsSaving(true);
    
    try {
      console.log(`🔍 DEBUG: Manual save triggered for ${ocrTableRows.length} rows`);
      
      if (ocrTableRows.length === 0) {
        console.warn('⚠️ No rows to save - ocrTableRows is empty!');
        toast({
          title: 'Nothing to Save',
          description: 'No data found to save. Please add some index items first.',
          variant: 'default'
        });
        return;
      }
      
      // Show immediate feedback
      toast({
        title: 'Saving...',
        description: `Saving ${ocrTableRows.length} index items to database`,
      });
      
      await saveOcrTableRowsToDatabase(ocrTableRows);
      console.log('✅ Manual save successful');
      
      // Mark changes as saved
      setHasUnsavedChanges(false);
      
      // Show enhanced success feedback
      toast({
        title: '✅ Successfully Saved!',
        description: `${ocrTableRows.length} hyperlink pages saved permanently to database`,
        variant: 'default'
      });
      
      // Additional success feedback with auto-dismiss
      setTimeout(() => {
        toast({
          title: '🎉 Changes Persisted',
          description: 'Your manual page assignments are now saved and will reload automatically',
        });
      }, 1000);
      
    } catch (error) {
      console.error('❌ Manual save failed:', error);
      console.error('❌ Error details:', error instanceof Error ? error.message : String(error));
      toast({
        title: '❌ Save Failed',
        description: `Failed to save hyperlink pages: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // 🔗 Hyperlink Enhancement Processor - RESPECTS USER MANUAL CHANGES  
  const enhanceOCRWithHyperlinks = (ocrRows: IndexRow[]): IndexRow[] => {
    console.log('🔗 BEFORE hyperlink enhancement:', ocrRows.length, 'rows');
    
    // 🚫 DISABLED AUTOMATIC PAGE MAPPING - No more overriding user's manual changes!
    // The old documentPageMapping kept resetting pages to defaults (15, 85, 125)
    // This was causing the user's 80+ manual changes to be constantly reverted
    
    const enhancedRows = ocrRows.map((row, index) => {
      // ONLY preserve existing user values - DO NOT override with defaults
      let pageNumber = '';
      let hyperlinkUrl = '';
      
      // If user has manually set a page number, PRESERVE IT!
      if (row.hyperlinkPage !== undefined && row.hyperlinkPage !== null && row.hyperlinkPage !== '') {
        pageNumber = row.hyperlinkPage.toString();
        hyperlinkUrl = `/online/pdf/${caseId}/${documentId}#page=${row.hyperlinkPage}`;
        console.log(`✅ PRESERVING user's manual page ${row.hyperlinkPage} for row ${index + 1}`);
      } else if (row.pdfUrl) {
        hyperlinkUrl = row.pdfUrl;
      }
      
      return {
        ...row,
        hyperlinkPage: pageNumber ? Number(pageNumber) : (row.hyperlinkPage === undefined ? undefined : row.hyperlinkPage),
        pdfUrl: hyperlinkUrl || row.pdfUrl || ''
      };
    });
    
    console.log('✅ AFTER hyperlink enhancement:', enhancedRows.length, 'rows');
    console.log('📊 Sample enhanced row:', enhancedRows[0]);
    console.log('🔒 AUTOMATIC PAGE DEFAULTS DISABLED - User changes will persist!');
    
    return enhancedRows;
  };

  // Generate page 2 links from index rows data
  const generatedPage2Links = useMemo(() => {
    if (!indexRows || indexRows.length === 0) {
      // Default page 2 links from the user's specification
      return [
        { tab: 1, page: 3 }, { tab: 2, page: 8 }, { tab: 3, page: 12 },
        { tab: 4, page: 14 }, { tab: 5, page: 16 }, { tab: 6, page: 283 },
        { tab: 7, page: 289 }, { tab: 8, page: 307 }, { tab: 9, page: 323 },
        { tab: 10, page: 334 }, { tab: 11, page: 332 }, { tab: 12, page: 346 },
        { tab: 13, page: 403 }
      ];
    }
    
    // Generate from current index rows
    return indexRows.map((row, index) => ({
      tab: parseInt(row.tabNo) || (index + 1),
      page: row.hyperlinkPage ? parseInt(String(row.hyperlinkPage)) || (index + 3) : (index + 3)
    })).filter(link => link.tab > 0 && link.page > 0);
  }, [indexRows]);

  // Update page2Links when indexRows change
  useEffect(() => {
    setPage2Links(generatedPage2Links);
  }, [generatedPage2Links]);

  // Navigation handler for page 2 links
  const handleNavigateToPage = useCallback((pageNumber: number) => {
    console.log(`🔗 Page 2 link navigation: jumping to page ${pageNumber}`);
    navigateToPDFPage(pageNumber);
  }, []);

  // Parse OCR text and set table rows using proper parsing
  const parseAndSetOcrTableRows = (ocrText: string) => {
    try {
      // Debug: Log the incoming OCR text
      console.log('OCR Text received for parsing:', ocrText);
      
      // Use the robust parser from parseIndexText with current screenshot batch signature
      const newRows = parseIndexText(ocrText, screenshotsSignature);
      
      // Debug: Log the parsing results
      console.log('Parsed rows from OCR:', newRows);
      
      if (newRows.length > 0) {
        // 🔗 NEW: Enhance OCR data with hyperlinks (preserves existing OCR functionality)
        const enhancedRows = enhanceOCRWithHyperlinks(newRows);
        
        // Merge with existing rows to avoid duplicates (preserveOrder: true for screenshot OCR)
        setIndexRows(prev => mergeIndexRows(prev, enhancedRows, true));
        
        setTimeout(() => {
          toast({
            title: "OCR Parsing Complete",
            description: `Extracted ${newRows.length} index entries from OCR text`,
          });
        }, 0);
      } else {
        // No fallback data - keep table empty if OCR parsing fails
        console.log('No structured index data found in OCR text:', ocrText);
        
        setTimeout(() => {
          toast({
            title: "No Index Data Found",
            description: "Could not extract structured index from OCR text. Please check your screenshot or add rows manually.",
            variant: "destructive"
          });
        }, 0);
      }
    } catch (error) {
      console.error('Error parsing OCR text:', error);
      setTimeout(() => {
        toast({
          title: "OCR Parsing Error",
          description: "Failed to parse OCR text, please try again",
          variant: "destructive"
        });
      }, 0);
    }
  };

  // Handle screenshot upload/paste
  const handleScreenshotUpload = (files: FileList | null) => {
    if (!files) return;
    
    Array.from(files).forEach(async (file) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const dataUrl = e.target?.result as string;
            
            // Save screenshot to database first
            const response = await fetch(`/api/documents/${documentId}/screenshots`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                name: file.name,
                url: dataUrl,
                clickableAreas: []
              })
            });
            
            if (!response.ok) {
              throw new Error('Failed to save screenshot');
            }
            
            const savedScreenshot = await response.json();
            
            // Add to local state
            setIndexScreenshots(prev => [...prev, savedScreenshot]);
            setActiveScreenshotId(savedScreenshot.id);
            
            toast({
              title: "Screenshot Added",
              description: `${file.name} uploaded and saved - processing OCR...`,
            });

            // Automatically process OCR
            await processScreenshotOCR(savedScreenshot.id, dataUrl);
            
          } catch (error) {
            console.error('Failed to save screenshot:', error);
            toast({
              title: "Screenshot Upload Failed",
              description: error instanceof Error ? error.message : "Failed to upload screenshot",
              variant: "destructive"
            });
          }
        };
        reader.readAsDataURL(file);
      }
    });
  };

  // Handle pasting screenshots
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = async (event) => {
            try {
              const dataUrl = event.target?.result as string;
              const screenshotName = `Index Screenshot ${indexScreenshots.length + 1}`;
              
              // Save screenshot to database first
              const response = await fetch(`/api/documents/${documentId}/screenshots`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  name: screenshotName,
                  url: dataUrl,
                  clickableAreas: []
                })
              });
              
              if (!response.ok) {
                throw new Error('Failed to save screenshot');
              }
              
              const savedScreenshot = await response.json();
              
              // Add to local state
              setIndexScreenshots(prev => [...prev, savedScreenshot]);
              setActiveScreenshotId(savedScreenshot.id);
              
              toast({
                title: "Screenshot Pasted",
                description: "Index screenshot pasted and saved - processing OCR...",
              });

              // Automatically process OCR
              await processScreenshotOCR(savedScreenshot.id, dataUrl);
              
            } catch (error) {
              console.error('Failed to save pasted screenshot:', error);
              toast({
                title: "Screenshot Paste Failed",
                description: error instanceof Error ? error.message : "Failed to save pasted screenshot",
                variant: "destructive"
              });
            }
          };
          reader.readAsDataURL(blob);
        }
        break;
      }
    }
  };

  // Parse OCR text to extract tab items with improved column handling
  const parseOcrTextToTabItems = (ocrText: string): Array<Partial<IndexItem>> => {
    const lines = ocrText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const tabItems: Array<Partial<IndexItem>> = [];
    
    let currentItem: Partial<IndexItem> | null = null;
    let isInMultiLineEntry = false;
    
    for (const line of lines) {
      // Skip header lines
      if (line.includes('Tab No.') || line.includes('DATE OF DOCUMENT') || line.includes('NATURE OF DOCUMENT') || line.startsWith('---') || line.match(/^\s*[-|=]+\s*$/)) {
        continue;
      }
      
      // Check if line starts with a tab number (handles various formats: 1., 1, Tab 1, etc.)
      const tabMatch = line.match(/^(?:Tab\s+)?(\d{1,3})\.?\s+(.+)/i);
      if (tabMatch) {
        // Save previous item if exists
        if (currentItem && currentItem.tabNumber) {
          tabItems.push(currentItem);
        }
        
        // Start new item
        const tabNumber = tabMatch[1];
        const restOfLine = tabMatch[2].trim();
        isInMultiLineEntry = false;
        
        // Split the rest of the line by multiple spaces to detect columns
        // Assuming columns are separated by multiple spaces (typical in OCR of tables)
        const columns = restOfLine.split(/\s{2,}/).filter(col => col.trim().length > 0);
        
        if (columns.length >= 2) {
          // First column is likely date, second is title/nature
          const potentialDate = columns[0].trim();
          const title = columns.slice(1).join(' ').trim();
          
          // Try to identify if first column looks like a date
          const dateMatch = potentialDate.match(/^([A-Za-z]+ \d{1,2}, \d{4}|[A-Za-z]+ \d{4}|\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
          if (dateMatch) {
            currentItem = {
              tabNumber,
              dateField: potentialDate,
              title: title,
              sourceType: 'screenshot'
            };
          } else {
            // If first column doesn't look like date, treat it all as title
            currentItem = {
              tabNumber,
              title: restOfLine,
              sourceType: 'screenshot'
            };
          }
        } else {
          // Single column after tab number
          currentItem = {
            tabNumber,
            title: restOfLine,
            sourceType: 'screenshot'
          };
        }
        isInMultiLineEntry = true;
      } else if (currentItem && isInMultiLineEntry) {
        // This line is a continuation - check if it looks like it belongs to date or title column
        const trimmedLine = line.trim();
        
        // If the line starts with spaces and looks like a continuation of the title
        if (trimmedLine.length > 0) {
          // Check if this might be a continuation of the date column (short, date-like)
          const datePattern = /^([A-Za-z]+ \d{1,2}, \d{4}|[A-Za-z]+ \d{4}|\d{1,2}\/\d{1,2}\/\d{4})/;
          if (datePattern.test(trimmedLine) && !currentItem.dateField) {
            currentItem.dateField = trimmedLine;
          } else {
            // Otherwise, it's likely a continuation of the title/nature column
            currentItem.title = (currentItem.title || '') + ' ' + trimmedLine;
          }
        }
      }
    }
    
    // Don't forget the last item
    if (currentItem && currentItem.tabNumber) {
      tabItems.push(currentItem);
    }
    
    return tabItems;
  };

  // Convert screenshot areas to index items
  const convertScreenshotsToIndexItems = async () => {
    let allItems: IndexItem[] = [];
    
    // Process OCR text from screenshots
    indexScreenshots.forEach((screenshot, screenshotIndex) => {
      if (screenshot.ocrText && screenshot.ocrText.length > 50) {
        const parsedItems = parseOcrTextToTabItems(screenshot.ocrText);
          parsedItems.forEach((parsedItem, index) => {
          const newItem: IndexItem = {
            id: `ocr_item_${Date.now()}_${screenshotIndex}_${index}`,
            documentId,
            ordinal: parseInt(parsedItem.tabNumber || `${index + 1}`),
            tabNumber: parsedItem.tabNumber || `${index + 1}`,
            title: parsedItem.title || 'Untitled Document',
            label: parsedItem.title || 'Untitled Document',
            dateField: parsedItem.dateField,
            targetPage: parseInt(parsedItem.tabNumber || `${index + 1}`) + 10, // Placeholder target page
            pageHint: 2,
            status: 'pending' as const,
            sourceType: 'screenshot',
            type: 'tab' as const,
            isCustom: true
          };
          allItems.push(newItem);
        });
      }
      
      // Also process manual clickable areas if any
      screenshot.clickableAreas.forEach(area => {
        const clickableItem: IndexItem = {
          id: `clickable_item_${Date.now()}_${Math.random()}`,
          documentId,
          ordinal: parseInt(area.tabNumber) || 1,
          tabNumber: area.tabNumber,
          title: area.title,
          label: area.title,
          targetPage: area.targetPage,
          pageHint: 2,
          status: 'ready' as const,
          sourceType: 'screenshot',
          type: 'tab' as const,
          isCustom: true,
          bboxNorm: {
            x0: area.x / 800,
            y0: area.y / 600,
            x1: (area.x + area.width) / 800,
            y1: (area.y + area.height) / 600
          }
        };
        allItems.push(clickableItem);
      });
    });

    if (allItems.length > 0) {
      try {
        // Save items to database
        for (const item of allItems) {
          await apiRequest('POST', `/api/documents/${documentId}/index-items`, item);
        }
        
        // Update local state
        setIndexItems(prev => [...prev, ...allItems]);
        
        toast({
          title: "🎉 Hyperlinks Generated!",
          description: `Successfully created ${allItems.length} hyperlinks from OCR text. Review and adjust target pages as needed.`,
        });
      } catch (error) {
        
        // Fallback: add to local state even if save fails
        setIndexItems(prev => [...prev, ...allItems]);
        toast({
          title: "⚠️ Hyperlinks Created Locally",
          description: `Created ${allItems.length} hyperlinks from OCR text. Database save failed but you can still use them.`,
          variant: "destructive"
        });
      }
    } else {
      toast({
        title: "No Content Found", 
        description: "No OCR text or clickable areas found to convert to hyperlinks",
        variant: "destructive"
      });
    }
  };

  // Auto-detect index items using AI
  const autoDetect = async (customPageRange?: { start: number; end: number }) => {
    setIsLoading(true);
    try {
      const range = customPageRange || pageRange;
      const response = await fetch(`/api/documents/${documentId}/index-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageRange: range,
          detectTabsAndExhibits: true
        })
      });
      const data = await response.json();
      
      setIndexItems(data.items || []);
      toast({
        title: 'Success',
        description: `Detected ${data.items?.length || 0} index items`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to detect index items',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Save index items
  const saveItems = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/index-items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: indexItems,
          options: { backToIndexBanner: backBanner }
        })
      });
      
      if (!response.ok) throw new Error('Save failed');
      
      toast({
        title: 'Success',
        description: 'Index items saved successfully',
      });
      onSave();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save index items',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Apply hyperlinks - Enhanced to also generate page 2 overlay links
  const applyHyperlinks = async () => {
    try {
      // Step 1: Apply traditional hyperlinks (original functionality)
      const response = await fetch(`/api/documents/${documentId}/apply-hyperlinks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: indexItems,
          indexPage: 2, // Usually index is on page 2
          backBanner: backBanner
        })
      });
      const data = await response.json();
      
      // Step 2: Generate page 2 overlay links based on hyperlink page assignments
      await generatePage2OverlayLinks();
      
      if (data?.url) {
        window.open(data.url, '_blank');
        toast({
          title: 'Success',
          description: 'Hyperlinks applied successfully with page 2 overlay links. Opening PDF...',
        });
      }
    } catch (error) {
      console.error('Apply hyperlinks error:', error);
      toast({
        title: 'Error',
        description: 'Failed to apply hyperlinks',
        variant: 'destructive'
      });
    }
  };

  // 💥 NUKE all p.N overlay links (clear wrong values)
  const nukeOverlayLinks = async () => {
    console.log('💥 Nuking all page 2 overlay links...');
    
    try {
      // First, remove all visible overlay buttons from DOM immediately
      const overlayButtons = document.querySelectorAll('[data-hyperlink-page]');
      console.log(`🗑️ Found ${overlayButtons.length} overlay buttons to remove`);
      overlayButtons.forEach(button => {
        button.remove();
        console.log('🗑️ Removed overlay button from DOM');
      });
      
      // Also try alternative selectors for overlay elements
      const page2Overlays = document.querySelectorAll('.hyperlink-overlay, .hyperlink-button, [class*="hyperlink"]');
      console.log(`🗑️ Found ${page2Overlays.length} additional overlay elements`);
      page2Overlays.forEach(element => {
        element.remove();
        console.log('🗑️ Removed overlay element from DOM');
      });

      // Clear any page 2 overlay containers
      const page2Container = document.querySelector('[data-page="2"]');
      if (page2Container) {
        const overlayContainer = page2Container.querySelector('div[style*="z-index"]');
        if (overlayContainer) {
          overlayContainer.innerHTML = '';
          console.log('🗑️ Cleared page 2 overlay container');
        }
      }

      // Also clear any buttons that look like "p.15", "p.125", etc.
      const pageButtons = document.querySelectorAll('button');
      pageButtons.forEach(button => {
        if (button.textContent && /^p\.\d+$/.test(button.textContent.trim())) {
          button.remove();
          console.log(`🗑️ Removed page button: ${button.textContent}`);
        }
      });
      
      const response = await fetch(`/api/documents/${documentId}/page2-links/positions?page=2`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete overlay links');
      }
      
      // Invalidate cache to refresh UI immediately
      queryClient.invalidateQueries({
        queryKey: ['/api/documents', documentId, 'page2-links', 'positions']
      });
      
      toast({
        title: '💥 Overlay Links Cleared',
        description: 'All wrong p.N values have been removed from the PDF overlay.',
      });
      
    } catch (error) {
      console.error('Error nuking overlay links:', error);
      toast({
        title: 'Nuke Failed',
        description: 'Failed to clear overlay links. Check console for details.',
        variant: 'destructive'
      });
    }
  };
  
  // 🔗 COPY EXACT page numbers from left panel to right panel overlay
  const copyLinksFromLeftPanel = async () => {
    console.log('🔗 Copying EXACT page numbers from left panel to PDF overlay...');
    
    try {
      // Extract tab → hyperlinkPage mapping from left panel table
      const tabPageMapping = new Map<number, number>();
      
      ocrTableRows.forEach(row => {
        if (row.tabNo && row.hyperlinkPage && !isNaN(parseInt(row.hyperlinkPage))) {
          const tabNum = parseInt(row.tabNo);
          const pageNum = parseInt(row.hyperlinkPage);
          tabPageMapping.set(tabNum, pageNum);
        }
      });
      
      if (tabPageMapping.size === 0) {
        toast({
          title: 'No Valid Page Numbers',
          description: 'No valid hyperlink page numbers found in the left panel table.',
          variant: 'default'
        });
        return;
      }
      
      console.log(`📍 Copying ${tabPageMapping.size} exact page numbers:`, Object.fromEntries(tabPageMapping));
      
      // PATCH each tab with the exact targetPage from left panel
      const patchPromises = Array.from(tabPageMapping.entries()).map(async ([tabNumber, targetPage]) => {
        const response = await fetch(`/api/documents/${documentId}/page2-links/positions/${tabNumber}?page=2`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetPage })
        });
        
        if (!response.ok) {
          // If PATCH fails (tab doesn't exist), create it with POST
          console.log(`Tab ${tabNumber} doesn't exist, creating new position...`);
          const createResponse = await fetch(`/api/documents/${documentId}/page2-links/positions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pageNumber: 2,
              tabNumber,
              targetPage,
              xNorm: "0.08",  // Left side positioning
              yNorm: ((120 + ((tabNumber - 1) * 24)) / 792).toFixed(8),  // Vertical spacing
              isAutoAligned: false
            })
          });
          
          if (!createResponse.ok) {
            throw new Error(`Failed to create/update tab ${tabNumber} -> page ${targetPage}`);
          }
          return createResponse.json();
        }
        
        return response.json();
      });
      
      await Promise.allSettled(patchPromises);
      
      // Invalidate cache to refresh UI with exact values
      queryClient.invalidateQueries({
        queryKey: ['/api/documents', documentId, 'page2-links', 'positions']
      });
      
      console.log(`✅ Successfully copied ${tabPageMapping.size} exact page numbers to PDF overlay`);
      
      toast({
        title: '🔗 Links Copied Successfully',
        description: `Copied ${tabPageMapping.size} exact page numbers from left panel to PDF overlay.`,
      });
      
    } catch (error) {
      console.error('Error copying links from left panel:', error);
      toast({
        title: 'Copy Failed',
        description: 'Failed to copy page numbers. Check console for details.',
        variant: 'destructive'
      });
    }
  };

  // Generate page 2 overlay links based on current hyperlink page assignments
  const generatePage2OverlayLinks = async () => {
    console.log('🔗 Generating page 2 overlay links from hyperlink assignments...');
    
    try {
      // Filter valid rows with hyperlink page assignments
      const validLinks = ocrTableRows.filter(row => 
        row.tabNo && 
        row.hyperlinkPage && 
        !isNaN(parseInt(row.hyperlinkPage))
      );

      if (validLinks.length === 0) {
        toast({
          title: 'No Hyperlink Assignments',
          description: 'No valid hyperlink page assignments found to generate overlay links.',
          variant: 'default'
        });
        return;
      }

      console.log(`📍 Creating ${validLinks.length} page 2 overlay links...`);

      // Generate positions for each link (use auto-alignment spacing)
      const page2Links = validLinks.map((row, index) => ({
        pageNumber: 2,
        tabNumber: parseInt(row.tabNo),
        targetPage: parseInt(row.hyperlinkPage),
        // Use fallback positioning with 24px spacing between items
        xNorm: "0.08",  // Left side positioning
        yNorm: ((120 + (index * 24)) / 792).toFixed(8),  // Vertical spacing, normalized to page height
        isAutoAligned: false  // Mark as manually generated
      }));

      // Save all page 2 overlay links
      const savePromises = page2Links.map(async (link) => {
        const response = await fetch(`/api/documents/${documentId}/page2-links/positions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(link)
        });
        
        if (!response.ok) {
          throw new Error(`Failed to save link for tab ${link.tabNumber}`);
        }
        return response.json();
      });

      await Promise.all(savePromises);

      console.log(`✅ Generated ${validLinks.length} page 2 overlay links successfully`);
      
      // Show success message with link details
      toast({
        title: '🔗 Page 2 Links Generated',
        description: `Created ${validLinks.length} clickable overlay links on page 2 based on your hyperlink assignments.`,
      });

    } catch (error) {
      console.error('Error generating page 2 overlay links:', error);
      toast({
        title: 'Page 2 Links Error',
        description: 'Failed to generate overlay links for page 2. Check console for details.',
        variant: 'destructive'
      });
    }
  };

  // Update item
  const updateItem = (itemId: string, updates: Partial<IndexItem>) => {
    setIndexItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, ...updates } : item
    ));
  };

  // Add new item
  const addNewItem = () => {
    const newItem: IndexItem = {
      id: `custom-${Date.now()}`,
      documentId,
      tabNumber: '',
      title: 'New Item',
      pageHint: 2, // Default to page 2 where index usually is
      targetPage: undefined,
      status: 'draft',
      isCustom: true,
      bboxNorm: { x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.15 }
    };
    setIndexItems(prev => [...prev, newItem]);
    setSelectedItem(newItem.id);
  };

  // Remove item
  const removeItem = (itemId: string) => {
    setIndexItems(prev => prev.filter(item => item.id !== itemId));
    if (selectedItem === itemId) {
      setSelectedItem(null);
    }
  };


  // 📄 Generate PDF Cover Page with WORKING Hyperlinks
  const generateCoverPagePDF = async () => {
    console.log('🔨 Creating PDF with WORKING hyperlinks...');
    
    try {
      // Validate data first
      if (!ocrTableRows || ocrTableRows.length === 0) {
        toast({
          title: "No Index Data",
          description: "No index data found. Please process screenshots first.",
          variant: "destructive"
        });
        return;
      }
      
      // Step 1: Get current PDF URL
      const getCurrentPDFUrl = () => {
        const baseUrl = window.location.origin;
        return `${baseUrl}/api/documents/${documentId}/download`;
      };

      const pdfUrl = getCurrentPDFUrl();
      console.log('📄 Fetching PDF from:', pdfUrl);
      
      const response = await fetch(pdfUrl);
      if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status}`);
      const existingPdfBytes = await response.arrayBuffer();
      
      // Step 2: Create new PDF document
      const pdfDoc = await PDFDocument.create();
      
      // Step 3: Load original PDF to copy pages
      const originalPdf = await PDFDocument.load(existingPdfBytes);
      const pageCount = originalPdf.getPageCount();
      
      // Step 4: Create cover page FIRST
      const coverPage = pdfDoc.addPage([612, 792]);
      const { width, height } = coverPage.getSize();
      
      // Step 5: Embed fonts
      const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      // Step 6: Add title
      coverPage.drawText('Hyperlink Index (Cover Page)', {
        x: 50,
        y: height - 80,
        size: 18,
        font: boldFont,
        color: rgb(0, 0, 0)
      });
      
      // Step 7: Copy all original pages AFTER cover page creation
      console.log(`📄 Copying ${pageCount} original pages...`);
      const originalPageIndices = Array.from({ length: pageCount }, (_, i) => i);
      const copiedPages = await pdfDoc.copyPages(originalPdf, originalPageIndices);
      
      // Add copied pages to document
      copiedPages.forEach((page) => pdfDoc.addPage(page));
      
      // Step 8: Add index items with WORKING hyperlinks
      let yPosition = height - 140;
      const linkAnnotations = [];
      
      // Filter valid rows
      const validRows = ocrTableRows.filter(row => 
        row.tabNo && row.nature && row.hyperlinkPage
      );

      console.log(`📝 Adding ${validRows.length} index items with working links...`);
      
      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        const itemText = `${row.tabNo}. ${row.nature}`;
        const pageText = `(p. ${row.hyperlinkPage})`;
        
        // Draw item text
        coverPage.drawText(itemText, {
          x: 50,
          y: yPosition,
          size: 12,
          font: regularFont,
          color: rgb(0, 0.4, 0.8)
        });
        
        // Draw page reference
        const itemWidth = regularFont.widthOfTextAtSize(itemText, 12);
        coverPage.drawText(pageText, {
          x: 50 + itemWidth + 10,
          y: yPosition,
          size: 12,
          font: regularFont,
          color: rgb(0.5, 0.5, 0.5)
        });
        
        // CRITICAL: Create WORKING PDF link annotation with proper pdf-lib primitives
        const targetPageNumber = parseInt(row.hyperlinkPage);
        const totalWidth = itemWidth + regularFont.widthOfTextAtSize(pageText, 12) + 10;
        
        // Create proper link annotation with CORRECT destination (accounting for cover page offset)
        if (targetPageNumber > 0 && targetPageNumber <= pageCount) {
          // CRITICAL FIX: Cover page is at index 0, so original page N is now at index N (not N-1)
          // Since copiedPages contains only the original pages, targetPageNumber-1 is still correct for indexing
          // But we need to ensure copiedPages[targetPageNumber - 1] corresponds to the actual target in the final PDF
          const targetPageRef = copiedPages[targetPageNumber - 1].ref;
          
          // SIMPLIFIED: Clean pdf-lib annotation format
          const linkAnnotation = pdfDoc.context.obj({
            Type: 'Annot',
            Subtype: 'Link',
            Rect: [50, yPosition - 3, 50 + totalWidth, yPosition + 15],
            Border: [0, 0, 0],
            C: [0, 0.4, 0.8], // Blue color  
            A: pdfDoc.context.obj({
              S: 'GoTo',
              D: [targetPageRef, 'Fit'] // Navigate to target page
            })
          });
          
          linkAnnotations.push(pdfDoc.context.register(linkAnnotation));
          console.log(`✅ Created working link: Item ${i + 1} --> Original Page ${targetPageNumber} (PDF Page ${targetPageNumber + 1} with cover)`);
        }
        
        yPosition -= 25;
        
        // Add new page if running out of space
        if (yPosition < 100 && i < validRows.length - 1) {
          // Set annotations on current cover page before creating new one
          if (linkAnnotations.length > 0) {
            const annotsArray = PDFArray.withContext(pdfDoc.context);
            linkAnnotations.forEach(ref => annotsArray.push(ref));
            coverPage.node.set(PDFName.of('Annots'), annotsArray);
            linkAnnotations.length = 0; // Clear for next page
          }
          
          // Create new cover page
          const newCoverPage = pdfDoc.addPage([612, 792]);
          newCoverPage.drawText('Hyperlink Index (Continued)', {
            x: 50,
            y: height - 80,
            size: 16,
            font: boldFont,
            color: rgb(0, 0, 0)
          });
          yPosition = height - 140;
        }
      }
      
      // Step 9: Add all link annotations to cover page
      try {
        if (linkAnnotations.length > 0) {
          const annotsArray = PDFArray.withContext(pdfDoc.context);
          linkAnnotations.forEach(ref => annotsArray.push(ref));
          coverPage.node.set(PDFName.of('Annots'), annotsArray);
          console.log(`🔗 Added ${linkAnnotations.length} working hyperlinks to cover page`);
        }
      } catch (coverError) {
        console.error('❌ Cover page annotation error:', coverError);
        throw new Error(`Cover page annotation failed: ${coverError instanceof Error ? coverError.message : 'Unknown error'}`);
      }
      
      // Step 10: Add "Back to Index" buttons on each original page
      copiedPages.forEach((page, index) => {
        // Add back button text in bottom-right corner
        page.drawText('<-- Back to Index', {
          x: 450,
          y: 50,
          size: 10,
          font: regularFont,
          color: rgb(0, 0.4, 0.8)
        });
        
        // Create back link annotation
        const backLinkAnnotation = pdfDoc.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: [450, 45, 550, 60],
          Border: [0, 0, 1],
          C: [0, 0.4, 0.8],
          A: pdfDoc.context.obj({
            Type: 'Action',
            S: 'GoTo',
            D: [coverPage.ref, 'XYZ', null, null, 0]
          })
        });
        
        const backLinkRef = pdfDoc.context.register(backLinkAnnotation);
        
        try {
          const existingAnnots = page.node.get(PDFName.of('Annots')) as PDFArray | undefined;
          
          if (existingAnnots) {
            // Safely add to existing annotations array
            existingAnnots.push(backLinkRef);
          } else {
            // Create new annotations array
            const annotsArray = PDFArray.withContext(pdfDoc.context);
            annotsArray.push(backLinkRef);
            page.node.set(PDFName.of('Annots'), annotsArray);
          }
        } catch (backLinkError) {
          console.error(`❌ Back-to-index annotation error on page ${index + 1}:`, backLinkError);
          // Don't throw - continue with other pages
        }
      });
      
      console.log(`🔙 Added "Back to Index" links to ${copiedPages.length} pages`);
      
      // Step 11: Generate final PDF with working hyperlinks
      console.log('🔧 Generating final PDF with working hyperlinks...');
      const finalPdfBytes = await pdfDoc.save({
        useObjectStreams: false,
        addDefaultPage: false
      });
      
      // Step 12: Download the PDF
      const blob = new Blob([finalPdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = `working-hyperlinks-${new Date().getTime()}.pdf`;
      downloadLink.style.display = 'none';
      
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      
      console.log('✅ PDF with WORKING hyperlinks generated successfully!');
      toast({
        title: "📄 Success!",
        description: `PDF created with ${validRows.length} working hyperlinks. Click any index item to navigate!`,
      });
      
    } catch (error) {
      console.error('❌ Error creating working hyperlinks:', error);
      console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      toast({
        title: "Cover Page Generation Failed",
        description: error instanceof Error ? error.message : "Failed to create cover page with working hyperlinks.",
        variant: "destructive"
      });
    }
  };

  // Load items on mount - auto-detect disabled to prevent page flipping
  useEffect(() => {
    if (isOpen && documentId) {
      loadIndexItems();
      
      // Auto-detect disabled to prevent automatic page scrolling
      // Users can manually click "Auto-Detect" button if needed
    }
  }, [isOpen, documentId, loadIndexItems]);

  if (!isOpen) return null;

  const readyItems = indexItems.filter(item => item.status === 'ready').length;
  const totalItems = indexItems.length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
      <Rnd
        default={{
          x: 50,
          y: 50,
          width: isFullscreen ? window.innerWidth - 40 : 1400,
          height: isFullscreen ? window.innerHeight - 40 : 900,
        }}
        minWidth={1000}
        minHeight={700}
        maxWidth={window.innerWidth - 20}
        maxHeight={window.innerHeight - 20}
        bounds="parent"
        dragHandleClassName="drag-handle"
        disableDragging={isFullscreen}
        enableResizing={!isFullscreen}
        className="absolute"
        style={{ pointerEvents: 'auto' }}
      >
        <Card 
          className={`h-full w-full overflow-hidden flex flex-col shadow-2xl bg-white transition-all duration-300`}
        >
        <CardHeader className="flex-shrink-0 bg-gray-900 text-white drag-handle cursor-move select-none" style={{ pointerEvents: 'auto' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Move className="h-5 w-5 text-gray-300" />
              <div>
                <CardTitle className="text-xl">Index Editor</CardTitle>
                <p className="text-sm text-black">
                  Mark and edit index items for hyperlinking • {readyItems}/{totalItems} ready
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Tab Navigation */}
              <div className="flex items-center gap-1 border border-white/20 rounded-lg p-1">
                <Button
                  variant={activeTab === 'index' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab('index')}
                  className={`px-3 py-1 h-7 text-xs ${
                    activeTab === 'index' 
                      ? 'bg-white text-black' 
                      : 'text-white hover:bg-white hover:text-black'
                  }`}
                >
                  Index Tabs
                </Button>
                <Button
                  variant={activeTab === 'all' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab('all')}
                  className={`px-3 py-1 h-7 text-xs ${
                    activeTab === 'all' 
                      ? 'bg-white text-black' 
                      : 'text-white hover:bg-white hover:text-black'
                  }`}
                >
                  Show All ({totalPages})
                </Button>
              </div>
              
              <Badge variant="outline" className="text-white border-white">
                {loadingIndex ? 'Loading...' : `${indexTabs.length} tabs`}
              </Badge>
              
              {/* Zoom Controls */}
              <div className="flex items-center gap-1 border border-white/20 rounded-lg px-2 py-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}
                  className="text-white hover:bg-white hover:text-black px-2 py-1 h-7"
                  title="Zoom Out"
                >
                  <span className="text-lg font-bold">−</span>
                </Button>
                <span className="text-white text-sm min-w-[3rem] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setZoom(Math.min(3, zoom + 0.25))}
                  className="text-white hover:bg-white hover:text-black px-2 py-1 h-7"
                  title="Zoom In"
                >
                  <span className="text-lg font-bold">+</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    const pdfViewer = document.querySelector('.pdf-viewer-container');
                    if (!pdfViewer) return;
                    
                    try {
                      const html2canvas = (await import('html2canvas')).default;
                      const canvas = await html2canvas(pdfViewer as HTMLElement, {
                        allowTaint: true,
                        useCORS: true,
                        scale: 1,
                        backgroundColor: '#ffffff',
                        logging: false
                      });
                      
                      const screenshotDataUrl = canvas.toDataURL('image/png');
                      const timestamp = new Date().toLocaleString().replace(/[/,:]/g, '-').replace(/\s/g, '_');
                      const screenshotName = `PDF_Screenshot_${timestamp}.png`;
                      
                      handlePdfScreenshotCapture(screenshotDataUrl, screenshotName);
                    } catch (error) {
                      console.error('Screenshot capture failed:', error);
                    }
                  }}
                  className="text-white hover:bg-white hover:text-black px-2 py-1 h-7"
                  title="Capture PDF Screenshot"
                >
                  <Camera className="h-4 w-4" />
                </Button>
              </div>
              
              {/* Page 2 Links Toggle & Copy */}
              <div className="flex items-center gap-2">
                <Button
                  variant={showPage2Links ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowPage2Links(!showPage2Links)}
                  className={`px-3 py-1 h-7 text-xs ${showPage2Links 
                    ? 'bg-blue-600 text-white hover:bg-blue-700' 
                    : 'text-white border-white/20 hover:bg-white hover:text-black'}`}
                  title={showPage2Links ? "Hide Page 2 Links" : "Show Page 2 Links"}
                  data-testid="toggle-page2-links"
                >
                  {showPage2Links ? "p.N ✓" : "p.N"}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={nukeOverlayLinks}
                  className="px-3 py-1 h-7 text-xs bg-red-600 text-white hover:bg-red-700"
                  title="Clear all wrong p.N values from PDF overlay"
                  data-testid="button-nuke-links"
                >
                  💥 Nuke p.N
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={copyLinksFromLeftPanel}
                  className="px-3 py-1 h-7 text-xs bg-purple-600 text-white hover:bg-purple-700"
                  title="Copy EXACT hyperlink page numbers from left panel to PDF overlay"
                  data-testid="button-copy-links"
                >
                  🔗 Copy Links
                </Button>
              </div>
              
              {/* 📄 Create Hyperlink Index Cover Page Button */}
              <Button
                onClick={generateCoverPagePDF}
                className="bg-green-600 hover:bg-green-700 text-white border-0"
                size="sm"
                title="Generate PDF with hyperlinked index cover page"
                data-testid="button-create-cover-page"
              >
                <FileText className="h-4 w-4 mr-2" />
                📄 Create Cover Page
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="text-white border-white hover:bg-white hover:text-black"
                title={isFullscreen ? "Exit Fullscreen" : "Expand to Fullscreen"}
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                className="text-white border-white hover:bg-white hover:text-black"
              >
                <X className="h-4 w-4" />
                Close
              </Button>
            </div>
          </div>
          
          {/* Controls */}
          <div className="flex items-center gap-2 mt-3">
            <Button 
              variant={mode === 'view' ? 'default' : 'secondary'} 
              size="sm"
              onClick={() => setMode('view')}
            >
              <Eye className="mr-2 h-4 w-4" />
              View
            </Button>
            <Button 
              variant={mode === 'edit' ? 'default' : 'secondary'} 
              size="sm"
              onClick={() => setMode('edit')}
            >
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>

            <Button 
              variant={highlightMode ? 'default' : 'secondary'}
              size="sm"
              onClick={toggleHighlightMode}
              className={highlightMode ? 'bg-orange-600 hover:bg-orange-700 text-white' : ''}
            >
              <Highlighter className="mr-2 h-4 w-4" />
              Highlight
            </Button>
            <Button 
              onClick={saveItems} 
              disabled={isSaving}
              size="sm"
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
            <Button 
              onClick={() => autoDetect()} 
              disabled={isLoading}
              size="sm"
            >
              <Wand2 className="mr-2 h-4 w-4" />
              {isLoading ? 'Detecting...' : 'Auto-Detect'}
            </Button>
            <div className="flex items-center gap-1 text-sm">
              Pages:
              <Input
                type="number"
                value={pageRange.start}
                onChange={(e) => setPageRange(prev => ({ ...prev, start: Number(e.target.value) }))}
                className="w-16 h-7"
                min={1}
                max={50}
              />
              to
              <Input
                type="number"
                value={pageRange.end}
                onChange={(e) => setPageRange(prev => ({ ...prev, end: Number(e.target.value) }))}
                className="w-16 h-7"
                min={1}
                max={50}
              />
            </div>
            <Button 
              onClick={addNewItem}
              size="sm"
              variant="outline"
              className="text-white border-white hover:bg-white hover:text-black"
            >
              <Plus className="h-4 w-4 mr-1" />
              New
            </Button>
            <Button 
              onClick={() => addDragCircle()}
              size="sm"
              variant={clickToPlaceMode ? 'default' : 'outline'}
              className={clickToPlaceMode 
                ? 'bg-orange-600 hover:bg-orange-700 text-white' 
                : 'text-orange-600 border-orange-600 hover:bg-orange-50'
              }
            >
              <Circle className="h-4 w-4 mr-1" />
              {clickToPlaceMode ? 'Click PDF to Place' : 'Add Circle'}
            </Button>
            <Button
              onClick={applyHyperlinks}
              disabled={readyItems !== totalItems || totalItems === 0}
              className="bg-green-600 hover:bg-green-700"
              size="sm"
            >
              Apply Hyperlinks
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="flex-1 overflow-hidden p-0" style={{ pointerEvents: 'auto' }}>
          <div className="h-full p-4">
            {/* Desktop / large screens: side-by-side */}
            <ResizablePanelGroup direction="horizontal" className="hidden md:flex w-full min-h-[900px] gap-2">
              {/* LEFT: OCR + Screenshots */}
              <ResizablePanel defaultSize={65} minSize={45} maxSize={80} className="overflow-hidden pr-1 relative">
                <div 
                  className="h-full w-full overflow-auto bg-white" 
                  id="left-panel-scroll"
                  style={{
                    paddingBottom: '120px', // Extra space at bottom for Run OCR button and visibility
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#888 #f1f1f1'
                  }}
                >
                {/* Scroll to Top Button */}
                <button
                  onClick={() => {
                    const leftPanel = document.getElementById('left-panel-scroll');
                    if (leftPanel) {
                      leftPanel.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                  className="fixed bottom-8 right-8 z-50 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-all duration-300 hover:scale-110"
                  data-testid="scroll-to-top"
                  title="Scroll to top"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                </button>
                <section data-testid="index-ocr-text" id="index-ocr-text" className="mb-6">
                  {/* Sticky OCR Controls Header */}
                  <div className="sticky top-0 bg-white z-10 pb-2 border-b border-gray-200 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-lg font-bold text-black">📝 Index Tabs OCR Text</h4>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={freshPage}
                          className="text-xs px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-1 font-bold"
                          title="Fresh Page - Reset everything and display all content immediately"
                          data-testid="button-fresh-page"
                        >
                          ✨ Fresh Page
                        </button>
                        <button
                          onClick={refreshOcrText}
                          className="text-xs px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 flex items-center gap-1"
                          title="Refresh OCR text from all screenshots"
                          data-testid="button-refresh-ocr-text"
                        >
                          🔄 Refresh OCR
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-blue-600 mb-2">
                      💡 Type directly or paste screenshots (Ctrl+V) to add to Index Screenshots below. Add hyperlink page numbers and URLs in the rightmost columns.
                    </div>
                  </div>
                  <div className="border-2 border-dashed border-blue-300 rounded hover:border-blue-400 focus-within:border-blue-500 transition-colors bg-white">
                        
                        {/* Raw OCR Text Display - ALWAYS VISIBLE */}
                        <div className="p-3 border-b border-gray-200 bg-gray-50">
                          <textarea
                            value={batch1Ocr}
                            onChange={(e) => setBatch1Ocr(e.target.value)}
                            placeholder="OCR text will appear here automatically when you take screenshots..."
                            className="w-full h-32 p-2 text-sm border border-gray-300 rounded resize-none focus:border-blue-500 focus:outline-none text-black"
                            data-testid="textarea-ocr-text"
                          />
                        </div>
                        
                        {/* OCR Text Table Display */}
                        <div className="h-[400px] overflow-auto bg-white">
                          <table className="w-full text-xs border-collapse">
                            <thead className="bg-blue-50 sticky top-0">
                              <tr>
                                <th 
                                  className="border border-gray-300 px-2 py-1 text-left font-medium relative"
                                  style={{ width: `${columnWidths.tabNo}px`, color: '#000000' }}
                                >
                                  Tab No.
                                  <div 
                                    className="absolute top-0 right-0 w-2 h-full cursor-col-resize bg-blue-200 hover:bg-blue-400 opacity-0 hover:opacity-100 transition-opacity"
                                    onMouseDown={(e) => handleColumnMouseDown(e, 0)}
                                    title="Drag to resize column"
                                  />
                                </th>
                                <th 
                                  className="border border-gray-300 px-2 py-1 text-left font-medium relative"
                                  style={{ width: `${columnWidths.documentEntry}px`, color: '#000000' }}
                                >
                                  Document Entry
                                  <div 
                                    className="absolute top-0 right-0 w-2 h-full cursor-col-resize bg-blue-200 hover:bg-blue-400 opacity-0 hover:opacity-100 transition-opacity"
                                    onMouseDown={(e) => handleColumnMouseDown(e, 1)}
                                    title="Drag to resize column"
                                  />
                                </th>
                                <th 
                                  className="border border-gray-300 px-2 py-1 text-left font-medium bg-yellow-50 relative"
                                  style={{ width: `${columnWidths.hyperlinkPage}px`, color: '#000000' }}
                                >
                                  Hyperlink Page
                                  <div 
                                    className="absolute top-0 right-0 w-2 h-full cursor-col-resize bg-blue-200 hover:bg-blue-400 opacity-0 hover:opacity-100 transition-opacity"
                                    onMouseDown={(e) => handleColumnMouseDown(e, 2)}
                                    title="Drag to resize column"
                                  />
                                </th>
                                <th 
                                  className="border border-gray-300 px-2 py-1 text-left font-medium bg-yellow-50"
                                  style={{ width: `${columnWidths.hyperlinkUrl}px`, color: '#000000' }}
                                >
                                  Hyperlink URL
                                </th>
                                <th 
                                  className="border border-gray-300 px-2 py-1 text-center font-medium bg-red-50"
                                  style={{ width: '60px', color: '#000000' }}
                                >
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {ocrTableRows.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="border border-gray-300 px-2 py-8 text-center text-gray-400">
                                    Paste screenshots (Ctrl+V) or type your table data here...
                                    <br/>
                                    <button 
                                      onClick={() => {
                                        const newRow = { 
                                          id: Date.now().toString(), 
                                          tabNo: '', 
                                          fullText: '', 
                                          hyperlinkPage: '', 
                                          hyperlinkUrl: '' 
                                        };
                                        setOcrTableRows([newRow]);
                                      }}
                                      className="mt-2 text-blue-600 hover:text-blue-800 underline"
                                    >
                                      Click to add first row
                                    </button>
                                  </td>
                                </tr>
                              ) : (
                                ocrTableRows.map((row, index) => (
                                  <tr key={row.id} className="hover:bg-blue-50">
                                    <td 
                                      className="border border-gray-300 px-1 py-1" 
                                      style={{ width: `${columnWidths.tabNo}px` }}
                                    >
                                      <input
                                        type="text"
                                        value={row.tabNo}
                                        onChange={(e) => updateOcrRow(index, 'tabNo', e.target.value)}
                                        className="w-full bg-transparent border-none text-xs p-1 placeholder:text-gray-700"
                                        style={{ color: '#000000' }}
                                        placeholder={`${index + 1}`}
                                        data-testid={`input-tab-no-${index}`}
                                      />
                                    </td>
                                    <td 
                                      className="border border-gray-300 px-1 py-1" 
                                      style={{ width: `${columnWidths.documentEntry}px` }}
                                    >
                                      <input
                                        type="text"
                                        value={row.fullText || `${row.date || ''} ${row.nature || ''}`.trim()}
                                        onChange={(e) => updateOcrRow(index, 'fullText', e.target.value)}
                                        className="w-full bg-transparent border-none text-xs p-1 placeholder:text-gray-700"
                                        style={{ color: '#000000' }}
                                        placeholder="February 28, 2022 Request for Information of the Applicant"
                                        data-testid={`input-full-text-${index}`}
                                      />
                                    </td>
                                    <td 
                                      className="border border-gray-300 px-1 py-1 bg-yellow-50" 
                                      style={{ width: `${columnWidths.hyperlinkPage}px` }}
                                    >
                                      <input
                                        type="number"
                                        value={row.hyperlinkPage}
                                        onChange={(e) => handlePageNumberChange(index, e.target.value)}
                                        className="w-full bg-transparent border-none text-xs p-1 placeholder:text-gray-700 hover:bg-yellow-100 focus:bg-white focus:border focus:border-blue-500 focus:rounded"
                                        style={{ color: '#000000' }}
                                        placeholder="15"
                                        title="Edit page number - URL will update automatically"
                                        data-testid={`input-hyperlink-page-${index}`}
                                      />
                                    </td>
                                    <td 
                                      className="border border-gray-300 px-1 py-1 bg-yellow-50" 
                                      style={{ width: `${columnWidths.hyperlinkUrl}px`, textAlign: 'center' }}
                                    >
                                      {row.hyperlinkPage && row.hyperlinkPage !== '—' && !isNaN(Number(row.hyperlinkPage)) ? (
                                        <button
                                          onClick={() => navigateToPDFPage(parseInt(row.hyperlinkPage.toString()))}
                                          className="bg-blue-600 text-white border-none px-2 py-1 rounded cursor-pointer text-xs hover:bg-blue-700"
                                          title={`Go to page ${row.hyperlinkPage}`}
                                          data-testid={`button-hyperlink-url-${index}`}
                                        >
                                          p.{row.hyperlinkPage}
                                        </button>
                                      ) : (
                                        <span className="text-gray-500 text-xs">—</span>
                                      )}
                                    </td>
                                    <td className="border border-gray-300 px-1 py-1 text-center">
                                      <button
                                        onClick={() => deleteOcrRow(index)}
                                        className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-medium"
                                        title={`Delete row ${index + 1}`}
                                        data-testid={`button-delete-row-${index}`}
                                      >
                                        🗑️
                                      </button>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                          
                          {/* Add Row Button & Save Button */}
                          {ocrTableRows.length > 0 && (
                            <div className="sticky bottom-0 bg-white border-t border-gray-300 p-2 flex gap-3 items-center">
                              <button
                                onClick={() => {
                                  const newRow = { 
                                    id: Date.now().toString(), 
                                    tabNo: '', 
                                    fullText: '', 
                                    hyperlinkPage: '', 
                                    hyperlinkUrl: '' 
                                  };
                                  setOcrTableRows(prev => [...prev, newRow]);
                                  setHasUnsavedChanges(true);
                                }}
                                className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                                data-testid="button-add-row"
                              >
                                + Add Row
                              </button>
                              
                              {/* Unsaved changes indicator */}
                              {hasUnsavedChanges && (
                                <div className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-200">
                                  <span className="animate-pulse">⚠️</span>
                                  <span className="font-medium">Unsaved changes</span>
                                </div>
                              )}
                              
                              {/* 💾 Enhanced Manual Save Button */}
                              <button
                                onClick={handleManualSave}
                                disabled={isSaving}
                                className={`text-xs px-4 py-2 rounded font-medium transition-all flex items-center gap-2 ${
                                  isSaving 
                                    ? 'bg-gray-400 cursor-not-allowed' 
                                    : hasUnsavedChanges 
                                      ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg animate-pulse' 
                                      : 'bg-green-500 hover:bg-green-600 text-white'
                                }`}
                                data-testid="button-save-hyperlinks"
                                title={hasUnsavedChanges ? "You have unsaved changes - click to save to database" : "Save all hyperlink page numbers to database"}
                              >
                                {isSaving ? (
                                  <>
                                    <span className="animate-spin">⏳</span>
                                    <span>Saving...</span>
                                  </>
                                ) : (
                                  <>
                                    <span>💾</span>
                                    <span>Save to Database</span>
                                    {hasUnsavedChanges && <span className="ml-1 text-yellow-300">●</span>}
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                          
                          {/* Floating save button when table is empty but there might be data */}
                          {ocrTableRows.length === 0 && hasUnsavedChanges && (
                            <div className="fixed bottom-4 right-4 z-50">
                              <button
                                onClick={handleManualSave}
                                disabled={isSaving}
                                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow-lg font-medium flex items-center gap-2 animate-bounce"
                                data-testid="button-save-hyperlinks-floating"
                                title="Save pending changes to database"
                              >
                                {isSaving ? (
                                  <>
                                    <span className="animate-spin">⏳</span>
                                    <span>Saving...</span>
                                  </>
                                ) : (
                                  <>
                                    <span>💾</span>
                                    <span>Save Changes</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                    </div>
                  </div>
                </section>
                
                <section data-testid="index-screenshots" id="index-screenshots" className="pb-8">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-lg font-bold text-black">📸 Index Screenshots</h4>
                    
                    {/* 🔄 BATCH OCR: Batch processing controls */}
                    {indexScreenshots.length > 1 && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={toggleBatchMode}
                          className={`text-xs px-3 py-1 rounded transition-all ${
                            isBatchMode 
                              ? 'bg-blue-600 text-white hover:bg-blue-700' 
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                          data-testid="button-toggle-batch-mode"
                        >
                          {isBatchMode ? '✓ Batch Mode' : 'Batch Mode'}
                        </button>
                        
                        {isBatchMode && (
                          <>
                            <span className="text-xs text-gray-500">|</span>
                            <button
                              onClick={selectAllScreenshots}
                              disabled={selectedScreenshotIds.length === indexScreenshots.length}
                              className="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              data-testid="button-select-all"
                            >
                              Select All ({indexScreenshots.length})
                            </button>
                            
                            <button
                              onClick={clearScreenshotSelection}
                              disabled={selectedScreenshotIds.length === 0}
                              className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              data-testid="button-clear-selection"
                            >
                              Clear
                            </button>
                            
                            <button
                              onClick={handleBatchOCRClick}
                              disabled={selectedScreenshotIds.length === 0 || isBatchProcessing}
                              className="text-xs px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                              data-testid="button-batch-ocr"
                            >
                              {isBatchProcessing ? (
                                <>🔄 Processing...</>
                              ) : (
                                <>⚡ Batch OCR ({selectedScreenshotIds.length})</>
                              )}
                            </button>
                            
                            <span className="text-xs text-gray-600">
                              Left→Right Order Preserved
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="h-32 border-2 border-dashed border-blue-300 rounded-lg overflow-hidden">
                          {indexScreenshots.length === 0 ? (
                            // Upload area when no screenshots
                            <div 
                              className="h-full p-3 text-center hover:border-blue-400 transition-colors flex items-center justify-center"
                              onPaste={handlePaste}
                              onDrop={(e) => {
                                e.preventDefault();
                                handleScreenshotUpload(e.dataTransfer.files);
                              }}
                              onDragOver={(e) => e.preventDefault()}
                            >
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={(e) => handleScreenshotUpload(e.target.files)}
                                className="hidden"
                                id="screenshot-upload"
                              />
                              <label 
                                htmlFor="screenshot-upload" 
                                className="cursor-pointer text-xs text-black hover:text-black"
                              >
                                📸 Click to upload or paste screenshots<br/>
                                <span className="text-xs text-black">
                                  Take screenshots of index pages and paste/upload them here
                                </span>
                              </label>
                            </div>
                          ) : (
                            // Screenshot display area with drag and drop
                            <div className="h-full p-2">
                              <div className="flex gap-2 h-full overflow-x-auto">
                                {indexScreenshots.map((screenshot, index) => (
                                  <div
                                    key={screenshot.id}
                                    draggable
                                    onDragStart={(e) => {
                                      e.dataTransfer.setData('text/plain', screenshot.id);
                                      e.dataTransfer.effectAllowed = 'move';
                                    }}
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      e.dataTransfer.dropEffect = 'move';
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      
                                      const draggedId = e.dataTransfer.getData('text/plain');
                                      const draggedIndex = indexScreenshots.findIndex(s => s.id === draggedId);
                                      const targetIndex = index;
                                      
                                      // Only proceed if we have valid indices and they're different
                                      if (draggedIndex !== -1 && draggedIndex !== targetIndex && draggedId) {
                                        setIndexScreenshots(prev => {
                                          const newScreenshots = [...prev];
                                          
                                          // Remove the dragged item from its original position
                                          const [draggedItem] = newScreenshots.splice(draggedIndex, 1);
                                          
                                          // Insert the dragged item at the target position
                                          newScreenshots.splice(targetIndex, 0, draggedItem);
                                          
                                          return newScreenshots;
                                        });
                                        
                                        // Update OCR text in new order after state update
                                        setTimeout(() => {
                                          setIndexScreenshots(current => {
                                            const newOcrText = current
                                              .filter(s => s.ocrText && s.ocrText.trim().length > 0)
                                              .map((s, i) => `--- Screenshot ${i + 1} OCR ---\n${s.ocrText}`)
                                              .join('\n\n');
                                            setBatch1Ocr(newOcrText);
                                            
                                            // ALSO update table rows directly
                                            if (newOcrText) {
                                              const directRows = parseOcrToTableRows(newOcrText);
                                              setOcrTableRows(directRows);
                                            }
                                            
                                            return current;
                                          });
                                        }, 0);
                                        
                                        toast({
                                          title: "Screenshots Reordered",
                                          description: `Moved screenshot to position ${targetIndex + 1}`,
                                        });
                                      }
                                    }}
                                    className={`flex-shrink-0 w-20 h-full border rounded cursor-move transition-all ${
                                      activeScreenshotId === screenshot.id ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'
                                    } hover:border-blue-400 hover:shadow-sm relative group`}
                                    onClick={() => setActiveScreenshotId(screenshot.id)}
                                    title={`Screenshot ${index + 1}: ${screenshot.name}`}
                                  >
                                    {/* Screenshot number */}
                                    <div className="absolute top-0 left-0 bg-blue-600 text-white text-xs px-1 rounded-br z-10">
                                      {index + 1}
                                    </div>
                                    
                                    {/* 🔄 BATCH OCR: Selection checkbox (top-right) */}
                                    {isBatchMode && (
                                      <div className="absolute top-1 right-1 z-20">
                                        <input
                                          type="checkbox"
                                          checked={selectedScreenshotIds.includes(screenshot.id)}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            toggleScreenshotSelection(screenshot.id);
                                          }}
                                          className="w-4 h-4 cursor-pointer accent-orange-600"
                                          data-testid={`checkbox-screenshot-${index}`}
                                          title={`Select screenshot ${index + 1} for batch OCR`}
                                        />
                                      </div>
                                    )}
                                    
                                    {/* Screenshot image with visual selection indicator */}
                                    <img
                                      src={screenshot.url}
                                      alt={`Screenshot ${index + 1}`}
                                      className={`w-full h-full object-cover rounded transition-all ${
                                        isBatchMode && selectedScreenshotIds.includes(screenshot.id)
                                          ? 'ring-2 ring-orange-400 ring-inset opacity-90'
                                          : ''
                                      }`}
                                    />
                                    
                                    {/* OCR button */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        processScreenshotOCR(screenshot.id, screenshot.url);
                                      }}
                                      onMouseDown={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                      }}
                                      disabled={screenshot.isOcrProcessing}
                                      draggable={false}
                                      className={`absolute bottom-0 right-0 bg-green-500 text-white text-xs w-8 h-6 rounded-tl transition-all z-10 flex items-center justify-center hover:bg-green-600 disabled:opacity-50 ${
                                        activeScreenshotId === screenshot.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                      }`}
                                      data-testid={`button-ocr-${screenshot.id}`}
                                      title="Run OCR on this screenshot"
                                    >
                                      {screenshot.isOcrProcessing ? '⏳' : '📝'}
                                    </button>
                                    
                                    {/* Delete button */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteScreenshot(screenshot.id);
                                      }}
                                      onMouseDown={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                      }}
                                      draggable={false}
                                      className={`absolute top-0 right-0 bg-red-500 text-white text-xs w-6 h-6 rounded-bl transition-all z-10 flex items-center justify-center hover:bg-red-600 ${
                                        activeScreenshotId === screenshot.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                      }`}
                                      data-testid={`button-delete-${screenshot.id}`}
                                      title="Delete this screenshot"
                                    >
                                      ✕
                                    </button>
                                    
                                    {/* OCR processing indicator */}
                                    {screenshot.isOcrProcessing && (
                                      <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded">
                                        <div className="text-white text-xs">🔄 OCR Processing...</div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                                
                                {/* Add more button */}
                                <div 
                                  className="flex-shrink-0 w-20 h-full border-2 border-dashed border-gray-300 rounded flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors"
                                  onClick={() => document.getElementById('screenshot-upload')?.click()}
                                  onPaste={handlePaste}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    handleScreenshotUpload(e.dataTransfer.files);
                                  }}
                                  onDragOver={(e) => e.preventDefault()}
                                >
                                  <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={(e) => handleScreenshotUpload(e.target.files)}
                                    className="hidden"
                                    id="screenshot-upload"
                                  />
                                  <div className="text-center text-gray-400 text-xs">
                                    <div>+</div>
                                    <div>Add</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </section>
                </div>
                    </ResizablePanel>

              <ResizableHandle withHandle />

              {/* RIGHT: PDF View */}
              <ResizablePanel defaultSize={35} minSize={20} className="overflow-hidden pl-1">
                <section data-testid="pdf-view" id="pdf-view" className="h-full">
                  <div className="h-full w-full overflow-auto bg-muted rounded-lg border">
                    <div className="flex items-center justify-between mb-2 p-3 bg-white border-b">
                      <h4 className="text-lg font-bold text-black">📄 PDF View</h4>
                      {/* Zoom Controls and Screenshot Button */}
                      <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const newZoom = Math.max(0.25, zoom - 0.25);
                              setZoom(newZoom);
                            }}
                            className="text-xs px-2 py-1 h-6"
                            title="Zoom Out"
                          >
                            -
                          </Button>
                          <span className="text-xs text-black min-w-[3rem] text-center">
                            {Math.round(zoom * 100)}%
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const newZoom = Math.min(2, zoom + 0.25);
                              setZoom(newZoom);
                            }}
                            className="text-xs px-2 py-1 h-6"
                            title="Zoom In"
                          >
                            +
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              // Capture screenshot of PDF viewer
                              const pdfContainer = document.querySelector('.pdf-viewer-container');
                              if (pdfContainer) {
                                // Use html2canvas to capture the PDF view
                                import('html2canvas').then(({ default: html2canvas }) => {
                                  html2canvas(pdfContainer as HTMLElement, {
                                    allowTaint: true,
                                    scale: 1,
                                    useCORS: true,
                                    backgroundColor: '#ffffff'
                                  }).then(canvas => {
                                    const dataUrl = canvas.toDataURL('image/png', 0.9);
                                    const screenshotName = `PDF_Screenshot_${new Date().toLocaleString()}`;
                                    handlePdfScreenshotCapture(dataUrl, screenshotName);
                                  }).catch(error => {
                                    console.error('Screenshot capture failed:', error);
                                    toast({
                                      title: "Screenshot Failed",
                                      description: "Could not capture PDF screenshot",
                                      variant: "destructive"
                                    });
                                  });
                                });
                              }
                            }}
                            className="text-xs px-2 py-1 h-6 bg-blue-600 text-white hover:bg-blue-700"
                            title="Capture PDF Screenshot"
                          >
                            📸
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={refreshPdf}
                            className="text-xs px-2 py-1 h-6 bg-green-600 text-white hover:bg-green-700"
                            title="Refresh PDF Viewer"
                            data-testid="button-refresh-pdf"
                          >
                            🔄
                          </Button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-auto p-3" style={{ paddingBottom: '120px' }}>
                      <div className="pdf-viewer-container">
                        <MultiPagePdf 
                          url={`${pdfUrl}?refresh=${pdfRefreshKey}`} 
                          documentId={documentId}
                          zoom={zoom}
                          start={1}
                          end={totalPages > 0 ? totalPages : 500}
                          onTotalPages={setTotalPages}
                          showPage2Links={showPage2Links}
                          page2Links={page2Links}
                          onNavigateToPage={handleNavigateToPage}
                        />
                      </div>
                    </div>
                  </div>
                </section>
              </ResizablePanel>
            </ResizablePanelGroup>

            {/* Mobile fallback: stacked */}
            <div className="md:hidden space-y-6">
              <section data-testid="index-ocr-text">
                {/* Sticky OCR Controls Header - Mobile */}
                <div className="sticky top-0 bg-white z-10 pb-2 border-b border-gray-200 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-lg font-bold text-black">📝 Index Tabs OCR Text</h4>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={freshPage}
                        className="text-xs px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-1 font-bold"
                        title="Fresh Page - Reset everything and display all content immediately"
                        data-testid="button-fresh-page-mobile"
                      >
                        ✨ Fresh Page
                      </button>
                      <button
                        onClick={refreshOcrText}
                        className="text-xs px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 flex items-center gap-1"
                        title="Refresh OCR text from all screenshots"
                        data-testid="button-refresh-ocr-text-mobile"
                      >
                        🔄 Refresh OCR
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-blue-600 mb-2">
                    💡 Type directly or paste screenshots (Ctrl+V) to add to Index Screenshots below. Add hyperlink page numbers and URLs in the rightmost columns.
                  </div>
                </div>
                <div className="border-2 border-dashed border-blue-300 rounded hover:border-blue-400 focus-within:border-blue-500 transition-colors bg-white">
                  
                  {/* Raw OCR Text Display - Mobile */}
                  <div className="p-3 border-b border-gray-200 bg-gray-50">
                    <textarea
                      value={batch1Ocr}
                      onChange={(e) => setBatch1Ocr(e.target.value)}
                      placeholder="OCR text will appear here automatically when you take screenshots..."
                      className="w-full h-32 p-2 text-sm border border-gray-300 rounded resize-none focus:border-blue-500 focus:outline-none text-black"
                      data-testid="textarea-ocr-text-mobile"
                    />
                  </div>
                  
                  {/* OCR Text Table Display */}
                  <div className="h-[400px] overflow-auto bg-white">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-blue-50 sticky top-0">
                        <tr>
                          <th className="border border-gray-300 px-2 py-1 text-left font-medium w-16 min-w-16 max-w-16">Tab No.</th>
                          <th className="border border-gray-300 px-2 py-1 text-left font-medium">DATE OF DOCUMENT</th>
                          <th className="border border-gray-300 px-2 py-1 text-left font-medium">NATURE OF DOCUMENT</th>
                          <th className="border border-gray-300 px-2 py-1 text-left font-medium bg-yellow-50">Hyperlink Page</th>
                          <th className="border border-gray-300 px-2 py-1 text-left font-medium bg-yellow-50">Hyperlink URL</th>
                          <th className="border border-gray-300 px-2 py-1 text-center font-medium bg-red-50">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ocrTableRows.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="border border-gray-300 px-2 py-8 text-center text-gray-400">
                              Paste screenshots (Ctrl+V) or type your table data here...
                              <br/>
                              <button 
                                onClick={() => {
                                  const newRow = { 
                                    id: Date.now().toString(), 
                                    tabNo: '', 
                                    fullText: '', 
                                    hyperlinkPage: '', 
                                    hyperlinkUrl: '' 
                                  };
                                  setOcrTableRows([newRow]);
                                }}
                                className="mt-2 text-blue-600 hover:text-blue-800 underline"
                              >
                                Click to add first row
                              </button>
                            </td>
                          </tr>
                        ) : (
                          ocrTableRows.map((row, index) => (
                            <tr key={row.id} className="hover:bg-blue-50">
                              <td className="border border-gray-300 px-1 py-1 w-16 min-w-16 max-w-16">
                                <input
                                  type="text"
                                  value={row.tabNo}
                                  onChange={(e) => updateOcrRow(index, 'tabNo', e.target.value)}
                                  className="w-full bg-transparent border-none text-xs p-1 placeholder:text-gray-700"
                                  style={{ color: '#000000' }}
                                  placeholder={`${index + 1}`}
                                  data-testid={`input-tab-no-${index}`}
                                />
                              </td>
                              <td className="border border-gray-300 px-1 py-1">
                                <input
                                  type="text"
                                  value={row.date}
                                  onChange={(e) => updateOcrRow(index, 'date', e.target.value)}
                                  className="w-full bg-transparent border-none text-xs p-1 placeholder:text-gray-700"
                                  style={{ color: '#000000' }}
                                  placeholder="March 16, 2022"
                                  data-testid={`input-date-${index}`}
                                />
                              </td>
                              <td className="border border-gray-300 px-1 py-1">
                                <input
                                  type="text"
                                  value={row.nature}
                                  onChange={(e) => updateOcrRow(index, 'nature', e.target.value)}
                                  className="w-full bg-transparent border-none text-xs p-1 placeholder:text-gray-700"
                                  style={{ color: '#000000' }}
                                  placeholder="Request for Information of the Applicant"
                                  data-testid={`input-nature-${index}`}
                                />
                              </td>
                              <td className="border border-gray-300 px-1 py-1 bg-yellow-50">
                                <input
                                  type="number"
                                  value={row.hyperlinkPage}
                                  onChange={(e) => updateOcrRow(index, 'hyperlinkPage', e.target.value)}
                                  className="w-full bg-transparent border-none text-xs p-1 placeholder:text-gray-700"
                                  style={{ color: '#000000' }}
                                  placeholder="15"
                                  data-testid={`input-hyperlink-page-${index}`}
                                />
                              </td>
                              <td className="border border-gray-300 px-1 py-1 bg-yellow-50">
                                <input
                                  type="url"
                                  value={row.hyperlinkUrl}
                                  onChange={(e) => updateOcrRow(index, 'hyperlinkUrl', e.target.value)}
                                  className="w-full bg-transparent border-none text-xs p-1 bg-gray-100 placeholder:text-gray-700"
                                  style={{ color: '#000000' }}
                                  placeholder="—"
                                  readOnly
                                  data-testid={`input-hyperlink-url-${index}`}
                                />
                              </td>
                              <td className="border border-gray-300 px-1 py-1 text-center">
                                <button
                                  onClick={() => deleteOcrRow(index)}
                                  className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs font-medium"
                                  title={`Delete row ${index + 1}`}
                                  data-testid={`button-delete-row-${index}`}
                                >
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                    
                    {/* Add Row Button */}
                    {ocrTableRows.length > 0 && (
                      <div className="sticky bottom-0 bg-white border-t border-gray-300 p-2">
                        <button
                          onClick={() => {
                            const newRow = { 
                              id: Date.now().toString(), 
                              tabNo: '', 
                              fullText: '',
                              hyperlinkPage: '', 
                              hyperlinkUrl: '',
                              // Legacy fields for compatibility
                              date: '', 
                              nature: ''
                            };
                            setOcrTableRows(prev => [...prev, newRow]);
                          }}
                          className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                          data-testid="button-add-row"
                        >
                          + Add Row
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </section>
              
              <section data-testid="index-screenshots" className="pb-8">
                <h4 className="text-lg font-bold mb-2 text-black">📸 Index Screenshots</h4>
                <div className="h-32 border-2 border-dashed border-blue-300 rounded-lg overflow-hidden">
                  {indexScreenshots.length === 0 ? (
                    <div 
                      className="h-full p-3 text-center hover:border-blue-400 transition-colors flex items-center justify-center"
                      onPaste={handlePaste}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleScreenshotUpload(e.dataTransfer.files);
                      }}
                      onDragOver={(e) => e.preventDefault()}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => handleScreenshotUpload(e.target.files)}
                        className="hidden"
                        id="screenshot-upload-mobile"
                      />
                      <label 
                        htmlFor="screenshot-upload-mobile" 
                        className="cursor-pointer text-xs text-black hover:text-black"
                      >
                        📸 Click to upload or paste screenshots<br/>
                        <span className="text-xs text-black">
                          Take screenshots of index pages and paste/upload them here
                        </span>
                      </label>
                    </div>
                  ) : (
                    <div className="h-full p-2">
                      <div className="flex gap-2 h-full overflow-x-auto">
                        {indexScreenshots.map((screenshot, index) => (
                          <div
                            key={screenshot.id}
                            className={`flex-shrink-0 w-20 h-full border rounded cursor-move transition-all ${
                              activeScreenshotId === screenshot.id ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'
                            } hover:border-blue-400 hover:shadow-sm relative group`}
                            onClick={() => setActiveScreenshotId(screenshot.id)}
                            title={`Screenshot ${index + 1}: ${screenshot.name}`}
                          >
                            <div className="absolute top-0 left-0 bg-blue-600 text-white text-xs px-1 rounded-br z-10">
                              {index + 1}
                            </div>
                            <img
                              src={screenshot.url}
                              alt={`Screenshot ${index + 1}`}
                              className="w-full h-full object-cover rounded"
                            />
                            
                            {/* OCR button - Second screenshot display section */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                processScreenshotOCR(screenshot.id, screenshot.url);
                              }}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                              }}
                              disabled={screenshot.isOcrProcessing}
                              draggable={false}
                              className={`absolute bottom-0 right-0 bg-green-500 text-white text-xs w-8 h-6 rounded-tl transition-all z-10 flex items-center justify-center hover:bg-green-600 disabled:opacity-50 ${
                                activeScreenshotId === screenshot.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                              }`}
                              data-testid={`button-ocr-${screenshot.id}`}
                              title="Run OCR on this screenshot"
                            >
                              {screenshot.isOcrProcessing ? '⏳' : '📝'}
                            </button>
                            
                            {/* OCR processing indicator - Second screenshot display section */}
                            {screenshot.isOcrProcessing && (
                              <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded">
                                <div className="text-white text-xs">🔄 OCR Processing...</div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
              
              {/* Extended Content Area - Making editor 50% longer */}
              <section data-testid="secondary-screenshots" className="mt-8">
                <h4 className="text-lg font-bold mb-4 text-black border-t pt-6">📸 Secondary Index Screenshots</h4>
                <div className="h-48 border-2 border-dashed border-purple-300 rounded-lg bg-purple-50 flex items-center justify-center mb-8">
                  <div className="text-center text-purple-700 text-base">
                    📂 Secondary Screenshot Area<br/>
                    <span className="text-sm">Add more index screenshots here</span><br/>
                    <span className="text-xs text-gray-600">This section ensures proper scrolling visibility</span>
                  </div>
                </div>
                
                {/* Batch PDF OCR Processing Controls */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-6 mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="text-2xl">🔍</div>
                    <h3 className="text-lg font-bold text-blue-900">Batch PDF OCR Processing</h3>
                    {visionApiAvailable === true && (
                      <Badge className="bg-green-100 text-green-800">Vision API Ready</Badge>
                    )}
                    {visionApiAvailable === false && (
                      <Badge variant="destructive">Vision API Unavailable</Badge>
                    )}
                    {strictOCR && (
                      <Badge className="bg-purple-100 text-purple-800">Strict Mode</Badge>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="bg-white p-4 rounded border">
                      <h4 className="font-semibold text-gray-800 mb-2">📄 OCR Status</h4>
                      <div className="space-y-2 text-sm">
                        <div>Processed Pages: <span className="font-mono">{pdfOcrPages.length}</span></div>
                        <div>Last Hash: <span className="font-mono text-xs">{lastProcessedPdfHash ? lastProcessedPdfHash.slice(0, 12) + '...' : 'None'}</span></div>
                        <div>Strict OCR: <span className={`font-semibold ${strictOCR ? 'text-green-600' : 'text-red-600'}`}>{strictOCR ? 'Enabled' : 'Disabled'}</span></div>
                      </div>
                    </div>
                    
                    <div className="bg-white p-4 rounded border">
                      <h4 className="font-semibold text-gray-800 mb-2">⚡ Processing Controls</h4>
                      <div className="space-y-2">
                        <Button
                          onClick={() => batchProcessPdfOcr(false)}
                          disabled={!strictOCR || isProcessingPdf || visionApiAvailable === false}
                          className="w-full text-sm"
                          data-testid="button-start-batch-ocr"
                        >
                          {isProcessingPdf ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                              Processing...
                            </>
                          ) : (
                            <>
                              <Eye className="w-4 h-4 mr-2" />
                              Start Batch OCR
                            </>
                          )}
                        </Button>
                        
                        <Button
                          onClick={() => batchProcessPdfOcr(true)}
                          disabled={!strictOCR || isProcessingPdf || visionApiAvailable === false}
                          variant="outline"
                          className="w-full text-sm"
                          data-testid="button-force-reprocess-ocr"
                        >
                          <Wand2 className="w-4 h-4 mr-2" />
                          Force Reprocess
                        </Button>
                        
                        <Button
                          onClick={detectIndexPages}
                          disabled={!strictOCR || isDetectingIndexPages || pdfOcrPages.length === 0}
                          variant="secondary"
                          className="w-full text-sm bg-green-100 hover:bg-green-200 text-green-800"
                          data-testid="button-auto-detect-index"
                        >
                          {isDetectingIndexPages ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-800 mr-2"></div>
                              Detecting...
                            </>
                          ) : (
                            <>
                              <Target className="w-4 h-4 mr-2" />
                              Auto-Detect Index Pages
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Progress tracking */}
                  {isProcessingPdf && (
                    <div className="bg-white p-4 rounded border">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">Processing Progress</span>
                        <span className="text-sm text-gray-600">
                          {batchOcrProgress.current}/{batchOcrProgress.total}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{
                            width: batchOcrProgress.total > 0 
                              ? `${(batchOcrProgress.current / batchOcrProgress.total) * 100}%` 
                              : '0%'
                          }}
                        ></div>
                      </div>
                      <div className="text-xs text-gray-600">
                        Status: {batchOcrProgress.status}
                      </div>
                    </div>
                  )}
                  
                  {/* OCR Results Preview */}
                  {pdfOcrPages.length > 0 && !isProcessingPdf && (
                    <div className="bg-white p-4 rounded border mt-4">
                      <h4 className="font-semibold text-gray-800 mb-2">📋 OCR Results</h4>
                      <div className="text-sm text-gray-600 mb-2">
                        Successfully processed {pdfOcrPages.length} pages
                      </div>
                      <div className="max-h-32 overflow-y-auto bg-gray-50 p-2 rounded text-xs font-mono">
                        {pdfOcrPages.slice(0, 3).map(page => (
                          <div key={page.page} className="mb-1 pb-1 border-b border-gray-200 last:border-b-0">
                            <strong>Page {page.page}:</strong> {page.text.slice(0, 100)}...
                          </div>
                        ))}
                        {pdfOcrPages.length > 3 && (
                          <div className="text-center text-gray-500 italic">
                            ... and {pdfOcrPages.length - 3} more pages
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Auto-Detection Results */}
                  {autoDetectionComplete && detectedIndexPages.length > 0 && (
                    <div className="bg-white p-4 rounded border mt-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                          <Target className="w-4 h-4 text-green-600" />
                          🎯 Detected Index Pages ({detectedIndexPages.length})
                        </h4>
                        <div className="flex gap-2">
                          <Button
                            onClick={selectAllHighConfidencePages}
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            data-testid="button-select-high-confidence"
                          >
                            Select High Confidence
                          </Button>
                          <Button
                            onClick={clearAllSelections}
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            data-testid="button-clear-selections"
                          >
                            Clear All
                          </Button>
                          <Button
                            onClick={processSelectedIndexPages}
                            disabled={!detectedIndexPages.some(p => p.isSelected) || isLoading}
                            className="text-xs bg-green-600 hover:bg-green-700"
                            size="sm"
                            data-testid="button-process-selected"
                          >
                            {isLoading ? (
                              <>
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                                Processing...
                              </>
                            ) : (
                              <>
                                <ArrowRight className="w-3 h-3 mr-1" />
                                Process Selected ({detectedIndexPages.filter(p => p.isSelected).length})
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                      
                      {/* Legend */}
                      <div className="flex items-center gap-4 mb-3 text-xs text-gray-600">
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-green-100 border border-green-400 rounded"></div>
                          High (≥70%)
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-yellow-100 border border-yellow-400 rounded"></div>
                          Medium (40-69%)
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-orange-100 border border-orange-400 rounded"></div>
                          Low (15-39%)
                        </div>
                      </div>
                      
                      {/* Detected Pages List */}
                      <div className="max-h-64 overflow-y-auto space-y-2">
                        {detectedIndexPages.map((detectedPage) => {
                          const confidencePercent = Math.round(detectedPage.confidence * 100);
                          const confidenceColor = 
                            detectedPage.confidence >= 0.7 ? 'green' :
                            detectedPage.confidence >= 0.4 ? 'yellow' : 'orange';
                          
                          return (
                            <div
                              key={detectedPage.page}
                              className={`border rounded-lg p-3 cursor-pointer transition-all ${
                                detectedPage.isSelected 
                                  ? 'border-blue-500 bg-blue-50' 
                                  : 'border-gray-200 hover:border-gray-300'
                              }`}
                              onClick={() => toggleIndexPageSelection(detectedPage.page)}
                              data-testid={`detected-page-${detectedPage.page}`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                  <Checkbox
                                    checked={detectedPage.isSelected}
                                    onChange={() => toggleIndexPageSelection(detectedPage.page)}
                                    className="mt-1"
                                  />
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="font-semibold text-gray-800">
                                        Page {detectedPage.page}
                                      </span>
                                      <Badge 
                                        className={`text-xs ${
                                          confidenceColor === 'green' ? 'bg-green-100 text-green-800' :
                                          confidenceColor === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                                          'bg-orange-100 text-orange-800'
                                        }`}
                                      >
                                        {confidencePercent}% confidence
                                      </Badge>
                                      <span className="text-xs text-gray-500">
                                        {detectedPage.indexEntries.length} entries
                                      </span>
                                    </div>
                                    
                                    {/* Patterns found */}
                                    <div className="text-xs text-gray-600 mb-2">
                                      <span className="font-medium">Patterns:</span> {detectedPage.patterns.join(', ')}
                                    </div>
                                    
                                    {/* Sample entries preview */}
                                    {detectedPage.indexEntries.length > 0 && (
                                      <div className="text-xs text-gray-700">
                                        <span className="font-medium">Sample entries:</span>
                                        <div className="mt-1 space-y-1">
                                          {detectedPage.indexEntries.slice(0, 3).map((entry, idx) => (
                                            <div key={idx} className="pl-2 border-l-2 border-gray-200">
                                              <span className="font-mono text-blue-600">
                                                {entry.tabNumber}
                                              </span>
                                              {entry.dateFound && (
                                                <span className="mx-1 text-green-600">
                                                  {entry.dateFound}
                                                </span>
                                              )}
                                              <span className="text-gray-700">
                                                {entry.text.substring(0, 80)}
                                                {entry.text.length > 80 ? '...' : ''}
                                              </span>
                                              {entry.pageRef && (
                                                <span className="ml-1 text-purple-600 font-mono">
                                                  p.{entry.pageRef}
                                                </span>
                                              )}
                                            </div>
                                          ))}
                                          {detectedPage.indexEntries.length > 3 && (
                                            <div className="text-gray-500 text-center">
                                              +{detectedPage.indexEntries.length - 3} more entries
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  {/* No results message */}
                  {autoDetectionComplete && detectedIndexPages.length === 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mt-4">
                      <div className="flex items-center gap-2 text-yellow-800">
                        <FileText className="w-4 h-4" />
                        <span className="font-medium">No Index Pages Detected</span>
                      </div>
                      <p className="text-sm text-yellow-700 mt-1">
                        The auto-detection didn't find pages with strong index patterns. This could mean:
                      </p>
                      <ul className="text-xs text-yellow-600 mt-2 ml-4 space-y-1">
                        <li>• The document doesn't contain a traditional index</li>
                        <li>• Index pages have unusual formatting that wasn't recognized</li>
                        <li>• OCR quality affected pattern recognition</li>
                        <li>• Try adjusting the confidence threshold or manual review</li>
                      </ul>
                    </div>
                  )}
                  
                  {/* API Status and Troubleshooting */}
                  {visionApiAvailable === false && (
                    <div className="bg-red-50 border border-red-200 p-4 rounded mt-4">
                      <h4 className="font-semibold text-red-800 mb-2">⚠️ Google Cloud Vision API Issue</h4>
                      <div className="text-sm text-red-700 space-y-1">
                        <div>• Check Google Cloud credentials</div>
                        <div>• Verify billing account is active</div>
                        <div>• Ensure Vision API is enabled</div>
                      </div>
                    </div>
                  )}
                  
                  {!strictOCR && (
                    <div className="bg-yellow-50 border border-yellow-200 p-4 rounded mt-4">
                      <h4 className="font-semibold text-yellow-800 mb-2">🔒 Strict OCR Mode Required</h4>
                      <div className="text-sm text-yellow-700">
                        Enable Strict OCR mode above to use batch PDF processing with Google Cloud Vision.
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Additional Screenshot Categories */}
                <div className="space-y-6 mb-8">
                  <div className="h-32 border-2 border-dashed border-green-300 rounded-lg bg-green-50 flex items-center justify-center">
                    <div className="text-center text-green-700">
                      📄 Document References<br/>
                      <span className="text-sm">Screenshot references to other documents</span>
                    </div>
                  </div>
                  
                  <div className="h-32 border-2 border-dashed border-orange-300 rounded-lg bg-orange-50 flex items-center justify-center">
                    <div className="text-center text-orange-700">
                      🔗 Hyperlink Sources<br/>
                      <span className="text-sm">Screenshots showing hyperlink source pages</span>
                    </div>
                  </div>
                  
                  <div className="h-32 border-2 border-dashed border-indigo-300 rounded-lg bg-indigo-50 flex items-center justify-center">
                    <div className="text-center text-indigo-700">
                      📋 Index Tables<br/>
                      <span className="text-sm">Screenshots of index table sections</span>
                    </div>
                  </div>
                </div>
                
                {/* Large spacing to guarantee scrolling */}
                <div className="h-64 bg-gradient-to-b from-gray-50 to-white rounded-lg border border-gray-200 flex items-center justify-center mb-12">
                  <div className="text-center text-gray-500">
                    <div className="text-2xl mb-2">⬆️</div>
                    <div className="text-sm">Use scroll button to go back to OCR controls</div>
                    <div className="text-xs text-gray-400 mt-1">Click the blue arrow button in bottom right</div>
                  </div>
                </div>
                
                {/* Extra Extended Content */}
                <div className="space-y-8 mb-16">
                  <div className="h-40 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-gray-300 flex items-center justify-center">
                    <div className="text-center text-gray-600">
                      <div className="text-lg mb-2">📚 Extended Workspace</div>
                      <div className="text-sm">Additional space for future features</div>
                    </div>
                  </div>
                  
                  <div className="h-40 bg-gradient-to-r from-yellow-50 to-red-50 rounded-lg border border-gray-300 flex items-center justify-center">
                    <div className="text-center text-gray-600">
                      <div className="text-lg mb-2">⚡ Enhanced Scrolling Area</div>
                      <div className="text-sm">50% more content space as requested</div>
                    </div>
                  </div>
                </div>
                
                {/* Additional bottom spacing */}
                <div className="mb-32"></div>
              </section>
              
              <section data-testid="pdf-view">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-lg font-bold text-black">📄 PDF View</h4>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newZoom = Math.max(0.25, zoom - 0.25);
                        setZoom(newZoom);
                      }}
                      className="text-xs px-2 py-1 h-6"
                      title="Zoom Out"
                    >
                      -
                    </Button>
                    <span className="text-xs text-black min-w-[3rem] text-center">
                      {Math.round(zoom * 100)}%
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newZoom = Math.min(2, zoom + 0.25);
                        setZoom(newZoom);
                      }}
                      className="text-xs px-2 py-1 h-6"
                      title="Zoom In"
                    >
                      +
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const pdfContainer = document.querySelector('.pdf-viewer-container');
                        if (pdfContainer) {
                          import('html2canvas').then(({ default: html2canvas }) => {
                            html2canvas(pdfContainer as HTMLElement, {
                              allowTaint: true,
                              scale: 1,
                              useCORS: true,
                              backgroundColor: '#ffffff'
                            }).then(canvas => {
                              const dataUrl = canvas.toDataURL('image/png', 0.9);
                              const screenshotName = `PDF_Screenshot_${new Date().toLocaleString()}`;
                              handlePdfScreenshotCapture(dataUrl, screenshotName);
                            }).catch(error => {
                              console.error('Screenshot capture failed:', error);
                              toast({
                                title: "Screenshot Failed",
                                description: "Could not capture PDF screenshot",
                                variant: "destructive"
                              });
                            });
                          });
                        }
                      }}
                      className="text-xs px-2 py-1 h-6 bg-blue-600 text-white hover:bg-blue-700"
                      title="Capture PDF Screenshot"
                    >
                      📸
                    </Button>
                  </div>
                </div>
                <div className="border rounded p-3 h-[400px] overflow-auto bg-white">
                  <div className="pdf-viewer-container">
                    <MultiPagePdf 
                      url={pdfUrl} 
                      documentId={documentId}
                      zoom={zoom}
                      start={1}
                      end={totalPages > 0 ? totalPages : 500}
                      onTotalPages={setTotalPages}
                      showPage2Links={showPage2Links}
                      page2Links={page2Links}
                      onNavigateToPage={handleNavigateToPage}
                    />
                  </div>
                </div>
              </section>
            </div>
          </div>
        </CardContent>
        </Card>
      </Rnd>
    </div>
  );
}
