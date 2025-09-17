import { Router } from "express";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { db } from "../db.js";
import { exhibits } from "../../shared/schema.js";
import { eq } from "drizzle-orm";

const r = Router();

// Map a UI docKey → folder produced by the linker
const FOLDERS: Record<string,string> = {
  supp13: path.resolve("out/review_13"),   // 13 tabs for Supplemental Brief
  doc63: path.resolve("out/review_63"),    // 63 tabs for Doc Brief
  trial13: path.resolve("out/tr_subrule13"), // 13 subrule docs for Trial Record
};

r.get("/api/review-links/:docKey", async (req, res) => {
  const key = req.params.docKey;
  const folder = FOLDERS[key];
  if (!folder) return res.status(404).json({ ok:false, error:"unknown docKey" });

  const csvPath = path.join(folder, key === "trial13" ? "Subrule13.csv" : "tabs.csv");
  let pdfUrl  = `/out/${path.basename(folder)}/${key === "trial13" ? "TR_Subrule13_indexed.pdf" : "Master.TabsRange.linked.pdf"}`;
  
  let links: any[] = [];
  let exhibitLinks: any[] = [];
  
  // Handle tab links from CSV (existing functionality)
  if (fs.existsSync(csvPath)) {
    const [_, ...lines] = fs.readFileSync(csvPath, "utf8").trim().split("\n");
    
    if (key === "trial13") {
      // Different format for trial record subrules
      links = lines.filter(Boolean).map(line => {
        const [label, tr_page] = line.split(",");
        return { label, tr_page: Number(tr_page), type: 'tab' };
      });
    } else {
      // Standard format for briefs
      links = lines.filter(Boolean).map(line => {
        const [tab_number, brief_page, tr_dest_page, rect] = line.split(",");
        return {
          tab_number: Number(tab_number),
          brief_page: Number(brief_page),
          tr_dest_page: Number(tr_dest_page),
          rect,
          type: 'tab'
        };
      }).sort((a,b)=>a.tab_number-b.tab_number);
    }
  }
  
  // For doc63 (86-page document), filter to only 4 tabs and fetch exhibits from database
  if (key === "doc63") {
    const doc63DocumentId = "b5d731f8-1f87-451b-96ba-c4a38bd33fbe"; // 86-page document
    const doc63CaseId = "402a559a-f1d2-46e0-aee5-b72fb2a74311";
    
    // Update PDF URL to point to the correct 86-page document
    pdfUrl = `/online/pdf/${doc63CaseId}/${doc63DocumentId}`;
    
    // Filter links to only first 4 tabs for 86-page document
    links = links.slice(0, 4);
    
    try {
      // Get exhibit hyperlinks from database
      const exhibitData = await db.select({
        exhibit_label: exhibits.exhibitLabel,
        exhibit_title: exhibits.exhibitTitle,
        page_number: exhibits.pageNumber
      })
      .from(exhibits)
      .where(eq(exhibits.documentId, doc63DocumentId))
      .orderBy(exhibits.pageNumber);
      
      // Transform exhibit data to match link format
      exhibitLinks = exhibitData.map(exhibit => ({
        tab_number: exhibit.exhibit_label, // Use exhibit label as identifier
        brief_page: exhibit.page_number,
        tr_dest_page: exhibit.page_number,
        type: 'exhibit',
        title: exhibit.exhibit_title || `Exhibit ${exhibit.exhibit_label}`,
        rect: null
      }));
    } catch (error) {
      console.error("Error fetching exhibits:", error);
    }
  }
  
  // Combine tabs and exhibits
  const allLinks = [...links, ...exhibitLinks];
  
  res.json({ 
    ok: true, 
    total: allLinks.length, 
    pdfUrl, 
    links: allLinks,
    tabCount: links.length,
    exhibitCount: exhibitLinks.length
  });
});

// Allow inline edits → relink without OCR rerun
r.post("/api/review-links/:docKey/override", (req, res) => {
  const key = req.params.docKey;
  const folder = FOLDERS[key];
  if (!folder) return res.status(404).json({ ok:false, error:"unknown docKey" });

  let body = "";
  req.on("data", c => body += c);
  req.on("end", () => {
    const { tab_number, tr_dest_page, doc_number, tr_page } = JSON.parse(body || "{}");
    const csvPath = path.join(folder, key === "trial13" ? "Subrule13.csv" : "tabs.csv");
    if (!fs.existsSync(csvPath)) return res.status(404).json({ ok:false, error:"links not built" });

    const [header, ...rows] = fs.readFileSync(csvPath, "utf8").trim().split("\n");
    
    let updated;
    if (key === "trial13") {
      // Trial record format: label,tr_page
      updated = rows.map(line => {
        const [label, page] = line.split(",");
        if (label.includes(`Doc ${doc_number}`)) return [label, String(tr_page)].join(",");
        return line;
      });
    } else {
      // Brief format: tab_number,brief_page,tr_dest_page,rect
      updated = rows.map(line => {
        const [tab, b, t, rect] = line.split(",");
        if (Number(tab) === Number(tab_number)) return [tab, b, String(tr_dest_page), rect].join(",");
        return line;
      });
    }
    
    fs.writeFileSync(csvPath, [header, ...updated].join("\n"), "utf8");

    // Fast relink based on document type
    let script;
    if (key === "trial13") {
      script = "scripts/relink_subrules.py";
    } else if (key === "supp13") {
      script = "scripts/relink_from_csv_13.py";
    } else if (key === "doc63") {
      script = "scripts/relink_from_csv_63.py";
    }

    if (script) {
      const p = spawnSync("python", [script, "--folder", folder], { encoding:"utf8" });
      if (p.status !== 0) return res.status(500).json({ ok:false, error: p.stderr || "relink failed" });
    }

    res.json({ ok:true });
  });
});

export default r;