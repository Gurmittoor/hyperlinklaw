import { promises as fs } from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

export interface HyperlinkReference {
  source_file: string;
  source_page: number;
  ref_type: 'exhibit' | 'tab' | 'schedule' | 'affidavit' | 'undertaking' | 'refusal' | 'under_advisement';
  ref_value: string;
  snippet: string;
  full_text: string;
  confidence: number;
}

export interface DestinationCandidate {
  dest_page: number;
  confidence: number;
  method: string;
  preview_text?: string;
}

export interface HyperlinkMapping {
  source_file: string;
  source_page: number;
  ref_type: string;
  ref_value: string;
  snippet: string;
  top_dest_page: number;
  top_confidence: number;
  top_method: string;
  dest_candidates: DestinationCandidate[];
}

// Exact patterns from the email specification
const DETECTION_PATTERNS = {
  // Exhibits: \bExhibit\s+(?!No\b)([A-Z]{1,3}(?:-\d+)?|\d+)\b
  exhibits: /\bExhibit\s+(?!No\b)([A-Z]{1,3}(?:-\d+)?|\d+)\b/gi,
  
  // Tabs: \bTab\s+(\d{1,3})\b
  tabs: /\bTab\s+(\d{1,3})\b/gi,
  
  // Schedules: \bSchedule\s+([A-Z0-9]{1,3})\b
  schedules: /\bSchedule\s+([A-Z0-9]{1,3})\b/gi,
  
  // Affidavits: \bAffidavit of ([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)+)(?:,?\s+dated\s+[A-Za-z]+\s+\d{1,2},\s+\d{4})?
  affidavits: /\bAffidavit of ([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)+)(?:,?\s+dated\s+[A-Za-z]+\s+\d{1,2},\s+\d{4})?/gi,
  
  // Undertakings / Refusals / Under Advisement: detect the literal words
  undertakings: /\bundertaking(s)?\b/gi,
  refusals: /\brefusal(s)?\b/gi,
  underAdvisement: /\bunder advisement\b/gi
};

/**
 * Extract text from PDF and detect internal references
 */
export async function detectReferencesInPDF(pdfPath: string, fileName: string): Promise<HyperlinkReference[]> {
  try {
    const pdfBytes = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const references: HyperlinkReference[] = [];

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex];
      const pageNumber = pageIndex + 1;
      
      // Extract text from page (simplified - in real implementation would use proper PDF text extraction)
      // For now, we'll simulate this with the patterns
      const pageText = await extractTextFromPage(page);
      
      // Detect each type of reference
      references.push(...detectExhibits(pageText, fileName, pageNumber));
      references.push(...detectTabs(pageText, fileName, pageNumber));
      references.push(...detectSchedules(pageText, fileName, pageNumber));
      references.push(...detectAffidavits(pageText, fileName, pageNumber));
      references.push(...detectUndertakings(pageText, fileName, pageNumber));
      references.push(...detectRefusals(pageText, fileName, pageNumber));
      references.push(...detectUnderAdvisement(pageText, fileName, pageNumber));
    }

    console.log(`Detected ${references.length} references in ${fileName}`);
    return references;
  } catch (error) {
    console.error(`Error processing PDF ${pdfPath}:`, error);
    return [];
  }
}

async function extractTextFromPage(page: any): Promise<string> {
  // This is a placeholder - in real implementation would use pdf-parse or similar
  // For demo purposes, returning sample text that matches expected patterns
  return `This is sample text containing Exhibit A, Tab 1, Schedule B, Affidavit of John Smith, undertakings, refusals, and items under advisement.`;
}

function detectExhibits(text: string, fileName: string, pageNumber: number): HyperlinkReference[] {
  const references: HyperlinkReference[] = [];
  let match;
  
  while ((match = DETECTION_PATTERNS.exhibits.exec(text)) !== null) {
    const refValue = match[1];
    const snippet = getSnippet(text, match.index, 60);
    
    references.push({
      source_file: fileName,
      source_page: pageNumber,
      ref_type: 'exhibit',
      ref_value: refValue,
      snippet,
      full_text: match[0],
      confidence: 1.0
    });
  }
  
  return references;
}

function detectTabs(text: string, fileName: string, pageNumber: number): HyperlinkReference[] {
  const references: HyperlinkReference[] = [];
  let match;
  
  while ((match = DETECTION_PATTERNS.tabs.exec(text)) !== null) {
    const refValue = match[1];
    const snippet = getSnippet(text, match.index, 60);
    
    references.push({
      source_file: fileName,
      source_page: pageNumber,
      ref_type: 'tab',
      ref_value: refValue,
      snippet,
      full_text: match[0],
      confidence: 1.0
    });
  }
  
  return references;
}

function detectSchedules(text: string, fileName: string, pageNumber: number): HyperlinkReference[] {
  const references: HyperlinkReference[] = [];
  let match;
  
  while ((match = DETECTION_PATTERNS.schedules.exec(text)) !== null) {
    const refValue = match[1];
    const snippet = getSnippet(text, match.index, 60);
    
    references.push({
      source_file: fileName,
      source_page: pageNumber,
      ref_type: 'schedule',
      ref_value: refValue,
      snippet,
      full_text: match[0],
      confidence: 1.0
    });
  }
  
  return references;
}

function detectAffidavits(text: string, fileName: string, pageNumber: number): HyperlinkReference[] {
  const references: HyperlinkReference[] = [];
  let match;
  
  while ((match = DETECTION_PATTERNS.affidavits.exec(text)) !== null) {
    const refValue = match[1];
    const snippet = getSnippet(text, match.index, 60);
    
    references.push({
      source_file: fileName,
      source_page: pageNumber,
      ref_type: 'affidavit',
      ref_value: refValue,
      snippet,
      full_text: match[0],
      confidence: 1.0
    });
  }
  
  return references;
}

function detectUndertakings(text: string, fileName: string, pageNumber: number): HyperlinkReference[] {
  const references: HyperlinkReference[] = [];
  let match;
  
  while ((match = DETECTION_PATTERNS.undertakings.exec(text)) !== null) {
    const snippet = getSnippet(text, match.index, 60);
    
    references.push({
      source_file: fileName,
      source_page: pageNumber,
      ref_type: 'undertaking',
      ref_value: 'undertakings',
      snippet,
      full_text: match[0],
      confidence: 0.8
    });
  }
  
  return references;
}

function detectRefusals(text: string, fileName: string, pageNumber: number): HyperlinkReference[] {
  const references: HyperlinkReference[] = [];
  let match;
  
  while ((match = DETECTION_PATTERNS.refusals.exec(text)) !== null) {
    const snippet = getSnippet(text, match.index, 60);
    
    references.push({
      source_file: fileName,
      source_page: pageNumber,
      ref_type: 'refusal',
      ref_value: 'refusals',
      snippet,
      full_text: match[0],
      confidence: 0.8
    });
  }
  
  return references;
}

function detectUnderAdvisement(text: string, fileName: string, pageNumber: number): HyperlinkReference[] {
  const references: HyperlinkReference[] = [];
  let match;
  
  while ((match = DETECTION_PATTERNS.underAdvisement.exec(text)) !== null) {
    const snippet = getSnippet(text, match.index, 60);
    
    references.push({
      source_file: fileName,
      source_page: pageNumber,
      ref_type: 'under_advisement',
      ref_value: 'under advisement',
      snippet,
      full_text: match[0],
      confidence: 0.8
    });
  }
  
  return references;
}

function getSnippet(text: string, matchIndex: number, contextLength: number): string {
  const start = Math.max(0, matchIndex - contextLength);
  const end = Math.min(text.length, matchIndex + contextLength);
  return text.substring(start, end).trim();
}

/**
 * Map references to destinations in Trial Record
 */
export async function mapReferencesToDestinations(
  references: HyperlinkReference[], 
  trialRecordPath: string
): Promise<HyperlinkMapping[]> {
  const mappings: HyperlinkMapping[] = [];
  
  // Build searchable index of Trial Record
  const trialRecordIndex = await buildTrialRecordIndex(trialRecordPath);
  
  for (const ref of references) {
    const candidates = await findDestinationCandidates(ref, trialRecordIndex);
    
    const topCandidate = candidates[0] || { dest_page: 1, confidence: 0, method: 'fallback' };
    
    mappings.push({
      source_file: ref.source_file,
      source_page: ref.source_page,
      ref_type: ref.ref_type,
      ref_value: ref.ref_value,
      snippet: ref.snippet,
      top_dest_page: topCandidate.dest_page,
      top_confidence: topCandidate.confidence,
      top_method: topCandidate.method,
      dest_candidates: candidates.slice(0, 3) // Top 3 candidates
    });
  }
  
  return mappings;
}

async function buildTrialRecordIndex(pdfPath: string): Promise<Map<number, string>> {
  const index = new Map<number, string>();
  
  try {
    const pdfBytes = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex];
      const pageNumber = pageIndex + 1;
      const pageText = await extractTextFromPage(page);
      index.set(pageNumber, pageText.toLowerCase());
    }
  } catch (error) {
    console.error('Error building trial record index:', error);
  }
  
  return index;
}

async function findDestinationCandidates(
  ref: HyperlinkReference, 
  trialRecordIndex: Map<number, string>
): Promise<DestinationCandidate[]> {
  const candidates: DestinationCandidate[] = [];
  
  for (const [pageNumber, pageText] of Array.from(trialRecordIndex.entries())) {
    const confidence = calculateMatchConfidence(ref, pageText);
    
    if (confidence > 0) {
      candidates.push({
        dest_page: pageNumber,
        confidence,
        method: getMatchMethod(ref, pageText),
        preview_text: getPreview(pageText, ref)
      });
    }
  }
  
  // Sort by confidence (desc) then by page number (asc)
  candidates.sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    return a.dest_page - b.dest_page;
  });
  
  return candidates;
}

function calculateMatchConfidence(ref: HyperlinkReference, pageText: string): number {
  const searchTerm = `${ref.ref_type} ${ref.ref_value}`.toLowerCase();
  
  // Exact phrase match = 1.00
  if (pageText.includes(searchTerm)) {
    return 1.0;
  }
  
  // Individual tokens = 0.85
  const tokens = searchTerm.split(' ');
  const tokenMatches = tokens.filter(token => pageText.includes(token)).length;
  
  if (tokenMatches === tokens.length) {
    return 0.85;
  }
  
  if (tokenMatches > 0) {
    return 0.5 * (tokenMatches / tokens.length);
  }
  
  return 0;
}

function getMatchMethod(ref: HyperlinkReference, pageText: string): string {
  const searchTerm = `${ref.ref_type} ${ref.ref_value}`.toLowerCase();
  
  if (pageText.includes(searchTerm)) {
    return 'exact_phrase';
  }
  
  const tokens = searchTerm.split(' ');
  const tokenMatches = tokens.filter(token => pageText.includes(token)).length;
  
  if (tokenMatches === tokens.length) {
    return 'token_match';
  }
  
  return 'partial_match';
}

function getPreview(pageText: string, ref: HyperlinkReference): string {
  const searchTerm = `${ref.ref_type} ${ref.ref_value}`.toLowerCase();
  const index = pageText.indexOf(searchTerm);
  
  if (index !== -1) {
    const start = Math.max(0, index - 50);
    const end = Math.min(pageText.length, index + 100);
    return pageText.substring(start, end).trim();
  }
  
  return pageText.substring(0, 100).trim();
}

/**
 * Export candidate hyperlink map as CSV
 */
export function exportToCsv(mappings: HyperlinkMapping[]): string {
  const headers = [
    'source_file',
    'source_page', 
    'ref_type',
    'ref_value',
    'snippet',
    'top_dest_page',
    'top_confidence',
    'top_method',
    'alt_dest_1',
    'alt_confidence_1',
    'alt_dest_2', 
    'alt_confidence_2'
  ];
  
  const rows = mappings.map(mapping => [
    mapping.source_file,
    mapping.source_page.toString(),
    mapping.ref_type,
    mapping.ref_value,
    `"${mapping.snippet}"`,
    mapping.top_dest_page.toString(),
    mapping.top_confidence.toString(),
    mapping.top_method,
    mapping.dest_candidates[1]?.dest_page.toString() || '',
    mapping.dest_candidates[1]?.confidence.toString() || '',
    mapping.dest_candidates[2]?.dest_page.toString() || '',
    mapping.dest_candidates[2]?.confidence.toString() || ''
  ]);
  
  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

/**
 * Export candidate hyperlink map as JSON
 */
export function exportToJson(mappings: HyperlinkMapping[]): string {
  return JSON.stringify({
    generated_at: new Date().toISOString(),
    total_references: mappings.length,
    case: 'Ferrante',
    mappings
  }, null, 2);
}