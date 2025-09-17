import { randomUUID } from "crypto";
import { eq, and, sql, count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { cases, documents, links, documentMemory, users, ocrCache, ocrJobs, ocrBatches, pageLinkPositions, type Case, type Document, type Link, type DocumentMemory, type User, type UpsertUser, type InsertCase, type InsertDocument, type InsertLink, type InsertDocumentMemory, type OcrCache, type OcrJob, type OcrBatch, type InsertOcrCache, type InsertOcrJob, type InsertOcrBatch, type PageLinkPosition, type InsertPageLinkPosition } from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

export interface IStorage {
  // Cases
  getCases(): Promise<Case[]>;
  getCase(id: string): Promise<Case | undefined>;
  createCase(data: InsertCase): Promise<Case>;
  updateCase(id: string, data: Partial<Case>): Promise<Case>;
  deleteCase(id: string): Promise<void>;
  
  // Documents
  getDocuments(): Promise<Document[]>;
  getDocumentsByCase(caseId: string): Promise<Document[]>;
  getDocument(id: string): Promise<Document | undefined>;
  createDocument(data: InsertDocument): Promise<Document>;
  updateDocument(id: string, data: Partial<Document>): Promise<Document>;
  deleteDocument(id: string): Promise<void>;
  
  // Links
  getLinks(): Promise<Link[]>;
  getLinksByDocument(docId: string): Promise<Link[]>;
  getLink(id: string): Promise<Link | undefined>;
  createLink(data: InsertLink): Promise<Link>;
  updateLink(id: string, data: Partial<Link>): Promise<Link>;
  deleteLink(id: string): Promise<void>;
  deleteAllLinksForCase(caseId: string): Promise<void>;
  
  // Document Memory
  getDocumentSuggestions(query: string): Promise<DocumentMemory[]>;
  saveDocumentMemory(data: InsertDocumentMemory): Promise<DocumentMemory>;
  checkDuplicateDocument(caseId: string, fileName: string): Promise<Document[]>;

  // Progress tracking (optional extension)
  getProgress?(key: string): any;
  setProgress?(key: string, progress: any): void;
  
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // OCR Cache operations
  getOcrCacheByDocument(documentId: string): Promise<OcrCache[]>;
  createOcrCache(data: InsertOcrCache): Promise<OcrCache>;
  updateOcrCache(id: string, data: Partial<OcrCache>): Promise<OcrCache>;
  deleteOcrCacheByDocument(documentId: string): Promise<void>;

  // OCR Job operations
  createOcrJob(data: InsertOcrJob): Promise<OcrJob>;
  getOcrJob(id: string): Promise<OcrJob | undefined>;
  getOcrJobByDocument(documentId: string): Promise<OcrJob | undefined>;
  updateOcrJob(id: string, data: Partial<OcrJob>): Promise<OcrJob>;
  getQueuedOcrJobs(limit?: number): Promise<OcrJob[]>;

  // OCR Batch operations
  createOcrBatch(data: InsertOcrBatch): Promise<OcrBatch>;
  getOcrBatch(id: string): Promise<OcrBatch | undefined>;
  getBatchesByDocument(documentId: string): Promise<OcrBatch[]>;
  updateOcrBatch(id: string, data: Partial<OcrBatch>): Promise<OcrBatch>;
  deleteOcrBatchesByDocument(documentId: string): Promise<void>;

  // Page Link Position operations
  getPageLinkPositions(documentId: string, pageNumber?: number): Promise<PageLinkPosition[]>;
  upsertPageLinkPositions(documentId: string, positions: InsertPageLinkPosition[]): Promise<PageLinkPosition[]>;
  deletePageLinkPosition(id: string, documentId: string): Promise<void>;
  deletePageLinkPositionsByDocument(documentId: string): Promise<void>;
  patchPageLinkPosition(
    documentId: string, 
    pageNumber: number, 
    tabNumber: string, 
    data: Partial<Pick<PageLinkPosition, 'yOffset' | 'locked' | 'xNorm' | 'yNorm' | 'targetPage'>>
  ): Promise<PageLinkPosition>;
}

export class PostgresStorage implements IStorage {
  private progressStore: Map<string, any> = new Map();
  // Cases
  async getCases(): Promise<Case[]> {
    return db.select().from(cases);
  }

  async getCase(id: string): Promise<Case | undefined> {
    const result = await db.select().from(cases).where(eq(cases.id, id)).limit(1);
    return result[0];
  }

  async createCase(data: InsertCase): Promise<Case> {
    const caseData = { ...data, id: randomUUID() };
    const result = await db.insert(cases).values(caseData).returning();
    return result[0];
  }

  async updateCase(id: string, data: Partial<Case>): Promise<Case> {
    const result = await db.update(cases)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(cases.id, id))
      .returning();
    return result[0];
  }

  async deleteCase(id: string): Promise<void> {
    // First delete all documents associated with this case
    await db.delete(documents).where(eq(documents.caseId, id));
    // Then delete the case
    await db.delete(cases).where(eq(cases.id, id));
  }

  // Documents
  async getDocuments(): Promise<Document[]> {
    return db.select().from(documents);
  }

  async getDocumentsByCase(caseId: string): Promise<Document[]> {
    return db.select().from(documents).where(eq(documents.caseId, caseId));
  }

  async getDocument(id: string): Promise<Document | undefined> {
    const result = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    return result[0];
  }

  async createDocument(data: InsertDocument): Promise<Document> {
    const docData = { ...data, id: randomUUID() };
    const result = await db.insert(documents).values(docData).returning();
    return result[0];
  }

  async updateDocument(id: string, data: Partial<Document>): Promise<Document> {
    const result = await db.update(documents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .returning();
    return result[0];
  }

  async deleteDocument(id: string): Promise<void> {
    const startTime = Date.now();
    try {
      // First delete all links associated with this document
      await db.delete(links).where(eq(links.srcDocId, id));
      await db.delete(links).where(eq(links.targetDocId, id));
      
      // Then delete the document itself
      const result = await db.delete(documents).where(eq(documents.id, id));
      const duration = Date.now() - startTime;
      
      console.log(`🗑️ delete_doc ok doc=${id} ms=${duration}`);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`🗑️ delete_doc fail doc=${id} ms=${duration} err="${error}"`);
      throw error;
    }
  }

  // Links
  async getLinks(): Promise<Link[]> {
    return db.select().from(links);
  }

  async getLinksByDocument(docId: string): Promise<Link[]> {
    return db.select().from(links).where(eq(links.srcDocId, docId));
  }

  async getLinksByCase(caseId: string): Promise<Link[]> {
    return db.select().from(links).where(eq(links.caseId, caseId));
  }

  async getLink(id: string): Promise<Link | undefined> {
    const result = await db.select().from(links).where(eq(links.id, id)).limit(1);
    return result[0];
  }

  async createLink(data: InsertLink): Promise<Link> {
    const linkData = { ...data, id: randomUUID() };
    const result = await db.insert(links).values(linkData).returning();
    return result[0];
  }

  async updateLink(id: string, data: Partial<Link>): Promise<Link> {
    const result = await db.update(links)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(links.id, id))
      .returning();
    return result[0];
  }

  async deleteLink(id: string): Promise<void> {
    await db.delete(links).where(eq(links.id, id));
  }

  async deleteAllLinksForCase(caseId: string): Promise<void> {
    await db.delete(links).where(eq(links.caseId, caseId));
    console.log(`🗑️ Deleted all links for case ${caseId} from database`);
  }

  // Document Memory
  async getDocumentSuggestions(query: string): Promise<DocumentMemory[]> {
    if (!query.trim()) {
      // Return recent documents if no query
      return db.select().from(documentMemory)
        .orderBy(documentMemory.lastUsed)
        .limit(10);
    }
    
    // Search for documents matching the query
    return db.select().from(documentMemory)
      .where(
        sql`${documentMemory.documentName} ILIKE ${`%${query}%`} OR 
            ${documentMemory.fileNumber} ILIKE ${`%${query}%`} OR 
            ${documentMemory.alias} ILIKE ${`%${query}%`}`
      )
      .orderBy(documentMemory.usageCount, documentMemory.lastUsed)
      .limit(10);
  }

  async saveDocumentMemory(data: InsertDocumentMemory): Promise<DocumentMemory> {
    // Check if a similar document name already exists
    const existing = await db.select().from(documentMemory)
      .where(eq(documentMemory.documentName, data.documentName))
      .limit(1);
    
    if (existing.length > 0) {
      // Update usage count and last used timestamp
      const result = await db.update(documentMemory)
        .set({ 
          usageCount: existing[0].usageCount + 1,
          lastUsed: new Date(),
          fileNumber: data.fileNumber || existing[0].fileNumber,
          alias: data.alias || existing[0].alias
        })
        .where(eq(documentMemory.id, existing[0].id))
        .returning();
      return result[0];
    } else {
      // Create new memory entry
      const result = await db.insert(documentMemory)
        .values({ ...data, id: randomUUID() })
        .returning();
      return result[0];
    }
  }

  async checkDuplicateDocument(caseId: string, fileName: string): Promise<Document[]> {
    const cleanFileName = fileName.replace(/\.[^/.]+$/, ""); // Remove extension
    
    return db.select().from(documents)
      .where(
        and(
          eq(documents.caseId, caseId),
          sql`${documents.originalName} ILIKE ${`%${cleanFileName}%`} OR 
              ${documents.title} ILIKE ${`%${cleanFileName}%`}`
        )
      );
  }

  async getStuckIndexDetections(): Promise<Document[]> {
    // Find documents with pending status older than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    return db.select().from(documents)
      .where(
        and(
          eq(documents.indexStatus, "pending"),
          sql`${documents.indexDetectedAt} < ${tenMinutesAgo} OR ${documents.indexDetectedAt} IS NULL`
        )
      );
  }

  // Progress tracking implementation
  getProgress(key: string): any {
    return this.progressStore.get(key);
  }

  setProgress(key: string, progress: any): void {
    this.progressStore.set(key, progress);
  }

  // User operations (required for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // OCR Cache operations
  async getOcrCacheByDocument(documentId: string): Promise<OcrCache[]> {
    return db.select().from(ocrCache)
      .where(eq(ocrCache.documentId, documentId))
      .orderBy(ocrCache.pageNumber);
  }

  async createOcrCache(data: InsertOcrCache): Promise<OcrCache> {
    const cacheData = { ...data, id: randomUUID() };
    const result = await db.insert(ocrCache).values(cacheData).returning();
    return result[0];
  }

  async updateOcrCache(id: string, data: Partial<OcrCache>): Promise<OcrCache> {
    const result = await db.update(ocrCache)
      .set(data)
      .where(eq(ocrCache.id, id))
      .returning();
    return result[0];
  }

  async deleteOcrCacheByDocument(documentId: string): Promise<void> {
    await db.delete(ocrCache).where(eq(ocrCache.documentId, documentId));
  }

  // OCR Job operations
  async createOcrJob(data: InsertOcrJob): Promise<OcrJob> {
    const jobData = { ...data, id: randomUUID() };
    const result = await db.insert(ocrJobs).values(jobData).returning();
    return result[0];
  }

  async getOcrJob(id: string): Promise<OcrJob | undefined> {
    const result = await db.select().from(ocrJobs).where(eq(ocrJobs.id, id)).limit(1);
    return result[0];
  }

  async getOcrJobByDocument(documentId: string): Promise<OcrJob | undefined> {
    const result = await db.select().from(ocrJobs)
      .where(eq(ocrJobs.documentId, documentId))
      .orderBy(sql`${ocrJobs.startedAt} DESC`)
      .limit(1);
    return result[0];
  }

  async updateOcrJob(id: string, data: Partial<OcrJob>): Promise<OcrJob> {
    const result = await db.update(ocrJobs)
      .set(data)
      .where(eq(ocrJobs.id, id))
      .returning();
    return result[0];
  }

  async getQueuedOcrJobs(limit: number = 10): Promise<OcrJob[]> {
    return db.select().from(ocrJobs)
      .where(eq(ocrJobs.status, "processing"))
      .orderBy(ocrJobs.startedAt)
      .limit(limit);
  }

  // OCR Progress tracking
  async countOcrPages(documentId: string): Promise<number> {
    const result = await db.select({ count: count() }).from(ocrCache)
      .where(eq(ocrCache.documentId, documentId));
    return result[0]?.count || 0;
  }

  async getOcrTimingStats(documentId: string): Promise<{
    avgMsPerPage: number;
    lastUpdatedAt: Date | null;
  } | null> {
    // Simplified to avoid SQL function issues - just return basic timing info
    const pages = await db.select().from(ocrCache)
      .where(eq(ocrCache.documentId, documentId))
      .limit(10); // Get last 10 pages for averaging
    
    if (pages.length === 0) {
      return {
        avgMsPerPage: 2000, // Default estimate: 2 seconds per page
        lastUpdatedAt: null
      };
    }
    
    // Calculate average processing time from metadata
    let totalTime = 0;
    let validPages = 0;
    let lastUpdated: Date | null = null;
    
    for (const page of pages) {
      if (page.processingMetadata && typeof page.processingMetadata === 'object') {
        const metadata = page.processingMetadata as any;
        if (metadata.processingTime && typeof metadata.processingTime === 'number') {
          totalTime += metadata.processingTime;
          validPages++;
        }
      }
      if (page.processedAt && (!lastUpdated || page.processedAt > lastUpdated)) {
        lastUpdated = page.processedAt;
      }
    }
    
    return {
      avgMsPerPage: validPages > 0 ? Math.round(totalTime / validPages) : 2000,
      lastUpdatedAt: lastUpdated
    };
  }

  // OCR Batch operations
  async createOcrBatch(data: InsertOcrBatch): Promise<OcrBatch> {
    const [batch] = await db.insert(ocrBatches).values({
      id: randomUUID(),
      ...data,
    }).returning();
    return batch;
  }

  async getOcrBatch(id: string): Promise<OcrBatch | undefined> {
    const [batch] = await db.select().from(ocrBatches).where(eq(ocrBatches.id, id));
    return batch;
  }

  async getBatchesByDocument(documentId: string): Promise<OcrBatch[]> {
    return db.select().from(ocrBatches).where(eq(ocrBatches.documentId, documentId));
  }

  async updateOcrBatch(id: string, data: Partial<OcrBatch>): Promise<OcrBatch> {
    const [batch] = await db.update(ocrBatches)
      .set(data)
      .where(eq(ocrBatches.id, id))
      .returning();
    return batch;
  }

  async deleteOcrBatchesByDocument(documentId: string): Promise<void> {
    await db.delete(ocrBatches).where(eq(ocrBatches.documentId, documentId));
  }

  // Page Link Position operations
  async getPageLinkPositions(documentId: string, pageNumber: number = 2): Promise<PageLinkPosition[]> {
    return db.select().from(pageLinkPositions)
      .where(and(
        eq(pageLinkPositions.documentId, documentId),
        eq(pageLinkPositions.pageNumber, pageNumber)
      ))
      .orderBy(pageLinkPositions.tabNumber);
  }

  async upsertPageLinkPositions(documentId: string, positions: InsertPageLinkPosition[]): Promise<PageLinkPosition[]> {
    const results: PageLinkPosition[] = [];
    
    for (const position of positions) {
      // Try to find existing position for this document/page/tab combination
      const existing = await db.select().from(pageLinkPositions)
        .where(and(
          eq(pageLinkPositions.documentId, documentId),
          eq(pageLinkPositions.pageNumber, position.pageNumber || 2),
          eq(pageLinkPositions.tabNumber, position.tabNumber)
        ))
        .limit(1);

      if (existing.length > 0) {
        // Update existing position
        const [updated] = await db.update(pageLinkPositions)
          .set({ 
            ...position,
            documentId,
            updatedAt: new Date()
          })
          .where(eq(pageLinkPositions.id, existing[0].id))
          .returning();
        results.push(updated);
      } else {
        // Create new position
        const [created] = await db.insert(pageLinkPositions)
          .values({
            id: randomUUID(),
            ...position,
            documentId,
          })
          .returning();
        results.push(created);
      }
    }
    
    return results;
  }

  async deletePageLinkPosition(id: string, documentId: string): Promise<void> {
    await db.delete(pageLinkPositions).where(
      and(
        eq(pageLinkPositions.id, id),
        eq(pageLinkPositions.documentId, documentId)
      )
    );
  }

  async deletePageLinkPositionsByDocument(documentId: string): Promise<void> {
    await db.delete(pageLinkPositions).where(eq(pageLinkPositions.documentId, documentId));
  }

  // Atomic update for individual page link position (for PATCH endpoint)
  async patchPageLinkPosition(
    documentId: string, 
    pageNumber: number, 
    tabNumber: string, 
    data: Partial<Pick<PageLinkPosition, 'yOffset' | 'locked' | 'xNorm' | 'yNorm' | 'targetPage' | 'isAutoAligned'>>
  ): Promise<PageLinkPosition> {
    // Find existing position
    const existing = await db.select().from(pageLinkPositions)
      .where(and(
        eq(pageLinkPositions.documentId, documentId),
        eq(pageLinkPositions.pageNumber, pageNumber),
        eq(pageLinkPositions.tabNumber, tabNumber)
      ))
      .limit(1);

    if (existing.length === 0) {
      throw new Error(`Page link position not found for document ${documentId}, page ${pageNumber}, tab ${tabNumber}`);
    }

    // If user is manually adjusting position or locking, mark as not auto-aligned
    const updateData = { ...data };
    if ('yOffset' in data || 'locked' in data || 'xNorm' in data || 'yNorm' in data) {
      updateData.isAutoAligned = false;
    }

    // Update the position atomically
    const [updated] = await db.update(pageLinkPositions)
      .set({ 
        ...updateData,
        updatedAt: new Date()
      })
      .where(eq(pageLinkPositions.id, existing[0].id))
      .returning();
    
    return updated;
  }
}

export const storage = new PostgresStorage();
