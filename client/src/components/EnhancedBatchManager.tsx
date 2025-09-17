import React, { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { ChevronLeft, ChevronRight, RefreshCw, Edit3, Save, Eye, Highlighter, Plus, Search } from 'lucide-react';

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

interface PageOcrData {
  pageNumber: number;
  extractedText: string;
  confidence: number;
  boundingBoxes?: any[];
}

interface Document {
  id: string;
  title: string;
  pageCount: number;
  totalPages: number;
  ocrStatus: string;
}

interface HighlightedText {
  id: string;
  text: string;
  startIndex: number;
  endIndex: number;
  pageNumber: number;
  type: 'index-item' | 'potential-hyperlink' | 'tab' | 'exhibit';
  confidence?: number;
}

interface EnhancedBatchManagerProps {
  documentId: string;
}

const EnhancedBatchManager = ({ documentId }: EnhancedBatchManagerProps) => {
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [currentPages, setCurrentPages] = useState<Record<string, number>>({});
  const [editingPages, setEditingPages] = useState<Record<string, boolean>>({});
  const [editedTexts, setEditedTexts] = useState<Record<string, string>>({});
  const [ocrData, setOcrData] = useState<Record<string, PageOcrData[]>>({});
  const [highlights, setHighlights] = useState<Record<string, HighlightedText[]>>({});
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const textAreaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  // Fetch document details
  const { data: document } = useQuery<Document>({
    queryKey: [`/api/documents/${documentId}`],
    enabled: !!documentId
  });

  // Fetch batches with real-time updates
  const { data: batchesData, isLoading } = useQuery<{ success: boolean; batches: OcrBatch[] }>({
    queryKey: [`/api/documents/${documentId}/batches`],
    refetchInterval: 1000, // Faster updates for real-time monitoring
    enabled: !!documentId
  });

  const batches = batchesData?.batches || [];
  const pageCount = document?.pageCount || document?.totalPages || 0;
  const completedBatches = batches.filter(b => b.status === 'completed').length;
  const totalBatches = batches.length;

  // Re-OCR mutation for individual batches
  const reOcrBatch = useMutation({
    mutationFn: async (batchId: string) => {
      console.log('🔄 Re-OCR button clicked for batch:', batchId);
      const batch = batches.find(b => b.id === batchId);
      console.log(`🔄 Re-OCRing batch with pages ${batch?.startPage}-${batch?.endPage}`);
      
      const response = await fetch(`/api/documents/${documentId}/batches/${batchId}/reocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        const error = await response.text();
        console.error('❌ Re-OCR failed:', error);
        throw new Error(`Failed to re-OCR batch: ${response.status} ${error}`);
      }
      
      const result = await response.json();
      console.log('✅ Re-OCR started successfully:', result);
      return result;
    },
    onSuccess: () => {
      console.log('🔄 Re-OCR initiated, refreshing batch data...');
      queryClient.invalidateQueries({ queryKey: [`/api/documents/${documentId}/batches`] });
    },
    onError: (error) => {
      console.error('❌ Re-OCR mutation failed:', error);
      alert(`Re-OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Save edited text mutation
  const saveEditedText = useMutation({
    mutationFn: async ({ batchId, pageNumber, text }: { batchId: string; pageNumber: number; text: string }) => {
      const response = await fetch(`/api/documents/${documentId}/batches/${batchId}/pages/${pageNumber}/text`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extractedText: text })
      });
      if (!response.ok) throw new Error('Failed to save text');
      return response.json();
    },
    onSuccess: (_, { batchId }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/documents/${documentId}/batches/${batchId}/ocr`] });
    }
  });

  // Toggle batch expansion and load OCR data
  const toggleBatch = async (batchId: string) => {
    console.log('🔍 View batch clicked for:', batchId);
    
    if (expandedBatch === batchId) {
      console.log('🔽 Collapsing batch');
      setExpandedBatch(null);
    } else {
      console.log('🔼 Expanding batch, loading OCR data...');
      setExpandedBatch(batchId);
      const batch = batches.find(b => b.id === batchId);
      if (batch && !currentPages[batchId]) {
        setCurrentPages(prev => ({ ...prev, [batchId]: batch.startPage }));
      }
      
      // Load OCR data for this batch
      if (!ocrData[batchId]) {
        try {
          console.log(`📡 Fetching OCR data: /api/documents/${documentId}/batches/${batchId}/ocr`);
          const response = await fetch(`/api/documents/${documentId}/batches/${batchId}/ocr`);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const data = await response.json();
          console.log('✅ OCR data loaded:', data.pages?.length || 0, 'pages');
          setOcrData(prev => ({ ...prev, [batchId]: data.pages || [] }));
        } catch (error) {
          console.error('❌ Error loading OCR data:', error);
          alert(`Failed to load OCR data: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }
  };

  // Navigate between pages
  const navigatePage = (batchId: string, direction: 'next' | 'prev') => {
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;
    
    const currentPage = currentPages[batchId] || batch.startPage;
    if (direction === 'next' && currentPage < batch.endPage) {
      setCurrentPages(prev => ({ ...prev, [batchId]: currentPage + 1 }));
    } else if (direction === 'prev' && currentPage > batch.startPage) {
      setCurrentPages(prev => ({ ...prev, [batchId]: currentPage - 1 }));
    }
  };

  // Get current page OCR data
  const getCurrentPageData = (batchId: string) => {
    const pages = ocrData[batchId];
    const currentPage = currentPages[batchId];
    if (!pages || !currentPage) return null;
    return pages.find(p => p.pageNumber === currentPage);
  };

  // Handle text selection for highlighting
  const handleTextSelection = useCallback((batchId: string) => {
    const textArea = textAreaRefs.current[batchId];
    if (!textArea) return;

    const start = textArea.selectionStart;
    const end = textArea.selectionEnd;
    const text = textArea.value.substring(start, end);

    if (text.trim()) {
      setSelectedText(text);
      setSelectionRange({ start, end });
    }
  }, []);

  // Add highlighted text as index item
  const addHighlight = (batchId: string, type: HighlightedText['type']) => {
    if (!selectedText || !selectionRange) return;

    const currentPage = currentPages[batchId];
    const newHighlight: HighlightedText = {
      id: `${batchId}-${currentPage}-${Date.now()}`,
      text: selectedText,
      startIndex: selectionRange.start,
      endIndex: selectionRange.end,
      pageNumber: currentPage,
      type,
      confidence: 1.0 // Manual selection = 100% confidence
    };

    setHighlights(prev => ({
      ...prev,
      [batchId]: [...(prev[batchId] || []), newHighlight]
    }));

    setSelectedText('');
    setSelectionRange(null);
  };

  // Toggle editing mode
  const toggleEdit = (batchId: string) => {
    console.log('✏️ Edit button clicked for batch:', batchId);
    const isCurrentlyEditing = editingPages[batchId];
    console.log('Current editing state:', isCurrentlyEditing);
    
    if (!isCurrentlyEditing) {
      // Start editing - initialize text
      const currentPage = currentPages[batchId];
      const pageData = getCurrentPageData(batchId);
      const editKey = `${batchId}-${currentPage}`;
      setEditedTexts(prev => ({ 
        ...prev, 
        [editKey]: pageData?.extractedText || '' 
      }));
      console.log('🟢 Starting edit mode for page', currentPage);
    } else {
      console.log('🔴 Canceling edit mode');
    }
    
    setEditingPages(prev => ({ ...prev, [batchId]: !prev[batchId] }));
  };

  // Save edited text
  const handleSaveText = (batchId: string) => {
    const currentPage = currentPages[batchId];
    const editedText = editedTexts[`${batchId}-${currentPage}`];
    
    console.log('💾 Save button clicked for batch:', batchId, 'page:', currentPage);
    console.log('Text to save:', editedText?.substring(0, 100) + '...');
    
    if (editedText !== undefined && currentPage) {
      saveEditedText.mutate({ batchId, pageNumber: currentPage, text: editedText });
      setEditingPages(prev => ({ ...prev, [batchId]: false }));
    } else {
      console.error('❌ Missing data - currentPage:', currentPage, 'editedText:', !!editedText);
    }
  };

  // Get display text (edited or original)
  const getDisplayText = (batchId: string) => {
    const currentPage = currentPages[batchId];
    const pageData = getCurrentPageData(batchId);
    const editKey = `${batchId}-${currentPage}`;
    
    if (editedTexts[editKey] !== undefined) {
      return editedTexts[editKey];
    }
    
    return pageData?.extractedText || 'Loading OCR text...';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mr-3"></div>
        Loading batches...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* OCR Progress Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>📋 Enhanced OCR Processing</span>
            <Badge variant={totalBatches === completedBatches ? "default" : "secondary"}>
              {completedBatches}/{totalBatches} Batches Complete
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
              <div className="text-2xl font-bold text-blue-600">{pageCount}</div>
              <div className="text-sm text-gray-600">Total Pages</div>
            </div>
            <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded">
              <div className="text-2xl font-bold text-green-600">{completedBatches}</div>
              <div className="text-sm text-gray-600">Completed Batches</div>
            </div>
            <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded">
              <div className="text-2xl font-bold text-orange-600">
                {batches.filter(b => b.status === 'processing').length}
              </div>
              <div className="text-sm text-gray-600">Processing</div>
            </div>
            <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded">
              <div className="text-2xl font-bold text-purple-600">
                {Object.values(highlights).flat().length}
              </div>
              <div className="text-sm text-gray-600">Highlighted Items</div>
            </div>
          </div>
          
          <Progress value={(completedBatches / totalBatches) * 100} className="h-3" />
          <div className="text-center text-sm text-gray-600 mt-2">
            Overall Progress: {Math.round((completedBatches / totalBatches) * 100)}%
          </div>
        </CardContent>
      </Card>

      {/* Batch Display - ROWS NOT GRID */}
      <div className="space-y-3">
        {batches.map((batch, index) => (
          <Card key={batch.id} className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <CardTitle className="text-lg">📦 Batch {index + 1}</CardTitle>
                    <p className="text-sm text-gray-600">
                      Pages {batch.startPage}-{batch.endPage} ({batch.totalPages} pages)
                    </p>
                  </div>
                  <Badge variant={
                    batch.status === 'completed' ? 'default' :
                    batch.status === 'processing' ? 'secondary' :
                    batch.status === 'failed' ? 'destructive' : 'outline'
                  }>
                    {batch.status === 'completed' ? '✅ Complete' :
                     batch.status === 'processing' ? '🔄 Processing' :
                     batch.status === 'failed' ? '❌ Failed' : '⏳ Queued'}
                  </Badge>
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Re-OCR Button */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (confirm(`Re-OCR Batch ${index + 1} (Pages ${batch.startPage}-${batch.endPage})?\n\nThis will reprocess these pages with Google Cloud Vision API.`)) {
                        reOcrBatch.mutate(batch.id);
                      }
                    }}
                    disabled={reOcrBatch.isPending}
                    data-testid={`button-re-ocr-${index + 1}`}
                    className="bg-orange-500 hover:bg-orange-600 text-white border-orange-500"
                  >
                    <RefreshCw className={`w-4 h-4 mr-1 ${reOcrBatch.isPending ? 'animate-spin' : ''}`} />
                    {reOcrBatch.isPending ? 'Re-OCRing...' : 'Re-OCR'}
                  </Button>
                  
                  {/* View Button */}
                  <Button
                    size="sm"
                    onClick={() => toggleBatch(batch.id)}
                    data-testid={`button-view-batch-${index + 1}`}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    {expandedBatch === batch.id ? 'Hide' : 'View'}
                  </Button>
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="space-y-2">
                <Progress value={batch.progress} className="h-2" />
                <div className="flex justify-between text-xs text-gray-600">
                  <span>{batch.pagesDone}/{batch.totalPages} pages</span>
                  <span>{Math.round(batch.progress)}%</span>
                </div>
              </div>
            </CardHeader>

            {/* Expanded Content */}
            {expandedBatch === batch.id && (
              <CardContent className="pt-0">
                {/* Page Navigation */}
                <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigatePage(batch.id, 'prev')}
                    disabled={!currentPages[batch.id] || currentPages[batch.id] <= batch.startPage}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </Button>
                  
                  <div className="text-center">
                    <Badge variant="outline" className="text-lg px-4 py-1">
                      Page {currentPages[batch.id] || batch.startPage}
                    </Badge>
                    <p className="text-xs text-gray-600 mt-1">
                      of {batch.endPage} ({getCurrentPageData(batch.id)?.confidence ? 
                        `${Math.round(getCurrentPageData(batch.id)!.confidence * 100)}% confidence` : 
                        'Processing...'})
                    </p>
                  </div>
                  
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigatePage(batch.id, 'next')}
                    disabled={!currentPages[batch.id] || currentPages[batch.id] >= batch.endPage}
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>

                {/* OCR Text Display with Editing */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">OCR Text Content</h4>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleEdit(batch.id)}
                        data-testid={`button-edit-batch-${index + 1}`}
                      >
                        <Edit3 className="w-4 h-4 mr-1" />
                        {editingPages[batch.id] ? 'Cancel' : 'Edit'}
                      </Button>
                      
                      {editingPages[batch.id] && (
                        <Button
                          size="sm"
                          onClick={() => handleSaveText(batch.id)}
                          disabled={saveEditedText.isPending}
                          data-testid={`button-save-batch-${index + 1}`}
                        >
                          <Save className="w-4 h-4 mr-1" />
                          Save
                        </Button>
                      )}
                    </div>
                  </div>

                  <Textarea
                    ref={el => textAreaRefs.current[batch.id] = el}
                    value={getDisplayText(batch.id)}
                    onChange={(e) => {
                      const currentPage = currentPages[batch.id];
                      const editKey = `${batch.id}-${currentPage}`;
                      setEditedTexts(prev => ({ ...prev, [editKey]: e.target.value }));
                    }}
                    onSelect={() => handleTextSelection(batch.id)}
                    readOnly={!editingPages[batch.id]}
                    className={`min-h-[300px] font-mono text-sm ${
                      editingPages[batch.id] ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300' : ''
                    }`}
                    placeholder="OCR text will appear here..."
                  />

                  {/* Text Selection and Highlighting Tools */}
                  {selectedText && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200">
                      <p className="text-sm font-medium mb-2">Selected Text: "{selectedText.substring(0, 50)}..."</p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => addHighlight(batch.id, 'index-item')}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add Index Item
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => addHighlight(batch.id, 'tab')}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add Tab
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => addHighlight(batch.id, 'exhibit')}
                          className="bg-purple-600 hover:bg-purple-700"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add Exhibit
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => addHighlight(batch.id, 'potential-hyperlink')}
                          className="bg-orange-600 hover:bg-orange-700"
                        >
                          <Highlighter className="w-4 h-4 mr-1" />
                          Mark Hyperlink
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Highlighted Items Display */}
                  {highlights[batch.id] && highlights[batch.id].length > 0 && (
                    <div className="space-y-2">
                      <h5 className="font-medium text-sm">Highlighted Items ({highlights[batch.id].length})</h5>
                      <div className="grid gap-2">
                        {highlights[batch.id].map((highlight) => (
                          <div
                            key={highlight.id}
                            className={`p-2 rounded text-sm border-l-4 ${
                              highlight.type === 'index-item' ? 'border-l-green-500 bg-green-50 dark:bg-green-900/20' :
                              highlight.type === 'tab' ? 'border-l-blue-500 bg-blue-50 dark:bg-blue-900/20' :
                              highlight.type === 'exhibit' ? 'border-l-purple-500 bg-purple-50 dark:bg-purple-900/20' :
                              'border-l-orange-500 bg-orange-50 dark:bg-orange-900/20'
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <Badge variant="outline" className="text-xs mb-1">
                                  {highlight.type.replace('-', ' ').toUpperCase()}
                                </Badge>
                                <p className="font-medium">{highlight.text}</p>
                                <p className="text-xs text-gray-600">Page {highlight.pageNumber}</p>
                              </div>
                              <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700">
                                Remove
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Special Tools for Batch 1 (Index Identification) */}
                  {index === 0 && (
                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200">
                      <h4 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                        🎯 Index Identification (Batch 1)
                      </h4>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                        This is the document index. Select text to identify index items, tabs, and exhibits.
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="border-yellow-400">
                          <Search className="w-4 h-4 mr-1" />
                          Auto-Detect Index
                        </Button>
                        <Button size="sm" variant="outline" className="border-yellow-400">
                          <Highlighter className="w-4 h-4 mr-1" />
                          Highlight Mode
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Hyperlink Generation for Other Batches */}
                  {index > 0 && (
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded border border-green-200">
                      <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">
                        🔗 Hyperlink Generation (Batch {index + 1})
                      </h4>
                      <p className="text-sm text-green-700 dark:text-green-300 mb-3">
                        This batch will be processed for hyperlink creation based on the index from Batch 1.
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="border-green-400">
                          <Search className="w-4 h-4 mr-1" />
                          Find References
                        </Button>
                        <Button size="sm" variant="outline" className="border-green-400">
                          <Highlighter className="w-4 h-4 mr-1" />
                          Create Links
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {totalBatches === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <div className="text-gray-400 mb-4">📋</div>
            <h3 className="text-lg font-medium mb-2">No Batches Available</h3>
            <p className="text-gray-600">Upload a document to create batches for OCR processing</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default EnhancedBatchManager;