import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface IndexLinkPanelProps {
  documentId: string;
}

interface IndexHighlight {
  id: string;
  documentId: string;
  pageNumber: number;
  rect: any;
  text: string;
  status: "new" | "linking" | "linked" | "failed";
  createdAt: string;
  targetPage?: number;
  confidence?: number;
  method?: string;
}

export default function IndexLinkPanel({ documentId }: IndexLinkPanelProps) {
  const [highlights, setHighlights] = useState<IndexHighlight[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkingIds, setLinkingIds] = useState<Set<string>>(new Set());

  const loadHighlights = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/documents/${documentId}/index-highlights`);
      if (response.ok) {
        const data = await response.json();
        setHighlights(data);
      }
    } catch (error) {
      console.error("Failed to load highlights:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHighlights();
  }, [documentId]);

  const linkOne = async (id: string) => {
    setLinkingIds(prev => new Set(prev).add(id));
    try {
      const response = await fetch(`/api/documents/${documentId}/index-highlights/${id}/link`, {
        method: "POST"
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log("Link result:", result);
        await loadHighlights(); // Refresh the list
      } else {
        console.error("Failed to link highlight");
      }
    } catch (error) {
      console.error("Error linking highlight:", error);
    } finally {
      setLinkingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "new":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">New</Badge>;
      case "linking":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Linking...</Badge>;
      case "linked":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Linked</Badge>;
      case "failed":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading && highlights.length === 0) {
    return (
      <div className="p-4 text-center text-slate-500">
        Loading highlights...
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">📋 INDEX Highlights</h3>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={loadHighlights}
          disabled={loading}
          data-testid="button-refresh-highlights"
        >
          🔄 Refresh
        </Button>
      </div>

      {highlights.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <div className="text-6xl mb-4">📝</div>
          <div className="text-lg font-medium mb-2">No highlights yet</div>
          <div className="text-sm">
            Draw rectangles around INDEX items on the left to create highlights
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {highlights.map((highlight) => (
            <div 
              key={highlight.id} 
              className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-800"
              data-testid={`highlight-card-${highlight.id}`}
            >
              <div className="space-y-3">
                {/* Header with status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 break-words">
                      {highlight.text}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {getStatusBadge(highlight.status)}
                  </div>
                </div>

                {/* Metadata */}
                <div className="text-xs text-slate-500 space-y-1">
                  <div>📄 Index page {highlight.pageNumber}</div>
                  {highlight.targetPage && (
                    <div className="flex items-center gap-2">
                      🎯 Target page {highlight.targetPage}
                      {highlight.confidence && (
                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                          {Math.round(highlight.confidence)}% match
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {highlight.status === "new" || highlight.status === "failed" ? (
                    <Button 
                      size="sm" 
                      onClick={() => linkOne(highlight.id)}
                      disabled={linkingIds.has(highlight.id)}
                      className="bg-blue-500 hover:bg-blue-600 text-white"
                      data-testid={`button-find-sources-${highlight.id}`}
                    >
                      {linkingIds.has(highlight.id) ? "🔍 Finding..." : "🔍 Find sources"}
                    </Button>
                  ) : highlight.status === "linked" && highlight.targetPage ? (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => {
                        // TODO: Jump to target page in PDF viewer
                        console.log(`Jump to page ${highlight.targetPage}`);
                      }}
                      data-testid={`button-go-to-page-${highlight.id}`}
                    >
                      📖 Go to page {highlight.targetPage}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}