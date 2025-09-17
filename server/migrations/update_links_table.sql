-- Migration to add enhanced hyperlink review columns to links table
-- Run this script to update the database schema

-- Add new columns to the links table
ALTER TABLE links 
ADD COLUMN IF NOT EXISTS src_text TEXT,
ADD COLUMN IF NOT EXISTS src_context TEXT,
ADD COLUMN IF NOT EXISTS target_text TEXT,
ADD COLUMN IF NOT EXISTS link_type TEXT DEFAULT 'citation',
ADD COLUMN IF NOT EXISTS reviewer_notes TEXT,
ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;

-- Update existing records to have proper status values
UPDATE links SET status = 'pending' WHERE status = 'auto';
UPDATE links SET status = 'approved' WHERE status = 'confirmed';

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_links_status ON links(status);
CREATE INDEX IF NOT EXISTS idx_links_type ON links(link_type);
CREATE INDEX IF NOT EXISTS idx_links_confidence ON links(confidence);
CREATE INDEX IF NOT EXISTS idx_links_reviewed_by ON links(reviewed_by);

-- Add sample data for testing the review interface
INSERT INTO links (
  case_id, src_doc_id, src_page, src_text, src_context, target_doc_id, target_page, 
  target_text, link_type, status, confidence, why
) VALUES 
(
  '891eba1b-5b5e-4514-ab90-0348b0d123c1',
  '891eba1b-5b5e-4514-ab90-0348b0d123c1',
  1,
  'Exhibit A',
  'As shown in Exhibit A attached hereto and incorporated by reference',
  '891eba1b-5b5e-4514-ab90-0348b0d123c1',
  15,
  'Financial Statements for Fiscal Year 2024',
  'exhibit',
  'pending',
  0.95,
  'Clear reference to financial exhibit document with high confidence'
),
(
  '891eba1b-5b5e-4514-ab90-0348b0d123c1',
  '891eba1b-5b5e-4514-ab90-0348b0d123c1',
  3,
  'Page 45',
  'See detailed analysis on Page 45 of this document',
  '891eba1b-5b5e-4514-ab90-0348b0d123c1',
  45,
  'Asset valuation methodology and calculations',
  'page_ref',
  'pending',
  0.88,
  'Internal page reference with specific context'
),
(
  '891eba1b-5b5e-4514-ab90-0348b0d123c1',
  '891eba1b-5b5e-4514-ab90-0348b0d123c1',
  2,
  'Document D-1',
  'According to Document D-1 filed with the court',
  '891eba1b-5b5e-4514-ab90-0348b0d123c1',
  28,
  'Affidavit of Financial Information',
  'citation',
  'pending',
  0.92,
  'Reference to court document with legal significance'
),
(
  '891eba1b-5b5e-4514-ab90-0348b0d123c1',
  '891eba1b-5b5e-4514-ab90-0348b0d123c1',
  7,
  'footnote 12',
  'For additional context see footnote 12 below',
  '891eba1b-5b5e-4514-ab90-0348b0d123c1',
  7,
  'Case law citation: Smith v. Jones, 2023 SCC 14',
  'footnote',
  'pending',
  0.75,
  'Footnote reference to supporting case law'
),
(
  '891eba1b-5b5e-4514-ab90-0348b0d123c1',
  '891eba1b-5b5e-4514-ab90-0348b0d123c1',
  12,
  'Appendix B',
  'The complete list is provided in Appendix B',
  '891eba1b-5b5e-4514-ab90-0348b0d123c1',
  67,
  'Schedule of Assets and Liabilities',
  'appendix',
  'pending',
  0.97,
  'High confidence appendix reference with clear context'
);