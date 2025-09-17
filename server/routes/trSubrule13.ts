import { Router } from "express";
import fs from "fs";
import path from "path";

const r = Router();
const FOLDER = path.resolve("out/tr_subrule13");

r.get("/api/tr/subrule13", (_req, res) => {
  const csv = path.join(FOLDER, "Subrule13.csv");
  const pdf = "/out/tr_subrule13/TR_Subrule13_indexed.pdf";
  
  if (!fs.existsSync(csv)) {
    return res.status(404).json({ ok: false, error: "build first" });
  }
  
  const [_, ...lines] = fs.readFileSync(csv, "utf8").trim().split("\n");
  const links = lines.map(l => {
    const [label, page] = l.split(",");
    return { label, tr_page: Number(page) };
  });
  
  res.json({ ok: true, total: links.length, pdfUrl: pdf, links });
});

export default r;