// server/indexExtractor.ts
export interface IndexItem {
  label: string;
  pageHint?: number;
  confidence: number;
  tabNumber?: string;
  title?: string;
  dateField?: string;
}

export function extractIndexFromText(text: string): IndexItem[] {
  // Find "INDEX" header and then numbered lines until a blank gap
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const start = lines.findIndex(l => /^index\b/i.test(l));
  if (start === -1) return [];

  const items: IndexItem[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];

    // Stop if we hit another section heading
    if (/^(exhibits?|schedule|table of contents|attachments?)$/i.test(l)) break;

    // Match various patterns:
    // "1. Something … Page 15" OR "1 Something" OR "Tab 1: Something"
    const patterns = [
      /^(?:Tab\s+)?(\d+)[\.\):]?\s+(.+?)(?:\.*\s*(?:p(?:age)?\s*)?(\d+))?$/i,
      /^([A-Z]\d*|\d+[A-Z]?)[\.\):]?\s+(.+?)(?:\.*\s*(?:p(?:age)?\s*)?(\d+))?$/i,
      /^(Exhibit\s+[A-Z0-9\-]+|\d+)[\.\):]?\s+(.+?)(?:\.*\s*(?:p(?:age)?\s*)?(\d+))?$/i
    ];

    let matched = false;
    for (const pattern of patterns) {
      const m = l.match(pattern);
      if (m) {
        const [, tabNum, title, page] = m;
        
        // Extract date from title if present
        const dateMatch = title.match(/(\d{1,2}\/\d{1,2}\/\d{2,4}|\w+\s+\d{1,2},?\s+\d{4}|dated\s+[^,]+)/i);
        const dateField = dateMatch ? dateMatch[1] : undefined;
        
        // Clean title by removing date if found
        const cleanTitle = dateField && dateMatch ? title.replace(dateMatch[0], '').replace(/[,\s]+$/, '') : title;

        items.push({
          label: l,
          pageHint: page ? Number(page) : undefined,
          confidence: 0.95,
          tabNumber: tabNum,
          title: cleanTitle.trim(),
          dateField: dateField?.trim()
        });
        matched = true;
        break;
      }
    }

    // Stop if we get long run of non-matches (likely end of index section)
    if (items.length > 0 && !matched) {
      // Allow a few non-matching lines, but stop after too many
      const nonMatches = lines.slice(i).slice(0, 5).filter(line => {
        return !patterns.some(pattern => pattern.test(line));
      });
      if (nonMatches.length >= 4) break;
    }
  }
  
  return items;
}