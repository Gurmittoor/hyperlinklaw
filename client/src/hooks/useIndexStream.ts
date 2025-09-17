import { useEffect } from "react";

export function useIndexStream(docId: string, onEvent: (e: any) => void) {
  useEffect(() => {
    if (!docId) return;
    const es = new EventSource(`/api/documents/${docId}/stream`, { withCredentials: true });
    es.onmessage = (ev) => {
      try { 
        onEvent(JSON.parse(ev.data)); 
      } catch {}
    };
    es.onerror = () => { 
      // Optional: backoff & reconnect
      console.warn(`SSE connection error for document ${docId}`);
    };
    return () => es.close();
  }, [docId, onEvent]);
}