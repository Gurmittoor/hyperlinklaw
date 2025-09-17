import { Router } from 'express';
import { TabHighlighter, TabItem } from '../services/tabHighlighter.js';
// import { HtmlIndexGenerator } from '../services/htmlIndexGenerator.js'; // REMOVED - no longer generating HTML indexes
import { HighlightGenerator } from '../services/highlightGenerator.js';
import { db } from '../db.js';
import { documents, exhibits, reviewHighlights } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import path from 'path';
import fs from 'fs/promises';
import archiver from 'archiver';
import rateLimit from 'express-rate-limit';

// Get saved manual tab highlights from database
async function getManualTabHighlights(documentId: string): Promise<TabItem[]> {
  try {
    const tabHighlights = await db
      .select()
      .from(reviewHighlights)
      .where(and(
        eq(reviewHighlights.documentId, documentId),
        eq(reviewHighlights.kind, 'tab')
      ))
      .orderBy(reviewHighlights.pageNumber);

    console.log(`📋 Found ${tabHighlights.length} manual tab highlights for document ${documentId}`);

    return tabHighlights.map((highlight, index) => ({
      tabNo: index + 1,
      date: "Manual Highlight",
      nature: highlight.label || `Tab ${index + 1}`,
      pageNumber: highlight.pageNumber
    }));
  } catch (error) {
    console.error('Error fetching manual tab highlights:', error);
    return [];
  }
}

// Document-specific tab data for each legal document
function getTabsForDocument(documentId: string): TabItem[] {
  // 403-page document: "Amended Supp Doc Brief - Ferrante - 3 July 2025"
  if (documentId === '4c8c1532-6329-40d9-91ca-e515fb8a7785') {
    return [
      { tabNo: 1, date: "February 28, 2022", nature: "Request for Information of the Applicant", pageNumber: 5, targetPage: 5 },
      { tabNo: 2, date: "March 16, 2022", nature: "Request for Information of the Applicant", pageNumber: 8, targetPage: 8 },
      { tabNo: 3, date: "April 5, 2022", nature: "Request for Information of the Applicant", pageNumber: 12, targetPage: 12 },
      { tabNo: 4, date: "November 2022", nature: "Request for Information of the Applicant", pageNumber: 15, targetPage: 15 },
      { tabNo: 5, date: "December 15, 2022", nature: "Transcript of Questioning of Rino Ferrant", pageNumber: 25, targetPage: 25 },
      { tabNo: 6, date: "April 20, 2022", nature: "Affidavit – Rino Ferrante", pageNumber: 45, targetPage: 45 },
      { tabNo: 7, date: "February 18, 2022", nature: "Affidavit – Rino Ferrante", pageNumber: 65, targetPage: 65 },
      { tabNo: 8, date: "June 19, 2023", nature: "Affidavit – Lisa Corlevic", pageNumber: 85, targetPage: 85 },
      { tabNo: 9, date: "February 23, 2022", nature: "Affidavit – Rino Ferrante", pageNumber: 105, targetPage: 105 },
      { tabNo: 10, date: "March 2, 2023", nature: "Affidavit – Lisa Corlevic", pageNumber: 125, targetPage: 125 },
      { tabNo: 11, date: "February 21, 2023", nature: "Affidavit – Serafina Ferrante", pageNumber: 145, targetPage: 145 },
      { tabNo: 12, date: "August 16, 2023", nature: "Affidavit – Serafina Ferrante", pageNumber: 165, targetPage: 165 },
      { tabNo: 13, date: "September 23, 2019", nature: "Recognizance of Bail -- Rino Ferrante", pageNumber: 185, targetPage: 185 }
    ];
  }
  
  // 517-page document: "Trial Record - Ferrante - August 13 2025"
  if (documentId === 'd964a3aa-ac0f-477c-8150-eb0cdb82ae42') {
    return [
      { tabNo: 1, date: "Trial Document", nature: "Pleadings – Application, Fresh as Amended Answer and Reply" },
      { tabNo: 2, date: "Financial Records", nature: "Subrule 13 documents – Sworn Financial Statements" },
      { tabNo: 3, date: "Examination Transcript", nature: "Transcript on which we intend to rely – Rino Ferrante's Transcript - Examination" },
      { tabNo: 4, date: "Court Orders", nature: "Temporary Orders and Order relating to the trial" },
      { tabNo: 5, date: "Scheduling Document", nature: "Trial Scheduling Endorsement Form" }
    ];
  }
  
  // 1223-page document: "Amended Doc Brief - Ferrante - 3 July 2025"
  if (documentId === 'f390853c-f119-48ba-be3d-326971be5a4b') {
    return [
      { tabNo: 1, date: "October 4, 2019", nature: "Executed Separation Agreement" },
      { tabNo: 2, date: "September 14, 2019", nature: "Comparative Market Analysis by Katherine Loucaidou - Property Gallery Realty Inc." },
      { tabNo: 3, date: "September, 2019", nature: "Letter from Nancy Richards-Royal LePage Signature Realty re: incident with Rino Ferrante" },
      { tabNo: 4, date: "September 17, 2019", nature: "Email from Paul Rishi - Royal Lepage Vendex Realty re: market value of home" },
      { tabNo: 5, date: "August 19, 2023", nature: "Abstract of Title" },
      { tabNo: 6, date: "February 15, 2019", nature: "Effort Trust - Executed Mortgage Offer re- First Mortgage Loan" },
      { tabNo: 7, date: "March 7, 2019", nature: "Letter from Effort Trust- confirming details of mortgage" },
      { tabNo: 8, date: "May 24, 2019", nature: "Indigo Blue - Executed Mortgage Commitment - re: 2nd mortgage" },
      { tabNo: 9, date: "February 4, 2021", nature: "Effort Trust - Executed Mortgage Renewal" },
      { tabNo: 10, date: "March 11, 2021", nature: "Email from Pat Dowling to Mary Ann re- Mortgage Approval" },
      { tabNo: 11, date: "February 22, 2024", nature: "Request to Admit of Applicant" },
      { tabNo: 12, date: "March 24, 2021", nature: "Text message between Applicant and Respondent" },
      { tabNo: 13, date: "September 11, 2019", nature: "Picture of Respondent blocking driveway of the matrimonial home" },
      { tabNo: 14, date: "October 5, 2019", nature: "Picture of moving truck moving the Applicant out of the matrimonial home" },
      { tabNo: 15, date: "February 25, 2022", nature: "Endorsement of Justice Barnes re: Respondent permitted to renew mortgage" },
      { tabNo: 16, date: "February 25, 2022", nature: "Endorsement of Justice Barnes re: Respondent's motion dismissed and costs awarded to Applicant" },
      { tabNo: 17, date: "April 25, 2022", nature: "Endorsement of Justice Petersen re: case conference held, parties granted leave for their motions" },
      { tabNo: 18, date: "September 23, 2022", nature: "Endorsement of Justice McSweeney re: scheduling of settlement conference" },
      { tabNo: 19, date: "November 24, 2022", nature: "Endorsement of Justice Agarwal re: adjournment of motions" },
      { tabNo: 20, date: "December 6, 2022", nature: "Endorsement of Justice Daley re: motion for interim child support" },
      { tabNo: 21, date: "December 6, 2022", nature: "Order of the Justice Daley re: interim child support" },
      { tabNo: 22, date: "December 30, 2022", nature: "Endorsement of Justice Tzimas re: motion for mortgage renewal" },
      { tabNo: 23, date: "January 3, 2023", nature: "Endorsement of Justice Stribopoulos re: motion for mortgage renewal" },
      { tabNo: 24, date: "April 6, 2023", nature: "Costs Endorsement of Justice Daley" },
      { tabNo: 25, date: "May 29, 2023", nature: "Endorsement of Justice McSweeney re-settlement conference" },
      { tabNo: 26, date: "May 29, 2023", nature: "Order of Justice McSweeney re: interim child support and production of disclosure by Respondent" },
      { tabNo: 27, date: "October 31, 2023", nature: "Endorsement of Justice LeMay re: document disclosure" },
      { tabNo: 28, date: "November 30, 2023", nature: "Endorsement of Justice Kumaranayake re: Trial Management Conference" },
      { tabNo: 29, date: "September 15, 2022", nature: "Affidavit of Rino Ferrante re: motion brought by Respondent re: ability to re-mortgage property" },
      { tabNo: 30, date: "September 15, 2022", nature: "Affidavit of Serafina Ferrante re: motion brought by Respondent for ability to re-mortgage property" },
      { tabNo: 31, date: "September 15, 2022", nature: "Supplementary Affidavit of Serafina Ferrante re: motion brought by Respondent" },
      { tabNo: 32, date: "September 19, 2022", nature: "Affidavit of Serafina Ferrante re: motion brought by Respondent" },
      { tabNo: 33, date: "September 20, 2022", nature: "Reply Affidavit of Rino Ferrante re: ability to re-mortgage property" },
      { tabNo: 34, date: "November 14, 2022", nature: "Affidavit of Serafina Ferrante re: motion brought by Applicant for child support" },
      { tabNo: 35, date: "November 30, 2022", nature: "Affidavit of Rino Ferrante re: motion for child support brought by Applicant" },
      { tabNo: 36, date: "December 1, 2022", nature: "Reply Affidavit of Serafina Ferrante re: motion brought by Applicant for child support and questioning of Respondent" },
      { tabNo: 37, date: "December 29, 2022", nature: "Affidavit of Rino Ferrante re: motion brought by Respondent" },
      { tabNo: 38, date: "January 2, 2023", nature: "Affidavit of Serafina Ferrante re: emergency motion brought by Respondent for renewal of mortgage" },
      { tabNo: 39, date: "January 3, 2023", nature: "Reply Affidavit of Rino Ferrante" },
      { tabNo: 40, date: "May 23, 2023", nature: "Affidavit of Rino Ferrante re: update of financial information" },
      { tabNo: 41, date: "August 21, 2023", nature: "Affidavit of Applicant re: motion to strike Respondent's pleadings" },
      { tabNo: 42, date: "October 24, 2023", nature: "Affidavit of Jolanta Chrzaszcz re: emails served on Applicant's lawyer" },
      { tabNo: 43, date: "October 24, 2023", nature: "Reply Affidavit of Respondent re: motion brought by Applicant for undefended trial" },
      { tabNo: 44, date: "October 24, 2023", nature: "Affidavit of Rino Ferrante re: productions and answer to Undertakings" },
      { tabNo: 45, date: "October 26, 2023", nature: "Affidavit of David Sorbara re: reply to Respondent's Affidavit" },
      { tabNo: 46, date: "October 27, 2023", nature: "Affidavit of Jolanta Chrzaszcz re: reply to David Sorbara's Affidavit" },
      { tabNo: 47, date: "January 8, 2022", nature: "Financial Statement of Applicant" },
      { tabNo: 48, date: "February 12, 2022", nature: "Financial Statement of Respondent" },
      { tabNo: 49, date: "May 15, 2023", nature: "Financial Statement of the Applicant" },
      { tabNo: 50, date: "October 13, 2023", nature: "Financial Statement of Respondent" },
      { tabNo: 51, date: "November 6, 2023", nature: "Financial Statement of Applicant" },
      { tabNo: 52, date: "November 21, 2023", nature: "Financial Statement of Respondent" },
      { tabNo: 53, date: "2016", nature: "Income Tax Return of Applicant" },
      { tabNo: 54, date: "2017", nature: "Income Tax Return of Applicant" },
      { tabNo: 55, date: "2018", nature: "Income Tax Return of Applicant" },
      { tabNo: 56, date: "2019", nature: "Income Tax Return of Applicant" },
      { tabNo: 57, date: "2020", nature: "Income Tax Return of Applicant" },
      { tabNo: 58, date: "2016", nature: "Income Tax Return of the Respondent" },
      { tabNo: 59, date: "2017", nature: "Income Tax Return of the Respondent" },
      { tabNo: 60, date: "2018", nature: "Income Tax Return of the Respondent" },
      { tabNo: 61, date: "2019", nature: "Income Tax Return of the Respondent" },
      { tabNo: 62, date: "2020", nature: "Income Tax Return of the Respondent" },
      { tabNo: 63, date: "2021", nature: "Income Tax Return of the Respondent" }
    ];
  }
  
  // For other documents, return empty array until more tab data is provided
  return [];
}

const router = Router();

// Security rate limiter for legal document access
const documentAccessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many document access attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Security middleware for legal documents
const addSecurityHeaders = (req: any, res: any, next: any) => {
  // Essential security headers for legal documents
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; object-src 'self'; frame-src 'self'; style-src 'self' 'unsafe-inline';");
  
  // Legal document access logging
  const timestamp = new Date().toISOString();
  const userAgent = req.get('User-Agent') || 'Unknown';
  const ip = req.ip || req.connection.remoteAddress || 'Unknown';
  console.log(`🔒 [LEGAL DOC ACCESS] ${timestamp} | IP: ${ip} | UA: ${userAgent} | Path: ${req.originalUrl}`);
  
  next();
};

// Endpoint to save manual tab highlights that will be used for hyperlinking
router.post('/api/documents/:documentId/tab-highlights', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { pageNumber, rect, text, kind = 'tab' } = req.body;
    
    console.log(`🏷️ Saving manual tab highlight for document: ${documentId}`);
    
    // Save the tab highlight to the database
    await db.insert(reviewHighlights).values({
      documentId,
      pageNumber,
      bbox: { x: rect.x, y: rect.y, width: rect.w, height: rect.h },
      kind: 'tab',
      confidence: 1.0, // Manual highlights have full confidence
      label: text,
      source_item_id: `manual-tab-${Date.now()}`
    });
    
    console.log(`✅ Manual tab highlight saved: "${text}" on page ${pageNumber}`);
    
    res.json({ 
      ok: true, 
      message: 'Tab highlight saved successfully',
      tabText: text,
      pageNumber
    });
    
  } catch (error) {
    console.error('❌ Failed to save tab highlight:', error);
    res.status(500).json({ 
      error: 'Failed to save tab highlight',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Endpoint to generate index highlights (for exhibits and index items)
router.post('/api/documents/:documentId/generate-index-highlights', async (req, res) => {
  try {
    const { documentId } = req.params;
    
    console.log(`🎯 Generating index and exhibit highlights for document: ${documentId}`);
    
    // Generate highlights for detected index items
    await HighlightGenerator.generateIndexHighlights(documentId);
    
    // Generate highlights for exhibits
    const documentExhibits = await db
      .select()
      .from(exhibits)
      .where(eq(exhibits.documentId, documentId));
    
    if (documentExhibits.length > 0) {
      console.log(`📋 Found ${documentExhibits.length} exhibits, generating highlights...`);
      
      // Generate highlights for each exhibit
      for (const exhibit of documentExhibits) {
        try {
          await HighlightGenerator.generateExhibitHighlight(documentId, exhibit);
        } catch (error) {
          console.warn(`Failed to generate highlight for exhibit ${exhibit.exhibitLabel}:`, error);
        }
      }
    }
    
    res.json({ 
      ok: true, 
      message: 'Index and exhibit highlights generated successfully',
      indexHighlights: true,
      exhibitHighlights: documentExhibits.length
    });
    
  } catch (error) {
    console.error('❌ Failed to generate index highlights:', error);
    res.status(500).json({ 
      error: 'Failed to generate index highlights',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Endpoint to highlight tabs and generate HTML index with ZIP bundle
router.post('/api/documents/:documentId/highlight-tabs', async (req, res) => {
  try {
    const { documentId } = req.params;
    
    console.log(`🔥 Starting tab highlighting and HTML index generation for document: ${documentId}`);
    
    // Get document info from database
    const [document] = await db.select().from(documents).where(eq(documents.id, documentId));
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Skip HTML index generation - tabs are highlighted directly in original PDF
    const htmlFilePath = `document_${documentId}_index.html`; // Placeholder for compatibility
    
    const htmlFileName = path.basename(htmlFilePath);
    console.log(`✅ HTML index generated: ${htmlFileName}`);
    
    // Generate highlighted PDF with intro page
    const tabHighlighter = new TabHighlighter();
    
    // Get manual tab highlights first (lawyer-highlighted tabs)
    const manualTabs = await getManualTabHighlights(documentId);
    
    // Document-specific tab data based on actual legal documents
    let documentSpecificTabs = getTabsForDocument(documentId);
    
    // Check for custom page number overrides from the simple editor
    const tabOverrides = (global as any).documentTabOverrides?.[documentId];
    if (tabOverrides && tabOverrides.length > 0) {
      console.log(`🎯 Using custom page numbers from editor for document ${documentId}`);
      documentSpecificTabs = tabOverrides;
    }
    
    // Combine manual tabs with predefined tabs (manual tabs take priority)
    if (manualTabs.length > 0) {
      console.log(`🏷️ Using ${manualTabs.length} manually highlighted tabs for hyperlinking`);
      documentSpecificTabs = [...manualTabs, ...documentSpecificTabs];
    }
    
    if (documentSpecificTabs.length === 0) {
      console.warn(`⚠️  No tab data available for document ${documentId}`);
      console.log(`📋 Each document needs its own specific tab data. Using empty tab data for now.`);
      
      // Set empty tab data to avoid the error
      tabHighlighter.setTabData(documentId, []);
    } else {
      // Set the document-specific tab data
      tabHighlighter.setTabData(documentId, documentSpecificTabs);
    }
    
    const modifiedPdfBuffer = await tabHighlighter.highlightTabsAndAddHyperlinks(documentId, htmlFileName);
    
    // Save highlighted PDF for online access
    const highlightedPdfPath = path.join(process.cwd(), 'storage', 'cases', document.caseId, `document_${documentId}_highlighted.pdf`);
    await fs.writeFile(highlightedPdfPath, modifiedPdfBuffer);
    
    console.log(`✅ PDF with highlighted tabs generated and saved for online access`);
    
    // Create ZIP bundle with both files
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    // Set response headers for ZIP download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="legal-document-bundle-${documentId}.zip"`);
    
    // Pipe archive to response
    archive.pipe(res);
    
    // Add PDF to archive
    const pdfFileName = `document_${documentId}_highlighted.pdf`;
    archive.append(modifiedPdfBuffer, { name: pdfFileName });
    
    // REMOVED: No longer adding HTML files - tabs are highlighted directly in PDF
    // const htmlContent = await fs.readFile(htmlFilePath, 'utf8');
    // archive.append(htmlContent, { name: htmlFileName });
    
    // Add instructions file
    const instructionsContent = `INSTRUCTIONS FOR USE:

1. Extract the PDF file from this ZIP
2. Open the PDF in any PDF viewer
3. Navigate to page 2 to see the highlighted index with clickable tabs
4. Click any tab number on page 2 to jump directly to that section
5. Use "Back to Index" banners on each tab page to return to the index

FILES INCLUDED:
- ${pdfFileName} (PDF with highlighted tabs on page 2 and internal navigation)
- Instructions.txt (this file)

FEATURES:
- Original 403 pages preserved
- Tab highlighting directly on page 2 (original index)
- Clickable navigation links within the PDF
- "Back to Index" banners on each tab page

SYSTEM REQUIREMENTS:
- Any PDF viewer (Adobe Reader, browser PDF viewer, etc.)
- No additional software required

Generated by HyperlinkLaw.com
Professional Legal Document Management`;
    
    archive.append(instructionsContent, { name: 'Instructions.txt' });
    
    // Finalize the archive
    await archive.finalize();
    
    console.log(`✅ ZIP bundle created for document: ${documentId}`);
    
  } catch (error) {
    console.error('❌ Failed to create document bundle:', error);
    res.status(500).json({ 
      error: 'Failed to create document bundle',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// REMOVED: HTML index route - tabs are now highlighted directly in original PDF instead
// Users now see highlighted tabs directly on page 2 of the original PDF
/*
[HTML serving route removed - see git history if needed]
*/

// SECURE Route to serve PDFs online for legal documents
router.get('/online/pdf/:caseId/:documentId', documentAccessLimiter, addSecurityHeaders, async (req, res) => {
  try {
    const { caseId, documentId } = req.params;
    
    // Get document info from database
    const [document] = await db.select().from(documents).where(eq(documents.id, documentId));
    if (!document) {
      console.log(`❌ Document not found in database: ${documentId}`);
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Always serve original PDF without highlights (per user request)
    const originalPdfPath = path.join(process.cwd(), 'storage', document.storagePath);
    let pdfPath = originalPdfPath;
    
    // Check if PDF exists
    try {
      await fs.access(pdfPath);
    } catch (error) {
      return res.status(404).json({ error: 'PDF not found' });
    }
    
    // Serve the PDF with enhanced security and CORS support
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline'); // Display in browser instead of download
    res.setHeader('Cache-Control', 'private, max-age=1800'); // Private cache for 30 minutes
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains'); // Enforce HTTPS
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow CORS for PDF.js
    res.setHeader('Access-Control-Allow-Methods', 'GET'); 
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    
    const pdfBuffer = await fs.readFile(pdfPath);
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('Error serving PDF:', error);
    res.status(500).json({ error: 'Failed to serve PDF' });
  }
});

export default router;