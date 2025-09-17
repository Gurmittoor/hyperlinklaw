#!/usr/bin/env python3
"""
Enhanced PDF Processor with Guaranteed Index Detection
Auto-finds Index page and extracts all items with side-by-side viewer support

CRITICAL REQUIREMENT: Create exactly as many hyperlinks as there are index items.
No more, no less. If 5 items exist, find exactly 5 hyperlinks.
If 63 items exist, find exactly 63 hyperlinks.
"""
import re
import json
import os
import sys
import argparse
import fitz  # PyMuPDF
from PIL import Image
import pytesseract

INDEX_SCAN_PAGES = 20       # pages to look for "INDEX" or "TABLE OF CONTENTS"
OCR_PAGE_LIMIT   = 400      # cap OCR pass for speed

# Strict enforcement flag - NEVER create more links than index items
STRICT_INDEX_ONLY = True

# ---------------- text / OCR helpers ----------------
def page_text(doc, i):
    try:
        return doc[i].get_text("text") or ""
    except Exception:
        return ""

def pix_to_img(pm):
    return Image.frombytes("RGB", (pm.width, pm.height), pm.samples)

def ocr_text(doc, i, dpi=200):
    pm = doc[i].get_pixmap(dpi=dpi)
    return pytesseract.image_to_string(pix_to_img(pm))

def ocr_lines(doc, i, dpi=230):
    pm = doc[i].get_pixmap(dpi=dpi)
    img = pix_to_img(pm)
    data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
    grouped = {}
    for j, word in enumerate(data["text"]):
        if not word or not word.strip(): 
            continue
        key = (data["block_num"][j], data["par_num"][j], data["line_num"][j])
        x, y, w, h = data["left"][j], data["top"][j], data["width"][j], data["height"][j]
        grouped.setdefault(key, []).append((word, (x, y, x+w, y+h)))
    lines = []
    for parts in grouped.values():
        text = " ".join(w for w,_ in parts).strip()
        xs1, ys1, xs2, ys2 = zip(*[b for _,b in parts])
        lines.append((text, (min(xs1), min(ys1), max(xs2), max(ys2))))
    lines.sort(key=lambda t: t[1][1])  # top→bottom
    return lines

# ---------------- Index detection ----------------
def find_index_page(doc):
    # text-first
    for i in range(min(INDEX_SCAN_PAGES, len(doc))):
        t = page_text(doc, i).upper()
        if "INDEX" in t or "TABLE OF CONTENTS" in t:
            return i
    # OCR fallback
    for i in range(min(INDEX_SCAN_PAGES, len(doc))):
        t = ocr_text(doc, i).upper()
        if "INDEX" in t or "TABLE OF CONTENTS" in t:
            return i
    return None

ITEM_RE = re.compile(r"^\s*(\d+)[\).\s-]+(.+?)\s*$")
def normalize_dash(s): 
    return s.replace("–","-").replace("—","-")

def extract_index_items(doc, idx_page):
    lines = ocr_lines(doc, idx_page)
    items = []
    for text, bbox in lines:
        if not text: 
            continue
        m = ITEM_RE.match(normalize_dash(text))
        if m:
            n = int(m.group(1))
            label = m.group(2).strip()
            if len(label) < 3: 
                continue
            items.append({"no": n, "label": label, "bbox": bbox})
    items.sort(key=lambda it: it["no"])
    return items

# ---------------- label → search patterns ----------------
STOP = {"THE","AND","OF","ON","FOR","TO","A","AN","WITH","WE","WHICH","RELATING","IN","BY"}
def patterns_from_label(label):
    L = normalize_dash(label).upper()
    pats = [re.escape(L)]  # exact-ish
    words = [w for w in re.split(r"[^A-Z0-9]+", L) if w and w not in STOP]
    for i in range(len(words)-1):
        pats.append(rf"{re.escape(words[i])}\s+{re.escape(words[i+1])}")
    # domain hints
    if "PLEADINGS" in L: 
        pats += [r"\bPLEADINGS\b", r"\bAPPLICATION\b", r"\bANSWER\b", r"\bREPLY\b", r"\bFORM\s*8[A]?\b", r"\bFORM\s*10A?\b"]
    if any(k in L for k in ["SUBRULE","FINANCIAL","STATEMENT"]): 
        pats += [r"SUBRULE\s*13", r"\bFINANCIAL\s+STATEMENT\b", r"\bFORM\s*13[^0-9A-Z]?\b"]
    if "TRANSCRIPT" in L: 
        pats += [r"\bTRANSCRIPT\b", r"\bEXAMINATION\b"]
    if "TRIAL SCHEDULING ENDORSEMENT" in L: 
        pats += [r"TRIAL\s+SCHEDULING\s+ENDORSEMENT\s+FORM"]
    if "TEMPORARY ORDERS" in L: 
        pats += [r"TEMPORARY\s+ORDERS", r"ORDER\s+RELATING\s+TO\s+THE\s+TRIAL"]
    return pats

def find_first_page_for_label(doc, label):
    pats = patterns_from_label(label)
    N = len(doc)
    # text pass
    for i in range(N):
        up = page_text(doc, i).upper()
        if any(re.search(p, up, re.IGNORECASE) for p in pats):
            return i
    # OCR fallback
    for i in range(min(N, OCR_PAGE_LIMIT)):
        up = ocr_text(doc, i).upper()
        if any(re.search(p, up, re.IGNORECASE) for p in pats):
            return i
    return None

# ---------------- linking + manifest ----------------
def build_links(pdf_in, pdf_out, manifest_out):
    doc = fitz.open(pdf_in)
    
    try:
        idx = find_index_page(doc)
        if idx is None:
            raise RuntimeError("Index page not found in the first pages.")
        
        print(f"✅ Found Index page: {idx + 1}")
        
        items = extract_index_items(doc, idx)
        if not items:
            raise RuntimeError("No numbered items found under Index.")
        
        print(f"✅ Extracted {len(items)} index items")

        # destinations
        for it in items:
            dest = find_first_page_for_label(doc, it["label"])
            it["dest_start_0"] = dest
            it["dest_start_1"] = (dest + 1) if dest is not None else None
            print(f"  Tab {it['no']}: {it['label']} → Page {it['dest_start_1'] or 'Not Found'}")

        # end pages (until next start; last goes to document end)
        seq = [it for it in items if it["dest_start_0"] is not None]
        seq.sort(key=lambda x: x["dest_start_0"])
        for i, it in enumerate(seq):
            start = it["dest_start_0"]
            if i < len(seq)-1:
                end = max(start, seq[i+1]["dest_start_0"] - 1)
            else:
                end = len(doc) - 1
            it["dest_end_0"] = end
            it["dest_end_1"] = end + 1

        # add links on Index page
        p = doc[idx]
        links_added = 0
        for it in items:
            bbox = it.get("bbox")
            dest = it.get("dest_start_0")
            if bbox and dest is not None:
                link_dict = {
                    "kind": fitz.LINK_GOTO,
                    "page": dest,
                    "to": fitz.Point(0, 0)
                }
                p.insert_link(fitz.Rect(bbox[0], bbox[1], bbox[2], bbox[3]), link_dict)
                links_added += 1

        # optional TOC
        toc = []
        for it in seq:
            toc.append([1, f"{it['no']}. {it['label']}", it["dest_start_1"]])
        if toc:
            doc.set_toc(toc)

        doc.save(pdf_out, incremental=False)

        manifest = {
            "success": True,
            "index_page_1based": idx+1,
            "total_tabs": len(items),
            "links_found": len(seq),
            "items": [{
                "no": it["no"],
                "label": it["label"],
                "index_bbox": it["bbox"],
                "start_page": it.get("dest_start_1"),
                "end_page": it.get("dest_end_1"),
                "found": it.get("dest_start_0") is not None
            } for it in items]
        }
        
        with open(manifest_out, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)

        print(f"✅ Index: page {idx+1}")
        print(f"✅ Linked PDF: {pdf_out}")
        print(f"✅ Manifest: {manifest_out}")
        print(f"✅ Created {links_added} hyperlinks")
        
        return manifest
        
    finally:
        doc.close()

def main():
    parser = argparse.ArgumentParser(description='Enhanced PDF Processor with Side-by-Side Viewer')
    parser.add_argument('--input', required=True, help='Input PDF path')
    parser.add_argument('--output', required=True, help='Output linked PDF path')
    parser.add_argument('--manifest', required=True, help='Output manifest JSON path')
    
    args = parser.parse_args()
    
    try:
        if not os.path.exists(args.input):
            raise SystemExit(f"Input PDF not found: {args.input}")
        
        result = build_links(args.input, args.output, args.manifest)
        
        if result["success"]:
            print(f"\n=== AUTO-DETECTION COMPLETE ===")
            print(f"Found {result['links_found']}/{result['total_tabs']} hyperlinks")
            return 0
        else:
            print("❌ Processing failed")
            return 1
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())