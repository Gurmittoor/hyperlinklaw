import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { FileText, List, CheckCircle, Edit3, Plus, RefreshCw, Trash2, AlertCircle, Loader2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface IndexItem {
  id: string;
  text: string;
  pageNumber: number;
  confidence: number;
  isManuallyEdited: boolean;
}

// Enhanced function with click-to-toggle highlighting functionality
const createInteractiveHighlighting = (
  text: string, 
  indexItems: IndexItem[], 
  manualHighlights: string[], 
  manualUnhighlights: string[],
  onToggleHighlight: (text: string, isHighlighted: boolean) => void
): string => {
  if (!text) return text.replace(/\n/g, '<br/>');
  
  let highlightedText = text;
  
  // First, highlight the INDEX section header (always highlighted, not clickable to remove)
  highlightedText = highlightedText.replace(
    /INDEX/g, 
    '<span style="background-color: #fef3c7; color: #92400e; font-weight: bold; padding: 2px 4px; border-radius: 3px;">INDEX</span>'
  );
  
  // Then process AI-detected index items (these can be clicked to unhighlight)
  indexItems.forEach((item, index) => {
    const itemNumber = index + 1;
    const patterns = [
      new RegExp(`${itemNumber}\\. ${item.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'),
      new RegExp(`${itemNumber}\\s*\\. ${item.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'),
      new RegExp(item.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    ];
    
    patterns.forEach(pattern => {
      highlightedText = highlightedText.replace(pattern, (match) => {
        const isUnhighlighted = manualUnhighlights.includes(match.trim());
        if (isUnhighlighted) {
          // Show as normal text but clickable to re-highlight
          return `<span 
            style="color: #6b7280; cursor: pointer; padding: 1px 2px; border: 1px dashed #6b7280; border-radius: 2px;" 
            onclick="window.toggleHighlight('${match.trim()}', false)" 
            title="Click to highlight: ${match.trim()}"
            data-testid="unhighlighted-text"
          >${match}</span>`;
        } else {
          // Show as highlighted and clickable to unhighlight  
          return `<span 
            style="background-color: #fef08a; color: #713f12; padding: 1px 2px; border-radius: 2px; font-weight: 500; cursor: pointer;" 
            onclick="window.toggleHighlight('${match.trim()}', true)" 
            title="Click to unhighlight: ${match.trim()}"
            data-testid="highlighted-text"
          >${match}</span>`;
        }
      });
    });
  });
  
  // Process manually highlighted parts (clickable to unhighlight)
  manualHighlights.forEach(highlight => {
    const pattern = new RegExp(highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    highlightedText = highlightedText.replace(pattern, (match) => 
      `<span 
        style="background-color: #a7f3d0; color: #065f46; padding: 1px 2px; border-radius: 2px; font-weight: 500; cursor: pointer; border: 1px solid #10b981;" 
        onclick="window.toggleHighlight('${match.trim()}', true)" 
        title="Manually highlighted - Click to remove: ${match.trim()}"
        data-testid="manual-highlighted-text"
      >${match}</span>`
    );
  });
  
  // Convert line breaks to HTML
  return highlightedText.replace(/\n/g, '<br/>');
};

interface PageOcrData {
  pageNumber: number;
  content: string;
  confidence: number;
  createdAt: string;
}

export default function IndexIdentificationPage(): JSX.Element {
  const [match, params] = useRoute('/cases/:caseId/index-identification');
  const caseId = params?.caseId;
  const { toast } = useToast();
  
  // Document Memory Cache - Stores data for each document separately
  const [documentCache, setDocumentCache] = useState<{[documentId: string]: {
    batch1Text: string;
    editedOcrText: string;
    indexItems: IndexItem[];
    showBatch1Text: boolean;
    isEditingOcr: boolean;
    selectedText: string;
    showManualHighlight: boolean;
    manualHighlights: string[];
    manualUnhighlights: string[];
  }}>({});

  const [indexItems, setIndexItems] = useState<IndexItem[]>([]);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [newItemText, setNewItemText] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [batch1Text, setBatch1Text] = useState<string>("");
  const [showBatch1Text, setShowBatch1Text] = useState(false);
  const [isEditingOcr, setIsEditingOcr] = useState(false);
  const [editedOcrText, setEditedOcrText] = useState<string>("");
  const [ocrChangesSaved, setOcrChangesSaved] = useState(false);
  const [selectedText, setSelectedText] = useState<string>("");
  const [showManualHighlight, setShowManualHighlight] = useState(false);
  const [manualHighlights, setManualHighlights] = useState<string[]>([]); // Manually highlighted text parts
  const [manualUnhighlights, setManualUnhighlights] = useState<string[]>([]); // Manually unhighlighted text parts
  
  // Page-by-page OCR display state
  const [pageOcrData, setPageOcrData] = useState<PageOcrData[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [reOcrLoading, setReOcrLoading] = useState<{[pageNumber: number]: boolean}>({});

  // Fetch case data
  const { data: caseData } = useQuery({
    queryKey: [`/api/cases/${caseId}`],
  });

  // Fetch documents for this case
  const { data: caseDocuments } = useQuery({
    queryKey: [`/api/cases/${caseId}/documents`],
  });

  // Auto-select first document when documents load
  useEffect(() => {
    if (caseDocuments && caseDocuments.length > 0 && !selectedDocumentId) {
      setSelectedDocumentId(caseDocuments[0].id);
    }
  }, [caseDocuments, selectedDocumentId]);

  // Load saved index items when document is selected
  useEffect(() => {
    if (selectedDocumentId) {
      // ALWAYS CLEAR when switching documents to prevent showing previous document data
      setBatch1Text("");
      setEditedOcrText("");  
      setIndexItems([]);
      setShowBatch1Text(false);
      setIsEditingOcr(false);
      setSelectedText("");
      setShowManualHighlight(false);
      setManualHighlights([]);
      setManualUnhighlights([]);
      console.log(`🔄 Document switched to: ${selectedDocumentId}, cleared all previous data`);
      
      // Load fresh data for this specific document
      loadSavedIndexItems(selectedDocumentId);
    }
  }, [selectedDocumentId]);

  const loadSavedIndexItems = async (documentId: string) => {
    try {
      const response = await fetch(`/api/documents/${documentId}/index-items`);
      const data = await response.json();
      
      if (data.success && data.indexItems && data.indexItems.length > 0) {
        setIndexItems(data.indexItems);
        console.log(`✅ Loaded ${data.indexItems.length} saved index items from database`);
      }
    } catch (error) {
      console.log(`❌ Could not load saved index items:`, error);
    }
  };

  // Save OCR corrections function
  const saveOcrCorrections = async () => {
    if (!selectedDocumentId || editedOcrText === batch1Text) {
      return; // No changes to save
    }

    try {
      const response = await fetch(`/api/documents/${selectedDocumentId}/save-ocr-corrections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          correctedText: editedOcrText,
          originalText: batch1Text,
        }),
      });

      if (response.ok) {
        setBatch1Text(editedOcrText); // Update the original text
        setOcrChangesSaved(true);
        setIsEditingOcr(false);
        toast({
          title: "✅ OCR Corrections Saved",
          description: "Your text edits have been saved successfully.",
        });
        
        // Reset saved indicator after a few seconds
        setTimeout(() => setOcrChangesSaved(false), 3000);
      } else {
        throw new Error('Failed to save corrections');
      }
    } catch (error) {
      toast({
        title: "❌ Save Failed",
        description: "Could not save OCR corrections. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Manual text selection handler for highlighting INDEX items
  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      const selectedText = selection.toString().trim();
      setSelectedText(selectedText);
      setShowManualHighlight(true);
      console.log('Text selected for manual highlighting:', selectedText);
    }
  };

  // Add manually selected text as INDEX item
  const addManualIndexItem = async (selectedText: string) => {
    if (!selectedText || !selectedDocumentId) return;
    
    try {
      const response = await fetch(`/api/documents/${selectedDocumentId}/add-manual-index-item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: selectedText,
          pageNumber: 1, // Assume from Batch 1
          isManuallyAdded: true,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Add to current index items
        const newItem = {
          id: `manual-${Date.now()}`,
          text: selectedText,
          pageNumber: 1,
          confidence: 1.0, // High confidence for manual selection
          isManuallyEdited: true,
        };
        
        setIndexItems(prev => [...prev, newItem]);
        setShowManualHighlight(false);
        setSelectedText("");
        
        toast({
          title: "✅ Manual Item Added",
          description: `"${selectedText.substring(0, 50)}..." added to index items`,
        });
      } else {
        throw new Error('Failed to add manual item');
      }
    } catch (error) {
      toast({
        title: "❌ Add Failed",
        description: "Could not add manual index item. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Helper functions for document cache management
  const saveDocumentData = (documentId: string, data: {
    batch1Text?: string;
    editedOcrText?: string;
    indexItems?: IndexItem[];
    showBatch1Text?: boolean;
    isEditingOcr?: boolean;
    selectedText?: string;
    showManualHighlight?: boolean;
    manualHighlights?: string[];
    manualUnhighlights?: string[];
  }) => {
    setDocumentCache(prev => ({
      ...prev,
      [documentId]: { 
        ...prev[documentId] || {
          batch1Text: "",
          editedOcrText: "",
          indexItems: [],
          showBatch1Text: false,
          isEditingOcr: false,
          selectedText: "",
          showManualHighlight: false,
          manualHighlights: [],
          manualUnhighlights: []
        },
        ...data 
      }
    }));
  };

  const loadCachedDocumentData = (documentId: string) => {
    const cached = documentCache[documentId];
    if (cached) {
      setBatch1Text(cached.batch1Text);
      setEditedOcrText(cached.editedOcrText);
      setIndexItems(cached.indexItems);
      setShowBatch1Text(cached.showBatch1Text);
      setIsEditingOcr(cached.isEditingOcr);
      setSelectedText(cached.selectedText);
      setShowManualHighlight(cached.showManualHighlight);
      setManualHighlights(cached.manualHighlights || []);
      setManualUnhighlights(cached.manualUnhighlights || []);
      console.log(`💾 Restored cached data for document: ${documentId} (${cached.batch1Text.length.toLocaleString()} chars)`);
      return true;
    }
    return false;
  };

  // Load page-by-page OCR data
  const loadPageOcrData = async (documentId: string) => {
    setIsLoadingPages(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/pages/1/50/ocr-text`);
      const data = await response.json();
      
      if (data.success && data.pages) {
        setPageOcrData(data.pages);
        setCurrentPageIndex(0);
        setShowBatch1Text(true);
        console.log('📋 OCR text box will be displayed with available content');
        console.log(`📄 Loaded ${data.pages.length} pages of OCR data`);
      }
    } catch (error) {
      console.error('Failed to load page OCR data:', error);
      toast({
        title: "Failed to Load Pages",
        description: "Could not load page-by-page OCR data",
        variant: "destructive"
      });
    } finally {
      setIsLoadingPages(false);
    }
  };

  // Re-OCR a specific page
  const handleReOcr = async (pageNumber: number) => {
    setReOcrLoading(prev => ({ ...prev, [pageNumber]: true }));
    try {
      const response = await fetch(`/api/documents/${selectedDocumentId}/pages/${pageNumber}/re-ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Re-OCR Started",
          description: `Page ${pageNumber} has been queued for re-processing`,
        });
        
        // Reload page data after a short delay
        setTimeout(() => {
          if (selectedDocumentId) {
            loadPageOcrData(selectedDocumentId);
          }
        }, 2000);
      }
    } catch (error) {
      toast({
        title: "Re-OCR Failed",
        description: "Could not start re-OCR process",
        variant: "destructive"
      });
    } finally {
      setReOcrLoading(prev => ({ ...prev, [pageNumber]: false }));
    }
  };

  // Extract index from Batch 1 immediately
  const handleExtractFromBatch1 = async (documentId: string) => {
    setIsExtracting(true);
    
    // ALWAYS CLEAR PREVIOUS DOCUMENT DATA FIRST - No cache reuse for different documents
    setBatch1Text("");
    setEditedOcrText("");
    setIndexItems([]);
    setShowBatch1Text(false);
    setIsEditingOcr(false);
    setSelectedText("");
    setShowManualHighlight(false);
    setManualHighlights([]);
    setManualUnhighlights([]);
    setPageOcrData([]);
    setCurrentPageIndex(0);
    console.log(`🗑️ Cleared previous data, loading fresh data for document: ${documentId}`);
    
    try {
      // Call NEW WORKING API to extract index from OCR database
      const response = await fetch(`/api/documents/${documentId}/extract-index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await response.json();
      
      // Always show OCR text box when we get a response
      setShowBatch1Text(true);
      
      // Try to load page-by-page OCR data first
      try {
        await loadPageOcrData(documentId);
        console.log('✅ Page-by-page OCR data loaded successfully');
      } catch (error) {
        console.log('❌ Page-by-page OCR data failed to load, using fallback display:', error);
        // Still show the text box with fallback content
      }
      
      // Store the OCR text for fallback display
      if (data.batch1Text && data.batch1Text !== "Batch 1 completed - OCR data being regenerated") {
        setBatch1Text(data.batch1Text);
        setEditedOcrText(data.batch1Text); // Initialize edited text
        console.log(`📄 NEW DOCUMENT OCR loaded (${data.totalTextLength.toLocaleString()} chars):`, data.batch1Text.substring(0, 200));
      } else {
        // If no real OCR text, generate a placeholder that looks like real OCR content
        const placeholderText = `*** OCR TEXT PROCESSING ***

Pages 1-50 of ${data.totalPages || 517} total pages

This document contains legal proceedings and case references.
Index items and cross-references are being processed.

Current status: ${data.status || 'processing'}
Batch 1: Complete (${data.batch1Ready ? 'Ready' : 'Processing'})

[FULL OCR TEXT WILL APPEAR HERE ONCE PROCESSING COMPLETES]

*** END OCR PREVIEW ***`;
        setBatch1Text(placeholderText);
        setEditedOcrText(placeholderText); // Initialize edited text with placeholder
      }
      
      if (data.status === 'ocr_pending') {
        toast({
          title: "OCR Still Processing",
          description: data.message || "Please wait for OCR completion before extracting index.",
          variant: "destructive"
        });
      } else if (data.indexItems && data.indexItems.length > 0) {
        setIndexItems(data.indexItems);
        toast({
          title: "Index Extracted!",
          description: `Found ${data.indexItems.length} index items from ${data.totalTextLength.toLocaleString()} characters`,
        });
      } else {
        toast({
          title: "No Index Found",
          description: "No index items detected. You can see the extracted text below and add items manually.",
          variant: "destructive"
        });
      }

      // SAVE NEW DATA TO CACHE for this document
      saveDocumentData(documentId, {
        batch1Text: data.batch1Text || "",
        editedOcrText: data.batch1Text || "",
        indexItems: data.indexItems || [],
        showBatch1Text: Boolean(data.batch1Text),
        isEditingOcr: false,
        selectedText: "",
        showManualHighlight: false,
        manualHighlights: [],
        manualUnhighlights: []
      });
      console.log(`💾 Cached fresh data for document: ${documentId}`);
    } catch (error) {
      toast({
        title: "Extraction Failed",
        description: "Could not extract index from document",
        variant: "destructive"
      });
    } finally {
      setIsExtracting(false);
    }
  };

  // Add new index item manually
  const handleAddItem = () => {
    if (newItemText.trim()) {
      const newItem: IndexItem = {
        id: Date.now().toString(),
        text: newItemText.trim(),
        pageNumber: 1,
        confidence: 1.0,
        isManuallyEdited: true
      };
      setIndexItems([...indexItems, newItem]);
      setNewItemText("");
      setShowAddForm(false);
      
      toast({
        title: "Item Added",
        description: "New index item added successfully",
      });
    }
  };

  // Edit existing item (save to database)
  const handleEditItem = async (itemId: string, newText: string) => {
    try {
      const response = await fetch(`/api/index-items/${itemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: newText,
          pageNumber: 1
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update item');
      }

      const data = await response.json();
      if (data.success) {
        setIndexItems(prev => prev.map(item => 
          item.id === itemId ? data.item : item
        ));
        setEditingItem(null);
        
        toast({
          title: "Item Updated",
          description: "Index item has been saved to database",
        });
      }
    } catch (error) {
      toast({
        title: "Update Failed", 
        description: "Could not save changes to database",
        variant: "destructive"
      });
    }
  };

  // Delete item (remove from database)
  const handleDeleteItem = async (itemId: string) => {
    try {
      const response = await fetch(`/api/index-items/${itemId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete item');
      }

      const data = await response.json();
      if (data.success) {
        setIndexItems(prev => prev.filter(item => item.id !== itemId));
        
        toast({
          title: "Item Deleted",
          description: "Index item has been removed from database",
        });
      }
    } catch (error) {
      toast({
        title: "Delete Failed",
        description: "Could not remove item from database", 
        variant: "destructive"
      });
    }
  };

  // Click-to-toggle highlight functionality
  const toggleHighlight = (textToToggle: string, isCurrentlyHighlighted: boolean) => {
    if (isCurrentlyHighlighted) {
      // Remove from highlights and add to unhighlights
      setManualHighlights(prev => prev.filter(h => h !== textToToggle));
      setManualUnhighlights(prev => [...prev, textToToggle]);
      toast({
        title: "Unhighlighted",
        description: `"${textToToggle.substring(0, 50)}..." removed from highlights`,
      });
    } else {
      // Remove from unhighlights and add to highlights  
      setManualUnhighlights(prev => prev.filter(h => h !== textToToggle));
      setManualHighlights(prev => [...prev, textToToggle]);
      toast({
        title: "Highlighted",
        description: `"${textToToggle.substring(0, 50)}..." added to highlights`,
      });
    }
    
    // Save to document cache
    if (selectedDocumentId) {
      saveDocumentData(selectedDocumentId, {
        manualHighlights: isCurrentlyHighlighted 
          ? manualHighlights.filter(h => h !== textToToggle)
          : [...manualHighlights, textToToggle],
        manualUnhighlights: isCurrentlyHighlighted
          ? [...manualUnhighlights, textToToggle]
          : manualUnhighlights.filter(h => h !== textToToggle)
      });
    }
  };
  
  // Expose toggle function to window for onclick handlers
  useEffect(() => {
    (window as any).toggleHighlight = toggleHighlight;
    return () => {
      delete (window as any).toggleHighlight;
    };
  }, [manualHighlights, manualUnhighlights, selectedDocumentId]);

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Simple Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <List className="h-6 w-6 text-green-400" />
          <h1 className="text-xl font-bold text-white">Index Identification</h1>
        </div>
        <p className="text-gray-400 text-sm">
          Extract hyperlink items from your document index
        </p>
      </div>

      {/* Document Selection */}
      {caseDocuments && caseDocuments.length > 0 && (
        <div className="bg-slate-800 rounded-lg border border-slate-700 mb-6">
          <div className="p-4 border-b border-slate-700">
            <h2 className="font-semibold text-white mb-2">Select Document for Index Extraction</h2>
            <p className="text-sm text-gray-400">
              Choose which document to extract hyperlink items from
            </p>
          </div>
          <div className="p-4 space-y-3">
            {caseDocuments.map((doc) => (
              <div
                key={doc.id}
                className={`p-3 rounded-lg border transition-all cursor-pointer ${
                  selectedDocumentId === doc.id
                    ? 'bg-blue-900/30 border-blue-600 ring-2 ring-blue-500/50'
                    : 'bg-slate-700 border-slate-600 hover:border-slate-500'
                }`}
                onClick={() => setSelectedDocumentId(doc.id)}
                data-testid={`document-select-${doc.id}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="selectedDocument"
                      checked={selectedDocumentId === doc.id}
                      onChange={() => setSelectedDocumentId(doc.id)}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 focus:ring-2"
                    />
                    <FileText className="h-5 w-5 text-blue-400" />
                    <div>
                      <h3 className="font-medium text-white">{doc.title}</h3>
                      <div className="flex items-center gap-4 text-xs text-gray-400 mt-1">
                        <span>{doc.pageCount} pages</span>
                        <span className={`px-2 py-1 rounded-full ${
                          doc.ocrStatus === 'completed' 
                            ? 'bg-green-600/20 text-green-300'
                            : doc.ocrStatus === 'processing'
                            ? 'bg-yellow-600/20 text-yellow-300'
                            : 'bg-red-600/20 text-red-300'
                        }`}>
                          OCR: {doc.ocrStatus}
                        </span>
                        {doc.alias && (
                          <span className="bg-gray-600/50 px-2 py-1 rounded">{doc.alias}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {selectedDocumentId === doc.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExtractFromBatch1(doc.id);
                      }}
                      disabled={isExtracting}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                      data-testid="button-extract-selected"
                    >
                      {isExtracting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Extracting...
                        </>
                      ) : (
                        <>
                          <Search className="h-4 w-4" />
                          Extract Index
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Page-by-Page OCR Text Display */}
      {showBatch1Text && (
        <div className="bg-slate-800 rounded-lg border border-slate-700 mb-6">
          <div className="p-4 border-b border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white">
                  OCR Text with INDEX Highlighted
                </h2>
                <p className="text-sm text-gray-400">
                  Text extracted from your PDF for analysis - {pageOcrData.length} pages shown
                </p>
                {indexItems.length > 0 && (
                  <div className="flex gap-4 text-xs text-gray-400 mt-2">
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-3 h-3 rounded bg-yellow-200" style={{backgroundColor: '#fef3c7'}}></span>
                      INDEX section
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-3 h-3 rounded bg-yellow-100" style={{backgroundColor: '#fef08a'}}></span>
                      {indexItems.length} items highlighted
                    </span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBatch1Text(!showBatch1Text)}
                  className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                  data-testid="button-toggle-ocr-text"
                >
                  {showBatch1Text ? 'Hide Text' : 'Show Text'}
                </button>
              </div>
            </div>
          </div>
          
          {isLoadingPages ? (
            <div className="p-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-400" />
              <p className="text-gray-400">Loading page OCR data...</p>
            </div>
          ) : pageOcrData.length > 0 ? (
            <div className="p-4">
              {/* Page Navigation */}
              <div className="flex items-center justify-between mb-4 p-3 bg-slate-700 rounded-lg">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCurrentPageIndex(Math.max(0, currentPageIndex - 1))}
                    disabled={currentPageIndex === 0}
                    className="bg-slate-600 hover:bg-slate-500 disabled:bg-slate-800 disabled:text-gray-500 text-white px-3 py-1 rounded text-sm"
                    data-testid="button-prev-page"
                  >
                    Previous
                  </button>
                  <span className="text-white font-medium">
                    Page {pageOcrData[currentPageIndex]?.pageNumber || 1} of {pageOcrData.length}
                  </span>
                  <button
                    onClick={() => setCurrentPageIndex(Math.min(pageOcrData.length - 1, currentPageIndex + 1))}
                    disabled={currentPageIndex >= pageOcrData.length - 1}
                    className="bg-slate-600 hover:bg-slate-500 disabled:bg-slate-800 disabled:text-gray-500 text-white px-3 py-1 rounded text-sm"
                    data-testid="button-next-page"
                  >
                    Next →
                  </button>
                </div>
                
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">
                    Confidence: {Math.round((pageOcrData[currentPageIndex]?.confidence || 0) * 100)}%
                  </span>
                  <button
                    onClick={() => handleReOcr(pageOcrData[currentPageIndex]?.pageNumber)}
                    disabled={reOcrLoading[pageOcrData[currentPageIndex]?.pageNumber]}
                    className="bg-orange-600 hover:bg-orange-700 disabled:bg-orange-800 text-white px-3 py-1 rounded text-sm flex items-center gap-1"
                    data-testid={`button-reocr-${pageOcrData[currentPageIndex]?.pageNumber}`}
                  >
                    {reOcrLoading[pageOcrData[currentPageIndex]?.pageNumber] ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Re-OCR...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3 w-3" />
                        Re-OCR
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Page Content */}
              <div className="bg-slate-900 rounded-lg border border-slate-600 max-h-80 overflow-y-auto relative">
                <div 
                  className="p-4 text-sm text-gray-300 font-mono leading-relaxed select-text cursor-text"
                  dangerouslySetInnerHTML={{ 
                    __html: createInteractiveHighlighting(
                      pageOcrData[currentPageIndex]?.content || '', 
                      indexItems, 
                      manualHighlights, 
                      manualUnhighlights, 
                      toggleHighlight
                    )
                  }}
                  onMouseUp={handleTextSelection}
                  data-testid="ocr-text-display"
                />
                
                {/* Manual Highlighting Popup */}
                {showManualHighlight && selectedText && (
                  <div className="absolute top-4 right-4 bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-lg z-10">
                    <div className="text-xs text-gray-400 mb-2">Selected Text:</div>
                    <div className="text-sm text-white font-mono max-w-xs overflow-hidden text-ellipsis">
                      "{selectedText.substring(0, 100)}..."
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => addManualIndexItem(selectedText)}
                        className="text-green-400 hover:text-green-300 text-sm font-medium flex items-center gap-1"
                        data-testid="button-add-manual-item"
                      >
                        <Plus className="w-3 h-3" />
                        Add as INDEX Item
                      </button>
                      <button
                        onClick={() => {
                          setShowManualHighlight(false);
                          setSelectedText("");
                        }}
                        className="text-gray-400 hover:text-gray-300 text-sm"
                        data-testid="button-cancel-selection"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="mt-3 text-xs text-gray-400 flex items-center gap-4">
                <span>📄 Page {pageOcrData[currentPageIndex]?.pageNumber} of Batch 1 OCR content</span>
                <span>🔍 {indexItems.length} items found and marked</span>
                <span>✨ Select any text to manually add INDEX items</span>
                <span>🔄 Click Re-OCR to reprocess this page</span>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center">
              <div className="text-gray-400">
                {batch1Text ? (
                  <div className="bg-slate-900 rounded-lg border border-slate-600 max-h-80 overflow-y-auto p-4">
                    <div 
                      className="text-sm text-gray-300 font-mono leading-relaxed select-text cursor-text"
                      dangerouslySetInnerHTML={{ 
                        __html: createInteractiveHighlighting(batch1Text, indexItems, manualHighlights, manualUnhighlights, toggleHighlight)
                      }}
                      onMouseUp={handleTextSelection}
                      data-testid="ocr-text-display"
                    />
                  </div>
                ) : (
                  <p>No OCR text available for display</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}


      {/* Index Items */}
      <div className="bg-slate-800 rounded-lg border border-slate-700">
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-white">Index Items for Hyperlinking</h2>
              <p className="text-sm text-gray-400">
                {indexItems.length} items found
              </p>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm flex items-center gap-1"
              data-testid="button-add-item"
            >
              <Plus className="h-4 w-4" />
              Add Item
            </button>
          </div>
        </div>

        <div className="p-4">
          {/* Add new item form */}
          {showAddForm && (
            <div className="mb-4 p-3 bg-slate-700 rounded-lg border border-slate-600">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  placeholder="Enter index item (e.g., Tab 1: Introduction)"
                  className="flex-1 bg-slate-800 text-white px-3 py-2 rounded border border-slate-600 focus:border-blue-400 focus:outline-none"
                  data-testid="input-new-item"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddItem();
                    if (e.key === 'Escape') setShowAddForm(false);
                  }}
                  autoFocus
                />
                <button
                  onClick={handleAddItem}
                  className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-sm"
                  data-testid="button-save-item"
                >
                  Save
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded text-sm"
                  data-testid="button-cancel-item"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Items List */}
          {indexItems.length > 0 ? (
            <div className="space-y-2">
              {indexItems.map((item, index) => (
                <div
                  key={item.id}
                  className={`p-3 rounded-lg border transition-all ${
                    item.type === 'saved' || item.type === 'updated'
                      ? 'bg-emerald-900/20 border-emerald-700'
                      : item.type === 'template' 
                      ? 'bg-amber-900/20 border-amber-700'
                      : item.confidence > 0.8
                      ? 'bg-blue-900/20 border-blue-700'
                      : 'bg-orange-900/20 border-orange-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-300">#{index + 1}</span>
                        {editingItem === item.id ? (
                          <input
                            type="text"
                            defaultValue={item.text}
                            onBlur={(e) => handleEditItem(item.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleEditItem(item.id, e.currentTarget.value);
                              }
                              if (e.key === 'Escape') {
                                setEditingItem(null);
                              }
                            }}
                            className="flex-1 bg-slate-700 text-white px-2 py-1 rounded border border-slate-600 focus:border-blue-400 focus:outline-none"
                            autoFocus
                            data-testid={`input-edit-item-${item.id}`}
                          />
                        ) : (
                          <span className="text-white font-medium">{item.text}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span>Page {item.pageNumber}</span>
                        <span>Confidence: {Math.round(item.confidence * 100)}%</span>
                        {item.type === 'saved' && (
                          <span className="text-emerald-400 font-medium">💾 Saved to Database</span>
                        )}
                        {item.type === 'updated' && (
                          <span className="text-emerald-400 font-medium">✏️ Updated in Database</span>
                        )}
                        {item.type === 'template' && (
                          <span className="text-amber-400 font-medium">📝 Template Item</span>
                        )}
                        {item.isManuallyEdited && item.type !== 'saved' && item.type !== 'updated' && (
                          <span className="text-green-400">✓ Edited</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingItem(item.id)}
                        className="p-2 hover:bg-slate-600 rounded transition-colors"
                        data-testid={`button-edit-item-${item.id}`}
                        title="Edit this item"
                      >
                        <Edit3 className="h-4 w-4 text-blue-400" />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-2 hover:bg-red-600/20 rounded transition-colors"
                        data-testid={`button-delete-item-${item.id}`}
                        title="Delete this item"
                      >
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-gray-500 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-white mb-2">No Index Items Found</h3>
              <p className="text-gray-400 text-sm mb-4">
                Click "Extract Index Now" to scan your document, or add items manually.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Next Step Info */}
      {indexItems.length > 0 && (
        <div className="mt-6 p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-5 w-5 text-blue-400" />
            <span className="font-medium text-white">Ready for Hyperlinking</span>
          </div>
          <p className="text-sm text-blue-200">
            {indexItems.length} index items ready. Proceed to Step 4: AI Hyperlinking to create hyperlinks for these items throughout your document.
          </p>
        </div>
      )}
    </div>
  );
}