import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Eye, FileText, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';

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

interface OcrPage {
  pageNumber: number;
  text: string;
  confidence: number;
}

interface BatchRowDisplayProps {
  documentId: string;
  batches: OcrBatch[];
}

const BatchRowDisplay: React.FC<BatchRowDisplayProps> = ({ documentId, batches }) => {
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [ocrContent, setOcrContent] = useState<Record<string, OcrPage[]>>({});
  const [currentPage, setCurrentPage] = useState<Record<string, number>>({});
  const [reOcrLoading, setReOcrLoading] = useState<Record<string, boolean>>({});

  // Initialize current page for each batch
  useEffect(() => {
    if (batches.length > 0) {
      const pageState: Record<string, number> = {};
      batches.forEach(batch => {
        pageState[batch.id] = batch.startPage;
      });
      setCurrentPage(pageState);
    }
  }, [batches]);

  // Toggle batch expansion
  const toggleBatch = async (batchId: string) => {
    if (expandedBatch === batchId) {
      setExpandedBatch(null);
    } else {
      setExpandedBatch(batchId);
      
      // Load OCR content if not already loaded
      if (!ocrContent[batchId]) {
        await loadOCRContent(batchId);
      }
    }
  };

  // Load OCR content for a batch
  const loadOCRContent = async (batchId: string) => {
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;

    try {
      const response = await fetch(`/api/documents/${documentId}/batches/${batchId}/ocr`);
      const data = await response.json();
      
      setOcrContent(prev => ({
        ...prev,
        [batchId]: data.pages || []
      }));
    } catch (error) {
      console.error('Error loading OCR content:', error);
    }
  };

  // Navigate pages within a batch
  const goToPage = (batchId: string, pageNumber: number) => {
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;
    
    if (pageNumber >= batch.startPage && pageNumber <= batch.endPage) {
      setCurrentPage(prev => ({
        ...prev,
        [batchId]: pageNumber
      }));
    }
  };

  // Handle Re-OCR for a specific batch
  const handleReOcr = async (batchId: string, startPage: number, endPage: number) => {
    try {
      console.log(`🔄 Re-OCR requested for batch ${batchId} (pages ${startPage}-${endPage})`);
      
      // Set loading state
      setReOcrLoading(prev => ({ ...prev, [batchId]: true }));
      
      // Call the re-OCR API endpoint
      const response = await fetch(`/api/documents/${documentId}/batches/${batchId}/re-ocr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ startPage, endPage })
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ Re-OCR started for batch ${batchId}`);
        
        // Clear OCR content for this batch so it reloads
        setOcrContent(prev => {
          const updated = { ...prev };
          delete updated[batchId];
          return updated;
        });
        
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
      // Clear loading state
      setReOcrLoading(prev => ({ ...prev, [batchId]: false }));
    }
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="text-green-500" size={20} />;
      case 'processing':
        return <Clock className="text-blue-500 animate-spin" size={20} />;
      case 'failed':
        return <AlertCircle className="text-red-500" size={20} />;
      case 'queued':
        return <Clock className="text-gray-500" size={20} />;
      default:
        return null;
    }
  };

  // Get current page OCR content
  const getCurrentPageContent = (batchId: string) => {
    const batch = batches.find(b => b.id === batchId);
    const pages = ocrContent[batchId];
    const current = currentPage[batchId];
    
    if (!batch || !pages || !current) return null;
    
    return pages.find(p => p.pageNumber === current);
  };

  return (
    <div className="w-full space-y-2 p-4">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-xl font-bold">Document Batches (50 pages each)</h2>
        <p className="text-gray-600">
          Total Batches: {batches.length} | 
          Completed: {batches.filter(b => b.status === 'completed').length}
        </p>
      </div>
      
      {/* Batch Rows - DISPLAYED AS INDIVIDUAL HORIZONTAL ROWS */}
      {batches.map((batch, index) => (
        <div key={batch.id} className="w-full">
          {/* Batch Row - Full Width Horizontal Layout */}
          <div className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between p-4">
              {/* Left Section - Batch Info */}
              <div className="flex items-center space-x-4">
                {getStatusIcon(batch.status)}
                <div>
                  <h3 className="font-semibold text-lg">Batch {index + 1}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Pages {batch.startPage}-{batch.endPage}
                  </p>
                </div>
                <Badge variant={batch.status === 'completed' ? 'default' : 'secondary'}>
                  {batch.status}
                </Badge>
              </div>
              
              {/* Center Section - Progress Bar */}
              <div className="flex-1 mx-8">
                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${batch.progress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 text-center">
                  {Math.round(batch.progress)}% Complete ({batch.pagesDone}/{batch.totalPages} pages)
                </p>
              </div>
              
              {/* Right Section - Actions */}
              <div className="flex items-center space-x-2">
                <Button
                  onClick={() => toggleBatch(batch.id)}
                  variant="outline"
                  className="flex items-center space-x-2"
                  data-testid={`button-view-ocr-${batch.id}`}
                >
                  <Eye size={16} />
                  <span>View OCR</span>
                  {expandedBatch === batch.id ? 
                    <ChevronUp size={16} /> : 
                    <ChevronDown size={16} />
                  }
                </Button>
                
                <Button
                  onClick={() => {
                    console.log('🔄 Re-OCR button clicked for batch:', batch.id);
                    handleReOcr(batch.id, batch.startPage, batch.endPage);
                  }}
                  disabled={reOcrLoading && reOcrLoading[batch.id]}
                  className="flex items-center space-x-2 bg-orange-500 hover:bg-orange-600 text-white"
                  data-testid={`button-reocr-batch-${batch.id}`}
                >
                  <span>{(reOcrLoading && reOcrLoading[batch.id]) ? 'Re-OCR...' : 'Re-OCR'}</span>
                </Button>
              </div>
            </div>
            
            {/* Expanded OCR Content - DROPDOWN SECTION */}
            {expandedBatch === batch.id && (
              <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                {/* Page Navigation */}
                <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <Button
                    onClick={() => goToPage(batch.id, currentPage[batch.id] - 1)}
                    disabled={currentPage[batch.id] <= batch.startPage}
                    variant="outline"
                    size="sm"
                  >
                    Previous
                  </Button>
                  
                  <div className="flex items-center space-x-2">
                    <FileText size={16} />
                    <span className="font-medium">
                      Page {currentPage[batch.id]} of {batch.endPage}
                    </span>
                  </div>
                  
                  <Button
                    onClick={() => goToPage(batch.id, currentPage[batch.id] + 1)}
                    disabled={currentPage[batch.id] >= batch.endPage}
                    variant="outline"
                    size="sm"
                  >
                    Next →
                  </Button>
                </div>
                
                {/* OCR Text Display - SCROLLABLE */}
                <div className="p-6 max-h-96 overflow-y-auto">
                  {(() => {
                    const pageContent = getCurrentPageContent(batch.id);
                    
                    if (pageContent) {
                      return (
                        <Card>
                          <CardContent className="p-4">
                            <div className="mb-2 text-sm text-gray-600 dark:text-gray-400">
                              Confidence: {Math.round((pageContent.confidence || 0) * 100)}%
                            </div>
                            <pre className="whitespace-pre-wrap font-mono text-sm bg-white dark:bg-gray-800 p-4 rounded border">
                              {pageContent.text || 'No text extracted'}
                            </pre>
                          </CardContent>
                        </Card>
                      );
                    } else if (ocrContent[batch.id]) {
                      return (
                        <div className="text-center py-8 text-gray-500">
                          <div>Page content not available</div>
                        </div>
                      );
                    } else {
                      return (
                        <div className="text-center py-8 text-gray-500">
                          <div className="animate-pulse">Loading OCR content...</div>
                        </div>
                      );
                    }
                  })()}
                </div>
                
                {/* Batch 1 Special - Index Identification Tools */}
                {index === 0 && (
                  <div className="border-t bg-yellow-50 dark:bg-yellow-900/20 p-4">
                    <h4 className="font-semibold mb-2">Index Identification Tools</h4>
                    <div className="flex space-x-2">
                      <Button 
                        size="sm"
                        className="bg-green-500 hover:bg-green-600"
                        data-testid="button-auto-detect-index"
                      >
                        Auto-Detect Index Items
                      </Button>
                      <Button 
                        size="sm"
                        variant="outline"
                        data-testid="button-manual-select-index"
                      >
                        Manually Select Index
                      </Button>
                    </div>
                  </div>
                )}
                
                {/* Other Batches - Hyperlink Tools */}
                {index > 0 && (
                  <div className="border-t bg-blue-50 dark:bg-blue-900/20 p-4">
                    <h4 className="font-semibold mb-2">Hyperlink Generation Tools</h4>
                    <div className="flex space-x-2">
                      <Button 
                        size="sm"
                        className="bg-purple-500 hover:bg-purple-600"
                        data-testid="button-find-references"
                      >
                        Find References
                      </Button>
                      <Button 
                        size="sm"
                        variant="outline"
                        data-testid="button-create-hyperlinks"
                      >
                        Create Hyperlinks
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
      
      {batches.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <div className="text-lg font-medium">No batches available</div>
          <div className="text-sm">Upload a document and create batches to start OCR processing</div>
        </div>
      )}
    </div>
  );
};

export default BatchRowDisplay;