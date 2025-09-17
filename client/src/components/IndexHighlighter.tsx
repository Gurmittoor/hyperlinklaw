import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Rect = { x: number; y: number; w: number; h: number }; // normalized 0..1

interface IndexHighlighterProps {
  documentId: string;
  pageNumber: number;
  onCreated?: () => void;
  highlightMode?: "index" | "tab";
}

export default function IndexHighlighter({
  documentId,
  pageNumber,
  onCreated,
  highlightMode = "index"
}: IndexHighlighterProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Rect | null>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [autoHighlighting, setAutoHighlighting] = useState(false);
  const [highlightStatus, setHighlightStatus] = useState<{
    totalHighlights: number;
    itemsDetected: number;
    linksGenerated: number;
  } | null>(null);

  // Load existing highlight status on component mount
  useEffect(() => {
    loadHighlightStatus();
  }, [documentId]);

  async function loadHighlightStatus() {
    try {
      const response = await fetch(`/api/documents/${documentId}/highlight-status`);
      if (response.ok) {
        const status = await response.json();
        setHighlightStatus(status);
      }
    } catch (error) {
      console.error('Error loading highlight status:', error);
    }
  }

  // Draw a transparent overlay to capture drags
  function onMouseDown(e: React.MouseEvent) {
    if (!wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    setDrag({ x, y, w: 0, h: 0 });
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!drag || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const x2 = (e.clientX - r.left) / r.width;
    const y2 = (e.clientY - r.top) / r.height;
    setDrag({ 
      ...drag, 
      w: Math.max(0, x2 - drag.x), 
      h: Math.max(0, y2 - drag.y) 
    });
  }

  function onMouseUp() {
    if (drag && drag.w > 0.01 && drag.h > 0.01) {
      setRects([...rects, drag]);
    }
    setDrag(null);
  }

  async function save(rect: Rect) {
    if (!text.trim()) {
      alert("Please type the exact item text you want hyperlinked.");
      return;
    }

    setSaving(true);
    try {
      const endpoint = highlightMode === "tab" 
        ? `/api/documents/${documentId}/tab-highlights`
        : `/api/documents/${documentId}/index-highlights`;
      
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          pageNumber, 
          rect, 
          text: text.trim(),
          kind: highlightMode === "tab" ? "tab" : "index-row"
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to save ${highlightMode} highlight`);
      }

      setText("");
      setRects([]); // Clear drawn rectangles
      onCreated?.();
    } catch (error) {
      alert(`Failed to save ${highlightMode} highlight. Please try again.`);
      console.error("Save error:", error);
    } finally {
      setSaving(false);
    }
  }

  async function autoHighlightIndexItems() {
    setAutoHighlighting(true);
    try {
      console.log(`🎯 Starting dynamic auto-highlighting for document ${documentId}`);

      // Call the new dynamic auto-highlighting API
      const response = await fetch(`/api/documents/${documentId}/auto-highlight`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          maxPagesToSearch: 15,
          enableAiHyperlinking: true
        })
      });

      const result = await response.json();

      if (result.success) {
        // Update highlight status
        await loadHighlightStatus();
        
        let message = `✅ Auto-highlighting complete!\n\n`;
        message += `📊 Found ${result.itemsDetected} INDEX items\n`;
        message += `🎯 Created ${result.highlightsCreated} highlights\n`;
        message += `📑 Searched pages: ${result.indexPages.join(', ')}\n`;
        message += `⏱️ Processing time: ${Math.round(result.processingTimeMs / 1000)}s\n\n`;
        
        if (result.highlightsCreated > 0) {
          message += `🤖 AI hyperlink generation started in background.\n`;
          message += `Check the "Saved Highlights" panel to see progress!`;
        } else {
          message += `ℹ️ No INDEX items detected in first 15 pages.\nTry running OCR on more pages first.`;
        }

        alert(message);
        onCreated?.();
      } else {
        throw new Error(result.error || 'Auto-highlighting failed');
      }

    } catch (error) {
      console.error("Auto-highlight error:", error);
      alert(`❌ Auto-highlighting failed: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease ensure OCR has processed some pages first.`);
    } finally {
      setAutoHighlighting(false);
    }
  }

  return (
    <div className="relative w-full h-[600px]">
      {/* Transparent overlay for drawing highlights */}
      <div
        ref={wrapRef}
        className="absolute inset-0 cursor-crosshair z-30"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        style={{ 
          pointerEvents: 'auto',
          width: '100%',
          height: '600px',
          backgroundColor: 'rgba(0,0,0,0.02)' // Slight transparency to show it's interactive
        }}
      />

      {/* Show drawn rectangles */}
      {rects.map((r, i) => (
        <div
          key={i}
          className="absolute border-2 border-yellow-400 bg-gray-800/90 rounded pointer-events-none z-20"
          title="Yellow highlighted area for INDEX item"
          style={{
            left: `${r.x * 100}%`,
            top: `${r.y * 100}%`,
            width: `${r.w * 100}%`,
            height: `${r.h * 100}%`
          }}
        />
      ))}

      {/* Show current drag rectangle */}
      {drag && (
        <div
          className="absolute border-2 border-yellow-400 bg-gray-800/70 rounded pointer-events-none z-20"
          style={{
            left: `${drag.x * 100}%`,
            top: `${drag.y * 100}%`,
            width: `${drag.w * 100}%`,
            height: `${drag.h * 100}%`
          }}
        />
      )}

      {/* Text input and save panel */}
      {rects.length > 0 && (
        <div className="absolute bottom-4 left-4 right-4 bg-white dark:bg-slate-800 rounded-lg shadow-lg border p-4 z-30">
          <div className="space-y-3">
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
              💡 Type the exact {highlightMode.toUpperCase()} item text to hyperlink:
            </div>
            <Input
              placeholder={highlightMode === "tab" ? "e.g., 'Tab 1', 'Tab 2'" : "e.g., 'Trial Scheduling Endorsement Form'"}
              value={text}
              onChange={e => setText(e.target.value)}
              className="font-mono text-sm"
              data-testid="input-highlight-text"
            />
            <div className="flex gap-2">
              <Button 
                onClick={() => save(rects[rects.length - 1])}
                disabled={saving || !text.trim()}
                className="bg-gray-800 hover:bg-gray-900 text-yellow-400 border border-yellow-400"
                data-testid="button-save-highlight"
              >
                {saving ? "Saving..." : `📌 Save ${highlightMode === "tab" ? "Tab" : "Index"} Highlight`}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setRects([]);
                  setText("");
                }}
                data-testid="button-clear-highlight"
              >
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-highlight button and status when no rectangles drawn */}
      {rects.length === 0 && !drag && (
        <div className="absolute top-4 left-4 right-4 z-30">
          <div className="bg-slate-900/90 text-white p-4 rounded-lg border border-yellow-400">
            <div className="text-center space-y-3">
              <div className="text-lg font-medium">🎯 Dynamic INDEX Highlighting</div>
              <div className="text-sm text-gray-300">
                Automatically detect and highlight INDEX items from OCR text with AI-powered hyperlink generation
              </div>
              
              {highlightStatus && (
                <div className="text-xs bg-gray-800/70 rounded p-2 space-y-1">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-yellow-400 font-medium">{highlightStatus.itemsDetected}</div>
                      <div className="text-gray-400">Items Found</div>
                    </div>
                    <div>
                      <div className="text-green-400 font-medium">{highlightStatus.totalHighlights}</div>
                      <div className="text-gray-400">Highlights</div>
                    </div>
                    <div>
                      <div className="text-blue-400 font-medium">{highlightStatus.linksGenerated}</div>
                      <div className="text-gray-400">AI Links</div>
                    </div>
                  </div>
                </div>
              )}

              <Button 
                onClick={autoHighlightIndexItems}
                disabled={autoHighlighting}
                className="bg-yellow-500 hover:bg-yellow-600 text-black font-medium w-full"
                data-testid="button-auto-highlight"
              >
                {autoHighlighting ? "⏳ Scanning OCR Text..." : "⚡ Auto-Detect INDEX Items"}
              </Button>
              
              <div className="text-xs text-gray-400 border-t border-gray-600 pt-2 mt-2">
                Works with any document type • Adapts to varying item counts
              </div>
              <div className="text-xs text-gray-500">
                Or draw rectangles manually around specific items
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}