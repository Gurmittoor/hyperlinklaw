import { Router } from "express";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const r = Router();

r.post("/api/auto-detection", (req, res) => {
  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", async () => {
    try {
      const { pdfPath, outputPath } = JSON.parse(body);
      
      if (!pdfPath) {
        return res.status(400).json({ 
          ok: false, 
          error: "Missing required parameter: pdfPath" 
        });
      }

      // Check if input file exists
      if (!fs.existsSync(pdfPath)) {
        return res.status(400).json({ 
          ok: false, 
          error: `PDF file not found: ${pdfPath}` 
        });
      }

      console.log(`🔍 Starting auto-detection for: ${pdfPath}`);

      // Prepare output paths
      const outputDir = path.dirname(pdfPath);
      const baseName = path.basename(pdfPath, '.pdf');
      const linkedPdfPath = outputPath || path.join(outputDir, `${baseName}_linked.pdf`);
      const manifestPath = path.join(outputDir, `${baseName}_index_manifest.json`);

      // Run the auto-detection script
      const pythonProcess = spawn("python3", [
        "server/services/autoIndexDetector.py",
        "--input", pdfPath,
        "--output", linkedPdfPath,
        "--json", manifestPath
      ]);

      let stdout = "";
      let stderr = "";

      pythonProcess.stdout.on("data", (data) => {
        const output = data.toString();
        stdout += output;
        console.log(`Auto-Detection: ${output.trim()}`);
      });

      pythonProcess.stderr.on("data", (data) => {
        const error = data.toString();
        stderr += error;
        console.error(`Auto-Detection Error: ${error.trim()}`);
      });

      pythonProcess.on("close", (code) => {
        if (code === 0) {
          // Success - load the manifest
          let manifest = {};
          
          try {
            if (fs.existsSync(manifestPath)) {
              manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
            }
          } catch (error) {
            console.error("Error loading auto-detection manifest:", error);
          }
          
          res.json({
            ok: true,
            message: "Auto-detection completed successfully",
            manifest,
            linkedPdfPath,
            manifestPath,
            stdout
          });
        } else {
          res.status(500).json({
            ok: false,
            error: "Auto-detection failed",
            code,
            stdout,
            stderr
          });
        }
      });

    } catch (error) {
      console.error("Error in auto-detection:", error);
      res.status(500).json({ 
        ok: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
});

// Get auto-detection manifest for a document
r.get("/api/auto-detection/:filename", (req, res) => {
  try {
    const filename = req.params.filename;
    const manifestPath = path.join("uploads", `${filename}_index_manifest.json`);
    
    if (!fs.existsSync(manifestPath)) {
      return res.status(404).json({
        ok: false,
        error: "Auto-detection manifest not found for this document"
      });
    }
    
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    res.json({
      ok: true,
      manifest
    });
    
  } catch (error) {
    console.error("Error retrieving auto-detection manifest:", error);
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to retrieve manifest"
    });
  }
});

export default r;