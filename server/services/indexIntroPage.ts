import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// Define the interface for tab data
interface TabData {
  tabNo: number;
  date: string;
  nature: string;
}

export async function addIndexIntroPage(pdfDoc: PDFDocument, htmlIndexFileName: string, webUrl?: string, tabs?: TabData[]): Promise<void> {
  // Get the second page (index page) dimensions  
  const pages = pdfDoc.getPages();
  if (pages.length < 2) {
    throw new Error('Document must have at least 2 pages to add intro page');
  }
  
  const indexPage = pages[1]; // Page 2 (0-indexed)
  const { width, height } = indexPage.getSize();
  
  // Create a new page with the same dimensions
  const introPage = pdfDoc.insertPage(0, [width, height]);
  
  // Load fonts
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  let yPosition = height - 50;
  
  // Title
  introPage.drawText('INDEX OF TABS / EXHIBITS', {
    x: 50,
    y: yPosition,
    size: 24,
    font: boldFont,
    color: rgb(0.13, 0.23, 0.67), // Blue color
  });
  
  yPosition -= 40;
  
  // Subtitle indicating this is the clickable version
  introPage.drawText('(Clickable Version - Click any tab below to jump to that page)', {
    x: 50,
    y: yPosition,
    size: 12,
    font: font,
    color: rgb(0.8, 0.2, 0.2), // Red for emphasis
  });
  
  yPosition -= 40;
  
  // Column headers (same as original page)
  introPage.drawText('Tab No.', {
    x: 60,
    y: yPosition,
    size: 12,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  
  introPage.drawText('Date', {
    x: 120,
    y: yPosition,
    size: 12,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  
  introPage.drawText('Nature of Document', {
    x: 280,
    y: yPosition,
    size: 12,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  
  yPosition -= 30;
  
  // Draw a line under headers
  introPage.drawLine({
    start: { x: 50, y: yPosition },
    end: { x: width - 50, y: yPosition },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  
  yPosition -= 20;
  
  // Add each tab as clickable text entries (if tabs data is provided)
  if (tabs && tabs.length > 0) {
    for (const tab of tabs) {
      if (yPosition < 100) {
        // If we run out of space, add continuation note
        introPage.drawText('...see page 2 for complete index', {
          x: 60,
          y: yPosition,
          size: 11,
          font: font,
          color: rgb(0.5, 0.5, 0.5),
        });
        break;
      }
      
      const tabText = tab.tabNo.toString();
      const dateText = tab.date;
      const natureText = tab.nature.length > 45 ? tab.nature.substring(0, 42) + '...' : tab.nature;
      
      // Draw the tab number (blue to indicate clickable)
      introPage.drawText(tabText, {
        x: 60,
        y: yPosition,
        size: 11,
        font: font,
        color: rgb(0, 0, 0.8), // Blue to indicate it's clickable
      });
      
      // Draw the date (blue to indicate clickable)
      introPage.drawText(dateText, {
        x: 120,
        y: yPosition,
        size: 11,
        font: font,
        color: rgb(0, 0, 0.8), // Blue to indicate it's clickable
      });
      
      // Draw the nature (blue to indicate clickable)
      introPage.drawText(natureText, {
        x: 280,
        y: yPosition,
        size: 11,
        font: font,
        color: rgb(0, 0, 0.8), // Blue to indicate it's clickable
      });
      
      // Add underline to show it's clickable
      introPage.drawLine({
        start: { x: 60, y: yPosition - 2 },
        end: { x: width - 70, y: yPosition - 2 },
        thickness: 0.5,
        color: rgb(0, 0, 0.8),
      });
      
      // Create the URL for this specific tab
      const linkUrl = webUrl || htmlIndexFileName;
      const tabUrl = linkUrl.includes('http') 
        ? `${linkUrl}#tab-${tab.tabNo}` 
        : `${linkUrl}#tab-${tab.tabNo}`;
      
      // Add actual clickable hyperlink - use simple string approach
      try {
        const linkAnnot = pdfDoc.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: [50, yPosition - 5, width - 50, yPosition + 15],
          Border: [0, 0, 0],
          A: pdfDoc.context.obj({
            Type: 'Action',
            S: 'URI',
            URI: tabUrl,
          }),
          H: 'I',
        });
        
        const linkAnnotRef = pdfDoc.context.register(linkAnnot);
        
        const currentAnnots = introPage.node.Annots();
        if (currentAnnots) {
          currentAnnots.push(linkAnnotRef);
        } else {
          introPage.node.set('Annots', pdfDoc.context.obj([linkAnnotRef]));
        }
      } catch (error) {
        console.warn(`⚠️ Could not create clickable link for tab ${tab.tabNo}:`, error);
      }
      
      yPosition -= 20;
    }
  } else {
    // If no tabs data, show placeholder
    introPage.drawText('Loading tab data...', {
      x: 60,
      y: yPosition,
      size: 11,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
    yPosition -= 30;
  }
  
  // Footer with link to HTML version
  yPosition = Math.min(yPosition - 30, 120);
  
  introPage.drawText('For best experience, use the companion HTML index:', {
    x: 50,
    y: yPosition,
    size: 10,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
  
  yPosition -= 15;
  
  const linkUrl = webUrl || htmlIndexFileName;
  introPage.drawText(linkUrl, {
    x: 50,
    y: yPosition,
    size: 9,
    font: font,
    color: rgb(0, 0, 0.8),
  });
  
  // Make the URL clickable too
  try {
    const urlAnnot = pdfDoc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [50, yPosition - 5, 400, yPosition + 10],
      Border: [0, 0, 0],
      A: pdfDoc.context.obj({
        Type: 'Action',
        S: 'URI',
        URI: linkUrl,
      }),
      H: 'I',
    });
    
    const urlAnnotRef = pdfDoc.context.register(urlAnnot);
    
    const currentAnnots = introPage.node.Annots();
    if (currentAnnots) {
      currentAnnots.push(urlAnnotRef);
    } else {
      introPage.node.set('Annots', pdfDoc.context.obj([urlAnnotRef]));
    }
  } catch (error) {
    console.warn('⚠️ Could not create URL link:', error);
  }
  
  // Footer
  introPage.drawText('Generated by HyperlinkLaw.com', {
    x: 50,
    y: 30,
    size: 8,
    font: font,
    color: rgb(0.5, 0.5, 0.5),
  });
  
  console.log(`✅ Clickable index duplicate page created with ${tabs?.length || 0} tab links`);
}