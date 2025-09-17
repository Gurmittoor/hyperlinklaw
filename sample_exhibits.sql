-- Insert sample case for 86-page exhibit document
INSERT INTO cases (id, case_number, title, filing_date, plaintiff, defendant, storage_path, current_step, step_upload_completed) 
VALUES ('sample-case-86', 'CV-2024-86-EXH', '86-Page Document with Exhibits', '2024-01-15', 'Plaintiff Corp', 'Defendant LLC', 'storage/cases/sample-case-86', 3, true)
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title;

-- Insert sample document for exhibits
INSERT INTO documents (id, case_id, title, storage_path, original_name, mime_type, file_size, page_count, total_pages)
VALUES ('doc-86-exhibits', 'sample-case-86', '86-Page Exhibit Document', 'storage/cases/sample-case-86/document.pdf', 'exhibits_document.pdf', 'application/pdf', 5242880, 86, 86)
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title;

-- Insert sample exhibits
INSERT INTO exhibits (document_id, case_id, exhibit_label, exhibit_title, page_number, ocr_detected, manually_added) VALUES
('doc-86-exhibits', 'sample-case-86', 'A', 'Purchase Agreement between parties dated January 2023', 12, true, false),
('doc-86-exhibits', 'sample-case-86', 'B', 'Financial Statements for fiscal year 2023', 18, true, false),
('doc-86-exhibits', 'sample-case-86', 'C', 'Email correspondence regarding contract terms', 25, true, false),
('doc-86-exhibits', 'sample-case-86', '1', 'Invoice #12345 dated March 15, 2023', 31, true, false),
('doc-86-exhibits', 'sample-case-86', '2', 'Receipt for payment of $50,000', 35, true, false),
('doc-86-exhibits', 'sample-case-86', 'D', 'Corporate bylaws and amendments', 42, false, true),
('doc-86-exhibits', 'sample-case-86', 'E', 'Bank statements from Chase Bank', 48, true, false),
('doc-86-exhibits', 'sample-case-86', '3', 'Property appraisal report', 54, true, false),
('doc-86-exhibits', 'sample-case-86', 'F', 'Insurance policy documentation', 61, true, false),
('doc-86-exhibits', 'sample-case-86', 'G', 'Tax returns for 2022-2023', 67, false, true),
('doc-86-exhibits', 'sample-case-86', '4', 'Contract addendum signed November 2023', 73, true, false),
('doc-86-exhibits', 'sample-case-86', 'H', 'Legal opinion letter from counsel', 79, true, false)
ON CONFLICT (document_id, exhibit_label) DO UPDATE SET exhibit_title = EXCLUDED.exhibit_title;
