#!/usr/bin/env python3
"""
Dynamic Hyperlink Processor
Processes documents with any number of index items and creates corresponding hyperlinks
Works with the dynamic index detector to handle variable document types
"""

import argparse
import json
import fitz  # PyMuPDF
import re
import sys
import os
from typing import List, Dict, Tuple, Optional, Any
from pathlib import Path
from dynamic_index_detector import DynamicIndexDetector

class DynamicHyperlinkProcessor:
    """Processes hyperlinks dynamically based on detected index items"""
    
    def __init__(self):
        self.detector = DynamicIndexDetector()
        
        # Reference patterns for finding links in document text
        self.reference_patterns = {
            'tab': [
                r'\bTab\s+(\d{1,3})\b',
                r'\bTAB\s+(\d{1,3})\b',
                r'\b(Tab\s+\d{1,3})\b'
            ],
            'exhibit': [
                r'\bExhibit\s+([A-Z0-9]{1,3})\b',
                r'\bEXHIBIT\s+([A-Z0-9]{1,3})\b',
                r'\b(Exhibit\s+[A-Z0-9]{1,3})\b'
            ],
            'schedule': [
                r'\bSchedule\s+([A-Z0-9]{1,3})\b',
                r'\bSCHEDULE\s+([A-Z0-9]{1,3})\b',
                r'\b(Schedule\s+[A-Z0-9]{1,3})\b'
            ],
            'document': [
                r'\bDocument\s+(\d{1,3})\b',
                r'\bDOCUMENT\s+(\d{1,3})\b',
                r'\b(Document\s+\d{1,3})\b'
            ],
            'page': [
                r'\bPage\s+(\d{1,4})\b',
                r'\bPAGE\s+(\d{1,4})\b',
                r'\bp\.\s*(\d{1,4})\b',
                r'\bpp\.\s*(\d{1,4})\b'
            ]
        }
    
    def process_document(self, brief_path: str, trial_path: str = None, 
                        index_pages: List[int] = None, output_dir: str = "out/dynamic",
                        index_only: bool = False, review_json: bool = False) -> Dict[str, Any]:
        """Process a document dynamically based on its index"""
        
        # Create output directory
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        
        # Step 1: Detect index items in the brief
        print(f"🔍 Detecting index items in: {brief_path}")
        index_result = self.detector.extract_index_items(brief_path, index_pages)
        
        if index_result['total_items'] == 0:
            return {
                'ok': False,
                'error': 'No index items detected in document',
                'total_items': 0
            }
        
        print(f"📋 Found {index_result['total_items']} index items")
        for item_type, count in index_result['item_types'].items():
            print(f"   - {item_type}: {count}")
        
        # Step 2: Find references to these items throughout the document
        links_found = self._find_references(brief_path, index_result['items'], trial_path)
        
        # Step 3: Create hyperlinked PDF if not index_only
        if not index_only and trial_path:
            linked_pdf_path = self._create_hyperlinked_pdf(
                brief_path, trial_path, links_found, output_dir
            )
        else:
            linked_pdf_path = None
        
        # Step 4: Generate results
        result = {
            'ok': True,
            'total_items': index_result['total_items'],
            'total_links': len(links_found),
            'index_result': index_result,
            'links_found': links_found,
            'linked_pdf_path': linked_pdf_path,
            'output_dir': output_dir
        }
        
        # Step 5: Save review JSON if requested
        if review_json:
            review_data = {
                'total': len(links_found),
                'links': [
                    {
                        'text': link['text'],
                        'source_page': link['source_page'],
                        'target_page': link.get('target_page', 'Not found'),
                        'coordinates': link.get('coordinates', []),
                        'type': link['type']
                    }
                    for link in links_found
                ],
                'index_items': index_result['items'],
                'metadata': {
                    'brief_path': brief_path,
                    'trial_path': trial_path,
                    'index_pages': index_result['index_pages'],
                    'processing_date': str(Path().absolute())
                }
            }
            
            review_path = Path(output_dir) / "review.json"
            with open(review_path, 'w') as f:
                json.dump(review_data, f, indent=2)
            
            result['review_json_path'] = str(review_path)
        
        return result
    
    def _find_references(self, brief_path: str, index_items: List[Dict], 
                        trial_path: str = None) -> List[Dict]:
        """Find all references to index items in the document"""
        doc = fitz.open(brief_path)
        links_found = []
        
        # Create lookup map for index items
        item_lookup = {}
        for item in index_items:
            key = (item['type'], item['value'].upper())
            item_lookup[key] = item
        
        # Search through all pages of the brief
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            text = page.get_text()
            text_dict = page.get_text("dict")
            
            # Search for each type of reference
            for ref_type, patterns in self.reference_patterns.items():
                for pattern in patterns:
                    for match in re.finditer(pattern, text, re.IGNORECASE):
                        ref_text = match.group(0)
                        ref_value = match.group(1) if match.groups() else ref_text
                        
                        # Check if this reference matches an index item
                        lookup_key = (ref_type, ref_value.upper())
                        if lookup_key in item_lookup:
                            # Find the coordinates of this text
                            coords = self._find_text_coordinates(text_dict, ref_text)
                            
                            if coords:
                                link_info = {
                                    'text': ref_text,
                                    'value': ref_value,
                                    'type': ref_type,
                                    'source_page': page_num + 1,  # 1-indexed
                                    'coordinates': coords,
                                    'index_item': item_lookup[lookup_key]
                                }
                                
                                # Try to find target page in trial document
                                if trial_path:
                                    target_page = self._find_target_page(trial_path, ref_text, ref_type)
                                    if target_page:
                                        link_info['target_page'] = target_page
                                
                                links_found.append(link_info)
        
        doc.close()
        return links_found
    
    def _find_text_coordinates(self, text_dict: Dict, search_text: str) -> Optional[List[float]]:
        """Find coordinates of text in the page"""
        search_lower = search_text.lower()
        
        for block in text_dict.get("blocks", []):
            if "lines" not in block:
                continue
            
            for line in block["lines"]:
                line_text = ""
                spans_with_coords = []
                
                for span in line.get("spans", []):
                    span_text = span.get("text", "")
                    line_text += span_text
                    spans_with_coords.append({
                        'text': span_text,
                        'bbox': span.get("bbox", [])
                    })
                
                if search_lower in line_text.lower():
                    # Find the position within the line
                    start_pos = line_text.lower().find(search_lower)
                    if start_pos >= 0:
                        # Calculate bounding box
                        char_count = 0
                        for span in spans_with_coords:
                            span_len = len(span['text'])
                            if char_count <= start_pos < char_count + span_len:
                                return span['bbox']
                            char_count += span_len
        
        return None
    
    def _find_target_page(self, trial_path: str, ref_text: str, ref_type: str) -> Optional[int]:
        """Find the target page for a reference in the trial document"""
        trial_doc = fitz.open(trial_path)
        
        # Search patterns for finding the target
        search_patterns = [
            ref_text,  # Exact match
            ref_text.upper(),  # Upper case
            ref_text.lower(),  # Lower case
        ]
        
        # Add type-specific patterns
        if ref_type == 'tab':
            value = re.search(r'\d+', ref_text)
            if value:
                search_patterns.extend([
                    f"Tab {value.group()}",
                    f"TAB {value.group()}",
                    f"Tab{value.group()}",
                    value.group()
                ])
        
        for page_num in range(len(trial_doc)):
            page = trial_doc.load_page(page_num)
            text = page.get_text()
            
            for pattern in search_patterns:
                if pattern in text:
                    trial_doc.close()
                    return page_num + 1  # 1-indexed
        
        trial_doc.close()
        return None
    
    def _create_hyperlinked_pdf(self, brief_path: str, trial_path: str, 
                               links: List[Dict], output_dir: str) -> str:
        """Create a hyperlinked PDF with the brief and trial documents"""
        # Open both documents
        brief_doc = fitz.open(brief_path)
        trial_doc = fitz.open(trial_path) if trial_path else None
        
        # Create new document
        output_doc = fitz.open()
        
        # Add all pages from brief
        brief_page_count = len(brief_doc)
        output_doc.insert_pdf(brief_doc)
        
        # Add all pages from trial if available
        trial_page_offset = brief_page_count
        if trial_doc:
            output_doc.insert_pdf(trial_doc)
        
        # Add hyperlinks
        for link in links:
            source_page_num = link['source_page'] - 1  # Convert to 0-indexed
            if source_page_num >= len(output_doc):
                continue
            
            page = output_doc[source_page_num]
            coords = link.get('coordinates')
            target_page = link.get('target_page')
            
            if coords and target_page:
                # Adjust target page for combined document
                adjusted_target = (target_page - 1) + trial_page_offset
                
                # Create link annotation
                link_rect = fitz.Rect(coords)
                link_annot = {
                    "kind": fitz.LINK_GOTO,
                    "page": adjusted_target
                }
                
                page.insert_link(link_rect, link_annot)
        
        # Save the output document
        output_path = Path(output_dir) / "Master.Dynamic.linked.pdf"
        output_doc.save(str(output_path))
        
        # Clean up
        brief_doc.close()
        if trial_doc:
            trial_doc.close()
        output_doc.close()
        
        return str(output_path)

def main():
    parser = argparse.ArgumentParser(description='Dynamic Hyperlink Processor for Legal Documents')
    parser.add_argument('--brief', required=True, help='Path to brief PDF document')
    parser.add_argument('--trial', help='Path to trial PDF document')
    parser.add_argument('--index_pages', help='Comma-separated list of index pages (1-indexed)')
    parser.add_argument('--out_dir', default='out/dynamic', help='Output directory')
    parser.add_argument('--index_only', action='store_true', help='Only process index, do not create hyperlinked PDF')
    parser.add_argument('--review_json', action='store_true', help='Generate review.json file')
    parser.add_argument('--verbose', action='store_true', help='Enable verbose output')
    
    args = parser.parse_args()
    
    # Validate inputs
    if not Path(args.brief).exists():
        print(f"Error: Brief document not found: {args.brief}")
        sys.exit(1)
    
    if args.trial and not Path(args.trial).exists():
        print(f"Error: Trial document not found: {args.trial}")
        sys.exit(1)
    
    # Parse index pages if provided
    index_pages = None
    if args.index_pages:
        try:
            index_pages = [int(x.strip()) - 1 for x in args.index_pages.split(',')]  # Convert to 0-indexed
        except ValueError:
            print("Error: Invalid index pages format. Use comma-separated numbers.")
            sys.exit(1)
    
    # Process the document
    processor = DynamicHyperlinkProcessor()
    
    try:
        result = processor.process_document(
            brief_path=args.brief,
            trial_path=args.trial,
            index_pages=index_pages,
            output_dir=args.out_dir,
            index_only=args.index_only,
            review_json=args.review_json
        )
        
        if result['ok']:
            print(f"✅ Processing complete!")
            print(f"   📊 Index items detected: {result['total_items']}")
            print(f"   🔗 Hyperlinks created: {result['total_links']}")
            print(f"   📁 Output directory: {result['output_dir']}")
            
            if result.get('linked_pdf_path'):
                print(f"   📄 Linked PDF: {result['linked_pdf_path']}")
            
            if result.get('review_json_path'):
                print(f"   📋 Review JSON: {result['review_json_path']}")
            
            if args.verbose:
                print("\n🔍 Index items found:")
                for item in result['index_result']['items']:
                    print(f"   - {item['type']}: {item['text']} (page {item['page']})")
                
                print("\n🔗 Hyperlinks created:")
                for link in result['links_found']:
                    target_info = f" → page {link['target_page']}" if link.get('target_page') else " → target not found"
                    print(f"   - {link['text']} (page {link['source_page']}){target_info}")
        
        else:
            print(f"❌ Processing failed: {result.get('error', 'Unknown error')}")
            sys.exit(1)
            
    except Exception as e:
        print(f"❌ Error processing documents: {str(e)}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()