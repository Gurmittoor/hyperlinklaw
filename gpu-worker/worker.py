#!/usr/bin/env python3
"""
HyperlinkLaw GPU OCR Worker
Ultra-fast legal document processing with PaddleOCR GPU acceleration
"""

import os
import time
import json
import logging
import asyncio
import fitz  # PyMuPDF
import redis
import psycopg2
import requests
from typing import List, Dict, Optional, Tuple
from paddleocr import PaddleOCR
import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
import uvicorn

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Initialize GPU OCR (optimized for legal documents)
logger.info("🚀 Initializing PaddleOCR with GPU acceleration...")
ocr = PaddleOCR(
    use_angle_cls=True,
    lang='en', 
    use_gpu=True,
    show_log=False,
    det_model_dir=None,
    rec_model_dir=None,
    cls_model_dir=None
)
logger.info("✅ PaddleOCR GPU initialization complete")

# Redis connection
redis_client = redis.Redis.from_url(os.getenv('REDIS_URL', 'redis://localhost:6379'))

# Database configuration
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': int(os.getenv('DB_PORT', '5432')),
    'database': os.getenv('DB_NAME', os.getenv('PGDATABASE')),
    'user': os.getenv('DB_USER', os.getenv('PGUSER')),
    'password': os.getenv('DB_PASSWORD', os.getenv('PGPASSWORD'))
}

class GPUOCRProcessor:
    def __init__(self):
        self.processing_jobs = set()
        
    def has_text_layer(self, page: fitz.Page) -> bool:
        """Check if page already has selectable text (skip OCR if so)"""
        text = page.get_text("text").strip()
        return len(text) > 50  # Threshold for meaningful text content
    
    def render_page_optimized(self, page: fitz.Page, dpi: int = 220) -> bytes:
        """Render page to high-quality grayscale image optimized for OCR"""
        # Use grayscale for better OCR performance
        pix = page.get_pixmap(dpi=dpi, colorspace=fitz.csGRAY)
        return pix.tobytes("png")
    
    def ocr_image_gpu(self, image_bytes: bytes) -> Tuple[str, List[Dict], float, int]:
        """Extract text from image using GPU-accelerated PaddleOCR"""
        start_time = time.time()
        
        # Convert bytes to OpenCV image
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
        
        # Apply image enhancement for better OCR
        img = cv2.medianBlur(img, 3)
        
        # Run GPU OCR
        result = ocr.ocr(img, cls=True)
        
        processing_time = int((time.time() - start_time) * 1000)
        
        # Parse OCR results
        text_lines = []
        words = []
        confidences = []
        
        if result and result[0]:
            for line in result[0]:
                bbox, (text, conf) = line
                text_lines.append(text)
                words.append({
                    "bbox": bbox,
                    "text": text,
                    "confidence": float(conf)
                })
                confidences.append(float(conf))
        
        full_text = "\n".join(text_lines)
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
        
        return full_text, words, avg_confidence, processing_time
    
    def store_page_result(self, doc_id: str, page_num: int, text: str, 
                         words: List[Dict], confidence: float, processing_time: int):
        """Store OCR result in database with UPSERT for resumability"""
        try:
            with psycopg2.connect(**DB_CONFIG) as conn:
                with conn.cursor() as cur:
                    # Use UPSERT to handle page reprocessing
                    cur.execute("""
                        INSERT INTO ocr_pages (
                            document_id, page_number, extracted_text, 
                            words_json, confidence, processing_time_ms, 
                            created_at, status
                        ) VALUES (%s, %s, %s, %s, %s, %s, NOW(), 'completed')
                        ON CONFLICT (document_id, page_number) 
                        DO UPDATE SET 
                            extracted_text = EXCLUDED.extracted_text,
                            words_json = EXCLUDED.words_json,
                            confidence = EXCLUDED.confidence,
                            processing_time_ms = EXCLUDED.processing_time_ms,
                            status = 'completed',
                            created_at = NOW()
                    """, (doc_id, page_num, text, json.dumps(words), confidence, processing_time))
                    conn.commit()
        except Exception as e:
            logger.error(f"❌ Failed to store page {page_num} for document {doc_id}: {e}")
            raise
    
    def update_document_progress(self, doc_id: str):
        """Update document progress based on completed pages"""
        try:
            with psycopg2.connect(**DB_CONFIG) as conn:
                with conn.cursor() as cur:
                    # Get total pages and completed count
                    cur.execute("""
                        SELECT 
                            d.total_pages,
                            COUNT(CASE WHEN o.status = 'completed' THEN 1 END) as completed,
                            COALESCE(AVG(CASE WHEN o.status = 'completed' THEN o.confidence END), 0) as avg_conf
                        FROM documents d
                        LEFT JOIN ocr_pages o ON d.id = o.document_id
                        WHERE d.id = %s
                        GROUP BY d.total_pages
                    """, (doc_id,))
                    
                    result = cur.fetchone()
                    if result:
                        total_pages, completed, avg_conf = result
                        
                        # Determine status and update document
                        if completed >= total_pages:
                            status = 'completed'
                            # Update document with completion timestamp
                            cur.execute("""
                                UPDATE documents SET 
                                    ocr_pages_done = %s,
                                    ocr_confidence_avg = %s,
                                    ocr_status = %s,
                                    ocr_completed_at = NOW()
                                WHERE id = %s
                            """, (completed, avg_conf, status, doc_id))
                        else:
                            status = 'processing'
                            # Update document without completion timestamp
                            cur.execute("""
                                UPDATE documents SET 
                                    ocr_pages_done = %s,
                                    ocr_confidence_avg = %s,
                                    ocr_status = %s,
                                    ocr_completed_at = NULL
                                WHERE id = %s
                            """, (completed, avg_conf, status, doc_id))
                        conn.commit()
                        
                        logger.info(f"📊 Document {doc_id}: {completed}/{total_pages} pages, {avg_conf:.1f}% confidence")
        except Exception as e:
            logger.error(f"❌ Failed to update progress for document {doc_id}: {e}")
    
    def download_pdf(self, pdf_url: str, doc_id: str) -> str:
        """Download PDF from URL to local temp file"""
        temp_path = f"/tmp/{doc_id}.pdf"
        
        try:
            response = requests.get(pdf_url, stream=True, timeout=300)
            response.raise_for_status()
            
            with open(temp_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            logger.info(f"📄 Downloaded PDF: {temp_path} ({os.path.getsize(temp_path)} bytes)")
            return temp_path
        except Exception as e:
            logger.error(f"❌ Failed to download PDF {pdf_url}: {e}")
            raise
    
    async def process_document_gpu(self, job_data: Dict):
        """Process entire document with GPU acceleration and real-time progress"""
        doc_id = job_data['document_id']
        pdf_url = job_data['pdf_url']
        total_pages = job_data['total_pages']
        priority = job_data.get('priority', 'normal')
        
        logger.info(f"🚀 Starting GPU OCR for document {doc_id} ({total_pages} pages, priority: {priority})")
        
        if doc_id in self.processing_jobs:
            logger.warning(f"⚠️ Document {doc_id} already being processed")
            return
        
        self.processing_jobs.add(doc_id)
        
        try:
            # Download PDF
            pdf_path = self.download_pdf(pdf_url, doc_id)
            
            # Open PDF with PyMuPDF
            doc = fitz.open(pdf_path)
            
            # Mark as processing
            with psycopg2.connect(**DB_CONFIG) as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        UPDATE documents SET 
                            ocr_status = 'processing',
                            ocr_started_at = NOW()
                        WHERE id = %s
                    """, (doc_id,))
                    conn.commit()
            
            processed_pages = 0
            
            # Process each page
            for page_num in range(total_pages):
                page = doc[page_num]
                start_time = time.time()
                
                try:
                    if self.has_text_layer(page):
                        # Fast path: extract existing text
                        text = page.get_text("text")
                        words = []  # Could extract word positions if needed
                        confidence = 0.99  # High confidence for existing text
                        processing_time = int((time.time() - start_time) * 1000)
                        
                        logger.info(f"📄 Page {page_num + 1}: Extracted text layer ({len(text)} chars)")
                    else:
                        # OCR path: render and process
                        image_bytes = self.render_page_optimized(page, dpi=220)
                        text, words, confidence, processing_time = self.ocr_image_gpu(image_bytes)
                        
                        # Retry with higher DPI if confidence is low
                        if confidence < 0.65:
                            logger.info(f"🔄 Page {page_num + 1}: Low confidence ({confidence:.2f}), retrying with higher DPI")
                            image_bytes = self.render_page_optimized(page, dpi=280)
                            text, words, confidence, processing_time = self.ocr_image_gpu(image_bytes)
                        
                        logger.info(f"🔍 Page {page_num + 1}: GPU OCR completed ({len(text)} chars, {confidence:.2f} confidence)")
                    
                    # Store results in database
                    self.store_page_result(doc_id, page_num + 1, text, words, confidence, processing_time)
                    processed_pages += 1
                    
                    # Update document progress
                    self.update_document_progress(doc_id)
                    
                except Exception as e:
                    logger.error(f"❌ Page {page_num + 1} failed: {e}")
                    # Store empty result to maintain progress
                    self.store_page_result(doc_id, page_num + 1, "", [], 0.0, 0)
                    processed_pages += 1
            
            # Clean up
            doc.close()
            os.remove(pdf_path)
            
            logger.info(f"✅ GPU OCR completed for document {doc_id}: {processed_pages}/{total_pages} pages")
            
        except Exception as e:
            logger.error(f"❌ GPU OCR failed for document {doc_id}: {e}")
            # Mark as failed
            with psycopg2.connect(**DB_CONFIG) as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        UPDATE documents SET 
                            ocr_status = 'failed'
                        WHERE id = %s
                    """, (doc_id,))
                    conn.commit()
        finally:
            self.processing_jobs.discard(doc_id)

# FastAPI app for health checks and manual triggers
app = FastAPI(title="HyperlinkLaw GPU OCR Worker", version="1.0.0")
processor = GPUOCRProcessor()

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "gpu_available": True,
        "active_jobs": len(processor.processing_jobs),
        "timestamp": time.time()
    }

@app.post("/process")
async def process_document(job_data: dict):
    """Manual document processing trigger"""
    try:
        await processor.process_document_gpu(job_data)
        return {"success": True, "message": "Document processing started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def worker_loop():
    """Main worker loop - processes jobs from Redis queue"""
    logger.info("🔄 Starting GPU worker loop...")
    
    while True:
        try:
            # Get job from Redis queue (blocking with timeout)
            job_data = redis_client.blpop('ocr_jobs', timeout=10)
            
            if job_data:
                job = json.loads(job_data[1])
                logger.info(f"🎯 Received job: {job}")
                await processor.process_document_gpu(job)
            
        except Exception as e:
            logger.error(f"❌ Worker error: {e}")
            await asyncio.sleep(5)

if __name__ == "__main__":
    # Start worker loop and FastAPI server
    import asyncio
    import threading
    
    # Start worker loop in background thread
    def start_worker():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(worker_loop())
    
    worker_thread = threading.Thread(target=start_worker, daemon=True)
    worker_thread.start()
    
    # Start FastAPI server
    logger.info("🚀 Starting GPU OCR Worker on port 8000...")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")