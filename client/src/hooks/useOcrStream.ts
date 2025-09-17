import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';

interface OcrStatus {
  status: 'queued' | 'working' | 'completed' | 'failed';
  done: number;
  total: number;
  avg_confidence: number | null;
  last_page: number | null;
  started_at: string | null;
  updated_at: string | null;
}

interface OcrProgressEvent {
  done: number;
  total: number;
  page: number | null;
  status: 'queued' | 'working' | 'completed' | 'failed';
  avg_confidence: number | null;
}

interface UseOcrStreamOptions {
  documentId: string;
  enabled?: boolean;
}

export function useOcrStream({ documentId, enabled = true }: UseOcrStreamOptions) {
  const [progressData, setProgressData] = useState<OcrProgressEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [usePolling, setUsePolling] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Start with GET /api/documents/:id/ocr-status (seed done/total/status)
  const { data: initialStatus, refetch: refetchStatus } = useQuery<OcrStatus>({
    queryKey: [`/api/documents/${documentId}/ocr-status`],
    enabled: enabled && !!documentId,
    refetchInterval: usePolling ? 2000 : false, // 2s polling fallback only if SSE disconnects
  });

  const connectSSE = useCallback(() => {
    if (!enabled || !documentId || eventSourceRef.current) return;

    console.log(`🌊 Connecting to SSE stream for document: ${documentId}`);
    
    const eventSource = new EventSource(`/api/documents/${documentId}/ocr/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('📡 SSE connected');
      setIsConnected(true);
      setUsePolling(false);
    };

    eventSource.addEventListener('ocr_progress', (event) => {
      try {
        const data: OcrProgressEvent = JSON.parse(event.data);
        console.log(`📊 SSE progress received: ${data.done}/${data.total} pages`);
        setProgressData(data);
      } catch (error) {
        console.error('❌ Failed to parse SSE progress data:', error);
      }
    });

    eventSource.addEventListener('error', (event) => {
      console.error('❌ SSE connection error:', event);
    });

    eventSource.onerror = (error) => {
      console.debug('SSE connection error, falling back to polling');
      setIsConnected(false);
      setUsePolling(true);
      
      // Clean up current connection
      eventSource.close();
      eventSourceRef.current = null;

      // Attempt to reconnect after 5 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('🔄 Attempting SSE reconnection...');
        connectSSE();
      }, 5000);
    };

    return eventSource;
  }, [enabled, documentId]);

  useEffect(() => {
    if (!enabled) return;

    connectSSE();

    return () => {
      // Cleanup on unmount
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      setIsConnected(false);
      setUsePolling(false);
    };
  }, [connectSSE, enabled]);

  // Update progress from polling when SSE is not available
  useEffect(() => {
    if (usePolling && initialStatus) {
      setProgressData({
        done: initialStatus.done,
        total: initialStatus.total,
        page: initialStatus.last_page,
        status: initialStatus.status,
        avg_confidence: initialStatus.avg_confidence
      });
    }
  }, [usePolling, initialStatus]);

  // Set initial progress data from the status query
  useEffect(() => {
    if (initialStatus && !progressData) {
      setProgressData({
        done: initialStatus.done,
        total: initialStatus.total,
        page: initialStatus.last_page,
        status: initialStatus.status,
        avg_confidence: initialStatus.avg_confidence
      });
    }
  }, [initialStatus, progressData]);

  const restartOCR = useCallback(async () => {
    try {
      const response = await fetch(`/api/documents/${documentId}/re-ocr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to restart OCR');
      }
      
      // Reset progress data and refetch status
      setProgressData(null);
      refetchStatus();
      
      // Reconnect SSE if needed
      if (!isConnected && !usePolling) {
        connectSSE();
      }
      
      return await response.json();
    } catch (error) {
      console.error('❌ Failed to restart OCR:', error);
      throw error;
    }
  }, [documentId, isConnected, usePolling, connectSSE, refetchStatus]);

  return {
    // Progress data
    done: progressData?.done || 0,
    total: progressData?.total || 0,
    status: progressData?.status || 'queued',
    page: progressData?.page || null,
    avgConfidence: progressData?.avg_confidence || null,
    
    // Connection state
    isConnected,
    usePolling,
    
    // Actions
    restartOCR,
    
    // Raw data for debugging
    progressData,
    initialStatus
  };
}