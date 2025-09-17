import type { IndexRow } from "@/types/indexing";

// Matches "1.", "1", "01", etc.
const TAB_RE = /^\s*(\d{1,3})\.?\s+/;
// Month Day, Year (allow variations)
const DATE_RE = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/;

// Clean OCR junk
function clean(s: string) {
  return s
    .replace(/[|]+/g, " ")
    .replace(/\u2013|\u2014/g, "–")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Parse index screenshot OCR into structured rows.
 * Handles wrapped titles by accumulating lines until the next tab number.
 * @param raw - The raw OCR text to parse
 * @param sourceSig - The signature of the screenshot batch for strict binding (required)
 */
export function parseIndexText(raw: string, sourceSig: string = ""): IndexRow[] {
  const lines = raw.split(/\r?\n/).map(clean).filter(Boolean);

  // drop header lines commonly seen
  const headerIdx = lines.findIndex(l =>
    /Tab\s*No\.?/i.test(l) && /Date/i.test(l) && /Nature/i.test(l)
  );
  const work = headerIdx >= 0 ? lines.slice(headerIdx + 1) : lines;

  const rows: IndexRow[] = [];
  let buf: string[] = [];

  const flush = (chunk: string[]) => {
    if (!chunk.length) return;
    const joined = chunk.join(" ");
    const tabM = joined.match(TAB_RE);
    if (!tabM) return;
    const tabNo = tabM[1];

    // pull date
    const dateM = joined.match(DATE_RE);
    const date = dateM ? dateM[0] : "";

    // nature: content after date or after the tab number if no date
    let nature = "";
    if (dateM) {
      nature = clean(joined.slice(joined.indexOf(dateM[0]) + dateM[0].length));
    } else {
      nature = clean(joined.replace(TAB_RE, ""));
    }

    // remove leading separators/dashes
    nature = nature.replace(/^[–\-:\s]+/, "");

    rows.push({
      tabNo,
      dateOfDocument: date,
      nature,
      hyperlinkPage: "",
      pdfUrl: "",
      sourceSig: sourceSig
    });
  };

  for (const line of work) {
    const isNew = TAB_RE.test(line);
    if (isNew) {
      flush(buf);       // finalize previous
      buf = [line];     // start new
    } else {
      buf.push(line);   // continuation of nature (wrapped)
    }
  }
  flush(buf);

  return rows;
}

export function mergeIndexRows(prev: IndexRow[], next: IndexRow[], preserveOrder?: boolean) {
  // Strict validation for screenshot-derived rows when preserveOrder is true
  if (preserveOrder) {
    // Validate that incoming rows have non-empty sourceSig for stricter validation
    const invalidRows = next.filter(r => !r.sourceSig || r.sourceSig.trim() === "");
    if (invalidRows.length > 0) {
      console.warn('🔒 STRICT OCR: Rejecting rows with empty sourceSig during merge:', invalidRows.length);
      // Filter out rows without valid sourceSig to maintain strict binding
      next = next.filter(r => r.sourceSig && r.sourceSig.trim() !== "");
    }
  }
  
  const byTab = new Map(prev.map(r => [r.tabNo.replace(/\D/g, ""), r]));
  next.forEach(r => {
    const key = r.tabNo.replace(/\D/g, "");
    if (!byTab.has(key)) byTab.set(key, r);
  });
  
  const mergedRows = Array.from(byTab.values());
  
  // If preserveOrder is true (for screenshot-derived rows), maintain insertion order
  // Otherwise, sort by numeric tabNo (existing behavior)
  if (preserveOrder) {
    return mergedRows; // Maintain Map iteration order (insertion order)
  }
  
  return mergedRows.sort((a,b)=>Number(a.tabNo)-Number(b.tabNo));
}