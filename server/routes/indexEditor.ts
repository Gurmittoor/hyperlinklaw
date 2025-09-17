import { Router } from 'express';
import { db } from '../db.js';
import { indexItems, documents } from '../../shared/schema.js';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();

// Schema for index item validation with proper type coercion
const IndexItemSchema = z.object({
  id: z.string().optional(),
  documentId: z.string(),
  ordinal: z.coerce.number().optional(),
  label: z.string().optional(),
  rawRow: z.string().optional(),
  pageHint: z.coerce.number().positive().optional(),
  bboxNorm: z.object({
    x0: z.coerce.number().min(0).max(1),
    y0: z.coerce.number().min(0).max(1),
    x1: z.coerce.number().min(0).max(1),
    y1: z.coerce.number().min(0).max(1),
  }).optional(),
  targetPage: z.coerce.number().positive().optional(),
  confidence: z.coerce.number().min(0).max(1).optional(),
  type: z.string().optional(),
  status: z.enum(['draft', 'needs_target', 'ready']).optional(),
  tabNumber: z.string().optional(),
  title: z.string().optional(),
  dateField: z.string().optional(),
  isCustom: z.coerce.boolean().optional(),
});

// GET /api/documents/:documentId/index-items - Load index items for a document
router.get('/documents/:documentId/index-items', async (req, res) => {
  try {
    const { documentId } = req.params;

    // Verify document exists
    const document = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
    if (document.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Get all index items for this document
    const items = await db
      .select({
        id: indexItems.id,
        documentId: indexItems.documentId,
        ordinal: indexItems.ordinal,
        label: indexItems.label,
        rawRow: indexItems.rawRow,
        pageHint: indexItems.pageHint,
        bboxNorm: indexItems.bboxNorm,
        targetPage: indexItems.targetPage,
        confidence: indexItems.confidence,
        type: indexItems.type,
        status: indexItems.status,
        tabNumber: indexItems.tabNumber,
        title: indexItems.title,
        dateField: indexItems.dateField,
        isCustom: indexItems.isCustom,
        sourceType: indexItems.sourceType,
        finalTargetPage: indexItems.finalTargetPage,
        autoMapped: indexItems.autoMapped,
        mappingConfidence: indexItems.mappingConfidence,
        mappingMethod: indexItems.mappingMethod,
        reviewStatus: indexItems.reviewStatus,
        markingCoordinates: indexItems.markingCoordinates,
        markingPageNumber: indexItems.markingPageNumber,
        lastEditedBy: indexItems.lastEditedBy,
        lastEditedAt: indexItems.lastEditedAt,
        createdAt: indexItems.createdAt
      })
      .from(indexItems)
      .where(eq(indexItems.documentId, documentId));

    res.json(items);
  } catch (error) {
    console.error('Error loading index items:', error);
    res.status(500).json({ error: 'Failed to load index items' });
  }
});

// POST /api/documents/:documentId/index-items - Save/update index items
router.post('/documents/:documentId/index-items', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { items } = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Items must be an array' });
    }

    // Verify document exists
    const document = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
    if (document.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Validate all items
    const validatedItems = items.map(item => {
      const validated = IndexItemSchema.parse({ ...item, documentId });
      return validated;
    });

    // Delete existing items for this document
    await db.delete(indexItems).where(eq(indexItems.documentId, documentId));

    // Insert new items
    if (validatedItems.length > 0) {
      const itemsToInsert = validatedItems.map(item => ({
        id: item.id || crypto.randomUUID(),
        documentId: item.documentId,
        ordinal: item.ordinal || null,
        label: item.label || null,
        rawRow: item.rawRow || null,
        pageHint: item.pageHint || null,
        bboxNorm: item.bboxNorm || null,
        targetPage: item.targetPage || null,
        confidence: item.confidence ? item.confidence.toString() : '0.5',
        type: item.type || 'tab',
        status: item.status || 'draft',
        tabNumber: item.tabNumber || null,
        title: item.title || null,
        dateField: item.dateField || null,
        isCustom: item.isCustom || false,
        lastEditedAt: new Date(),
        createdAt: new Date(),
      }));

      await db.insert(indexItems).values(itemsToInsert);
    }

    res.json({ success: true, count: validatedItems.length });
  } catch (error) {
    console.error('Error saving index items:', error);
    res.status(500).json({ error: 'Failed to save index items' });
  }
});

// POST /api/documents/:documentId/index-detect - Auto-detect index items
router.post('/documents/:documentId/index-detect', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { firstPages = 30, startPage = 1 } = req.body;

    // Verify document exists
    const document = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
    if (document.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Call your existing index detection service
    // This would integrate with your current indexDetector.py or similar
    // For now, return mock data with the structure you need
    const mockItems = [
      {
        id: crypto.randomUUID(),
        documentId,
        ordinal: 1,
        label: 'Request for Costs and Interim Costs',
        rawRow: '1. Request for Costs and Interim Costs dated 2021-06-23',
        pageHint: 2,
        bboxNorm: { x0: 0.05, y0: 0.15, x1: 0.95, y1: 0.18 },
        confidence: 0.89,
        type: 'tab',
        status: 'needs_target',
        tabNumber: '1',
        title: 'Request for Costs and Interim Costs',
        dateField: '2021-06-23',
        isCustom: false
      },
      {
        id: crypto.randomUUID(),
        documentId,
        ordinal: 2,
        label: 'Affidavit - John Smith',
        rawRow: '2. Affidavit - John Smith dated 2021-07-15',
        pageHint: 2,
        bboxNorm: { x0: 0.05, y0: 0.19, x1: 0.95, y1: 0.22 },
        confidence: 0.92,
        type: 'affidavit',
        status: 'needs_target',
        tabNumber: '2',
        title: 'Affidavit - John Smith',
        dateField: '2021-07-15',
        isCustom: false
      },
      {
        id: crypto.randomUUID(),
        documentId,
        ordinal: 3,
        label: 'Motion for Summary Judgment',
        rawRow: '3. Motion for Summary Judgment dated 2021-08-02',
        pageHint: 2,
        bboxNorm: { x0: 0.05, y0: 0.23, x1: 0.95, y1: 0.26 },
        confidence: 0.85,
        type: 'motion',
        status: 'needs_target',
        tabNumber: '3',
        title: 'Motion for Summary Judgment',
        dateField: '2021-08-02',
        isCustom: false
      }
    ];

    res.json({
      items: mockItems,
      indexPageHint: 2,
      detectedPages: firstPages
    });
  } catch (error) {
    console.error('Error detecting index items:', error);
    res.status(500).json({ error: 'Failed to detect index items' });
  }
});

// POST /api/documents/:documentId/index-preview - Generate preview with highlights
router.post('/documents/:documentId/index-preview', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { items } = req.body;

    // This would generate a preview image showing the highlights
    // For now, return success
    res.json({ 
      success: true, 
      previewUrl: `/api/documents/${documentId}/preview.png`
    });
  } catch (error) {
    console.error('Error generating preview:', error);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// POST /api/documents/:documentId/hyperlinks/apply - Apply hyperlinks to PDF
router.post('/documents/:documentId/hyperlinks/apply', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { items, backBanner = true } = req.body;

    // Verify document exists
    const document = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
    if (document.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Validate that all items have target pages
    const readyItems = items.filter((item: any) => item.status === 'ready' && item.targetPage);
    
    if (readyItems.length !== items.length) {
      return res.status(400).json({ 
        error: 'All items must have target pages and be marked as ready',
        readyCount: readyItems.length,
        totalCount: items.length
      });
    }

    // This would call your existing hyperlink generation service
    // Integration with your current PDF processing pipeline
    
    res.json({
      success: true,
      url: `/online/pdf/${document[0].caseId}/${documentId}`,
      linksCreated: readyItems.length,
      backBanner
    });
  } catch (error) {
    console.error('Error applying hyperlinks:', error);
    res.status(500).json({ error: 'Failed to apply hyperlinks' });
  }
});

export default router;