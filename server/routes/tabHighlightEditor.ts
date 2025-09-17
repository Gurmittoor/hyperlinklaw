import { Router } from 'express';
import { db } from '../db.js';
import { tabHighlights, insertTabHighlightSchema, documents } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();

// Get saved highlight positions for a document
router.get('/api/documents/:documentId/highlight-positions', async (req, res) => {
  try {
    const { documentId } = req.params;
    
    const savedHighlights = await db
      .select()
      .from(tabHighlights)
      .where(eq(tabHighlights.documentId, documentId))
      .orderBy(tabHighlights.tabNumber);
    
    res.json(savedHighlights);
  } catch (error) {
    console.error('Error fetching highlight positions:', error);
    res.status(500).json({ error: 'Failed to fetch highlight positions' });
  }
});

// Save or update highlight position for a specific tab
router.put('/api/documents/:documentId/highlight-positions/:tabNumber', async (req, res) => {
  try {
    const { documentId, tabNumber } = req.params;
    const highlightData = req.body;
    
    // Validate the input
    const validatedData = insertTabHighlightSchema.parse({
      ...highlightData,
      documentId,
      tabNumber: parseInt(tabNumber),
    });
    
    // Check if highlight already exists for this tab
    const existing = await db
      .select()
      .from(tabHighlights)
      .where(and(
        eq(tabHighlights.documentId, documentId),
        eq(tabHighlights.tabNumber, parseInt(tabNumber))
      ));
    
    if (existing.length > 0) {
      // Update existing highlight
      await db
        .update(tabHighlights)
        .set({
          ...validatedData,
          updatedAt: new Date(),
        })
        .where(and(
          eq(tabHighlights.documentId, documentId),
          eq(tabHighlights.tabNumber, parseInt(tabNumber))
        ));
    } else {
      // Insert new highlight
      await db.insert(tabHighlights).values(validatedData);
    }
    
    res.json({ success: true, message: 'Highlight position saved' });
  } catch (error) {
    console.error('Error saving highlight position:', error);
    res.status(500).json({ error: 'Failed to save highlight position' });
  }
});

// Save multiple highlight positions at once
router.put('/api/documents/:documentId/highlight-positions', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { highlights } = req.body;
    
    if (!Array.isArray(highlights)) {
      return res.status(400).json({ error: 'highlights must be an array' });
    }
    
    // Delete existing highlights for this document
    await db
      .delete(tabHighlights)
      .where(eq(tabHighlights.documentId, documentId));
    
    // Insert new highlights
    if (highlights.length > 0) {
      const validatedHighlights = highlights.map(highlight => 
        insertTabHighlightSchema.parse({
          ...highlight,
          documentId,
        })
      );
      
      await db.insert(tabHighlights).values(validatedHighlights);
    }
    
    res.json({ 
      success: true, 
      message: `Saved ${highlights.length} highlight positions` 
    });
  } catch (error) {
    console.error('Error saving multiple highlight positions:', error);
    res.status(500).json({ error: 'Failed to save highlight positions' });
  }
});

// Delete a specific highlight
router.delete('/api/documents/:documentId/highlight-positions/:tabNumber', async (req, res) => {
  try {
    const { documentId, tabNumber } = req.params;
    
    await db
      .delete(tabHighlights)
      .where(and(
        eq(tabHighlights.documentId, documentId),
        eq(tabHighlights.tabNumber, parseInt(tabNumber))
      ));
    
    res.json({ success: true, message: 'Highlight deleted' });
  } catch (error) {
    console.error('Error deleting highlight:', error);
    res.status(500).json({ error: 'Failed to delete highlight' });
  }
});

// Reset all highlights to default positions
router.post('/api/documents/:documentId/reset-highlights', async (req, res) => {
  try {
    const { documentId } = req.params;
    
    // Delete all custom highlights for this document
    await db
      .delete(tabHighlights)
      .where(eq(tabHighlights.documentId, documentId));
    
    res.json({ 
      success: true, 
      message: 'All highlights reset to default positions' 
    });
  } catch (error) {
    console.error('Error resetting highlights:', error);
    res.status(500).json({ error: 'Failed to reset highlights' });
  }
});

export default router;