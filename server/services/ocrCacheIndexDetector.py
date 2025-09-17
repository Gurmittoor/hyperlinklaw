#!/usr/bin/env python3
"""
OCR-FIRST INDEX DETECTOR (Per Specification)
This system reads ONLY from stored OCR cache - never processes OCR on-demand.
Implements the HyperlinkLaw OCR-First specification requirement.
"""
import sys, re, json, os, time
import psycopg2
from typing import List, Dict, Any

# Database connection using environment variables
def get_db_connection():
    """Get database connection from environment"""
    try:
        return psycopg2.connect(os.environ['DATABASE_URL'])
    except Exception as e:
        print(json.dumps({
            "items": [], 
            "status": "error", 
            "error": f"Database connection failed: {e}",
            "ocr_used": True
        }))
        sys.exit(1)

# Enhanced configuration
SEARCH_MAX = int(os.getenv("INDEX_SEARCH_MAX_PAGES", "15"))  # Search first 15 pages for index
CONT_MAX = int(os.getenv("INDEX_CONTINUATION_MAX_PAGES", "5"))  # Index may span multiple pages
INDEX_HINTS = tuple(h.strip().upper() for h in os.getenv(
    "INDEX_HINTS", "INDEX,TABLE OF CONTENTS,TAB NO,TAB NUMBER,INDEX OF TABS"
).split(","))
ITEM_RE = re.compile(r"^\s*(\d+)[\).\s-]+\s*(.+?)\s*$")

def get_ocr_text_for_document(document_id: str) -> Dict[int, str]:
    """
    Retrieve all stored OCR text for a document from ocr_cache table
    Returns: {page_number: extracted_text}
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT page_number, extracted_text 
                FROM ocr_cache 
                WHERE document_id = %s 
                ORDER BY page_number
            """, (document_id,))
            
            results = {}
            for row in cur.fetchall():
                page_number, extracted_text = row
                results[page_number] = extracted_text or ""
            
            return results
    finally:
        conn.close()

def looks_like_index(s: str) -> bool:
    """Check if text looks like an index page"""
    u = s.upper()
    return any(h in u for h in INDEX_HINTS)

def extract_items(text: str) -> List[Dict[str, Any]]:
    """Extract numbered items from index text"""
    items = []
    in_index_section = False
    
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
            
        # Check if we're entering an index section
        if looks_like_index(line):
            in_index_section = True
            continue
            
        # Skip obvious non-index lines
        if any(skip in line.upper() for skip in ['PAGE', 'COURT FILE', 'BETWEEN:', 'AND:']):
            continue
            
        # Try to match numbered items
        match = ITEM_RE.match(line)
        if match and in_index_section:
            item_num = int(match.group(1))
            item_text = match.group(2).strip()
            
            # Filter out very short or invalid items
            if len(item_text) > 3 and not item_text.isdigit():
                items.append({
                    "number": item_num,
                    "text": item_text,
                    "line": line
                })
    
    return items

def detect_index_items(document_id: str) -> Dict[str, Any]:
    """
    Main detection function using stored OCR cache
    Per specification: Uses ONLY stored OCR text, never on-demand OCR
    """
    try:
        start_time = time.time()
        
        # Get all stored OCR text for this document
        ocr_pages = get_ocr_text_for_document(document_id)
        
        if not ocr_pages:
            return {
                "items": [],
                "status": "error",
                "error": "No stored OCR text found. Document must be processed with OCR first.",
                "ocr_used": True,
                "processing_time_ms": int((time.time() - start_time) * 1000)
            }
        
        # Search for index pages in the first SEARCH_MAX pages
        index_pages = []
        for page_num in sorted(ocr_pages.keys()):
            if page_num > SEARCH_MAX:
                break
                
            text = ocr_pages[page_num]
            if looks_like_index(text):
                index_pages.append((page_num, text))
        
        if not index_pages:
            return {
                "items": [],
                "status": "no_index",
                "error": "No index pages detected in first 15 pages",
                "ocr_used": True,
                "processing_time_ms": int((time.time() - start_time) * 1000)
            }
        
        # Extract items from all detected index pages
        all_items = []
        for page_num, text in index_pages:
            items = extract_items(text)
            for item in items:
                item["source_page"] = page_num
            all_items.extend(items)
        
        # Sort by item number
        all_items.sort(key=lambda x: x["number"])
        
        # Remove duplicates (keep first occurrence)
        seen_numbers = set()
        unique_items = []
        for item in all_items:
            if item["number"] not in seen_numbers:
                unique_items.append(item)
                seen_numbers.add(item["number"])
        
        return {
            "items": unique_items,
            "status": "ok" if unique_items else "no_items",
            "total_items": len(unique_items),
            "index_pages": [p for p, _ in index_pages],
            "ocr_used": True,  # Always true per specification
            "processing_time_ms": int((time.time() - start_time) * 1000)
        }
        
    except Exception as e:
        return {
            "items": [],
            "status": "error",
            "error": str(e),
            "ocr_used": True,
            "processing_time_ms": int((time.time() - start_time) * 1000)
        }

def main():
    """Main CLI interface"""
    if len(sys.argv) != 2:
        print("Usage: python ocrCacheIndexDetector.py <document_id>")
        sys.exit(1)
    
    document_id = sys.argv[1]
    result = detect_index_items(document_id)
    
    # Output JSON result
    print(json.dumps(result, indent=2))
    
    # Return appropriate exit code
    return 0 if result["status"] == "ok" else 1

if __name__ == "__main__":
    sys.exit(main())