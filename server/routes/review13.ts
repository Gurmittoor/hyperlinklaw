import { Router } from "express";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const r = Router();

// Map the Review button "docKey" to the linker output folder
const FOLDERS: Record<string, string> = {
  supp13: path.resolve("out/review_13"),   // 13 tabs (supplemental brief)
  doc63:  path.resolve("out/review_63"),   // 63 tabs (amended doc brief)
  tr5:    path.resolve("out/review_tr5"),  // 5 tabs (trial record)
};

function readCsvRows(csvPath: string) {
  if (!fs.existsSync(csvPath)) return [];
  const content = fs.readFileSync(csvPath, "utf8").trim();
  const lines = content.split("\n");
  if (lines.length <= 1) return [];
  
  const [_, ...dataLines] = lines;
  return dataLines.filter(Boolean).map(line => {
    const parts = line.split(",");
    const [tab, briefPage, trPage, rect] = parts;
    // Check if there's a 5th column for marker info (new format)
    const isMarker = parts.length > 4 ? parts[4] === "true" : false;
    
    return {
      tab_number: Number(tab),
      brief_page: Number(briefPage),
      tr_dest_page: Number(trPage),
      rect,
      is_marker: isMarker
    };
  }).sort((a,b)=>a.tab_number-b.tab_number);
}

// Unified route for both supp13 and doc63
r.get("/api/review-links/:docKey", (req, res) => {
  const folder = FOLDERS[req.params.docKey];
  if (!folder) return res.status(404).json({ ok: false, error: "unknown docKey" });

  const csvPath = path.join(folder, "tabs.csv");
  const pdfUrl = `/out/${path.basename(folder)}/Master.TabsRange.linked.pdf`;
  
  const links = readCsvRows(csvPath);
  res.json({ ok: true, pdfUrl, total: links.length, links });
});

// Legacy route for backwards compatibility
r.get("/api/review-13", (_req, res) => {
  const csvPath = path.join(FOLDERS.supp13, "tabs.csv");
  const links = readCsvRows(csvPath);
  res.json({ ok:true, total: links.length, pdfUrl: "/out/review_13/Master.TabsRange.linked.pdf", links });
});

// Unified override route for both supp13 and doc63
r.post("/api/review-links/:docKey/override", (req, res) => {
  const folder = FOLDERS[req.params.docKey];
  if (!folder) return res.status(404).json({ ok: false, error: "unknown docKey" });

  const csvPath = path.join(folder, "tabs.csv");
  if (!fs.existsSync(csvPath)) return res.status(404).json({ ok: false, error: "links not built" });

  let body = "";
  req.on("data", c => body += c);
  req.on("end", () => {
    const { tab_number, tr_dest_page } = JSON.parse(body || "{}");
    const rows = readCsvRows(csvPath);
    const i = rows.findIndex(r => r.tab_number === Number(tab_number));
    if (i < 0) return res.status(400).json({ ok: false, error: "tab not found" });
    
    rows[i].tr_dest_page = Number(tr_dest_page);

    const header = "tab_number,brief_page,tr_dest_page,rect\n";
    fs.writeFileSync(csvPath, header + rows.map(r => [r.tab_number, r.brief_page, r.tr_dest_page, r.rect].join(",")).join("\n"));

    // Use appropriate relink script based on docKey
    const scriptName = req.params.docKey === "doc63" ? "relink_from_csv_63.py" : "relink_from_csv_13.py";
    const p = spawnSync("python", ["scripts/" + scriptName, "--folder", folder], { encoding: "utf8" });
    if (p.status !== 0) return res.status(500).json({ ok: false, error: p.stderr || "relink failed" });

    res.json({ ok: true });
  });
});

// Legacy route for backwards compatibility  
r.post("/api/review-13/override", (req, res) => {
  const csvPath = path.join(FOLDERS.supp13, "tabs.csv");
  let body = "";
  req.on("data", c => body += c);
  req.on("end", () => {
    const { tab_number, tr_dest_page } = JSON.parse(body || "{}");
    const rows = readCsvRows(csvPath);
    const i = rows.findIndex(r => r.tab_number === Number(tab_number));
    if (i < 0) return res.status(400).json({ ok:false, error:"Tab not found" });
    rows[i].tr_dest_page = Number(tr_dest_page);

    const header = "tab_number,brief_page,tr_dest_page,rect\n";
    fs.writeFileSync(csvPath, header + rows.map(r => [r.tab_number,r.brief_page,r.tr_dest_page,r.rect].join(",")).join("\n"));

    const p = spawnSync("python", ["scripts/relink_from_csv_13.py", "--folder", FOLDERS.supp13], { encoding: "utf8" });
    if (p.status !== 0) return res.status(500).json({ ok:false, error: p.stderr || "relink failed" });

    res.json({ ok:true });
  });
});

export default r;