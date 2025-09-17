export type IndexRow = {
  tabNo: string;            // "1", "2.", "01", etc.
  dateOfDocument: string;   // "February 24, 2022"
  nature: string;           // "Affidavit – Rino Ferrante"
  hyperlinkPage?: number | ""; // numeric page within PDF
  pdfUrl?: string;          // computed: `${pdfBaseUrl}#page=${hyperlinkPage}`
  sourceSig: string;        // STRICT OCR: bind rows to current screenshot signature (REQUIRED)
};

export type OcrTableRow = {
  id: string;
  tabNo: string;
  fullText: string;
  hyperlinkPage: string;
  hyperlinkUrl: string;
  // Manual editing fields for permanent database saving
  isManuallyEdited?: boolean;
  lastEditedBy?: string;
  lastEditedAt?: string;
  // Legacy fields for backward compatibility
  date?: string;
  nature?: string;
};