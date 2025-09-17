import { Router } from "express";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const r = Router();

// Trigger deterministic rebuild of all three document types
r.post("/api/rebuild-deterministic", (req, res) => {
  console.log("🚀 Starting deterministic rebuild...");
  
  const scriptPath = path.resolve("scripts/rebuild_index_deterministic.sh");
  
  if (!fs.existsSync(scriptPath)) {
    return res.status(500).json({
      ok: false,
      error: "Rebuild script not found"
    });
  }
  
  // Make script executable
  try {
    fs.chmodSync(scriptPath, '755');
  } catch (error) {
    console.error("Could not make script executable:", error);
  }
  
  const childProcess = spawn('bash', [scriptPath], {
    stdio: 'pipe',
    env: { ...process.env, PATH: process.env.PATH }
  });
  
  let stdout = '';
  let stderr = '';
  
  childProcess.stdout.on('data', (data) => {
    const output = data.toString();
    stdout += output;
    console.log(output);
  });
  
  childProcess.stderr.on('data', (data) => {
    const output = data.toString();
    stderr += output;
    console.error(output);
  });
  
  childProcess.on('close', (code) => {
    if (code === 0) {
      // Success - load results from all three folders
      const results = {
        supp13: loadFolderResults('out/review_13'),
        doc63: loadFolderResults('out/review_63'),
        tr5: loadFolderResults('out/review_tr5')
      };
      
      res.json({
        ok: true,
        message: "Deterministic rebuild completed successfully",
        results,
        stdout,
        totalLinks: (results.supp13?.total || 0) + (results.doc63?.total || 0) + (results.tr5?.total || 0)
      });
    } else {
      res.status(500).json({
        ok: false,
        error: "Deterministic rebuild failed",
        code,
        stdout,
        stderr
      });
    }
  });
});

// Build document with dynamic hyperlink detection
r.post("/api/build-document-dynamic", (req, res) => {
  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", () => {
    const { briefPath, trialPath, indexPages, outputDir, indexOnly, reviewJson } = JSON.parse(body || "{}");
    
    if (!briefPath) {
      return res.status(400).json({ ok: false, error: "Brief path is required" });
    }
    
    // Generate unique output directory if not provided
    const finalOutputDir = outputDir || `out/dynamic_${Date.now()}`;
    
    let args = ["scripts/dynamic_hyperlink_processor.py", "--brief", briefPath];
    
    if (trialPath) {
      args.push("--trial", trialPath);
    }
    
    if (indexPages) {
      args.push("--index_pages", indexPages);
    }
    
    args.push("--out_dir", finalOutputDir);
    
    if (indexOnly) {
      args.push("--index_only");
    }
    
    if (reviewJson) {
      args.push("--review_json");
    }
    
    args.push("--verbose");
    
    console.log(`🔧 Processing document dynamically:`, "python", args.join(" "));
    
    const childProcess = spawn('python', args, { stdio: 'pipe' });
    
    let stdout = '';
    let stderr = '';
    
    childProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log(output);
    });
    
    childProcess.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      console.error(output);
    });
    
    childProcess.on('close', (code) => {
      if (code === 0) {
        const results = loadFolderResults(finalOutputDir);
        res.json({
          ok: true,
          message: "Dynamic document processing completed successfully",
          results,
          stdout,
          outputDir: finalOutputDir
        });
      } else {
        res.status(500).json({
          ok: false,
          error: "Dynamic document processing failed",
          code,
          stdout,
          stderr,
          outputDir: finalOutputDir
        });
      }
    });
  });
});

// Detect index items in a document (preview mode)
r.post("/api/detect-index", (req, res) => {
  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", () => {
    const { documentPath, indexPages } = JSON.parse(body || "{}");
    
    if (!documentPath) {
      return res.status(400).json({ ok: false, error: "Document path is required" });
    }
    
    let args = ["scripts/dynamic_index_detector.py", "--document", documentPath, "--verbose"];
    
    if (indexPages) {
      args.push("--index_pages", indexPages);
    }
    
    console.log(`🔍 Detecting index items in:`, "python", args.join(" "));
    
    const childProcess = spawn('python', args, { stdio: 'pipe' });
    
    let stdout = '';
    let stderr = '';
    
    childProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log(output);
    });
    
    childProcess.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      console.error(output);
    });
    
    childProcess.on('close', (code) => {
      if (code === 0) {
        try {
          // Parse the JSON output from the script
          const lines = stdout.split('\n');
          let jsonOutput = '';
          let inJsonSection = false;
          
          for (const line of lines) {
            if (line.trim().startsWith('{')) {
              inJsonSection = true;
            }
            if (inJsonSection) {
              jsonOutput += line + '\n';
            }
          }
          
          const result = JSON.parse(jsonOutput);
          res.json({
            ok: true,
            message: "Index detection completed successfully",
            ...result,
            stdout
          });
        } catch (parseError) {
          res.json({
            ok: true,
            message: "Index detection completed successfully",
            raw_output: stdout,
            parse_error: String(parseError)
          });
        }
      } else {
        res.status(500).json({
          ok: false,
          error: "Index detection failed",
          code,
          stdout,
          stderr
        });
      }
    });
  });
});

// Get status of all document builds
r.get("/api/deterministic-status", (req, res) => {
  const status = {
    supp13: getFolderStatus('out/review_13'),
    doc63: getFolderStatus('out/review_63'),
    tr5: getFolderStatus('out/review_tr5')
  };
  
  const totalLinks = status.supp13.total + status.doc63.total + status.tr5.total;
  
  res.json({
    ok: true,
    status,
    totalLinks,
    allBuilt: status.supp13.built && status.doc63.built && status.tr5.built
  });
});

function loadFolderResults(folderPath: string) {
  try {
    const reviewPath = path.join(folderPath, "review.json");
    const validationPath = path.join(folderPath, "validation.json");
    
    let review = null;
    let validation = null;
    
    if (fs.existsSync(reviewPath)) {
      review = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
    }
    
    if (fs.existsSync(validationPath)) {
      validation = JSON.parse(fs.readFileSync(validationPath, "utf8"));
    }
    
    return { review, validation, total: review?.total || 0 };
  } catch (error) {
    console.error(`Error loading results from ${folderPath}:`, error);
    return { review: null, validation: null, total: 0 };
  }
}

function getFolderStatus(folderPath: string) {
  const reviewPath = path.join(folderPath, "review.json");
  const masterPath = path.join(folderPath, "Master.TabsRange.linked.pdf");
  
  const built = fs.existsSync(reviewPath) && fs.existsSync(masterPath);
  
  let total = 0;
  if (built) {
    try {
      const review = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
      total = review.total || 0;
    } catch (error) {
      console.error(`Error reading review.json from ${folderPath}:`, error);
    }
  }
  
  return { built, total };
}

export default r;