#!/usr/bin/env python3
"""
OCR utility for reading text from image-based PDF pages.
Smart fallback for pages that appear readable but have no extractable text.
"""

import io
import os
from typing import List, Tuple, Dict, Any, Optional
import fitz  # PyMuPDF
from PIL import Image
import pytesseract
import logging

def _rasterize(page: fitz.Page, dpi: int = 300) -> Image.Image:
    """Convert PDF page to PIL Image for OCR processing."""
    try:
        pix = page.get_pixmap(dpi=dpi, alpha=False)
        return Image.open(io.BytesIO(pix.tobytes("png")))
    except Exception as e:
        logging.warning(f"Failed to rasterize page: {e}")
        raise

def ocr_words(page: fitz.Page, dpi: int = 300, min_conf: int = 60) -> List[Dict[str, Any]]:
    """
    Extract words with OCR and return bounding boxes in PDF coordinates.
    Returns: [{text, rect: [x0,y0,x1,y1], conf}] in page coordinates
    """
    try:
        img = _rasterize(page, dpi=dpi)
    except Exception:
        return []
    
    try:
        # Use Tesseract to get word-level data with confidence scores
        data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT, config="--psm 6")
        
        out: List[Dict[str, Any]] = []
        
        # Convert from image pixels to PDF points
        W, H = img.size
        pr = page.rect
        sx, sy = pr.width / W, pr.height / H
        
        n = len(data["text"])
        for i in range(n):
            txt = (data["text"][i] or "").strip()
            conf = int(data.get("conf", ["0"])[i])
            
            if not txt or conf < min_conf:
                continue
                
            x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
            
            # Convert to PDF coordinates
            x0 = x * sx + pr.x0
            y0 = y * sy + pr.y0  
            x1 = (x + w) * sx + pr.x0
            y1 = (y + h) * sy + pr.y0
            
            out.append({
                "text": txt, 
                "rect": [x0, y0, x1, y1],
                "conf": conf
            })
            
        return out
        
    except Exception as e:
        logging.warning(f"OCR failed for page: {e}")
        return []

def ocr_phrase_rects(page: fitz.Page, needle: str, dpi: int = 300, min_conf: int = 60) -> List[List[float]]:
    """
    Find rectangles for a specific phrase using OCR word matching.
    Combines adjacent words that match the phrase tokens.
    """
    tokens = [t.strip() for t in needle.split() if t.strip()]
    if not tokens:
        return []
        
    words = ocr_words(page, dpi=dpi, min_conf=min_conf)
    if not words:
        return []
        
    tokens_lower = [t.lower() for t in tokens]
    rects: List[List[float]] = []
    
    # Look for token sequences in the OCR words
    for i, word in enumerate(words):
        if (word["text"] or "").lower() != tokens_lower[0]:
            continue
            
        # Try to match the full phrase starting from this word
        end_idx = i
        matched_tokens = 1
        
        for j in range(i + 1, len(words)):
            if matched_tokens >= len(tokens_lower):
                break
                
            if (words[j]["text"] or "").lower() == tokens_lower[matched_tokens]:
                end_idx = j
                matched_tokens += 1
                
        # Accept if we matched at least half the tokens (allows for OCR errors)
        if matched_tokens >= max(1, len(tokens_lower) // 2):
            # Create bounding box encompassing all matched words
            start_rect = words[i]["rect"]
            end_rect = words[end_idx]["rect"]
            
            x0 = min(start_rect[0], end_rect[0])
            y0 = min(start_rect[1], end_rect[1]) 
            x1 = max(start_rect[2], end_rect[2])
            y1 = max(start_rect[3], end_rect[3])
            
            rects.append([x0, y0, x1, y1])
            
    return rects

def page_has_extractable_text(page: fitz.Page) -> bool:
    """Check if page has extractable text (not image-only)."""
    try:
        words = page.get_text("words")
        text = page.get_text("text").strip()
        return bool(words) or bool(text)
    except:
        return False

def ocr_full_page_text(page: fitz.Page, dpi: int = 300) -> str:
    """Extract full text from page using OCR."""
    try:
        words = ocr_words(page, dpi=dpi)
        return " ".join([w["text"] for w in words])
    except Exception as e:
        logging.warning(f"Failed to OCR page text: {e}")
        return ""

def is_tesseract_available() -> bool:
    """Check if Tesseract is available on the system."""
    try:
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False