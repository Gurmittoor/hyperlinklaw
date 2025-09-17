import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { OcrProgressBar } from "@/components/OcrProgressBar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useOcrStream } from "@/hooks/useOcrStream";
import { DocumentOCRCard } from "@/components/DocumentOCRCard";
import OCRPageManager from "@/components/OCRPageManager";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff, FileText, Edit, Save, Plus, Trash2 } from "lucide-react";
import type { Document } from "@shared/schema";

interface OCRProcessingStepProps {
  caseId: string;
  documents: Document[];
  onOCRComplete: () => void;
}

// Batch interface for horizontal display
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

// Batch OCR data interface
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
  }>;
  totalText: string;
  totalPages: number;
  pagesWithText: number;
  averageConfidence: number;
}

// Index item interface
interface IndexItem {
  id: string;
  text: string;
  pageNumber: number;
  confidence: number;
  isManuallyEdited: boolean;
}

export function OCRProcessingStep({ caseId, documents, onOCRComplete }: OCRProcessingStepProps) {
  const { toast } = useToast();
  
  // State for horizontal batch management
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState<{[batchId: string]: number}>({});
  const [indexItems, setIndexItems] = useState<IndexItem[]>([]);
  const [isEditingOcr, setIsEditingOcr] = useState<{[batchId: string]: boolean}>({});
  const [editedOcrText, setEditedOcrText] = useState<{[batchId: string]: string}>({});
  
  // Find the document being processed (assume single document workflow for now)
  const processingDoc = documents.find(doc => 
    doc.ocrStatus === "processing" || doc.ocrStatus === "queued" || doc.ocrStatus === "pending"
  ) || documents[0];

  // Fetch batches for the processing document
  const { data: batchesData } = useQuery<{ success: boolean; batches: OcrBatch[] }>({
    queryKey: [`/api/documents/${processingDoc?.id}/batches`],
    refetchInterval: 2000, // Poll every 2 seconds for progress updates
    enabled: !!processingDoc?.id
  });

  // Fetch OCR data for expanded batch
  const { data: batchOcrData, isLoading: isLoadingOcrData } = useQuery<BatchOcrData>({
    queryKey: [`/api/documents/${processingDoc?.id}/batches/${expandedBatch}/ocr`],
    enabled: !!expandedBatch && !!processingDoc?.id,
    retry: 1
  });

  // Fetch index items for batch 1 (index identification)
  const { data: savedIndexItems } = useQuery<IndexItem[]>({
    queryKey: [`/api/documents/${processingDoc?.id}/index-items`],
    enabled: !!processingDoc?.id
  });
  
  // Use the new SSE-first hook for real-time progress
  const {
    done,
    total, 
    status,
    page,
    avgConfidence,
    isConnected,
    usePolling,
    restartOCR
  } = useOcrStream({
    documentId: processingDoc?.id || '',
    enabled: !!processingDoc
  });
  
  const allOCRComplete = documents.every(doc => doc.ocrStatus === "completed");
  const anyOCRProcessing = status === "working" || documents.some(doc => doc.ocrStatus === "processing");
  const anyOCRPending = status === "queued" || documents.some(doc => doc.ocrStatus === "pending" || doc.ocrStatus === "queued");
  const anyOCRFailed = status === "failed" || documents.some(doc => doc.ocrStatus === "failed");
  
  // Poll for OCR progress - faster during processing (fallback only)
  const { data: ocrProgress } = useQuery({
    queryKey: ["/api/ocr-progress", caseId],
    refetchInterval: anyOCRProcessing && usePolling ? 2000 : 10000, // Only poll if SSE failed
    enabled: usePolling
  });
  
  // Check for completed documents with broken results (0.0% confidence)
  const hasIncompleteOCR = documents.some(doc => 
    doc.ocrStatus === "completed" && 
    (doc.ocrConfidenceAvg === "0.0" || doc.ocrConfidenceAvg === null || parseFloat(doc.ocrConfidenceAvg || "0") < 5)
  );
  
  // Use SSE data for progress calculation when available - CLAMP to prevent 159% bug
  const totalPages = total || documents.reduce((sum, doc) => sum + (doc.pageCount || 0), 0);
  const rawCompleted = done || documents.reduce((sum, doc) => {
    if (doc.ocrStatus === "completed") {
      return sum + (doc.pageCount || 0);
    } else if (doc.ocrStatus === "processing") {
      return sum + (doc.parseProgress || doc.ocrPagesDone || 0);
    }
    return sum;
  }, 0);
  
  // CLAMP completed pages to never exceed total (fixes 159% bug)
  const completedPages = Math.min(Math.max(rawCompleted, 0), totalPages);
  const progressPercent = totalPages > 0 ? Math.floor((completedPages / totalPages) * 100) : 0;

  // Mutation to start OCR processing
  const startOcrMutation = useMutation({
    mutationFn: async (documentId: string) => {
      await apiRequest('POST', `/api/documents/${documentId}/start-ocr`, { priority: 1 });
    },
    onSuccess: () => {
      toast({
        title: "OCR Processing Started",
        description: "Document processing has been initiated. You'll see real-time progress updates.",
      });
      // Invalidate queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ["/api/ocr-progress", caseId] });
      queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/documents`] });
    },
    onError: (error) => {
      toast({
        title: "Failed to Start OCR",
        description: error instanceof Error ? error.message : "Could not start OCR processing",
        variant: "destructive",
      });
    },
  });

  // Use the new SSE-based restart OCR function
  const resetOcrMutation = useMutation({
    mutationFn: async (documentId: string) => {
      return await restartOCR();
    },
    onSuccess: () => {
      toast({
        title: "OCR Reset Successful",
        description: "Document has been reset and is ready for re-processing.",
      });
      // Invalidate queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ["/api/ocr-progress", caseId] });
      queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/documents`] });
    },
    onError: (error) => {
      toast({
        title: "Failed to Reset OCR",
        description: error instanceof Error ? error.message : "Could not reset OCR status",
        variant: "destructive",
      });
    },
  });

  // Mutation to cancel OCR processing
  const cancelOcrMutation = useMutation({
    mutationFn: async (documentId: string) => {
      await apiRequest('POST', `/api/documents/${documentId}/cancel-ocr`, {});
    },
    onSuccess: () => {
      toast({
        title: "OCR Processing Cancelled",
        description: "Document processing has been stopped successfully.",
      });
      // Invalidate queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ["/api/ocr-progress", caseId] });
      queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/documents`] });
    },
    onError: (error) => {
      toast({
        title: "Failed to Cancel OCR",
        description: error instanceof Error ? error.message : "Could not cancel OCR processing",
        variant: "destructive",
      });
    },
  });

  // Utility functions for the new batch layout
  const batches = batchesData?.batches || [];

  const getBatchStatusBadge = (status: string) => {
    switch (status) {
      case 'queued':
        return <Badge variant="secondary" className="text-xs">Queued</Badge>;
      case 'processing':
        return <Badge variant="default" className="bg-blue-500 text-xs">Processing</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-green-500 text-xs">Complete</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="text-xs">Failed</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">Unknown</Badge>;
    }
  };

  const toggleBatchExpansion = (batchId: string) => {
    if (expandedBatch === batchId) {
      setExpandedBatch(null);
    } else {
      setExpandedBatch(batchId);
      if (!currentPageIndex[batchId]) {
        setCurrentPageIndex(prev => ({ ...prev, [batchId]: 0 }));
      }
    }
  };

  const navigatePage = (batchId: string, direction: 'prev' | 'next') => {
    const currentIndex = currentPageIndex[batchId] || 0;
    const pages = batchOcrData?.pages || [];
    
    if (direction === 'prev' && currentIndex > 0) {
      setCurrentPageIndex(prev => ({ ...prev, [batchId]: currentIndex - 1 }));
    } else if (direction === 'next' && currentIndex < pages.length - 1) {
      setCurrentPageIndex(prev => ({ ...prev, [batchId]: currentIndex + 1 }));
    }
  };

  const getCurrentPageData = (batchId: string) => {
    if (!batchOcrData?.pages) return null;
    const pageIndex = currentPageIndex[batchId] || 0;
    return batchOcrData.pages[pageIndex];
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-6">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
            allOCRComplete ? "bg-green-100 dark:bg-green-900" : 
            anyOCRProcessing ? "bg-blue-100 dark:bg-blue-900" : "bg-gray-100 dark:bg-gray-800"
          }`}>
            <i className={`text-xl ${
              allOCRComplete ? "fas fa-check text-green-600" :
              anyOCRProcessing ? "fas fa-spinner fa-spin text-blue-600" : "fas fa-eye text-gray-600"
            }`}></i>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Step 2: Document Processing Hub {allOCRComplete ? "✅" : ""}
            </h1>
            <p className="text-lg text-muted-foreground">
              OCR Processing • Index Identification • Hyperlink Generation
            </p>
            
            <div className="mt-2 text-sm text-muted-foreground">
              {isConnected ? (
                <span className="text-green-600">🟢 Live updates</span>
              ) : usePolling ? (
                <span className="text-yellow-600">🔄 Polling mode</span>
              ) : (
                <span className="text-gray-600">⏳ Connecting...</span>
              )}
              {avgConfidence && <span className="ml-4">Avg confidence: {avgConfidence.toFixed(1)}%</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Document Status Card */}
      {processingDoc && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <FileText className="h-5 w-5" />
              <span>{processingDoc.title}</span>
              <Badge className={`${
                allOCRComplete ? 'bg-green-500' : anyOCRProcessing ? 'bg-blue-500' : 'bg-gray-500'
              }`}>
                {allOCRComplete ? 'OCR Complete' : anyOCRProcessing ? 'Processing' : 'Ready'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">{processingDoc.pageCount || 0}</div>
                <div className="text-sm text-muted-foreground">Total Pages</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{batches.length}</div>
                <div className="text-sm text-muted-foreground">Processing Batches</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  {batches.filter(b => b.status === 'completed').length}/{batches.length}
                </div>
                <div className="text-sm text-muted-foreground">Batches Complete</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Horizontal Batch Layout */}
      {batches.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Processing Batches - Click to Expand</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Horizontal Batch Rows */}
            <div className="space-y-3 mb-6">
              {batches.map((batch) => (
                <div
                  key={batch.id}
                  className={`w-full cursor-pointer transition-all border-2 rounded-lg p-4 ${
                    expandedBatch === batch.id 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' 
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                  onClick={() => toggleBatchExpansion(batch.id)}
                  data-testid={`batch-row-${batch.id}`}
                >
                  <div className="flex items-center justify-between w-full">
                    {/* Left side - Batch info */}
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold">
                          Batch {batches.indexOf(batch) + 1}
                        </span>
                        {getBatchStatusBadge(batch.status)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Pages {batch.startPage} - {batch.endPage}
                      </div>
                      <div className="text-sm">
                        {batch.pagesDone}/{batch.totalPages} pages
                      </div>
                    </div>

                    {/* Center - Progress bar */}
                    <div className="flex-1 max-w-xs mx-4">
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full transition-all ${
                            batch.status === 'completed' 
                              ? 'bg-green-500' 
                              : batch.status === 'processing' 
                              ? 'bg-blue-500' 
                              : 'bg-gray-400'
                          }`}
                          style={{ width: `${batch.progress || 0}%` }}
                        />
                      </div>
                      <div className="text-xs text-center text-muted-foreground mt-1">
                        {batch.progress || 0}%
                      </div>
                    </div>

                    {/* Right side - Action indicator */}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {expandedBatch === batch.id ? (
                        <>
                          <EyeOff className="w-4 h-4" />
                          <span>Hide OCR</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4" />
                          <span>View OCR</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Expanded Batch Content */}
            {expandedBatch && (
              <div className="border-t pt-6">
                {isLoadingOcrData ? (
                  <div className="flex justify-center py-8">
                    <div className="text-muted-foreground">Loading OCR text...</div>
                  </div>
                ) : batchOcrData ? (
                  <div className="space-y-4">
                    {/* Batch Header */}
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-semibold">
                        Batch {batches.findIndex(b => b.id === expandedBatch) + 1} - Pages {batchOcrData.startPage}-{batchOcrData.endPage}
                      </h3>
                      <div className="flex items-center gap-2">
                        {batchOcrData.pages && batchOcrData.pages.length > 1 && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigatePage(expandedBatch, 'prev')}
                              disabled={currentPageIndex[expandedBatch] === 0}
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <span className="text-sm">
                              Page {(currentPageIndex[expandedBatch] || 0) + 1} of {batchOcrData.pages.length}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigatePage(expandedBatch, 'next')}
                              disabled={currentPageIndex[expandedBatch] >= batchOcrData.pages.length - 1}
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* OCR Text Display */}
                    {(() => {
                      const currentPage = getCurrentPageData(expandedBatch);
                      return (
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <div className="text-sm text-muted-foreground">
                              {currentPage ? `Page ${currentPage.pageNumber}` : 'No data'}
                              {currentPage?.confidence && ` • Confidence: ${(currentPage.confidence * 100).toFixed(1)}%`}
                            </div>
                            {batches.findIndex(b => b.id === expandedBatch) === 0 && (
                              <Badge className="bg-orange-500">Index Identification</Badge>
                            )}
                            {batches.findIndex(b => b.id === expandedBatch) > 0 && (
                              <Badge className="bg-green-500">Hyperlink Generation</Badge>
                            )}
                          </div>

                          <Textarea
                            value={currentPage?.extractedText || 'No OCR text available'}
                            readOnly={!isEditingOcr[expandedBatch]}
                            className="min-h-[400px] font-mono text-sm"
                            placeholder="OCR text will appear here..."
                          />

                          {/* Batch 1 - Index Identification Tools */}
                          {batches.findIndex(b => b.id === expandedBatch) === 0 && (
                            <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                              <h4 className="font-semibold text-orange-900 dark:text-orange-100 mb-3">
                                📋 Index Identification (Batch 1)
                              </h4>
                              <div className="text-sm text-orange-700 dark:text-orange-300 mb-3">
                                This is Batch 1 containing the document index. Select text to identify index items.
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" className="text-orange-700 border-orange-300">
                                  <Plus className="w-4 h-4 mr-1" />
                                  Add Manual Index Item
                                </Button>
                                <Button size="sm" variant="outline" className="text-orange-700 border-orange-300">
                                  <Edit className="w-4 h-4 mr-1" />
                                  Edit OCR Text
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Other Batches - Hyperlink Generation Tools */}
                          {batches.findIndex(b => b.id === expandedBatch) > 0 && (
                            <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
                              <h4 className="font-semibold text-green-900 dark:text-green-100 mb-3">
                                🔗 Hyperlink Generation (Batch {batches.findIndex(b => b.id === expandedBatch) + 1})
                              </h4>
                              <div className="text-sm text-green-700 dark:text-green-300 mb-3">
                                This batch will be processed for hyperlink creation based on the index from Batch 1.
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" className="text-green-700 border-green-300">
                                  🔍 Scan for Links
                                </Button>
                                <Button size="sm" variant="outline" className="text-green-700 border-green-300">
                                  ⚡ Generate Hyperlinks
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No OCR data available for this batch
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Legacy Document OCR Card - Hidden in new design */}
      {batches.length === 0 && processingDoc && (
        <DocumentOCRCard 
          key={processingDoc.id}
          document={processingDoc}
          caseId={caseId}
        />
      )}

      {/* Complete Workflow Button */}
      {allOCRComplete && (
        <Card className="mb-6 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-bold text-green-900 dark:text-green-100 mb-3">
              ✅ Document Processing Complete
            </h2>
            <p className="text-green-700 dark:text-green-300 mb-4">
              All OCR processing, index identification, and hyperlink generation are complete. 
              Your document is ready for final review and export.
            </p>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={onOCRComplete}
              data-testid="button-complete-processing"
            >
              Complete & Export Document
              <i className="fas fa-arrow-right ml-2"></i>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Information Panel */}
      <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <i className="fas fa-info-circle text-blue-500 mt-1"></i>
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                Document Processing Hub - New Consolidated Workflow
              </h4>
              <div className="text-sm text-blue-700 dark:text-blue-200 space-y-1">
                <p>• <strong>Batch 1:</strong> Contains the document index - use for index identification</p>
                <p>• <strong>Other Batches:</strong> Document content - use for hyperlink generation</p>
                <p>• <strong>Click any batch</strong> to expand and view OCR text page-by-page</p>
                <p>• <strong>All-in-one workflow:</strong> OCR, index identification, and hyperlinks in one place</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}