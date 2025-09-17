import { useEffect, useRef, useState } from "react";
import pdfjsLib from "@/lib/pdfjs";

type Highlight = {
  id: string;
  page_number: number;
  bbox: { x: number; y: number; width: number; height: number }; // normalized 0..1
  kind: "index-row" | "candidate-link" | "custom" | "tab" | "exhibit";
  label?: string;
  confidence?: number;
  source_item_id?: string;
};

interface PdfWithOverlayProps {
  fileUrl: string;
  documentId: string;
  selectedItemId?: string;
  onPageClick?: (pageNumber: number, x: number, y: number) => void;
}

export default function PdfWithOverlay({
  fileUrl,
  documentId,
  selectedItemId,
  onPageClick,
}: PdfWithOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [highlights, setHighlights] = useState<Record<number, Highlight[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load PDF document
  useEffect(() => {
    if (!fileUrl) return;
    
    setLoading(true);
    setError(null);
    
    const loadPdf = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument(fileUrl);
        const _pdf = await loadingTask.promise;
        setPdf(_pdf);
        console.log(`📄 PDF loaded: ${_pdf.numPages} pages`);
      } catch (err) {
        console.error('Error loading PDF:', err);
        setError('Failed to load PDF document');
      } finally {
        setLoading(false);
      }
    };

    loadPdf();
  }, [fileUrl]);

  // Load highlights for the document
  useEffect(() => {
    if (!documentId) return;

    const loadHighlights = async () => {
      try {
        const res = await fetch(`/api/documents/${documentId}/review-highlights`);
        if (!res.ok) {
          console.warn('Failed to load highlights:', res.status);
          return;
        }
        
        const all: Highlight[] = await res.json();
        const byPage: Record<number, Highlight[]> = {};
        
        all.forEach(h => {
          byPage[h.page_number] ??= [];
          byPage[h.page_number].push(h);
        });
        
        setHighlights(byPage);
        console.log(`🎯 Loaded ${all.length} highlights across ${Object.keys(byPage).length} pages`);
      } catch (err) {
        console.error('Error loading highlights:', err);
      }
    };

    loadHighlights();
  }, [documentId]);

  // Render PDF pages with overlays
  useEffect(() => {
    if (!pdf || !containerRef.current) return;

    const renderPdf = async () => {
      if (!containerRef.current) return;
      
      containerRef.current.innerHTML = "";
      const pages = Math.min(pdf.numPages, 50); // Limit to first 50 pages for performance

      for (let i = 1; i <= pages; i++) {
        try {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.2 });

          // Create canvas for PDF rendering
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d")!;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.display = "block";
          canvas.style.border = "1px solid #e5e7eb";

          // Create overlay for highlights
          const overlay = document.createElement("div");
          overlay.style.position = "absolute";
          overlay.style.left = "0";
          overlay.style.top = "0";
          overlay.style.width = `${viewport.width}px`;
          overlay.style.height = `${viewport.height}px`;
          overlay.style.pointerEvents = "none";
          overlay.style.zIndex = "10";

          // Page wrapper
          const pageWrap = document.createElement("div");
          pageWrap.style.position = "relative";
          pageWrap.style.margin = "16px auto";
          pageWrap.style.width = `${viewport.width}px`;
          pageWrap.style.height = `${viewport.height}px`;
          pageWrap.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.1)";
          
          // Add page number label
          const pageLabel = document.createElement("div");
          pageLabel.textContent = `Page ${i}`;
          pageLabel.style.position = "absolute";
          pageLabel.style.top = "-24px";
          pageLabel.style.left = "0";
          pageLabel.style.fontSize = "14px";
          pageLabel.style.fontWeight = "600";
          pageLabel.style.color = "#6b7280";
          pageWrap.appendChild(pageLabel);

          pageWrap.appendChild(canvas);
          pageWrap.appendChild(overlay);
          containerRef.current!.appendChild(pageWrap);

          // Render PDF page
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;

          // Add click handler for custom highlights
          if (onPageClick) {
            canvas.style.cursor = "crosshair";
            canvas.style.pointerEvents = "auto";
            canvas.addEventListener("click", (e) => {
              const rect = canvas.getBoundingClientRect();
              const x = (e.clientX - rect.left) / rect.width;
              const y = (e.clientY - rect.top) / rect.height;
              onPageClick(i, x, y);
            });
          }

          // Draw highlights for this page
          const pageHighlights = highlights[i] || [];
          pageHighlights.forEach(h => {
            const box = document.createElement("div");
            box.style.position = "absolute";
            box.style.left = `${h.bbox.x * viewport.width}px`;
            box.style.top = `${h.bbox.y * viewport.height}px`;
            box.style.width = `${h.bbox.width * viewport.width}px`;
            box.style.height = `${h.bbox.height * viewport.height}px`;
            box.style.borderRadius = "6px";
            box.style.pointerEvents = "auto";
            box.style.cursor = "pointer";
            
            // Color coding by type
            if (h.kind === "index-row") {
              box.style.background = "rgba(34,197,94,.18)";
              box.style.boxShadow = "0 0 0 2px rgba(34,197,94,.8) inset";
            } else if (h.kind === "candidate-link") {
              box.style.background = "rgba(59,130,246,.18)";
              box.style.boxShadow = "0 0 0 2px rgba(59,130,246,.8) inset";
            } else if (h.kind === "tab") {
              box.style.background = "rgba(168,85,247,.18)";
              box.style.boxShadow = "0 0 0 2px rgba(168,85,247,.8) inset";
            } else if (h.kind === "exhibit") {
              box.style.background = "rgba(251,146,60,.18)";
              box.style.boxShadow = "0 0 0 2px rgba(251,146,60,.8) inset";
            } else {
              box.style.background = "rgba(234,179,8,.18)";
              box.style.boxShadow = "0 0 0 2px rgba(234,179,8,.8) inset";
            }

            // Highlight selected item
            if (selectedItemId && h.source_item_id === selectedItemId) {
              box.style.background = "rgba(239,68,68,.25)";
              box.style.boxShadow = "0 0 0 3px rgba(239,68,68,.9) inset";
              box.style.animation = "pulse 2s infinite";
            }

            // Tooltip
            box.title = h.label || `${h.kind} (confidence: ${(h.confidence || 0) * 100}%)`;
            
            overlay.appendChild(box);
          });

        } catch (err) {
          console.error(`Error rendering page ${i}:`, err);
        }
      }
    };

    renderPdf();
  }, [pdf, highlights, selectedItemId, onPageClick]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-red-600 mb-2">Error loading PDF</p>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pdf-viewer">
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
      
      <div className="mb-4 text-sm text-gray-600">
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-3 bg-green-200 border-2 border-green-600 rounded"></div>
            <span>Index Items</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-3 bg-blue-200 border-2 border-blue-600 rounded"></div>
            <span>Link Candidates</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-3 bg-yellow-200 border-2 border-yellow-600 rounded"></div>
            <span>Custom Highlights</span>
          </div>
        </div>
      </div>
      
      <div ref={containerRef} className="pdf-container max-h-screen overflow-y-auto" />
    </div>
  );
}