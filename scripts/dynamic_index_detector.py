#!/usr/bin/env python3
"""
Dynamic Index Detection System
Automatically detects and counts index items in any legal document
Supports any document type with varying numbers of hyperlinks
"""

import argparse
import json
import fitz  # PyMuPDF
import re
import sys
from typing import List, Dict, Tuple, Optional
from pathlib import Path

class DynamicIndexDetector:
    """Detects index items in legal documents dynamically"""
    
    def __init__(self):
        # Common patterns for legal document indices
        self.index_patterns = [
            # Tab patterns
            r'Tab\s+(\d{1,3})',
            r'TAB\s+(\d{1,3})',
            
            # Exhibit patterns
            r'Exhibit\s+([A-Z0-9]{1,3})',
            r'EXHIBIT\s+([A-Z0-9]{1,3})',
            
            # Schedule patterns
            r'Schedule\s+([A-Z0-9]{1,3})',
            r'SCHEDULE\s+([A-Z0-9]{1,3})',
            
            # Numbered items
            r'^\s*(\d{1,3})\.\s+',  # 1. Item
            r'^\s*\((\d{1,3})\)\s+',  # (1) Item
            
            # Letter items
            r'^\s*([A-Z])\.\s+',  # A. Item
            r'^\s*\(([A-Z])\)\s+',  # (A) Item
            
            # Roman numerals
            r'^\s*([IVX]{1,4})\.\s+',  # I. Item
            
            # Affidavit patterns
            r'Affidavit\s+of\s+([A-Za-z\s]+)',
            r'AFFIDAVIT\s+OF\s+([A-Za-z\s]+)',
            
            # Generic document patterns
            r'Document\s+(\d{1,3})',
            r'DOCUMENT\s+(\d{1,3})',
            
            # Page references
            r'Page\s+(\d{1,4})',
            r'PAGE\s+(\d{1,4})',
        ]
    
    def detect_index_pages(self, pdf_path: str) -> List[int]:
        """Detect which pages contain indices"""
        doc = fitz.open(pdf_path)
        index_pages = []
        
        # Common index page indicators
        index_indicators = [
            r'index',
            r'INDEX',
            r'Table\s+of\s+Contents',
            r'TABLE\s+OF\s+CONTENTS',
            r'Contents',
            r'CONTENTS',
            r'List\s+of\s+Documents',
            r'LIST\s+OF\s+DOCUMENTS',
            r'Summary',
            r'SUMMARY'
        ]
        
        for page_num in range(min(10, len(doc))):  # Check first 10 pages
            page = doc.load_page(page_num)
            text = page.get_text()
            
            # Check for index indicators
            for pattern in index_indicators:
                if re.search(pattern, text):
                    index_pages.append(page_num)
                    break
            
            # Also check if page has many numbered/lettered items
            item_count = 0
            for pattern in self.index_patterns[:8]:  # First 8 are item patterns
                matches = re.findall(pattern, text, re.MULTILINE)
                item_count += len(matches)
            
            if item_count >= 3:  # If we find 3+ items, likely an index page
                if page_num not in index_pages:
                    index_pages.append(page_num)
        
        doc.close()
        return sorted(index_pages)
    
    def extract_index_items(self, pdf_path: str, index_pages: List[int] = None) -> Dict:
        """Extract all index items from the document"""
        doc = fitz.open(pdf_path)
        
        if index_pages is None:
            index_pages = self.detect_index_pages(pdf_path)
        
        if not index_pages:
            # If no specific index pages found, scan first few pages
            index_pages = list(range(min(5, len(doc))))
        
        all_items = []
        item_types = {}
        
        for page_num in index_pages:
            if page_num >= len(doc):
                continue
                
            page = doc.load_page(page_num)
            text = page.get_text()
            
            for pattern in self.index_patterns:
                matches = re.finditer(pattern, text, re.MULTILINE | re.IGNORECASE)
                for match in matches:
                    item_text = match.group(0)
                    item_value = match.group(1) if match.groups() else item_text
                    
                    # Determine item type
                    item_type = self._classify_item_type(pattern, item_text)
                    
                    item_info = {
                        'text': item_text.strip(),
                        'value': item_value.strip(),
                        'type': item_type,
                        'page': page_num + 1,  # 1-indexed
                        'pattern': pattern
                    }
                    
                    all_items.append(item_info)
                    
                    if item_type not in item_types:
                        item_types[item_type] = 0
                    item_types[item_type] += 1
        
        # Remove duplicates based on value and type
        unique_items = []
        seen = set()
        for item in all_items:
            key = (item['value'], item['type'])
            if key not in seen:
                seen.add(key)
                unique_items.append(item)
        
        # Sort items by type and value
        unique_items.sort(key=lambda x: (x['type'], self._sort_key(x['value'])))
        
        doc.close()
        
        return {
            'total_items': len(unique_items),
            'items': unique_items,
            'item_types': item_types,
            'index_pages': [p + 1 for p in index_pages],  # Convert to 1-indexed
            'document_path': pdf_path
        }
    
    def _classify_item_type(self, pattern: str, item_text: str) -> str:
        """Classify the type of index item"""
        item_lower = item_text.lower()
        
        if 'tab' in item_lower:
            return 'tab'
        elif 'exhibit' in item_lower:
            return 'exhibit'
        elif 'schedule' in item_lower:
            return 'schedule'
        elif 'affidavit' in item_lower:
            return 'affidavit'
        elif 'document' in item_lower:
            return 'document'
        elif 'page' in item_lower:
            return 'page'
        elif re.search(r'^\s*\d+\.', pattern):
            return 'numbered'
        elif re.search(r'^\s*[A-Z]\.', pattern):
            return 'lettered'
        elif re.search(r'^\s*[IVX]+\.', pattern):
            return 'roman'
        else:
            return 'other'
    
    def _sort_key(self, value: str):
        """Generate sort key for proper ordering"""
        try:
            # Try numeric sort first
            return (0, int(value))
        except ValueError:
            # Roman numeral conversion
            roman_map = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10}
            if value in roman_map:
                return (1, roman_map[value])
            # Alphabetic sort
            return (2, value)

def main():
    parser = argparse.ArgumentParser(description='Dynamic Index Detection for Legal Documents')
    parser.add_argument('--document', required=True, help='Path to PDF document')
    parser.add_argument('--index_pages', help='Comma-separated list of index pages (1-indexed)')
    parser.add_argument('--output', help='Output JSON file path')
    parser.add_argument('--verbose', action='store_true', help='Enable verbose output')
    
    args = parser.parse_args()
    
    if not Path(args.document).exists():
        print(f"Error: Document not found: {args.document}")
        sys.exit(1)
    
    detector = DynamicIndexDetector()
    
    # Parse index pages if provided
    index_pages = None
    if args.index_pages:
        try:
            index_pages = [int(x.strip()) - 1 for x in args.index_pages.split(',')]  # Convert to 0-indexed
        except ValueError:
            print("Error: Invalid index pages format. Use comma-separated numbers.")
            sys.exit(1)
    
    # Extract index items
    try:
        result = detector.extract_index_items(args.document, index_pages)
        
        if args.verbose:
            print(f"Document: {result['document_path']}")
            print(f"Index pages detected: {result['index_pages']}")
            print(f"Total items found: {result['total_items']}")
            print("\nItem types:")
            for item_type, count in result['item_types'].items():
                print(f"  {item_type}: {count}")
            print("\nItems found:")
            for item in result['items']:
                print(f"  {item['type']}: {item['text']} (page {item['page']})")
        
        # Save to output file if specified
        if args.output:
            with open(args.output, 'w') as f:
                json.dump(result, f, indent=2)
            print(f"Results saved to: {args.output}")
        else:
            print(json.dumps(result, indent=2))
            
    except Exception as e:
        print(f"Error processing document: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()