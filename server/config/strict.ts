export interface StrictConfig {
  STRICT_INDEX_ONLY: boolean;
  MAX_PDF_SIZE_MB: number;
  MAX_PROCESSING_TIME_MS: number;
  REQUIRED_INDEX_MATCH: boolean;
}

export const strictConfig: StrictConfig = {
  STRICT_INDEX_ONLY: process.env.STRICT_INDEX_ONLY === 'true' || process.env.NODE_ENV === 'production',
  MAX_PDF_SIZE_MB: parseInt(process.env.MAX_PDF_SIZE_MB || '50'),
  MAX_PROCESSING_TIME_MS: parseInt(process.env.MAX_PROCESSING_TIME_MS || '600000'), // 10 minutes
  REQUIRED_INDEX_MATCH: process.env.REQUIRED_INDEX_MATCH === 'true' || process.env.NODE_ENV === 'production',
};

export function validateStrictMode(indexItems: number, linksCreated: number, maxPages: number, targetPages: number[]): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Rule 1: Links created must exactly equal index items
  if (strictConfig.STRICT_INDEX_ONLY && linksCreated !== indexItems) {
    errors.push(`Expected ${indexItems} links to match index items, but created ${linksCreated}`);
  }

  // Rule 2: All target pages must be within document bounds
  const invalidPages = targetPages.filter(page => page < 1 || page > maxPages);
  if (invalidPages.length > 0) {
    errors.push(`Target pages out of bounds: ${invalidPages.join(', ')}. Document has ${maxPages} pages.`);
  }

  // Rule 3: No duplicate target pages (each index item must have unique start page)
  const duplicates = targetPages.filter((page, index) => targetPages.indexOf(page) !== index);
  if (duplicates.length > 0) {
    errors.push(`Duplicate target pages detected: ${duplicates.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function clampToValidRange(page: number, maxPages: number): number {
  return Math.max(1, Math.min(page, maxPages));
}