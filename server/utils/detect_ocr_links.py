#!/usr/bin/env python3
"""
OCR-enhanced hyperlink detection script for legal documents.
Detects references like "Exhibit 1", "Tab No. 12", etc. with OCR fallback for image pages.
"""

import sys
import json
import re
import os
from typing import List, Dict, Any
import fitz  # PyMuPDF

# Import our OCR utilities
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from ocr import page_has_extractable_text, ocr_phrase_rects, ocr_full_page_text, is_tesseract_available

class OcrHyperlinkDetector:
    def __init__(self):
        self.patterns = {
            'exhibit': re.compile(r'\b(?:Exhibit|Ex\.?|EX)\s*([A-Z]?\d{1,3}[A-Z]?)\b', re.IGNORECASE),
            'tab': re.compile(r'\b(?:Tab|Tab\s*No\.?)\s*(\d{1,3})\b', re.IGNORECASE),
            'schedule': re.compile(r'\b(?:Schedule|Sch\.?)\s*([A-Z]?\d{1,3}[A-Z]?)\b', re.IGNORECASE),
            'affidavit': re.compile(r'\b(?:Affidavit|Aff\.?)\s*(?:of|from)?\s*([A-Za-z\s]{2,20})\b', re.IGNORECASE),
            'refusal': re.compile(r'\b(?:Refusal|Ref\.?)\s*(?:to|of)?\s*([A-Za-z\s]{2,20})\b', re.IGNORECASE),
            'under_advisement': re.compile(r'\b(?:Under\s*Advisement|U/A)\s*(\d{1,3})\b', re.IGNORECASE),
            'undertaking': re.compile(r'\b(?:Undertaking|U/T)\s*(\d{1,3})\b', re.IGNORECASE)
        }
        
        self.ocr_available = is_tesseract_available()
        if not self.ocr_available:
            print("Warning: Tesseract not available, OCR fallback disabled", file=sys.stderr)

    def find_text_rects(self, page: fitz.Page, needle: str) -> List[List[float]]:
        """Find rectangles for text using standard PyMuPDF search first, OCR as fallback."""
        rects = []
        
        # Try standard text search first
        try:
            text_instances = page.search_for(needle)
            for rect in text_instances:
                rects.append([rect.x0, rect.y0, rect.x1, rect.y1])
        except:
            pass
            
        # If no results and page appears to be image-only, try OCR
        if not rects and self.ocr_available and not page_has_extractable_text(page):
            try:
                ocr_rects = ocr_phrase_rects(page, needle)
                rects.extend(ocr_rects)
            except Exception as e:
                print(f"OCR search failed for '{needle}': {e}", file=sys.stderr)
                
        return rects

    def get_page_text(self, page: fitz.Page) -> str:
        """Get page text using standard extraction or OCR fallback."""
        text = ""
        
        # Try standard text extraction
        try:
            text = page.get_text()
        except:
            pass
            
        # If no extractable text and OCR is available, use OCR
        if not text.strip() and self.ocr_available:
            try:
                text = ocr_full_page_text(page)
                if text:
                    print(f"Used OCR for page {page.number + 1}", file=sys.stderr)
            except Exception as e:
                print(f"OCR text extraction failed for page {page.number + 1}: {e}", file=sys.stderr)
                
        return text

    def detect_references(self, pdf_path: str) -> List[Dict[str, Any]]:
        """Detect hyperlink references in PDF with OCR support."""
        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"PDF file not found: {pdf_path}")
            
        references = []
        
        try:
            doc = fitz.open(pdf_path)
            
            for page_num in range(len(doc)):
                page = doc[page_num]
                page_text = self.get_page_text(page)
                
                # Find references using each pattern
                for ref_type, pattern in self.patterns.items():
                    for match in pattern.finditer(page_text):
                        ref_value = match.group(1).strip() if match.groups() else match.group(0).strip()
                        
                        # Create search needle
                        if ref_type == 'exhibit':
                            needle = f"Exhibit {ref_value}"
                        elif ref_type == 'tab':
                            needle = f"Tab {ref_value}"
                        elif ref_type == 'schedule':
                            needle = f"Schedule {ref_value}"
                        else:
                            needle = match.group(0).strip()
                        
                        # Find bounding rectangles
                        rects = self.find_text_rects(page, needle)
                        
                        if rects:  # Only include if we found the text location
                            # Get context snippet
                            start = max(0, match.start() - 30)
                            end = min(len(page_text), match.end() + 30)
                            snippet = page_text[start:end].replace('\n', ' ').strip()
                            
                            # Calculate target page (simple heuristic for demo)
                            target_page = min(len(doc), page_num + 1 + (int(ref_value) if ref_value.isdigit() else 1))
                            
                            reference = {
                                'srcText': needle,
                                'srcPage': page_num + 1,
                                'targetPage': target_page,
                                'confidence': 0.85,  # High confidence for pattern matches
                                'bbox': rects[0] if rects else [0, 0, 100, 20],  # Use first rect
                                'snippet': snippet,
                                'ref_type': ref_type,
                                'ref_value': ref_value
                            }
                            
                            references.append(reference)
                            
            doc.close()
            
        except Exception as e:
            raise Exception(f"PDF processing failed: {e}")
            
        return references

def main():
    if len(sys.argv) != 2:
        print("Usage: python detect_ocr_links.py <pdf_path>", file=sys.stderr)
        sys.exit(1)
        
    pdf_path = sys.argv[1]
    
    try:
        detector = OcrHyperlinkDetector()
        references = detector.detect_references(pdf_path)
        
        # Output results as JSON
        print(json.dumps(references, indent=2))
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()