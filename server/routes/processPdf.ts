import { Router } from "express";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const r = Router();

// Enhanced PDF processing with auto-detection
r.post("/api/process-pdf", (req, res) => {
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

      if (!fs.existsSync(pdfPath)) {
        return res.status(400).json({ 
          ok: false, 
          error: `PDF file not found: ${pdfPath}` 
        });
      }

      console.log(`🔍 Starting enhanced PDF processing for: ${pdfPath}`);

      // Prepare output paths
      const outputDir = path.dirname(pdfPath);
      const baseName = path.basename(pdfPath, '.pdf');
      const linkedPdfPath = outputPath || path.join(outputDir, `${baseName}_linked.pdf`);
      const manifestPath = path.join(outputDir, `${baseName}_index_map.json`);

      // Run the enhanced processor
      const pythonProcess = spawn("python3", [
        "server/services/processPdf.py",
        "--input", pdfPath,
        "--output", linkedPdfPath,
        "--manifest", manifestPath
      ]);

      let stdout = "";
      let stderr = "";

      pythonProcess.stdout.on("data", (data) => {
        const output = data.toString();
        stdout += output;
        console.log(`PDF Processor: ${output.trim()}`);
      });

      pythonProcess.stderr.on("data", (data) => {
        const error = data.toString();
        stderr += error;
        console.error(`PDF Processor Error: ${error.trim()}`);
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
            console.error("Error loading manifest:", error);
          }
          
          res.json({
            ok: true,
            message: "PDF processing completed successfully",
            manifest,
            linkedPdfPath,
            manifestPath,
            stdout
          });
        } else {
          res.status(500).json({
            ok: false,
            error: "PDF processing failed",
            code,
            stdout,
            stderr
          });
        }
      });

    } catch (error) {
      console.error("Error in PDF processing:", error);
      res.status(500).json({ 
        ok: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
});

// Override tab page and regenerate links
r.post("/api/regenerate-links", (req, res) => {
  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", async () => {
    try {
      const { pdfPath, manifestPath, tabNo, newPage } = JSON.parse(body);
      
      if (!pdfPath || !manifestPath || !tabNo || !newPage) {
        return res.status(400).json({ 
          ok: false, 
          error: "Missing required parameters: pdfPath, manifestPath, tabNo, newPage" 
        });
      }

      console.log(`🔄 Regenerating links for Tab ${tabNo} -> Page ${newPage}`);

      const outputDir = path.dirname(pdfPath);
      const baseName = path.basename(pdfPath, '.pdf');
      const linkedPdfPath = path.join(outputDir, `${baseName}_linked.pdf`);

      // Run the regenerate script
      const pythonProcess = spawn("python3", [
        "server/services/regenerateLinks.py",
        "--input", pdfPath,
        "--manifest", manifestPath,
        "--output", linkedPdfPath,
        "--tab-no", tabNo.toString(),
        "--new-page", newPage.toString()
      ]);

      let stdout = "";
      let stderr = "";

      pythonProcess.stdout.on("data", (data) => {
        const output = data.toString();
        stdout += output;
        console.log(`Regenerate: ${output.trim()}`);
      });

      pythonProcess.stderr.on("data", (data) => {
        const error = data.toString();
        stderr += error;
        console.error(`Regenerate Error: ${error.trim()}`);
      });

      pythonProcess.on("close", (code) => {
        if (code === 0) {
          // Success - reload manifest
          let manifest = {};
          
          try {
            if (fs.existsSync(manifestPath)) {
              manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
            }
          } catch (error) {
            console.error("Error loading updated manifest:", error);
          }
          
          res.json({
            ok: true,
            message: `Tab ${tabNo} updated to page ${newPage}`,
            manifest,
            linkedPdfPath,
            stdout
          });
        } else {
          res.status(500).json({
            ok: false,
            error: "Link regeneration failed",
            code,
            stdout,
            stderr
          });
        }
      });

    } catch (error) {
      console.error("Error in link regeneration:", error);
      res.status(500).json({ 
        ok: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
});

export default r;