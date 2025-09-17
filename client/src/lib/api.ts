import { apiRequest } from "./queryClient";
import type { InsertDocument, InsertCase, InsertLink, Document, Case, Link } from "@shared/schema";

export const api = {
  // Cases
  cases: {
    getAll: () => fetch("/api/cases").then(res => res.json()) as Promise<Case[]>,
    getById: (id: string) => fetch(`/api/cases/${id}`).then(res => res.json()) as Promise<Case>,
    create: (data: InsertCase) => apiRequest("POST", "/api/cases", data) as Promise<Case>,
    update: (id: string, data: Partial<Case>) => apiRequest("PATCH", `/api/cases/${id}`, data) as Promise<Case>,
    delete: (id: string) => apiRequest("DELETE", `/api/cases/${id}`),
  },

  // Documents
  documents: {
    getByCaseId: (caseId: string) => fetch(`/api/cases/${caseId}/documents`).then(res => res.json()) as Promise<Document[]>,
    getById: (id: string) => fetch(`/api/documents/${id}`).then(res => res.json()) as Promise<Document>,
    create: (data: InsertDocument) => apiRequest("POST", "/api/documents", data) as Promise<Document>,
    update: (id: string, data: Partial<Document>) => apiRequest("PATCH", `/api/documents/${id}`, data) as Promise<Document>,
    delete: (id: string) => apiRequest("DELETE", `/api/documents/${id}`),
    
    getSuggestions: async (query: string) => {
      return apiRequest("GET", `/api/document-memory/suggestions?q=${encodeURIComponent(query)}`);
    },
    
    saveMemory: async (data: { documentName: string; fileNumber?: string; alias?: string }) => {
      return apiRequest("POST", '/api/document-memory', data);
    },
    
    checkDuplicates: async (caseId: string, fileName: string) => {
      return apiRequest("GET", `/api/cases/${caseId}/check-duplicates/${encodeURIComponent(fileName)}`);
    },
    processHyperlinks: (documentIds: string[]) => apiRequest("POST", "/api/documents/process-hyperlinks", { documentIds }),
    download: (id: string) => fetch(`/api/documents/${id}/download`).then(res => res.blob()),
  },

  // Links
  links: {
    getByCaseId: (caseId: string) => fetch(`/api/cases/${caseId}/links`).then(res => res.json()) as Promise<Link[]>,
    getByDocumentId: (docId: string) => fetch(`/api/documents/${docId}/links`).then(res => res.json()) as Promise<Link[]>,
    create: (data: InsertLink) => apiRequest("POST", "/api/links", data) as Promise<Link>,
    update: (id: string, data: Partial<Link>) => apiRequest("PUT", `/api/links/${id}`, data) as Promise<Link>,
    bulkUpdate: (data: { linkIds: string[], status: string, reviewedBy?: string }) => apiRequest("PUT", "/api/links/bulk-update", data),
    delete: (id: string) => apiRequest("DELETE", `/api/links/${id}`),
  },

  // File upload
  upload: {
    document: async (file: File, caseId: string, onProgress?: (percent: number) => void) => {
      return new Promise<Document>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable && onProgress) {
            const percentComplete = (event.loaded / event.total) * 100;
            onProgress(percentComplete);
          }
        });
        
        // Handle upload completion
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result = JSON.parse(xhr.responseText);
              
              // Emit upload success for auto-opening Index Editor
              import('@/stores/uploadStore').then(({ emitUploadSuccess }) => {
                emitUploadSuccess({
                  id: result.id,
                  url: `/online/pdf/${caseId}/${result.id}`,
                  caseId: caseId,
                  name: result.title || result.originalName || file.name
                });
              });
              
              resolve(result);
            } catch (error) {
              reject(new Error('Invalid response format'));
            }
          } else {
            let errorMessage = `Upload failed (${xhr.status})`;
            try {
              const errorData = JSON.parse(xhr.responseText);
              errorMessage = errorData.error || errorMessage;
            } catch {
              errorMessage = `Upload failed: ${xhr.statusText}`;
            }
            reject(new Error(errorMessage));
          }
        });
        
        // Handle network errors
        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });
        
        // Prepare form data
        const formData = new FormData();
        formData.append("file", file);
        formData.append("caseId", caseId);
        
        // Start upload
        xhr.open('POST', '/api/upload/document');
        xhr.send(formData);
      });
    },
    detectIndex: async (documentId: string) => {
      const response = await fetch(`/api/documents/${documentId}/detect-index`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to detect index items');
      }

      return response.json();
    },
    getIndexStatus: async (documentId: string) => {
      const response = await fetch(`/api/documents/${documentId}/index-status`);
      
      if (!response.ok) {
        throw new Error('Failed to get index status');
      }
      
      return response.json() as Promise<{
        index_status: string | null;
        index_count: number | null;
        index_detected_at: string | null;
      }>;
    },
    retryIndexDetection: async (documentId: string) => {
      const response = await fetch(`/api/documents/${documentId}/reindex`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to retry index detection');
      }

      return response.json();
    },
    retryLinkBuilding: async (documentId: string) => {
      const response = await fetch(`/api/documents/${documentId}/relink`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to retry link building');
      }

      return response.json();
    }
  }
};
