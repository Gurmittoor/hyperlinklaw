import React from "react";

export default function DeterministicRebuildButton() {
  const [loading, setLoading] = React.useState(false);
  const [status, setStatus] = React.useState<any>(null);
  const [result, setResult] = React.useState<any>(null);

  React.useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    try {
      const response = await fetch("/api/deterministic-status");
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error("Failed to load status:", error);
    }
  }

  async function runRebuild() {
    setLoading(true);
    try {
      const response = await fetch("/api/rebuild-deterministic", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      
      const data = await response.json();
      setResult(data);
      
      // Refresh status after rebuild
      if (data.ok) {
        await loadStatus();
      }
    } catch (error) {
      console.error("Rebuild failed:", error);
      setResult({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      {/* Status Display */}
      {status && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-blue-300">Supplemental Brief</h3>
              <span className={`px-2 py-1 rounded text-xs ${status.status.supp13.built ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-400'}`}>
                {status.status.supp13.built ? '✅ Built' : '⏳ Pending'}
              </span>
            </div>
            <div className="text-2xl font-bold text-white">{status.status.supp13.total}</div>
            <div className="text-sm text-gray-400">Index page 2 → 13 tabs</div>
          </div>
          
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-green-300">Main Brief</h3>
              <span className={`px-2 py-1 rounded text-xs ${status.status.doc63.built ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-400'}`}>
                {status.status.doc63.built ? '✅ Built' : '⏳ Pending'}
              </span>
            </div>
            <div className="text-2xl font-bold text-white">{status.status.doc63.total}</div>
            <div className="text-sm text-gray-400">Index pages 2-9 → 63 tabs</div>
          </div>
          
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-purple-300">Trial Record</h3>
              <span className={`px-2 py-1 rounded text-xs ${status.status.tr5.built ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-400'}`}>
                {status.status.tr5.built ? '✅ Built' : '⏳ Pending'}
              </span>
            </div>
            <div className="text-2xl font-bold text-white">{status.status.tr5.total}</div>
            <div className="text-sm text-gray-400">Index pages 2-3 → 5 tabs</div>
          </div>
        </div>
      )}

      {/* Control Buttons */}
      <div className="flex items-center gap-4">
        <button
          onClick={runRebuild}
          disabled={loading}
          className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-gray-600 disabled:to-gray-700 text-white rounded-lg font-medium transition-all"
          data-testid="button-deterministic-rebuild"
        >
          {loading ? (
            <>⏳ Rebuilding Index-Deterministic System...</>
          ) : (
            <>🎯 Rebuild All (Index-Only)</>
          )}
        </button>
        
        <button
          onClick={loadStatus}
          className="px-4 py-3 bg-slate-600 hover:bg-slate-500 text-white rounded-lg"
          data-testid="button-refresh-status"
        >
          🔄 Refresh
        </button>

        {status && (
          <div className="flex items-center gap-2 px-4 py-3 bg-slate-800 rounded-lg border border-slate-700">
            <span className="text-gray-300">Total:</span>
            <span className="text-2xl font-bold text-yellow-400">{status.totalLinks}</span>
            <span className="text-gray-300">hyperlinks</span>
          </div>
        )}
      </div>

      {/* Result Display */}
      {result && (
        <div className="bg-slate-800 rounded-lg p-4">
          {result.ok ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-400">
                <span>✅</span>
                <span className="font-semibold">Index-Deterministic Rebuild Complete!</span>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                {result.results && Object.entries(result.results).map(([key, data]: [string, any]) => {
                  const labels = {
                    supp13: 'Supplemental (13)',
                    doc63: 'Main Brief (63)', 
                    tr5: 'Trial Record (5)'
                  };
                  
                  return (
                    <div key={key} className="bg-slate-900 rounded p-3">
                      <h4 className="font-medium text-white mb-2">{labels[key as keyof typeof labels]}</h4>
                      <div className="text-sm space-y-1">
                        <div className="text-gray-300">
                          Links: <span className="text-white font-mono">{data.total}</span>
                        </div>
                        {data.validation && (
                          <div className="text-gray-300">
                            Success: <span className={`font-medium ${data.validation.success ? 'text-green-400' : 'text-red-400'}`}>
                              {data.validation.success ? 'YES' : 'NO'}
                            </span>
                          </div>
                        )}
                        {data.review && (
                          <a
                            href={data.review.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs"
                          >
                            📄 PDF
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-400">{result.totalLinks}</div>
                <div className="text-gray-300">Total hyperlinks created</div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-red-400">
                <span>❌</span>
                <span className="font-semibold">Rebuild Failed</span>
              </div>
              <div className="bg-red-900/20 border border-red-500/30 rounded p-3">
                <div className="text-red-300 text-sm font-mono">
                  {result.error}
                </div>
                {result.stderr && (
                  <details className="mt-2">
                    <summary className="text-red-400 cursor-pointer text-xs">Show Error Details</summary>
                    <pre className="mt-1 text-xs text-red-300 whitespace-pre-wrap">{result.stderr}</pre>
                  </details>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
        <h3 className="font-semibold text-white mb-3">📋 Index-Deterministic System</h3>
        <div className="text-sm text-gray-300 space-y-2">
          <div>• <strong>Amended Supp Doc Brief (403 pp):</strong> Scans index page 2 for exactly 13 tabs</div>
          <div>• <strong>Amended Doc Brief (1223 pp):</strong> Scans index pages 2-9 for exactly 63 tabs</div>
          <div>• <strong>Trial Record:</strong> Builds internal 5-tab index from pages 2-3</div>
          <div className="pt-2 border-t border-slate-600">
            <strong className="text-yellow-400">No guessing, no synthetic links.</strong> Index is the single source of truth.
          </div>
        </div>
      </div>
    </div>
  );
}