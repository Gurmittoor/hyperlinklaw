// Test script to generate exhibit HTML for the 86-page document
import { HtmlExhibitGenerator } from './server/services/htmlExhibitGenerator.js';
import { db } from './server/db.js';
import { exhibits, documents } from './shared/schema.js';
import { eq } from 'drizzle-orm';
import { writeFileSync } from 'fs';
import { join } from 'path';

async function generateExhibitHtml() {
    try {
        console.log('🎯 Generating exhibit HTML for 86-page document...');
        
        const documentId = 'doc-86-exhibits';
        const caseId = 'sample-case-86';
        
        // Get all exhibits for this document
        const exhibitList = await db.select()
            .from(exhibits)
            .where(eq(exhibits.documentId, documentId))
            .orderBy(exhibits.pageNumber);

        console.log(`📋 Found ${exhibitList.length} exhibits:`, exhibitList.map(e => e.exhibitLabel));

        // Get document info
        const document = await db.select()
            .from(documents)
            .where(eq(documents.id, documentId))
            .limit(1);

        if (document.length === 0) {
            throw new Error(`Document ${documentId} not found`);
        }

        const totalPages = document[0].pageCount || 86;
        const documentTitle = document[0].title || "86-Page Exhibit Document";

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
        console.log('🌐 Access at: http://localhost:5000/online/exhibits/' + caseId + '/' + documentId);
        
        return htmlPath;

    } catch (error) {
        console.error('❌ Error generating exhibit HTML:', error);
        throw error;
    }
}

// Run the test
generateExhibitHtml()
    .then(() => {
        console.log('✅ Exhibit HTML generation completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Failed:', error);
        process.exit(1);
    });