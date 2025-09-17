import { Router } from 'express';
import OpenAI from 'openai';

const router = Router();

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

// OCR processing for screenshots using OpenAI Vision (temporary fallback while we fix Google Cloud Vision)
router.post('/api/ocr/screenshot', async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL is required' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Using gpt-4o instead of gpt-5 for better image OCR performance
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "You are an expert OCR system specialized in legal document index tables. This image contains a 3-column table with: Tab No. | DATE OF DOCUMENT | NATURE OF DOCUMENT. Extract the text while preserving the exact columnar structure. Format the output as follows:\n\n1. Start with column headers: '--- Tab No.          DATE OF DOCUMENT    NATURE OF DOCUMENT ---'\n2. For each row, separate columns with adequate spacing to maintain alignment\n3. Keep each column's content within its boundaries - do not let text bleed between columns\n4. Preserve all numbers, dates, and descriptions exactly as shown\n5. Maintain consistent spacing between columns throughout\n\nExample format:\n1.    February 24, 2022    Request for Information of the Applicant\n2.    March 10, 2022      Request for Information of the Applicant\n\nExtract ALL visible rows in this exact columnar format."
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl
              }
            }
          ],
        },
      ],
      max_tokens: 1500,
    });

    const extractedText = response.choices[0].message.content || '';

    // Post-process the text to format it nicely for legal documents
    const formattedText = formatLegalDocumentText(extractedText);

    res.json({ 
      text: formattedText,
      success: true,
      rawText: extractedText,
      engine: 'OpenAI Vision (GPT-5)' // Indicate which engine was used
    });

  } catch (error) {
    console.error('OCR processing error:', error);
    res.status(500).json({ 
      error: 'Failed to process OCR',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Format extracted text for legal documents with preserved 3-column structure
function formatLegalDocumentText(rawText: string): string {
  if (!rawText) return '';

  // Split by lines and clean up
  const lines = rawText.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const formattedLines: string[] = [];
  let hasHeaders = false;
  
  for (const line of lines) {
    // Check if this is a header line
    if (line.includes('Tab No.') && line.includes('DATE OF DOCUMENT') && line.includes('NATURE OF DOCUMENT')) {
      if (!hasHeaders) {
        formattedLines.push('--- Tab No.          DATE OF DOCUMENT                NATURE OF DOCUMENT ---');
        hasHeaders = true;
      }
      continue;
    }
    
    // Check if this is a numbered entry (1., 2., etc.)
    const numberMatch = line.match(/^(\d+)\.?\s*(.*)/);
    if (numberMatch) {
      const entryNumber = numberMatch[1];
      const restOfLine = numberMatch[2];
      
      // Try to parse the rest into date and nature columns
      // Look for date patterns (Month Day, Year or MM/DD/YYYY or similar)
      const datePattern = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}|(\d{1,2}\/\d{1,2}\/\d{4})|(\d{4}-\d{2}-\d{2})/i;
      const dateMatch = restOfLine.match(datePattern);
      
      if (dateMatch) {
        const dateStr = dateMatch[0];
        const beforeDate = restOfLine.substring(0, dateMatch.index || 0).trim();
        const afterDate = restOfLine.substring((dateMatch.index || 0) + dateStr.length).trim();
        
        // Format: "1.    February 24, 2022        Request for Information of the Applicant"
        const paddedNumber = entryNumber.padEnd(6);
        const paddedDate = dateStr.padEnd(24);
        const nature = (beforeDate + ' ' + afterDate).trim();
        
        formattedLines.push(`${paddedNumber}${paddedDate}${nature}`);
      } else {
        // If no date found, just format as best we can
        formattedLines.push(`${entryNumber}.    ${restOfLine}`);
      }
    } else {
      // For non-numbered lines, preserve as-is (might be continuation of previous line)
      formattedLines.push(line);
    }
  }

  return formattedLines.join('\n').trim();
}

// Batch OCR processing for multiple screenshots in sequence order
router.post('/api/ocr/screenshots-batch', async (req, res) => {
  try {
    const { imageUrls, documentId, order } = req.body;

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return res.status(400).json({ error: 'imageUrls array is required and must not be empty' });
    }

    if (!documentId) {
      return res.status(400).json({ error: 'documentId is required' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    console.log(`🔄 Starting batch OCR for ${imageUrls.length} screenshots in sequence order`);
    console.log(`📋 Document ID: ${documentId}`);
    console.log(`⚙️  Order mode: ${order || 'default'}`);

    const results: Array<{ url: string; text: string; rawText: string; success: boolean; error?: string }> = [];
    const texts: string[] = [];

    // Process each imageUrl sequentially to preserve order
    for (let i = 0; i < imageUrls.length; i++) {
      const imageUrl = imageUrls[i];
      console.log(`🔍 Processing screenshot ${i + 1}/${imageUrls.length}: ${imageUrl.substring(0, 50)}...`);

      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o", // Using gpt-4o instead of gpt-5 for better image OCR performance
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "You are an expert OCR system specialized in legal document index tables. This image contains a 3-column table with: Tab No. | DATE OF DOCUMENT | NATURE OF DOCUMENT. Extract the text while preserving the exact columnar structure. Format the output as follows:\n\n1. Start with column headers: '--- Tab No.          DATE OF DOCUMENT    NATURE OF DOCUMENT ---'\n2. For each row, separate columns with adequate spacing to maintain alignment\n3. Keep each column's content within its boundaries - do not let text bleed between columns\n4. Preserve all numbers, dates, and descriptions exactly as shown\n5. Maintain consistent spacing between columns throughout\n\nExample format:\n1.    February 24, 2022    Request for Information of the Applicant\n2.    March 10, 2022      Request for Information of the Applicant\n\nExtract ALL visible rows in this exact columnar format."
                },
                {
                  type: "image_url",
                  image_url: {
                    url: imageUrl
                  }
                }
              ],
            },
          ],
          max_tokens: 1500,
        });

        const extractedText = response.choices[0].message.content || '';
        const formattedText = formatLegalDocumentText(extractedText);

        results.push({
          url: imageUrl,
          text: formattedText,
          rawText: extractedText,
          success: true
        });

        texts.push(formattedText);
        console.log(`✅ Successfully processed screenshot ${i + 1}/${imageUrls.length}`);

      } catch (error) {
        console.error(`❌ Error processing screenshot ${i + 1}/${imageUrls.length}:`, error);
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          url: imageUrl,
          text: '',
          rawText: '',
          success: false,
          error: errorMessage
        });

        texts.push(''); // Maintain array alignment even for failed OCRs
      }
    }

    // Prepare response
    const response: any = {
      results,
      success: true,
      totalProcessed: imageUrls.length,
      successfulOcrs: results.filter(r => r.success).length,
      failedOcrs: results.filter(r => !r.success).length,
      engine: 'OpenAI Vision (GPT-4o)',
      documentId,
      order: order || 'default'
    };

    // Add combined text for leftFirst order mode
    if (order === 'leftFirst') {
      response.combinedText = texts.filter(text => text.length > 0).join('\n');
      console.log(`📝 Combined text created for leftFirst order: ${response.combinedText.length} characters`);
    }

    console.log(`🎯 Batch OCR complete: ${response.successfulOcrs}/${imageUrls.length} successful`);
    
    res.json(response);

  } catch (error) {
    console.error('❌ Batch OCR processing error:', error);
    res.status(500).json({ 
      error: 'Failed to process batch OCR',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;