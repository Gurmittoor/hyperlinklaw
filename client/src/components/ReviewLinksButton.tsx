import React from "react";

interface ReviewLinksButtonProps {
  docKey: "supp13" | "doc63" | "tr5";
  title: string;
  className?: string;
}

export default function ReviewLinksButton({ docKey, title, className = "" }: ReviewLinksButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [pdfUrl, setPdfUrl] = React.useState("");
  const [links, setLinks] = React.useState<Array<{tab_number:number|string; brief_page:number; tr_dest_page:number; is_marker?:boolean; type?: string; title?: string;}>>([]);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/review-links/${docKey}`);
      const data = await response.json();
      
      if (data.ok) {
        setPdfUrl(data.pdfUrl);
        setLinks(data.links || []);
      } else {
        console.error("Failed to load links:", data.error);
      }
    } catch (error) {
      console.error("Failed to load links:", error);
    }
    setLoading(false);
  }

  const labels = {
    supp13: { color: "blue", count: "13" },
    doc63: { color: "green", count: "4" },
    tr5: { color: "purple", count: "5" }
  };

  const config = labels[docKey];

  return (
    <>
      <button
        className={`px-4 py-2 rounded font-medium transition-colors ${className} ${
          config.color === "blue" ? "bg-blue-600 hover:bg-blue-500" :
          config.color === "green" ? "bg-green-600 hover:bg-green-500" :
          "bg-purple-600 hover:bg-purple-500"
        } text-white`}
        onMouseEnter={() => { if (!open && links.length === 0) load(); }} // prefetch
        onClick={() => { setOpen(true); if (links.length === 0) load(); }}
        data-testid={`button-review-links-${docKey}`}
      >
        🔗 Review {config.count} Links
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="w-[900px] max-h-[80vh] bg-slate-900 rounded-xl shadow-xl p-4 overflow-hidden">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {title} — {links.length} Links 
                {docKey === "doc63" && (
                  <span className="text-sm font-normal text-gray-300 ml-2">
                    (4 📑 Tabs + 2 📋 Exhibits A, B)
                  </span>
                )}
              </h2>
              <div className="space-x-2">
                <a 
                  className="underline text-blue-400 hover:text-blue-300" 
                  href={pdfUrl} 
                  target="_blank" 
                  rel="noreferrer"
                  data-testid={`link-master-pdf-${docKey}`}
                >
                  Open Master PDF
                </a>
                <button 
                  className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white" 
                  onClick={() => setOpen(false)}
                  data-testid={`button-close-review-${docKey}`}
                >
                  Close
                </button>
              </div>
            </div>

            {loading ? (
              <div className="p-6 text-white">Loading…</div>
            ) : (
              <div className="mt-3 overflow-auto max-h-[65vh] space-y-2">
                {links.length === 0 ? (
                  <div className="p-6 text-center text-gray-400">
                    No links found. Run the deterministic rebuild first.
                  </div>
                ) : (
                  links.map(x => (
                    <div key={`${x.type}-${x.tab_number}`} className={`flex items-center justify-between border rounded-md p-2 ${
                      x.type === 'exhibit' 
                        ? 'bg-purple-900 border-purple-700' 
                        : 'bg-slate-800 border-slate-700'
                    }`}>
                      <div className="text-white flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <span className={`text-sm px-2 py-1 rounded text-xs font-semibold ${
                            x.type === 'exhibit' 
                              ? 'bg-purple-600 text-purple-100' 
                              : 'bg-blue-600 text-blue-100'
                          }`}>
                            {x.type === 'exhibit' ? '📋 EXHIBIT' : (docKey === "tr5" ? "📄 ITEM" : "📑 TAB")}
                          </span>
                          <b>{x.tab_number}</b>
                          {x.is_marker && (
                            <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-300 text-xs rounded border border-yellow-500/30 font-mono">
                              ✨ marker
                            </span>
                          )}
                        </div>
                        
                        {x.type === 'exhibit' && x.title && (
                          <span className="text-purple-200 italic">— {x.title}</span>
                        )}
                        
                        <span className="text-gray-300">
                          — page {x.brief_page}
                          {x.tr_dest_page !== x.brief_page && ` → ${x.tr_dest_page}`}
                        </span>
                        
                        <div className="flex items-center gap-1 text-sm">
                          <a 
                            className="underline text-blue-400 hover:text-blue-300" 
                            href={`${pdfUrl}#page=${x.brief_page}`} 
                            target="_blank" 
                            rel="noreferrer"
                            data-testid={`link-${docKey}-${x.type}-${x.tab_number}-source`}
                          >
                            📄 open page
                          </a>
                          {x.tr_dest_page !== x.brief_page && (
                            <>
                              <span className="text-gray-500">|</span>
                              <a 
                                className="underline text-blue-400 hover:text-blue-300" 
                                href={`${pdfUrl}#page=${x.tr_dest_page}`} 
                                target="_blank" 
                                rel="noreferrer"
                                data-testid={`link-${docKey}-${x.type}-${x.tab_number}-dest`}
                              >
                                🎯 open dest
                              </a>
                            </>
                          )}
                        </div>
                      </div>
                      <InlineEdit docKey={docKey} tab={x.tab_number} current={x.tr_dest_page} onUpdate={load} />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function InlineEdit({ docKey, tab, current, onUpdate }: {docKey: string; tab: number|string; current: number; onUpdate: () => void}) {
  const [val, setVal] = React.useState<number>(current);
  const [busy, setBusy] = React.useState(false);
  
  React.useEffect(() => {
    setVal(current);
  }, [current]);

  return (
    <div className="flex items-center gap-2">
      <input
        type="number" 
        min={1}
        className="w-24 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white"
        value={val} 
        onChange={e => setVal(Number(e.target.value))}
        data-testid={`input-${docKey}-tab-${tab}-page`}
      />
      <button
        disabled={busy}
        className="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:bg-emerald-800 rounded text-white"
        onClick={async () => {
          setBusy(true);
          try {
            const response = await fetch(`/api/review-links/${docKey}/override`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tab_number: tab, tr_dest_page: val })
            });
            const data = await response.json();
            
            if (!data.ok) {
              alert(data.error || "Update failed");
            } else {
              onUpdate();
            }
          } catch (error) {
            console.error("Override failed:", error);
            alert("Failed to update link");
          }
          setBusy(false);
        }}
        data-testid={`button-${docKey}-tab-${tab}-save`}
      >
        {busy ? "..." : "Save"}
      </button>
    </div>
  );
}