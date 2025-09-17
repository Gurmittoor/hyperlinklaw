import fs from 'fs/promises';
import path from 'path';

interface TabData {
  tabNo: number;
  date: string;
  nature: string;
  pageNumber: number; // The actual page in the PDF where this tab appears
  targetPage?: number; // The page to link to in hyperlinks
}

export class HtmlIndexGenerator {
  private documentId: string = '';
  private tabs: TabData[] = [
    { tabNo: 1, date: "February 28, 2022", nature: "Request for Information of the Applicant", pageNumber: 5 },
    { tabNo: 2, date: "March 16, 2022", nature: "Request for Information of the Applicant", pageNumber: 8 },
    { tabNo: 3, date: "April 5, 2022", nature: "Request for Information of the Applicant", pageNumber: 12 },
    { tabNo: 4, date: "November 2022", nature: "Request for Information of the Applicant", pageNumber: 15 },
    { tabNo: 5, date: "December 15, 2022", nature: "Transcript of Questioning of Rino Ferrant", pageNumber: 18 },
    { tabNo: 6, date: "April 20, 2022", nature: "Affidavit – Rino Ferrante", pageNumber: 25 },
    { tabNo: 7, date: "February 18, 2022", nature: "Affidavit – Rino Ferrante", pageNumber: 30 },
    { tabNo: 8, date: "June 19, 2023", nature: "Affidavit – Lisa Corlevic", pageNumber: 35 },
    { tabNo: 9, date: "February 23, 2022", nature: "Affidavit – Lisa Corlevic", pageNumber: 40 },
    { tabNo: 10, date: "March 2, 2023", nature: "Affidavit – Lisa Corlevic", pageNumber: 45 },
    { tabNo: 11, date: "February 21, 2023", nature: "Affidavit – Serafina Ferrante", pageNumber: 50 },
    { tabNo: 12, date: "August 16, 2023", nature: "Affidavit – Serafina Ferrante", pageNumber: 55 },
    { tabNo: 13, date: "September 23, 2019", nature: "Recognizance of Bail – Rino Ferrante", pageNumber: 60 }
  ];

  // Get document-specific tabs (same logic as simpleTabEditor.ts)
  private getTabsForDocument(documentId: string): Array<{tabNo: number, date: string, nature: string, targetPage?: number}> {
    // Check for custom overrides first
    const tabOverrides = (global as any).documentTabOverrides?.[documentId];
    if (tabOverrides && tabOverrides.length > 0) {
      return tabOverrides;
    }

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
    
    // 1223-page document: "Amended Doc Brief - Ferrante - 3 July 2025" - ALL 63 LINKS FROM USER'S EXACT SPECIFICATIONS
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
    
    // Return empty for other documents
    return [];
  }

  async generateHtmlIndex(caseId: string, documentTitle: string, pdfFileName: string, documentId?: string): Promise<string> {
    if (documentId) {
      this.documentId = documentId;
      // Use document-specific tabs if available
      const documentTabs = this.getTabsForDocument(documentId);
      if (documentTabs.length > 0) {
        this.tabs = documentTabs.map(tab => ({
          tabNo: tab.tabNo,
          date: tab.date,
          nature: tab.nature,
          pageNumber: tab.targetPage || 1
        }));
      }
    }
    
    // Create full PDF URL path for clickable links
    const pdfUrl = `/online/pdf/${caseId}/${documentId}`;
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Clickable Index - ${documentTitle}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 40px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }
        .header h1 {
            margin: 0 0 10px 0;
            font-size: 2.5em;
            font-weight: 300;
        }
        .header p {
            margin: 0;
            font-size: 1.1em;
            opacity: 0.9;
        }
        .content {
            padding: 40px;
        }
        .intro {
            text-align: center;
            margin-bottom: 40px;
            padding: 30px;
            background: #f8f9ff;
            border-radius: 10px;
            border-left: 5px solid #2a5298;
        }
        .intro h2 {
            color: #1e3c72;
            margin-bottom: 15px;
            font-size: 1.8em;
        }
        .intro p {
            color: #666;
            font-size: 1.1em;
            margin: 10px 0;
        }
        .tabs-grid {
            display: grid;
            gap: 15px;
            margin-top: 30px;
        }
        .tab-item {
            display: block;
            text-decoration: none;
            background: white;
            border: 2px solid #e1e8ff;
            border-radius: 10px;
            padding: 20px;
            transition: all 0.3s ease;
            box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }
        .tab-item:hover {
            border-color: #2a5298;
            box-shadow: 0 8px 25px rgba(42,82,152,0.15);
            transform: translateY(-2px);
        }
        .tab-header {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
        }
        .tab-number {
            background: linear-gradient(135deg, #2a5298, #1e3c72);
            color: white;
            padding: 8px 15px;
            border-radius: 25px;
            font-weight: bold;
            font-size: 0.9em;
            margin-right: 15px;
            min-width: 60px;
            text-align: center;
        }
        .tab-date {
            color: #666;
            font-size: 0.95em;
            font-weight: 500;
        }
        .tab-nature {
            color: #333;
            font-size: 1.1em;
            font-weight: 600;
            line-height: 1.4;
        }
        .click-instruction {
            display: inline-block;
            background: #e8f4fd;
            color: #1976d2;
            padding: 5px 10px;
            border-radius: 15px;
            font-size: 0.8em;
            margin-top: 8px;
            font-weight: 500;
        }
        .edit-controls {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-top: 10px;
            justify-content: space-between;
        }
        .edit-button {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 15px;
            font-size: 0.85em;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s;
            box-shadow: 0 2px 6px rgba(76, 175, 80, 0.3);
        }
        .edit-button:hover {
            background: #45a049;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);
        }
        .edit-form {
            display: none;
            align-items: center;
            gap: 12px;
            margin-top: 15px;
            padding: 15px;
            background: #f0f8ff;
            border-radius: 10px;
            border: 2px solid #4CAF50;
            box-shadow: 0 4px 12px rgba(76, 175, 80, 0.2);
            animation: slideDown 0.3s ease-out;
        }
        .edit-form.active {
            display: flex;
        }
        @keyframes slideDown {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .page-input {
            width: 80px;
            padding: 8px 12px;
            border: 2px solid #4CAF50;
            border-radius: 6px;
            text-align: center;
            font-weight: bold;
            font-size: 1em;
            background: white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .page-input:focus {
            outline: none;
            border-color: #45a049;
            box-shadow: 0 0 8px rgba(76, 175, 80, 0.3);
        }
        .confirm-btn {
            background: #4caf50;
            color: white;
            border: none;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 0.8em;
            cursor: pointer;
            font-weight: 500;
        }
        .confirm-btn:hover {
            background: #45a049;
        }
        .cancel-btn {
            background: #f44336;
            color: white;
            border: none;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 0.8em;
            cursor: pointer;
            font-weight: 500;
        }
        .cancel-btn:hover {
            background: #da190b;
        }
        .nav-button {
            background: #2196F3;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 25px;
            cursor: pointer;
            font-size: 1em;
            font-weight: bold;
            margin: 0 8px;
            transition: all 0.3s ease;
            box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
        }
        .nav-button:hover {
            background: #1976D2;
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(33, 150, 243, 0.4);
        }
        .nav-button.refresh {
            background: #4CAF50;
            box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
        }
        .nav-button.refresh:hover {
            background: #45a049;
            box-shadow: 0 6px 20px rgba(76, 175, 80, 0.4);
        }
        .updating {
            background: #2196F3;
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 0.8em;
        }
        .footer {
            text-align: center;
            padding: 30px;
            background: #f8f9ff;
            color: #666;
            border-top: 1px solid #e1e8ff;
        }
        .footer p {
            margin: 5px 0;
            font-size: 0.9em;
        }
        @media (max-width: 768px) {
            body { padding: 20px; }
            .header { padding: 30px 20px; }
            .content { padding: 30px 20px; }
            .header h1 { font-size: 2em; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📋 Clickable Document Index</h1>
            <p>${documentTitle}</p>
        </div>
        
        <div class="content">
            <div class="intro">
                <h2>🎯 How to Use This Index</h2>
                <p><strong>Click any tab below</strong> to instantly open the PDF at that exact page in a new browser tab.</p>
                <p>Each link opens the PDF at the specific page containing that document.</p>
                <p><em>🔗 Links open in new tabs - use your browser's back button or close the tab to return here</em></p>
                <div style="margin: 20px 0; padding: 15px; background: #e8f4fd; border-radius: 8px; border-left: 4px solid #2196F3;">
                    <p style="margin: 0; color: #1976D2;"><strong>💡 Navigation Tip:</strong> After clicking a link, you can:</p>
                    <ul style="margin: 10px 0 0 20px; color: #1976D2;">
                        <li>Use <kbd>Ctrl+W</kbd> (or <kbd>Cmd+W</kbd>) to close the PDF tab</li>
                        <li>Click your browser's back button</li>
                        <li>Bookmark this page for quick access</li>
                    </ul>
                </div>
                <div style="margin-top: 15px; text-align: center;">
                    <button onclick="testEditButton()" style="background: #ff9800; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-weight: bold;">
                        🧪 Test JavaScript (Click Me First!)
                    </button>
                    <p style="font-size: 0.9em; color: #666; margin-top: 8px;">
                        Click this button to verify JavaScript is working before using edit buttons
                    </p>
                </div>
            </div>
            
            <div class="tabs-grid">
                ${this.tabs.map(tab => `
                    <div class="tab-item" id="tab-${tab.tabNo}">
                        <div class="tab-header">
                            <div class="tab-number">Tab ${tab.tabNo}</div>
                            <div class="tab-date">${tab.date}</div>
                        </div>
                        <div class="tab-nature">${tab.nature}</div>
                        <div class="edit-controls">
                            <a href="${pdfUrl}#page=${tab.targetPage || tab.pageNumber}" target="_blank" class="click-instruction" id="link-${tab.tabNo}">
                                👆 Click to open PDF at page ${tab.targetPage || tab.pageNumber}
                            </a>
                            <button class="edit-button" onclick="editPage(${tab.tabNo}, ${tab.targetPage || tab.pageNumber})">✏️ Edit Page</button>
                        </div>
                        <div class="edit-form" id="edit-form-${tab.tabNo}">
                            <label style="font-weight: 600; color: #2E7D32;">📝 New Page Number:</label>
                            <input type="number" class="page-input" id="page-input-${tab.tabNo}" min="1" max="1223" value="${tab.targetPage || tab.pageNumber}" placeholder="Page #">
                            <button class="confirm-btn" onclick="confirmEdit(${tab.tabNo})">✅ Update Link</button>
                            <button class="cancel-btn" onclick="cancelEdit(${tab.tabNo})">❌ Cancel</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="footer">
            <div style="text-align: center; margin-bottom: 20px;">
                <button onclick="window.history.back()" class="nav-button">
                    &lt;-- Back to Previous Page
                </button>
                <button onclick="window.location.reload()" class="nav-button refresh">
                    🔄 Refresh Index
                </button>
            </div>
            <p><strong>💡 Tip:</strong> Bookmark this page for quick access to your document index</p>
            <p>Generated by HyperlinkLaw.com • Professional Legal Document Management</p>
            <p><small>Total: ${this.tabs.length} clickable document references</small></p>
        </div>
    </div>

    <script>
        // Global variables
        window.currentDocumentId = '${this.documentId}';
        window.currentCaseId = '${caseId}';
        
        // Edit page function
        window.editPage = function(tabNo, currentPage) {
            console.log('🎯 Edit button clicked for Tab ' + tabNo);
            
            // Hide all edit forms first
            var allForms = document.querySelectorAll('.edit-form');
            for (var i = 0; i < allForms.length; i++) {
                allForms[i].classList.remove('active');
            }
            
            // Show this edit form
            var editForm = document.getElementById('edit-form-' + tabNo);
            if (editForm) {
                editForm.classList.add('active');
                console.log('✅ Edit form shown for Tab ' + tabNo);
                
                // Focus on input after short delay
                setTimeout(function() {
                    var input = document.getElementById('page-input-' + tabNo);
                    if (input) {
                        input.focus();
                        input.select();
                        console.log('📝 Input focused for Tab ' + tabNo);
                    }
                }, 150);
            } else {
                console.error('❌ Edit form not found for Tab ' + tabNo);
            }
        };
        
        // Cancel edit function
        window.cancelEdit = function(tabNo) {
            console.log('❌ Cancel button clicked for Tab ' + tabNo);
            var editForm = document.getElementById('edit-form-' + tabNo);
            if (editForm) {
                editForm.classList.remove('active');
                console.log('✅ Edit form hidden for Tab ' + tabNo);
            }
        };
        
        // Confirm edit function
        window.confirmEdit = function(tabNo) {
            console.log('✅ Confirm button clicked for Tab ' + tabNo);
            
            var input = document.getElementById('page-input-' + tabNo);
            var newPage = parseInt(input.value);
            
            console.log('📝 New page value: ' + newPage);
            
            if (!newPage || newPage < 1) {
                alert('Please enter a valid page number');
                return;
            }
            
            // Show updating status
            var editForm = document.getElementById('edit-form-' + tabNo);
            editForm.innerHTML = '<div class="updating">🔄 Updating hyperlink...</div>';
            
            // Make API call
            fetch('/api/documents/' + window.currentDocumentId + '/update-tab-page', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    tabNo: tabNo,
                    newPage: newPage,
                    caseId: window.currentCaseId
                })
            })
            .then(function(response) {
                console.log('📡 API response status: ' + response.status);
                if (response.ok) {
                    return response.json();
                } else {
                    throw new Error('API returned status ' + response.status);
                }
            })
            .then(function(result) {
                console.log('✅ API response: ' + JSON.stringify(result));
                
                // Update the link immediately
                var link = document.getElementById('link-' + tabNo);
                var newHref = '${pdfUrl}#page=' + newPage;
                link.href = newHref;
                link.innerHTML = '👆 Click to open PDF at page ' + newPage;
                
                console.log('🔗 Link updated to: ' + newHref);
                
                // Hide edit form and restore it
                editForm.classList.remove('active');
                editForm.innerHTML = 
                    '<label style="font-weight: 600; color: #2E7D32;">📝 New Page Number:</label>' +
                    '<input type="number" class="page-input" id="page-input-' + tabNo + '" min="1" max="1223" value="' + newPage + '" placeholder="Page #">' +
                    '<button class="confirm-btn" onclick="confirmEdit(' + tabNo + ')">✅ Update Link</button>' +
                    '<button class="cancel-btn" onclick="cancelEdit(' + tabNo + ')">❌ Cancel</button>';
                
                // Show success message
                var successMsg = document.createElement('div');
                successMsg.className = 'updating';
                successMsg.style.background = '#4caf50';
                successMsg.innerHTML = '✅ Hyperlink updated!';
                editForm.parentNode.appendChild(successMsg);
                
                setTimeout(function() {
                    if (successMsg.parentNode) {
                        successMsg.parentNode.removeChild(successMsg);
                    }
                }, 2000);
                
                console.log('🎉 Tab update completed successfully!');
            })
            .catch(function(error) {
                console.error('❌ Error updating tab: ' + error.message);
                
                // Show error and restore form
                editForm.innerHTML = 
                    '<div style="color: red; font-size: 0.9em; margin-bottom: 8px;">❌ Update failed. Try again.</div>' +
                    '<label style="font-weight: 600; color: #2E7D32;">📝 New Page Number:</label>' +
                    '<input type="number" class="page-input" id="page-input-' + tabNo + '" min="1" max="1223" value="' + newPage + '" placeholder="Page #">' +
                    '<button class="confirm-btn" onclick="confirmEdit(' + tabNo + ')">✅ Update Link</button>' +
                    '<button class="cancel-btn" onclick="cancelEdit(' + tabNo + ')">❌ Cancel</button>';
            });
        };
        
        // Enter key support
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && e.target.classList.contains('page-input')) {
                var tabNo = e.target.id.replace('page-input-', '');
                window.confirmEdit(parseInt(tabNo));
            }
        });
        
        // Test function to verify JavaScript is working
        console.log('🚀 Edit functionality loaded successfully');
        console.log('📄 Document ID: ' + window.currentDocumentId);
        console.log('📁 Case ID: ' + window.currentCaseId);
        
        // Add click test function for debugging
        window.testEditButton = function() {
            console.log('🧪 Test function called - JavaScript is working!');
            alert('JavaScript is working! Edit buttons should work now.');
        };
        
        // Test that edit functions are properly loaded
        console.log('📋 Functions available:', {
            editPage: typeof window.editPage,
            confirmEdit: typeof window.confirmEdit,
            cancelEdit: typeof window.cancelEdit,
            testEditButton: typeof window.testEditButton
        });
    </script>
</body>
</html>`;

    return htmlContent;
  }

  async saveHtmlIndex(caseId: string, documentId: string, documentTitle: string): Promise<string> {
    const pdfFileName = `document_${documentId}_highlighted.pdf`;
    const htmlContent = await this.generateHtmlIndex(caseId, documentTitle, pdfFileName, documentId);
    
    // Create case directory if it doesn't exist
    const caseDir = path.join(process.cwd(), 'storage', 'cases', caseId);
    await fs.mkdir(caseDir, { recursive: true });
    
    // Save HTML file
    const htmlFileName = `document_${documentId}_index.html`;
    const htmlFilePath = path.join(caseDir, htmlFileName);
    await fs.writeFile(htmlFilePath, htmlContent, 'utf8');
    
    console.log(`✅ HTML index saved: ${htmlFilePath}`);
    return htmlFilePath;
  }
}