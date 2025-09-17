#!/usr/bin/env python3
"""
Complete FastAPI Auto Index Linker - Works for any number of Index items (1-100+)
Features:
- Auto-finds Index page using text/OCR
- Extracts ALL numbered items across multiple Index pages  
- Creates clickable hyperlinks in PDF
- Side-by-side reviewer with instant override capabilities
"""
import os, re, json
from typing import List, Tuple
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import fitz  # PyMuPDF
from PIL import Image
import pytesseract

# ----------------- Paths -----------------
DATA = "data"; os.makedirs(DATA, exist_ok=True)
PDF_IN   = f"{DATA}/case.pdf"
PDF_OUT  = f"{DATA}/case_linked.pdf"
MAP_JSON = f"{DATA}/index_map.json"

# ----------------- Tunables -----------------
INDEX_SCAN_PAGES = 30      # first N pages to search for "INDEX"
FOLLOW_INDEX_PAGES = 8     # how many pages after the first Index page to keep collecting items
OCR_PAGE_LIMIT = 500       # cap OCR search
MIN_ITEMS_PER_CONT_PAGE = 2  # "still index" heuristic across pages

# Strict "Index-only" mode (do not create any other links)
STRICT_INDEX_ONLY = True

# ----------------- App -----------------
app = FastAPI(title="Auto Index Linker (any count)")
app.mount("/files", StaticFiles(directory=DATA), name="files")

# ----------------- Helpers -----------------
def pm_to_img(pm): return Image.frombytes("RGB", [pm.width, pm.height], pm.samples)

def page_text(doc, i):
    try: return doc[i].get_text("text") or ""
    except: return ""

def ocr_text(doc, i, dpi=200):
    pm = doc[i].get_pixmap(dpi=dpi)
    return pytesseract.image_to_string(pm_to_img(pm))

def ocr_lines(doc, i, dpi=230):
    pm = doc[i].get_pixmap(dpi=dpi)
    img = pm_to_img(pm)
    d = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
    grouped = {}
    for j, w in enumerate(d["text"]):
        if not w or not w.strip(): continue
        key = (d["block_num"][j], d["par_num"][j], d["line_num"][j])
        x, y, w0, h0 = d["left"][j], d["top"][j], d["width"][j], d["height"][j]
        grouped.setdefault(key, []).append((w, (x, y, x+w0, y+h0)))
    lines = []
    for parts in grouped.values():
        text = " ".join(w for w,_ in parts).strip()
        xs1, ys1, xs2, ys2 = zip(*[b for _,b in parts])
        lines.append((text, (min(xs1), min(ys1), max(xs2), max(ys2))))
    lines.sort(key=lambda t: t[1][1])  # top→bottom
    return lines

def find_index_page(doc) -> int | None:
    # text-first
    for i in range(min(INDEX_SCAN_PAGES, len(doc))):
        t = page_text(doc, i).upper()
        if "INDEX" in t or "TABLE OF CONTENTS" in t: return i
    # OCR fallback
    for i in range(min(INDEX_SCAN_PAGES, len(doc))):
        t = ocr_text(doc, i).upper()
        if "INDEX" in t or "TABLE OF CONTENTS" in t: return i
    return None

ITEM_RE = re.compile(r"^\s*(\d+)[\).\s-]+(.+?)\s*$")
def normdash(s: str) -> str: return s.replace("–","-").replace("—","-")

def extract_index_items_single(doc, page_i) -> List[Tuple[int,str,tuple]]:
    """Return list of (no, label, bbox) on a single page."""
    items = []
    for text, bbox in ocr_lines(doc, page_i):
        m = ITEM_RE.match(normdash(text))
        if not m: continue
        no = int(m.group(1)); label = m.group(2).strip()
        if len(label) < 3: continue
        items.append((no, label, bbox))
    return items

def extract_index_items_multi(doc, start_i) -> Tuple[int, list]:
    """Collect items across multiple consecutive pages after the first Index page."""
    seen = {}
    last_no = 0
    pages_used = [start_i]
    # first page
    for no, label, bbox in extract_index_items_single(doc, start_i):
        if no in seen: continue
        seen[no] = {"no": no, "label": label, "bbox": bbox}
        last_no = max(last_no, no)

    # follow-on pages while they still look like 'Index continuation'
    for p in range(start_i+1, min(start_i+1+FOLLOW_INDEX_PAGES, len(doc))):
        items = extract_index_items_single(doc, p)
        if len(items) < MIN_ITEMS_PER_CONT_PAGE: break  # likely not still the index
        pages_used.append(p)
        for no, label, bbox in items:
            if no in seen:  # already captured (e.g., footer duplicate)
                continue
            # tolerate numbering resets only if they strictly increase overall count
            if no <= last_no and last_no >= 1:
                continue
            seen[no] = {"no": no, "label": label, "bbox": bbox}
            last_no = max(last_no, no)

    out = [seen[k] for k in sorted(seen.keys())]
    return pages_used[0], out  # return the first index page and all items

# --- label → search patterns (domain-aware + generic) ---
STOP = {"THE","AND","OF","ON","FOR","TO","A","AN","WITH","WE","WHICH","RELATING","IN","BY"}
def patterns_from_label(label: str) -> List[str]:
    L = normdash(label).upper()
    pats = [re.escape(L)]  # exact-ish
    words = [w for w in re.split(r"[^A-Z0-9]+", L) if w and w not in STOP]
    for i in range(len(words)-1):
        pats.append(rf"{re.escape(words[i])}\s+{re.escape(words[i+1])}")
    # domain hints
    if "PLEADINGS" in L: pats += [r"\bPLEADINGS\b", r"\bAPPLICATION\b", r"\bANSWER\b", r"\bREPLY\b", r"\bFORM\s*8[A]?\b", r"\bFORM\s*10A?\b"]
    if any(k in L for k in ["SUBRULE","FINANCIAL","STATEMENT"]): pats += [r"SUBRULE\s*13", r"\bFINANCIAL\s+STATEMENT\b", r"\bFORM\s*13[^0-9A-Z]?\b"]
    if "TRANSCRIPT" in L: pats += [r"\bTRANSCRIPT\b", r"\bEXAMINATION\b"]
    if "TRIAL SCHEDULING ENDORSEMENT" in L: pats += [r"TRIAL\s+SCHEDULING\s+ENDORSEMENT\s+FORM"]
    if "TEMPORARY ORDERS" in L: pats += [r"TEMPORARY\s+ORDERS", r"ORDER\s+RELATING\s+TO\s+THE\s+TRIAL"]
    return pats

def find_start_page(doc, label: str) -> int | None:
    pats = patterns_from_label(label); N = len(doc)
    # text pass
    for i in range(N):
        up = (page_text(doc, i) or "").upper()
        if any(re.search(p, up, re.IGNORECASE) for p in pats): return i
    # OCR fallback (bounded)
    for i in range(min(N, OCR_PAGE_LIMIT)):
        up = ocr_text(doc, i).upper()
        if any(re.search(p, up, re.IGNORECASE) for p in pats): return i
    return None

def build_links(pdf_in=PDF_IN, pdf_out=PDF_OUT, map_out=MAP_JSON):
    doc = fitz.open(pdf_in)

    # 1) Find Index + collect ALL numbered items across continuation pages
    idx_first = find_index_page(doc)
    if idx_first is None:
        raise RuntimeError("Index not found in first pages.")
    idx0, items = extract_index_items_multi(doc, idx_first)
    if not items:
        raise RuntimeError("No numbered items found under Index.")

    print(f"✅ Found Index starting at page {idx0+1}")
    print(f"✅ Extracted {len(items)} index items")

    # 2) Resolve start pages for each Index item
    for it in items:
        dest = find_start_page(doc, it["label"])
        it["start0"] = dest
        it["start1"] = (dest + 1) if dest is not None else None
        print(f"  Tab {it['no']}: {it['label']} → Page {it['start1'] or 'Not Found'}")

    # Keep only items that have a valid destination
    valid = [it for it in items if it["start0"] is not None]
    # This is our **hard cap** for links - EXACTLY as many as index items with destinations
    cap = len(valid)

    # 3) Infer end pages (until next start / end of doc)
    seq = sorted(valid, key=lambda x: x["start0"])
    for i, it in enumerate(seq):
        s = it["start0"]
        e = (seq[i+1]["start0"] - 1) if i < len(seq) - 1 else (len(doc) - 1)
        it["end0"], it["end1"] = e, e + 1

    # 4) Add links **only on Index pages**, one per Index item (strict mode)
    # Determine which pages visually contain Index lines we extracted
    used_pages = list(range(idx0, min(idx0 + 1 + FOLLOW_INDEX_PAGES, len(doc))))

    # Clear any existing links on those Index pages
    for p in used_pages:
        if p >= len(doc): break
        for ln in doc[p].get_links():
            doc[p].delete_link(ln)

    # Map "number → destination start page"
    num_to_start0 = {it["no"]: it["start0"] for it in valid}

    placed = 0
    # Re-scan each Index page to get (no, bbox) for the *visible* numbered lines,
    # and place a link that jumps to the resolved start page.
    for p in used_pages:
        if placed >= cap: break
        visible_items = extract_index_items_single(doc, p)  # list of (no, label, bbox)
        page = doc[p]
        for no, _, bbox in visible_items:
            if placed >= cap:
                break
            start0 = num_to_start0.get(no)
            if start0 is None or bbox is None:
                continue
            page.add_link(rect=fitz.Rect(*bbox), page=start0, kind=fitz.LINK_GOTO)
            placed += 1

    # 5) Optional TOC strictly from the same items (no extras)
    toc = [[1, f"{it['no']}. {it['label']}", it["start1"]] for it in seq if it.get("start1")]
    if toc:
        doc.set_toc(toc)

    # 6) Save
    doc.save(pdf_out, incremental=False)

    # 7) Manifest for the UI (review panel)
    manifest = {
        "success": True,
        "index_first_page": idx0 + 1,
        "strict_index_only": STRICT_INDEX_ONLY,
        "total_tabs": len(items),
        "links_found": len(valid),
        "links_placed": placed,
        "items": [{
            "no": it["no"],
            "label": it["label"],
            "start_page": it.get("start1"),
            "end_page": it.get("end1"),
            "found": it.get("start0") is not None
        } for it in items]
    }
    with open(map_out, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    # Safety log: confirm cap respected - CRITICAL VALIDATION
    print(f"🔒 STRICT MODE: Index items: {len(items)} | valid dests: {cap} | links placed: {placed}")
    print(f"✅ Linked PDF: {pdf_out}")
    print(f"✅ Manifest: {map_out}")
    
    # ASSERT: Never exceed the number of index items
    assert placed <= len(items), f"VIOLATION: Created {placed} links but only {len(items)} index items exist!"

# ----------------- Views -----------------
def html_page(body: str) -> HTMLResponse:
    return HTMLResponse(f"""<!doctype html><html><head>
<meta charset="utf-8"/>
<title>Auto Index Linker</title>
<style>
html,body{{margin:0;height:100%;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;background:#0b0b0b;color:#fafafa}}
a{{color:#7db3ff}} button{{border:0;border-radius:10px;padding:10px 14px;background:#2d6cdf;color:#fff;cursor:pointer}}
.wrap{{max-width:980px;margin:32px auto;padding:0 16px}}
.card{{background:#131313;border:1px solid #222;border-radius:12px;padding:16px;margin-bottom:16px}}
input[type=file],input[type=number]{{color:#fff;background:#0f0f0f;border:1px solid #333;border-radius:8px;padding:8px}}
</style></head><body><div class="wrap">{body}</div></body></html>""")

@app.get("/", response_class=HTMLResponse)
def home():
    body = """
    <div class="card"><h2>Upload PDF</h2>
      <form action="/upload" method="post" enctype="multipart/form-data">
        <input type="file" name="file" accept="application/pdf" required />
        <button type="submit">Upload</button>
      </form>
    </div>"""
    if os.path.exists(PDF_IN):
        body += f"""
        <div class="card"><h2>Build Links (auto-detect ALL Index items)</h2>
          <form action="/process" method="post">
            <button type="submit">Process</button>
          </form>
          <p style="margin-top:8px;color:#bdbdbd">Finds 1..100+ items; adds clickable links on the Index itself.</p>
        </div>"""
    if os.path.exists(PDF_OUT) and os.path.exists(MAP_JSON):
        body += f"""
        <div class="card"><h2>Review</h2>
          <p><a href="/review">Open side-by-side reviewer</a></p>
          <p>Download: <a href="/files/{os.path.basename(PDF_OUT)}">linked PDF</a> · <a href="/files/{os.path.basename(MAP_JSON)}">manifest JSON</a></p>
        </div>"""
    return html_page(body)

@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        return JSONResponse({"error":"Please upload a PDF."}, status_code=400)
    with open(PDF_IN, "wb") as f: f.write(await file.read())
    for p in (PDF_OUT, MAP_JSON):
        if os.path.exists(p): os.remove(p)
    return RedirectResponse("/", status_code=303)

@app.post("/process")
def process():
    if not os.path.exists(PDF_IN): return RedirectResponse("/", status_code=303)
    try:
        build_links()
        return RedirectResponse("/review", status_code=303)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/review", response_class=HTMLResponse)
def review():
    if not (os.path.exists(PDF_OUT) and os.path.exists(MAP_JSON)): 
        return RedirectResponse("/", status_code=303)
    data = json.load(open(MAP_JSON, "r", encoding="utf-8"))
    items_html = []
    for it in data.get("items", []):
        no, label = it["no"], it["label"]
        s, e = it.get("start_page") or "", it.get("end_page") or ""
        found = it.get("found", False)
        status_color = "#22a565" if found else "#dc2626"
        status_text = "✓" if found else "✗"
        
        items_html.append(f"""
        <div style="background:#131313;border:1px solid #222;border-radius:12px;padding:12px;margin-bottom:10px">
          <div style="font-weight:600;display:flex;align-items:center;gap:8px">
            <span style="color:{status_color}">{status_text}</span>
            {no}. {label}
          </div>
          <div style="color:#bdbdbd;font-size:12px">Pages: {s}{('–'+str(e)) if e and e != s else ''}</div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <a href="/files/{os.path.basename(PDF_OUT)}#page={s}&view=FitH" target="pdfpane"><button {"disabled" if not found else ""}>Open</button></a>
            <a href="/files/{os.path.basename(PDF_OUT)}#page={s}&view=FitH" target="_blank"><button {"disabled" if not found else ""}>Open in new</button></a>
            <form action="/override" method="post" style="display:flex;gap:6px;align-items:center">
              <input type="hidden" name="no" value="{no}">
              <input name="start_page" type="number" min="1" value="{s}" placeholder="New start" style="width:90px">
              <button type="submit" style="background:#22a565">Apply & Save</button>
            </form>
          </div>
        </div>""")
    list_html = "\n".join(items_html)
    
    stats = data.get("links_found", 0)
    total = data.get("total_tabs", 0)
    
    return HTMLResponse(f"""<!doctype html><html><head><meta charset="utf-8"/>
<title>Index Reviewer</title>
<style>html,body{{margin:0;height:100%;background:#0b0b0b;color:#fafafa;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif}}
.wrap{{display:flex;height:100%}} .left{{width:520px;border-right:1px solid #222;padding:14px;overflow:auto}} .right{{flex:1}}
button:disabled{{background:#666;cursor:not-allowed}}
</style></head><body>
<div class="wrap">
  <div class="left">
    <h3>Index Items (auto-detected)</h3>
    <div style="font-size:12px;color:#9a9a9a;margin-bottom:8px">
      Found {stats}/{total} hyperlinks. Adjust any start page and click Apply & Save to regenerate links instantly.
    </div>
    {list_html}
    <div style="margin-top:12px"><a href="/">← Back</a></div>
  </div>
  <div class="right"><iframe name="pdfpane" src="/files/{os.path.basename(PDF_OUT)}#page=1&view=FitH" style="border:0;width:100%;height:100%"></iframe></div>
</div></body></html>""")

@app.post("/override")
def override(no: int = Form(...), start_page: int = Form(...)):
    if not os.path.exists(MAP_JSON): return RedirectResponse("/review", status_code=303)
    data = json.load(open(MAP_JSON, "r", encoding="utf-8"))
    for it in data["items"]:
        if int(it["no"]) == int(no):
            it["start_page"] = int(start_page)
            it["found"] = True  # mark as found since user provided page
            break
    
    # Update stats
    data["links_found"] = len([it for it in data["items"] if it.get("found", False)])
    
    with open(MAP_JSON, "w", encoding="utf-8") as f: 
        json.dump(data, f, indent=2, ensure_ascii=False)

    # re-apply links onto index pages with overrides
    doc = fitz.open(PDF_IN)
    # recompute which pages contain index numbers to place rects again
    idx = find_index_page(doc)
    if idx is None: return RedirectResponse("/review", status_code=303)
    idx0, _ = extract_index_items_multi(doc, idx)
    used_pages = list(range(idx0, min(idx0+1+FOLLOW_INDEX_PAGES, len(doc))))
    for p in used_pages:
        for ln in doc[p].get_links(): doc[p].delete_link(ln)

    # rebuild mapping number -> start0
    num_to_start0 = {}
    for it in data["items"]:
        s = it.get("start_page"); 
        if s: num_to_start0[int(it["no"])] = int(s)-1

    for p in used_pages:
        page = doc[p]
        for no, _, bbox in extract_index_items_single(doc, p):
            s0 = num_to_start0.get(no)
            if s0 is None: continue
            page.add_link(rect=fitz.Rect(*bbox), page=s0, kind=fitz.LINK_GOTO)

    doc.save(PDF_OUT, incremental=False)
    print(f"✅ Updated Tab {no} to page {start_page}")
    return RedirectResponse("/review", status_code=303)

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting Auto Index Linker on http://0.0.0.0:8000")
    print("📁 Data directory: ./data/")
    uvicorn.run(app, host="0.0.0.0", port=8000)