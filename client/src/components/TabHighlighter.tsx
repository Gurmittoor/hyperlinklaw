import { useState } from "react";
import { Button } from "@/components/ui/button";
import IndexHighlighter from "./IndexHighlighter";

interface TabHighlighterProps {
  documentId: string;
  pageNumber: number;
  onCreated?: () => void;
}

export default function TabHighlighter({
  documentId,
  pageNumber,
  onCreated
}: TabHighlighterProps) {
  const [highlightMode, setHighlightMode] = useState<"index" | "tab">("index");

  return (
    <div className="relative w-full h-full">
      {/* Mode Selector */}
      <div className="absolute top-4 right-4 z-40 bg-white dark:bg-slate-800 rounded-lg shadow-lg border p-2">
        <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
          Highlight Mode:
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={highlightMode === "index" ? "default" : "outline"}
            onClick={() => setHighlightMode("index")}
            className="text-xs"
            data-testid="button-mode-index"
          >
            📋 Index Items
          </Button>
          <Button
            size="sm"
            variant={highlightMode === "tab" ? "default" : "outline"}
            onClick={() => setHighlightMode("tab")}
            className="text-xs"
            data-testid="button-mode-tab"
          >
            🏷️ Tabs
          </Button>
        </div>
        {highlightMode === "tab" && (
          <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">
            Highlighted tabs will be used for hyperlinking
          </div>
        )}
      </div>

      {/* Highlighter Component */}
      <IndexHighlighter
        documentId={documentId}
        pageNumber={pageNumber}
        highlightMode={highlightMode}
        onCreated={onCreated}
      />
    </div>
  );
}