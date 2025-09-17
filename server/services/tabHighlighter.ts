import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib';
// import { addIndexIntroPage } from './indexIntroPage.js'; // REMOVED - no longer adding intro pages
import fs from 'fs/promises';
import path from 'path';
import { db } from '../db.js';
import { documents, tabHighlights } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { spawn } from 'child_process';
import { promisify } from 'util';

export interface TabItem {
  tabNo: number;
  date: string;
  nature: string;
  pageNumber?: number;
  targetPage?: number;
}

export class TabHighlighter {
  private tabs: TabItem[] = []; // Will be populated with document-specific tab data
  private documentId: string = '';

  /**
   * Set the document-specific tab data that will be used for highlighting and hyperlinks
   */
  setTabData(documentId: string, tabs: TabItem[]): void {
    this.documentId = documentId;
    this.tabs = tabs;
    console.log(`📝 Tab data set for document ${documentId}: ${tabs.length} tabs`);
  }

  async highlightTabsAndAddHyperlinks(documentId: string, htmlIndexFileName: string): Promise<Buffer> {
    console.log(`📋 Processing document ${documentId} with ${this.tabs.length} tabs`);
    if (this.tabs.length === 0) {
      console.warn(`⚠️  Document ${documentId} has no tab data - will create PDF with placeholder intro page`);
    }
    try {
      // Get document from database to find storage path
      const [document] = await db.select().from(documents).where(eq(documents.id, documentId));
      
      if (!document) {
        throw new Error(`Document not found: ${documentId}`);
      }
      
      if (!document.storagePath) {
        throw new Error(`Document storage path not found: ${documentId}`);
      }
      
      // Load the original PDF from the correct storage path
      const storagePath = document.storagePath.startsWith('./storage/') 
        ? document.storagePath 
        : path.join(process.cwd(), 'storage', document.storagePath);
      
      console.log(`📁 Loading PDF from: ${storagePath}`);
      const pdfBytes = await fs.readFile(storagePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      
      // Get page 2 (index 1)
      const pages = pdfDoc.getPages();
      if (pages.length < 2) {
        throw new Error('Document must have at least 2 pages');
      }
      
      const page2 = pages[1]; // Page 2 (0-indexed)
      
      // Highlight the tabs directly on page 2 (original index page)
      await this.highlightTabsOnPage(page2);
      console.log(`✅ Highlighted ${this.tabs.length} tabs directly on original index page 2`);
      
      // Save the modified PDF with highlights
      const modifiedPdfBytes = await pdfDoc.save();
      
      // Create temporary file for adding internal links
      const tempInputPath = path.join(process.cwd(), 'temp', `temp_input_${documentId}.pdf`);
      const tempOutputPath = path.join(process.cwd(), 'temp', `temp_output_${documentId}.pdf`);
      
      // Ensure temp directory exists
      await fs.mkdir(path.dirname(tempInputPath), { recursive: true });
      
      // Write the highlighted PDF to temp file
      await fs.writeFile(tempInputPath, modifiedPdfBytes);
      
      // Add internal navigation links using Python script
      try {
        const enhancedPdfBytes = await this.addInternalNavigationLinks(tempInputPath, tempOutputPath, this.tabs);
        
        // Clean up temp files
        await fs.unlink(tempInputPath).catch(() => {}); // Ignore errors
        await fs.unlink(tempOutputPath).catch(() => {}); // Ignore errors
        
        return enhancedPdfBytes;
      } catch (error) {
        console.error('⚠️  Failed to add internal navigation links, returning PDF with highlights only:', error);
        // Clean up temp files
        await fs.unlink(tempInputPath).catch(() => {});
        await fs.unlink(tempOutputPath).catch(() => {});
        return Buffer.from(modifiedPdfBytes);
      }
      
    } catch (error) {
      console.error('❌ Failed to highlight tabs and add hyperlinks:', error);
      throw error;
    }
  }

  private async highlightTabsOnPage(page: PDFPage): Promise<void> {
    const { width, height } = page.getSize();
    
    // Try to get saved custom highlight positions from database
    const savedHighlights = await this.getSavedHighlightPositions();
    
    if (savedHighlights.length > 0) {
      console.log(`📍 Using ${savedHighlights.length} saved custom highlight positions`);
      
      // Use saved custom positions - add orange highlights AND blue LINK buttons
      for (let i = 0; i < savedHighlights.length; i++) {
        const highlight = savedHighlights[i];
        const x = parseFloat(highlight.x as string) * width;
        const y = parseFloat(highlight.y as string) * height;
        const w = parseFloat(highlight.width as string) * width;
        const h = parseFloat(highlight.height as string) * height;
        const linkNumber = i + 1;
        
        // Add orange background highlighting
        page.drawRectangle({
          x,
          y,
          width: w,
          height: h,
          color: rgb(1.0, 0.647, 0), // Orange color
          opacity: 0.3,
        });
        
        // Add blue "LINK X" text button
        page.drawText(`LINK ${linkNumber}`, {
          x: x + w - 80, // Position near right side of highlight
          y: y + h/2 - 3, // Center vertically in highlight
          size: 12,
          color: rgb(0, 0, 1), // Blue for link appearance
        });
      }
    } else {
      console.log(`📍 Using default highlight positions for ${this.tabs.length} tabs`);
      
      // Use default positions
      const startY = height - 160; // Approximate start of table data
      const rowHeight = 32; // Approximate height between rows
      const rowWidth = width - 100; // Full width minus margins
      
      // Add orange highlights AND blue LINK buttons for each numbered item
      for (let i = 0; i < this.tabs.length; i++) {
        const y = startY - (i * rowHeight);
        const linkNumber = i + 1;
        const highlightHeight = 24;
        
        // Add orange background highlighting
        page.drawRectangle({
          x: 40,
          y: y - 5,
          width: rowWidth,
          height: highlightHeight,
          color: rgb(1.0, 0.647, 0), // Orange color
          opacity: 0.3,
        });
        
        // Add blue "LINK X" text button
        page.drawText(`LINK ${linkNumber}`, {
          x: rowWidth - 60, // Position near right side of highlight
          y: y + 5, // Center vertically in highlight
          size: 12,
          color: rgb(0, 0, 1), // Blue for link appearance
        });
      }
    }
  }

  /**
   * Get saved custom highlight positions from database
   */
  private async getSavedHighlightPositions() {
    try {
      const savedHighlights = await db
        .select()
        .from(tabHighlights)
        .where(eq(tabHighlights.documentId, this.documentId))
        .orderBy(tabHighlights.tabNumber);
      
      return savedHighlights;
    } catch (error) {
      console.error('Error fetching saved highlight positions:', error);
      return [];
    }
  }

  /**
   * Convert hex color to RGB values for pdf-lib
   */
  private hexToRgb(hex: string) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) {
      return rgb(1, 1, 0); // Default to yellow
    }
    return rgb(
      parseInt(result[1], 16) / 255,
      parseInt(result[2], 16) / 255,
      parseInt(result[3], 16) / 255
    );
  }

  /**
   * Add internal navigation links to the PDF using improved Python script with BACK TO INDEX banners
   */
  private async addInternalNavigationLinks(inputPath: string, outputPath: string, tabs: TabItem[]): Promise<Buffer> {
    console.log('🔗 Adding internal navigation links and BACK TO INDEX banners...');
    
    return new Promise(async (resolve, reject) => {
      try {
        // 🔗 FETCH ACTUAL SAVED HYPERLINK DATA FROM DATABASE
        const { pageLinkPositions } = await import('@shared/schema');
        
        const savedPositions = await db.select()
          .from(pageLinkPositions)
          .where(eq(pageLinkPositions.documentId, this.documentId))
          .where(eq(pageLinkPositions.pageNumber, 2));
        
        // Create custom mapping from saved hyperlink data
        const customMapping: { [key: number]: number } = {};
        savedPositions.forEach(pos => {
          if (pos.tabNumber && pos.targetPage) {
            customMapping[parseInt(pos.tabNumber.toString())] = pos.targetPage;
          }
        });
        
        console.log('📋 Using REAL saved hyperlink data:', customMapping);
        
        // Write custom mapping to temp file for Python script
        const tempMappingPath = path.join(process.cwd(), 'temp_mapping.json');
        await fs.writeFile(tempMappingPath, JSON.stringify(customMapping));
        
        // Call the new Python script for internal hyperlinks
        const pythonScript = path.join(process.cwd(), 'server', 'services', 'addInternalHyperlinks.py');
        const pythonProcess = spawn('python3', [
          pythonScript, 
          inputPath, 
          outputPath, 
          '2',  // Index page number
          '13', // Number of tabs
          tempMappingPath  // Pass custom mapping file
        ]);
      
      let stdout = '';
      let stderr = '';
      
      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log('🐍 Python:', data.toString().trim());
      });
      
      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error('🐍 Python Error:', data.toString().trim());
      });
      
        pythonProcess.on('close', async (code) => {
          if (code === 0) {
            try {
              // Clean up temp mapping file
              await fs.unlink(tempMappingPath).catch(() => {});
              
              // Read the enhanced PDF with internal links and back banners
              const enhancedPdfBytes = await fs.readFile(outputPath);
              console.log('✅ Internal navigation links and BACK TO INDEX banners added successfully');
              resolve(Buffer.from(enhancedPdfBytes));
            } catch (error) {
              console.error('❌ Error reading enhanced PDF:', error);
              reject(error);
            }
          } else {
            console.error('❌ Python script failed with code:', code);
            console.error('Stderr:', stderr);
            reject(new Error(`Python script failed with code ${code}: ${stderr}`));
          }
        });
      } catch (error) {
        console.error('❌ Error fetching saved hyperlink data:', error);
        reject(error);
      }
    });
  }

  // REMOVED: insertTabsPage method - no longer inserting extra pages
  /*
  private async insertTabsPage(pdfDoc: PDFDocument, afterPageIndex: number): Promise<void> {
    // Create a new page for hyperlinks
    const newPage = pdfDoc.insertPage(afterPageIndex, [612, 792]); // Standard letter size
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const { width, height } = newPage.getSize();
    let yPosition = height - 50;
    
    // Header
    newPage.drawText('AMENDED SUPPLEMETARY DOCUMENT INDEX', {
      x: 50,
      y: yPosition,
      size: 18,
      font: boldFont,
      color: rgb(0, 0, 0), // Black
    });
    
    yPosition -= 20;
    newPage.drawText('(Complete list of all 13 tabs from page 2)', {
      x: 50,
      y: yPosition,
      size: 10,
      font: font,
      color: rgb(0.5, 0.5, 0.5), // Gray
    });
    
    yPosition -= 40;
    
    // Table headers
    newPage.drawText('Tab No.', {
      x: 50,
      y: yPosition,
      size: 12,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    
    newPage.drawText('Date of Document', {
      x: 120,
      y: yPosition,
      size: 12,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    
    newPage.drawText('Nature of Document', {
      x: 280,
      y: yPosition,
      size: 12,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    
    yPosition -= 30;
    
    // Draw a line under headers
    newPage.drawLine({
      start: { x: 50, y: yPosition },
      end: { x: width - 50, y: yPosition },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
    
    yPosition -= 20;
    
    // Add each tab as a clickable hyperlink
    for (const tab of this.tabs) {
      if (yPosition < 100) {
        // Add new page if needed
        const nextPage = pdfDoc.addPage([612, 792]);
        yPosition = height - 50;
      }
      
      const tabText = tab.tabNo.toString();
      const dateText = tab.date;
      const natureText = tab.nature.length > 45 ? tab.nature.substring(0, 42) + '...' : tab.nature;
      
      // Create a unique URL for each tab that will open in new window
      const tabUrl = `https://hyperlinklaw.com/tab/${tab.tabNo}?date=${encodeURIComponent(tab.date)}&nature=${encodeURIComponent(tab.nature)}`;
      
      // Draw the tab number (clickable)
      newPage.drawText(tabText, {
        x: 60,
        y: yPosition,
        size: 11,
        font: font,
        color: rgb(0, 0, 0.8), // Blue to indicate it's clickable
      });
      
      // Draw the date (clickable)
      newPage.drawText(dateText, {
        x: 120,
        y: yPosition,
        size: 11,
        font: font,
        color: rgb(0, 0, 0.8), // Blue to indicate it's clickable
      });
      
      // Draw the nature (clickable)
      newPage.drawText(natureText, {
        x: 280,
        y: yPosition,
        size: 11,
        font: font,
        color: rgb(0, 0, 0.8), // Blue to indicate it's clickable
      });
      
      // Add underline to show it's clickable
      newPage.drawLine({
        start: { x: 60, y: yPosition - 2 },
        end: { x: width - 70, y: yPosition - 2 },
        thickness: 0.5,
        color: rgb(0, 0, 0.8),
      });
      
      // Add actual clickable hyperlink annotation to the PDF
      try {
        // Create link annotation that opens URL in new window
        const linkAnnot = pdfDoc.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: [50, yPosition - 5, width - 50, yPosition + 15],
          Border: [0, 0, 0],
          A: pdfDoc.context.obj({
            Type: 'Action',
            S: 'URI',
            URI: pdfDoc.context.obj(tabUrl),
          }),
          H: 'I',
        });

        // Add annotation to page
        const annots = newPage.node.get('Annots');
        if (annots) {
          const existingAnnots = annots.asArray();
          existingAnnots.push(linkAnnot);
        } else {
          newPage.node.set('Annots', pdfDoc.context.obj([linkAnnot]));
        }
        
        console.log(`✅ Tab ${tab.tabNo} with clickable hyperlink: ${tabUrl}`);
      } catch (error) {
        console.log(`⚠️ Tab ${tab.tabNo} visual link (annotation failed): ${tabUrl}`);
      }
      
      // Add a light background for better readability
      newPage.drawRectangle({
        x: 50,
        y: yPosition - 5,
        width: width - 100,
        height: 15,
        color: rgb(0.95, 0.95, 1), // Very light blue background for clickable area
        opacity: 0.3,
      });
      
      yPosition -= 25;
    }
    
    // Add hyperlink instructions  
    yPosition -= 30;
    newPage.drawText('DOWNLOADABLE PDF WITH CLICKABLE HYPERLINKS:', {
      x: 50,
      y: yPosition,
      size: 12,
      font: boldFont,
      color: rgb(0.8, 0, 0), // Red for attention
    });
    
    yPosition -= 20;
    newPage.drawText('• Click any blue tab above to open URL in new browser window', {
      x: 70,
      y: yPosition,
      size: 10,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    yPosition -= 15;
    newPage.drawText('• All 13 tabs are now clickable hyperlinks in this PDF', {
      x: 70,
      y: yPosition,
      size: 10,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    yPosition -= 15;
    newPage.drawText('• Download this PDF to preserve all working hyperlinks', {
      x: 70,
      y: yPosition,
      size: 10,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    yPosition -= 20;
    newPage.drawText('Document Summary:', {
      x: 50,
      y: yPosition,
      size: 12,
      font: boldFont,
      color: rgb(0, 0, 0), 
    });
    
    yPosition -= 15;
    newPage.drawText('• Total clickable tabs: 13 hyperlinked documents', {
      x: 70,
      y: yPosition,
      size: 10,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    yPosition -= 15;
    newPage.drawText('• Date range: September 23, 2019 to August 16, 2023', {
      x: 70,
      y: yPosition,
      size: 10,
      font: font,
      color: rgb(0, 0, 0),
    });
  }
  */
}