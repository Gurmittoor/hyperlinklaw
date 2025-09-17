import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import OcrPageEditor from './OcrPageEditor';
import { 
  FileText, 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  Eye,
  Edit,
  Trash2,
  Upload,
  BarChart3,
  List,
  AlertCircle,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';

// Collapsible Page Content Component
const PageContent = ({ page }: { page: OCRPage }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showFullText, setShowFullText] = useState(false);
  
  const textPreview = page.extractedText?.substring(0, 200) || '';
  const hasMoreContent = page.extractedText && page.extractedText.length > 200;
  
  return (
    <div className="mt-3 border-t pt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500">
          {page.extractedText?.length || 0} characters extracted
        </span>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
          data-testid={`button-expand-content-${page.pageNumber}`}
        >
          {isExpanded ? 'Collapse' : 'Expand'} Content
          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>
      
      {isExpanded && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded p-3">
          <div className="text-sm font-mono whitespace-pre-wrap max-h-96 overflow-y-auto" data-testid={`text-full-content-${page.pageNumber}`}>
            {showFullText || !hasMoreContent ? (
              page.extractedText || 'No text extracted'
            ) : (
              <>
                {textPreview}
                {hasMoreContent && '...'}
              </>
            )}
          </div>
          
          {hasMoreContent && (
            <button
              onClick={() => setShowFullText(!showFullText)}
              className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
              data-testid={`button-show-all-${page.pageNumber}`}
            >
              {showFullText ? 'Show Less' : `Show All (${page.extractedText?.length} chars)`}
            </button>
          )}
        </div>
      )}
      
      {!isExpanded && (
        <div className="text-sm text-gray-600 bg-gray-50 dark:bg-gray-800 rounded p-2">
          {textPreview}
          {hasMoreContent && <span className="text-blue-600 ml-1">... (click Expand to see more)</span>}
        </div>
      )}
    </div>
  );
};

interface OCRPage {
  id: string;
  documentId: string;
  pageNumber: number;
  extractedText: string;
  confidence: number;
  processingTime: number | null;
  createdAt: string;
  updatedAt: string;
}

interface OCRPageManagerProps {
  documentId: string;
  ocrStatus?: {
    done: number;
    total: number;
    status: string;
    avg_confidence?: number;
  };
}

interface OCRAnalysisResult {
  indexItems: Array<{
    text: string;
    page: number;
    confidence: number;
  }>;
  analyzed_pages: number;
}

export default function OCRPageManager({ documentId, ocrStatus }: OCRPageManagerProps) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [confidenceFilter, setConfidenceFilter] = useState('all');
  const [selectedPage, setSelectedPage] = useState<OCRPage | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);

  // Fetch OCR pages
  const { data: ocrPages = [], isLoading, refetch } = useQuery<OCRPage[]>({
    queryKey: [`/api/documents/${documentId}/ocr-pages`],
    refetchInterval: 5000, // Refresh every 5 seconds to show new pages
  });

  // Search OCR pages
  const { data: searchResults = [] } = useQuery<OCRPage[]>({
    queryKey: [`/api/documents/${documentId}/ocr-pages/search`, searchTerm],
    enabled: searchTerm.length > 2,
  });

  // Index analysis
  const { data: analysisData, refetch: refetchAnalysis } = useQuery<OCRAnalysisResult>({
    queryKey: [`/api/documents/${documentId}/analyze-index`],
    enabled: false, // Only fetch when manually triggered
  });

  // Reprocess page mutation
  const reprocessMutation = useMutation({
    mutationFn: async (pageNumber: number) => {
      return await apiRequest('POST', `/api/documents/${documentId}/ocr-pages/${pageNumber}/reprocess`, {});
    },
    onSuccess: () => {
      toast({
        title: "Page Reprocessed",
        description: "The page has been reprocessed successfully.",
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: [`/api/documents/${documentId}/ocr-status`] });
    },
    onError: (error) => {
      toast({
        title: "Reprocessing Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Filter pages based on search and confidence
  const displayPages = searchTerm.length > 2 ? searchResults : ocrPages;
  const filteredPages = displayPages.filter(page => {
    if (confidenceFilter === 'high') return (page.confidence || 0) >= 0.8;
    if (confidenceFilter === 'medium') return (page.confidence || 0) >= 0.6 && (page.confidence || 0) < 0.8;
    if (confidenceFilter === 'low') return (page.confidence || 0) < 0.6;
    return true;
  });

  const getConfidenceBadge = (confidence: number) => {
    const percent = Math.round(confidence * 100);
    if (confidence >= 0.8) return <Badge className="bg-green-100 text-green-800" data-testid={`badge-confidence-high`}>{percent}%</Badge>;
    if (confidence >= 0.6) return <Badge className="bg-yellow-100 text-yellow-800" data-testid={`badge-confidence-medium`}>{percent}%</Badge>;
    return <Badge className="bg-red-100 text-red-800" data-testid={`badge-confidence-low`}>{percent}%</Badge>;
  };

  const handleExtractText = async () => {
    try {
      const response = await fetch(`/api/documents/${documentId}/extract-text`);
      if (!response.ok) throw new Error('Failed to extract text');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `document-${documentId}-extracted-text.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Text Extracted",
        description: "Complete document text has been downloaded.",
      });
    } catch (error) {
      toast({
        title: "Extraction Failed",
        description: "Failed to extract document text.",
        variant: "destructive",
      });
    }
  };

  const handleAnalyzeIndex = async () => {
    try {
      await refetchAnalysis();
      setShowAnalysis(true);
      toast({
        title: "Index Analysis Complete",
        description: "Document index has been analyzed.",
      });
    } catch (error) {
      toast({
        title: "Analysis Failed", 
        description: "Failed to analyze document index.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6" data-testid="ocr-page-manager">
      {/* Action Buttons Bar - Exact match to your image */}
      <div className="bg-gray-800 p-4 rounded-lg">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => window.open(`/api/documents/${documentId}/download`, '_blank')}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium transition-colors"
            data-testid="button-open"
          >
            <Eye className="w-4 h-4" />
            Open
          </button>
          
          <button
            onClick={() => setShowAnalysis(!showAnalysis)}
            className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded font-medium transition-colors"
            data-testid="button-edit"
          >
            <Edit className="w-4 h-4" />
            Edit
          </button>
          
          <button
            onClick={() => confirm('Are you sure you want to delete this document?') && alert('Delete functionality would be implemented here')}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded font-medium transition-colors"
            data-testid="button-delete"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
          
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded font-medium transition-colors"
            data-testid="button-reload"
          >
            <RefreshCw className="w-4 h-4" />
            Reload
          </button>
          
          <button
            onClick={handleExtractText}
            disabled={filteredPages.length === 0}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-medium transition-colors disabled:bg-gray-500"
            data-testid="button-extract-text"
          >
            <FileText className="w-4 h-4" />
            Extract Text
          </button>
          
          <button
            onClick={() => alert('Re-OCR all batches with fast processing')}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded font-medium transition-colors"
            data-testid="button-re-ocr-all"
          >
            <RefreshCw className="w-4 h-4" />
            Re-OCR All
          </button>
          
          <button
            onClick={() => alert('Smart Process functionality would analyze document structure')}
            disabled={filteredPages.length === 0}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded font-medium transition-colors disabled:bg-gray-500"
            data-testid="button-smart-process"
          >
            <BarChart3 className="w-4 h-4" />
            Smart Process
          </button>
          
          <button
            onClick={handleAnalyzeIndex}
            disabled={filteredPages.length === 0}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-medium transition-colors disabled:bg-gray-500"
            data-testid="button-analyze-index"
          >
            <List className="w-4 h-4" />
            Analyze Index
          </button>
          
          <button
            onClick={() => setShowAnalysis(true)}
            disabled={filteredPages.length === 0}
            className="flex items-center gap-2 bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded font-medium transition-colors disabled:bg-gray-500"
            data-testid="button-visual-review"
          >
            <Search className="w-4 h-4" />
            Visual Review
          </button>
        </div>
      </div>

      {/* Search and Filter Controls */}
      <div className="flex gap-4 items-center">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search through OCR text..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="input-search-ocr"
          />
        </div>
        <Select value={confidenceFilter} onValueChange={setConfidenceFilter}>
          <SelectTrigger className="w-48" data-testid="select-confidence-filter">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Filter by confidence" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Confidence</SelectItem>
            <SelectItem value="high">High (≥80%)</SelectItem>
            <SelectItem value="medium">Medium (60-79%)</SelectItem>
            <SelectItem value="low">Low (&lt;60%)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Pages Count and Status */}
      <div className="text-sm text-gray-600 dark:text-gray-400" data-testid="text-pages-count">
        {filteredPages.length} of {ocrPages.length} pages 
        {searchTerm && ` (${searchResults.length} search results)`}
      </div>

      {/* OCR Pages List */}
      <div className="space-y-3" data-testid="list-ocr-pages">
        {isLoading ? (
          <div className="text-center py-8" data-testid="loading-ocr-pages">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
            Loading OCR pages...
          </div>
        ) : filteredPages.length === 0 ? (
          <div className="text-center py-8 text-gray-500" data-testid="no-ocr-pages">
            {searchTerm ? 'No pages found matching your search.' : 'No OCR pages available yet.'}
          </div>
        ) : (
          filteredPages.map((page) => (
            <Card key={page.id} className="cursor-pointer hover:shadow-md transition-shadow" data-testid={`card-page-${page.pageNumber}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Page {page.pageNumber}
                    {getConfidenceBadge(page.confidence || 0)}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" onClick={() => setSelectedPage(page)} data-testid={`button-view-page-${page.pageNumber}`}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Page {page.pageNumber} - {Math.round((page.confidence || 0) * 100)}% Confidence</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="text-sm text-gray-600">
                            <strong>Characters:</strong> {page.extractedText?.length || 0} | 
                            <strong> Processing Time:</strong> {page.processingTime || 0}ms
                          </div>
                          <OcrPageEditor 
                            documentId={documentId}
                            page={page.pageNumber}
                            onSave={() => {
                              // Refresh the page data after saving
                              refetch();
                            }}
                          />
                          <div className="flex gap-2">
                            <Button 
                              onClick={() => reprocessMutation.mutate(page.pageNumber)}
                              disabled={reprocessMutation.isPending}
                              data-testid={`button-reprocess-page-${page.pageNumber}`}
                            >
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Re-OCR
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => reprocessMutation.mutate(page.pageNumber)}
                      disabled={reprocessMutation.isPending}
                      data-testid={`button-reprocess-inline-${page.pageNumber}`}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-gray-600 mb-2" data-testid={`text-page-stats-${page.pageNumber}`}>
                  {page.processingTime && `Processing time: ${page.processingTime}ms`}
                </div>
                <PageContent page={page} />
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Index Analysis Dialog */}
      <Dialog open={showAnalysis} onOpenChange={setShowAnalysis}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Document Index Analysis</DialogTitle>
          </DialogHeader>
          {analysisData && (
            <div className="space-y-4">
              <div className="text-sm text-gray-600" data-testid="text-analysis-summary">
                Found {analysisData.indexItems.length} potential index items from {analysisData.analyzed_pages} pages
              </div>
              <div className="space-y-2" data-testid="list-index-items">
                {analysisData.indexItems.map((item, index) => (
                  <div key={index} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800 rounded" data-testid={`item-index-${index}`}>
                    <span className="font-mono text-sm">{item.text}</span>
                    <div className="flex gap-2 items-center">
                      <Badge variant="outline" data-testid={`badge-page-${index}`}>Page {item.page}</Badge>
                      {getConfidenceBadge(item.confidence || 0)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}