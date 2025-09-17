"""
Add internal navigation links to PDF for tab highlighting
Creates clickable links within the PDF that support back button navigation
"""
import fitz  # PyMuPDF
import sys
import json
import re
from typing import List, Dict, Tuple

class InternalLinkAdder:
    def __init__(self):
        pass
    
    def add_internal_links(self, pdf_path: str, output_path: str, tabs_data: List[Dict]) -> str:
        """Add internal navigation links to the PDF"""
        print(f"🔗 Adding internal navigation links to PDF: {pdf_path}")
        
        # Open the PDF document
        doc = fitz.open(pdf_path)
        
        # Process each page to find tab references and add links
        self._add_tab_reference_links(doc, tabs_data)
        
        # Add index page navigation links (if exists)
        self._add_index_navigation_links(doc, tabs_data)
        
        # Save the modified PDF
        doc.save(output_path)
        doc.close()
        
        print(f"✅ Internal navigation links added: {output_path}")
        return output_path
    
    def _add_tab_reference_links(self, doc: fitz.Document, tabs_data: List[Dict]):
        """Add links for tab references found in the document text"""
        print(f"🔍 Scanning document for tab references...")
        
        # Create a mapping of tab numbers to their target pages
        tab_to_page = {}
        for tab in tabs_data:
            tab_no = tab.get('tabNo') or tab.get('tab_number', 0)
            target_page = tab.get('targetPage') or tab.get('pageNumber', 0)
            if tab_no and target_page:
                tab_to_page[tab_no] = target_page - 1  # Convert to 0-based indexing
        
        print(f"📋 Tab mapping: {tab_to_page}")
        
        # Scan each page for tab references
        for page_num in range(len(doc)):
            page = doc[page_num]
            page_text = page.get_text().lower()
            
            # Find tab references like "Tab 1", "Tab 2", etc.
            tab_pattern = r'\btab\s+(\d+)\b'
            matches = re.finditer(tab_pattern, page_text, re.IGNORECASE)
            
            for match in matches:
                tab_number = int(match.group(1))
                if tab_number in tab_to_page:
                    target_page = tab_to_page[tab_number]
                    
                    # Find the text instances on the page
                    text_instances = page.search_for(match.group(0))
                    
                    for rect in text_instances:
                        # Create internal navigation link
                        link_dict = {
                            "kind": fitz.LINK_GOTO,
                            "from": rect,
                            "page": target_page,
                            "to": fitz.Point(0, 0),  # Top of target page
                            "zoom": 0  # Default zoom
                        }
                        
                        page.insert_link(link_dict)
                        print(f"   🔗 Added link: Page {page_num + 1} Tab {tab_number} → Page {target_page + 1}")
    
    def _add_index_navigation_links(self, doc: fitz.Document, tabs_data: List[Dict]):
        """Add navigation links on the index page (typically page 1)"""
        print(f"📑 Adding index page navigation links...")
        
        if len(doc) < 1:
            return
        
        # Check if first page is an index page
        first_page = doc[0]
        first_page_text = first_page.get_text().lower()
        
        # If this looks like an index page, add navigation links
        if "index" in first_page_text or "clickable" in first_page_text:
            print(f"   📋 Found index page, adding navigation links...")
            
            for tab in tabs_data:
                tab_no = tab.get('tabNo') or tab.get('tab_number', 0)
                target_page = (tab.get('targetPage') or tab.get('pageNumber', 0)) - 1  # 0-based
                
                if tab_no and target_page >= 0:
                    # Look for tab number patterns on the index page
                    search_patterns = [
                        f"tab {tab_no}",
                        f"tab{tab_no}",
                        f"{tab_no}."
                    ]
                    
                    for pattern in search_patterns:
                        text_instances = first_page.search_for(pattern)
                        
                        for rect in text_instances:
                            # Create internal navigation link
                            link_dict = {
                                "kind": fitz.LINK_GOTO,
                                "from": rect,
                                "page": target_page,
                                "to": fitz.Point(0, 0),
                                "zoom": 0
                            }
                            
                            first_page.insert_link(link_dict)
                            print(f"   🔗 Index link: Tab {tab_no} → Page {target_page + 1}")
                            break  # Only add one link per tab
    
    def _find_text_rectangles(self, page: fitz.Page, search_text: str) -> List[fitz.Rect]:
        """Find all rectangles containing the specified text"""
        return page.search_for(search_text)

def main():
    if len(sys.argv) != 4:
        print("Usage: python addInternalLinks.py <input_pdf> <output_pdf> <tabs_json>")
        sys.exit(1)
    
    input_pdf = sys.argv[1]
    output_pdf = sys.argv[2]
    tabs_json = sys.argv[3]
    
    # Parse tabs data
    try:
        tabs_data = json.loads(tabs_json)
    except json.JSONDecodeError as e:
        print(f"❌ Error parsing tabs JSON: {e}")
        sys.exit(1)
    
    # Add internal links
    adder = InternalLinkAdder()
    try:
        result_path = adder.add_internal_links(input_pdf, output_pdf, tabs_data)
        print(f"✅ Success: {result_path}")
    except Exception as e:
        print(f"❌ Error adding internal links: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()