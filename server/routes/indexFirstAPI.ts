import { Router } from "express";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const r = Router();

// New API endpoint to trigger index-first detection
r.post("/api/index-first-detection", (req, res) => {
  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", async () => {
    try {
      const { briefPath, trialRecordPath, outputDir } = JSON.parse(body);
      
      if (!briefPath || !trialRecordPath || !outputDir) {
        return res.status(400).json({ 
          ok: false, 
          error: "Missing required parameters: briefPath, trialRecordPath, outputDir" 
        });
      }

      // Check if files exist
      if (!fs.existsSync(briefPath)) {
        return res.status(400).json({ ok: false, error: `Brief file not found: ${briefPath}` });
      }
      
      if (!fs.existsSync(trialRecordPath)) {
        return res.status(400).json({ ok: false, error: `Trial record not found: ${trialRecordPath}` });
      }

      // Run the index-first detector
      const pythonProcess = spawn("python", [
        "server/services/indexFirstDetector.py",
        "--brief", briefPath,
        "--trial", trialRecordPath,
        "--output", outputDir,
        "--config", "config/linking.json"
      ]);

      let stdout = "";
      let stderr = "";

      pythonProcess.stdout.on("data", (data) => {
        stdout += data.toString();
        console.log(data.toString());
      });

      pythonProcess.stderr.on("data", (data) => {
        stderr += data.toString();
        console.error(data.toString());
      });

      pythonProcess.on("close", (code) => {
        if (code === 0) {
          // Success - load the validation report
          const validationPath = path.join(outputDir, "validation.json");
          const reviewPath = path.join(outputDir, "review.json");
          
          let validation = {};
          let review = {};
          
          try {
            if (fs.existsSync(validationPath)) {
              validation = JSON.parse(fs.readFileSync(validationPath, "utf8"));
            }
            if (fs.existsSync(reviewPath)) {
              review = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
            }
          } catch (error) {
            console.error("Error loading result files:", error);
          }
          
          res.json({
            ok: true,
            message: "Index-first detection completed successfully",
            validation,
            review,
            stdout,
            outputDir
          });
        } else {
          res.status(500).json({
            ok: false,
            error: "Index-first detection failed",
            code,
            stdout,
            stderr
          });
        }
      });

    } catch (error) {
      console.error("Error in index-first detection:", error);
      res.status(500).json({ 
        ok: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
});

// Get configuration for a specific document
r.get("/api/linking-config/:filename", (req, res) => {
  try {
    const configPath = "config/linking.json";
    let config = {};
    
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
    
    const filename = decodeURIComponent(req.params.filename);
    const documentConfig = getDocumentConfig(config, filename);
    
    res.json({
      ok: true,
      filename,
      config: documentConfig,
      allConfigs: config
    });
    
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load config"
    });
  }
});

// Update configuration for a specific document
r.post("/api/linking-config/:filename", (req, res) => {
  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", () => {
    try {
      const filename = decodeURIComponent(req.params.filename);
      const { scan_first_pages, expected_tabs } = JSON.parse(body);
      
      const configPath = "config/linking.json";
      let config = {};
      
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      }
      
      config[filename] = {
        scan_first_pages: Number(scan_first_pages),
        expected_tabs: Number(expected_tabs)
      };
      
      // Ensure config directory exists
      const configDir = path.dirname(configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      
      res.json({
        ok: true,
        message: "Configuration updated successfully",
        filename,
        config: config[filename]
      });
      
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "Failed to update config"
      });
    }
  });
});

// Helper function to get document configuration with fallbacks
function getDocumentConfig(config: any, filename: string) {
  const defaultConfig = {
    scan_first_pages: 10,
    expected_tabs: 0
  };
  
  // Try exact filename match first
  if (config[filename]) {
    return { ...defaultConfig, ...config[filename] };
  }
  
  // Try partial filename matching
  for (const configFilename in config) {
    if (configFilename.toLowerCase().includes(filename.toLowerCase()) || 
        filename.toLowerCase().includes(configFilename.toLowerCase())) {
      return { ...defaultConfig, ...config[configFilename] };
    }
  }
  
  return defaultConfig;
}

export default r;