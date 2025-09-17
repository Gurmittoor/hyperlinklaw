import type { Response } from 'express';

// SSE Client management for real-time OCR updates
class SSEManager {
  private clients = new Map<string, Set<Response>>();

  addClient(documentId: string, res: Response) {
    if (!this.clients.has(documentId)) {
      this.clients.set(documentId, new Set());
    }
    this.clients.get(documentId)!.add(res);

    res.on('close', () => {
      this.removeClient(documentId, res);
    });
  }

  removeClient(documentId: string, res: Response) {
    const clients = this.clients.get(documentId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        this.clients.delete(documentId);
      }
    }
  }

  emit(documentId: string, eventType: string, data: any) {
    const clients = this.clients.get(documentId);
    if (!clients) return;

    const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    
    clients.forEach(client => {
      try {
        client.write(message);
      } catch (error) {
        console.error('SSE write error:', error);
        this.removeClient(documentId, client);
      }
    });

    console.log(`📡 SSE emitted to ${clients.size} clients:`, data);
  }

  getClientCount(documentId: string): number {
    return this.clients.get(documentId)?.size || 0;
  }
}

export const sseManager = new SSEManager();