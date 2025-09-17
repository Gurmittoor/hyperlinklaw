export interface IndexItem {
  ordinal: number;
  label: string;
  rawRow: string;
  pageHint?: number;
  confidence: number;
  type: 'tab' | 'exhibit' | 'schedule' | 'pleading' | 'order' | 'other';
}

// Robust pattern matching for different index formats
const NUMBERED_PATTERNS = [
  /^\s*(\d+)\s*\.\s+(.+?)\s*$/i,           // "1. Item text"
  /^\s*(\d+)\s*\)\s+(.+?)\s*$/i,           // "1) Item text"
  /^\s*(\d+)\s*-\s+(.+?)\s*$/i,            // "1 - Item text"
  /^\s*(\d+)\s*:\s+(.+?)\s*$/i,            // "1: Item text"
];

const TABBED_PATTERNS = [
  /^\s*(?:TAB|ITEM)\s*(\d+)\s*[.)-]?\s*[-—]\s*(.+?)\s*$/i,    // "TAB 1 — Item text"
  /^\s*(?:TAB|ITEM)\s*(\d+)\s*[.)-]?\s+(.+?)\s*$/i,           // "TAB 1 Item text"
  /^\s*(?:EXHIBIT|EX)\s*([A-Z0-9]+)\s*[-—]\s*(.+?)\s*$/i,     // "EXHIBIT A — Item text"
];

const BULLET_PATTERNS = [
  /^\s*[-•]\s+(.+?)\s*$/,                   // "• Item text" or "- Item text"
  /^\s*[▪▫]\s+(.+?)\s*$/,                   // "▪ Item text"
];

// Em-dash and legal document specific patterns
const LEGAL_PATTERNS = [
  /^\s*(\d+)\s*[.]\s*(.+?)\s*—\s*(.+?)\s*$/i,              // "1. Label — Description"
  /^\s*([A-Z][^—]+?)\s*—\s*(.+?)\s*$/i,                     // "PLEADINGS — Description"
  /^\s*(Pleadings?|Exhibits?|Schedules?|Orders?|Transcripts?|Forms?)\s*—\s*(.+?)\s*$/i,  // Legal document types
];

function guessType(text: string): IndexItem['type'] {
  const t = text.toLowerCase();
  if (/\b(exhibit|ex\.?)\b/i.test(t)) return 'exhibit';
  if (/\b(tab|item)\b/i.test(t)) return 'tab';
  if (/\b(schedule|attachment)\b/i.test(t)) return 'schedule';
  if (/\b(pleading|application|answer|reply|motion|affidavit)\b/i.test(t)) return 'pleading';
  if (/\b(order|endorsement|judgment)\b/i.test(t)) return 'order';
  return 'other';
}

function calculateConfidence(text: string, patternType: string): number {
  // Higher confidence for well-structured patterns
  if (patternType === 'numbered' && /^\s*\d+\s*\.\s+/.test(text)) return 0.95;
  if (patternType === 'tabbed' && /^\s*(?:TAB|EXHIBIT)\s*\d+/i.test(text)) return 0.92;
  if (patternType === 'legal' && /—/.test(text)) return 0.90;
  if (patternType === 'bullet') return 0.85;
  
  // Lower confidence for edge cases
  if (text.length < 10) return 0.70;
  if (text.length > 200) return 0.75;
  
  return 0.80; // Default confidence
}

export function extractIndexFromText(fullText: string): IndexItem[] {
  console.log(`🔍 Starting robust index extraction from ${fullText.length} characters of text`);
  
  if (!fullText || fullText.length < 50) {
    console.log('❌ Text too short for index extraction');
    return [];
  }

  const items: IndexItem[] = [];
  let indexSectionFound = false;
  let inIndexSection = false;
  
  // Find the INDEX section in the text
  const lines = fullText.split(/\r?\n/).map(line => line.trim());
  
  console.log(`📄 Processing ${lines.length} lines for index extraction`);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip empty lines
    if (!line || line.length < 2) continue;
    
    // Look for INDEX heading
    if (/^\s*INDEX\s*$/i.test(line) || /^\s*TABLE\s+OF\s+CONTENTS?\s*$/i.test(line)) {
      console.log(`✅ Found INDEX section at line ${i + 1}: "${line}"`);
      indexSectionFound = true;
      inIndexSection = true;
      continue;
    }
    
    // If we haven't found INDEX yet, keep looking
    if (!indexSectionFound) continue;
    
    // Stop processing if we hit obvious non-index content
    if (inIndexSection && /^(date|signature|www\.|court file|issued|page \d+|\d{4}-\d{2}-\d{2})/i.test(line)) {
      console.log(`🛑 Stopping at line ${i + 1}: "${line}" (non-index content)`);
      break;
    }
    
    // Try to match different patterns
    let matched = false;
    let ordinal: number = 0;
    let label: string = '';
    let patternType: string = '';
    
    // Try numbered patterns first
    for (const pattern of NUMBERED_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        ordinal = parseInt(match[1], 10);
        label = match[2].trim();
        patternType = 'numbered';
        matched = true;
        break;
      }
    }
    
    // Try tabbed patterns
    if (!matched) {
      for (const pattern of TABBED_PATTERNS) {
        const match = line.match(pattern);
        if (match) {
          const numStr = match[1];
          ordinal = isNaN(parseInt(numStr)) ? items.length + 1 : parseInt(numStr, 10);
          label = match[2].trim();
          patternType = 'tabbed';
          matched = true;
          break;
        }
      }
    }
    
    // Try legal document patterns (em-dash format)
    if (!matched) {
      for (const pattern of LEGAL_PATTERNS) {
        const match = line.match(pattern);
        if (match) {
          if (match.length === 4) {
            // "1. Label — Description"
            ordinal = parseInt(match[1], 10);
            label = `${match[2].trim()} — ${match[3].trim()}`;
          } else {
            // "LABEL — Description"
            ordinal = items.length + 1;
            label = line.trim();
          }
          patternType = 'legal';
          matched = true;
          break;
        }
      }
    }
    
    // Try bullet patterns as fallback
    if (!matched) {
      for (const pattern of BULLET_PATTERNS) {
        const match = line.match(pattern);
        if (match) {
          ordinal = items.length + 1;
          label = match[1].trim();
          patternType = 'bullet';
          matched = true;
          break;
        }
      }
    }
    
    if (matched && label && label.length > 3) {
      const type = guessType(label);
      const confidence = calculateConfidence(line, patternType);
      
      // Avoid duplicates
      const existingItem = items.find(item => 
        item.ordinal === ordinal || 
        item.label.toLowerCase() === label.toLowerCase()
      );
      
      if (!existingItem) {
        items.push({
          ordinal,
          label,
          rawRow: line,
          pageHint: 1, // We don't have page info from full text extraction
          confidence,
          type
        });
        
        console.log(`✅ Extracted item ${ordinal}: ${type} - ${label.substring(0, 50)}${label.length > 50 ? '...' : ''}`);
      }
    }
  }
  
  // Sort by ordinal and remove any gaps
  const sortedItems = items.sort((a, b) => a.ordinal - b.ordinal);
  
  // If we found items but no INDEX heading, reduce confidence slightly
  if (sortedItems.length > 0 && !indexSectionFound) {
    console.log('⚠️ Items found but no INDEX heading detected - reducing confidence');
    sortedItems.forEach(item => {
      item.confidence = Math.max(0.70, item.confidence - 0.15);
    });
  }
  
  console.log(`🎯 Final result: ${sortedItems.length} index items extracted`);
  sortedItems.forEach((item, idx) => {
    console.log(`   ${idx + 1}. ${item.ordinal}: ${item.type} - ${item.label}`);
  });
  
  return sortedItems;
}

// Template items to provide when no index is found
export function getTemplateItems(): IndexItem[] {
  return [
    {
      ordinal: 1,
      label: "Pleadings — Application, Fresh as Amended Answer and Reply",
      rawRow: "1. Pleadings — Application, Fresh as Amended Answer and Reply",
      pageHint: 1,
      confidence: 0.60, // Lower confidence for template items
      type: 'pleading'
    },
    {
      ordinal: 2,
      label: "Subrule 13 documents — Sworn Financial Statements",
      rawRow: "2. Subrule 13 documents — Sworn Financial Statements",
      pageHint: 1,
      confidence: 0.60,
      type: 'other'
    },
    {
      ordinal: 3,
      label: "Transcript on which we intend to rely — Rino Ferrante's Transcript - Examination",
      rawRow: "3. Transcript on which we intend to rely — Rino Ferrante's Transcript - Examination",
      pageHint: 1,
      confidence: 0.60,
      type: 'other'
    },
    {
      ordinal: 4,
      label: "Temporary Orders and Order relating to the trial",
      rawRow: "4. Temporary Orders and Order relating to the trial",
      pageHint: 1,
      confidence: 0.60,
      type: 'order'
    },
    {
      ordinal: 5,
      label: "Trial Scheduling Endorsement Form",
      rawRow: "5. Trial Scheduling Endorsement Form",
      pageHint: 1,
      confidence: 0.60,
      type: 'other'
    }
  ];
}