import React, { useEffect, useState } from "react";

type Page = { 
  pageNumber: number; 
  text: string; 
  confidence: number | null;
  provider?: string | null;
  updatedAt?: string | null;
};

type Props = { 
  documentId: string; 
  batchNo: number; 
  batchSize?: number; 
};

export default function BatchRowViewer({ documentId, batchNo, batchSize = 50 }: Props) {
  const [visible, setVisible] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [dirty, setDirty] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});

  const loadPages = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/batches/${batchNo}/pages?size=${batchSize}`);
      if (!res.ok) throw new Error(`Failed to load: ${res.statusText}`);
      const json = await res.json();
      setPages(json.pages || []);
    } catch (error) {
      console.error('Error loading pages:', error);
      setPages([]);
    } finally {
      setLoading(false);
    }
  };

  const savePage = async (pageNumber: number) => {
    const text = dirty[pageNumber];
    if (!text) return;

    setSaving(s => ({ ...s, [pageNumber]: true }));
    try {
      const res = await fetch(`/api/documents/${documentId}/pages/${pageNumber}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('Save failed');
      
      setPages(p => p.map(pg => pg.pageNumber === pageNumber ? { ...pg, text } : pg));
      setDirty(d => { const n = { ...d }; delete n[pageNumber]; return n; });
    } catch (error) {
      alert(`Save failed: ${error}`);
    } finally {
      setSaving(s => ({ ...s, [pageNumber]: false }));
    }
  };

  const saveAll = async () => {
    const dirtyPages = Object.keys(dirty);
    for (const pageNumberStr of dirtyPages) {
      await savePage(Number(pageNumberStr));
    }
    setEditMode(false);
  };

  // Load pages when view is opened
  useEffect(() => {
    if (visible && pages.length === 0) {
      loadPages();
    }
  }, [visible]);

  const hasData = pages.some(p => p.text && p.confidence !== null);
  const hasDirtyPages = Object.keys(dirty).length > 0;

  return (
    <div className="w-full mt-4">
      {/* Control Buttons */}
      <div className="flex items-center gap-3 mb-4">
        <button 
          onClick={() => setVisible(!visible)}
          className={`px-4 py-2 rounded text-white font-medium ${
            hasData ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
          }`}
          data-testid={`view-batch-${batchNo}`}
        >
          {visible ? 'Hide' : 'View'} OCR (Batch {batchNo})
          {hasData && !visible && <span className="ml-2 text-xs">📄 Ready</span>}
        </button>

        {visible && (
          <>
            <button 
              onClick={() => setEditMode(!editMode)}
              className={`px-4 py-2 rounded text-white font-medium ${
                editMode ? 'bg-orange-600 hover:bg-orange-700' : 'bg-yellow-600 hover:bg-yellow-700'
              }`}
              data-testid={`edit-batch-${batchNo}`}
            >
              {editMode ? 'Stop Editing' : 'Edit'}
            </button>

            <button 
              onClick={saveAll}
              disabled={!hasDirtyPages || loading}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded font-medium"
              data-testid={`save-batch-${batchNo}`}
            >
              Save All Changes {hasDirtyPages && `(${Object.keys(dirty).length})`}
            </button>

            <button 
              onClick={loadPages}
              disabled={loading}
              className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </>
        )}

        {loading && <span className="text-sm text-gray-400">Loading pages...</span>}
      </div>

      {/* OCR Content */}
      {visible && (
        <div className="border border-gray-600 rounded-lg bg-gray-800 p-4">
          {pages.length > 0 ? (
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {pages.slice(0, 10).map(p => {
                const edited = dirty[p.pageNumber] ?? p.text;
                const isDirty = p.pageNumber in dirty;
                
                return (
                  <div key={p.pageNumber} className="border border-gray-600 rounded p-3 bg-gray-900">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-gray-300 font-medium">
                        Page {p.pageNumber} 
                        {p.confidence && ` (${Math.round(p.confidence * 100)}%)`}
                        {isDirty && <span className="text-yellow-400 ml-2">• Modified</span>}
                      </span>
                      <button
                        onClick={() => savePage(p.pageNumber)}
                        disabled={!isDirty || saving[p.pageNumber]}
                        className="px-2 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded text-xs"
                      >
                        {saving[p.pageNumber] ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                    <textarea
                      value={edited || ''}
                      onChange={e => setDirty(d => ({ ...d, [p.pageNumber]: e.target.value }))}
                      readOnly={!editMode}
                      className={`w-full h-32 border border-gray-600 rounded p-2 text-gray-100 text-sm font-mono resize-none ${
                        editMode ? 'bg-gray-700' : 'bg-gray-800'
                      }`}
                      placeholder="No OCR text available"
                    />
                  </div>
                );
              })}
              {pages.length > 10 && (
                <div className="text-center text-gray-400 text-sm">
                  Showing first 10 pages. Total: {pages.length}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              {loading ? 'Loading OCR content...' : 'No OCR content found'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}