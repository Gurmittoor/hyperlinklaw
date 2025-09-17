import fs from 'fs/promises';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

export async function loadPdfPageBytes(documentId: string, pageNumber: number): Promise<Buffer> {
  try {
    // Find the document's storage path from database or construct path
    const storagePath = path.join('uploads', documentId + '.pdf');
    
    // Read the PDF file
    const pdfBytes = await fs.readFile(storagePath);
    
    // Load PDF document
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    // Extract the specific page
    const pages = pdfDoc.getPages();
    if (pageNumber < 1 || pageNumber > pages.length) {
      throw new Error(`Page ${pageNumber} does not exist (document has ${pages.length} pages)`);
    }
    
    // Create a new PDF with just this page
    const singlePageDoc = await PDFDocument.create();
    const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [pageNumber - 1]);
    singlePageDoc.addPage(copiedPage);
    
    // Convert to bytes for OCR processing
    const singlePageBytes = await singlePageDoc.save();
    
    return Buffer.from(singlePageBytes);
    
  } catch (error) {
    console.error(`❌ Failed to load page ${pageNumber} from document ${documentId}:`, error);
    throw error;
  }
}

export async function loadPdfPageAsImage(documentId: string, pageNumber: number, dpi: number = 220): Promise<Buffer> {
  try {
    // For now, return the PDF page bytes
    // In the future, this could rasterize to PNG using pdf2pic or similar
    return await loadPdfPageBytes(documentId, pageNumber);
    
  } catch (error) {
    console.error(`❌ Failed to load page ${pageNumber} as image from document ${documentId}:`, error);
    throw error;
  }
}

export async function getDocumentPageCount(documentId: string): Promise<number> {
  try {
    const storagePath = path.join('uploads', documentId + '.pdf');
    const pdfBytes = await fs.readFile(storagePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    return pdfDoc.getPageCount();
    
  } catch (error) {
    console.error(`❌ Failed to get page count for document ${documentId}:`, error);
    throw error;
  }
}

export async function pdfToImageBuffer(storagePath: string, pageNumber: number): Promise<Buffer> {
  try {
    console.log(`🔄 Converting page ${pageNumber} from ${storagePath} to image buffer`);
    
    // Resolve the storage path to full absolute path
    const fullPath = path.isAbsolute(storagePath) 
      ? storagePath 
      : path.join(process.cwd(), 'storage', storagePath);
    
    console.log(`📁 Full path: ${fullPath}`);
    
    // Check if file exists
    try {
      await fs.access(fullPath);
    } catch (error) {
      throw new Error(`PDF file not found: ${fullPath}`);
    }
    
    // Read the PDF file
    const pdfBytes = await fs.readFile(fullPath);
    
    // Load PDF document
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    // Extract the specific page
    const pages = pdfDoc.getPages();
    if (pageNumber < 1 || pageNumber > pages.length) {
      throw new Error(`Page ${pageNumber} does not exist (document has ${pages.length} pages)`);
    }
    
    // Create a new PDF with just this page
    const singlePageDoc = await PDFDocument.create();
    const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [pageNumber - 1]);
    singlePageDoc.addPage(copiedPage);
    
    // Convert to bytes for OCR processing
    const singlePageBytes = await singlePageDoc.save();
    
    console.log(`✅ Page ${pageNumber} converted to ${singlePageBytes.length} byte buffer`);
    return Buffer.from(singlePageBytes);
    
  } catch (error) {
    console.error(`❌ Failed to convert page ${pageNumber} from ${storagePath}:`, error);
    throw error;
  }
}