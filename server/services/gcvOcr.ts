import { v1 as vision } from '@google-cloud/vision';
import { Storage } from '@google-cloud/storage';
import { promises as fs } from 'fs';
import path from 'path';

const creds = JSON.parse(process.env.GCP_CREDENTIALS_JSON!);
const client = new vision.ImageAnnotatorClient({ credentials: creds });
const storage = new Storage({ credentials: creds });

const INPUT_BUCKET = process.env.GCP_INPUT_BUCKET!;
const OUTPUT_BUCKET = process.env.GCP_OUTPUT_BUCKET!;

export interface GCVOCRResult {
  pageNumber: number;
  text: string;
  confidence: number;
  words: Array<{
    text: string;
    confidence: number;
    boundingBox: any;
  }>;
}

export class GoogleCloudVisionOCR {
  
  /**
   * Upload PDF to Google Cloud Storage for processing
   */
  async uploadPdfToGCS(localPath: string, gcsPath: string): Promise<string> {
    try {
      await storage.bucket(INPUT_BUCKET).upload(localPath, { 
        destination: gcsPath,
        metadata: {
          contentType: 'application/pdf'
        }
      });
      return `gs://${INPUT_BUCKET}/${gcsPath}`;
    } catch (error) {
      console.error('Error uploading to GCS:', error);
      throw error;
    }
  }

  /**
   * Start async OCR processing on a PDF
   */
  async startGcvPdfOcr(gcsInputUri: string, docId: string): Promise<{
    operationName: string;
    outputPrefix: string;
  }> {
    const outputPrefix = `results/${docId}/${Date.now()}/`;
    const gcsOutputUri = `gs://${OUTPUT_BUCKET}/${outputPrefix}`;

    console.log(`🚀 Starting GCV OCR for ${gcsInputUri} -> ${gcsOutputUri}`);

    const request = {
      requests: [{
        inputConfig: {
          gcsSource: { uri: gcsInputUri },
          mimeType: 'application/pdf',
        },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        outputConfig: {
          gcsDestination: { uri: gcsOutputUri },
          batchSize: 20, // Process in batches of 20 pages
        },
      }],
    };

    try {
      const [operation] = await client.asyncBatchAnnotateFiles(request as any);
      
      console.log(`✅ GCV OCR operation started: ${operation.name}`);
      
      return { 
        operationName: operation.name!, 
        outputPrefix 
      };
    } catch (error) {
      console.error('Error starting GCV OCR:', error);
      throw error;
    }
  }

  /**
   * Check if OCR operation is complete and process results
   */
  async pollAndIngestGcvResult(
    operationName: string,
    outputPrefix: string,
    docId: string,
    onPageProcessed: (pageNo: number, text: string, confidence: number, words: any[]) => Promise<void>,
    onProgress: (done: number, total: number, avgConfidence: number) => Promise<void>
  ): Promise<{ done: boolean; pagesProcessed?: number }> {
    
    try {
      // Check if operation is complete
      const operation = await client.checkAsyncBatchAnnotateFilesProgress(operationName);
      
      if (!operation.done) {
        console.log(`⏳ GCV operation still processing: ${operationName}`);
        return { done: false };
      }

      console.log(`✅ GCV operation completed: ${operationName}`);

      // List and process output files
      const [files] = await storage.bucket(OUTPUT_BUCKET).getFiles({ prefix: outputPrefix });
      
      let pagesProcessed = 0;
      let totalConfidence = 0;
      const results: GCVOCRResult[] = [];

      for (const file of files) {
        if (!file.name.endsWith('.json')) continue;

        console.log(`📄 Processing GCV result file: ${file.name}`);
        
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
                  
                  const confidence = Number(word.confidence || 0.9);
                  
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
          results.push({
            pageNumber,
            text,
            confidence: avgConfidence,
            words
          });

          pagesProcessed++;
          totalConfidence += avgConfidence;
        }
      }

      // Sort results by page number
      results.sort((a, b) => a.pageNumber - b.pageNumber);

      // Process each page result
      for (const result of results) {
        await onPageProcessed(
          result.pageNumber,
          result.text,
          result.confidence,
          result.words
        );
      }

      // Report final progress
      const avgConfidence = pagesProcessed > 0 ? totalConfidence / pagesProcessed : 0;
      await onProgress(pagesProcessed, pagesProcessed, avgConfidence);

      console.log(`✅ GCV processing complete: ${pagesProcessed} pages processed`);

      return { done: true, pagesProcessed };
      
    } catch (error) {
      console.error('Error processing GCV results:', error);
      throw error;
    }
  }

  /**
   * Clean up temporary files after processing
   */
  async cleanupGcsFiles(inputPath: string, outputPrefix: string): Promise<void> {
    try {
      // Delete input file
      await storage.bucket(INPUT_BUCKET).file(inputPath.replace(`gs://${INPUT_BUCKET}/`, '')).delete();
      
      // Delete output files
      const [files] = await storage.bucket(OUTPUT_BUCKET).getFiles({ prefix: outputPrefix });
      await Promise.all(files.map(file => file.delete()));
      
      console.log(`🧹 Cleaned up GCS files for ${inputPath}`);
    } catch (error) {
      console.warn('Error cleaning up GCS files:', error);
    }
  }
}

export const gcvOcr = new GoogleCloudVisionOCR();