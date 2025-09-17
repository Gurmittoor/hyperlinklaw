import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Highlighter } from "lucide-react";

interface OcrPageEditorProps {
  documentId: string;
  page: number;
  onSave?: () => void;
}

export default function OcrPageEditor({ documentId, page, onSave }: OcrPageEditorProps) {
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [originalText, setOriginalText] = useState("");
  const [saving, setSaving] = useState(false);
  const [isCorrected, setIsCorrected] = useState(false);
  const [highlights, setHighlights] = useState<Array<{id: string, text: string, start: number, end: number}>>([]);
  const [isHighlighting, setIsHighlighting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadPageText();
    loadHighlights();
  }, [documentId, page]);

  const loadPageText = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/pages/${page}/ocr`);
      if (response.ok) {
        const data = await response.json();
        setText(data.text || "");
        setOriginalText(data.text || "");
        setIsCorrected(data.isCorrected || false);
      } else {
        toast({
          title: "Error",
          description: "Failed to load page text",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error", 
        description: "Failed to load page text",
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const loadHighlights = async () => {
    try {
      const response = await fetch(`/api/documents/${documentId}/pages/${page}/highlights`);
      if (response.ok) {
        const data = await response.json();
        setHighlights(data || []);
      }
    } catch (error) {
      console.error('Failed to load highlights:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/pages/${page}/ocr`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (response.ok) {
        setOriginalText(text);
        setIsCorrected(true);
        toast({
          title: "Success",
          description: "Page text saved successfully",
        });
        onSave?.();
      } else {
        toast({
          title: "Error",
          description: "Failed to save page text",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save page text", 
        variant: "destructive",
      });
    }
    setSaving(false);
  };

  const handleRevert = () => {
    setText(originalText);
  };

  const handleHighlight = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    if (start === end) {
      toast({
        title: "No text selected",
        description: "Please select text to highlight",
        variant: "destructive",
      });
      return;
    }

    const selectedText = text.substring(start, end);
    saveHighlight(selectedText, start, end);
  };

  const saveHighlight = async (selectedText: string, start: number, end: number) => {
    try {
      const context = text.substring(Math.max(0, start - 50), Math.min(text.length, end + 50));
      
      const response = await fetch(`/api/documents/${documentId}/pages/${page}/highlights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedText,
          startIndex: start,
          endIndex: end,
          context
        }),
      });

      if (response.ok) {
        const newHighlight = await response.json();
        setHighlights(prev => [...prev, {
          id: newHighlight.id,
          text: selectedText,
          start,
          end
        }]);
        toast({
          title: "Highlighted!",
          description: `"${selectedText.substring(0, 50)}${selectedText.length > 50 ? '...' : ''}" saved for AI hyperlinking`,
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to save highlight",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save highlight",
        variant: "destructive",
      });
    }
  };

  const clearHighlights = async () => {
    try {
      const response = await fetch(`/api/documents/${documentId}/pages/${page}/highlights`, {
        method: "DELETE",
      });

      if (response.ok) {
        setHighlights([]);
        toast({
          title: "Cleared",
          description: "All highlights removed",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear highlights",
        variant: "destructive",
      });
    }
  };

  const autoHighlightIndex = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/pages/${page}/auto-highlight-index`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (response.ok) {
        const result = await response.json();
        const { detectedItems, totalHighlighted } = result;
        
        // Add new highlights to state
        const newHighlights = detectedItems.map((item: any) => ({
          id: item.id,
          text: item.text,
          start: item.startIndex,
          end: item.endIndex
        }));
        
        setHighlights(prev => [...prev, ...newHighlights]);
        
        toast({
          title: "🎯 AI Auto-Highlighting Complete!",
          description: `Found and highlighted ${totalHighlighted} INDEX items automatically`,
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to auto-highlight INDEX items",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error", 
        description: "Failed to auto-highlight INDEX items",
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const processHighlights = async () => {
    if (highlights.length === 0) {
      toast({
        title: "No highlights",
        description: "Please highlight some text first",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(`/api/documents/${documentId}/process-highlights`, {
        method: "POST",
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: "AI Processing Complete!",
          description: `${result.message}`,
        });
        loadHighlights(); // Refresh to show updated status
      } else {
        toast({
          title: "Error",
          description: "Failed to process highlights with AI",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to process highlights with AI",
        variant: "destructive",
      });
    }
  };

  const renderTextWithHighlights = () => {
    if (highlights.length === 0 || !text) {
      return text || "";
    }

    // Sort highlights by start position to handle overlapping correctly
    const sortedHighlights = [...highlights].sort((a, b) => a.start - b.start);
    
    let result = [];
    let lastIndex = 0;

    sortedHighlights.forEach((highlight, index) => {
      // Validate highlight bounds
      const start = Math.max(0, Math.min(highlight.start || 0, text.length));
      const end = Math.max(start, Math.min(highlight.end || start, text.length));
      
      // Add text before highlight
      if (start > lastIndex) {
        result.push(
          <span key={`text-${index}-before`}>
            {text.substring(lastIndex, start)}
          </span>
        );
      }

      // Add highlighted text with persistent blue background
      result.push(
        <span 
          key={`highlight-${highlight.id}`} 
          className="bg-yellow-200 dark:bg-yellow-800 dark:text-yellow-100 px-1 rounded"
          style={{ 
            backgroundColor: '#fef3c7', // Persistent yellow highlight
            padding: '2px 4px',
            borderRadius: '3px',
            boxShadow: '0 0 0 1px rgba(251, 191, 36, 0.3)'
          }}
          title={`Highlighted for AI: "${highlight.text}"`}
        >
          {text.substring(start, end)}
        </span>
      );

      lastIndex = Math.max(lastIndex, end);
    });

    // Add remaining text after last highlight
    if (lastIndex < text.length) {
      result.push(
        <span key="text-after">
          {text.substring(lastIndex)}
        </span>
      );
    }

    return result;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-sm text-muted-foreground">Loading page text...</div>
      </div>
    );
  }

  const isDirty = text !== originalText;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-medium">Edit Page {page}</h3>
          {isCorrected && (
            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
              Corrected
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleHighlight}
            variant="outline"
            size="sm"
            className="bg-yellow-50 hover:bg-yellow-100 text-yellow-700 border-yellow-300"
            data-testid="button-highlight-text"
          >
            <Highlighter className="h-4 w-4 mr-1" />
            Highlight
          </Button>
          <Button
            onClick={autoHighlightIndex}
            variant="outline"
            size="sm"
            className="bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-300"
            data-testid="button-auto-highlight-index"
            disabled={loading}
          >
            🤖 Auto-Highlight INDEX
          </Button>
          {highlights.length > 0 && (
            <>
              <Button
                onClick={processHighlights}
                variant="outline"
                size="sm"
                className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300"
                data-testid="button-process-highlights"
              >
                🔗 Process with AI ({highlights.length})
              </Button>
              <Button
                onClick={clearHighlights}
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700"
                data-testid="button-clear-highlights"
              >
                Clear ({highlights.length})
              </Button>
            </>
          )}
          <Button
            onClick={handleRevert}
            disabled={!isDirty}
            variant="outline"
            size="sm"
            data-testid="button-revert-text"
          >
            Revert
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isDirty || saving}
            size="sm"
            data-testid="button-save-text"
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <div className="relative">
        {/* Highlighted Text Display - Read-only view with persistent highlights */}
        <div className="relative">
          <div 
            className="min-h-[60vh] font-mono text-sm p-3 border border-input rounded-md bg-background resize-none overflow-auto whitespace-pre-wrap break-words"
            style={{ lineHeight: '1.5' }}
            data-testid="highlighted-text-display"
          >
            {renderTextWithHighlights()}
          </div>
          {highlights.length > 0 && (
            <div className="absolute top-2 right-2 bg-yellow-100 border border-yellow-300 rounded px-2 py-1 text-xs text-yellow-700">
              📌 {highlights.length} yellow highlights for AI
            </div>
          )}
        </div>
        
        {/* Hidden textarea for text selection and editing */}
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="absolute inset-0 min-h-[60vh] font-mono text-sm opacity-0 pointer-events-auto z-10 resize-none"
          placeholder="OCR text will appear here..."
          spellCheck={false}
          data-testid="textarea-ocr-text"
          style={{ 
            background: 'transparent',
            border: 'none',
            outline: 'none'
          }}
        />
      </div>

      {isDirty && (
        <div className="text-xs text-amber-600">
          ⚠️ Unsaved changes
        </div>
      )}

      {highlights.length > 0 && (
        <div className="space-y-1">
          <div className="text-sm font-medium text-yellow-700">Highlighted Items:</div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {highlights.map((highlight, index) => (
              <div key={highlight.id} className="text-xs bg-yellow-50 border border-yellow-200 rounded p-2">
                <span className="font-medium">{index + 1}.</span> {(highlight.text || '').substring(0, 100)}{(highlight.text || '').length > 100 ? '...' : ''}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground space-y-1">
        <div>💡 <strong>Edit & Save:</strong> Fix missing numbered items like "1.", "2.", "3." to improve index detection</div>
        <div>🔍 <strong>Highlight & Link:</strong> Select text and click "Highlight" to mark items for AI hyperlink detection</div>
      </div>
    </div>
  );
}