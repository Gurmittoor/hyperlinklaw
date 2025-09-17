import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, decimal, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const cases = pgTable("cases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  caseNumber: text("case_number").notNull().unique(),
  title: text("title").notNull(),
  filingDate: timestamp("filing_date", { mode: 'string' }).notNull(),
  plaintiff: text("plaintiff").notNull(),
  defendant: text("defendant").notNull(),
  courtName: text("court_name"),
  judgeName: text("judge_name"),
  storagePath: text("storage_path").notNull(), // Isolated storage path for this case
  status: text("status").notNull().default("active"),
  // Workflow Step Tracking
  currentStep: integer("current_step").notNull().default(1), // 1-6 workflow steps
  autoAdvance: boolean("auto_advance").notNull().default(true),
  stepCreateCompleted: boolean("step_create_completed").default(true),
  stepUploadCompleted: boolean("step_upload_completed").default(false),
  stepOcrCompleted: boolean("step_ocr_completed").default(false),
  stepHyperlinkCompleted: boolean("step_hyperlink_completed").default(false),
  stepReviewCompleted: boolean("step_review_completed").default(false),
  stepSubmitCompleted: boolean("step_submit_completed").default(false),
  stepCreateCompletedAt: timestamp("step_create_completed_at"),
  stepUploadCompletedAt: timestamp("step_upload_completed_at"),
  stepOcrCompletedAt: timestamp("step_ocr_completed_at"),
  stepHyperlinkCompletedAt: timestamp("step_hyperlink_completed_at"),
  stepReviewCompletedAt: timestamp("step_review_completed_at"),
  stepSubmitCompletedAt: timestamp("step_submit_completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  caseId: varchar("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  alias: text("alias"),
  storagePath: text("storage_path").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  pageCount: integer("page_count").default(0),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  // OCR-First Architecture Fields (truthful DB-driven progress)
  totalPages: integer("total_pages"), // Set from PDF page count on upload
  ocrStatus: text("ocr_status").notNull().default("queued"), // queued, processing, completed, failed, stalled
  ocrState: text("ocr_state").default("pending"), // pending, running, completed, failed - overall document state
  batch1Ready: boolean("batch1_ready").default(false), // First 50 pages ready for index extraction
  batch1ReadyAt: timestamp("batch1_ready_at"), // When Batch 1 completed
  ocrPagesDone: integer("ocr_pages_done").default(0), // Track real-time progress from ocr_pages table
  ocrConfidenceAvg: decimal("ocr_confidence_avg", { precision: 4, scale: 3 }), // Match spec precision
  ocrStartedAt: timestamp("ocr_started_at"),
  ocrCompletedAt: timestamp("ocr_completed_at"),
  parseProgress: integer("parse_progress").default(0),
  lastError: text("last_error"),
  hyperlinkedPath: text("hyperlinked_path"),
  reviewStatus: text("review_status").notNull().default("pending"), // pending, in_review, approved, court_ready
  selectedForHyperlinking: boolean("selected_for_hyperlinking").notNull().default(false),
  aiProcessingStatus: text("ai_processing_status").notNull().default("none"), // none, queued, processing, completed, failed
  lawyerReviewed: boolean("lawyer_reviewed").notNull().default(false),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { mode: 'string' }),
  courtSubmitted: boolean("court_submitted").notNull().default(false),
  submittedAt: timestamp("submitted_at", { mode: 'string' }),
  indexCount: integer("index_count"),
  indexItems: jsonb("index_items"),
  indexDetectedAt: timestamp("index_detected_at"),
  indexStatus: text("index_status"), // 'pending' | 'ok' | 'error'
  // Legacy fields for backward compatibility
  ocrErrorMessage: text("ocr_error_message"),
  totalOcrPages: integer("total_ocr_pages"),
  ocrProcessingTimeMs: integer("ocr_processing_time_ms"),
  hasSearchableText: boolean("has_searchable_text").default(false),
  ocrEngineVersion: varchar("ocr_engine_version", { length: 50 }),
  ocrSettings: jsonb("ocr_settings").default(sql`'{}'`),
  lastProcessedAt: timestamp("last_processed_at"),
  // User-edited OCR text for index tabs
  userEditedOcrText: text("user_edited_ocr_text"), // Manually edited OCR text from screenshots or typing
  userEditedOcrUpdatedAt: timestamp("user_edited_ocr_updated_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_documents_ocr_status").on(table.ocrStatus),
  index("idx_documents_ocr_completed").on(table.ocrCompletedAt),
]);

// OCR Pages table - stores per-page OCR results for truthful progress tracking
export const ocrPages = pgTable("ocr_pages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  ocrEngine: varchar("ocr_engine"), // tesseract, vision, paddle etc
  engine: text("engine").default("tesseract"), // vision, tesseract, paddle - enhanced tracking
  extractedText: text("extracted_text"), // Nullable for failed OCR pages
  wordsJson: jsonb("words_json"), // Store word-level OCR data
  confidence: decimal("confidence", { precision: 4, scale: 3 }), // Match spec precision
  checksum: text("checksum"), // SHA1 hash of source page bytes to avoid re-OCR if unchanged
  processingTimeMs: integer("processing_time_ms"),
  status: text("status").notNull().default("completed"), // completed, failed
  // AI Verification Fields
  aiVerificationStatus: text("ai_verification_status").default("pending"), // pending, completed, failed, skipped
  aiVerificationScore: decimal("ai_verification_score", { precision: 4, scale: 1 }), // 0-100 accuracy score
  aiDiscrepanciesFound: integer("ai_discrepancies_found").default(0),
  aiCriticalIssues: integer("ai_critical_issues").default(0),
  aiReviewRequired: boolean("ai_review_required").default(false),
  aiCorrectedText: text("ai_corrected_text"), // AI-corrected version if improvements found
  aiVerificationData: jsonb("ai_verification_data"), // Full AI analysis results
  aiVerificationTimeMs: integer("ai_verification_time_ms"),
  aiVerifiedAt: timestamp("ai_verified_at"),
  // Manual correction fields for edit & save functionality
  correctedText: text("corrected_text"), // Human-corrected text
  isCorrected: boolean("is_corrected").default(false), // Flag for corrected pages
  correctedBy: text("corrected_by"), // User who made the correction
  correctedAt: timestamp("corrected_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // Primary key is document_id + page_number for uniqueness (no separate ID needed)
  uniqueIndex("ocr_pages_unique").on(table.documentId, table.pageNumber),
  index("idx_ocr_pages_document").on(table.documentId),
  index("idx_ocr_pages_ai_status").on(table.aiVerificationStatus),
  index("idx_ocr_pages_corrected").on(table.isCorrected),
]);

// OCR Corrections table - audit trail for manual edits
export const ocrCorrections = pgTable("ocr_corrections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  beforeText: text("before_text").notNull(),
  afterText: text("after_text").notNull(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_ocr_corrections_document").on(table.documentId),
]);

// OCR Jobs table - tracks async OCR operations
export const ocrJobs = pgTable("ocr_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // tesseract, gcv
  status: text("status").notNull().default("processing"), // processing, completed, failed
  operationName: text("operation_name"), // GCV operation name for polling
  outputPrefix: text("output_prefix"), // GCS output path prefix
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  errorDetails: text("error_details"),
  pagesProcessed: integer("pages_processed").default(0),
  totalPages: integer("total_pages"),
}, (table) => [
  index("idx_ocr_jobs_status").on(table.status),
  index("idx_ocr_jobs_document").on(table.documentId),
]);

// OCR Batches table - tracks parallel processing of page ranges
export const ocrBatches = pgTable("ocr_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  startPage: integer("start_page").notNull(),
  endPage: integer("end_page").notNull(),
  status: text("status").notNull().default("queued"), // queued, processing, completed, failed, skipped
  pagesDone: integer("pages_done").notNull().default(0),
  confidenceAvg: decimal("confidence_avg", { precision: 4, scale: 3 }),
  workerInfo: text("worker_info"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_ocr_batches_doc").on(table.documentId),
  uniqueIndex("idx_ocr_batches_unique").on(table.documentId, table.startPage, table.endPage),
]);

// Index items extracted from index pages (pages 1-15) - cross-page enumeration with visual editing support
export const indexItems = pgTable("index_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal"), // Tab/Item number (e.g., 1, 2, 3...)
  label: text("label"), // Title/descriptor from index row
  rawRow: text("raw_row"), // Full raw line captured from OCR
  pageHint: integer("page_hint"), // Page where the row was found in the index
  // Visual editing fields
  bboxNorm: jsonb("bbox_norm"), // Normalized bounding box {x0, y0, x1, y1} relative to page (0-1)
  targetPage: integer("target_page"), // Destination page for hyperlink
  confidence: decimal("confidence", { precision: 4, scale: 3 }).default("0.5"), // AI confidence score
  type: text("type").default("tab"), // tab, exhibit, schedule, affidavit, etc.
  status: text("status").default("draft"), // draft, needs_target, ready
  // Inline editing fields
  tabNumber: text("tab_number"), // User-editable tab number (can be non-numeric)
  title: text("title"), // User-editable title
  dateField: text("date_field"), // Extracted/edited date if present
  // Enhanced fields for PDF generation
  shortDescription: text("short_description"), // Brief description for index cover
  finalTargetPage: integer("final_target_page"), // Final combined PDF page number
  autoMapped: boolean("auto_mapped").default(false), // Was this auto-detected via OCR
  mappingConfidence: decimal("mapping_confidence", { precision: 4, scale: 3 }), // Auto-mapping confidence
  mappingMethod: text("mapping_method"), // exact, fuzzy, keyword, manual
  reviewStatus: text("review_status").default("pending"), // pending, reviewed, approved, rejected
  // Marking source tracking
  sourceType: text("source_type").default("detection"), // detection, highlight, circle, manual
  markingCoordinates: jsonb("marking_coordinates"), // Store highlight/circle coordinates
  markingPageNumber: integer("marking_page_number"), // Page where marking was made
  // Editing metadata
  lastEditedBy: text("last_edited_by"),
  lastEditedAt: timestamp("last_edited_at"),
  isCustom: boolean("is_custom").default(false), // User-created vs AI-detected
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_index_items_document").on(table.documentId),
  index("idx_index_items_status").on(table.status),
  index("idx_index_items_type").on(table.type),
  index("idx_index_items_review").on(table.reviewStatus),
]);

export const links = pgTable("links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  caseId: varchar("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  srcDocId: varchar("src_doc_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  srcPage: integer("src_page").notNull(),
  srcText: text("src_text").notNull(), // The text that contains the hyperlink
  srcContext: text("src_context"), // Surrounding context for the hyperlink
  bbox: jsonb("bbox"), // [x, y, width, height] for clickable area
  targetDocId: varchar("target_doc_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  targetPage: integer("target_page").notNull(),
  targetParagraph: text("target_paragraph"), // Enhanced review feature - specific paragraph target
  targetText: text("target_text"), // The text being referenced
  linkType: text("link_type").notNull().default("citation"), // citation, exhibit, page_ref, footnote, appendix
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  confidence: text("confidence").default("0.5"), // Store as text for compatibility
  highlighted: boolean("highlighted").default(false), // Enhanced review feature - highlighting option
  notes: text("notes"), // Enhanced review feature - lawyer notes about specific link
  why: text("why"), // AI rationale
  reviewerNotes: text("reviewer_notes"), // Lawyer's review notes
  reviewedBy: text("reviewed_by"), // Lawyer who reviewed this link
  reviewedAt: timestamp("reviewed_at", { mode: 'string' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const documentMemory = pgTable("document_memory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentName: text("document_name").notNull(),
  fileNumber: text("file_number"),
  alias: text("alias"),
  usageCount: integer("usage_count").notNull().default(1),
  lastUsed: timestamp("last_used").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Chat conversations for user feedback and corrections
export const chatConversations = pgTable("chat_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  documentId: varchar("document_id").references(() => documents.id, { onDelete: "cascade" }),
  caseId: varchar("case_id").references(() => cases.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("New Conversation"),
  status: text("status").notNull().default("active"), // active, archived
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Individual messages in chat conversations
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => chatConversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // user, assistant, system
  content: text("content").notNull(),
  metadata: jsonb("metadata"), // Store corrections, processing instructions, etc.
  createdAt: timestamp("created_at").defaultNow(),
});

// OCR Cache table for storing page-by-page OCR results
export const ocrCache = pgTable("ocr_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  extractedText: text("extracted_text").notNull(), // Full OCR text for this page
  confidence: decimal("confidence", { precision: 5, scale: 4 }), // Overall OCR confidence for the page
  processingMetadata: jsonb("processing_metadata"), // Store bounding boxes, word-level confidence, etc.
  processedAt: timestamp("processed_at").defaultNow(),
  ocrEngine: text("ocr_engine").default("pytesseract"), // Track which OCR engine was used
  language: text("language").default("eng"), // OCR language setting
  // AI Verification Fields
  aiVerificationStatus: text("ai_verification_status").default("pending"), // pending, completed, failed, skipped
  aiVerificationScore: text("ai_verification_score"), // 0-100 accuracy score as text
  aiDiscrepanciesFound: integer("ai_discrepancies_found").default(0),
  aiCriticalIssues: integer("ai_critical_issues").default(0),
  aiReviewRequired: boolean("ai_review_required").default(false),
  aiCorrectedText: text("ai_corrected_text"), // AI-corrected version if improvements found
  aiVerificationData: jsonb("ai_verification_data"), // Full AI analysis results
  aiVerificationTimeMs: integer("ai_verification_time_ms"),
  aiVerifiedAt: timestamp("ai_verified_at"),
  // Manual Correction Fields
  correctedText: text("corrected_text"), // Human-corrected version of the text
  isCorrected: boolean("is_corrected").default(false), // Flag to track if page was manually corrected
  correctedBy: text("corrected_by"), // User who made the correction
  correctedAt: timestamp("corrected_at", { withTimezone: true }), // When correction was made
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_ocr_document_page").on(table.documentId, table.pageNumber),
  index("idx_ocr_ai_status").on(table.aiVerificationStatus),
]);

// Exhibits Table - Tracks exhibit items within documents (similar to tabs)
export const exhibits = pgTable("exhibits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  caseId: varchar("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  exhibitLabel: text("exhibit_label").notNull(), // e.g., "A", "B", "1", "A-1"
  exhibitTitle: text("exhibit_title"), // Optional descriptive title
  pageNumber: integer("page_number").notNull(), // Page where exhibit appears
  ocrDetected: boolean("ocr_detected").default(false), // Was it auto-detected via OCR
  manuallyAdded: boolean("manually_added").default(false), // Was it manually added
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_exhibits_document").on(table.documentId),
  index("idx_exhibits_case").on(table.caseId),
  uniqueIndex("idx_exhibits_unique").on(table.documentId, table.exhibitLabel), // Prevent duplicate exhibit labels per document
]);


export const insertCaseSchema = createInsertSchema(cases).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  filingDate: z.string(),
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLinkSchema = createInsertSchema(links).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDocumentMemorySchema = createInsertSchema(documentMemory).omit({
  id: true,
  createdAt: true,
  lastUsed: true,
});

export const insertChatConversationSchema = createInsertSchema(chatConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export const insertOcrCacheSchema = createInsertSchema(ocrCache).omit({
  id: true,
  createdAt: true,
  processedAt: true,
});

export const insertOcrJobSchema = createInsertSchema(ocrJobs).omit({
  id: true,
  startedAt: true,
  completedAt: true,
});

export const insertOcrPageSchema = createInsertSchema(ocrPages).omit({
  createdAt: true,
});

export const insertExhibitSchema = createInsertSchema(exhibits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOcrBatchSchema = createInsertSchema(ocrBatches).omit({
  id: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
});

// Highlighted text selections for manual hyperlink detection
export const highlightedSelections = pgTable("highlighted_selections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  selectedText: text("selected_text").notNull(), // The actual highlighted text
  startIndex: integer("start_index").notNull(), // Character start position in text
  endIndex: integer("end_index").notNull(), // Character end position in text
  context: text("context"), // Surrounding text for better matching
  status: text("status").notNull().default("pending"), // pending, processing, linked, failed
  aiProcessed: boolean("ai_processed").default(false),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_highlighted_selections_document").on(table.documentId),
  index("idx_highlighted_selections_page").on(table.documentId, table.pageNumber),
]);

export const insertHighlightedSelectionSchema = createInsertSchema(highlightedSelections).omit({
  id: true,
  createdAt: true,
});

// Store lawyer-selected index items (rectangular highlights on PDF pages)
export const indexHighlights = pgTable("index_highlights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(), // where the highlight sits (index page)
  rect: jsonb("rect").notNull(), // {x,y,w,h} in PDF viewport coords (0..1)
  text: text("text").notNull(), // captured text from the selection
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  status: text("status").default("new"), // new | linking | linked | failed
}, (table) => [
  index("idx_index_highlights_document").on(table.documentId),
]);

// Link targets found for those highlights
export const indexLinks = pgTable("index_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  highlightId: varchar("highlight_id").notNull().references(() => indexHighlights.id, { onDelete: "cascade" }),
  targetPage: integer("target_page").notNull(), // best page match
  targetOffsets: jsonb("target_offsets"), // optional text offsets/boxes
  method: text("method"), // 'exact' | 'fuzzy' | 'embedding'
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_index_links_document").on(table.documentId),
  index("idx_index_links_highlight").on(table.highlightId),
]);

export const insertIndexHighlightSchema = createInsertSchema(indexHighlights).omit({
  id: true,
  createdAt: true,
});

export const insertIndexLinkSchema = createInsertSchema(indexLinks).omit({
  id: true,
  createdAt: true,
});

export const insertIndexItemSchema = createInsertSchema(indexItems).omit({
  id: true,
  createdAt: true,
  lastEditedAt: true,
});

// Custom tab highlights for manual editing of index page highlights
export const tabHighlights = pgTable("tab_highlights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  tabNumber: integer("tab_number").notNull(), // Which tab this highlight represents (1, 2, 3, etc.)
  pageNumber: integer("page_number").notNull().default(2), // Index page number (usually page 2)
  x: decimal("x", { precision: 8, scale: 4 }).notNull(), // X position (0-1 normalized)
  y: decimal("y", { precision: 8, scale: 4 }).notNull(), // Y position (0-1 normalized) 
  width: decimal("width", { precision: 8, scale: 4 }).notNull(), // Width (0-1 normalized)
  height: decimal("height", { precision: 8, scale: 4 }).notNull(), // Height (0-1 normalized)
  color: text("color").notNull().default("#FFFF00"), // Hex color code
  opacity: decimal("opacity", { precision: 3, scale: 2 }).notNull().default("0.30"), // 0-1 opacity
  text: text("text"), // Associated text content
  isCustom: boolean("is_custom").notNull().default(true), // True if manually adjusted
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_tab_highlights_document").on(table.documentId),
  uniqueIndex("idx_tab_highlights_unique").on(table.documentId, table.tabNumber), // One highlight per tab per document
]);

export const insertTabHighlightSchema = createInsertSchema(tabHighlights).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Visual review highlights for PDF overlay
export const reviewHighlights = pgTable("review_highlights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  bbox: jsonb("bbox").notNull(), // {x,y,width,height} in PDF.js viewport coords (0..1 normalized)
  kind: text("kind").notNull(), // 'index-row' | 'candidate-link' | 'custom'
  label: text("label"), // shown tooltip
  sourceItemId: varchar("source_item_id"), // references index_items(id) when applicable
  confidence: decimal("confidence", { precision: 4, scale: 3 }), // optional
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_review_highlights_document_page").on(table.documentId, table.pageNumber),
]);

// Link candidates for review workflow
export const linkCandidates = pgTable("link_candidates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  indexItemId: varchar("index_item_id").notNull().references(() => indexItems.id, { onDelete: "cascade" }),
  startPage: integer("start_page").notNull(),
  endPage: integer("end_page"),
  score: decimal("score", { precision: 5, scale: 2 }).notNull(), // 0..100
  rationale: text("rationale"), // why we matched
  approved: boolean("approved").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_link_candidates_document").on(table.documentId),
  index("idx_link_candidates_index_item").on(table.indexItemId),
]);

// Screenshots for document index identification
export const screenshots = pgTable("screenshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(), // Generated filename
  originalName: text("original_name").notNull(), // User-provided name
  mimeType: text("mime_type").notNull(), // image/png, image/jpeg etc
  fileSize: integer("file_size").notNull(), // Size in bytes
  imageData: text("image_data").notNull(), // Base64 data URL
  ocrText: text("ocr_text"), // OCR extracted text
  ocrProcessingStatus: text("ocr_processing_status").default("pending"), // pending, processing, completed, failed
  clickableAreas: jsonb("clickable_areas").default(sql`'[]'`), // Interactive areas
  processingNotes: text("processing_notes"), // Any processing errors or notes
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_screenshots_document").on(table.documentId),
]);

export const insertReviewHighlightSchema = createInsertSchema(reviewHighlights).omit({
  id: true,
  createdAt: true,
});

export const insertLinkCandidateSchema = createInsertSchema(linkCandidates).omit({
  id: true,
  createdAt: true,
});

export const insertScreenshotSchema = createInsertSchema(screenshots).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Page 2 link positions for HTML overlay positioning
export const pageLinkPositions = pgTable("page_link_positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull().default(2), // Currently only page 2
  tabNumber: text("tab_number").notNull(), // Tab number as string (e.g. "1", "2", "3")
  xNorm: decimal("x_norm", { precision: 8, scale: 4 }).notNull(), // X position (0-1 normalized)
  yNorm: decimal("y_norm", { precision: 8, scale: 4 }).notNull(), // Y position (0-1 normalized)
  yOffset: integer("y_offset").default(0), // Fine vertical adjustment in pixels (▲▼ nudge controls)
  locked: boolean("locked").default(false), // Prevents auto-alignment when true (🔒 lock control)
  targetPage: integer("target_page").notNull(), // Page this link navigates to
  isAutoAligned: boolean("is_auto_aligned").default(true), // Was this auto-aligned via text detection
  lastModifiedBy: text("last_modified_by"), // User who last modified position
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_page_link_positions_document").on(table.documentId),
  uniqueIndex("idx_page_link_positions_unique").on(table.documentId, table.pageNumber, table.tabNumber), // One position per tab per page per document
]);

export const insertPageLinkPositionSchema = createInsertSchema(pageLinkPositions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Case = typeof cases.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Link = typeof links.$inferSelect;
export type DocumentMemory = typeof documentMemory.$inferSelect;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type OcrCache = typeof ocrCache.$inferSelect;
export type OcrJob = typeof ocrJobs.$inferSelect;
export type OcrPage = typeof ocrPages.$inferSelect;
export type OcrBatch = typeof ocrBatches.$inferSelect;
export type ReviewHighlight = typeof reviewHighlights.$inferSelect;
export type LinkCandidate = typeof linkCandidates.$inferSelect;
export type Screenshot = typeof screenshots.$inferSelect;
export type PageLinkPosition = typeof pageLinkPositions.$inferSelect;
export type InsertCase = z.infer<typeof insertCaseSchema>;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type InsertLink = z.infer<typeof insertLinkSchema>;
export type InsertDocumentMemory = z.infer<typeof insertDocumentMemorySchema>;
export type InsertChatConversation = z.infer<typeof insertChatConversationSchema>;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type InsertOcrCache = z.infer<typeof insertOcrCacheSchema>;
export type InsertOcrJob = z.infer<typeof insertOcrJobSchema>;
export type InsertOcrPage = z.infer<typeof insertOcrPageSchema>;
export type InsertOcrBatch = z.infer<typeof insertOcrBatchSchema>;
export type InsertReviewHighlight = z.infer<typeof insertReviewHighlightSchema>;
export type InsertLinkCandidate = z.infer<typeof insertLinkCandidateSchema>;
export type InsertScreenshot = z.infer<typeof insertScreenshotSchema>;
export type InsertPageLinkPosition = z.infer<typeof insertPageLinkPositionSchema>;
export type HighlightedSelection = typeof highlightedSelections.$inferSelect;
export type InsertHighlightedSelection = z.infer<typeof insertHighlightedSelectionSchema>;

// Auth types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
