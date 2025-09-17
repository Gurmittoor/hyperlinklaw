#!/usr/bin/env python3
import argparse, os, csv, json, fitz

ap = argparse.ArgumentParser()
ap.add_argument("--folder", required=True)
args = ap.parse_args()

folder = args.folder
csv_path = os.path.join(folder, "TR_Subrule13_links.csv")
pdf_path = os.path.join(folder, "TR_Subrule13_indexed.pdf")

rows = []
with open(csv_path, newline="", encoding="utf-8") as f:
    r = csv.DictReader(f)
    for row in r:
        rect = [float(x) for x in row["rect"].strip("[]").split(",")]
        rows.append({
            "doc_number": int(row["doc_number"]),
            "dest_page": int(row["tr_page"]),  # TR page (1-indexed in PDF, add 1 for index page offset)
            "rect": rect
        })

doc = fitz.open(pdf_path)

# Clear old GoTo links on index page (page 0), then insert new ones from CSV
index_page = doc[0]
for L in (index_page.get_links() or []):
    if L.get("kind") == fitz.LINK_GOTO:
        index_page.delete_link(L)

for row in rows:
    # Link from index page (page 0) to TR page + 1 (accounting for index page offset)
    index_page.insert_link({
        "kind": fitz.LINK_GOTO, 
        "from": fitz.Rect(*row["rect"]), 
        "page": row["dest_page"], # TR page already in PDF coordinates
        "zoom": 0
    })

doc.save(pdf_path, incremental=True)
doc.close()
print(json.dumps({ "ok": True, "relinked": len(rows) }))