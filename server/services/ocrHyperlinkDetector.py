#!/usr/bin/env python3
"""
OCR Hyperlink Detection for hyperlinklaw.com
Scans PDF documents to find index pages and create hyperlinks to pleadings sections
"""
import re
import fitz  # PyMuPDF
from pdf2image import convert_from_path
import pytesseract
from PIL import Image
from collections import defaultdict
import json
import sys
import argparse

# Configurable patterns for Tab 1 (Pleadings)
PATTERNS = {
    "application": [r"\bForm\s*8[A]?\b", r"\bApplication\b", r"Application\s*\(General\)"],
    "answer": [r"\bForm\s*10\b", r"\bAnswer\b", r"Fresh\s*as\s*Amended\s*Answer"],
    "reply": [r"\bForm\s*10A\b", r"\bReply\b"]
}

def page_text(doc, i):
    """Return text if present; else empty string."""
    try:
        return doc[i].get_text("text") or ""
    except Exception:
        return ""

def ocr_page_to_lines(doc, i, dpi=200):
    """OCR one page and return (full_text, lines_with_boxes)."""
    try:
        # Render page to image via pixmap for better fidelity
        pm = doc[i].get_pixmap(dpi=dpi)
        img = Image.frombytes("RGB", (pm.width, pm.height), pm.samples)
        data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
        
        # Reconstruct lines with their approximate bounding boxes
        lines = defaultdict(list)
        for j, word in enumerate(data["text"]):
            if not word.strip():
                continue
            line_no = data["line_num"][j]
            x, y, w, h = data["left"][j], data["top"][j], data["width"][j], data["height"][j]
            lines[line_no].append((word, (x, y, x+w, y+h)))
        
        merged = []
        for ln, parts in lines.items():
            text = " ".join(w for w, _ in parts)
            # Merge boxes across the line
            xs1, ys1, xs2, ys2 = zip(*[b for _, b in parts])
            bbox = (min(xs1), min(ys1), max(xs2), max(ys2))
            merged.append((text, bbox))
        
        full_text = "\n".join(t for t, _ in merged)
        return full_text, merged
    except Exception as e:
        print(f"OCR failed for page {i}: {e}")
        return "", []

def find_first_page(doc, keys, hint=None):
    """Find the first page index matching ANY regex in keys (text-first, OCR fallback)."""
    # Text search pass
    for i in range(len(doc)):
        txt = page_text(doc, i)
        if any(re.search(p, txt, re.IGNORECASE) for p in keys):
            return i
    
    # OCR fallback pass
    for i in range(len(doc)):
        if hint is not None and i == hint:
            return hint
        ocr_txt, _ = ocr_page_to_lines(doc, i)
        if any(re.search(p, ocr_txt, re.IGNORECASE) for p in keys):
            return i
    return None

def find_index_page(doc):
    """Best-effort detection of the master Index page."""
    candidates = []
    
    # Check first 60 pages for index patterns
    for i in range(min(60, len(doc))):
        txt = page_text(doc, i).upper()
        if ("INDEX" in txt or "TABLE OF CONTENTS" in txt or "TABS" in txt) and "PLEADINGS" in txt:
            return i
        if "PLEADINGS" in txt and ("TAB 1" in txt or "TAB ONE" in txt):
            candidates.append(i)
    
    if candidates:
        return candidates[0]
    
    # OCR sweep over the first ~30 pages if needed
    for i in range(min(30, len(doc))):
        ocr_txt, _ = ocr_page_to_lines(doc, i)
        up = ocr_txt.upper()
        if ("INDEX" in up or "TABLE OF CONTENTS" in up or "TABS" in up) and "PLEADINGS" in up:
            return i
    
    return None

def find_line_bbox(lines, *needles):
    """Return bbox of the first line that contains ALL needles (case-insensitive)."""
    for text, bbox in lines:
        up = text.upper()
        if all(n.upper() in up for n in needles):
            return bbox
    return None

def add_link(page, bbox, target_page):
    """Add a hyperlink from bbox to target page."""
    rect = fitz.Rect(*bbox)
    page.add_link(rect=rect, page=target_page, kind=fitz.LINK_GOTO)

def detect_hyperlinks(pdf_path, output_path=None):
    """Main detection function - returns detected links and saves linked PDF if output_path provided."""
    doc = fitz.open(pdf_path)
    
    try:
        # 1) Find target pages
        target_pages = {}
        
        # Application
        application_page = find_first_page(doc, PATTERNS["application"])
        target_pages["application"] = application_page
        
        # Answer
        answer_page = find_first_page(doc, PATTERNS["answer"])
        target_pages["answer"] = answer_page
        
        # Reply
        reply_page = find_first_page(doc, PATTERNS["reply"])
        target_pages["reply"] = reply_page
        
        print(f"Detected target pages (0-based): {target_pages}")
        
        # 2) Locate the Index page and line boxes to click
        idx = find_index_page(doc)
        if idx is None:
            print("Could not auto-detect the Index page.")
            return {"error": "Index page not found", "target_pages": target_pages}
        
        print(f"Found index page: {idx}")
        index_page = doc[idx]
        
        # OCR the index page to get line boxes
        _, idx_lines = ocr_page_to_lines(doc, idx)
        
        # Try to place links on lines that look like the Tab 1 entries
        mapping = [
            ("application", ("PLEADINGS", "APPLICATION")),
            ("answer", ("PLEADINGS", "ANSWER")),
            ("reply", ("PLEADINGS", "REPLY")),
        ]
        
        placed = []
        links_data = []
        
        for key, needles in mapping:
            tp = target_pages.get(key)
            if tp is None:
                continue
                
            bbox = find_line_bbox(idx_lines, *needles)
            if bbox is None:
                # Fallback: search for just the final needle
                bbox = find_line_bbox(idx_lines, needles[-1])
            
            if bbox and output_path:
                add_link(index_page, bbox, tp)
                placed.append((key, tp, bbox))
            
            if bbox:
                links_data.append({
                    "type": key,
                    "source_page": idx + 1,  # 1-based for user display
                    "target_page": tp + 1,   # 1-based for user display
                    "bbox": bbox,
                    "text": needles[-1]
                })
        
        # Save linked PDF if output path provided
        if output_path and placed:
            doc.save(output_path, incremental=False)
            print(f"Saved linked PDF: {output_path}")
        
        result = {
            "success": True,
            "index_page": idx + 1,  # 1-based
            "target_pages": {k: (v + 1 if v is not None else None) for k, v in target_pages.items()},  # 1-based
            "links_placed": len(placed),
            "links": links_data
        }
        
        return result
        
    finally:
        doc.close()

def main():
    parser = argparse.ArgumentParser(description='OCR Hyperlink Detection for Legal Documents')
    parser.add_argument('--input', required=True, help='Input PDF path')
    parser.add_argument('--output', help='Output PDF path (optional)')
    parser.add_argument('--json', help='Output JSON results path (optional)')
    
    args = parser.parse_args()
    
    try:
        result = detect_hyperlinks(args.input, args.output)
        
        if args.json:
            with open(args.json, 'w') as f:
                json.dump(result, f, indent=2)
        
        print("Detection complete:")
        print(json.dumps(result, indent=2))
        
        return 0 if result.get("success") else 1
        
    except Exception as e:
        error_result = {"success": False, "error": str(e)}
        print(json.dumps(error_result, indent=2))
        return 1

if __name__ == "__main__":
    sys.exit(main())