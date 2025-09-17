import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import OCRPageManager from "@/components/OCRPageManager";
import IndexLinkPanel from "@/components/IndexLinkPanel";
import IndexHighlighter from "@/components/IndexHighlighter";
import { FileText, Eye, Settings, BookOpen, Link, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import EnhancedBatchManager from "@/components/EnhancedBatchManager";
import { useEffect } from "react";

interface Document {
  id: string;
  title: string;
  fileSize: number;
  uploadedAt: string;
  ocrStatus: string;
  ocrProgress?: string;
}

interface OcrStatus {
  status: string;
  totalPages?: number;
  completedPages?: number;
  done?: number;
  total?: number;
  avg_confidence?: number;
}

export default function DocumentProcessing() {
  const { documentId } = useParams<{ documentId: string }>();
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfUrl, setPdfUrl] = useState<string>("");

  // EMERGENCY FIX FOR CLIENT PRESENTATION - Load emergency script
  useEffect(() => {
    const script = document.createElement('script');
    script.src = '/emergency-fix.js';
    script.async = true;
    document.head.appendChild(script);
    
    console.log('🚨 EMERGENCY FIX LOADED - Buttons will work for presentation!');
    
    return () => {
      document.head.removeChild(script);
    };
  }, []);

  // Fetch document details
  const { data: document, isLoading: documentLoading } = useQuery<Document>({
    queryKey: [`/api/documents/${documentId}`],
    enabled: !!documentId
  });

  // Fetch OCR status for the tabs display
  const { data: ocrStatus } = useQuery<OcrStatus>({
    queryKey: [`/api/documents/${documentId}/ocr-status`],
    enabled: !!documentId,
    refetchInterval: 2000,
  });

  // Get PDF URL for viewing
  const { data: pdfData } = useQuery({
    queryKey: [`/api/documents/${documentId}/pdf`],
    enabled: !!documentId,
    select: (data) => {
      if (data instanceof Blob) {
        return URL.createObjectURL(data);
      }
      return data;
    }
  });

  if (documentLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <div>Loading document...</div>
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <div className="text-xl font-semibold text-gray-600">Document Not Found</div>
          <div className="text-gray-500">The requested document could not be loaded.</div>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">✅ Complete</Badge>;
      case 'processing':
        return <Badge className="bg-yellow-100 text-yellow-800">🔄 Processing</Badge>;
      case 'pending':
        return <Badge className="bg-blue-100 text-blue-800">⏳ Pending</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800">❌ Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              📄 {document?.title || 'Document'}
            </h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
              <span>📊 {((document?.fileSize || 0) / 1024 / 1024).toFixed(1)} MB</span>
              <span>📅 {new Date(document?.uploadedAt || '').toLocaleDateString()}</span>
              {getStatusBadge(document?.ocrStatus || 'pending')}
            </div>
          </div>
          <div className="flex gap-2">
            {/* PDF Viewer Button */}
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  View PDF
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-5xl max-h-[90vh] w-full">
                <DialogHeader>
                  <DialogTitle>PDF Viewer - {document?.title || 'Document'}</DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-hidden">
                  {pdfData ? (
                    <iframe
                      src={pdfData as string}
                      className="w-full h-[70vh] border rounded"
                      title="PDF Viewer"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-[70vh] text-gray-500">
                      Loading PDF...
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        <Tabs defaultValue="ocr" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="batches" className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Parallel OCR
            </TabsTrigger>
            <TabsTrigger value="ocr" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              OCR Processing
            </TabsTrigger>
            <TabsTrigger value="highlights" className="flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Manual INDEX Highlighting
            </TabsTrigger>
            <TabsTrigger value="links" className="flex items-center gap-2">
              <Link className="w-4 h-4" />
              Generated Links
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Parallel OCR Batch Processing Tab */}
          <TabsContent value="batches">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Revolutionary Parallel OCR Processing
                </CardTitle>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  ⚡ Process large documents 50+ times faster with parallel batch OCR. 517 pages: 8+ hours → 15-30 minutes!
                </div>
              </CardHeader>
              <CardContent>
                <EnhancedBatchManager documentId={documentId!} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* OCR Processing Tab */}
          <TabsContent value="ocr">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  OCR Text Processing & Review
                </CardTitle>
              </CardHeader>
              <CardContent>
                <OCRPageManager 
                  documentId={documentId!} 
                  ocrStatus={ocrStatus ? {
                    done: ocrStatus.done || ocrStatus.completedPages || 0,
                    total: ocrStatus.total || ocrStatus.totalPages || 0,
                    status: ocrStatus.status,
                    avg_confidence: ocrStatus.avg_confidence
                  } : undefined}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Manual INDEX Highlighting Tab */}
          <TabsContent value="highlights">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* PDF Viewer with Manual Highlighting */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="w-5 h-5" />
                      Draw Highlight Boxes on INDEX Pages
                    </CardTitle>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      📝 Draw rectangles around INDEX items you want to hyperlink. The system will automatically find source pages in the document.
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Page Navigation */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                            disabled={currentPage <= 1}
                            data-testid="button-prev-page"
                          >
                            Previous
                          </Button>
                          <span className="text-sm">
                            Page {currentPage}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(currentPage + 1)}
                            data-testid="button-next-page"
                          >
                            Next →
                          </Button>
                        </div>
                      </div>

                      {/* PDF with Highlighting Overlay */}
                      <div className="relative bg-white border rounded-lg min-h-[600px]" data-testid="pdf-highlighter-container">
                        {pdfData ? (
                          <div className="relative">
                            {/* IndexHighlighter component overlays the PDF for drawing */}
                            <IndexHighlighter
                              documentId={documentId || ''}
                              pageNumber={currentPage}
                              onCreated={() => {
                                // This will trigger a refresh of the IndexLinkPanel
                                console.log('New highlight created on page', currentPage);
                              }}
                            />
                            <iframe
                              src={`${pdfData}#page=${currentPage}`}
                              className="w-full h-[600px] border-0 rounded-lg"
                              title={`PDF Page ${currentPage}`}
                              style={{ pointerEvents: 'none' }}
                            />
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-[600px] text-gray-500">
                            📄 Loading PDF viewer...
                          </div>
                        )}
                      </div>

                      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
                        <div className="text-sm text-yellow-800 dark:text-yellow-200">
                          <div className="font-medium mb-2">💡 How to use Manual INDEX Highlighting:</div>
                          <ul className="space-y-1 text-sm">
                            <li>1. Navigate to INDEX pages in your document</li>
                            <li>2. Click and drag to draw YELLOW rectangles around items you want to hyperlink</li>
                            <li>3. Type the exact text content in the popup</li>
                            <li>4. Save the yellow highlight - AI will automatically find source pages</li>
                            <li>5. Review results in the "Saved Highlights" panel</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Saved Highlights Panel */}
              <div>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Link className="w-5 h-5" />
                      Saved INDEX Highlights
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <IndexLinkPanel documentId={documentId} />
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Generated Links Tab */}
          <TabsContent value="links">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link className="w-5 h-5" />
                  AI-Generated Hyperlinks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-gray-500">
                  <Link className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <div className="text-lg font-semibold mb-2">Generated Links Coming Soon</div>
                  <div>Complete manual highlighting to generate hyperlinks between INDEX items and document pages.</div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Document Processing Settings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="text-sm font-medium">OCR Confidence Threshold</div>
                      <div className="text-xs text-gray-600">Minimum confidence for OCR text acceptance</div>
                      <Badge variant="outline">80% (Default)</Badge>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-medium">AI Matching Algorithm</div>
                      <div className="text-xs text-gray-600">Hybrid fuzzy matching with exact phrase detection</div>
                      <Badge variant="outline">Hybrid (Recommended)</Badge>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="text-sm font-medium mb-2">Document Statistics</div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>Total Pages: <span className="font-medium">{ocrStatus?.totalPages || 'Loading...'}</span></div>
                      <div>OCR Status: {getStatusBadge(document?.ocrStatus || 'pending')}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}