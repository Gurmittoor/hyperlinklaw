import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { X, FileText, RefreshCw, Copy, Download, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, Eye, RotateCcw, Edit, Save, Sparkles, Brain } from 'lucide-react';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface BatchOcrViewerProps {
  batchId: string;
  documentId: string;
  startPage: number;
  endPage: number;
  onClose: () => void;
}

interface BatchOcrData {
  batchId: string;
  startPage: number;
  endPage: number;
  pages: Array<{
    pageNumber: number;
    extractedText: string;
    confidence: number;
    ocrEngine: string;
    status: 'missing' | 'empty' | 'completed' | 'failed';
    isCorrected?: boolean;
    isManualEdit?: boolean;
    qualityScore?: number;
    needsReOCR?: boolean;
    lastVerified?: string;
  }>;
  totalText: string;
  totalPages: number;
  pagesWithText: number;
  averageConfidence: number;
}

interface QualityCheck {
  qualityScore: number;
  needsReOCR: boolean;
  issues: string[];
  confidence: number;
  recommendedAction: string;
}

export default function BatchOcrViewer({
  batchId,
  documentId,
  startPage,
  endPage,
  onClose
}: BatchOcrViewerProps) {
  const [isReOCRing, setIsReOCRing] = useState(false);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'combined' | 'individual'>('combined');
  const [reOCRingPage, setReOCRingPage] = useState<number | null>(null);
  const [editingPage, setEditingPage] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [verifyingPage, setVerifyingPage] = useState<number | null>(null);
  const { toast } = useToast();

  // Fetch batch OCR data
  const { data: batchData, isLoading, refetch } = useQuery<BatchOcrData>({
    queryKey: [`/api/documents/${documentId}/batches/${batchId}/ocr`],
    retry: 1
  });

  // Re-OCR entire batch
  const reOcrBatch = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/documents/${documentId}/batches/${batchId}/reocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('Failed to re-OCR batch');
      return response.json();
    },
    onMutate: () => {
      setIsReOCRing(true);
    },
    onSuccess: () => {
      toast({
        title: "Batch Re-OCR Started",
        description: `Re-processing pages ${startPage}-${endPage} with Google Cloud Vision...`,
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: [`/api/documents/${documentId}/batches`] });
    },
    onError: (error) => {
      toast({
        title: "Re-OCR Failed",
        description: error instanceof Error ? error.message : "Failed to start re-OCR",
        variant: "destructive"
      });
    },
    onSettled: () => {
      setIsReOCRing(false);
    }
  });

  // Re-OCR individual page with LLM verification
  const reOcrPage = useMutation({
    mutationFn: async ({ pageNumber, withLLM = true }: { pageNumber: number; withLLM?: boolean }) => {
      const response = await fetch(`/api/documents/${documentId}/pages/${pageNumber}/re-ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine: 'vision', verifyWithLLM: withLLM })
      });
      if (!response.ok) throw new Error('Failed to re-OCR page');
      return response.json();
    },
    onMutate: ({ pageNumber }) => {
      setReOCRingPage(pageNumber);
    },
    onSuccess: (data, { pageNumber }) => {
      const qualityInfo = data.qualityCheck 
        ? ` (Quality: ${data.qualityCheck.qualityScore}%)`
        : '';
      toast({
        title: "Page Re-OCR Complete",
        description: `Page ${pageNumber} re-processed with ${data.textLength} characters${qualityInfo}`,
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: [`/api/documents/${documentId}/batches`] });
    },
    onError: (error, { pageNumber }) => {
      toast({
        title: "Page Re-OCR Failed",
        description: `Failed to re-OCR page ${pageNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
    },
    onSettled: () => {
      setReOCRingPage(null);
    }
  });

  // Save manual edits
  const savePageEdit = useMutation({
    mutationFn: async ({ pageNumber, text }: { pageNumber: number; text: string }) => {
      const response = await fetch(`/api/documents/${documentId}/pages/${pageNumber}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (!response.ok) throw new Error('Failed to save page edit');
      return response.json();
    },
    onSuccess: (data, { pageNumber }) => {
      toast({
        title: "Page Edit Saved",
        description: `Page ${pageNumber} manually edited and saved (${data.textLength} characters)`,
      });
      setEditingPage(null);
      setEditText('');
      refetch();
      queryClient.invalidateQueries({ queryKey: [`/api/documents/${documentId}/batches`] });
    },
    onError: (error, { pageNumber }) => {
      toast({
        title: "Save Failed",
        description: `Failed to save edits for page ${pageNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
    }
  });

  // LLM Quality Verification
  const verifyWithLLM = useMutation({
    mutationFn: async (pageNumber: number) => {
      // Re-OCR with LLM verification enabled
      return reOcrPage.mutateAsync({ pageNumber, withLLM: true });
    },
    onMutate: (pageNumber) => {
      setVerifyingPage(pageNumber);
    },
    onSettled: () => {
      setVerifyingPage(null);
    }
  });

  const copyToClipboard = async () => {
    if (batchData?.totalText) {
      await navigator.clipboard.writeText(batchData.totalText);
      toast({
        title: "Copied to Clipboard",
        description: `${batchData.totalText.length} characters copied`,
      });
    }
  };

  const downloadText = () => {
    if (batchData?.totalText) {
      const blob = new Blob([batchData.totalText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `batch-${startPage}-${endPage}-ocr.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const getPageStatusBadge = (page: any) => {
    const { status, isManualEdit, qualityScore, needsReOCR } = page;
    
    if (isManualEdit) {
      return <Badge variant="default" className="bg-blue-500"><Edit className="w-3 h-3 mr-1" />Manual</Badge>;
    }
    
    if (qualityScore && qualityScore < 85) {
      return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Low Quality ({qualityScore}%)</Badge>;
    }
    
    if (needsReOCR) {
      return <Badge variant="outline" className="border-orange-500 text-orange-600"><Brain className="w-3 h-3 mr-1" />Needs Re-OCR</Badge>;
    }
    
    switch (status) {
      case 'completed':
        const qualityText = qualityScore ? ` (${qualityScore}%)` : '';
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Complete{qualityText}</Badge>;
      case 'missing':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Missing</Badge>;
      case 'empty':
        return <Badge variant="secondary"><AlertCircle className="w-3 h-3 mr-1" />Empty</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const startEditing = (page: any) => {
    setEditingPage(page.pageNumber);
    setEditText(page.extractedText || '');
  };

  const cancelEdit = () => {
    setEditingPage(null);
    setEditText('');
  };

  const currentPage = batchData?.pages?.[currentPageIndex];
  const canNavigate = batchData?.pages && batchData.pages.length > 1;

  const goToPage = (direction: 'prev' | 'next') => {
    if (!batchData?.pages) return;
    
    if (direction === 'prev' && currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1);
    } else if (direction === 'next' && currentPageIndex < batchData.pages.length - 1) {
      setCurrentPageIndex(currentPageIndex + 1);
    }
  };

  if (isLoading) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Loading OCR Text...</DialogTitle>
          </DialogHeader>
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <div>Loading batch OCR data...</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              OCR Text - Pages {startPage}-{endPage}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <div className="text-center">
              <div className="text-xl font-bold text-blue-600">{batchData?.totalPages || 0}</div>
              <div className="text-xs text-gray-600">Total Pages</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-green-600">{batchData?.pagesWithText || 0}</div>
              <div className="text-xs text-gray-600">With Text</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-purple-600">
                {batchData?.averageConfidence ? Math.round(batchData.averageConfidence * 100) : 0}%
              </div>
              <div className="text-xs text-gray-600">Avg Confidence</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-orange-600">
                {batchData?.totalText?.length?.toLocaleString() || 0}
              </div>
              <div className="text-xs text-gray-600">Characters</div>
            </div>
          </div>

          {/* View Mode Toggle and Action Buttons */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === 'combined' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('combined')}
                className="flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                Combined View
              </Button>
              <Button
                variant={viewMode === 'individual' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('individual')}
                className="flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                Page-by-Page
              </Button>
            </div>
            
            <div className="flex gap-2">
              <Button
                onClick={() => reOcrBatch.mutate()}
                disabled={isReOCRing}
                className="bg-orange-500 hover:bg-orange-600 text-white flex items-center gap-2"
                data-testid="button-re-ocr-batch"
              >
                <RefreshCw className={`w-4 h-4 ${isReOCRing ? 'animate-spin' : ''}`} />
                {isReOCRing ? 'Re-OCR in Progress...' : 'Re-OCR Entire Batch'}
              </Button>
              <Button
                onClick={copyToClipboard}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Copy Text
              </Button>
              <Button
                onClick={downloadText}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download
              </Button>
            </div>
          </div>
          
          {/* Page Navigation (Individual View Only) */}
          {viewMode === 'individual' && canNavigate && (
            <div className="flex items-center justify-between p-4 bg-slate-100 dark:bg-slate-700 rounded-lg">
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage('prev')}
                disabled={currentPageIndex === 0}
                className="flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
              
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">
                  Page {currentPage?.pageNumber || (startPage + currentPageIndex)} of {endPage}
                </span>
                {currentPage && (
                  <div className="flex items-center gap-2">
                    {getPageStatusBadge(currentPage)}
                    <Button
                      onClick={() => reOcrPage.mutate({ pageNumber: currentPage.pageNumber })}
                      disabled={reOCRingPage === currentPage.pageNumber}
                      size="sm"
                      variant="outline"
                      className="flex items-center gap-1"
                    >
                      <RotateCcw className={`w-3 h-3 ${reOCRingPage === currentPage.pageNumber ? 'animate-spin' : ''}`} />
                      {reOCRingPage === currentPage.pageNumber ? 'Re-OCR...' : 'Re-OCR Page'}
                    </Button>
                  </div>
                )}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage('next')}
                disabled={currentPageIndex >= (batchData?.pages?.length || 1) - 1}
                className="flex items-center gap-2"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* OCR Text Display */}
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {viewMode === 'combined' ? (
              /* Combined Text View */
              <div>
                <h3 className="font-semibold mb-2">Combined OCR Text ({batchData?.totalText?.length || 0} characters)</h3>
                <Textarea
                  value={batchData?.totalText || 'No OCR text found for this batch.'}
                  readOnly
                  className="min-h-[400px] font-mono text-sm"
                  placeholder="No OCR text available..."
                />
                
                {/* Page Summary Cards */}
                <div className="mt-4">
                  <h4 className="font-medium mb-2">Page Summary</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {batchData?.pages?.map((page) => (
                      <div key={page.pageNumber} className="border rounded p-2 text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">Page {page.pageNumber}</span>
                          {getPageStatusBadge(page)}
                        </div>
                        <div className="text-xs text-gray-600">
                          {page.extractedText ? `${page.extractedText.length} chars` : 'No text'}
                          {page.confidence > 0 && (
                            <span className="ml-2">{Math.round(page.confidence * 100)}%</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Individual Page View */
              <div>
                {currentPage ? (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">Page {currentPage.pageNumber} OCR Text</h3>
                      <div className="flex items-center gap-2">
                        {getPageStatusBadge(currentPage)}
                        {currentPage.confidence > 0 && (
                          <span className="text-sm text-gray-600">
                            {Math.round(currentPage.confidence * 100)}% confidence
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {currentPage.extractedText ? (
                      <div>
                        <div className="text-sm text-gray-600 mb-2">
                          {currentPage.extractedText.length} characters extracted
                          {currentPage.isCorrected && (
                            <span className="ml-2 text-green-600">• Manually corrected</span>
                          )}
                        </div>
                        <Textarea
                          value={currentPage.extractedText}
                          readOnly
                          className="min-h-[400px] font-mono text-sm"
                          placeholder="No OCR text available for this page..."
                        />
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <AlertCircle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                        <div className="text-lg font-medium text-gray-600 mb-2">
                          No OCR text found for Page {currentPage.pageNumber}
                        </div>
                        <div className="text-sm text-gray-500 mb-4">
                          This page may need to be re-processed with OCR
                        </div>
                        <Button
                          onClick={() => reOcrPage.mutate({ pageNumber: currentPage.pageNumber })}
                          disabled={reOCRingPage === currentPage.pageNumber}
                          className="flex items-center gap-2"
                        >
                          <RotateCcw className={`w-4 h-4 ${reOCRingPage === currentPage.pageNumber ? 'animate-spin' : ''}`} />
                          {reOCRingPage === currentPage.pageNumber ? 'Re-OCR in Progress...' : 'Re-OCR This Page'}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No page data available
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}