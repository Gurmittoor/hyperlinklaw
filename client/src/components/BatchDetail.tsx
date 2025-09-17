import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { 
  RefreshCw, 
  Edit3, 
  Save, 
  X, 
  AlertTriangle, 
  FileText,
  Eye,
  EyeOff,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface BatchDetailProps {
  batchId: string;
  documentId: string;
  batchNumber: number;
  startPage: number;
  endPage: number;
  onClose: () => void;
}

interface OcrPage {
  id: string;
  pageNumber: number;
  extractedText: string;
  confidence: number;
  ocrEngine: string;
  createdAt: string;
  correctedText?: string;
  isCorrected: boolean;
  correctedBy?: string;
  correctedAt?: string;
}

export default function BatchDetail({ 
  batchId, 
  documentId, 
  batchNumber, 
  startPage, 
  endPage, 
  onClose 
}: BatchDetailProps) {
  const { toast } = useToast();
  const [editingPage, setEditingPage] = useState<number | null>(null);
  const [editedText, setEditedText] = useState("");
  const [expandedPage, setExpandedPage] = useState<number | null>(null);

  // Fetch OCR pages for this batch
  const { data: pagesData, isLoading } = useQuery<{ success: boolean; pages: OcrPage[] }>({
    queryKey: [`/api/documents/${documentId}/batches/${batchId}/pages`],
    enabled: !!batchId && !!documentId
  });

  const pages = pagesData?.pages || [];
  const totalPages = endPage - startPage + 1;
  const pagesWithData = pages.length;
  const missingPages = totalPages - pagesWithData;

  // Re-OCR individual page mutation
  const reOcrPage = useMutation({
    mutationFn: async (pageNumber: number) => {
      const response = await fetch(`/api/documents/${documentId}/pages/${pageNumber}/re-ocr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ engine: 'vision' })
      });
      if (!response.ok) throw new Error('Failed to re-OCR page');
      return response.json();
    },
    onSuccess: (_, pageNumber) => {
      toast({
        title: "Re-OCR Complete",
        description: `Page ${pageNumber} has been re-processed with Google Cloud Vision`,
      });
      queryClient.invalidateQueries({ 
        queryKey: [`/api/documents/${documentId}/batches/${batchId}/pages`] 
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Re-OCR Failed",
        description: error instanceof Error ? error.message : "Failed to re-OCR page",
      });
    }
  });

  // Save manual edit mutation
  const saveEdit = useMutation({
    mutationFn: async ({ pageNumber, text }: { pageNumber: number; text: string }) => {
      const response = await fetch(`/api/documents/${documentId}/pages/${pageNumber}/edit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ correctedText: text })
      });
      if (!response.ok) throw new Error('Failed to save manual edit');
      return response.json();
    },
    onSuccess: (_, { pageNumber }) => {
      toast({
        title: "Text Updated",
        description: `Page ${pageNumber} text has been manually updated`,
      });
      setEditingPage(null);
      setEditedText("");
      queryClient.invalidateQueries({ 
        queryKey: [`/api/documents/${documentId}/batches/${batchId}/pages`] 
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive", 
        title: "Save Failed",
        description: error instanceof Error ? error.message : "Failed to save manual edit",
      });
    }
  });

  const handleStartEdit = (page: OcrPage) => {
    setEditingPage(page.pageNumber);
    setEditedText(page.correctedText || page.extractedText || "");
  };

  const handleSaveEdit = () => {
    if (editingPage) {
      saveEdit.mutate({ pageNumber: editingPage, text: editedText });
    }
  };

  const handleCancelEdit = () => {
    setEditingPage(null);
    setEditedText("");
  };

  const togglePageExpansion = (pageNumber: number) => {
    setExpandedPage(expandedPage === pageNumber ? null : pageNumber);
  };

  const getPageData = (pageNumber: number) => {
    return pages.find(p => p.pageNumber === pageNumber);
  };

  const getPageStatus = (pageNumber: number) => {
    const pageData = getPageData(pageNumber);
    if (!pageData) return "missing";
    if (pageData.isCorreected) return "edited";
    if (pageData.confidence < 0.7) return "low-confidence";
    return "good";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "missing":
        return <Badge variant="destructive" className="flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />Missing
        </Badge>;
      case "edited":
        return <Badge variant="default" className="bg-green-600 flex items-center gap-1">
          <Edit3 className="w-3 h-3" />Edited
        </Badge>;
      case "low-confidence":
        return <Badge variant="secondary" className="bg-yellow-500 text-yellow-900 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />Low Quality
        </Badge>;
      case "good":
        return <Badge variant="default" className="bg-blue-500 flex items-center gap-1">
          <FileText className="w-3 h-3" />Good
        </Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <Card className="w-full max-w-4xl m-4">
          <CardContent className="p-6">
            <div className="flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin mr-2" />
              Loading batch pages...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-6xl h-full max-h-[90vh] flex flex-col">
        <CardHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-3">
              <FileText className="w-5 h-5" />
              Batch {batchNumber} - Pages {startPage}-{endPage}
              <div className="flex gap-2">
                <Badge variant="outline">{pagesWithData}/{totalPages} pages</Badge>
                {missingPages > 0 && (
                  <Badge variant="destructive">{missingPages} missing</Badge>
                )}
              </div>
            </CardTitle>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => alert(`Re-OCR entire batch ${startPage}-${endPage} with fast processing`)}
                className="bg-orange-500 hover:bg-orange-600 text-white"
                data-testid="button-re-ocr-batch"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Re-OCR Batch
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onClose}
                data-testid="button-close-batch-detail"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="flex-1 overflow-y-auto space-y-4">
          {Array.from({ length: totalPages }, (_, i) => {
            const pageNumber = startPage + i;
            const pageData = getPageData(pageNumber);
            const status = getPageStatus(pageNumber);
            const isExpanded = expandedPage === pageNumber;
            const isEditing = editingPage === pageNumber;
            
            return (
              <Card key={pageNumber} className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">Page {pageNumber}</span>
                      {getStatusBadge(status)}
                      {pageData && (
                        <Badge variant="outline" className="text-xs">
                          {pageData.ocrEngine} • {Math.round((pageData.confidence || 0) * 100)}%
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {pageData && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => togglePageExpansion(pageNumber)}
                          data-testid={`button-toggle-page-${pageNumber}`}
                        >
                          {isExpanded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          {isExpanded ? "Hide" : "View"}
                        </Button>
                      )}
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => reOcrPage.mutate(pageNumber)}
                        disabled={reOcrPage.isPending}
                        data-testid={`button-reocr-page-${pageNumber}`}
                      >
                        {reOcrPage.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                        Re-OCR
                      </Button>
                      
                      {pageData && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStartEdit(pageData)}
                          disabled={isEditing}
                          data-testid={`button-edit-page-${pageNumber}`}
                        >
                          <Edit3 className="w-4 h-4" />
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {/* OCR Text Display/Edit */}
                  {isExpanded && (
                    <div className="mt-4">
                      {isEditing ? (
                        <div className="space-y-3">
                          <Textarea
                            value={editedText}
                            onChange={(e) => setEditedText(e.target.value)}
                            rows={10}
                            className="font-mono text-sm"
                            placeholder="Enter or edit the OCR text for this page..."
                            data-testid={`textarea-edit-page-${pageNumber}`}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleCancelEdit}
                              data-testid={`button-cancel-edit-${pageNumber}`}
                            >
                              <X className="w-4 h-4 mr-1" />
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={handleSaveEdit}
                              disabled={saveEdit.isPending}
                              data-testid={`button-save-edit-${pageNumber}`}
                            >
                              {saveEdit.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                              ) : (
                                <Save className="w-4 h-4 mr-1" />
                              )}
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : pageData ? (
                        <div className="bg-gray-50 p-4 rounded border font-mono text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                          {pageData.correctedText || pageData.extractedText || "No text extracted"}
                        </div>
                      ) : (
                        <div className="bg-red-50 p-4 rounded border text-red-700">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5" />
                            <span>No OCR data found for this page</span>
                          </div>
                          <p className="text-sm mt-2">
                            This page was not processed during the initial OCR run. 
                            Click "Re-OCR" to process it with Google Cloud Vision.
                          </p>
                        </div>
                      )}
                      
                      {pageData?.correctedAt && (
                        <div className="text-xs text-gray-500 mt-2">
                          Last edited: {new Date(pageData.correctedAt).toLocaleString()}
                          {pageData.correctedBy && ` by ${pageData.correctedBy}`}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}