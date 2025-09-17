import type { Response } from 'express';

/**
 * Server-Sent Events (SSE) Service for Real-time Progress Updates
 * Provides real-time updates for OCR processing, indexing, and linking progress
 */
export class SSEService {
  private clients: Map<string, Set<Response>> = new Map();

  /**
   * Add a client connection for a specific document
   */
  addClient(documentId: string, res: Response): void {
    if (!this.clients.has(documentId)) {
      this.clients.set(documentId, new Set());
    }
    
    this.clients.get(documentId)!.add(res);
    
    // Setup SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });
    
    // Send initial connection event
    this.sendEvent(res, { type: 'connected', timestamp: new Date().toISOString() });
    
    // Handle client disconnect
    res.on('close', () => {
      this.removeClient(documentId, res);
    });
  }

  /**
   * Remove a client connection
   */
  removeClient(documentId: string, res: Response): void {
    const clients = this.clients.get(documentId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        this.clients.delete(documentId);
      }
    }
  }

  /**
   * Emit progress event to all clients listening to a document
   */
  emit(documentId: string, data: ProgressEvent): void {
    const clients = this.clients.get(documentId);
    if (!clients || clients.size === 0) return;

    const event = {
      ...data,
      timestamp: new Date().toISOString(),
      documentId
    };

    // Send to all connected clients for this document
    clients.forEach(res => {
      try {
        this.sendEvent(res, event);
      } catch (error) {
        console.error('Failed to send SSE event:', error);
        this.removeClient(documentId, res);
      }
    });
  }

  /**
   * Send individual event to a response stream
   */
  private sendEvent(res: Response, data: any): void {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  /**
   * Get number of active connections for a document
   */
  getClientCount(documentId: string): number {
    return this.clients.get(documentId)?.size || 0;
  }

  /**
   * Emit OCR progress update (Per OCR-First specification)
   */
  emitOcrProgress(documentId: string, progress: OcrProgressData): void {
    this.emit(documentId, {
      type: progress.status === 'completed' ? 'ocr_done' : progress.status === 'failed' ? 'ocr_failed' : 'ocr_progress',
      data: {
        status: progress.status,
        done: progress.done,
        total: progress.total,
        percent: progress.percent || Math.floor((progress.done / progress.total) * 100),
        page: progress.page,
        avg_conf: progress.avg_conf,
        message: progress.message
      }
    });
  }

  /**
   * Emit index detection progress
   */
  emitIndexProgress(documentId: string, status: 'pending' | 'working' | 'completed' | 'failed', data?: any): void {
    this.emit(documentId, {
      phase: 'index',
      status,
      indexCount: data?.indexCount,
      indexItems: data?.indexItems
    });
  }

  /**
   * Emit hyperlink generation progress
   */
  emitLinkProgress(documentId: string, status: 'pending' | 'working' | 'completed' | 'failed', data?: any): void {
    this.emit(documentId, {
      phase: 'links',
      status,
      linkCount: data?.linkCount,
      linksGenerated: data?.linksGenerated
    });
  }
}

// Types for SSE events
export interface ProgressEvent {
  phase: 'ocr' | 'index' | 'links';
  status: 'pending' | 'working' | 'completed' | 'failed';
  [key: string]: any;
}

export interface OcrProgressData {
  status: 'queued' | 'working' | 'completed' | 'failed';
  page?: number;
  done: number;
  total: number;
  percent?: number; // Per specification: Math.floor(done*100/total)
  avg_conf?: number; // Average confidence (per specification)
  message?: string; // Error message for failed status
  avgMsPerPage?: number;
  etaMs?: number;
}

// Global SSE service instance
export const sseService = new SSEService();