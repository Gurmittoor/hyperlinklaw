#!/usr/bin/env python3
import argparse, os, csv, json, fitz

ap = argparse.ArgumentParser()
ap.add_argument("--folder", required=True)
args = ap.parse_args()

folder = args.folder
csv_path = os.path.join(folder, "tabs.csv")
pdf_path = os.path.join(folder, "Master.TabsRange.linked.pdf")
val_path = os.path.join(folder, "validation.json")

with open(val_path, "r", encoding="utf-8") as f:
    val = json.load(f)
B = val["report"]["brief_total_pages"]  # brief page count (offset to TR)

rows = []
with open(csv_path, newline="", encoding="utf-8") as f:
    r = csv.DictReader(f)
    for row in r:
        rect = [float(x) for x in row["rect"].strip("[]").split(",")]
        rows.append({
            "brief_page0": int(row["brief_page"]) - 1,
            "dest_global": B + int(row["tr_dest_page"]) - 1,
            "rect": rect
        })

doc = fitz.open(pdf_path)
for row in rows:
    p = doc[row["brief_page0"]]
    for L in (p.get_links() or []):
        if L.get("kind") == fitz.LINK_GOTO:
            p.delete_link(L)
    p.insert_link({"kind": fitz.LINK_GOTO, "from": fitz.Rect(*row["rect"]), "page": row["dest_global"], "zoom": 0})
doc.save(pdf_path, incremental=True)
doc.close()
print(json.dumps({ "ok": True, "relinked": len(rows) }))