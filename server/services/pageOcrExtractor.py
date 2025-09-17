#!/usr/bin/env python3
"""
Page-level OCR extractor for the OCR-first architecture.
Extracts text from a specific page of a PDF using enhanced OCR.
"""

import sys
import json
try:
    import fitz  # Try standard import first
except ImportError:
    import pymupdf as fitz  # Fallback for newer installations
import pytesseract
from PIL import Image
import io
import numpy as np
import cv2

def extract_page_ocr(pdf_path, page_number):
    """
    Extract OCR text from a specific PDF page with confidence scoring.
    
    Args:
        pdf_path: Path to the PDF file
        page_number: Page number to process (1-indexed)
    
    Returns:
        dict: {
            'text': str,
            'confidence': float,
            'metadata': dict
        }
    """
    try:
        # Open PDF and get the specific page
        doc = fitz.open(pdf_path)
        page_index = page_number - 1  # Convert to 0-indexed
        
        if page_index >= doc.page_count:
            return {
                'text': '',
                'confidence': 0.0,
                'metadata': {'error': f'Page {page_number} does not exist (document has {doc.page_count} pages)'}
            }
        
        page = doc[page_index]
        
        # Convert page to image with balanced resolution for speed vs quality
        mat = fitz.Matrix(1.5, 1.5)  # 1.5x zoom for good OCR quality and reasonable speed
        pix = page.get_pixmap(matrix=mat)
        img_data = pix.tobytes("png")
        
        # Convert to PIL Image
        image = Image.open(io.BytesIO(img_data))
        
        # Convert to numpy array for OpenCV processing
        img_array = np.array(image)
        
        # Apply image preprocessing for better OCR
        processed_image = preprocess_for_ocr(img_array)
        
        # Perform OCR with confidence data
        try:
            # Get OCR data with confidence scores
            ocr_data = pytesseract.image_to_data(
                processed_image,
                output_type=pytesseract.Output.DICT,
                config='--psm 6 --oem 3'  # PSM 6: Uniform block of text, OEM 3: Default
            )
            
            # Extract text and calculate confidence
            text_parts = []
            confidences = []
            
            for i, word in enumerate(ocr_data['text']):
                if word.strip():  # Only include non-empty words
                    text_parts.append(word)
                    conf = int(ocr_data['conf'][i])
                    if conf > 0:  # Only include positive confidence scores
                        confidences.append(conf)
            
            # Join text with spaces
            full_text = ' '.join(text_parts)
            
            # Calculate average confidence
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
            avg_confidence = avg_confidence / 100.0  # Convert to 0-1 scale
            
            # Get additional metadata
            metadata = {
                'page_number': page_number,
                'image_size': list(image.size),
                'word_count': len(text_parts),
                'confidence_scores': confidences[:10] if len(confidences) > 10 else confidences,  # Sample of scores
                'preprocessing_applied': True,
                'ocr_engine': 'pytesseract',
                'ocr_mode': 'PSM_6_OEM_3'
            }
            
            return {
                'text': full_text,
                'confidence': avg_confidence,
                'metadata': metadata
            }
            
        except Exception as ocr_error:
            return {
                'text': '',
                'confidence': 0.0,
                'metadata': {
                    'error': f'OCR processing failed: {str(ocr_error)}',
                    'page_number': page_number
                }
            }
        
        finally:
            doc.close()
            
    except Exception as e:
        return {
            'text': '',
            'confidence': 0.0,
            'metadata': {
                'error': f'Page processing failed: {str(e)}',
                'page_number': page_number
            }
        }

def preprocess_for_ocr(image):
    """
    Apply image preprocessing to improve OCR accuracy.
    
    Args:
        image: numpy array representing the image
    
    Returns:
        processed image as numpy array
    """
    try:
        # Convert to grayscale if needed
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        else:
            gray = image
        
        # Apply noise reduction
        denoised = cv2.medianBlur(gray, 3)
        
        # Apply adaptive thresholding for better text contrast
        thresh = cv2.adaptiveThreshold(
            denoised, 
            255, 
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
            cv2.THRESH_BINARY, 
            11, 
            2
        )
        
        # Apply morphological operations to clean up text
        kernel = np.ones((1, 1), np.uint8)
        cleaned = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
        
        return cleaned
        
    except Exception as e:
        # If preprocessing fails, return original image
        return image

def main():
    if len(sys.argv) != 3:
        print(json.dumps({
            'text': '',
            'confidence': 0.0,
            'metadata': {'error': 'Usage: pageOcrExtractor.py <pdf_path> <page_number>'}
        }))
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    try:
        page_number = int(sys.argv[2])
    except ValueError:
        print(json.dumps({
            'text': '',
            'confidence': 0.0,
            'metadata': {'error': 'Page number must be an integer'}
        }))
        sys.exit(1)
    
    # Extract OCR from the specified page
    result = extract_page_ocr(pdf_path, page_number)
    
    # Output JSON result
    print(json.dumps(result, ensure_ascii=False))

if __name__ == "__main__":
    main()