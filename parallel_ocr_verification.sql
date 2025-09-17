-- 🔍 PARALLEL OCR VERIFICATION QUERIES
-- Use these to confirm parallel processing is really happening

-- 1. 📊 Real-time Page Insertion Timeline
-- Shows when pages were processed - parallel = many pages with similar timestamps
SELECT 
    page_number, 
    status,
    created_at,
    EXTRACT(EPOCH FROM created_at) as timestamp_seconds
FROM ocr_pages 
WHERE document_id = 'eeb2949a-feaf-4878-b79b-bb09a72290f7'
ORDER BY created_at DESC 
LIMIT 30;

-- 2. ⚡ Processing Speed Analysis 
-- Parallel = multiple pages per second, Serial = 1 page per 10+ minutes
SELECT 
    DATE_TRUNC('minute', created_at) as minute_bucket,
    COUNT(*) as pages_completed,
    STRING_AGG(page_number::text, ', ' ORDER BY page_number) as pages
FROM ocr_pages 
WHERE document_id = 'eeb2949a-feaf-4878-b79b-bb09a72290f7'
  AND status = 'completed'
GROUP BY DATE_TRUNC('minute', created_at)
ORDER BY minute_bucket DESC
LIMIT 10;

-- 3. 🚀 Batch Pattern Detection
-- Parallel = pages in sequential batches (1-25, 26-50, etc), Serial = random order
SELECT 
    page_number,
    created_at,
    LAG(page_number) OVER (ORDER BY created_at) as prev_page,
    page_number - LAG(page_number) OVER (ORDER BY created_at) as page_gap
FROM ocr_pages 
WHERE document_id = 'eeb2949a-feaf-4878-b79b-bb09a72290f7'
ORDER BY created_at 
LIMIT 50;

-- 4. 📈 Progress Jump Analysis
-- Parallel = big jumps (0 → 50 → 100), Serial = incremental (1 → 2 → 3)
WITH progress_timeline AS (
    SELECT 
        created_at,
        COUNT(*) OVER (ORDER BY created_at) as cumulative_pages
    FROM ocr_pages 
    WHERE document_id = 'eeb2949a-feaf-4878-b79b-bb09a72290f7'
    ORDER BY created_at
)
SELECT 
    created_at,
    cumulative_pages,
    cumulative_pages - LAG(cumulative_pages, 1, 0) OVER (ORDER BY created_at) as pages_added
FROM progress_timeline
ORDER BY created_at DESC
LIMIT 20;