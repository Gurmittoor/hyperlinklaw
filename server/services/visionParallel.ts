import { ImageAnnotatorClient } from '@google-cloud/vision';
import { Storage } from '@google-cloud/storage';

type Batch = { start: number; end: number; name: string };

const {
  GCP_PROJECT_ID,
  GCP_INPUT_BUCKET,
  GCP_OUTPUT_BUCKET,
  GCP_CREDENTIALS_JSON,
} = process.env;

if (!GCP_PROJECT_ID || !GCP_INPUT_BUCKET || !GCP_OUTPUT_BUCKET || !GCP_CREDENTIALS_JSON) {
  console.warn('⚠️ Missing Google Cloud env vars - falling back to local processing');
}

const credentials = JSON.parse(GCP_CREDENTIALS_JSON);

const vision = new ImageAnnotatorClient({ projectId: GCP_PROJECT_ID, credentials });
const storage = new Storage({ projectId: GCP_PROJECT_ID, credentials });

/**
 * Simple concurrency limiter (replacement for p-limit)
 */
class ConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private limit: number) {}

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const execute = async () => {
        this.running++;
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.running--;
          if (this.queue.length > 0) {
            const next = this.queue.shift();
            if (next) next();
          }
        }
      };

      if (this.running < this.limit) {
        execute();
      } else {
        this.queue.push(execute);
      }
    });
  }
}

/**
 * Create page batches like:
 * 1-50, 51-100, ...
 */
function makeBatches(totalPages: number, batchSize = 50): Batch[] {
  const out: Batch[] = [];
  for (let i = 1; i <= totalPages; i += batchSize) {
    const start = i;
    const end = Math.min(i + batchSize - 1, totalPages);
    out.push({ start, end, name: `p${start}-${end}` });
  }
  return out;
}

/**
 * Check if this batch's OCR output already exists in GCS (resume).
 */
async function batchAlreadyDone(prefix: string): Promise<boolean> {
  try {
    const [files] = await storage.bucket(GCP_OUTPUT_BUCKET!).getFiles({ prefix, maxResults: 1 });
    return files.length > 0;
  } catch (error) {
    console.warn(`Error checking batch completion for ${prefix}:`, error);
    return false;
  }
}

/**
 * Submit a single batch to Cloud Vision asyncBatchAnnotateFiles.
 * The output will be written by Google to the GCS output prefix.
 */
async function runBatch({
  gcsPdfUri,
  outputPrefix,
  start,
  end,
}: {
  gcsPdfUri: string;
  outputPrefix: string;
  start: number;
  end: number;
}) {
  // Convert page range to explicit array; Vision accepts an array of page numbers
  const pages: number[] = [];
  for (let p = start; p <= end; p++) pages.push(p);

  const request = {
    requests: [
      {
        inputConfig: {
          gcsSource: { uri: gcsPdfUri },
          mimeType: 'application/pdf',
          // pages to process in this request
          pages,
        },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' as const }],
        outputConfig: {
          gcsDestination: { uri: outputPrefix }, // Vision will write results as JSON to this prefix
          // batchSize controls how many responses per JSON file; does not affect parallelism
          batchSize: 50,
        },
      },
    ],
  };

  const [operation] = await vision.asyncBatchAnnotateFiles(request as any);
  await operation.promise(); // wait until done
}

/**
 * Upload PDF to GCS input bucket if it doesn't exist
 */
async function ensurePdfInGcs(localPdfPath: string, gcsPdfUri: string): Promise<void> {
  const bucketName = GCP_INPUT_BUCKET!;
  const fileName = gcsPdfUri.replace(`gs://${bucketName}/`, '');

  try {
    // First ensure the bucket exists
    await ensureBucketExists(bucketName);

    // Check if file already exists
    const [exists] = await storage.bucket(bucketName).file(fileName).exists();
    if (exists) {
      console.log(`📄 PDF already exists in GCS: ${gcsPdfUri}`);
      return;
    }

    // Upload the file
    console.log(`📤 Uploading PDF to GCS: ${gcsPdfUri}`);
    await storage.bucket(bucketName).upload(localPdfPath, {
      destination: fileName,
      metadata: {
        cacheControl: 'public, max-age=3600',
      },
    });
    console.log(`✅ PDF uploaded successfully: ${gcsPdfUri}`);
  } catch (error) {
    console.error(`❌ Error uploading PDF to GCS:`, error);
    throw error;
  }
}

/**
 * Ensure Google Cloud Storage bucket exists, create if it doesn't
 */
async function ensureBucketExists(bucketName: string): Promise<void> {
  try {
    const bucket = storage.bucket(bucketName);
    const [exists] = await bucket.exists();
    
    if (!exists) {
      console.log(`🪣 Creating GCS bucket: ${bucketName}`);
      await storage.createBucket(bucketName, {
        location: 'US',
        storageClass: 'STANDARD'
      });
      console.log(`✅ Created GCS bucket: ${bucketName}`);
    } else {
      console.log(`✅ GCS bucket exists: ${bucketName}`);
    }
  } catch (error) {
    console.error(`❌ Error with GCS bucket ${bucketName}:`, error);
    throw error;
  }
}

/**
 * Main runner:
 * - shards into 50-page batches
 * - runs up to `maxConcurrent` batches in parallel
 * - resumes by skipping completed batches
 */
export async function runVisionParallel({
  caseId,
  documentId,
  totalPages,
  localPdfPath,
  batchSize = 50,
  maxConcurrent = 10, // 10 strands; set 20 for 1000 pages if quotas allow
  onProgress,
}: {
  caseId: string;
  documentId: string;
  totalPages: number;
  localPdfPath: string;
  batchSize?: number;
  maxConcurrent?: number;
  onProgress?: (completed: number, total: number) => void;
}) {
  const gcsPdfUri = `gs://${GCP_INPUT_BUCKET}/cases/${caseId}/docs/${documentId}.pdf`;
  const baseOutputPrefix = `vision/${caseId}/${documentId}/`; // all JSONs under this prefix

  // Ensure PDF is uploaded to GCS
  await ensurePdfInGcs(localPdfPath, gcsPdfUri);

  const batches = makeBatches(totalPages, batchSize);
  const limiter = new ConcurrencyLimiter(maxConcurrent);

  console.log(
    `🚀 Starting Vision OCR: ${batches.length} batches, ${batchSize}/batch, concurrency=${maxConcurrent}`
  );

  let completed = 0;
  const tasks = batches.map((b) =>
    limiter.add(async () => {
      const outputPrefix = `gs://${GCP_OUTPUT_BUCKET}/${baseOutputPrefix}${b.name}/`;
      const resumeCheckPrefix = `${baseOutputPrefix}${b.name}/`;

      // Skip if already present (resume)
      const done = await batchAlreadyDone(resumeCheckPrefix);
      if (done) {
        console.log(`↪️ Skipping ${b.name} (already in GCS)`);
        completed++;
        onProgress?.(completed, batches.length);
        return;
      }

      console.log(`▶️ Submitting ${b.name} (${b.start}-${b.end})`);
      await runBatch({ gcsPdfUri, outputPrefix, start: b.start, end: b.end });
      completed++;
      console.log(`✅ Done ${b.name} (${completed}/${batches.length})`);
      onProgress?.(completed, batches.length);
    })
  );

  await Promise.allSettled(tasks);
  console.log('🎉 All batches submitted and completed/resumed.');
  return completed;
}

/**
 * Download and parse OCR results from GCS
 */
export async function downloadVisionResults({
  caseId,
  documentId,
  onPageProcessed,
}: {
  caseId: string;
  documentId: string;
  onPageProcessed: (pageNo: number, text: string, confidence: number, words: any[]) => Promise<void>;
}): Promise<number> {
  const baseOutputPrefix = `vision/${caseId}/${documentId}/`;
  
  console.log(`📥 Downloading Vision OCR results from: ${baseOutputPrefix}`);
  
  const [files] = await storage.bucket(GCP_OUTPUT_BUCKET!).getFiles({ prefix: baseOutputPrefix });
  
  let pagesProcessed = 0;
  
  for (const file of files) {
    if (!file.name.endsWith('.json')) continue;

    console.log(`📄 Processing result file: ${file.name}`);
    
    try {
      const [buffer] = await file.download();
      const json = JSON.parse(buffer.toString());

      // Process each response in the JSON
      for (const response of json.responses || []) {
        const annotation = response.fullTextAnnotation;
        if (!annotation) continue;

        // Extract page number from context or increment
        const pageNumber = response.context?.pageNumber || (pagesProcessed + 1);
        
        // Extract text
        const text = annotation.text || '';
        
        // Calculate confidence and extract words with bounding boxes
        const words: any[] = [];
        let confidenceSum = 0;
        let wordCount = 0;

        for (const page of annotation.pages || []) {
          for (const block of page.blocks || []) {
            for (const paragraph of block.paragraphs || []) {
              for (const word of paragraph.words || []) {
                const wordText = (word.symbols || [])
                  .map((symbol: any) => symbol.text)
                  .join('');
                
                const confidence = Number(word.confidence || 0.95);
                
                words.push({
                  text: wordText,
                  confidence,
                  boundingBox: word.boundingBox?.vertices || []
                });
                
                confidenceSum += confidence;
                wordCount++;
              }
            }
          }
        }

        const avgConfidence = wordCount > 0 ? confidenceSum / wordCount : 0.95;
        
        // Store result
        await onPageProcessed(pageNumber, text, avgConfidence, words);
        pagesProcessed++;
      }
    } catch (error) {
      console.error(`❌ Error processing result file ${file.name}:`, error);
    }
  }

  console.log(`✅ Downloaded and processed ${pagesProcessed} pages`);
  return pagesProcessed;
}