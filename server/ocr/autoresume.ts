/**
 * Auto-resume functionality for parallel OCR processing
 * 
 * Automatically picks up and resumes any documents that were in processing
 * or queued state when the server was restarted.
 */

import { db } from '../db';
import { documents } from '@shared/schema';
import { eq, or } from 'drizzle-orm';
import { enqueueDoc } from './queues';

/**
 * Resume any documents that were in-flight when server restarted
 */
export async function resumeInFlightDocuments(): Promise<void> {
  try {
    console.log('🔍 Checking for in-flight OCR documents to resume...');

    // Find documents that were processing or queued when server stopped
    const inFlightDocs = await db
      .select({
        id: documents.id,
        title: documents.title,
        originalName: documents.originalName,
        ocrStatus: documents.ocrStatus,
        totalPages: documents.totalPages,
        pageCount: documents.pageCount
      })
      .from(documents)
      .where(
        or(
          eq(documents.ocrStatus, 'processing'),
          eq(documents.ocrStatus, 'queued')
        )
      );

    if (inFlightDocs.length === 0) {
      console.log('✅ No in-flight OCR documents found');
      return;
    }

    console.log(`🔄 Found ${inFlightDocs.length} in-flight OCR documents to resume`);

    // Resume each document with default settings
    for (const doc of inFlightDocs) {
      try {
        const fileName = doc.originalName || doc.title || doc.id;
        const totalPages = doc.totalPages || doc.pageCount || 0;
        
        console.log(`📄 Resuming OCR for document: ${fileName} (${totalPages} pages)`);
        
        // Enqueue with default batch settings
        await enqueueDoc(doc.id, {
          batchSize: 50,
          maxConcurrent: 10
        });
        
        console.log(`✅ Successfully re-queued document: ${doc.id}`);
        
      } catch (error) {
        console.error(`❌ Failed to resume document ${doc.id}:`, error);
        
        // Mark as failed to prevent infinite retry loops
        await db
          .update(documents)
          .set({
            ocrStatus: 'failed',
            ocrErrorMessage: 'Failed to auto-resume after server restart'
          })
          .where(eq(documents.id, doc.id))
          .catch(() => {}); // Ignore database errors during cleanup
      }
    }

    console.log(`🚀 Auto-resume completed: ${inFlightDocs.length} documents re-queued`);

  } catch (error) {
    console.error('❌ Auto-resume failed:', error);
  }
}

/**
 * Clean up any orphaned processing jobs that may be stuck
 */
export async function cleanupOrphanedJobs(): Promise<void> {
  try {
    // Find documents that have been "processing" for more than 2 hours
    const staleThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
    
    const staleDocs = await db
      .select({ id: documents.id, title: documents.title })
      .from(documents)
      .where(eq(documents.ocrStatus, 'processing'));

    if (staleDocs.length > 0) {
      console.log(`🧹 Found ${staleDocs.length} potentially stale processing jobs`);
      
      for (const doc of staleDocs) {
        // Reset to queued so auto-resume can pick them up
        await db
          .update(documents)
          .set({
            ocrStatus: 'queued',
            ocrErrorMessage: null
          })
          .where(eq(documents.id, doc.id));
        
        console.log(`🔄 Reset stale processing job: ${doc.title || doc.id}`);
      }
    }
  } catch (error) {
    console.error('❌ Cleanup orphaned jobs failed:', error);
  }
}