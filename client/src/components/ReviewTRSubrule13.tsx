import React from "react";

interface SubruleLink {
  label: string;
  tr_page: number;
}

interface SubruleData {
  pdfUrl: string;
  total: number;
  links: SubruleLink[];
}

export default function ReviewTRSubrule13() {
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<SubruleData | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function load() {
    if (loading) return;
    setLoading(true);
    try {
      const response = await fetch("/api/tr/subrule13");
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error("Failed to load subrule data:", error);
    }
    setLoading(false);
  }

  return (
    <>
      <button 
        className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium"
        onMouseEnter={() => { if (!data && !loading) load(); }}
        onClick={() => { setOpen(true); if (!data && !loading) load(); }}
        data-testid="button-review-tr-subrule13"
      >
        🔗 Review Hyperlinks
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="w-[720px] max-h-[80vh] bg-slate-900 rounded-xl p-4 overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-white">
                Trial Record — Subrule 13 ({data?.total || 0})
              </h2>
              <div className="space-x-2">
                {data?.pdfUrl && (
                  <a 
                    className="underline text-blue-400 hover:text-blue-300" 
                    href={data.pdfUrl} 
                    target="_blank" 
                    rel="noreferrer"
                  >
                    Open PDF
                  </a>
                )}
                <button 
                  className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white" 
                  onClick={() => setOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>

            {loading ? (
              <div className="p-6 text-center text-white">Loading subrule documents...</div>
            ) : data ? (
              <div className="space-y-2">
                {data.links.map((x, i) => (
                  <div 
                    key={i} 
                    className="flex justify-between items-center bg-slate-800 border border-slate-700 rounded p-3"
                  >
                    <div className="text-white">
                      {i + 1 < 10 ? `0${i + 1}` : i + 1}. {x.label}
                    </div>
                    <a 
                      className="underline text-blue-400 hover:text-blue-300" 
                      href={`${data.pdfUrl}#page=${x.tr_page}`} 
                      target="_blank" 
                      rel="noreferrer"
                      data-testid={`link-subrule-${i + 1}`}
                    >
                      Open p.{x.tr_page}
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-red-400">
                Failed to load subrule documents. Please build the index first.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}