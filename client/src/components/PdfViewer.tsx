import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

export type Highlight = { 
  page: number; 
  x0: number; 
  y0: number; 
  x1: number; 
  y1: number; 
  id?: string;
};

interface PdfViewerProps {
  fileUrl: string;
  page: number;
  zoom?: number;
  highlights?: Highlight[];
  onLoadedTotalPages?: (totalPages: number) => void;
  onPageClick?: (x: number, y: number) => void;
}

export default function PdfViewer({
  fileUrl,
  page,
  zoom = 1,
  highlights = [],
  onLoadedTotalPages,
  onPageClick
}: PdfViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    // Simulate total pages for now
    onLoadedTotalPages?.(100);
  }, [onLoadedTotalPages]);

  const handleIframeLoad = () => {
    setIsLoading(false);
    setError(null);
  };

  const handleIframeError = () => {
    setError('Failed to load PDF in iframe');
    setIsLoading(false);
    setUseFallback(true);
  };

  if (useFallback || error) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-100 rounded-lg">
        <div className="text-center p-8">
          <i className="fas fa-file-pdf text-6xl text-red-500 mb-4"></i>
          <h3 className="text-lg font-medium mb-2">PDF Document</h3>
          <p className="text-gray-600 mb-4">Click below to view the PDF in a new window</p>
          <Button
            onClick={() => window.open(fileUrl, '_blank')}
            className="bg-blue-500 text-white hover:bg-blue-600"
            size="lg"
          >
            <i className="fas fa-external-link-alt mr-2"></i>
            Open PDF in New Window
          </Button>
          <div className="mt-4 text-sm text-gray-500">
            Some browsers block PDF embedding. Use this link to view the document.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg z-10">
          <div className="text-center">
            <i className="fas fa-spinner fa-spin text-4xl text-blue-500 mb-4"></i>
            <p className="text-gray-600">Loading PDF...</p>
          </div>
        </div>
      )}
      
      <iframe
        ref={iframeRef}
        src={`${fileUrl}#page=${page}&zoom=${Math.round(zoom * 100)}`}
        className="w-full h-full border-0 rounded-lg"
        title="PDF Viewer"
        onLoad={handleIframeLoad}
        onError={handleIframeError}
        style={{ minHeight: '600px' }}
      />
      
      {/* Highlight overlays (simplified for iframe) */}
      {highlights.length > 0 && (
        <div className="absolute top-4 right-4 bg-yellow-100 border border-yellow-300 rounded p-2 text-sm">
          <i className="fas fa-highlighter text-yellow-600 mr-1"></i>
          {highlights.length} highlight(s) on this page
        </div>
      )}
    </div>
  );
}