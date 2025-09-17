#!/usr/bin/env python3
import os, sys, re, json, time
import fitz  # PyMuPDF
from PIL import Image
import pytesseract

# Configuration from environment
SEARCH_MAX = int(os.getenv("INDEX_SEARCH_MAX_PAGES", "30"))
CONT_MAX = int(os.getenv("INDEX_CONTINUATION_MAX_PAGES", "10"))
DPI = int(os.getenv("INDEX_OCR_DPI", "260"))
PSM = os.getenv("OCR_PSM", "6")
MIN_CONF = int(os.getenv("OCR_MIN_CONF", "60"))
HINTS = tuple(h.strip().upper() for h in os.getenv(
    "INDEX_HINTS", "INDEX,TABLE OF CONTENTS,TAB NO,TAB NUMBER,INDEX OF TABS"
).split(","))

# Regex for numbered index items (strict integer matching)
NUM_LINE = re.compile(r'^\s*(\d+)[\).\s-]+\s*(.+?)\s*$')

def ocr_page(page):
    """Extract text from a single PDF page using OCR"""
    pm = page.get_pixmap(dpi=DPI)
    im = Image.frombytes("RGB", [pm.width, pm.height], pm.samples)
    
    # Use simple OCR without confidence filtering for speed
    text = pytesseract.image_to_string(im, config=f'--psm {PSM}')
    return text

def looks_like_index(text):
    """Check if text contains index indicators"""
    upper_text = (text or "").upper()
    return any(hint in upper_text for hint in HINTS)

def extract_index_items(text):
    """Extract numbered items from index text"""
    items = []
    
    for raw_line in (text or "").splitlines():
        # Normalize dashes and whitespace
        line = raw_line.strip().replace("—", "-").replace("–", "-")
        
        # Match numbered lines
        match = NUM_LINE.match(line)
        if not match:
            continue
            
        no = int(match.group(1))
        label = match.group(2).strip()
        
        # Only accept labels with reasonable length
        if len(label) >= 3:
            items.append({"no": no, "label": label})
    
    # Deduplicate by number, keep first occurrence, sort by number
    seen = set()
    deduped = []
    
    for item in items:
        if item["no"] not in seen:
            seen.add(item["no"])
            deduped.append(item)
    
    deduped.sort(key=lambda x: x["no"])
    return deduped

def detect_index(pdf_path):
    """Main function to detect and extract index from PDF"""
    start_time = time.time()
    
    try:
        doc = fitz.open(pdf_path)
        first_index_page = None
        
        # Search for index in first SEARCH_MAX pages
        for page_num in range(min(SEARCH_MAX, len(doc))):
            page_text = ocr_page(doc[page_num])
            
            if looks_like_index(page_text):
                first_index_page = page_num
                break
        
        if first_index_page is None:
            return {
                "items": [],
                "index_page": None,
                "status": "no_index_found",
                "processing_time_ms": int((time.time() - start_time) * 1000),
                "ocr_used": True
            }
        
        # Collect items from index page and continuations
        all_items = []
        
        for page_num in range(first_index_page, min(first_index_page + CONT_MAX, len(doc))):
            page_text = ocr_page(doc[page_num])
            
            # Stop if page doesn't look like index continuation
            if page_num > first_index_page and not looks_like_index(page_text):
                break
                
            page_items = extract_index_items(page_text)
            all_items.extend(page_items)
        
        # Final cleanup - remove duplicate numbers, keep first occurrence
        seen = set()
        final_items = []
        for item in all_items:
            if item["no"] not in seen:
                seen.add(item["no"])
                final_items.append(item)
        
        # Sort by number
        final_items.sort(key=lambda x: x["no"])
        
        return {
            "items": final_items,
            "index_page": first_index_page + 1,  # 1-based page number
            "status": "success",
            "processing_time_ms": int((time.time() - start_time) * 1000),
            "ocr_used": True
        }
        
    except Exception as e:
        return {
            "items": [],
            "index_page": None,
            "status": "error",
            "error": str(e),
            "processing_time_ms": int((time.time() - start_time) * 1000),
            "ocr_used": True
        }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"items": [], "status": "no_file_provided", "ocr_used": True}))
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    result = detect_index(pdf_path)
    print(json.dumps(result, ensure_ascii=False))

if __name__ == "__main__":
    main()