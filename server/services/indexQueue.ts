import { spawn } from "child_process";
import path from "path";
import { storage } from "../storage";

/**
 * OCR-FIRST ARCHITECTURE (Per Specification)
 * This service uses ONLY stored OCR cache - never processes OCR on-demand.
 * All document processing must use pre-stored OCR text from ocr_cache table.
 */
const REQUIRE_OCR_ALWAYS = true;
const REJECT_NON_OCR_RESULTS = true;
const USE_OCR_CACHE_ONLY = true; // Per specification

// Automatic link building using existing hyperlinking service
export async function enqueueLinkBuild({ documentId }: { documentId: string }) {
  try {
    console.log(`🔗 Link building started for document ${documentId}`);
    
    // Get document info
    const document = await storage.getDocument(documentId);
    if (!document || !document.indexItems) {
      console.log(`❌ No document or index items found for ${documentId}`);
      return;
    }
    
    // Get all case documents for linking
    const caseDocuments = await storage.getDocumentsByCase(document.caseId);
    
    // Find trial record (target document)
    const trialRecord = caseDocuments.find(doc => 
      doc.title.toLowerCase().includes('trial record') || 
      doc.title.toLowerCase().includes('transcript')
    );
    
    if (!trialRecord) {
      console.log(`❌ No trial record found for case ${document.caseId}`);
      return;
    }
    
    // Create links for each index item found
    const indexItems = Array.isArray(document.indexItems) ? document.indexItems : [];
    const linksCreated = [];
    
    for (let i = 0; i < indexItems.length; i++) {
      const item = indexItems[i];
      const linkData = {
        caseId: document.caseId,
        srcDocId: documentId,
        srcPage: 1, // Most indexes are on page 1
        srcText: item.text || `Index Item ${i + 1}`,
        srcContext: item.context || `Found in document index`,
        targetDocId: trialRecord.id,
        targetPage: item.page || 1,
        targetText: item.target || item.text || `Reference ${i + 1}`,
        linkType: item.type || "citation",
        status: "approved",
        confidence: "0.9",
        why: `Automatic detection from document index`
      };
      
      const newLink = await storage.createLink(linkData);
      linksCreated.push(newLink);
    }
    
    console.log(`✅ Created ${linksCreated.length} links from ${indexItems.length} index items for document ${documentId}`);
    
  } catch (error) {
    console.error(`❌ Link building error for ${documentId}:`, error);
  }
}

const running = new Set<string>(); // docId → running guard (simple debounce)

export async function enqueueIndexDetection({ documentId }: { documentId: string }) {
  if (running.has(documentId)) return; // debounce
  running.add(documentId);
  runNow(documentId).finally(() => running.delete(documentId));
}

async function runNow(documentId: string) {
  const startTime = Date.now();
  let ocrUsed = false;
  
  try {
    // Fetch document info
    const document = await storage.getDocument(documentId);
    if (!document) return;

    const pdfPath = path.join(process.cwd(), "storage", document.storagePath);

    // Spawn OCR Cache-based Python detector (per specification)
    const script = path.resolve(process.cwd(), "server/services/ocrCacheIndexDetector.py");
    const child = spawn("python3", [script, documentId], { stdio: ["ignore", "pipe", "pipe"] });

    let out = "", err = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));

    await new Promise<void>((resolve) => child.on("close", () => resolve()));

    const duration = Date.now() - startTime;

    try {
      const payload = JSON.parse(out || "{}");
      
      // PERMANENT OCR VALIDATION - Check if OCR was used from the payload
      ocrUsed = payload.ocr_used === true || payload.ocr_used === "true";
      
      // PERMANENT GUARD: Reject any processing that didn't use OCR
      if (REQUIRE_OCR_ALWAYS && !ocrUsed) {
        throw new Error("CRITICAL: Document processing must use OCR. Non-OCR processing rejected by permanent system requirements.");
      }
      
      // Handle different response formats
      const items = payload.items || [];
      const status = payload.status || (items.length > 0 ? "success" : "no_items");
      
      if (status === "success" && items.length > 0) {
        // Update document with detection results
        await storage.updateDocument(documentId, {
          indexStatus: "ok",
          indexCount: items.length,
          indexItems: items,
          indexDetectedAt: new Date()
        });

        // Enhanced logging with OCR validation
        console.log(`📊 index_ok doc=${documentId} items=${items.length} ocr=${ocrUsed} ms=${payload.processing_time_ms || duration} [OCR_ENFORCED]`);
      
        // Chain automatic linking if items found
        if (items.length > 0) {
          console.log(`🔗 Triggering automatic link building for ${items.length} index items`);
          await enqueueLinkBuild({ documentId });
        }
      } else {
        // Update document with no results or error status
        await storage.updateDocument(documentId, {
          indexStatus: status === "error" ? "error" : "ok",
          indexCount: items.length,
          indexItems: items,
          indexDetectedAt: new Date()
        });
        
        if (status === "error") {
          console.log(`📊 index_error doc=${documentId} ocr=${ocrUsed} ms=${payload.processing_time_ms || duration} error=${payload.error || "unknown"}`);
        } else {
          console.log(`📊 index_ok doc=${documentId} items=${items.length} ocr=${ocrUsed} ms=${payload.processing_time_ms || duration}`);
          console.log(`ℹ️ No index items found - manual review suggested for ${document.title}`);
        }
      }
      
    } catch (parseError) {
      // Update document with error status
      await storage.updateDocument(documentId, {
        indexStatus: "error",
        indexCount: null,
        indexItems: null,
        indexDetectedAt: new Date()
      });
      console.error(`❌ index_error doc=${documentId} ms=${duration} error=${err || parseError}`);
    }
  } catch (error) {
    console.error("Index detection error:", error);
    // Try to update status to error if we can
    try {
      await storage.updateDocument(documentId, {
        indexStatus: "error",
        indexCount: null,
        indexItems: null,
        indexDetectedAt: new Date()
      });
    } catch {}
  }
}