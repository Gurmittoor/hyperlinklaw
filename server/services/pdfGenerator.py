#!/usr/bin/env python3
"""
PDF Generation Service for Hyperlinked Legal Documents
Implements professional hyperlinked index cover + original PDF combination
Based on hyperlinklaw.com specification
"""

import fitz  # PyMuPDF
import json
import sys
import tempfile
import os
import re
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path

class PDFGenerationError(Exception):
    """Custom exception for PDF generation errors"""
    pass

class HyperlinkedPDFGenerator:
    """
    Generates professional hyperlinked PDFs with index cover pages.
    
    Creates a combined PDF with:
    1. Clean index cover pages with clickable hyperlinks
    2. Original PDF content preserved exactly
    3. "BACK TO INDEX" links on tab pages
    """
    
    def __init__(self, 
                 font_size: int = 11,
                 line_height: int = 16,
                 max_lines_per_page: int = 20,
                 index_title: str = "Hyperlink Index"):
        self.font_size = font_size
        self.line_height = line_height
        self.max_lines_per_page = max_lines_per_page
        self.index_title = index_title
        self.left_margin = 72  # 1 inch
        self.right_margin = 540  # ~7.5 inches
        self.top_margin = 80
        
    def generate_hyperlinked_pdf(self, 
                                original_pdf_path: str,
                                tab_items: List[Dict[str, Any]],
                                output_path: str,
                                back_link_scope: str = "tab-first-page") -> Dict[str, Any]:
        """
        Generate a hyperlinked PDF with index cover and original content.
        
        Args:
            original_pdf_path: Path to the original PDF file
            tab_items: List of tab items with tab_no, title, date, target_page
            output_path: Where to save the generated PDF
            back_link_scope: "tab-first-page" or "all-body-pages"
            
        Returns:
            Dict with generation results and metadata
        """
        try:
            # Load original PDF
            original_doc = fitz.open(original_pdf_path)
            print(f"📄 Loaded original PDF: {original_doc.page_count} pages")
            
            # Validate and prepare tab items
            validated_tabs = self._validate_tab_items(tab_items, original_doc.page_count)
            print(f"✅ Validated {len(validated_tabs)} tab items")
            
            # Create index cover document
            index_doc = self._create_index_cover(validated_tabs)
            index_page_count = index_doc.page_count
            print(f"📋 Generated index cover: {index_page_count} pages")
            
            # Create combined document
            combined_doc = fitz.open()
            combined_doc.insert_pdf(index_doc)
            combined_doc.insert_pdf(original_doc)
            
            # Calculate final page numbers and add hyperlinks
            self._add_index_hyperlinks(combined_doc, validated_tabs, index_page_count)
            print(f"🔗 Added index hyperlinks")
            
            # Add "BACK TO INDEX" links
            self._add_back_to_index_links(combined_doc, validated_tabs, index_page_count, back_link_scope)
            print(f"<-- Added BACK TO INDEX links")
            
            # Save the combined PDF
            combined_doc.save(output_path)
            combined_doc.close()
            index_doc.close()
            original_doc.close()
            
            # Generate metadata
            metadata = {
                "success": True,
                "index_pages": index_page_count,
                "total_pages": index_page_count + original_doc.page_count,
                "tab_count": len(validated_tabs),
                "back_link_scope": back_link_scope,
                "output_file": output_path,
                "tabs": [
                    {
                        "tab_no": tab["tab_no"],
                        "title": tab["title"],
                        "final_target_page": tab["final_target_page"]
                    }
                    for tab in validated_tabs
                ]
            }
            
            print(f"✅ Generated hyperlinked PDF: {output_path}")
            return metadata
            
        except Exception as e:
            error_msg = f"PDF generation failed: {str(e)}"
            print(f"❌ {error_msg}")
            return {
                "success": False,
                "error": error_msg,
                "tab_count": len(tab_items) if tab_items else 0
            }
    
    def _validate_tab_items(self, tab_items: List[Dict], max_pages: int) -> List[Dict]:
        """Validate and normalize tab item data"""
        validated = []
        
        for i, item in enumerate(tab_items):
            try:
                tab_no = item.get("tabNumber") or item.get("tab_no") or str(i + 1)
                title = item.get("title") or item.get("label") or f"Tab {tab_no}"
                date_field = item.get("dateField") or item.get("date") or ""
                target_page = item.get("targetPage") or item.get("target_page")
                
                if not target_page or target_page < 1 or target_page > max_pages:
                    print(f"⚠️ Tab {tab_no}: Invalid target page {target_page}, skipping")
                    continue
                
                validated.append({
                    "tab_no": tab_no,
                    "title": title,
                    "date": date_field,
                    "target_page": target_page,
                    "final_target_page": None  # Will be calculated later
                })
                
            except Exception as e:
                print(f"⚠️ Error validating tab item {i}: {e}")
                continue
        
        return validated
    
    def _create_index_cover(self, tab_items: List[Dict]) -> fitz.Document:
        """Create the index cover pages with formatted tab listings"""
        index_doc = fitz.open()
        page = index_doc.new_page()
        
        # Title
        title_rect = fitz.Rect(self.left_margin, 50, self.right_margin, 70)
        page.insert_text((self.left_margin, 60), self.index_title, 
                        fontsize=16, fontname="helv", color=(0, 0, 0))
        
        y_position = self.top_margin
        current_page = page
        
        for tab in tab_items:
            # Format tab line: "1. March 15, 2023 — Affidavit - John Doe (p.45)"
            tab_line = self._format_tab_line(tab)
            
            # Check if we need a new page
            if y_position > 720:  # Near bottom of page
                current_page = index_doc.new_page()
                # Add continuation title
                current_page.insert_text((self.left_margin, 60), f"{self.index_title} (cont.)", 
                                       fontsize=14, fontname="helv", color=(0, 0, 0))
                y_position = self.top_margin
            
            # Insert the tab line (will be made clickable later)
            tab["line_rect"] = fitz.Rect(self.left_margin, y_position - 12, 
                                       self.right_margin, y_position + 4)
            tab["page_num"] = current_page.number
            
            # Split tab number and rest for bold formatting
            if tab_line.startswith(f"{tab['tab_no']}."):
                tab_num_part = f"{tab['tab_no']}."
                rest_part = tab_line[len(tab_num_part):]
                
                # Bold blue tab number
                current_page.insert_text((self.left_margin, y_position), tab_num_part, 
                                       fontsize=self.font_size, fontname="helv", 
                                       color=(0, 0, 1), render_mode=2)  # Bold
                
                # Calculate width to position rest of text
                tab_num_width = fitz.get_text_length(tab_num_part + " ", 
                                                   fontsize=self.font_size, fontname="helv")
                
                # Regular blue text for rest
                current_page.insert_text((self.left_margin + tab_num_width, y_position), rest_part, 
                                       fontsize=self.font_size, fontname="helv", color=(0, 0, 1))
            else:
                # Fallback: entire line in blue
                current_page.insert_text((self.left_margin, y_position), tab_line, 
                                       fontsize=self.font_size, fontname="helv", color=(0, 0, 1))
            
            y_position += self.line_height + 4  # Add some spacing
        
        return index_doc
    
    def _format_tab_line(self, tab: Dict) -> str:
        """Format a single tab line for the index"""
        parts = [f"{tab['tab_no']}."]
        
        if tab.get("date"):
            parts.append(tab["date"])
        
        if tab.get("title"):
            separator = " — " if tab.get("date") else " "
            parts.append(separator + tab["title"])
        
        # Add page reference (will be updated with final page number)
        parts.append(f" (p.{tab['target_page']})")
        
        return "".join(parts)
    
    def _add_index_hyperlinks(self, combined_doc: fitz.Document, 
                            tab_items: List[Dict], index_page_count: int):
        """Add clickable hyperlinks from index entries to target pages"""
        for tab in tab_items:
            if "line_rect" not in tab or "page_num" not in tab:
                continue
            
            # Calculate final target page in combined document
            final_target = index_page_count + tab["target_page"] - 1
            tab["final_target_page"] = final_target + 1  # 1-indexed for display
            
            # Add hyperlink on the index page
            index_page = combined_doc[tab["page_num"]]
            link = {
                "kind": fitz.LINK_GOTO,
                "page": final_target,
                "from": tab["line_rect"]
            }
            index_page.insert_link(link)
    
    def _add_back_to_index_links(self, combined_doc: fitz.Document, 
                               tab_items: List[Dict], index_page_count: int,
                               back_link_scope: str):
        """Add 'BACK TO INDEX' links on target pages"""
        pages_to_link = set()
        
        if back_link_scope == "all-body-pages":
            # Add to all body pages
            for i in range(index_page_count, combined_doc.page_count):
                pages_to_link.add(i)
        else:  # "tab-first-page"
            # Add only to first page of each tab
            for tab in tab_items:
                if tab.get("final_target_page"):
                    target_page_index = index_page_count + tab["target_page"] - 1
                    pages_to_link.add(target_page_index)
        
        # Add the links
        for page_index in pages_to_link:
            if page_index < combined_doc.page_count:
                page = combined_doc[page_index]
                
                # Add "BACK TO INDEX" text
                page.insert_text((72, 40), "BACK TO INDEX", 
                                fontsize=10, fontname="helv", color=(0, 0, 1))
                
                # Add clickable link rectangle
                link_rect = fitz.Rect(70, 30, 200, 50)
                link = {
                    "kind": fitz.LINK_GOTO,
                    "page": 0,  # First page (index cover)
                    "from": link_rect
                }
                page.insert_link(link)

def main():
    """Command line interface for PDF generation"""
    if len(sys.argv) != 4:
        print("Usage: python pdfGenerator.py <original_pdf> <tab_items_json> <output_pdf>")
        sys.exit(1)
    
    original_pdf_path = sys.argv[1]
    tab_items_json = sys.argv[2]
    output_pdf_path = sys.argv[3]
    
    try:
        # Load tab items
        with open(tab_items_json, 'r') as f:
            tab_items = json.load(f)
        
        # Generate PDF
        generator = HyperlinkedPDFGenerator()
        result = generator.generate_hyperlinked_pdf(
            original_pdf_path=original_pdf_path,
            tab_items=tab_items,
            output_path=output_pdf_path
        )
        
        # Output result as JSON
        print(json.dumps(result, indent=2))
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(error_result, indent=2))
        sys.exit(1)

if __name__ == "__main__":
    main()