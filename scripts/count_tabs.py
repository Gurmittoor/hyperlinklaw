#!/usr/bin/env python3
import argparse, os, re, io, json
import fitz  # PyMuPDF
import pandas as pd

TAB_RE = re.compile(r"(?i)\bTab\s*(?:No\.?\s*)?(\d{1,3})\b")

# OCR helpers
def ocr_available():
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False

def page_text_or_ocr(page, dpi=300, use_ocr=True):
    text = page.get_text("text") or ""
    if text.strip() or not use_ocr:
        return text, "text" if text.strip() else "none"
    if not ocr_available():
        return "", "none"
    # Rasterize and OCR this page only
    pix = page.get_pixmap(dpi=dpi, alpha=False)
    from PIL import Image
    import pytesseract
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    try:
        text = pytesseract.image_to_string(img)
        return text or "", "ocr"
    except Exception:
        return "", "none"

def count_tabs(paths, out_csv, use_ocr=True):
    rows = []
    for path in paths:
        if not os.path.exists(path):
            print(f"[WARN] Missing file: {path}")
            continue
        doc = fitz.open(path)
        for i in range(len(doc)):
            page = doc[i]
            text, mode = page_text_or_ocr(page, use_ocr=use_ocr)
            if not text:
                continue
            for m in TAB_RE.finditer(text):
                rows.append({
                    "file": os.path.basename(path),
                    "page": i+1,
                    "tab_number": int(m.group(1)),
                    "detected_by": mode,
                })
        doc.close()
    df = pd.DataFrame(rows, columns=["file","page","tab_number","detected_by"]).sort_values(["file","tab_number","page"])
    df.to_csv(out_csv, index=False)
    # Summaries
    summary = (df.groupby("file")
                 .agg(total_tab_mentions=("tab_number","count"),
                      unique_tabs=("tab_number", lambda s: len(sorted(set(s)))))
                 .reset_index()) if not df.empty else pd.DataFrame(columns=["file","total_tab_mentions","unique_tabs"])
    # Unique list with pages
    detail = (df.groupby(["file","tab_number"])
                .agg(pages=("page", lambda s: sorted(set(int(x) for x in s))),
                     detected_by=("detected_by", lambda s: ",".join(sorted(set(s)))))
                .reset_index()
                .sort_values(["file","tab_number"])) if not df.empty else pd.DataFrame(columns=["file","tab_number","pages","detected_by"])
    return summary, detail

def main():
    ap = argparse.ArgumentParser(description="Count Tab<N> in PDFs (with OCR fallback).")
    ap.add_argument("--files", nargs="+", required=True, help="PDF paths")
    ap.add_argument("--ocr", action="store_true", help="Enable OCR fallback on image-only pages")
    ap.add_argument("--out", default="tab_counts_with_pages.csv", help="CSV output path")
    args = ap.parse_args()

    summary, detail = count_tabs(args.files, args.out, use_ocr=args.ocr)
    print("# Tab summary per file")
    print(summary.to_string(index=False) if not summary.empty else "(no tabs found)")
    print("\n# Unique Tabs with pages")
    print(detail.to_string(index=False) if not detail.empty else "(no tabs found)")
    print(f"\nCSV written: {os.path.abspath(args.out)}")

if __name__ == "__main__":
    main()