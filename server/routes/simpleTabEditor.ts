import { Router } from 'express';
import { documents } from '@shared/schema';
import { db } from '../db.js';
import { eq } from 'drizzle-orm';

const router = Router();

interface TabItem {
  tabNo: number;
  date: string;
  nature: string;
  targetPage?: number;
}

// Document-specific tab data (same as tabHighlighter.ts but accessible for editing)
function getTabsForDocument(documentId: string): TabItem[] {
  // 403-page document: "Amended Supp Doc Brief - Ferrante - 3 July 2025"
  if (documentId === '4c8c1532-6329-40d9-91ca-e515fb8a7785') {
    return [
      { tabNo: 1, date: "February 28, 2022", nature: "Request for Information of the Applicant", targetPage: 5 },
      { tabNo: 2, date: "March 16, 2022", nature: "Request for Information of the Applicant", targetPage: 8 },
      { tabNo: 3, date: "April 5, 2022", nature: "Request for Information of the Applicant", targetPage: 12 },
      { tabNo: 4, date: "November 2022", nature: "Request for Information of the Applicant", targetPage: 15 },
      { tabNo: 5, date: "December 15, 2022", nature: "Transcript of Questioning of Rino Ferrant", targetPage: 25 },
      { tabNo: 6, date: "April 20, 2022", nature: "Affidavit – Rino Ferrante", targetPage: 45 },
      { tabNo: 7, date: "February 18, 2022", nature: "Affidavit – Rino Ferrante", targetPage: 65 },
      { tabNo: 8, date: "June 19, 2023", nature: "Affidavit – Lisa Corlevic", targetPage: 85 },
      { tabNo: 9, date: "February 23, 2022", nature: "Affidavit – Rino Ferrante", targetPage: 105 },
      { tabNo: 10, date: "March 2, 2023", nature: "Affidavit – Lisa Corlevic", targetPage: 125 },
      { tabNo: 11, date: "February 21, 2023", nature: "Affidavit – Serafina Ferrante", targetPage: 145 },
      { tabNo: 12, date: "August 16, 2023", nature: "Affidavit – Serafina Ferrante", targetPage: 165 },
      { tabNo: 13, date: "September 23, 2019", nature: "Recognizance of Bail -- Rino Ferrante", targetPage: 185 }
    ];
  }
  
  // 517-page document: "Trial Record - Ferrante - August 13 2025" - ONLY 5 LINKS
  if (documentId === 'd964a3aa-ac0f-477c-8150-eb0cdb82ae42' || documentId === 'b5d731f8-1f87-451b-96ba-c4a38bd33fbe') {
    return [
      { tabNo: 1, date: "Trial Document", nature: "Pleadings – Application, Fresh as Amended Answer and Reply", targetPage: 10 },
      { tabNo: 2, date: "Financial Records", nature: "Subrule 13 documents – Sworn Financial Statements", targetPage: 50 },
      { tabNo: 3, date: "Examination Transcript", nature: "Transcript on which we intend to rely – Rino Ferrante's Transcript - Examination", targetPage: 100 },
      { tabNo: 4, date: "Court Orders", nature: "Temporary Orders and Order relating to the trial", targetPage: 200 },
      { tabNo: 5, date: "Scheduling Document", nature: "Trial Scheduling Endorsement Form", targetPage: 300 }
    ];
  }
  
  // 1223-page document: "Amended Doc Brief - Ferrante - 3 July 2025" - USER'S EXACT 63 TABS
  if (documentId === 'f390853c-f119-48ba-be3d-326971be5a4b') {
    return [
      { tabNo: 1, date: "October 4, 2019", nature: "Executed Separation Agreement (Applicant disputes content of document and requires proof in its entirety)", targetPage: 25 },
      { tabNo: 2, date: "September 14, 2019", nature: "Comparative Market Analysis by Katherine Loucaidou - Property Gallery Realty Inc. (contents admitted as truth by Applicant and Respondent)", targetPage: 45 },
      { tabNo: 3, date: "September, 2019", nature: "Letter from Nancy Richards-Royal LePage Signature Realty re: incident with Rino Ferrante (content admitted as truth by Applicant)", targetPage: 55 },
      { tabNo: 4, date: "September 17, 2019", nature: "Email from Paul Rishi - Royal Lepage Vendex Realty re: market value of home (contents admitted as truth by Applicant)", targetPage: 65 },
      { tabNo: 5, date: "August 19, 2023", nature: "Abstract of Title (contents admitted as truth by Applicant and Respondent)", targetPage: 75 },
      { tabNo: 6, date: "February 15, 2019", nature: "Effort Trust - Executed Mortgage Offer re- First Mortgage Loan (contents admitted as truth by Applicant and Respondent)", targetPage: 95 },
      { tabNo: 7, date: "March 7, 2019", nature: "Letter from Effort Trust- confirming details of mortgage (contents admitted as truth by Applicant and Respondent)", targetPage: 115 },
      { tabNo: 8, date: "May 24, 2019", nature: "Indigo Blue - Executed Mortgage Commitment - re: 2nd mortgage (contents admitted as truth by Applicant and Respondent)", targetPage: 125 },
      { tabNo: 9, date: "February 4, 2021", nature: "Effort Trust - Executed Mortgage Renewal (contents admitted as truth by Applicant and Respondent)", targetPage: 135 },
      { tabNo: 10, date: "March 11, 2021", nature: "Email from Pat Dowling to Mary Ann re- Mortgage Approval (contents admitted as truth by the Applicant)", targetPage: 145 },
      { tabNo: 11, date: "February 22, 2024", nature: "Request to Admit of Applicant (facts and documents have been admitted as truth by Respondent as Respondent did not respond to Request to Admit)", targetPage: 155 },
      { tabNo: 12, date: "March 24, 2021", nature: "Text message between Applicant and Respondent, wherein the Respondent asks the Applicant 'what time can I come by?' (content admitted as truth by Applicant and Respondent)", targetPage: 175 },
      { tabNo: 13, date: "September 11, 2019", nature: "Picture of Respondent blocking driveway of the matrimonial home, not allowing the Applicant to leave (document has been admitted as truth by Applicant and Respondent)", targetPage: 185 },
      { tabNo: 14, date: "October 5, 2019", nature: "Picture of moving truck moving the Applicant out of the matrimonial home (document has been admitted as truth by Applicant and Respondent)", targetPage: 195 },
      { tabNo: 15, date: "February 25, 2022", nature: "Endorsement of Justice Barnes re: Respondent permitted to renew mortgage", targetPage: 205 },
      { tabNo: 16, date: "February 25, 2022", nature: "Endorsement of Justice Barnes re: Respondent's motion dismissed and costs awarded to Applicant", targetPage: 215 },
      { tabNo: 17, date: "April 25, 2022", nature: "Endorsement of Justice Petersen re: case conference held, parties granted leave for their motions", targetPage: 225 },
      { tabNo: 18, date: "September 23, 2022", nature: "Endorsement of Justice McSweeney re: scheduling of settlement conference", targetPage: 235 },
      { tabNo: 19, date: "November 24, 2022", nature: "Endorsement of Justice Agarwal re: adjournment of motions", targetPage: 245 },
      { tabNo: 20, date: "December 6, 2022", nature: "Endorsement of Justice Daley re: motion for interim child support", targetPage: 255 },
      { tabNo: 21, date: "December 6, 2022", nature: "Order of the Justice Daley re: interim child support", targetPage: 265 },
      { tabNo: 22, date: "December 30, 2022", nature: "Endorsement of Justice Tzimas re: motion for mortgage renewal", targetPage: 275 },
      { tabNo: 23, date: "January 3, 2023", nature: "Endorsement of Justice Stribopoulos re: motion for mortgage renewal", targetPage: 285 },
      { tabNo: 24, date: "April 6, 2023", nature: "Costs Endorsement of Justice Daley", targetPage: 295 },
      { tabNo: 25, date: "May 29, 2023", nature: "Endorsement of Justice McSweeney re-settlement conference", targetPage: 305 },
      { tabNo: 26, date: "May 29, 2023", nature: "Order of Justice McSweeney re: interim child support and production of disclosure by Respondent", targetPage: 315 },
      { tabNo: 27, date: "October 31, 2023", nature: "Endorsement of Justice LeMay re: document disclosure", targetPage: 325 },
      { tabNo: 28, date: "November 30, 2023", nature: "Endorsement of Justice Kumaranayake re: Trial Management Conference", targetPage: 335 },
      { tabNo: 29, date: "September 15, 2022", nature: "Affidavit of Rino Ferrante re: motion brought by Respondent re: ability to re-mortgage property (document must be proved in its entirety by Respondent)", targetPage: 345 },
      { tabNo: 30, date: "September 15, 2022", nature: "Affidavit of Serafina Ferrante re: motion brought by Respondent for ability to re-mortgage property (contents admitted as truth by the Applicant)", targetPage: 365 },
      { tabNo: 31, date: "September 15, 2022", nature: "Supplementary Affidavit of Serafina Ferrante re: motion brought by Respondent (contents admitted as truth by the Applicant)", targetPage: 385 },
      { tabNo: 32, date: "September 19, 2022", nature: "Affidavit of Serafina Ferrante re: motion brought by Respondent (contents admitted as truth by the Applicant)", targetPage: 405 },
      { tabNo: 33, date: "September 20, 2022", nature: "Reply Affidavit of Rino Ferrante re: ability to re-mortgage property (document must be proved in its entirety by Respondent)", targetPage: 425 },
      { tabNo: 34, date: "November 14, 2022", nature: "Affidavit of Serafina Ferrante re: motion brought by Applicant for child support (contents admitted as truth by the Applicant)", targetPage: 445 },
      { tabNo: 35, date: "November 30, 2022", nature: "Affidavit of Rino Ferrante re: motion for child support brought by Applicant (document must be proved in its entirety by Respondent)", targetPage: 465 },
      { tabNo: 36, date: "December 1, 2022", nature: "Reply Affidavit of Serafina Ferrante re: motion brought by Applicant for child support and questioning of Respondent (contents admitted as truth by the Applicant)", targetPage: 485 },
      { tabNo: 37, date: "December 29, 2022", nature: "Affidavit of Rino Ferrante re: motion brought by Respondent (document must be proved in its entirety by Respondent)", targetPage: 505 },
      { tabNo: 38, date: "January 2, 2023", nature: "Affidavit of Serafina Ferrante re: emergency motion brought by Respondent for renewal of mortgage (contents admitted as truth by the Applicant)", targetPage: 525 },
      { tabNo: 39, date: "January 3, 2023", nature: "Reply Affidavit of Rino Ferrante (document must be proved in its entirety by Respondent)", targetPage: 545 },
      { tabNo: 40, date: "May 23, 2023", nature: "Affidavit of Rino Ferrante re: update of financial information (document must be proved in its entirety by Respondent)", targetPage: 565 },
      { tabNo: 41, date: "August 21, 2023", nature: "Affidavit of Applicant re: motion to strike Respondent's pleadings (contents admitted as truth by the Applicant)", targetPage: 585 },
      { tabNo: 42, date: "October 24, 2023", nature: "Affidavit of Jolanta Chrzaszcz re: emails served on Applicant's lawyer (document must be proved in its entirety by Respondent)", targetPage: 605 },
      { tabNo: 43, date: "October 24, 2023", nature: "Reply Affidavit of Respondent re: motion brought by Applicant for undefended trial (document must be proved in its entirety by Respondent)", targetPage: 625 },
      { tabNo: 44, date: "October 24, 2023", nature: "Affidavit of Rino Ferrante re: productions and answer to Undertakings (document must be proved in its entirety by Respondent)", targetPage: 645 },
      { tabNo: 45, date: "October 26, 2023", nature: "Affidavit of David Sorbara re: reply to Respondent's Affidavit (contents admitted as truth by the Applicant)", targetPage: 665 },
      { tabNo: 46, date: "October 27, 2023", nature: "Affidavit of Jolanta Chrzaszcz re: reply to David Sorbara's Affidavit (document must be proved in its entirety by Respondent)", targetPage: 685 },
      { tabNo: 47, date: "January 8, 2022", nature: "Financial Statement of Applicant (contents admitted as truth by the Applicant)", targetPage: 705 },
      { tabNo: 48, date: "February 12, 2022", nature: "Financial Statement of Respondent (document must be proved in its entirety by Respondent)", targetPage: 725 },
      { tabNo: 49, date: "May 15, 2023", nature: "Financial Statement of the Applicant (contents admitted as truth by the Applicant)", targetPage: 745 },
      { tabNo: 50, date: "October 13, 2023", nature: "Financial Statement of Respondent (document must be proved in its entirety by Respondent)", targetPage: 765 },
      { tabNo: 51, date: "November 6, 2023", nature: "Financial Statement of Applicant (contents admitted as truth by the Applicant)", targetPage: 785 },
      { tabNo: 52, date: "November 21, 2023", nature: "Financial Statement of Respondent (document must be proved in its entirety by Respondent)", targetPage: 805 },
      { tabNo: 53, date: "2016", nature: "Income Tax Return of Applicant (contents admitted as truth by the Applicant)", targetPage: 825 },
      { tabNo: 54, date: "2017", nature: "Income Tax Return of Applicant (contents admitted as truth by the Applicant)", targetPage: 845 },
      { tabNo: 55, date: "2018", nature: "Income Tax Return of Applicant (contents admitted as truth by the Applicant)", targetPage: 865 },
      { tabNo: 56, date: "2019", nature: "Income Tax Return of Applicant (contents admitted as truth by the Applicant)", targetPage: 885 },
      { tabNo: 57, date: "2020", nature: "Income Tax Return of Applicant (contents admitted as truth by the Applicant)", targetPage: 905 },
      { tabNo: 58, date: "2016", nature: "Income Tax Return of the Respondent (document must be proved in its entirety by Respondent)", targetPage: 925 },
      { tabNo: 59, date: "2017", nature: "Income Tax Return of the Respondent (document must be proved in its entirety by Respondent)", targetPage: 945 },
      { tabNo: 60, date: "2018", nature: "Income Tax Return of the Respondent (document must be proved in its entirety by Respondent)", targetPage: 965 },
      { tabNo: 61, date: "2019", nature: "Income Tax Return of the Respondent (document must be proved in its entirety by Respondent)", targetPage: 985 },
      { tabNo: 62, date: "2020", nature: "Income Tax Return of the Respondent (document must be proved in its entirety by Respondent)", targetPage: 1005 },
      { tabNo: 63, date: "2021", nature: "Income Tax Return of the Respondent (document must be proved in its entirety by Respondent)", targetPage: 1025 }
    ];
  }
  
  // For other documents, return empty array
  return [];
}

// Get tabs for a document
router.get('/api/documents/:documentId/tabs', async (req, res) => {
  try {
    const { documentId } = req.params;
    
    const tabs = getTabsForDocument(documentId);
    
    res.json({ 
      documentId,
      tabs,
      count: tabs.length
    });
    
  } catch (error) {
    console.error('Error fetching tabs:', error);
    res.status(500).json({ error: 'Failed to fetch tabs' });
  }
});

// Update tabs with new page numbers
router.post('/api/documents/:documentId/update-tabs', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { tabs } = req.body;
    
    console.log(`🔄 Updating tabs for document ${documentId} with new page numbers`);
    console.log(`📝 Updated ${tabs.length} tabs with custom page numbers`);
    
    // Store updated tabs in memory (could be stored in database for persistence)
    // For now, the tabs will be used in the next regeneration call
    (global as any).documentTabOverrides = (global as any).documentTabOverrides || {};
    (global as any).documentTabOverrides[documentId] = tabs;
    
    res.json({ 
      success: true, 
      message: `Updated ${tabs.length} tabs`,
      documentId 
    });
    
  } catch (error) {
    console.error('Error updating tabs:', error);
    res.status(500).json({ error: 'Failed to update tabs' });
  }
});

// Update single tab page number from inline editor
router.post('/api/documents/:documentId/update-tab-page', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { tabNo, newPage, caseId } = req.body;
    
    console.log(`🎯 [API] Inline edit request received:`);
    console.log(`   Document ID: ${documentId}`);
    console.log(`   Tab Number: ${tabNo}`);
    console.log(`   New Page: ${newPage}`);
    console.log(`   Case ID: ${caseId}`);
    
    // Get current tabs for the document
    const currentTabs = getTabsForDocument(documentId);
    
    if (currentTabs.length === 0) {
      return res.status(404).json({ error: 'No tabs found for this document' });
    }
    
    // Update the specific tab with new page number
    const updatedTabs = currentTabs.map(tab => 
      tab.tabNo === tabNo 
        ? { ...tab, targetPage: newPage }
        : tab
    );
    
    // Store updated tabs globally
    (global as any).documentTabOverrides = (global as any).documentTabOverrides || {};
    (global as any).documentTabOverrides[documentId] = updatedTabs;
    
    // Regenerate the HTML index with updated page numbers
    const { HtmlIndexGenerator } = await import('../services/htmlIndexGenerator.js');
    const htmlGenerator = new HtmlIndexGenerator();
    
    // Update the generator's tabs with the new data
    (htmlGenerator as any).tabs = updatedTabs.map(tab => ({
      tabNo: tab.tabNo,
      date: tab.date,
      nature: tab.nature,
      pageNumber: tab.targetPage || 1
    }));
    
    // Get document info for title
    const document = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
    const documentTitle = document[0]?.title || 'Legal Document';
    
    // Regenerate and save HTML index
    await htmlGenerator.saveHtmlIndex(caseId, documentId, documentTitle);
    
    console.log(`✅ Inline edit complete: Tab ${tabNo} now links to page ${newPage}`);
    
    res.json({ 
      success: true, 
      message: `Tab ${tabNo} updated to page ${newPage}`,
      updatedTab: { tabNo, newPage }
    });
    
  } catch (error) {
    console.error('Error updating tab page:', error);
    res.status(500).json({ error: 'Failed to update tab page' });
  }
});

export { router as simpleTabEditorRouter };