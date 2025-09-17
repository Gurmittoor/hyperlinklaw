// OCR Hyperlink Detection Integration for PDF Processor
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class OCRHyperlinkDetector {
  async detectLinks(pdfPath, document) {
    return new Promise((resolve, reject) => {
      const outputDir = path.dirname(pdfPath);
      const baseName = path.basename(pdfPath, '.pdf');
      const resultsJsonPath = path.join(outputDir, `${baseName}_ocr_results.json`);

      console.log(`🔍 Starting OCR detection for: ${pdfPath}`);

      const pythonProcess = spawn('python3', [
        'server/services/ocrHyperlinkDetector.py',
        '--input', pdfPath,
        '--json', resultsJsonPath
      ]);

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(`OCR: ${data.toString().trim()}`);
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error(`OCR Error: ${data.toString().trim()}`);
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            if (fs.existsSync(resultsJsonPath)) {
              const results = JSON.parse(fs.readFileSync(resultsJsonPath, 'utf8'));
              
              // Convert OCR results to InsertLink format
              const links = results.links?.map(link => ({
                caseId: document.caseId,
                srcDocId: document.id,
                targetDocId: document.id, // Same document for now
                srcPage: link.source_page,
                targetPage: link.target_page,
                srcText: link.text,
                targetText: link.text,
                linkType: 'pleading',
                status: 'pending',
                confidence: 0.9,
                reviewedAt: null,
                createdAt: new Date(),
                updatedAt: new Date()
              })) || [];

              console.log(`✅ OCR detected ${links.length} hyperlinks`);
              resolve(links);
            } else {
              resolve([]);
            }
          } catch (error) {
            console.error('Error parsing OCR results:', error);
            resolve([]);
          }
        } else {
          console.error(`OCR process failed with code ${code}`);
          console.error('stderr:', stderr);
          reject(new Error(`OCR detection failed: ${stderr}`));
        }
      });
    });
  }
}

const ocrHyperlinkDetector = new OCRHyperlinkDetector();

module.exports = { ocrHyperlinkDetector };