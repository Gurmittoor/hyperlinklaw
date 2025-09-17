import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { HtmlExhibitGenerator } from '../services/htmlExhibitGenerator.js';
import { db } from '../db.js';
import { exhibits, documents } from '../../shared/schema.js';
import { eq, and } from 'drizzle-orm';

const router = Router();

interface ExhibitUpdateRequest {
    exhibitLabel: string;
    newPage: number;
    caseId: string;
}

/**
 * API endpoint to update exhibit page numbers
 * POST /api/documents/:documentId/update-exhibit-page
 */
router.post('/:documentId/update-exhibit-page', async (req, res) => {
    try {
        const { documentId } = req.params;
        const { exhibitLabel, newPage, caseId }: ExhibitUpdateRequest = req.body;

        console.log('🎯 [API] Exhibit inline edit request received:');
        console.log('   Document ID:', documentId);
        console.log('   Exhibit Label:', exhibitLabel);
        console.log('   New Page:', newPage);
        console.log('   Case ID:', caseId);

        // Validate input
        if (!exhibitLabel || !newPage || !caseId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: exhibitLabel, newPage, caseId'
            });
        }

        if (newPage < 1) {
            return res.status(400).json({
                success: false,
                message: 'Page number must be greater than 0'
            });
        }

        // Update exhibit in database
        const updateResult = await db.update(exhibits)
            .set({ 
                pageNumber: newPage,
                updatedAt: new Date()
            })
            .where(and(
                eq(exhibits.documentId, documentId),
                eq(exhibits.exhibitLabel, exhibitLabel)
            ))
            .returning();

        if (updateResult.length === 0) {
            return res.status(404).json({
                success: false,
                message: `Exhibit ${exhibitLabel} not found in document ${documentId}`
            });
        }

        console.log('✅ Database updated for Exhibit', exhibitLabel);

        // Regenerate HTML index
        await regenerateExhibitHtml(documentId, caseId);

        console.log('✅ Inline edit complete: Exhibit', exhibitLabel, 'now links to page', newPage);

        res.json({
            success: true,
            message: `Exhibit ${exhibitLabel} updated to page ${newPage}`,
            updatedExhibit: {
                exhibitLabel,
                newPage
            }
        });

    } catch (error) {
        console.error('❌ Error updating exhibit page:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * Regenerate HTML for exhibit index
 */
async function regenerateExhibitHtml(documentId: string, caseId: string): Promise<void> {
    try {
        // Get all exhibits for this document
        const exhibitList = await db.select()
            .from(exhibits)
            .where(eq(exhibits.documentId, documentId))
            .orderBy(exhibits.pageNumber);

        // Get document info
        const document = await db.select()
            .from(documents)
            .where(eq(documents.id, documentId))
            .limit(1);

        if (document.length === 0) {
            throw new Error(`Document ${documentId} not found`);
        }

        const totalPages = document[0].pageCount || 86; // Default to 86 for exhibit documents
        const documentTitle = document[0].title || "Document Exhibits";

        // Convert to ExhibitItem format
        const exhibitItems = exhibitList.map(exhibit => ({
            exhibitLabel: exhibit.exhibitLabel,
            exhibitTitle: exhibit.exhibitTitle || undefined,
            pageNumber: exhibit.pageNumber,
            ocrDetected: exhibit.ocrDetected || false,
            manuallyAdded: exhibit.manuallyAdded || false
        }));

        // Generate HTML
        const generator = new HtmlExhibitGenerator(exhibitItems, documentId, totalPages);
        const html = generator.generateHTML(caseId, documentTitle);

        // Save HTML file
        const htmlPath = join('storage', 'cases', caseId, `document_${documentId}_exhibits.html`);
        writeFileSync(htmlPath, html, 'utf-8');

        console.log('✅ HTML exhibit index saved:', htmlPath);

    } catch (error) {
        console.error('❌ Error regenerating exhibit HTML:', error);
        throw error;
    }
}

export { router as exhibitEditorRouter };