import { db } from '../db';
import { highlightedSelections, ocrCache, links } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export class HighlightHyperlinkService {
  /**
   * Process all pending highlights for a document and find hyperlinks using AI
   */
  async processDocumentHighlights(documentId: string): Promise<{
    processed: number;
    linksFound: number;
    errors: string[];
  }> {
    const results = {
      processed: 0,
      linksFound: 0,
      errors: [] as string[]
    };

    try {
      // Get all pending highlights for this document
      const highlights = await db.select()
        .from(highlightedSelections)
        .where(
          and(
            eq(highlightedSelections.documentId, documentId),
            eq(highlightedSelections.status, 'pending')
          )
        );

      console.log(`Found ${highlights.length} pending highlights to process`);

      // Process each highlight
      for (const highlight of highlights) {
        try {
          await this.processHighlight(highlight);
          results.processed++;
        } catch (error) {
          const errorMsg = `Failed to process highlight "${highlight.selectedText.substring(0, 50)}...": ${error instanceof Error ? error.message : String(error)}`;
          console.error(errorMsg);
          results.errors.push(errorMsg);
        }
      }

      return results;
    } catch (error) {
      console.error('Error processing document highlights:', error);
      throw error;
    }
  }

  /**
   * Process a single highlight and find matching source documents using dual AI
   */
  private async processHighlight(highlight: any) {
    console.log(`Processing highlight: "${highlight.selectedText.substring(0, 100)}..."`);

    // Get all OCR text from the document to search through
    const allPages = await db.select({
      pageNumber: ocrCache.pageNumber,
      text: ocrCache.extractedText,
      correctedText: ocrCache.correctedText
    })
    .from(ocrCache)
    .where(eq(ocrCache.documentId, highlight.documentId));

    // Use dual AI to find the best match
    const aiResult = await this.findBestMatch(highlight, allPages);

    if (aiResult.found) {
      // Create hyperlink entry
      await db.insert(links).values({
        caseId: '', // Will need to get from document
        srcDocId: highlight.documentId,
        srcPage: highlight.pageNumber,
        srcText: highlight.selectedText,
        srcContext: highlight.context || '',
        bbox: null, // TODO: Calculate from text positions
        targetDocId: highlight.documentId, // Same document for now
        targetPage: aiResult.targetPage,
        targetText: aiResult.targetText,
        linkType: 'manual_highlight',
        status: 'pending',
        confidence: aiResult.confidence.toString(),
        why: aiResult.rationale
      });

      // Update highlight status
      await db.update(highlightedSelections)
        .set({
          status: 'linked',
          aiProcessed: true
        })
        .where(eq(highlightedSelections.id, highlight.id));

      console.log(`✅ Created hyperlink for: "${highlight.selectedText.substring(0, 50)}..." → Page ${aiResult.targetPage}`);
    } else {
      // Mark as failed
      await db.update(highlightedSelections)
        .set({
          status: 'failed',
          aiProcessed: true
        })
        .where(eq(highlightedSelections.id, highlight.id));

      console.log(`❌ No match found for: "${highlight.selectedText.substring(0, 50)}..."`);
    }
  }

  /**
   * Use dual AI (OpenAI GPT-5 + Anthropic Claude) to find the best source document match
   */
  private async findBestMatch(highlight: any, allPages: any[]): Promise<{
    found: boolean;
    targetPage: number;
    targetText: string;
    confidence: number;
    rationale: string;
  }> {
    const highlightText = highlight.selectedText;
    
    // Create a searchable text corpus
    const searchCorpus = allPages.map(page => ({
      pageNumber: page.pageNumber,
      text: page.correctedText || page.text || ''
    })).filter(page => page.text.length > 0);

    console.log(`Searching through ${searchCorpus.length} pages for match to: "${highlightText}"`);

    try {
      // Parallel AI analysis
      const [openaiResult, anthropicResult] = await Promise.all([
        this.searchWithOpenAI(highlightText, searchCorpus),
        this.searchWithAnthropic(highlightText, searchCorpus)
      ]);

      console.log(`OpenAI result:`, openaiResult);
      console.log(`Anthropic result:`, anthropicResult);

      // Use the result with higher confidence, or OpenAI as tiebreaker
      const bestResult = openaiResult.confidence >= anthropicResult.confidence ? openaiResult : anthropicResult;

      return bestResult;
    } catch (error) {
      console.error('Error in AI matching:', error);
      return {
        found: false,
        targetPage: 0,
        targetText: '',
        confidence: 0,
        rationale: `AI analysis failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async searchWithOpenAI(highlightText: string, searchCorpus: any[]) {
    const prompt = `You are a legal document hyperlink assistant. Find the best source document page that matches this index item.

INDEX ITEM TO MATCH: "${highlightText}"

SEARCH THROUGH THESE PAGES:
${searchCorpus.slice(0, 10).map(page => `Page ${page.pageNumber}: ${page.text.substring(0, 500)}...`).join('\n\n')}

Find the page that contains the actual source document referenced by the index item. Look for:
- Form names, document titles, pleadings
- Specific legal documents or exhibits  
- Court filings, applications, affidavits
- Any document that this index item is referencing

Respond in JSON format:
{
  "found": boolean,
  "targetPage": number,
  "targetText": "exact matching text from source page",
  "confidence": number (0-100),
  "rationale": "why this page matches the index item"
}`;

    // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.1
    });

    return JSON.parse(response.choices[0].message.content || '{}');
  }

  private async searchWithAnthropic(highlightText: string, searchCorpus: any[]) {
    const prompt = `You are a legal document hyperlink assistant. Find the best source document page that matches this index item.

INDEX ITEM TO MATCH: "${highlightText}"

SEARCH THROUGH THESE PAGES:
${searchCorpus.slice(0, 10).map(page => `Page ${page.pageNumber}: ${page.text.substring(0, 500)}...`).join('\n\n')}

Find the page that contains the actual source document referenced by the index item. Look for:
- Form names, document titles, pleadings
- Specific legal documents or exhibits  
- Court filings, applications, affidavits
- Any document that this index item is referencing

Respond in JSON format:
{
  "found": boolean,
  "targetPage": number,
  "targetText": "exact matching text from source page",
  "confidence": number (0-100),
  "rationale": "why this page matches the index item"
}`;

    // The newest Anthropic model is "claude-sonnet-4-20250514", not "claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022" nor "claude-3-sonnet-20240229".
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }]
    });

    const content = response.content[0];
    if (content.type === 'text') {
      return JSON.parse(content.text);
    }
    throw new Error('Unexpected response format from Anthropic');
  }
}

export const highlightHyperlinkService = new HighlightHyperlinkService();