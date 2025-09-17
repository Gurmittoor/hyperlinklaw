-- HyperlinkLaw GPU OCR Worker Database Schema
-- Run this on your PostgreSQL database to support GPU processing

-- Per-page OCR storage with UNIQUE constraint to prevent double counting
CREATE TABLE IF NOT EXISTS ocr_pages (
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  extracted_text TEXT,
  words_json JSONB,
  confidence NUMERIC(4,3),
  processing_time_ms INT,
  status TEXT NOT NULL DEFAULT 'completed', -- 'completed' | 'failed'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (document_id, page_number)
);

-- CRITICAL: Prevent the "159%" bug with unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS ocr_pages_unique
  ON ocr_pages (document_id, page_number);

-- Job state tracking on documents table
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS ocr_status TEXT,                -- 'queued'|'processing'|'completed'|'failed'
  ADD COLUMN IF NOT EXISTS ocr_pages_done INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ocr_confidence_avg NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS ocr_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ocr_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_pages INT;

-- Index for fast progress queries
CREATE INDEX IF NOT EXISTS idx_documents_ocr_status ON documents(ocr_status);
CREATE INDEX IF NOT EXISTS idx_ocr_pages_status ON ocr_pages(document_id, status);

-- Index items for lawyer-priority processing
CREATE TABLE IF NOT EXISTS index_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  item_number VARCHAR(20),
  title TEXT NOT NULL,
  page_reference VARCHAR(50),
  resolved_page INT,
  confidence NUMERIC(4,3),
  status TEXT DEFAULT 'detected', -- 'detected'|'resolved'|'needs_review'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_index_items_document ON index_items(document_id);
CREATE INDEX IF NOT EXISTS idx_index_items_status ON index_items(document_id, status);

-- Job queue metadata (optional - Redis handles actual queue)
CREATE TABLE IF NOT EXISTS ocr_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  priority TEXT DEFAULT 'normal', -- 'high'|'normal'|'low'
  status TEXT DEFAULT 'queued', -- 'queued'|'processing'|'completed'|'failed'
  worker_id TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ocr_jobs_status ON ocr_jobs(status, priority, created_at);

-- Performance monitoring
CREATE TABLE IF NOT EXISTS worker_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id TEXT NOT NULL,
  document_id UUID REFERENCES documents(id),
  pages_processed INT DEFAULT 0,
  avg_processing_time_ms INT,
  total_time_seconds INT,
  gpu_model TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Helper views for monitoring
CREATE OR REPLACE VIEW ocr_progress AS
SELECT 
  d.id as document_id,
  d.title,
  d.total_pages,
  COALESCE(d.ocr_pages_done, 0) as pages_done,
  CASE 
    WHEN d.total_pages > 0 THEN LEAST(100, ROUND((COALESCE(d.ocr_pages_done, 0) * 100.0) / d.total_pages))
    ELSE 0 
  END as progress_percent,
  COALESCE(d.ocr_confidence_avg, 0) as avg_confidence,
  d.ocr_status,
  d.ocr_started_at,
  d.ocr_completed_at,
  COUNT(op.page_number) as stored_pages
FROM documents d
LEFT JOIN ocr_pages op ON d.id = op.document_id AND op.status = 'completed'
WHERE d.ocr_status IS NOT NULL
GROUP BY d.id, d.title, d.total_pages, d.ocr_pages_done, d.ocr_confidence_avg, 
         d.ocr_status, d.ocr_started_at, d.ocr_completed_at;

-- Performance analytics view
CREATE OR REPLACE VIEW worker_performance AS
SELECT 
  worker_id,
  COUNT(*) as documents_processed,
  SUM(pages_processed) as total_pages,
  AVG(avg_processing_time_ms) as avg_ms_per_page,
  AVG(total_time_seconds) as avg_doc_time_seconds,
  gpu_model,
  DATE_TRUNC('day', created_at) as date
FROM worker_stats
GROUP BY worker_id, gpu_model, DATE_TRUNC('day', created_at)
ORDER BY date DESC, total_pages DESC;

-- Functions for truthful progress tracking
CREATE OR REPLACE FUNCTION update_document_ocr_progress(doc_id UUID)
RETURNS TABLE(pages_done INT, total_pages INT, avg_confidence NUMERIC) AS $$
DECLARE
  completed_count INT;
  total_count INT;
  avg_conf NUMERIC;
  doc_status TEXT;
BEGIN
  -- Get counts from actual stored pages
  SELECT 
    COUNT(CASE WHEN op.status = 'completed' THEN 1 END),
    d.total_pages,
    COALESCE(AVG(CASE WHEN op.status = 'completed' THEN op.confidence END), 0)
  INTO completed_count, total_count, avg_conf
  FROM documents d
  LEFT JOIN ocr_pages op ON d.id = op.document_id
  WHERE d.id = doc_id
  GROUP BY d.total_pages;
  
  -- Determine status
  IF completed_count >= total_count THEN
    doc_status := 'completed';
  ELSIF completed_count > 0 THEN
    doc_status := 'processing';
  ELSE
    doc_status := 'queued';
  END IF;
  
  -- Update document
  UPDATE documents SET 
    ocr_pages_done = completed_count,
    ocr_confidence_avg = avg_conf,
    ocr_status = doc_status,
    ocr_completed_at = CASE WHEN doc_status = 'completed' THEN NOW() ELSE ocr_completed_at END
  WHERE id = doc_id;
  
  RETURN QUERY SELECT completed_count, total_count, avg_conf;
END;
$$ LANGUAGE plpgsql;

-- Trigger to maintain truthful progress (optional - worker can call function directly)
CREATE OR REPLACE FUNCTION trigger_update_progress() RETURNS TRIGGER AS $$
BEGIN
  PERFORM update_document_ocr_progress(NEW.document_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ocr_pages_progress_trigger') THEN
    CREATE TRIGGER ocr_pages_progress_trigger
      AFTER INSERT OR UPDATE ON ocr_pages
      FOR EACH ROW
      EXECUTE FUNCTION trigger_update_progress();
  END IF;
END
$$;