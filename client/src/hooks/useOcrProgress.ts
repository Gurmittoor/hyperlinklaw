import { useEffect, useRef, useState } from "react";

type OcrProgress = {
  status: "pending" | "working" | "completed" | "failed" | null;
  done: number;
  total: number;
  percent: number;
  etaMs?: number;
  avgMsPerPage?: number;
};

/**
 * Hook to track OCR progress for a document in real-time
 * Uses Server-Sent Events (SSE) with polling fallback
 */
export function useOcrProgress(documentId: string) {
  const [progress, setProgress] = useState<OcrProgress>({ 
    status: null, 
    done: 0, 
    total: 0, 
    percent: 0 
  });
  const timerRef = useRef<number | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!documentId) return;

    // 1) Server-Sent Events for real-time updates
    const connectSSE = () => {
      try {
        const eventSource = new EventSource(`/api/documents/${documentId}/ocr/stream`);
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            
            // Handle OCR-First specification events
            if (message?.type === 'ocr_progress' && message?.data) {
              setProgress({
                status: message.data.status ?? "working",
                done: message.data.done ?? 0,
                total: message.data.total ?? 0,
                percent: message.data.percent ?? Math.floor((message.data.done / message.data.total) * 100),
                etaMs: message.data.etaMs,
                avgMsPerPage: message.data.avgMsPerPage,
              });
            } else if (message?.type === 'ocr_done' && message?.data) {
              setProgress({
                status: "completed",
                done: message.data.done ?? 0,
                total: message.data.total ?? 0,
                percent: 100,
                etaMs: 0,
                avgMsPerPage: message.data.avgMsPerPage,
              });
            } else if (message?.type === 'ocr_failed' && message?.data) {
              setProgress({
                status: "failed",
                done: message.data.done ?? 0,
                total: message.data.total ?? 0,
                percent: message.data.percent ?? 0,
                etaMs: 0,
                avgMsPerPage: 0,
              });
            }
          } catch (parseError) {
            console.debug("Failed to parse SSE message:", parseError);
          }
        };

        eventSource.onerror = () => {
          console.debug("SSE connection error, falling back to polling");
        };

      } catch (sseError) {
        console.debug("SSE not available, using polling fallback");
      }
    };

    // 2) Polling fallback for real counts from server
    const pollProgress = async () => {
      try {
        const response = await fetch(`/api/documents/${documentId}/ocr-status`, { 
          credentials: "include" 
        });
        
        if (response.ok) {
          const data = await response.json();
          
          setProgress({
            status: (data.status === "pending" && data.done > 0) ? "working" : data.status,
            done: data.done ?? 0,
            total: data.total ?? 0,
            percent: data.total > 0 ? Math.floor((data.done / data.total) * 100) : 0,
            etaMs: data.etaMs,
            avgMsPerPage: data.avgMsPerPage,
          });
        }
      } catch (fetchError) {
        console.debug("Polling error:", fetchError);
      }
    };

    // Setup both SSE and polling
    connectSSE();
    timerRef.current = window.setInterval(pollProgress, 10000); // Poll every 10 seconds
    pollProgress(); // Immediate fetch

    // Cleanup function
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [documentId]);

  return progress;
}