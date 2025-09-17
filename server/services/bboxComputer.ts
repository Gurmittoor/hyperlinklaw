// Service for computing bounding boxes from OCR word data for visual review highlights

interface OcrWord {
  text: string;
  bbox: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class BoundingBoxComputer {
  
  /**
   * Compute a bounding box that encompasses a range of OCR words
   * Coordinates are normalized (0..1) for PDF.js compatibility
   */
  static computeRowBbox(words: OcrWord[], startIdx: number, endIdx: number): BBox {
    if (!words || words.length === 0 || startIdx > endIdx || startIdx < 0 || endIdx >= words.length) {
      // Return a default bbox if invalid range
      return { x: 0, y: 0, width: 1, height: 0.02 };
    }

    const selectedWords = words.slice(startIdx, endIdx + 1);
    
    // Collect all x and y coordinates
    const xCoords: number[] = [];
    const yCoords: number[] = [];
    
    selectedWords.forEach(word => {
      if (word.bbox) {
        xCoords.push(word.bbox.x, word.bbox.x + word.bbox.w);
        yCoords.push(word.bbox.y, word.bbox.y + word.bbox.h);
      }
    });
    
    if (xCoords.length === 0) {
      return { x: 0, y: 0, width: 1, height: 0.02 };
    }
    
    const minX = Math.max(0, Math.min(...xCoords));
    const maxX = Math.min(1, Math.max(...xCoords));
    const minY = Math.max(0, Math.min(...yCoords));
    const maxY = Math.min(1, Math.max(...yCoords));
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * Find words that match a text pattern and return their bounding box
   */
  static findTextBbox(words: OcrWord[], searchText: string, caseSensitive = false): BBox | null {
    if (!words || !searchText) return null;
    
    const normalizedSearch = caseSensitive ? searchText : searchText.toLowerCase();
    const wordsText = words.map(w => caseSensitive ? w.text : w.text.toLowerCase());
    
    // Try exact match first
    const exactIdx = wordsText.findIndex(text => text === normalizedSearch);
    if (exactIdx !== -1) {
      return this.computeRowBbox(words, exactIdx, exactIdx);
    }
    
    // Try partial match (word contains the search text)
    const partialIdx = wordsText.findIndex(text => text.includes(normalizedSearch));
    if (partialIdx !== -1) {
      return this.computeRowBbox(words, partialIdx, partialIdx);
    }
    
    // Try multi-word match (consecutive words that form the search text)
    for (let i = 0; i < words.length; i++) {
      let combinedText = "";
      let endIdx = i;
      
      for (let j = i; j < Math.min(i + 10, words.length); j++) { // Look ahead max 10 words
        combinedText += (j === i ? "" : " ") + wordsText[j];
        if (combinedText.includes(normalizedSearch)) {
          endIdx = j;
          break;
        }
      }
      
      if (combinedText.includes(normalizedSearch)) {
        return this.computeRowBbox(words, i, endIdx);
      }
    }
    
    return null;
  }

  /**
   * Create a bounding box for a line of text (useful when we only have line-level matches)
   */
  static createLineBbox(pageWidth: number, pageHeight: number, lineY: number, lineHeight: number = 20): BBox {
    return {
      x: 0.05, // 5% margin from left
      y: Math.max(0, lineY / pageHeight),
      width: 0.9, // 90% of page width
      height: Math.min(0.05, lineHeight / pageHeight) // Max 5% of page height
    };
  }

  /**
   * Generate a highlight bbox for index items (tab numbers and titles)
   */
  static generateIndexRowBbox(words: OcrWord[], tabNumber: string, tabTitle?: string): BBox | null {
    // First try to find the tab number
    const tabPattern = new RegExp(`^(TAB|Tab)\\s*${tabNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (tabPattern.test(word.text)) {
        // Found tab number, now look for the title in the next few words
        let endIdx = i;
        
        if (tabTitle) {
          const titleWords = tabTitle.split(' ').slice(0, 5); // Look for first 5 words of title
          for (let j = i + 1; j < Math.min(i + 15, words.length); j++) {
            const remainingText = words.slice(j, j + titleWords.length)
              .map(w => w.text)
              .join(' ')
              .toLowerCase();
            
            if (remainingText.includes(titleWords.join(' ').toLowerCase())) {
              endIdx = j + titleWords.length - 1;
              break;
            }
          }
        } else {
          // No title provided, just highlight the tab number and next few words
          endIdx = Math.min(i + 3, words.length - 1);
        }
        
        return this.computeRowBbox(words, i, endIdx);
      }
    }
    
    // Fallback: search for just the tab number without "TAB" prefix
    const numberBbox = this.findTextBbox(words, tabNumber);
    if (numberBbox) return numberBbox;
    
    return null;
  }

  /**
   * Generate a highlight bbox for link candidates (referenced text in brief documents)
   */
  static generateCandidateBbox(words: OcrWord[], candidateText: string): BBox | null {
    // Clean up the candidate text (remove extra whitespace, normalize)
    const cleanText = candidateText.trim().replace(/\s+/g, ' ');
    
    // Try exact match first
    let bbox = this.findTextBbox(words, cleanText);
    if (bbox) return bbox;
    
    // Try first few words of the candidate
    const firstWords = cleanText.split(' ').slice(0, 3).join(' ');
    bbox = this.findTextBbox(words, firstWords);
    if (bbox) return bbox;
    
    // Try last few words of the candidate
    const lastWords = cleanText.split(' ').slice(-3).join(' ');
    bbox = this.findTextBbox(words, lastWords);
    if (bbox) return bbox;
    
    return null;
  }
}

// BoundingBoxComputer already exported above