#!/usr/bin/env python3
"""
PERMANENTLY HARDCODED ENHANCED OCR SYSTEM
This system ALWAYS uses OCR for legal document processing.
NO FALLBACKS TO TEXT EXTRACTION ARE PERMITTED.
"""
import sys, re, json, os, time
import fitz  # PyMuPDF

# MANDATORY OCR IMPORTS - System will fail if not available
try:
    import pytesseract
    from PIL import Image
    OCR_AVAILABLE = True
except Exception as import_error:
    print(json.dumps({
        "items": [], 
        "status": "critical_error", 
        "error": f"OCR REQUIRED but not available: {import_error}. This system MUST use OCR.",
        "ocr_used": False
    }))
    sys.exit(1)

# PERMANENT OCR ENFORCEMENT - Cannot be disabled
FORCE_OCR_ALWAYS = True
DISABLE_TEXT_EXTRACTION = True

# Enhanced configuration from environment
SEARCH_MAX = int(os.getenv("INDEX_SEARCH_MAX_PAGES", "5"))  # Reduced for faster processing
CONT_MAX = int(os.getenv("INDEX_CONTINUATION_MAX_PAGES", "3"))  # Most indexes are on 1-2 pages
OCR_DPI = int(os.getenv("INDEX_OCR_DPI", "200"))  # Reduced DPI for faster processing
PSM = os.getenv("OCR_PSM", "4")  # Better for multi-column layouts
INDEX_HINTS = tuple(h.strip().upper() for h in os.getenv(
    "INDEX_HINTS", "INDEX,TABLE OF CONTENTS,TAB NO,TAB NUMBER,INDEX OF TABS"
).split(","))
ITEM_RE = re.compile(r"^\s*(\d+)[\).\s-]+\s*(.+?)\s*$")

def page_text(page):
    """
    PERMANENTLY HARDCODED OCR FUNCTION
    This function ONLY uses OCR - no text extraction fallbacks allowed.
    Legal documents are scanned images and MUST be processed with OCR.
    """
    # PERMANENT GUARD: Ensure OCR is available
    if not OCR_AVAILABLE:
        raise RuntimeError("CRITICAL: OCR system required but not available. Cannot process legal documents.")
    
    # PERMANENT GUARD: Prevent text extraction bypass
    if not FORCE_OCR_ALWAYS:
        raise RuntimeError("CRITICAL: OCR enforcement disabled. This violates permanent system requirements.")
    
    try:
        # ENHANCED OCR PROCESSING - Permanently enabled
        pm = page.get_pixmap(dpi=OCR_DPI)
        im = Image.frombytes("RGB", [pm.width, pm.height], pm.samples)
        
        # Enhanced OCR configuration for legal documents
        text = pytesseract.image_to_string(im, config=f'--psm {PSM}')
        
        # Log OCR usage for permanent tracking
        print(f"OCR_PROCESSING: Page processed with OCR (DPI={OCR_DPI}, PSM={PSM})", file=sys.stderr)
        
        return text
    except Exception as e:
        print(f"OCR_ERROR: {e}", file=sys.stderr)
        # Even on error, we return empty string but never fallback to text extraction
        return ""

def looks_like_index(s):
    u = s.upper()
    return any(h in u for h in INDEX_HINTS)

def extract_items(text):
    items = []
    in_index_section = False
    
    for line in (text or "").splitlines():
        line_upper = line.upper()
        
        # Check if we're entering an index section
        if any(hint in line_upper for hint in INDEX_HINTS):
            in_index_section = True
            continue
            
        # Skip lines that look like addresses or contact info
        if any(skip_word in line_upper for skip_word in ['AVENUE', 'DRIVE', 'STREET', 'ROAD', 'CORPORATION', 'LEGAL', '@', 'TEL:', 'FAX:']):
            continue
            
        # Only process numbered lines when we're in an index section
        if in_index_section:
            # Clean the line and handle various dash types
            clean_line = line.strip().replace("—", "-").replace("–", "-")
            
            # Try the standard pattern first
            m = ITEM_RE.match(clean_line)
            if not m:
                # Try alternative patterns that work with the actual OCR output
                alt_patterns = [
                    re.compile(r"^\s*(\d+)\.\s*(.+)$"),      # "1. Text" - most common
                    re.compile(r"^\s*(\d+)\)\s*(.+)$"),      # "1) Text"
                    re.compile(r"^\s*(\d+)\s+(.+)$"),        # "1 Text"
                ]
                for pattern in alt_patterns:
                    m = pattern.match(clean_line)
                    if m:
                        break
                
                if not m:
                    continue
            
            try:
                no = int(m.group(1))
                label = m.group(2).strip()
                
                # Accept reasonable numbered items with good labels
                if 1 <= no <= 100 and len(label) >= 5:
                    items.append((no, label))
            except (ValueError, IndexError):
                continue
    
    # dedupe and sort by number
    seen, out = set(), []
    for no, label in items:
        if no in seen: continue
        seen.add(no); out.append({"no": no, "label": label})
    out.sort(key=lambda x: x["no"])
    return out

def main(pdf_path):
    start_time = time.time()
    
    try:
        doc = fitz.open(pdf_path)
        first_idx = None
        
        # find first index page in first SEARCH_MAX pages
        for i in range(min(SEARCH_MAX, len(doc))):
            if looks_like_index(page_text(doc[i])):
                first_idx = i; break
        
        if first_idx is None:
            result = {
                "items": [], 
                "index_page": None, 
                "status": "no_index_found",
                "ocr_used": True,
                "processing_time_ms": int((time.time() - start_time) * 1000)
            }
            print(json.dumps(result)); 
            return

        # collect across continuation pages
        items = []
        for p in range(first_idx, min(first_idx + CONT_MAX, len(doc))):
            t = page_text(doc[p])
            if not looks_like_index(t) and p > first_idx:
                break
            items.extend(extract_items(t))

        result = {
            "items": items, 
            "index_page": first_idx + 1,
            "status": "success",
            "ocr_used": True,
            "processing_time_ms": int((time.time() - start_time) * 1000)
        }
        print(json.dumps(result, ensure_ascii=False))
        
    except Exception as e:
        result = {
            "items": [], 
            "index_page": None, 
            "status": "error",
            "error": str(e),
            "ocr_used": True,
            "processing_time_ms": int((time.time() - start_time) * 1000)
        }
        print(json.dumps(result))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"items": []}))
    else:
        main(sys.argv[1])