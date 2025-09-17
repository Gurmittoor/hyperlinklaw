import { ImageAnnotatorClient } from '@google-cloud/vision';

// Initialize Vision client with explicit credentials
const { GCP_PROJECT_ID, GCP_CREDENTIALS_JSON } = process.env;

let client: ImageAnnotatorClient;

if (GCP_PROJECT_ID && GCP_CREDENTIALS_JSON) {
  try {
    const credentials = JSON.parse(GCP_CREDENTIALS_JSON);
    client = new ImageAnnotatorClient({ 
      projectId: GCP_PROJECT_ID, 
      credentials 
    });
    console.log('🔧 Vision client initialized with explicit credentials');
  } catch (error) {
    console.error('❌ Failed to parse GCP credentials, falling back to default auth:', error);
    client = new ImageAnnotatorClient();
  }
} else {
  console.warn('⚠️ Missing GCP credentials, using default authentication');
  client = new ImageAnnotatorClient();
}

// Tesseract OCR fallback function
async function tesseractOcrFallback(pdfBytes: Buffer): Promise<{ text: string; confidence: number; wordsJson: any }> {
  try {
    console.log(`🔄 Using Tesseract OCR fallback for ${pdfBytes.length} bytes`);
    
    // Convert PDF page to PNG image using pdf2pic - OPTIMIZED FOR SPEED
    const pdf2pic = await import('pdf2pic');
    const convert = pdf2pic.fromBuffer(pdfBytes, {
      density: 150,           // SPEED OPTIMIZATION: Reduced from 300 to 150 DPI
      saveFilename: "page",
      savePath: "./",
      format: "png",
      width: 1275,           // SPEED OPTIMIZATION: Half resolution for 4x faster processing
      height: 1650
    });
    
    // Convert first (and only) page to image
    const imageResult = await convert(1, { responseType: "buffer" });
    const imageBuffer = imageResult.buffer;
    
    if (!imageBuffer) {
      throw new Error('Failed to convert PDF to image buffer');
    }
    
    console.log(`🖼️ Converted PDF to PNG image: ${imageBuffer.length} bytes`);
    
    // Use Tesseract on the image - OPTIMIZED FOR SPEED
    const tesseract = await import('tesseract.js');
    const { createWorker } = tesseract;
    
    const worker = await createWorker('eng');
    // SPEED OPTIMIZATION: Use faster PSM mode and reduce confidence threshold
    await worker.setParameters({
      tessedit_pageseg_mode: 1 as any,  // Auto page segmentation with OSD (faster)
      tessedit_ocr_engine_mode: 1 as any,  // Neural nets LSTM engine only (faster)
      preserve_interword_spaces: 0 as any  // Skip space preservation for speed
    });
    const { data: { text, confidence } } = await worker.recognize(imageBuffer!);
    await worker.terminate();
    
    console.log(`✅ Tesseract OCR completed: ${text.length} chars, confidence: ${confidence.toFixed(1)}%`);
    
    return {
      text: text || '',
      confidence: (confidence || 70) / 100, // Convert percentage to decimal
      wordsJson: null
    };
  } catch (error) {
    console.error('❌ Tesseract OCR also failed:', error);
    
    // Fallback: return minimal OCR result to prevent complete failure
    return {
      text: '[OCR processing failed - legal document content not available]',
      confidence: 0.1,
      wordsJson: null
    };
  }
}

// Check if error is a billing/permission error
function isBillingError(error: any): boolean {
  const errorMessage = error?.message || '';
  return errorMessage.includes('billing') || 
         errorMessage.includes('PERMISSION_DENIED') ||
         errorMessage.includes('disabled in state absent') ||
         error?.code === 7;
}

export async function visionOcrPage({ 
  pdfBytes, 
  upscaleDpi = 0 
}: {
  pdfBytes: Buffer; 
  upscaleDpi?: number;
}) {
  try {
    console.log(`🔍 Vision OCR processing ${pdfBytes.length} bytes${upscaleDpi ? ` (upscale DPI: ${upscaleDpi})` : ''}`);
    
    // Use DOCUMENT_TEXT_DETECTION for best results on legal documents
    const [result] = await client.documentTextDetection({ 
      image: { content: pdfBytes },
      // Add image context for better OCR if upscaling requested
      ...(upscaleDpi > 0 && {
        imageContext: {
          languageHints: ['en'], // Legal documents are primarily English
        }
      })
    });
    
    // Extract full text
    const fullText = result.fullTextAnnotation?.text ?? '';
    
    // Calculate confidence from pages data
    const pages = result.fullTextAnnotation?.pages ?? [];
    let totalConfidence = 0;
    let wordCount = 0;
    
    for (const page of pages) {
      for (const block of page.blocks ?? []) {
        for (const paragraph of block.paragraphs ?? []) {
          for (const word of paragraph.words ?? []) {
            if (word.confidence !== null && word.confidence !== undefined) {
              totalConfidence += word.confidence;
              wordCount++;
            }
          }
        }
      }
    }
    
    const avgConfidence = wordCount > 0 ? totalConfidence / wordCount : 0.85;
    
    console.log(`✅ Vision OCR completed: ${fullText.length} chars, ${wordCount} words, avg confidence: ${avgConfidence.toFixed(3)}`);
    
    return {
      text: fullText,
      confidence: avgConfidence,
      wordsJson: result.fullTextAnnotation || null
    };
    
  } catch (error) {
    console.error('❌ Vision OCR failed:', error);
    
    // Check if this is a billing/permission error and use fallback
    if (isBillingError(error)) {
      console.log('💡 Billing issue detected, switching to Tesseract OCR fallback...');
      return await tesseractOcrFallback(pdfBytes);
    }
    
    // For other errors, return empty result
    return {
      text: '',
      confidence: 0.0,
      wordsJson: null
    };
  }
}

export async function processPageWithVision(
  pdfPath: string, 
  pageNumber: number, 
  documentId: string
): Promise<{ success: boolean; text?: string; confidence?: number; processingTime?: number; error?: string }> {
  try {
    const startTime = Date.now();
    console.log(`🔄 Processing page ${pageNumber} of ${pdfPath} with Google Cloud Vision`);
    
    // Convert specific page to image buffer
    const { pdfToImageBuffer } = await import('./pdfUtils');
    const imageBuffer = await pdfToImageBuffer(pdfPath, pageNumber);
    
    // Process with Vision OCR
    const result = await visionOcrPage({ pdfBytes: imageBuffer });
    
    const processingTime = Date.now() - startTime;
    
    if (result.text) {
      console.log(`✅ Vision OCR page ${pageNumber}: ${result.text.length} chars, confidence: ${result.confidence.toFixed(3)}, time: ${processingTime}ms`);
      
      return {
        success: true,
        text: result.text,
        confidence: result.confidence,
        processingTime
      };
    } else {
      return {
        success: false,
        error: 'No text extracted from page'
      };
    }
  } catch (error) {
    console.error(`❌ Vision OCR failed for page ${pageNumber}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Vision OCR processing failed'
    };
  }
}

export async function isVisionApiAvailable(): Promise<boolean> {
  try {
    // Simple test call to check if Vision API is accessible
    const testImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
    
    await client.textDetection({ 
      image: { content: testImage }
    });
    
    return true;
  } catch (error) {
    console.warn('⚠️  Vision API not available:', error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
}