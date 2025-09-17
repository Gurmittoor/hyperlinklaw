import { Router } from "express";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const r = Router();
const FOLDER = path.resolve("out/review_subrules");
const CSV = path.join(FOLDER, "TR_Subrule13_links.csv");

function readCsv() {
  if (!fs.existsSync(CSV)) return [];
  const [_, ...lines] = fs.readFileSync(CSV, "utf8").trim().split("\n");
  return lines.filter(Boolean).map(line => {
    const [doc_number, tr_page, rect] = line.split(",");
    return {
      doc_number: Number(doc_number),
      tr_page: Number(tr_page),
      rect
    };
  }).sort((a,b)=>a.doc_number-b.doc_number);
}

r.get("/api/review-subrules", (_req, res) => {
  const links = readCsv();
  res.json({
    ok: true,
    total: links.length,
    pdfUrl: "/out/review_subrules/TR_Subrule13_indexed.pdf",
    links
  });
});

// override TR page for one Subrule Doc, then relink the PDF fast
r.post("/api/review-subrules/override", (req, res) => {
  let body = "";
  req.on("data", c => body += c);
  req.on("end", () => {
    const { doc_number, tr_page } = JSON.parse(body || "{}");
    const rows = readCsv();
    const i = rows.findIndex(r => r.doc_number === Number(doc_number));
    if (i < 0) return res.status(400).json({ ok:false, error:"Subrule Doc not found" });

    rows[i].tr_page = Number(tr_page);
    const header = "doc_number,tr_page,rect\n";
    fs.writeFileSync(
      path.join(FOLDER, "TR_Subrule13_links.csv"),
      header + rows.map(r => [r.doc_number,r.tr_page,r.rect].join(",")).join("\n"),
      "utf8"
    );

    const p = spawnSync("python", ["scripts/relink_subrules.py", "--folder", FOLDER], { encoding:"utf8" });
    if (p.status !== 0) return res.status(500).json({ ok:false, error: p.stderr || "relink failed" });
    res.json({ ok:true });
  });
});

export default r;