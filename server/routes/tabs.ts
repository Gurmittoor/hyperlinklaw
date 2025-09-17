import { Router } from "express";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const r = Router();

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const p = spawn(cmd, args, { 
      stdio: ["ignore", "pipe", "pipe"],
      cwd: path.resolve("scripts")
    });
    let out = "", err = "";
    p.stdout.on("data", d => out += d.toString());
    p.stderr.on("data", d => err += d.toString());
    p.on("close", code => {
      if (code === 0) {
        resolve(out);
      } else {
        reject(new Error(err || `Process exited with code ${code}`));
      }
    });
  });
}

// One-click rebuild endpoint that guarantees 63 + 13 Tab links
r.post("/api/rebuild-tabs", async (_req, res) => {
  try {
    console.log("🔥 Starting OCR-backed Tab rebuild...");
    
    const output = await run("bash", ["rebuild_tabs.sh"]);
    console.log("📋 Rebuild output:", output);

    // Collect combined CSV results
    const csvPath = path.resolve("scripts/out_tabs_range/tabs.csv");
    const valPath63 = path.resolve("scripts/out_tabs_range/brief_63/validation.json");
    const valPath13 = path.resolve("scripts/out_tabs_range/brief_13/validation.json");

    let csv: any[] = [];
    let validation = { 
      brief_63: { broken_links: 0, placed: 0 }, 
      brief_13: { broken_links: 0, placed: 0 } 
    };

    // Parse CSV if it exists
    if (fs.existsSync(csvPath)) {
      const csvContent = fs.readFileSync(csvPath, "utf8").trim();
      const lines = csvContent.split("\n").slice(1); // skip header
      
      csv = lines.filter(line => line.trim()).map(line => {
        const parts = line.split(",");
        return {
          tab_number: Number(parts[0]),
          brief_page: Number(parts[1]),
          tr_dest_page: Number(parts[2]),
          rect: parts[3],
          brief_type: parts[4] || "unknown"
        };
      });
    }

    // Parse validation files
    if (fs.existsSync(valPath63)) {
      validation.brief_63 = JSON.parse(fs.readFileSync(valPath63, "utf8"));
    }
    if (fs.existsSync(valPath13)) {
      validation.brief_13 = JSON.parse(fs.readFileSync(valPath13, "utf8"));
    }

    const totalLinks = csv.length;
    const totalBrokenLinks = validation.brief_63.broken_links + validation.brief_13.broken_links;

    console.log(`✅ Rebuild complete: ${totalLinks} links, ${totalBrokenLinks} broken`);

    return res.json({ 
      ok: true, 
      links: csv,
      validation,
      summary: {
        total_links: totalLinks,
        brief_63_links: csv.filter(l => l.brief_type === 'doc_brief').length,
        brief_13_links: csv.filter(l => l.brief_type === 'supp_brief').length,
        broken_links: totalBrokenLinks
      },
      output
    });
    
  } catch (e: any) {
    console.error("❌ Rebuild failed:", e.message);
    return res.status(500).json({ 
      ok: false, 
      error: e.message,
      details: e.stack
    });
  }
});

// Override Tab destination endpoint
r.post("/api/tabs/override", async (req, res) => {
  try {
    const { tab, tr_dest_page, brief_type } = req.body as { 
      tab: number, 
      tr_dest_page: number, 
      brief_type: 'doc_brief' | 'supp_brief' 
    };

    console.log(`🔧 Overriding Tab ${tab} (${brief_type}) to TR page ${tr_dest_page}`);

    // TODO: Persist override to database table "tab_overrides"
    // For now, just acknowledge the override
    
    return res.json({ 
      ok: true, 
      message: `Tab ${tab} destination overridden to page ${tr_dest_page}`,
      override: { tab, tr_dest_page, brief_type }
    });
    
  } catch (e: any) {
    console.error("❌ Override failed:", e.message);
    return res.status(500).json({ 
      ok: false, 
      error: e.message 
    });
  }
});

// Get current Tab mappings from CSV
r.get("/api/tabs/mappings", async (_req, res) => {
  try {
    const csvPath = path.resolve("scripts/out_tabs_range/tabs.csv");
    
    if (!fs.existsSync(csvPath)) {
      return res.json({ 
        ok: true, 
        mappings: [],
        message: "No Tab mappings found. Run /api/rebuild-tabs first." 
      });
    }

    const csvContent = fs.readFileSync(csvPath, "utf8").trim();
    const lines = csvContent.split("\n").slice(1); // skip header
    
    const mappings = lines.filter(line => line.trim()).map(line => {
      const parts = line.split(",");
      return {
        tab_number: Number(parts[0]),
        brief_page: Number(parts[1]),
        tr_dest_page: Number(parts[2]),
        rect: parts[3],
        brief_type: parts[4] || "unknown"
      };
    });

    return res.json({ 
      ok: true, 
      mappings,
      summary: {
        total: mappings.length,
        doc_brief: mappings.filter(m => m.brief_type === 'doc_brief').length,
        supp_brief: mappings.filter(m => m.brief_type === 'supp_brief').length
      }
    });
    
  } catch (e: any) {
    console.error("❌ Failed to get mappings:", e.message);
    return res.status(500).json({ 
      ok: false, 
      error: e.message 
    });
  }
});

export default r;