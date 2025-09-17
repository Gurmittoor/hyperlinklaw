import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import BatchRowViewer from './BatchRowViewer';

interface OcrBatch {
  id: string;
  documentId: string;
  startPage: number;
  endPage: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  pagesDone: number;
  progress: number;
  totalPages: number;
  createdAt: string;
  completedAt?: string;
}

interface Document {
  id: string;
  title: string;
  pageCount: number;
  totalPages: number;
  ocrStatus: string;
}

interface BatchManagerProps {
  documentId: string;
}

const BatchManager = ({ documentId }: BatchManagerProps) => {
  const [reOcrLoading, setReOcrLoading] = useState<Record<string, boolean>>({});

  // Fetch document details
  const { data: document } = useQuery<Document>({
    queryKey: [`/api/documents/${documentId}`],
    enabled: !!documentId
  });

  // Fetch batches
  const { data: batchesData, isLoading } = useQuery<{ success: boolean; batches: OcrBatch[] }>({
    queryKey: [`/api/documents/${documentId}/batches`],
    refetchInterval: 2000,
    enabled: !!documentId
  });

  const batches = batchesData?.batches || [];
  const pageCount = document?.pageCount || document?.totalPages || 0;
  const potentialBatchCount = Math.ceil(pageCount / 50);

  // Create batches
  const createBatches = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/documents/${documentId}/batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalPages: pageCount, batchSize: 50 })
      });
      if (!response.ok) throw new Error('Failed to create batches');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/documents/${documentId}/batches`] });
    }
  });

  // Start OCR
  const startParallelOcr = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/documents/${documentId}/parallel-ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concurrency: 4 })
      });
      if (!response.ok) throw new Error('Failed to start OCR');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/documents/${documentId}/batches`] });
    }
  });

  // Handle Re-OCR for entire batch
  const handleReOcr = async (batchId: string, startPage: number, endPage: number) => {
    console.log(`🔄 Starting Re-OCR for batch ${batchId} (pages ${startPage}-${endPage})`);
    
    setReOcrLoading(prev => ({ ...prev, [batchId]: true }));
    
    try {
      const response = await fetch(`/api/documents/${documentId}/batches/${batchId}/re-ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          startPage, 
          endPage,
          engine: 'vision'
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ Re-OCR started for batch ${batchId}`);
        
        // Refresh batch data
        queryClient.invalidateQueries({ queryKey: [`/api/documents/${documentId}/batches`] });
      } else {
        console.error('❌ Re-OCR failed:', result.error);
        alert(`Re-OCR failed: ${result.error}`);
      }
    } catch (error) {
      console.error('❌ Re-OCR error:', error);
      alert('Failed to start re-OCR processing');
    } finally {
      setReOcrLoading(prev => ({ ...prev, [batchId]: false }));
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', marginBottom: '10px' }}>Loading document batches...</div>
        <div style={{ width: '200px', height: '4px', backgroundColor: '#e5e7eb', borderRadius: '2px', margin: '0 auto', overflow: 'hidden' }}>
          <div style={{ width: '50%', height: '100%', backgroundColor: '#3b82f6', animation: 'slide 1.5s infinite' }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      {/* Header */}
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '10px' }}>
          📄 OCR Batch Manager
        </h1>
        <p style={{ fontSize: '16px', color: '#666' }}>
          Document: {document?.title || 'Loading...'} • {pageCount} pages
        </p>
      </div>

      {/* Create Batches */}
      {batches.length === 0 && pageCount > 0 && (
        <div style={{ marginBottom: '30px', padding: '20px', backgroundColor: '#f3f4f6', borderRadius: '8px', textAlign: 'center' }}>
          <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '10px' }}>Ready to Process</h3>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>
            Create {potentialBatchCount} batch{potentialBatchCount !== 1 ? 'es' : ''} (50 pages each) for OCR processing
          </p>
          <button
            onClick={() => createBatches.mutate()}
            disabled={createBatches.isPending}
            style={{ 
              padding: '12px 24px', 
              backgroundColor: '#10b981', 
              color: 'white', 
              border: 'none', 
              borderRadius: '6px', 
              cursor: createBatches.isPending ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: '600'
            }}
          >
            {createBatches.isPending ? 'Creating...' : 'Create Batches'}
          </button>
        </div>
      )}

      {/* OCR Controls */}
      {batches.length > 0 && (
        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f3f4f6', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '5px' }}>OCR Processing</h3>
            <p style={{ fontSize: '14px', color: '#666' }}>{batches.filter(b => b.status === 'completed').length} of {batches.length} batches completed</p>
          </div>
          <button
            onClick={() => startParallelOcr.mutate()}
            disabled={startParallelOcr.isPending || batches.some(b => b.status === 'processing')}
            style={{ 
              padding: '10px 20px', 
              backgroundColor: '#3b82f6', 
              color: 'white', 
              border: 'none', 
              borderRadius: '6px', 
              cursor: (startParallelOcr.isPending || batches.some(b => b.status === 'processing')) ? 'not-allowed' : 'pointer', 
              fontSize: '14px', 
              fontWeight: '500' 
            }}
          >
            {startParallelOcr.isPending ? 'Starting...' : 'Start Parallel OCR'}
          </button>
        </div>
      )}

      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
        Document Batches (50 pages each)
      </h2>
      
      {/* Batch Rows */}
      {batches.map((batch, index) => (
        <div key={batch.id} style={{ width: '100%', marginBottom: '20px' }}>
          {/* Batch Info Row */}
          <div style={{
            width: '100%',
            border: '1px solid #ddd',
            borderRadius: '8px',
            backgroundColor: 'white',
            padding: '15px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            {/* Left: Batch Info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '600' }}>Batch {index + 1}</div>
                <div style={{ fontSize: '14px', color: '#666' }}>Pages {batch.startPage}-{batch.endPage}</div>
              </div>
              <div style={{
                padding: '4px 12px',
                borderRadius: '20px',
                backgroundColor: batch.status === 'completed' ? '#10b981' : '#3b82f6',
                color: 'white',
                fontSize: '12px'
              }}>
                {batch.status === 'completed' ? 'Complete' : 'Processing'}
              </div>
            </div>

            {/* Center: Progress Bar */}
            <div style={{ flex: 1, margin: '0 40px' }}>
              <div style={{ width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${batch.progress || 0}%`, height: '100%', backgroundColor: '#3b82f6', transition: 'width 0.3s' }} />
              </div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px', textAlign: 'center' }}>
                {Math.round(batch.progress)}% Complete ({batch.pagesDone}/{batch.totalPages} pages)
              </div>
            </div>

            {/* Right: Action Buttons */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => {
                  console.log('🔄 Re-OCR button clicked for batch:', batch.id);
                  handleReOcr(batch.id, batch.startPage, batch.endPage);
                }}
                disabled={reOcrLoading[batch.id]}
                style={{
                  padding: '8px 16px',
                  backgroundColor: reOcrLoading[batch.id] ? '#9ca3af' : '#f59e0b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: reOcrLoading[batch.id] ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  opacity: reOcrLoading[batch.id] ? 0.6 : 1
                }}
                data-testid={`button-reocr-batch-${batch.id}`}
              >
                {reOcrLoading[batch.id] ? 'Re-OCR...' : 'Re-OCR'}
              </button>
            </div>
          </div>

          {/* BatchRowViewer for OCR viewing/editing */}
          <div style={{
            width: '100%',
            marginTop: '10px',
            padding: '0 15px'
          }}>
            <BatchRowViewer 
              documentId={documentId}
              batchNo={index + 1}
              batchSize={50}
            />
          </div>
        </div>
      ))}

      {batches.length === 0 && pageCount === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <div style={{ fontSize: '18px', marginBottom: '10px' }}>No document loaded</div>
          <div style={{ fontSize: '14px' }}>Upload a document to begin OCR processing</div>
        </div>
      )}
    </div>
  );
};

export default BatchManager;