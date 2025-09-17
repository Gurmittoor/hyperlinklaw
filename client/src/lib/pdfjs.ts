// lib/pdfjs.ts
import * as pdfjsLib from 'pdfjs-dist';

// Set worker path to local file
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

// Configure PDF.js to handle missing fonts gracefully
(pdfjsLib as any).GlobalWorkerOptions.verbosity = 0; // Reduce console noise

export default pdfjsLib;