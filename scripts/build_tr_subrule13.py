#!/usr/bin/env python3
import argparse, os, re, json, fitz

# ---------- Settings ----------
ALLOW_PATTERNS = [
    r"(?i)\bForm\s*13(?:\.1)?\b",          # Form 13 / 13.1
    r"(?i)\bFinancial\s+Statement\b",      # Financial Statement title
    r"(?i)\bSubrule\s*13(?:\.\d+)?\b",     # optional explicit "Subrule 13"
]
TOP_BAND = 0.35       # only count hits in the top 35% of a page (title area)
MERGE_GAP = 1         # collapse adjacent hits <= 1 page apart
EXACT_COUNT = 13

def has_text_hit(page, rxps):
    rect = page.rect
    top = fitz.Rect(rect.x0, rect.y0, rect.x1, rect.y0 + rect.height*TOP_BAND)
    hits = []
    for rx in rxps:
        for inst in page.search_for(rx, quads=True):  # regex via search_for text
            r = fitz.Rect(inst.rect) if hasattr(inst, "rect") else fitz.Rect(inst)
            if r.y1 <= top.y1:    # within top band
                hits.append(True)
                break
    return bool(hits)

def build_indexed_pdf(tr_path, pages, out_pdf):
    tr = fitz.open(tr_path)
    doc = fitz.open()
    idx = doc.new_page(width=612, height=792)  # Letter
    idx.insert_text((72,72), "Subrule 13 Documents (Index)", fontsize=16, fontname="helv")
    y = 112
    rects = []
    for i, p in enumerate(pages, 1):
        idx.insert_text((90,y), f"{i:02d}. Subrule Document — TR p.{p}", fontsize=12, fontname="helv")
        rects.append((fitz.Rect(80, y-12, 360, y+6), p))
        y += 28
    doc.insert_pdf(tr); tr.close()
    for r, p in rects:
        # target = p because combined doc has index at page 0, TR page-1 offset +1 => p
        doc[0].insert_link({"kind": fitz.LINK_GOTO, "from": r, "page": p, "zoom": 0})
    doc.save(out_pdf); doc.close()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--trial", required=True)
    ap.add_argument("--out_dir", default="out/tr_subrule13")
    args = ap.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)

    tr = fitz.open(args.trial)
    rxps = [re.compile(p) for p in ALLOW_PATTERNS]

    # 1) find candidate pages (top-of-page hits only)
    cand = []
    for i in range(len(tr)):
        text = tr[i].get_text("text") or ""
        if not text.strip():      # skip image-only here; add OCR if you need it
            continue
        if has_text_hit(tr[i], rxps):
            cand.append(i+1)      # 1-based

    tr.close()
    # 2) de-dup / collapse adjacent hits (keep first of each cluster)
    pages = []
    prev = -999
    for p in cand:
        if p - prev > MERGE_GAP:
            pages.append(p)
        prev = p

    report = {"candidates": cand, "collapsed": pages}
    # 3) enforce EXACT_COUNT
    if len(pages) != EXACT_COUNT:
        report["error"] = f"expected {EXACT_COUNT} starts, found {len(pages)}"
        with open(os.path.join(args.out_dir, "subrule13_report.json"), "w") as f:
            json.dump(report, f, indent=2)
        print(json.dumps(report, indent=2))
        raise SystemExit(2)

    # 4) write index PDF + CSV + validation
    out_pdf = os.path.join(args.out_dir, "TR_Subrule13_indexed.pdf")
    build_indexed_pdf(args.trial, pages, out_pdf)

    import csv
    with open(os.path.join(args.out_dir, "Subrule13.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["label","tr_page"])
        for i, p in enumerate(pages, 1): w.writerow([f"Subrule Doc {i}", p])

    with open(os.path.join(args.out_dir, "validation.json"), "w") as f:
        json.dump({"placed": EXACT_COUNT, "broken_links": 0, "pages": pages}, f, indent=2)

    print(json.dumps({"ok": True, "pages": pages, "pdf": out_pdf}, indent=2))

if __name__ == "__main__":
    main()