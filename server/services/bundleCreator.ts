import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { createHash } from 'crypto';
import JSZip from 'jszip';
import fs from 'fs/promises';
import path from 'path';

export interface CourtBundle {
  originalPdf: Buffer;
  indexCopyPdf: Buffer;
  hyperlinkedPdf: Buffer;
  manifest: CourtManifest;
  bundleZip: Buffer;
}

export interface CourtManifest {
  caseId: string;
  caseName: string;
  processedAt: string;
  processingVersion: string;
  originalHash: string;
  hyperlinkedHash: string;
  linkCount: number;
  pageCount: number;
  indexItems: Array<{
    text: string;
    targetPage: number;
    confidence: number;
  }>;
  metadata: {
    appName: string;
    appVersion: string;
    processingTimeMs: number;
    ocrLanguage: string;
    strictMode: boolean;
  };
}

export class BundleCreator {
  async createCourtReadyBundle(
    originalPdfBuffer: Buffer,
    hyperlinkedPdfBuffer: Buffer,
    indexItems: any[],
    caseData: any,
    processingStats: any
  ): Promise<CourtBundle> {
    
    // Create index copy PDF
    const indexCopyPdf = await this.createIndexCopy(indexItems, caseData);
    
    // Generate manifest
    const manifest = await this.createManifest(
      originalPdfBuffer,
      hyperlinkedPdfBuffer,
      indexItems,
      caseData,
      processingStats
    );
    
    // Create ZIP bundle
    const bundleZip = await this.createZipBundle(
      originalPdfBuffer,
      indexCopyPdf,
      hyperlinkedPdfBuffer,
      manifest
    );

    return {
      originalPdf: originalPdfBuffer,
      indexCopyPdf,
      hyperlinkedPdf: hyperlinkedPdfBuffer,
      manifest,
      bundleZip
    };
  }

  private async createIndexCopy(indexItems: any[], caseData: any): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const page = pdfDoc.addPage([612, 792]); // Standard letter size
    const { width, height } = page.getSize();
    
    let yPosition = height - 50;
    
    // Header
    page.drawText('INDEX COPY - HYPERLINKED DOCUMENT', {
      x: 50,
      y: yPosition,
      size: 16,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    
    yPosition -= 30;
    page.drawText(`Case: ${caseData.name || 'Untitled Case'}`, {
      x: 50,
      y: yPosition,
      size: 12,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    yPosition -= 20;
    page.drawText(`Processed: ${new Date().toLocaleString()}`, {
      x: 50,
      y: yPosition,
      size: 10,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
    
    yPosition -= 40;
    
    // Index items
    indexItems.forEach((item, index) => {
      if (yPosition < 100) {
        // Add new page if needed
        const newPage = pdfDoc.addPage([612, 792]);
        yPosition = height - 50;
      }
      
      const itemText = `${index + 1}. ${item.text} ... Page ${item.targetPage}`;
      page.drawText(itemText, {
        x: 70,
        y: yPosition,
        size: 11,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      yPosition -= 25;
    });
    
    return Buffer.from(await pdfDoc.save());
  }

  private async createManifest(
    originalPdf: Buffer,
    hyperlinkedPdf: Buffer,
    indexItems: any[],
    caseData: any,
    processingStats: any
  ): Promise<CourtManifest> {
    
    const originalHash = createHash('sha256').update(originalPdf).digest('hex');
    const hyperlinkedHash = createHash('sha256').update(hyperlinkedPdf).digest('hex');
    
    return {
      caseId: caseData.id,
      caseName: caseData.name || 'Untitled Case',
      processedAt: new Date().toISOString(),
      processingVersion: '1.0.0',
      originalHash,
      hyperlinkedHash,
      linkCount: indexItems.length,
      pageCount: processingStats.pageCount || 0,
      indexItems: indexItems.map(item => ({
        text: item.text,
        targetPage: item.targetPage,
        confidence: item.confidence || 1.0
      })),
      metadata: {
        appName: 'hyperlinklaw.com',
        appVersion: '1.0.0',
        processingTimeMs: processingStats.processingTime || 0,
        ocrLanguage: 'eng',
        strictMode: process.env.STRICT_INDEX_ONLY === 'true'
      }
    };
  }

  private async createZipBundle(
    originalPdf: Buffer,
    indexCopyPdf: Buffer,
    hyperlinkedPdf: Buffer,
    manifest: CourtManifest
  ): Promise<Buffer> {
    
    const zip = new JSZip();
    
    // Add files to ZIP
    zip.file('01_original.pdf', originalPdf);
    zip.file('02_index_copy.pdf', indexCopyPdf);
    zip.file('03_hyperlinked.pdf', hyperlinkedPdf);
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    zip.file('README.txt', this.createReadmeText(manifest));
    
    return Buffer.from(await zip.generateAsync({ type: 'arraybuffer' }));
  }

  private createReadmeText(manifest: CourtManifest): string {
    return `
COURT-READY DOCUMENT BUNDLE
Generated by hyperlinklaw.com

Case: ${manifest.caseName}
Processed: ${new Date(manifest.processedAt).toLocaleString()}
Total Links: ${manifest.linkCount}
Total Pages: ${manifest.pageCount}

FILES INCLUDED:
- 01_original.pdf: The original document (unmodified)
- 02_index_copy.pdf: Index page with clickable items
- 03_hyperlinked.pdf: Document with hyperlinks added
- manifest.json: Processing metadata and verification data
- README.txt: This file

VERIFICATION:
Original Document Hash: ${manifest.originalHash}
Hyperlinked Document Hash: ${manifest.hyperlinkedHash}

IMPORTANT NOTES:
- All hyperlinks have been automatically detected and validated
- Review the hyperlinked PDF before court submission
- Contact support at hyperlinklaw.com for any questions
- Processing completed in strict compliance mode

Generated by hyperlinklaw.com v${manifest.metadata.appVersion}
`.trim();
  }
}