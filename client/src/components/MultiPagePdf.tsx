import React, { useEffect, useRef, useState } from "react";
import pdfjsLib from "@/lib/pdfjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { PageLinkPosition, InsertPageLinkPosition } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check } from "lucide-react";

export type Highlight = { 
  page: number; 
  x0: number; 
  y0: number; 
  x1: number; 
  y1: number; 
  id?: string;
  type?: 'orange-index' | 'circle' | 'standard';
  text?: string;
  tabNumber?: string;
};

export type Page2Link = {
  tab: number;
  page: number;
};

interface MultiPagePdfProps {
  url: string;
  documentId?: string; // Required for persistent storage of link positions
  start?: number;
  end?: number;
  zoom?: number;
  highlights?: Highlight[];
  onTotalPages?: (total: number) => void;
  onCreateTabItem?: (highlight: Highlight, tabNumber: string, title: string) => void;
  showHighlightTools?: boolean;
  showPage2Links?: boolean;
  page2Links?: Page2Link[];
  onNavigateToPage?: (pageNumber: number) => void;
}

export default function MultiPagePdf({
  url,
  documentId,
  start = 1, 
  end = 50, 
  zoom = 1, 
  highlights = [],
  onTotalPages,
  onCreateTabItem,
  showHighlightTools = false,
  showPage2Links = true,
  page2Links = [],
  onNavigateToPage
}: MultiPagePdfProps) {
  // ALL HOOKS MUST BE CALLED UNCONDITIONALLY AT THE TOP LEVEL
  // NO EARLY RETURNS OR CONDITIONAL LOGIC BEFORE ALL HOOKS ARE DECLARED
  
  // State hooks - must be first and unconditional
  const [pdf, setPdf] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{[linkId: string]: boolean}>({});
  const [saveSuccess, setSaveSuccess] = useState<{[linkId: string]: boolean}>({});
  const [updateSuccess, setUpdateSuccess] = useState<{[linkId: string]: boolean}>({});
  const [isUpdating, setIsUpdating] = useState<{[linkId: string]: boolean}>({});

  // Ref hooks - must be unconditional
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  
  // 🎯 Page registry for dynamic rendering
  const renderedPagesRef = useRef<Map<number, HTMLElement>>(new Map());
  const currentPageRef = useRef<number>(start);
  
  // 📏 Constants for memory management
  const MAX_RENDERED_PAGES = 40;
  const PRELOAD_NEIGHBORS = 2;

  // Custom hooks - must be unconditional  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Query hook - use enabled flag for conditional behavior instead of conditional calling
  const shouldLoadPositions = Boolean(documentId && showPage2Links);
  
  // CRITICAL FIX: Use hierarchical query key arrays for better cache management
  const hierarchicalQueryKey = documentId ? ['/api/documents', documentId, 'page2-links', 'positions'] : null;
  
  const { data: savedPositions = [], isLoading: isLoadingPositions, error: positionsError } = useQuery<PageLinkPosition[]>({
    queryKey: hierarchicalQueryKey!,
    enabled: shouldLoadPositions && Boolean(hierarchicalQueryKey),
    staleTime: 300000, // Cache for 5 minutes
  });
  
  // DEBUG LOGGING: Track query state and results
  console.log('🔍 [MultiPagePdf] Query Debug:', {
    documentId,
    showPage2Links,
    shouldLoadPositions,
    hierarchicalQueryKey,
    isLoadingPositions,
    savedPositionsCount: savedPositions.length,
    positionsError: positionsError?.message,
    savedPositions: savedPositions.slice(0, 3) // Show first 3 positions for debugging
  });

  // Mutation hook - must be unconditional
  const savePositionsMutation = useMutation({
    mutationFn: async (positions: InsertPageLinkPosition[]) => {
      if (!documentId) throw new Error('Document ID required');
      return apiRequest('POST', `/api/documents/${documentId}/page2-links/positions`, {
        positions
      });
    },
    onSuccess: (_, variables) => {
      // CRITICAL FIX: Use hierarchical query key for cache invalidation
      if (documentId) {
        queryClient.invalidateQueries({
          queryKey: ['/api/documents', documentId, 'page2-links', 'positions']
        });
      }
      
      // Show success indicator
      const linkId = `${variables[0].tabNumber}-${variables[0].pageNumber}`;
      setSaveSuccess(prev => ({ ...prev, [linkId]: true }));
      
      // Clear success indicator after 2 seconds
      setTimeout(() => {
        setSaveSuccess(prev => ({ ...prev, [linkId]: false }));
      }, 2000);
      
      // Show toast notification
      toast({
        title: "Position Saved",
        description: `Link position for tab ${variables[0].tabNumber} has been saved successfully.`,
        duration: 3000,
      });
      
      console.log('💾 Page link positions saved successfully');
    },
    onError: (error, variables) => {
      console.error('❌ Failed to save page link positions:', error);
      
      // Show error toast
      toast({
        title: "Save Failed",
        description: `Failed to save link position: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
        duration: 5000,
      });
    }
  });

  // PATCH mutation for updating individual link positions with yOffset and locked status
  const updatePositionMutation = useMutation({
    mutationFn: async ({ tabNumber, yOffset, locked }: { tabNumber: string, yOffset?: number, locked?: boolean }) => {
      if (!documentId) throw new Error('Document ID required');
      
      const updateData: any = {};
      if (yOffset !== undefined) updateData.yOffset = yOffset;
      if (locked !== undefined) updateData.locked = locked;
      
      return apiRequest('PATCH', `/api/documents/${documentId}/page2-links/positions/${tabNumber}`, updateData);
    },
    onMutate: async ({ tabNumber, yOffset, locked }) => {
      // Optimistic update
      const linkId = getLinkId(tabNumber, 2);
      setIsUpdating(prev => ({ ...prev, [linkId]: true }));
      
      // Cancel any outgoing refetches
      const hierarchicalKey = documentId ? ['/api/documents', documentId, 'page2-links', 'positions'] : null;
      if (hierarchicalKey) {
        await queryClient.cancelQueries({ queryKey: hierarchicalKey });
      }
      
      // Snapshot previous value
      const previousPositions = queryClient.getQueryData<PageLinkPosition[]>(hierarchicalKey!);
      
      // Optimistically update to new value
      if (previousPositions && hierarchicalKey) {
        queryClient.setQueryData<PageLinkPosition[]>(hierarchicalKey, (old) => {
          if (!old) return old;
          return old.map(pos => {
            if (String(pos.tabNumber) === String(tabNumber) && pos.pageNumber === 2) {
              return {
                ...pos,
                ...(yOffset !== undefined && { yOffset }),
                ...(locked !== undefined && { locked })
              };
            }
            return pos;
          });
        });
      }
      
      return { previousPositions, linkId, hierarchicalKey };
    },
    onSuccess: (_, { tabNumber }, context) => {
      if (context?.linkId) {
        setIsUpdating(prev => ({ ...prev, [context.linkId]: false }));
        setUpdateSuccess(prev => ({ ...prev, [context.linkId]: true }));
        
        // Clear success indicator after 2 seconds
        setTimeout(() => {
          setUpdateSuccess(prev => ({ ...prev, [context.linkId]: false }));
        }, 2000);
        
        toast({
          title: "Position Updated",
          description: `Link position for tab ${tabNumber} has been updated successfully.`,
          duration: 3000,
        });
        
        console.log('💾 Link position updated successfully');
      }
    },
    onError: (error, { tabNumber }, context) => {
      console.error('❌ Failed to update link position:', error);
      
      // Revert optimistic update
      const hierarchicalKey = documentId ? ['/api/documents', documentId, 'page2-links', 'positions'] : null;
      if (context?.previousPositions && hierarchicalKey) {
        queryClient.setQueryData(hierarchicalKey, context.previousPositions);
      }
      
      if (context?.linkId) {
        setIsUpdating(prev => ({ ...prev, [context.linkId]: false }));
      }
      
      toast({
        title: "Update Failed",
        description: `Failed to update link position: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
        duration: 5000,
      });
    },
    onSettled: () => {
      // Always refetch after error or success  
      if (documentId) {
        queryClient.invalidateQueries({
          queryKey: ['/api/documents', documentId, 'page2-links', 'positions']
        });
      }
    }
  });

  // ALL useEffect hooks - must be declared unconditionally at top level
  
  // Effect 1: CSS keyframes for loading spinner animation
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);

  // Effect 2: Show error toast if positions loading fails
  useEffect(() => {
    if (positionsError && documentId && showPage2Links) {
      toast({
        title: "Loading Error",
        description: "Failed to load saved link positions. You can still drag links to reposition them.",
        variant: "destructive",
        duration: 5000,
      });
    }
  }, [positionsError, documentId, showPage2Links, toast]);

  // Effect 3: Load the PDF document
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    
    (async () => {
      try {
        const task = (pdfjsLib as any).getDocument({ 
          url,
          verbosity: 0,
          disableAutoFetch: false,
          disableStream: false
        });
        const pdfDoc = await task.promise;
        if (!cancelled) {
          setPdf(pdfDoc);
          onTotalPages?.(pdfDoc.numPages);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('❌ PDF loading error:', err);
          console.error('❌ Failed URL:', url);
          setError(`Failed to load PDF: ${err instanceof Error ? err.message : 'Unknown error'}`);
          setIsLoading(false);
        }
      }
    })();
    
    return () => { 
      cancelled = true; 
    };
  }, [url, onTotalPages]);

  // Effect 4: Handle zoom changes without re-rendering pages - apply immediately
  useEffect(() => {
    if (!containerRef.current) return;
    
    try {
      const canvases = containerRef.current.querySelectorAll('canvas');
      canvases.forEach((canvas) => {
        if (!canvas || !canvas.style) return;
        
        // Get the original dimensions from data attributes
        const originalWidth = parseFloat(canvas.dataset.originalWidth || '0');
        const originalHeight = parseFloat(canvas.dataset.originalHeight || '0');
        
        if (originalWidth > 0 && originalHeight > 0) {
          // Apply zoom via CSS transform for immediate visual change
          canvas.style.transform = `scale(${zoom})`;
          canvas.style.transformOrigin = 'top left';
          
          // Update the parent container size to accommodate the scaled canvas
          const pageContainer = canvas.parentElement;
          if (pageContainer && pageContainer.style) {
            pageContainer.style.width = `${originalWidth * zoom}px`;
            pageContainer.style.height = `${originalHeight * zoom}px`;
            pageContainer.style.overflow = 'visible';
          }
        }
      });
      
      // Add console log to verify zoom is being applied
      console.log(`🔍 Zoom applied: ${Math.round(zoom * 100)}% to ${canvases.length} canvas elements`);
    } catch (error) {
      console.warn('Error applying zoom:', error);
    }
  }, [zoom]);

  // ALL HELPER FUNCTIONS - defined after hooks but before rendering logic
  
  // Helper function to get saved position for a specific tab
  // CRITICAL FIX: Ensure type consistency for tabNumber (handle both string and number)
  const getSavedPosition = (tabNumber: string | number, pageNumber: number = 2): PageLinkPosition | undefined => {
    const tabNumberStr = String(tabNumber); // Convert to string for consistent comparison
    const found = savedPositions.find(pos => 
      String(pos.tabNumber) === tabNumberStr && pos.pageNumber === pageNumber
    );
    
    // DEBUG LOGGING: Track position lookup
    if (savedPositions.length > 0) {
      console.log('🔍 [getSavedPosition] Debug:', {
        lookingFor: { tabNumber: tabNumberStr, pageNumber },
        availablePositions: savedPositions.map(p => ({ tabNumber: String(p.tabNumber), pageNumber: p.pageNumber, xNorm: p.xNorm, yNorm: p.yNorm })),
        found: found ? { id: found.id, tabNumber: String(found.tabNumber), xNorm: found.xNorm, yNorm: found.yNorm } : null
      });
    }
    
    return found;
  };

  // Helper function to save a single position
  const savePosition = (tabNumber: string, xNorm: number, yNorm: number, pageNumber: number = 2) => {
    if (!documentId) return;
    
    const position: InsertPageLinkPosition = {
      documentId,
      pageNumber,
      tabNumber,
      xNorm: xNorm.toString(),
      yNorm: yNorm.toString(),
      targetPage: pageNumber // Add required targetPage property
    };
    
    savePositionsMutation.mutate([position]);
  };
  
  // Helper function to get link ID for state management
  const getLinkId = (tabNumber: string, pageNumber: number = 2) => {
    return `${tabNumber}-${pageNumber}`;
  };
  
  // Helper function to handle drag start
  const handleDragStart = (tabNumber: string, pageNumber: number = 2) => {
    const linkId = getLinkId(tabNumber, pageNumber);
    setDragState(prev => ({ ...prev, [linkId]: true }));
  };
  
  // Helper function to handle drag end
  const handleDragEnd = (tabNumber: string, pageNumber: number = 2) => {
    const linkId = getLinkId(tabNumber, pageNumber);
    setDragState(prev => ({ ...prev, [linkId]: false }));
  };

  // 🎯 DYNAMIC PAGE RENDERING SYSTEM
  
  // Helper function to create page container DOM elements
  const createPageContainer = (pageNum: number): { pageContainer: HTMLElement, canvas: HTMLCanvasElement, highlightOverlay: HTMLElement } => {
    const pageContainer = document.createElement('div');
    pageContainer.className = 'relative mb-4 bg-white rounded shadow-sm overflow-visible';
    pageContainer.style.width = 'max-content';
    pageContainer.style.maxWidth = 'none';
    pageContainer.dataset.page = String(pageNum);
    
    const canvas = document.createElement("canvas");
    canvas.dataset.page = String(pageNum);
    canvas.dataset.rendered = 'false';
    canvas.dataset.rendering = 'false';
    canvas.className = "w-full h-auto block";
    
    const pageLabel = document.createElement('div');
    pageLabel.className = 'absolute top-2 left-2 bg-black bg-opacity-60 text-white px-2 py-1 rounded text-sm z-10';
    pageLabel.textContent = `Page ${pageNum}`;
    
    const highlightOverlay = document.createElement('div');
    highlightOverlay.className = 'absolute inset-0 pointer-events-none';
    highlightOverlay.style.zIndex = '20';
    
    pageContainer.appendChild(pageLabel);
    pageContainer.appendChild(canvas);
    pageContainer.appendChild(highlightOverlay);
    
    return { pageContainer, canvas, highlightOverlay };
  };

  // Helper function to ensure a page is rendered and tracked
  const ensurePageRendered = async (pageNum: number): Promise<void> => {
    if (!pdf || !containerRef.current) return;
    
    // Update current page reference before any operations
    currentPageRef.current = pageNum;
    
    // Check if page exists but verify it's actually rendered
    if (renderedPagesRef.current.has(pageNum)) {
      const pageContainer = renderedPagesRef.current.get(pageNum);
      const canvas = pageContainer?.querySelector('canvas') as HTMLCanvasElement;
      
      if (canvas && canvas.dataset.rendered !== 'true') {
        console.log(`🔄 Page ${pageNum} exists but not rendered (dataset.rendered: ${canvas.dataset.rendered}), re-rendering...`);
        await renderPage(pageNum, canvas);
        
        // Apply container sizing immediately after render
        const ow = Number(canvas.dataset.originalWidth || 0);
        const oh = Number(canvas.dataset.originalHeight || 0);
        if (ow && oh && pageContainer) {
          pageContainer.style.width = `${ow * zoom}px`;
          pageContainer.style.height = `${oh * zoom}px`;
          pageContainer.style.overflow = 'visible';
          console.log(`📐 Container sized after re-render: ${ow * zoom}x${oh * zoom}px`);
        }
        
        // Render overlays after PDF content is rendered
        if (showHighlightTools && pageContainer) {
          const highlightOverlay = pageContainer.querySelector('div[style*="z-index: 20"]') as HTMLElement;
          if (highlightOverlay) {
            renderHighlightsForPage(pageNum, highlightOverlay, canvas);
          }
        }
        if (pageContainer) {
          const highlightOverlay = pageContainer.querySelector('div[style*="z-index: 20"]') as HTMLElement;
          if (highlightOverlay) {
            renderPage2OverlayLinks(pageNum, highlightOverlay, canvas);
          }
        }
      } else if (canvas) {
        // Re-apply container sizing in case it was never applied
        const ow = Number(canvas.dataset.originalWidth || 0);
        const oh = Number(canvas.dataset.originalHeight || 0);
        if (ow && oh && pageContainer) {
          pageContainer.style.width = `${ow * zoom}px`;
          pageContainer.style.height = `${oh * zoom}px`;
          pageContainer.style.overflow = 'visible';
        }
        console.log(`📄 Page ${pageNum} already rendered (dataset.rendered: ${canvas.dataset.rendered})`);
      }
      return;
    }
    
    // Clamp to valid page range
    if (pageNum < 1 || pageNum > pdf.numPages) {
      console.warn(`⚠️ Page ${pageNum} out of range (1-${pdf.numPages})`);
      return;
    }
    
    console.log(`🔧 Dynamically rendering page ${pageNum}...`);
    
    // Create page elements
    const { pageContainer, canvas, highlightOverlay } = createPageContainer(pageNum);
    
    // Insert page in correct order (find next higher page and insertBefore, else append)
    const container = containerRef.current;
    let insertBeforeElement: Element | null = null;
    
    for (const child of Array.from(container.children)) {
      const childPageNum = parseInt(child.getAttribute('data-page') || '0');
      if (childPageNum > pageNum) {
        insertBeforeElement = child;
        break;
      }
    }
    
    if (insertBeforeElement) {
      container.insertBefore(pageContainer, insertBeforeElement);
    } else {
      container.appendChild(pageContainer);
    }
    
    // Apply current zoom immediately to prevent flash
    if (canvas && canvas.style) {
      canvas.style.transform = `scale(${zoom})`;
      canvas.style.transformOrigin = 'top left';
    }
    
    // Track in registry
    renderedPagesRef.current.set(pageNum, pageContainer);
    
    // Render the page content
    try {
      await renderPage(pageNum, canvas);
      
      // Apply container sizing immediately after render for new pages
      const ow = Number(canvas.dataset.originalWidth || 0);
      const oh = Number(canvas.dataset.originalHeight || 0);
      if (ow && oh) {
        pageContainer.style.width = `${ow * zoom}px`;
        pageContainer.style.height = `${oh * zoom}px`;
        pageContainer.style.overflow = 'visible';
        console.log(`📐 New page container sized: ${ow * zoom}x${oh * zoom}px`);
      }
      
      // Render overlays after PDF content is rendered
      if (showHighlightTools) {
        renderHighlightsForPage(pageNum, highlightOverlay, canvas);
      }
      renderPage2OverlayLinks(pageNum, highlightOverlay, canvas);
      
      console.log(`✅ Page ${pageNum} rendered successfully (dataset.rendered: ${canvas.dataset.rendered})`);
    } catch (error) {
      console.error(`❌ Failed to render page ${pageNum}:`, error);
    }
  };
  
  // Helper function to prune distant pages for memory management
  const pruneRenderedPages = () => {
    const currentPage = currentPageRef.current;
    const renderedPages = renderedPagesRef.current;
    
    if (renderedPages.size <= MAX_RENDERED_PAGES) {
      return; // Under limit, no pruning needed
    }
    
    // Calculate distances from current page
    const pageDistances: Array<{pageNum: number, distance: number}> = [];
    for (const pageNum of Array.from(renderedPages.keys())) {
      const distance = Math.abs(pageNum - currentPage);
      pageDistances.push({ pageNum, distance });
    }
    
    // Sort by distance (farthest first) and remove the farthest pages beyond limit
    pageDistances.sort((a, b) => b.distance - a.distance);
    
    // Calculate how many pages to remove (only remove excess pages beyond limit)
    const pagesToRemoveCount = renderedPages.size - MAX_RENDERED_PAGES;
    const pagesToRemove = pageDistances.slice(0, pagesToRemoveCount);
    
    for (const { pageNum } of pagesToRemove) {
      // Always preserve pages within neighbor window of current page
      if (Math.abs(pageNum - currentPage) <= PRELOAD_NEIGHBORS) {
        continue;
      }
      
      const pageContainer = renderedPages.get(pageNum);
      if (pageContainer) {
        // Remove from DOM
        pageContainer.remove();
        
        // Free canvas memory
        const canvas = pageContainer.querySelector('canvas');
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        
        // Remove from registry
        renderedPages.delete(pageNum);
        console.log(`🗑️ Pruned page ${pageNum} (distance: ${Math.abs(pageNum - currentPage)})`);
      }
    }
    
    console.log(`📊 Memory management: ${renderedPages.size}/${MAX_RENDERED_PAGES} pages rendered`);
  };

  // 🎯 CORE RENDERING FUNCTIONS (extracted from useEffect for reuse)
  
  // Function to render a PDF page to canvas
  const renderPage = async (pageNum: number, canvas: HTMLCanvasElement) => {
    if (!pdf || canvas.dataset.rendered === 'true' || canvas.dataset.rendering === 'true') return;
    
    try {
      canvas.dataset.rendering = 'true';
      
      const page = await pdf.getPage(pageNum);
      
      // Use moderate quality scale to prevent memory issues
      const viewport = page.getViewport({ scale: 1 });
      
      // Clamp device pixel ratio to prevent memory overflow
      const devicePixelRatio = 1;
      canvas.width = viewport.width * devicePixelRatio;
      canvas.height = viewport.height * devicePixelRatio;
      
      // Set base display size (zoom will be applied separately)
      const baseWidth = viewport.width;
      const baseHeight = viewport.height;
      canvas.style.width = `${baseWidth}px`;
      canvas.style.height = `${baseHeight}px`;
      
      // Store original dimensions as data attributes for zoom calculations
      canvas.dataset.originalWidth = baseWidth.toString();
      canvas.dataset.originalHeight = baseHeight.toString();
      canvas.style.display = 'block';
      canvas.style.maxWidth = 'none'; // Remove max-width constraint
      
      const ctx = canvas.getContext("2d")!;
      ctx.scale(devicePixelRatio, devicePixelRatio);
      
      ctx.clearRect(0, 0, viewport.width, viewport.height);
      
      const renderTask = page.render({
        canvasContext: ctx, 
        viewport,
        enableWebGL: false,
      });
      
      await renderTask.promise;
      
      canvas.dataset.rendered = 'true';
      canvas.dataset.rendering = 'false';
      
    } catch (err) {
      console.warn(`⚠️ Page ${pageNum} render issue:`, err instanceof Error ? err.message : 'Unknown error');
      
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = '#f8f9fa';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#6c757d';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Page ${pageNum} - Render Issue`, canvas.width / 2, canvas.height / 2);
      
      canvas.dataset.rendered = 'true';
      canvas.dataset.rendering = 'false';
    }
  };

  // Function to render highlights overlay for a page
  const renderHighlightsForPage = (pageNum: number, overlay: HTMLElement, canvas: HTMLCanvasElement) => {
    const pageHighlights = highlights.filter(h => h.page === pageNum);
    
    pageHighlights.forEach((highlight, index) => {
      if (highlight.type === 'orange-index') {
        // Create orange highlighted background
        const highlightBox = document.createElement('div');
        highlightBox.className = 'absolute rounded-lg pointer-events-auto';
        
        // Orange background with 30% opacity as specified
        highlightBox.style.background = 'rgba(255, 165, 0, 0.3)';
        highlightBox.style.border = '2px solid rgb(255, 165, 0)';
        highlightBox.style.left = `${highlight.x0 * 100}%`;
        highlightBox.style.top = `${highlight.y0 * 100}%`;
        highlightBox.style.width = `${(highlight.x1 - highlight.x0) * 100}%`;
        highlightBox.style.height = `${(highlight.y1 - highlight.y0) * 100}%`;
        highlightBox.style.zIndex = '25';
        
        // Create blue "LINK X" button
        const linkButton = document.createElement('button');
        linkButton.className = 'absolute bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-2 py-1 rounded shadow-lg transition-colors';
        linkButton.style.right = '-10px';
        linkButton.style.top = '50%';
        linkButton.style.transform = 'translateY(-50%)';
        linkButton.style.zIndex = '30';
        linkButton.textContent = `LINK ${highlight.tabNumber || index + 1}`;
        
        // Add click handler for creating tab items
        linkButton.onclick = (e) => {
          e.stopPropagation();
          const tabNumber = highlight.tabNumber || String(index + 1);
          const title = highlight.text || `Index Item ${tabNumber}`;
          
          if (onCreateTabItem) {
            onCreateTabItem(highlight, tabNumber, title);
          }
        };
        
        highlightBox.appendChild(linkButton);
        overlay.appendChild(highlightBox);
        
      } else if (highlight.type === 'circle') {
        // Create draggable orange circle for manual placement
        const circle = document.createElement('div');
        circle.className = 'absolute rounded-full bg-orange-500 border-4 border-orange-600 cursor-move pointer-events-auto flex items-center justify-center text-white font-bold text-sm shadow-lg';
        circle.style.width = '40px';
        circle.style.height = '40px';
        circle.style.left = `${highlight.x0 * 100}%`;
        circle.style.top = `${highlight.y0 * 100}%`;
        circle.style.zIndex = '35';
        circle.textContent = highlight.tabNumber || String(index + 1);
        
        // Add drag functionality (basic implementation)
        let isDragging = false;
        circle.onmousedown = (e) => {
          isDragging = true;
          e.stopPropagation();
        };
        
        document.onmousemove = (e) => {
          if (isDragging) {
            const rect = overlay.getBoundingClientRect();
            const newX = (e.clientX - rect.left) / rect.width;
            const newY = (e.clientY - rect.top) / rect.height;
            circle.style.left = `${Math.max(0, Math.min(95, newX * 100))}%`;
            circle.style.top = `${Math.max(0, Math.min(95, newY * 100))}%`;
          }
        };
        
        document.onmouseup = () => {
          isDragging = false;
        };
        
        overlay.appendChild(circle);
      }
    });
  };

  // Function to detect tab numbers using pdf.js text extraction
  const detectTabNumbers = async (page: any, viewport: any): Promise<{tab: string, x: number, y: number}[]> => {
    if (!pdf) return [];
    
    try {
      const textContent = await page.getTextContent({ 
        normalizeWhitespace: true, 
        includeMarkedContent: true 
      });
      const detectedTabs: {tab: string, x: number, y: number}[] = [];
      
      // Always log text extraction results for debugging
      console.log(`🔍 DEBUG: Found ${textContent.items.length} text items on page 2`);
      
      // If no text layer, this is likely an image-only PDF
      if (textContent.items.length === 0) {
        console.log(`📸 Image-only PDF detected on page 2 - no text layer for auto-alignment`);
        return detectedTabs;
      }
      
      // Group text items into lines by y-coordinate clustering
      const lines = new Map();
      const yTolerance = 5; // pixels tolerance for grouping items into same line
      
      for (const item of textContent.items) {
        const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        
        // Find existing line within tolerance or create new one
        let lineY = null;
        for (const existingY of Array.from(lines.keys())) {
          if (Math.abs(y - existingY) <= yTolerance) {
            lineY = existingY;
            break;
          }
        }
        
        if (lineY === null) {
          lineY = y;
          lines.set(lineY, []);
        }
        
        lines.get(lineY).push({ text: item.str, x, y });
      }
      
      // Process each line for tab number detection
      for (const [lineY, items] of Array.from(lines.entries())) {
        // Sort items in line by x-coordinate and join text
        items.sort((a: any, b: any) => a.x - b.x);
        const lineText = items.map((item: any) => item.text).join(' ').trim();
        const leftmostX = items[0].x;
        const xNorm = leftmostX / viewport.width;
        
        // Check if line starts with a tab number pattern (broader matching)
        // Match patterns like: "1.", "1)", "Tab 1", "Item 1", "1. Exhibit A...", etc.
        const tabMatch = lineText.match(/^\s*(?:tab\s*|item\s*)?(\d{1,3})\b/i);
        if (tabMatch) {
          const tabNumber = tabMatch[1];
          
          // Only include tabs that are in the left portion of the page
          if (xNorm < 0.5 && parseInt(tabNumber) >= 1 && parseInt(tabNumber) <= 20) {
            console.log(`🔍 Found tab line: "${lineText}" at (${leftmostX.toFixed(1)}, ${lineY.toFixed(1)}) xNorm=${xNorm.toFixed(2)}`);
            detectedTabs.push({
              tab: tabNumber,
              x: leftmostX,
              y: lineY
            });
          }
        }
      }
      
      // Debug: Show sample text items if no tabs detected
      if (detectedTabs.length === 0 && textContent.items.length > 0) {
        console.log(`🔍 DEBUG: No tab patterns found. Sample text items:`);
        textContent.items.slice(0, 10).forEach((item: any, i: number) => {
          const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
          const xNorm = x / viewport.width;
          console.log(`  ${i}: "${item.str}" at (${x.toFixed(1)}, ${y.toFixed(1)}) xNorm=${xNorm.toFixed(2)}`);
        });
      }
      
      console.log(`🔍 Auto-detected ${detectedTabs.length} tab numbers on page 2:`, detectedTabs);
      return detectedTabs;
    } catch (error) {
      console.warn('Error detecting tab numbers:', error);
      return [];
    }
  };

  // Function to render page 2 overlay links (p.N labels)
  const renderPage2OverlayLinks = async (pageNum: number, overlay: HTMLElement, canvas: HTMLCanvasElement) => {
    // Only render on page 2
    if (pageNum !== 2 || !showPage2Links || !page2Links.length) return;

    // Create the overlay layer specifically for page 2 links
    let linkOverlay = overlay.querySelector('.hl-overlay-layer');
    if (!linkOverlay) {
      linkOverlay = document.createElement('div');
      linkOverlay.className = 'hl-overlay-layer';
      overlay.appendChild(linkOverlay);
    }

    // Clear any existing links
    linkOverlay.innerHTML = '';

    try {
      // Try to get the PDF page for text extraction
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      
      // Detect tab numbers using text extraction
      const detectedTabs = await detectTabNumbers(page, viewport);
      
      // Create a map of detected tab positions
      const tabPositions = new Map<string, {x: number, y: number}>();
      detectedTabs.forEach(({ tab, x, y }) => {
        tabPositions.set(tab, { x, y });
      });

      // Create links for each tab mapping
      page2Links.forEach(({ tab, page }) => {
        // Create the clickable link element first
        const linkElement = document.createElement('a');
        linkElement.className = 'hl-overlay-link';
        linkElement.textContent = `p.${page}`;
        linkElement.href = 'javascript:void(0)';
        
        let xPosition, yPosition;
        
        // Priority 1: Use saved position if available
        const savedPos = getSavedPosition(tab.toString(), 2);
        console.log(`🔍 DEBUG: Checking saved position for tab ${tab}:`, savedPos);
        console.log(`🔍 DEBUG: Available saved positions:`, savedPositions);
        
        if (savedPos && savedPos.xNorm && savedPos.yNorm) {
          // Use saved position with normalized coordinates
          const canvasWidth = parseFloat(canvas.dataset.originalWidth || '595');
          const canvasHeight = parseFloat(canvas.dataset.originalHeight || '842');
          
          // Convert saved normalized coordinates to pixel positions
          const xNorm = parseFloat(savedPos.xNorm.toString());
          const yNorm = parseFloat(savedPos.yNorm.toString());
          const yOffset = savedPos.yOffset || 0; // Get yOffset from saved position
          
          xPosition = xNorm * canvasWidth;
          // CRITICAL: Update positioning math to include yOffset
          yPosition = (yNorm * canvasHeight) + (yOffset * zoom);
          
          // Store normalized coordinates and position data for zoom updates
          linkElement.dataset.xNorm = xNorm.toString();
          linkElement.dataset.yNorm = yNorm.toString();
          linkElement.dataset.yOffset = yOffset.toString();
          linkElement.dataset.locked = savedPos.locked ? 'true' : 'false';
          
          console.log(`💾 Using saved position for tab ${tab}: (${xPosition.toFixed(1)}, ${yPosition.toFixed(1)}) from normalized (${xNorm}, ${yNorm}) with yOffset ${yOffset}px`);
        }
        // Priority 2: Try to use detected position
        else {
          const detected = tabPositions.get(tab.toString());
          if (detected) {
            // Use detected position with normalized coordinates
            const canvasWidth = parseFloat(canvas.dataset.originalWidth || '595');
            const canvasHeight = parseFloat(canvas.dataset.originalHeight || '842');
            
            xPosition = detected.x;
            yPosition = detected.y;
            
            // Store normalized coordinates for zoom consistency
            linkElement.dataset.xNorm = (detected.x / canvasWidth).toString();
            linkElement.dataset.yNorm = (detected.y / canvasHeight).toString();
            linkElement.dataset.yOffset = '0';
            linkElement.dataset.locked = 'false';
            
            console.log(`🎯 Using detected position for tab ${tab}: (${xPosition.toFixed(1)}, ${yPosition.toFixed(1)})`);
          }
          // Priority 3: Fallback position
          else {
            // Use fallback spacing for unsaved tabs
            const tabIndex = page2Links.findIndex(link => link.tab === tab);
            xPosition = 50; // Far left fallback
            yPosition = 50 + (tabIndex * 40); // Spaced vertically by 40px
            
            // Store normalized coordinates for zoom consistency
            const canvasWidth = parseFloat(canvas.dataset.originalWidth || '595');
            const canvasHeight = parseFloat(canvas.dataset.originalHeight || '842');
            linkElement.dataset.xNorm = (xPosition / canvasWidth).toString();
            linkElement.dataset.yNorm = (yPosition / canvasHeight).toString();
            linkElement.dataset.yOffset = '0';
            linkElement.dataset.locked = 'false';
            
            console.log(`📍 Using fallback position for tab ${tab}: (${xPosition.toFixed(1)}, ${yPosition.toFixed(1)})`);
          }
        }

        // Apply positioning and styling
        linkElement.style.position = 'absolute';
        linkElement.style.left = `${xPosition}px`;
        linkElement.style.top = `${yPosition}px`;
        linkElement.style.transform = 'translate(-50%, -50%)';
        linkElement.style.background = '#3b82f6';
        linkElement.style.color = 'white';
        linkElement.style.padding = '4px 8px';
        linkElement.style.borderRadius = '4px';
        linkElement.style.fontSize = '12px';
        linkElement.style.fontWeight = 'bold';
        linkElement.style.textDecoration = 'none';
        linkElement.style.border = '2px solid #1d4ed8';
        linkElement.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
        linkElement.style.zIndex = '30';
        linkElement.style.cursor = isDragState[getLinkId(tab.toString(), 2)] ? 'grabbing' : 'grab';
        linkElement.style.userSelect = 'none';
        linkElement.style.pointerEvents = 'auto';

        // Track drag state for this specific link
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let dragStartPageX = 0;
        let dragStartPageY = 0;

        const handleMouseDown = (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          isDragging = true;
          
          // Store starting positions
          dragStartX = xPosition;
          dragStartY = yPosition;
          dragStartPageX = e.pageX;
          dragStartPageY = e.pageY;
          
          linkElement.style.cursor = 'grabbing';
          handleDragStart(tab.toString(), 2);
          
          console.log(`🖱️ Started dragging tab ${tab} link from (${dragStartX.toFixed(1)}, ${dragStartY.toFixed(1)})`);
        };

        const handleMouseMove = (e: MouseEvent) => {
          if (!isDragging) return;
          
          e.preventDefault();
          
          // Calculate new position based on mouse movement
          const deltaX = e.pageX - dragStartPageX;
          const deltaY = e.pageY - dragStartPageY;
          
          // Apply zoom factor to delta for consistent movement
          const adjustedDeltaX = deltaX / zoom;
          const adjustedDeltaY = deltaY / zoom;
          
          const newX = dragStartX + adjustedDeltaX;
          const newY = dragStartY + adjustedDeltaY;
          
          // Update position immediately for smooth dragging
          linkElement.style.left = `${newX}px`;
          linkElement.style.top = `${newY}px`;
          
          // Store current position for saving
          xPosition = newX;
          yPosition = newY;
        };

        const handleMouseUp = (e: MouseEvent) => {
          if (!isDragging) return;
          
          e.preventDefault();
          isDragging = false;
          linkElement.style.cursor = 'grab';
          
          // Calculate final position
          const deltaX = e.pageX - dragStartPageX;
          const deltaY = e.pageY - dragStartPageY;
          const adjustedDeltaX = deltaX / zoom;
          const adjustedDeltaY = deltaY / zoom;
          
          const finalX = dragStartX + adjustedDeltaX;
          const finalY = dragStartY + adjustedDeltaY;
          
          // Calculate yOffset from original position
          const originalCanvasHeight = parseFloat(canvas.dataset.originalHeight || '842');
          const originalYNorm = parseFloat(linkElement.dataset.yNorm || '0');
          const originalY = originalYNorm * originalCanvasHeight;
          const yOffset = finalY - originalY;
          
          // Update normalized coordinates
          const canvasWidth = parseFloat(canvas.dataset.originalWidth || '595');
          const canvasHeight = parseFloat(canvas.dataset.originalHeight || '842');
          const newXNorm = finalX / canvasWidth;
          const newYNorm = originalYNorm; // Keep original yNorm, use yOffset for adjustment
          
          // Store in element for next zoom update
          linkElement.dataset.xNorm = newXNorm.toString();
          linkElement.dataset.yNorm = newYNorm.toString();
          linkElement.dataset.yOffset = yOffset.toString();
          
          console.log(`🎯 Tab ${tab} dragged to: (${finalX.toFixed(1)}, ${finalY.toFixed(1)}) | xNorm: ${newXNorm.toFixed(3)}, yNorm: ${newYNorm.toFixed(3)}, yOffset: ${yOffset.toFixed(1)}px`);
          
          // Save position to memory immediately
          savePosition(tab.toString(), 2, newXNorm, newYNorm, yOffset);
          
          handleDragEnd(tab.toString(), 2);
        };

        const handleClick = (e: MouseEvent) => {
          e.preventDefault();
          
          // Only navigate if we weren't dragging
          if (!isDragging) {
            navigateToPage(page);
            console.log(`🔗 Page 2 overlay link clicked: navigating to page ${page}`);
          }
        };
        
        // Attach event handlers
        linkElement.addEventListener('mousedown', handleMouseDown);
        linkElement.addEventListener('click', handleClick);
        
        // Global event listeners for mouse move and up (attached during drag)
        const startGlobalListeners = () => {
          document.addEventListener('mousemove', handleMouseMove);
          document.addEventListener('mouseup', handleMouseUp);
        };
        
        // Start global listeners when dragging begins
        linkElement.addEventListener('mousedown', startGlobalListeners);

        linkOverlay.appendChild(linkElement);
      });
      
      console.log(`🔗 Added ${page2Links.length} overlay links to page 2`);
      
    } catch (error) {
      console.warn('Error rendering page 2 overlay links:', error);
      
      // Fallback: render links without text detection if PDF reading fails
      page2Links.forEach(({ tab, page }, index) => {
        const linkElement = document.createElement('a');
        linkElement.className = 'hl-overlay-link';
        linkElement.textContent = `p.${page}`;
        linkElement.href = 'javascript:void(0)';
        
        // Priority 1: Use saved position if available
        const savedPos = getSavedPosition(tab.toString(), 2);
        let xPosition, yPosition;
        
        if (savedPos && savedPos.xNorm && savedPos.yNorm) {
          // Use saved position with normalized coordinates
          const canvasWidth = parseFloat(canvas.dataset.originalWidth || '595');
          const canvasHeight = parseFloat(canvas.dataset.originalHeight || '842');
          
          const xNorm = parseFloat(savedPos.xNorm.toString());
          const yNorm = parseFloat(savedPos.yNorm.toString());
          const yOffset = savedPos.yOffset || 0;
          
          xPosition = xNorm * canvasWidth;
          yPosition = (yNorm * canvasHeight) + (yOffset * zoom);
          
          linkElement.dataset.xNorm = xNorm.toString();
          linkElement.dataset.yNorm = yNorm.toString();
          linkElement.dataset.yOffset = yOffset.toString();
          linkElement.dataset.locked = savedPos.locked ? 'true' : 'false';
          
          console.log(`💾 Using saved position for tab ${tab}: (${xPosition.toFixed(1)}, ${yPosition.toFixed(1)}) from normalized (${xNorm}, ${yNorm}) with yOffset ${yOffset}px`);
        } else {
          // Use fallback spacing for unsaved tabs
          xPosition = 50; // Far left fallback
          yPosition = 50 + (index * 40); // Spaced vertically by 40px
          
          // Store normalized coordinates for zoom consistency
          const canvasWidth = parseFloat(canvas.dataset.originalWidth || '595');
          const canvasHeight = parseFloat(canvas.dataset.originalHeight || '842');
          linkElement.dataset.xNorm = (xPosition / canvasWidth).toString();
          linkElement.dataset.yNorm = (yPosition / canvasHeight).toString();
          linkElement.dataset.yOffset = '0';
          linkElement.dataset.locked = 'false';
          
          console.log(`📍 Using fallback position for tab ${tab}: (${xPosition.toFixed(1)}, ${yPosition.toFixed(1)})`);
        }

        // Apply positioning and styling
        linkElement.style.position = 'absolute';
        linkElement.style.left = `${xPosition}px`;
        linkElement.style.top = `${yPosition}px`;
        linkElement.style.transform = 'translate(-50%, -50%)';
        linkElement.style.background = '#3b82f6';
        linkElement.style.color = 'white';
        linkElement.style.padding = '4px 8px';
        linkElement.style.borderRadius = '4px';
        linkElement.style.fontSize = '12px';
        linkElement.style.fontWeight = 'bold';
        linkElement.style.textDecoration = 'none';
        linkElement.style.border = '2px solid #1d4ed8';
        linkElement.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
        linkElement.style.zIndex = '30';
        linkElement.style.cursor = 'grab';
        linkElement.style.userSelect = 'none';
        linkElement.style.pointerEvents = 'auto';

        // Navigation handler
        const handleClick = (e: MouseEvent) => {
          e.preventDefault();
          
          // Only navigate if we weren't dragging
          if (!isDragging) {
            navigateToPage(page);
            console.log(`🔗 Page 2 fallback link clicked: navigating to page ${page}`);
          }
        };
        
        // Attach event handlers
        linkElement.addEventListener('click', handleClick);

        linkOverlay.appendChild(linkElement);
      });
      
      console.log(`🔗 Added ${page2Links.length} overlay links to page 2 (fallback positioning)`);
    }
  };

  // 🎯 Enhanced async navigation with on-demand rendering
  const navigateToPage = async (pageNumber: number) => {
    if (onNavigateToPage) {
      onNavigateToPage(pageNumber);
      return;
    }
    
    if (!pdf) {
      console.warn('⚠️ PDF not loaded yet');
      return;
    }
    
    // Clamp to valid range
    const targetPage = Math.max(1, Math.min(pageNumber, pdf.numPages));
    currentPageRef.current = targetPage;
    
    try {
      // Ensure target page is rendered
      await ensurePageRendered(targetPage);
      
      // Preload neighbor pages for smooth navigation
      for (let i = 1; i <= PRELOAD_NEIGHBORS; i++) {
        const prevPage = targetPage - i;
        const nextPage = targetPage + i;
        
        if (prevPage >= 1) {
          ensurePageRendered(prevPage); // Don't await - background loading
        }
        if (nextPage <= pdf.numPages) {
          ensurePageRendered(nextPage); // Don't await - background loading  
        }
      }
      
      // Scroll to target page
      if (containerRef.current) {
        const targetPageElement = containerRef.current.querySelector(`[data-page="${targetPage}"]`);
        if (targetPageElement) {
          targetPageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          console.log(`📍 Navigated to page ${targetPage}`);
        }
      }
      
      // Prune distant pages to manage memory
      setTimeout(() => pruneRenderedPages(), 1000); // Delayed to avoid interrupting navigation
      
    } catch (error) {
      console.error(`❌ Navigation to page ${targetPage} failed:`, error);
    }
  };

  // Effect 5: Initialize dynamic page rendering system
  useEffect(() => {
    if (!pdf || !containerRef.current) return;
    
    const container = containerRef.current;
    container.innerHTML = "";
    
    // Clear and reset the page registry
    renderedPagesRef.current.clear();
    console.log(`🔄 Initialized dynamic rendering for PDF with ${pdf.numPages} pages`);
    
    // Initialize with the starting page range or current page
    const initializePages = async () => {
      try {
        // Start with current page if available, otherwise start page
        const initialPage = currentPageRef.current || start || 1;
        
        console.log(`🎯 Initial page rendering: ${initialPage}`);
        
        // Ensure initial page is rendered
        await ensurePageRendered(initialPage);
        
        // Background preload of neighbor pages
        for (let i = 1; i <= PRELOAD_NEIGHBORS; i++) {
          const prevPage = initialPage - i;
          const nextPage = initialPage + i;
          
          if (prevPage >= 1) {
            ensurePageRendered(prevPage); // Don't await - background loading
          }
          if (nextPage <= pdf.numPages) {
            ensurePageRendered(nextPage); // Don't await - background loading
          }
        }
        
        // Scroll to initial page if needed
        setTimeout(() => {
          if (containerRef.current) {
            const initialPageElement = containerRef.current.querySelector(`[data-page="${initialPage}"]`);
            if (initialPageElement) {
              initialPageElement.scrollIntoView({ behavior: 'auto', block: 'start' });
              console.log(`📍 Scrolled to initial page ${initialPage}`);
            }
          }
        }, 100);
        
        // Schedule memory management
        setTimeout(() => pruneRenderedPages(), 1000);
        
      } catch (error) {
        console.error('❌ Failed to initialize dynamic rendering:', error);
      }
    };
    
    // Start initialization
    initializePages();
    
    // Cleanup function
    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
      renderedPagesRef.current.clear();
    };

    // Function to render orange highlighted index lines with blue LINK X buttons
    const renderHighlightsForPage = (pageNum: number, overlay: HTMLElement, canvas: HTMLCanvasElement) => {
      const pageHighlights = highlights.filter(h => h.page === pageNum);
      
      pageHighlights.forEach((highlight, index) => {
        if (highlight.type === 'orange-index') {
          // Create orange highlighted background
          const highlightBox = document.createElement('div');
          highlightBox.className = 'absolute rounded-lg pointer-events-auto';
          
          // Orange background with 30% opacity as specified
          highlightBox.style.background = 'rgba(255, 165, 0, 0.3)';
          highlightBox.style.border = '2px solid rgb(255, 165, 0)';
          highlightBox.style.left = `${highlight.x0 * 100}%`;
          highlightBox.style.top = `${highlight.y0 * 100}%`;
          highlightBox.style.width = `${(highlight.x1 - highlight.x0) * 100}%`;
          highlightBox.style.height = `${(highlight.y1 - highlight.y0) * 100}%`;
          highlightBox.style.zIndex = '25';
          
          // Create blue "LINK X" button
          const linkButton = document.createElement('button');
          linkButton.className = 'absolute bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-2 py-1 rounded shadow-lg transition-colors';
          linkButton.style.right = '-10px';
          linkButton.style.top = '50%';
          linkButton.style.transform = 'translateY(-50%)';
          linkButton.style.zIndex = '30';
          linkButton.textContent = `LINK ${highlight.tabNumber || index + 1}`;
          
          // Add click handler for creating tab items
          linkButton.onclick = (e) => {
            e.stopPropagation();
            const tabNumber = highlight.tabNumber || String(index + 1);
            const title = highlight.text || `Tab ${tabNumber}`;
            
            if (onCreateTabItem) {
              onCreateTabItem(highlight, tabNumber, title);
            }
          };
          
          highlightBox.appendChild(linkButton);
          overlay.appendChild(highlightBox);
          
        } else if (highlight.type === 'circle') {
          // Create draggable orange circle for manual placement
          const circle = document.createElement('div');
          circle.className = 'absolute rounded-full bg-orange-500 border-4 border-orange-600 cursor-move pointer-events-auto flex items-center justify-center text-white font-bold text-sm shadow-lg';
          circle.style.width = '40px';
          circle.style.height = '40px';
          circle.style.left = `${highlight.x0 * 100}%`;
          circle.style.top = `${highlight.y0 * 100}%`;
          circle.style.zIndex = '35';
          circle.textContent = highlight.tabNumber || String(index + 1);
          
          // Add drag functionality (basic implementation)
          let isDragging = false;
          circle.onmousedown = (e) => {
            isDragging = true;
            e.stopPropagation();
          };
          
          document.onmousemove = (e) => {
            if (isDragging) {
              const rect = overlay.getBoundingClientRect();
              const newX = (e.clientX - rect.left) / rect.width;
              const newY = (e.clientY - rect.top) / rect.height;
              circle.style.left = `${Math.max(0, Math.min(95, newX * 100))}%`;
              circle.style.top = `${Math.max(0, Math.min(95, newY * 100))}%`;
            }
          };
          
          document.onmouseup = () => {
            isDragging = false;
          };
          
          overlay.appendChild(circle);
        }
      });
    };

    // Function to render page 2 overlay links (p.N labels)
    // Function to detect tab numbers using pdf.js text extraction
    const detectTabNumbers = async (page: any, viewport: any): Promise<{tab: string, x: number, y: number}[]> => {
      try {
        const textContent = await page.getTextContent({ 
          normalizeWhitespace: true, 
          includeMarkedContent: true 
        });
        const detectedTabs: {tab: string, x: number, y: number}[] = [];
        
        // Always log text extraction results for debugging
        console.log(`🔍 DEBUG: Found ${textContent.items.length} text items on page 2`);
        
        // If no text layer, this is likely an image-only PDF
        if (textContent.items.length === 0) {
          console.log(`📸 Image-only PDF detected on page 2 - no text layer for auto-alignment`);
          return detectedTabs;
        }
        
        // Group text items into lines by y-coordinate clustering
        const lines = new Map();
        const yTolerance = 5; // pixels tolerance for grouping items into same line
        
        for (const item of textContent.items) {
          const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
          
          // Find existing line within tolerance or create new one
          let lineY = null;
          for (const existingY of Array.from(lines.keys())) {
            if (Math.abs(y - existingY) <= yTolerance) {
              lineY = existingY;
              break;
            }
          }
          
          if (lineY === null) {
            lineY = y;
            lines.set(lineY, []);
          }
          
          lines.get(lineY).push({ text: item.str, x, y });
        }
        
        // Process each line for tab number detection
        for (const [lineY, items] of Array.from(lines.entries())) {
          // Sort items in line by x-coordinate and join text
          items.sort((a: any, b: any) => a.x - b.x);
          const lineText = items.map((item: any) => item.text).join(' ').trim();
          const leftmostX = items[0].x;
          const xNorm = leftmostX / viewport.width;
          
          // Check if line starts with a tab number pattern (broader matching)
          // Match patterns like: "1.", "1)", "Tab 1", "Item 1", "1. Exhibit A...", etc.
          const tabMatch = lineText.match(/^\s*(?:tab\s*|item\s*)?(\d{1,3})\b/i);
          if (tabMatch) {
            const tabNumber = tabMatch[1];
            
            // Only include tabs that are in the left portion of the page
            if (xNorm < 0.5 && parseInt(tabNumber) >= 1 && parseInt(tabNumber) <= 20) {
              console.log(`🔍 Found tab line: "${lineText}" at (${leftmostX.toFixed(1)}, ${lineY.toFixed(1)}) xNorm=${xNorm.toFixed(2)}`);
              detectedTabs.push({
                tab: tabNumber,
                x: leftmostX,
                y: lineY
              });
            }
          }
        }
        
        // Debug: Show sample text items if no tabs detected
        if (detectedTabs.length === 0 && textContent.items.length > 0) {
          console.log(`🔍 DEBUG: No tab patterns found. Sample text items:`);
          textContent.items.slice(0, 10).forEach((item: any, i: number) => {
            const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
            const xNorm = x / viewport.width;
            console.log(`  ${i}: "${item.str}" at (${x.toFixed(1)}, ${y.toFixed(1)}) xNorm=${xNorm.toFixed(2)}`);
          });
        }
        
        console.log(`🔍 Auto-detected ${detectedTabs.length} tab numbers on page 2:`, detectedTabs);
        return detectedTabs;
      } catch (error) {
        console.warn('Error detecting tab numbers:', error);
        return [];
      }
    };

    const renderPage2OverlayLinks = async (pageNum: number, overlay: HTMLElement, canvas: HTMLCanvasElement) => {
      // Only render on page 2
      if (pageNum !== 2 || !showPage2Links || !page2Links.length) return;

      // Create the overlay layer specifically for page 2 links
      let linkOverlay = overlay.querySelector('.hl-overlay-layer');
      if (!linkOverlay) {
        linkOverlay = document.createElement('div');
        linkOverlay.className = 'hl-overlay-layer';
        overlay.appendChild(linkOverlay);
      }

      // Clear any existing links
      linkOverlay.innerHTML = '';

      try {
        // Try to get the PDF page for text extraction
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1 });
        
        // Detect tab numbers using text extraction
        const detectedTabs = await detectTabNumbers(page, viewport);
        
        // Create a map of detected tab positions
        const tabPositions = new Map<string, {x: number, y: number}>();
        detectedTabs.forEach(({ tab, x, y }) => {
          tabPositions.set(tab, { x, y });
        });

        // Create links for each tab mapping
        page2Links.forEach(({ tab, page }) => {
          // Create the clickable link element first
          const linkElement = document.createElement('a');
          linkElement.className = 'hl-overlay-link';
          linkElement.textContent = `p.${page}`;
          linkElement.href = 'javascript:void(0)';
          
          let xPosition, yPosition;
          
          // Priority 1: Use saved position if available
          const savedPos = getSavedPosition(tab.toString(), 2);
          console.log(`🔍 DEBUG: Checking saved position for tab ${tab}:`, savedPos);
          console.log(`🔍 DEBUG: Available saved positions:`, savedPositions);
          
          if (savedPos && savedPos.xNorm && savedPos.yNorm) {
            // Use saved position with normalized coordinates
            const canvasWidth = parseFloat(canvas.dataset.originalWidth || '595');
            const canvasHeight = parseFloat(canvas.dataset.originalHeight || '842');
            
            // Convert saved normalized coordinates to pixel positions
            const xNorm = parseFloat(savedPos.xNorm.toString());
            const yNorm = parseFloat(savedPos.yNorm.toString());
            const yOffset = savedPos.yOffset || 0; // Get yOffset from saved position
            
            xPosition = xNorm * canvasWidth;
            // CRITICAL: Update positioning math to include yOffset
            yPosition = (yNorm * canvasHeight) + (yOffset * zoom);
            
            // Store normalized coordinates and position data for zoom updates
            linkElement.dataset.xNorm = xNorm.toString();
            linkElement.dataset.yNorm = yNorm.toString();
            linkElement.dataset.yOffset = yOffset.toString();
            linkElement.dataset.locked = savedPos.locked ? 'true' : 'false';
            
            console.log(`💾 Using saved position for tab ${tab}: (${xPosition.toFixed(1)}, ${yPosition.toFixed(1)}) from normalized (${xNorm}, ${yNorm}) with yOffset ${yOffset}px`);
          }
          // Priority 2: Try to use detected position
          else {
            const detected = tabPositions.get(tab.toString());
            if (detected) {
            // Use detected position with normalized coordinates
            const canvasWidth = parseFloat(canvas.dataset.originalWidth || '595');
            const canvasHeight = parseFloat(canvas.dataset.originalHeight || '842');
            
            // Position the link slightly to the right of the detected tab number
            // Store positions as normalized percentages for zoom compatibility
            const xNorm = (detected.x + 40) / canvasWidth;
            const yNorm = detected.y / canvasHeight;
            
            xPosition = xNorm * canvasWidth;
            yPosition = yNorm * canvasHeight;
            
            // Store normalized coordinates for zoom updates
            linkElement.dataset.xNorm = xNorm.toString();
            linkElement.dataset.yNorm = yNorm.toString();
            
              console.log(`🎯 Using auto-aligned position for tab ${tab}: (${xPosition.toFixed(1)}, ${yPosition.toFixed(1)})`);
            } else {
              // Priority 3: Fallback to fixed positions if detection fails
              const baseY = 120;
              const rowHeight = 24;
              yPosition = baseY + ((tab - 1) * rowHeight);
              xPosition = 50;
              
              // For fallback positioning, store normalized coordinates
              const canvasWidth = parseFloat(canvas.dataset.originalWidth || '595');
              const canvasHeight = parseFloat(canvas.dataset.originalHeight || '842');
              linkElement.dataset.xNorm = (xPosition / canvasWidth).toString();
              linkElement.dataset.yNorm = (yPosition / canvasHeight).toString();
              
              console.log(`📍 Using fallback position for tab ${tab}: (${xPosition}, ${yPosition})`);
            }
          }
          
          // Get link ID for state management
          const linkId = getLinkId(tab.toString(), 2);
          
          // Enhanced base styling
          linkElement.style.backgroundColor = '#3b82f6'; // blue-500
          linkElement.style.color = '#ffffff';
          linkElement.style.fontSize = '12px';
          linkElement.style.fontWeight = 'bold';
          linkElement.style.padding = '6px 10px';
          linkElement.style.borderRadius = '6px';
          linkElement.style.textDecoration = 'none';
          linkElement.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
          linkElement.style.border = '2px solid transparent';
          linkElement.style.transition = 'all 0.2s ease-in-out';
          linkElement.style.display = 'flex';
          linkElement.style.alignItems = 'center';
          linkElement.style.justifyContent = 'center';
          linkElement.style.minWidth = '32px';
          linkElement.style.height = '24px';
          
          // CRITICAL: Apply new positioning logic that includes yOffset
          const xNorm = parseFloat(linkElement.dataset.xNorm || '0');
          const yNorm = parseFloat(linkElement.dataset.yNorm || '0');
          const yOffset = parseInt(linkElement.dataset.yOffset || '0');
          const isLocked = linkElement.dataset.locked === 'true';
          
          // Calculate display position: displayTopPx = (yNorm * pageHeight) + (yOffset * zoom)
          const canvasWidth = parseFloat(canvas.dataset.originalWidth || '595');
          const canvasHeight = parseFloat(canvas.dataset.originalHeight || '842');
          const displayXPx = xNorm * canvasWidth;
          const displayYPx = (yNorm * canvasHeight) + (yOffset * zoom);
          
          // Convert back to percentages for CSS positioning
          const xPercent = (displayXPx / canvasWidth) * 100;
          const yPercent = (displayYPx / canvasHeight) * 100;
          
          linkElement.style.left = `${xPercent}%`;
          linkElement.style.top = `${yPercent}%`;
          linkElement.style.position = 'absolute';
          linkElement.style.pointerEvents = 'auto';
          linkElement.style.cursor = isLocked ? 'default' : 'grab'; // Disable cursor if locked
          linkElement.style.zIndex = '40';
          linkElement.style.userSelect = 'none';
          
          // Add loading indicator if positions are loading
          if (isLoadingPositions) {
            linkElement.style.opacity = '0.5';
            linkElement.innerHTML = `<div style="display: flex; align-items: center; gap: 4px;"><div style="width: 12px; height: 12px; border: 2px solid #ffffff; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div></div>`;
          }
          
          // Show success indicator if save was successful
          if (saveSuccess[linkId]) {
            linkElement.style.backgroundColor = '#10b981'; // green-500
            linkElement.style.border = '2px solid #059669'; // green-600
            linkElement.innerHTML = `<div style="display: flex; align-items: center; gap: 4px;">✓ p.${page}</div>`;
          }
          
          // Apply drag state styling
          if (dragState[linkId]) {
            linkElement.style.boxShadow = '0 8px 20px rgba(59, 130, 246, 0.4), 0 4px 8px rgba(0, 0, 0, 0.2)';
            linkElement.style.border = '2px solid #1d4ed8'; // blue-700
            linkElement.style.transform = 'scale(1.1)';
          }
          
          // Enhanced hover effects
          linkElement.addEventListener('mouseenter', () => {
            if (!dragState[linkId] && !saveSuccess[linkId]) {
              linkElement.style.backgroundColor = '#2563eb'; // blue-600
              linkElement.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)';
              linkElement.style.transform = 'scale(1.05)';
            }
          });
          
          linkElement.addEventListener('mouseleave', () => {
            if (!dragState[linkId] && !saveSuccess[linkId]) {
              linkElement.style.backgroundColor = '#3b82f6'; // blue-500
              linkElement.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
              linkElement.style.transform = 'scale(1)';
            }
          });
          
          // Drag state variables
          let isDragging = false;
          let dragStartX = 0;
          let dragStartY = 0;
          let linkStartX = 0;
          let linkStartY = 0;
          
          // Mouse down handler - start dragging
          const handleMouseDown = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Only handle left mouse button
            if (e.button !== 0) return;
            
            // CRITICAL: Skip dragging if link is locked
            const isLocked = linkElement.dataset.locked === 'true';
            if (isLocked) {
              console.log(`🔒 Dragging disabled for locked tab ${tab}`);
              return;
            }
            
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            
            // Get current percentage positions
            linkStartX = parseFloat(linkElement.dataset.xNorm || '0');
            linkStartY = parseFloat(linkElement.dataset.yNorm || '0');
            
            // Update drag state
            handleDragStart(tab.toString(), 2);
            
            // Enhanced visual feedback during drag
            linkElement.style.cursor = 'grabbing';
            linkElement.style.opacity = '0.9';
            linkElement.style.zIndex = '50';
            linkElement.style.backgroundColor = '#1e40af'; // blue-800
            linkElement.style.boxShadow = '0 12px 24px rgba(59, 130, 246, 0.5), 0 8px 16px rgba(0, 0, 0, 0.3)';
            linkElement.style.border = '2px solid #1d4ed8'; // blue-700
            linkElement.style.transform = 'scale(1.15) rotate(2deg)';
            
            // Prevent text selection during drag
            document.body.style.userSelect = 'none';
            
            console.log(`🔗 Started dragging link p.${page} from (${(linkStartX * 100).toFixed(1)}%, ${(linkStartY * 100).toFixed(1)}%)`);
          };
          
          // Mouse move handler - update position during drag
          const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            
            e.preventDefault();
            
            // Calculate mouse movement delta
            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY;
            
            // Get overlay bounding rect for coordinate conversion
            const overlayRect = overlay.getBoundingClientRect();
            
            // Convert pixel delta to percentage delta
            const deltaXPercent = (deltaX / overlayRect.width);
            const deltaYPercent = (deltaY / overlayRect.height);
            
            // Calculate new normalized position
            let newXNorm = linkStartX + deltaXPercent;
            let newYNorm = linkStartY + deltaYPercent;
            
            // Boundary checking - keep link within overlay bounds with some padding
            const linkPadding = 0.02; // 2% padding from edges
            newXNorm = Math.max(linkPadding, Math.min(0.95, newXNorm));
            newYNorm = Math.max(linkPadding, Math.min(0.95, newYNorm));
            
            // Update position using percentage coordinates
            const newXPercent = newXNorm * 100;
            const newYPercent = newYNorm * 100;
            
            linkElement.style.left = `${newXPercent}%`;
            linkElement.style.top = `${newYPercent}%`;
            
            // Update stored normalized coordinates
            linkElement.dataset.xNorm = newXNorm.toString();
            linkElement.dataset.yNorm = newYNorm.toString();
          };
          
          // Mouse up handler - end dragging
          const handleMouseUp = (e: MouseEvent) => {
            if (!isDragging) return;
            
            isDragging = false;
            
            // Update drag state
            handleDragEnd(tab.toString(), 2);
            
            // Restore visual state with smooth transition
            linkElement.style.cursor = 'grab';
            linkElement.style.opacity = '1';
            linkElement.style.zIndex = '40';
            linkElement.style.backgroundColor = '#3b82f6'; // blue-500
            linkElement.style.transform = 'scale(1)';
            
            // Briefly show saving state
            linkElement.style.backgroundColor = '#f59e0b'; // amber-500
            linkElement.innerHTML = `<div style="display: flex; align-items: center; gap: 4px;">💾 p.${page}</div>`;
            
            // Restore text selection
            document.body.style.userSelect = '';
            
            const finalX = parseFloat(linkElement.dataset.xNorm || '0') * 100;
            const finalY = parseFloat(linkElement.dataset.yNorm || '0') * 100;
            
            console.log(`🔗 Finished dragging link p.${page} to (${finalX.toFixed(1)}%, ${finalY.toFixed(1)}%)`);
            
            // Save the new position to backend
            const finalXNorm = parseFloat(linkElement.dataset.xNorm || '0');
            const finalYNorm = parseFloat(linkElement.dataset.yNorm || '0');
            savePosition(tab.toString(), finalXNorm, finalYNorm, 2);
            
            // Restore normal appearance after a brief delay
            setTimeout(() => {
              if (!saveSuccess[linkId]) {
                linkElement.style.backgroundColor = '#3b82f6'; // blue-500
                linkElement.innerHTML = `p.${page}`;
              }
            }, 1000);
            
            // Clean up global event listeners
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
          };
          
          // Navigation click handler (only when not dragging)
          const handleClick = (e: MouseEvent) => {
            e.preventDefault();
            
            // Only navigate if we weren't dragging
            if (!isDragging) {
              navigateToPage(page);
              console.log(`🔗 Page 2 link clicked: navigating to page ${page}`);
            }
          };
          
          // Attach event handlers
          linkElement.addEventListener('mousedown', handleMouseDown);
          linkElement.addEventListener('click', handleClick);
          
          // Global event listeners for mouse move and up (attached during drag)
          const startGlobalListeners = () => {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          };
          
          // Start global listeners when dragging begins
          linkElement.addEventListener('mousedown', startGlobalListeners);

          // CRITICAL: Create positioning controls for each p.N overlay link
          const createPositioningControls = () => {
            const controlsContainer = document.createElement('div');
            controlsContainer.className = 'hl-positioning-controls';
            controlsContainer.style.position = 'absolute';
            controlsContainer.style.display = 'flex';
            controlsContainer.style.flexDirection = 'column';
            controlsContainer.style.alignItems = 'center';
            controlsContainer.style.gap = '2px';
            controlsContainer.style.zIndex = '45';
            controlsContainer.style.pointerEvents = 'auto';
            
            // Position controls to the left of the link
            const controlsXPercent = Math.max(0, xPercent - 8); // 8% to the left
            controlsContainer.style.left = `${controlsXPercent}%`;
            controlsContainer.style.top = `${yPercent}%`;
            
            // Helper function to create control buttons
            const createControlButton = (content: string, onClick: () => void, testId: string, disabled = false) => {
              const button = document.createElement('button');
              button.innerHTML = content;
              button.onclick = onClick;
              button.setAttribute('data-testid', testId);
              button.style.width = '18px';
              button.style.height = '18px';
              button.style.fontSize = '12px';
              button.style.fontWeight = 'bold';
              button.style.backgroundColor = disabled ? '#9ca3af' : '#3b82f6'; // gray-400 or blue-500
              button.style.color = '#ffffff';
              button.style.border = 'none';
              button.style.borderRadius = '3px';
              button.style.cursor = disabled ? 'not-allowed' : 'pointer';
              button.style.display = 'flex';
              button.style.alignItems = 'center';
              button.style.justifyContent = 'center';
              button.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.1)';
              button.style.transition = 'all 0.2s ease-in-out';
              button.style.userSelect = 'none';
              button.disabled = disabled;
              
              if (!disabled) {
                button.addEventListener('mouseenter', () => {
                  button.style.backgroundColor = '#2563eb'; // blue-600
                  button.style.transform = 'scale(1.05)';
                });
                
                button.addEventListener('mouseleave', () => {
                  button.style.backgroundColor = '#3b82f6'; // blue-500
                  button.style.transform = 'scale(1)';
                });
              }
              
              return button;
            };
            
            // ▲ button - nudge up 2px (decrease yOffset by 2)
            const nudgeUpButton = createControlButton(
              '▲', 
              () => {
                const currentYOffset = parseInt(linkElement.dataset.yOffset || '0');
                const newYOffset = currentYOffset - 2; // Move up by decreasing yOffset
                
                updatePositionMutation.mutate({
                  tabNumber: tab.toString(),
                  yOffset: newYOffset
                });
                
                console.log(`⬆️ Nudging tab ${tab} up by 2px: yOffset ${currentYOffset} → ${newYOffset}`);
              },
              `button-nudge-up-${tab}`,
              isLocked // Disable when locked
            );
            
            // ▼ button - nudge down 2px (increase yOffset by 2)
            const nudgeDownButton = createControlButton(
              '▼', 
              () => {
                const currentYOffset = parseInt(linkElement.dataset.yOffset || '0');
                const newYOffset = currentYOffset + 2; // Move down by increasing yOffset
                
                updatePositionMutation.mutate({
                  tabNumber: tab.toString(),
                  yOffset: newYOffset
                });
                
                console.log(`⬇️ Nudging tab ${tab} down by 2px: yOffset ${currentYOffset} → ${newYOffset}`);
              },
              `button-nudge-down-${tab}`,
              isLocked // Disable when locked
            );
            
            // 🔒/🔓 lock toggle button
            const lockToggleButton = createControlButton(
              isLocked ? '🔒' : '🔓',
              () => {
                const currentLocked = linkElement.dataset.locked === 'true';
                const newLocked = !currentLocked;
                
                updatePositionMutation.mutate({
                  tabNumber: tab.toString(),
                  locked: newLocked
                });
                
                console.log(`🔒 Toggling lock for tab ${tab}: ${currentLocked} → ${newLocked}`);
              },
              `button-lock-toggle-${tab}`,
              false // Lock button is never disabled
            );
            
            // Add visual feedback states
            const linkId = getLinkId(tab.toString(), 2);
            
            // Show updating spinner
            if (isUpdating[linkId]) {
              const spinner = document.createElement('div');
              spinner.style.width = '12px';
              spinner.style.height = '12px';
              spinner.style.border = '2px solid #ffffff';
              spinner.style.borderTop = '2px solid transparent';
              spinner.style.borderRadius = '50%';
              spinner.style.animation = 'spin 1s linear infinite';
              spinner.style.marginBottom = '2px';
              controlsContainer.appendChild(spinner);
            }
            
            // Show success checkmark
            if (updateSuccess[linkId]) {
              const successIcon = document.createElement('div');
              successIcon.innerHTML = '✓';
              successIcon.style.color = '#10b981'; // green-500
              successIcon.style.fontSize = '14px';
              successIcon.style.fontWeight = 'bold';
              successIcon.style.marginBottom = '2px';
              controlsContainer.appendChild(successIcon);
            }
            
            // Add buttons to container (only show controls if not locked, except lock button)
            if (!isLocked) {
              controlsContainer.appendChild(nudgeUpButton);
              controlsContainer.appendChild(nudgeDownButton);
            }
            controlsContainer.appendChild(lockToggleButton);
            
            return controlsContainer;
          };
          
          // Add controls container to overlay
          const controlsContainer = createPositioningControls();
          linkOverlay.appendChild(controlsContainer);
          
          // Add the link to the overlay
          linkOverlay.appendChild(linkElement);
        });

        console.log(`🔗 Added ${page2Links.length} overlay links to page 2 (${detectedTabs.length} auto-aligned)`);
        
      } catch (error) {
        console.warn('Error in auto-alignment, using fixed positions:', error);
        
        // Fallback to original fixed positioning with drag functionality
        page2Links.forEach(({ tab, page }) => {
          const baseY = 120;
          const rowHeight = 24;
          const yPosition = baseY + ((tab - 1) * rowHeight);
          const xPosition = 50;

          const linkElement = document.createElement('a');
          linkElement.className = 'hl-overlay-link';
          linkElement.textContent = `p.${page}`;
          linkElement.href = 'javascript:void(0)';
          
          // Calculate normalized coordinates for fallback positioning
          const canvasWidth = parseFloat(canvas.dataset.originalWidth || '595');
          const canvasHeight = parseFloat(canvas.dataset.originalHeight || '842');
          const xNorm = xPosition / canvasWidth;
          const yNorm = yPosition / canvasHeight;
          
          // Store normalized coordinates
          linkElement.dataset.xNorm = xNorm.toString();
          linkElement.dataset.yNorm = yNorm.toString();
          
          // Position the link using percentage-based coordinates for zoom compatibility
          const xPercent = xNorm * 100;
          const yPercent = yNorm * 100;
          linkElement.style.left = `${xPercent}%`;
          linkElement.style.top = `${yPercent}%`;
          linkElement.style.position = 'absolute';
          linkElement.style.pointerEvents = 'auto';
          linkElement.style.cursor = 'grab';
          linkElement.style.zIndex = '40';
          linkElement.style.userSelect = 'none';
          linkElement.style.transition = 'opacity 0.2s ease-in-out';
          
          // Drag state variables
          let isDragging = false;
          let dragStartX = 0;
          let dragStartY = 0;
          let linkStartX = 0;
          let linkStartY = 0;
          
          // Mouse down handler - start dragging
          const handleMouseDown = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Only handle left mouse button
            if (e.button !== 0) return;
            
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            
            // Get current percentage positions
            linkStartX = parseFloat(linkElement.dataset.xNorm || '0');
            linkStartY = parseFloat(linkElement.dataset.yNorm || '0');
            
            // Visual feedback during drag
            linkElement.style.cursor = 'grabbing';
            linkElement.style.opacity = '0.7';
            linkElement.style.zIndex = '50';
            
            // Prevent text selection during drag
            document.body.style.userSelect = 'none';
            
            console.log(`🔗 Started dragging fallback link p.${page} from (${(linkStartX * 100).toFixed(1)}%, ${(linkStartY * 100).toFixed(1)}%)`);
          };
          
          // Mouse move handler - update position during drag
          const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            
            e.preventDefault();
            
            // Calculate mouse movement delta
            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY;
            
            // Get overlay bounding rect for coordinate conversion
            const overlayRect = overlay.getBoundingClientRect();
            
            // Convert pixel delta to percentage delta
            const deltaXPercent = (deltaX / overlayRect.width);
            const deltaYPercent = (deltaY / overlayRect.height);
            
            // Calculate new normalized position
            let newXNorm = linkStartX + deltaXPercent;
            let newYNorm = linkStartY + deltaYPercent;
            
            // Boundary checking - keep link within overlay bounds with some padding
            const linkPadding = 0.02; // 2% padding from edges
            newXNorm = Math.max(linkPadding, Math.min(0.95, newXNorm));
            newYNorm = Math.max(linkPadding, Math.min(0.95, newYNorm));
            
            // Update position using percentage coordinates
            const newXPercent = newXNorm * 100;
            const newYPercent = newYNorm * 100;
            
            linkElement.style.left = `${newXPercent}%`;
            linkElement.style.top = `${newYPercent}%`;
            
            // Update stored normalized coordinates
            linkElement.dataset.xNorm = newXNorm.toString();
            linkElement.dataset.yNorm = newYNorm.toString();
          };
          
          // Mouse up handler - end dragging
          const handleMouseUp = (e: MouseEvent) => {
            if (!isDragging) return;
            
            isDragging = false;
            
            // Restore visual state
            linkElement.style.cursor = 'grab';
            linkElement.style.opacity = '1';
            linkElement.style.zIndex = '40';
            
            // Restore text selection
            document.body.style.userSelect = '';
            
            const finalX = parseFloat(linkElement.dataset.xNorm || '0') * 100;
            const finalY = parseFloat(linkElement.dataset.yNorm || '0') * 100;
            
            console.log(`🔗 Finished dragging fallback link p.${page} to (${finalX.toFixed(1)}%, ${finalY.toFixed(1)}%)`);
            
            // Save the new position to backend
            const finalXNorm = parseFloat(linkElement.dataset.xNorm || '0');
            const finalYNorm = parseFloat(linkElement.dataset.yNorm || '0');
            savePosition(tab.toString(), finalXNorm, finalYNorm, page);
            
            // Clean up global event listeners
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
          };
          
          // Navigation click handler (only when not dragging)
          const handleClick = (e: MouseEvent) => {
            e.preventDefault();
            
            // Only navigate if we weren't dragging
            if (!isDragging) {
              navigateToPage(page);
              console.log(`🔗 Page 2 fallback link clicked: navigating to page ${page}`);
            }
          };
          
          // Attach event handlers
          linkElement.addEventListener('mousedown', handleMouseDown);
          linkElement.addEventListener('click', handleClick);
          
          // Global event listeners for mouse move and up (attached during drag)
          const startGlobalListeners = () => {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          };
          
          // Start global listeners when dragging begins
          linkElement.addEventListener('mousedown', startGlobalListeners);

          linkOverlay.appendChild(linkElement);
        });
        
        console.log(`🔗 Added ${page2Links.length} overlay links to page 2 (fallback positioning)`);
      }
    };

    // Show all pages as requested by user
    const lastPage = Math.min(end, pdf.numPages);
    
    
    // Render pages with zoom-controlled sizing
    for (let pageNum = start; pageNum <= lastPage; pageNum++) {
      const pageContainer = document.createElement('div');
      pageContainer.className = 'relative mb-4 bg-white rounded shadow-sm overflow-visible';
      pageContainer.style.width = 'max-content'; // Let content determine width
      pageContainer.style.maxWidth = 'none'; // Remove width constraints
      
      
      const canvas = document.createElement("canvas");
      canvas.dataset.page = String(pageNum);
      canvas.dataset.rendered = 'false';
      canvas.dataset.rendering = 'false';
      canvas.className = "w-full h-auto block";
      
      const pageLabel = document.createElement('div');
      pageLabel.className = 'absolute top-2 left-2 bg-black bg-opacity-60 text-white px-2 py-1 rounded text-sm z-10';
      pageLabel.textContent = `Page ${pageNum}`;
      pageContainer.appendChild(pageLabel);
      pageContainer.appendChild(canvas);
      
      // Add highlights overlay container
      const highlightOverlay = document.createElement('div');
      highlightOverlay.className = 'absolute inset-0 pointer-events-none';
      highlightOverlay.style.zIndex = '20';
      pageContainer.appendChild(highlightOverlay);
      
      renderPage(pageNum, canvas).then(() => {
        // Render highlights for this page after PDF is rendered
        if (showHighlightTools) {
          renderHighlightsForPage(pageNum, highlightOverlay, canvas);
        }
        
        // Render page 2 overlay links after PDF is rendered
        renderPage2OverlayLinks(pageNum, highlightOverlay, canvas);
      });
      
      container.appendChild(pageContainer);
    }
  }, [pdf, start, end, showPage2Links, page2Links]);


  if (error) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-100 rounded-lg">
        <div className="text-center p-8">
          <div className="text-6xl text-red-500 mb-4">⚠️</div>
          <h3 className="text-lg font-medium mb-2">PDF Loading Error</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.open(url, '_blank')}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Open in New Window
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-100 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading PDF document...</p>
        </div>
      </div>
    );
  }


  return (
    <div className="relative">
      {/* Loading overlay for saved positions */}
      {isLoadingPositions && showPage2Links && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          backgroundColor: 'rgba(59, 130, 246, 0.9)',
          color: '#ffffff',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 'bold',
          zIndex: '100',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{
            width: '12px',
            height: '12px',
            border: '2px solid #ffffff',
            borderTop: '2px solid transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}></div>
          Loading positions...
        </div>
      )}
      
      <div
        ref={viewerRef}
        className="h-[70vh] overflow-auto p-4 bg-slate-50 rounded-xl"
        style={{ 
          scrollBehavior: 'unset',
          scrollSnapType: 'none',
          overflowAnchor: 'none' // Prevent scroll anchoring
        }}
        aria-label="Index PDF Viewer"
      >
        <div
          ref={containerRef}
          style={{
            width: '100%',
            height: 'auto'
          }}
        />
      </div>
    </div>
  );
}