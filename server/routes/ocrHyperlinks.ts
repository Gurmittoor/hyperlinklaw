import { Router } from "express";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const r = Router();

r.post("/api/ocr-hyperlink-detection", (req, res) => {
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

      console.log(`🔍 Starting OCR hyperlink detection for: ${pdfPath}`);

      // Prepare output paths
      const outputDir = path.dirname(outputPath || pdfPath);
      const baseName = path.basename(pdfPath, '.pdf');
      const linkedPdfPath = outputPath || path.join(outputDir, `${baseName}_linked.pdf`);
      const resultsJsonPath = path.join(outputDir, `${baseName}_ocr_results.json`);

      // Run the enhanced OCR detection script
      const pythonProcess = spawn("python3", [
        "server/services/makeIndexLinks.py",
        "--input", pdfPath,
        "--output", linkedPdfPath,
        "--json", resultsJsonPath
      ]);

      let stdout = "";
      let stderr = "";

      pythonProcess.stdout.on("data", (data) => {
        const output = data.toString();
        stdout += output;
        console.log(`OCR: ${output.trim()}`);
      });

      pythonProcess.stderr.on("data", (data) => {
        const error = data.toString();
        stderr += error;
        console.error(`OCR Error: ${error.trim()}`);
      });

      pythonProcess.on("close", (code) => {
        if (code === 0) {
          // Success - load the results
          let results = {};
          
          try {
            if (fs.existsSync(resultsJsonPath)) {
              results = JSON.parse(fs.readFileSync(resultsJsonPath, "utf8"));
            }
          } catch (error) {
            console.error("Error loading OCR results:", error);
          }
          
          res.json({
            ok: true,
            message: "OCR hyperlink detection completed successfully",
            results,
            linkedPdfPath,
            stdout
          });
        } else {
          res.status(500).json({
            ok: false,
            error: "OCR hyperlink detection failed",
            code,
            stdout,
            stderr
          });
        }
      });

    } catch (error) {
      console.error("Error in OCR hyperlink detection:", error);
      res.status(500).json({ 
        ok: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
});

// Get OCR results for a previously processed document
r.get("/api/ocr-results/:filename", (req, res) => {
  try {
    const filename = req.params.filename;
    const resultsPath = path.join("uploads", `${filename}_ocr_results.json`);
    
    if (!fs.existsSync(resultsPath)) {
      return res.status(404).json({
        ok: false,
        error: "OCR results not found for this document"
      });
    }
    
    const results = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
    res.json({
      ok: true,
      results
    });
    
  } catch (error) {
    console.error("Error retrieving OCR results:", error);
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to retrieve OCR results"
    });
  }
});

export default r;