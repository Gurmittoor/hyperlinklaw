import React from "react";

interface IndexFirstDetectionButtonProps {
  briefPath?: string;
  trialRecordPath?: string;
  onComplete?: (result: any) => void;
}

export default function IndexFirstDetectionButton({ 
  briefPath = "uploads/Amended Doc Brief - Ferrante - 3 July 2025.pdf",
  trialRecordPath = "uploads/Trial Record - Ferrante - August 13 2025.pdf",
  onComplete 
}: IndexFirstDetectionButtonProps) {
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<any>(null);
  const [showConfig, setShowConfig] = React.useState(false);

  async function runDetection() {
    setLoading(true);
    try {
      const outputDir = `out/index_first_${Date.now()}`;
      
      const response = await fetch("/api/index-first-detection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          briefPath,
          trialRecordPath,
          outputDir
        })
      });

      const data = await response.json();
      setResult(data);
      
      if (data.ok && onComplete) {
        onComplete(data);
      }
    } catch (error) {
      console.error("Detection failed:", error);
      setResult({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={runDetection}
          disabled={loading}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 text-white rounded-lg font-medium transition-colors"
          data-testid="button-index-first-detection"
        >
          {loading ? (
            <>⏳ Running Index-First Detection...</>
          ) : (
            <>✨ Run Index-First Detection</>
          )}
        </button>
        
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-sm"
          data-testid="button-toggle-config"
        >
          ⚙️ Config
        </button>
      </div>

      {showConfig && (
        <div className="bg-slate-800 rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-white">Index-First Detection Settings</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block text-gray-300 mb-1">Brief Document:</label>
              <div className="bg-slate-900 p-2 rounded text-gray-400 font-mono text-xs break-all">
                {briefPath}
              </div>
            </div>
            <div>
              <label className="block text-gray-300 mb-1">Trial Record:</label>
              <div className="bg-slate-900 p-2 rounded text-gray-400 font-mono text-xs break-all">
                {trialRecordPath}
              </div>
            </div>
          </div>
          <div className="text-xs text-gray-400 space-y-1">
            <div>• Scans index pages for exact tab patterns</div>
            <div>• Supports asterisk markers (*T1, *T2, etc.)</div>
            <div>• Validates expected tab counts per document</div>
            <div>• Automatically hides markers in final PDF</div>
          </div>
        </div>
      )}

      {result && (
        <div className="bg-slate-800 rounded-lg p-4">
          {result.ok ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-400">
                <span>✅</span>
                <span className="font-semibold">Detection Successful!</span>
              </div>
              
              {result.validation && (
                <div className="bg-slate-900 rounded p-3 space-y-2">
                  <h4 className="font-medium text-white">Validation Report:</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1">
                      <div className="text-gray-300">
                        Found Tabs: <span className="text-white font-mono">{result.validation.found_tabs}</span>
                      </div>
                      <div className="text-gray-300">
                        Expected: <span className="text-white font-mono">{result.validation.expected_tabs || "auto"}</span>
                      </div>
                      <div className="text-gray-300">
                        Links Created: <span className="text-white font-mono">{result.validation.links_created}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-gray-300">
                        Broken Links: <span className={`font-mono ${result.validation.broken_links === 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {result.validation.broken_links}
                        </span>
                      </div>
                      <div className="text-gray-300">
                        Markers Used: <span className="text-yellow-400 font-mono">✨ {result.validation.markers_used}</span>
                      </div>
                      <div className="text-gray-300">
                        Status: <span className={`font-medium ${result.validation.success ? 'text-green-400' : 'text-red-400'}`}>
                          {result.validation.success ? 'SUCCESS' : 'FAILED'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {result.review && (
                <div className="flex gap-2">
                  <a
                    href={result.review.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium"
                  >
                    📄 Open Master PDF
                  </a>
                  <button
                    onClick={() => console.log("Review data:", result.review)}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm font-medium"
                  >
                    🔍 View Links ({result.review.total})
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-red-400">
                <span>❌</span>
                <span className="font-semibold">Detection Failed</span>
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
    </div>
  );
}