#!/usr/bin/env python3
"""
Enhanced OCR Index Hyperlink Detection
Detects the exact 5 tabs from the Index page and creates hyperlinks
"""
import re
import json
import sys
import fitz  # PyMuPDF
from PIL import Image
import pytesseract
import argparse

# If your Index is not on page 1, change to the 0-based page here:
INDEX_PAGE = 0

# The five EXACT index lines we'll look for on the Index page (robust matching)
INDEX_LINES = [
    "Pleadings — Application, Fresh as Amended Answer and Reply",
    "Subrule 13 documents — Sworn Financial Statements",
    "Transcript on which we intend to rely — Rino Ferrante's Transcript - Examination",
    "Temporary Orders and Order relating to the trial",
    "Trial Scheduling Endorsement Form",
]

# For each tab, we search the body for these patterns (priority order).
# We match using TEXT FIRST; if nothing, we fall back to OCR (bounded).
DEST_PATTERNS = {
    INDEX_LINES[0]: [  # Pleadings
        r"\bPLEADINGS\b",
        r"\bAPPLICATION\b", r"\bFORM\s*8[A]?\b",
        r"\bFRESH\s+AS\s+AMENDED\s+ANSWER\b", r"\bANSWER\b", r"\bFORM\s*10A?\b",
        r"\bREPLY\b",
    ],
    INDEX_LINES[1]: [  # Subrule 13 / Financial Statements
        r"SUBRULE\s*13", r"\bSWORN\s+FINANCIAL\s+STATEMENTS\b",
        r"\bFINANCIAL\s+STATEMENT\b", r"\bFORM\s*13[^0-9A-Z]?\b",
    ],
    INDEX_LINES[2]: [  # Transcript
        r"\bTRANSCRIPT\b", r"\bEXAMINATION\b", r"RINO\s+FERRANTE",
    ],
    INDEX_LINES[3]: [  # Temporary Orders / Order relating to the trial
        r"TEMPORARY\s+ORDERS", r"ORDER\s+RELATING\s+TO\s+THE\s+TRIAL",
        r"\bENDORSEMENT\b.*TRIAL", r"\bORDER\b.*TRIAL",
    ],
    INDEX_LINES[4]: [  # Trial Scheduling Endorsement Form
        r"TRIAL\s+SCHEDULING\s+ENDORSEMENT\s+FORM",
    ],
}

def rasterize_page(doc, i, dpi=220):
    pm = doc[i].get_pixmap(dpi=dpi)
    return Image.frombytes("RGB", (pm.width, pm.height), pm.samples)

def ocr_lines(img):
    data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
    grouped = {}
    for j, word in enumerate(data["text"]):
        if not word or not word.strip():
            continue
        key = (data["page_num"][j], data["block_num"][j], data["par_num"][j], data["line_num"][j])
        x, y, w, h = data["left"][j], data["top"][j], data["width"][j], data["height"][j]
        grouped.setdefault(key, []).append((word, (x, y, x+w, y+h)))
    lines = []
    for parts in grouped.values():
        text = " ".join(w for w,_ in parts).strip()
        xs1, ys1, xs2, ys2 = zip(*[b for _,b in parts])
        bbox = (min(xs1), min(ys1), max(xs2), max(ys2))
        lines.append((text, bbox))
    # Sort by vertical position
    lines.sort(key=lambda t: t[1][1])
    return lines

def page_text(doc, i):
    try:
        return doc[i].get_text("text") or ""
    except Exception:
        return ""

def find_first_page(doc, patterns, ocr_limit=180):
    """Return first page index that matches ANY pattern. Text pass then OCR (bounded)."""
    N = len(doc)
    # Text pass
    for i in range(N):
        up = page_text(doc, i).upper()
        for p in patterns:
            if re.search(p, up, re.IGNORECASE):
                return i
    # OCR pass
    for i in range(min(N, ocr_limit)):
        up = pytesseract.image_to_string(rasterize_page(doc, i, dpi=200)).upper()
        for p in patterns:
            if re.search(p, up, re.IGNORECASE):
                return i
    return None

def normalize(s):
    # unify dashes and spacing for reliable matching
    s = s.replace("–", "-").replace("—", "-")
    s = re.sub(r"\s+", " ", s).strip()
    return s.lower()

def best_bbox_for_line(index_lines_ocr, wanted_text):
    """Find the OCR line on Index page that best matches our wanted_text."""
    want = normalize(wanted_text)
    # try exact-ish contains first
    for t, b in index_lines_ocr:
        if normalize(t).find(want) >= 0:
            return b
    # fallback: match ignoring tail punctuation/numbers
    want_words = set(re.findall(r"[a-z0-9]+", want))
    best = (None, -1)
    for t, b in index_lines_ocr:
        got_words = set(re.findall(r"[a-z0-9]+", normalize(t)))
        score = len(want_words & got_words)
        if score > best[1]:
            best = (b, score)
    return best[0]

def detect_index_hyperlinks(pdf_path, output_path=None, json_path=None):
    """Main detection function"""
    doc = fitz.open(pdf_path)
    
    try:
        # --- 1) OCR Index page to get line bboxes ---
        idx_img = rasterize_page(doc, INDEX_PAGE, dpi=230)
        idx_lines = ocr_lines(idx_img)

        # --- 2) For each of the 5 lines, get its bbox and find its destination page ---
        results = []
        for idx_text in INDEX_LINES:
            bbox = best_bbox_for_line(idx_lines, idx_text)
            patterns = DEST_PATTERNS.get(idx_text, [])
            dest = find_first_page(doc, patterns) if patterns else None
            results.append({
                "index_text": idx_text,
                "index_bbox": bbox,
                "dest_page_0based": dest,
                "dest_page_1based": (dest + 1) if dest is not None else None,
                "found": dest is not None
            })

        # --- 3) Add clickable links on the Index page ---
        if output_path:
            index_page = doc[INDEX_PAGE]
            links_added = 0
            for r in results:
                if r["index_bbox"] and r["dest_page_0based"] is not None:
                    link_dict = {
                        "kind": fitz.LINK_GOTO,
                        "page": r["dest_page_0based"],
                        "to": fitz.Point(0, 0)
                    }
                    index_page.insert_link(fitz.Rect(*r["index_bbox"]), link_dict)
                    links_added += 1

            # Optional: also write a TOC (bookmarks) at top level
            toc = []
            for r in results:
                if r["dest_page_1based"]:
                    toc.append([1, r["index_text"], r["dest_page_1based"]])
            if toc:
                doc.set_toc(toc)

            # Save linked PDF
            doc.save(output_path, incremental=False)
            print(f"✅ Saved linked PDF with {links_added} hyperlinks: {output_path}")

        # --- 4) Save JSON results ---
        final_results = {
            "success": True,
            "index_page": INDEX_PAGE + 1,  # 1-based
            "total_tabs": len(INDEX_LINES),
            "links_found": sum(1 for r in results if r["found"]),
            "links": results
        }

        if json_path:
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(final_results, f, indent=2, ensure_ascii=False)

        return final_results

    finally:
        doc.close()

def main():
    parser = argparse.ArgumentParser(description='Enhanced OCR Index Hyperlink Detection')
    parser.add_argument('--input', required=True, help='Input PDF path')
    parser.add_argument('--output', help='Output linked PDF path (optional)')
    parser.add_argument('--json', help='Output JSON results path (optional)')
    parser.add_argument('--index-page', type=int, default=0, help='Index page number (0-based, default: 0)')
    
    args = parser.parse_args()
    
    global INDEX_PAGE
    INDEX_PAGE = args.index_page
    
    try:
        result = detect_index_hyperlinks(args.input, args.output, args.json)
        
        print("\n=== Index hyperlinks detection complete ===")
        for link in result["links"]:
            status = "✅ Found" if link["found"] else "❌ Not Found"
            page = link["dest_page_1based"] or "N/A"
            print(f"- {link['index_text']}")
            print(f"  → Page: {page} ({status})")
        
        print(f"\nTotal: {result['links_found']}/{result['total_tabs']} hyperlinks created")
        
        if args.json:
            print(f"JSON results saved to: {args.json}")
        
        return 0 if result["success"] else 1
        
    except Exception as e:
        error_result = {"success": False, "error": str(e)}
        print(f"❌ Error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())