import { Router } from "express";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const r = Router();
const FOLDER = path.resolve("out/review_63");
const CSV = path.join(FOLDER, "tabs.csv");

function readCsv() {
  if (!fs.existsSync(CSV)) return [];
  const [_, ...lines] = fs.readFileSync(CSV, "utf8").trim().split("\n");
  return lines.filter(Boolean).map(line => {
    const [tab, briefPage, trPage, rect] = line.split(",");
    return {
      tab_number: Number(tab),
      brief_page: Number(briefPage),
      tr_dest_page: Number(trPage),
      rect
    };
  }).sort((a,b)=>a.tab_number-b.tab_number);
}

r.get("/api/review-63", (_req, res) => {
  const links = readCsv();
  res.json({
    ok: true,
    total: links.length,
    pdfUrl: "/out/review_63/Master.TabsRange.linked.pdf",
    links
  });
});

// override TR page for one Tab, then relink the PDF fast (no OCR rerun)
r.post("/api/review-63/override", (req, res) => {
  let body = "";
  req.on("data", c => body += c);
  req.on("end", () => {
    const { tab_number, tr_dest_page } = JSON.parse(body || "{}");
    const rows = readCsv();
    const i = rows.findIndex(r => r.tab_number === Number(tab_number));
    if (i < 0) return res.status(400).json({ ok:false, error:"Tab not found" });

    rows[i].tr_dest_page = Number(tr_dest_page);
    const header = "tab_number,brief_page,tr_dest_page,rect\n";
    fs.writeFileSync(
      path.join(FOLDER, "tabs.csv"),
      header + rows.map(r => [r.tab_number,r.brief_page,r.tr_dest_page,r.rect].join(",")).join("\n"),
      "utf8"
    );

    const p = spawnSync("python", ["scripts/relink_from_csv_63.py", "--folder", FOLDER], { encoding:"utf8" });
    if (p.status !== 0) return res.status(500).json({ ok:false, error: p.stderr || "relink failed" });
    res.json({ ok:true });
  });
});

export default r;