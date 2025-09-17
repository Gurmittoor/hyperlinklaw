import React, { useEffect } from "react";

type LinkRow = { 
  tab_number: number; 
  brief_page: number; 
  tr_dest_page: number; 
  rect: string 
};

interface Props {
  docKey: "supp13" | "doc63" | "trial13";
}

export default function ReviewHyperlinksButtonInstant({ docKey }: Props) {
  const [open, setOpen] = React.useState(false);
  const [pdfUrl, setPdfUrl] = React.useState("");
  const [links, setLinks] = React.useState<LinkRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const cacheKey = `review:${docKey}`;

  // Pre-load data on component mount for instant display
  React.useEffect(() => {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const data = JSON.parse(cached);
        setPdfUrl(data.pdfUrl);
        setLinks(data.links);
      } catch (_) {
        // Continue to load fresh data
      }
    }
    // Always pre-load in background for next time
    load();
  }, [docKey]);

  // Get tab labels based on docKey
  const getTabLabel = (tabNumber: number) => {
    if (docKey === "supp13") {
      const tabLabels: { [key: number]: string } = {
        1: "Request for Information of the Applicant — Feb 28, 2022",
        2: "Request for Information of the Applicant — Mar 16, 2022", 
        3: "Request for Information of the Applicant — Apr 5, 2022",
        4: "Request for Information of the Applicant — Nov 2022",
        5: "Transcript of Questioning of Rino Ferrante — Dec 15, 2022",
        6: "Affidavit – Rino Ferrante — Apr 20, 2022",
        7: "Affidavit – Rino Ferrante — Feb 18, 2022",
        8: "Affidavit – Lisa Corlevic — Jun 19, 2023",
        9: "Affidavit – Rino Ferrante — Feb 23, 2022",
        10: "Affidavit – Lisa Corlevic — Mar 2, 2023",
        11: "Affidavit – Serafina Ferrante — Feb 21, 2023",
        12: "Affidavit – Serafina Ferrante — Aug 16, 2023",
        13: "Recognizance of Bail — Rino Ferrante — Sep 23, 2019"
      };
      return tabLabels[tabNumber] || `Tab ${tabNumber}`;
    }
    
    if (docKey === "doc63") {
      const tabLabels: { [key: number]: string } = {
        1: "Executed Separation Agreement — Oct 4, 2019",
        2: "Comparative Market Analysis — Katherine Loucaidou — Sep 14, 2019",
        3: "Letter — Nancy Richards — Sep 2019",
        4: "Email — Paul Rishi re: market value — Sep 17, 2019",
        5: "Abstract of Title — Aug 19, 2023",
        6: "Effort Trust — Executed Mortgage Offer — Feb 15, 2019",
        7: "Effort Trust — Letter confirming mortgage details — Mar 7, 2019",
        8: "Indigo Blue — Executed Mortgage Commitment — May 24, 2019",
        9: "Effort Trust — Executed Mortgage Renewal — Feb 4, 2021",
        10: "Email — Pat Dowling to Mary Ann re: Mortgage Approval — Mar 11, 2021",
        11: "Request to Admit of Applicant — Feb 22, 2024",
        12: "Text message (Applicant ↔ Respondent) — Mar 24, 2021",
        13: "Photo — Respondent blocking driveway — Sep 11, 2019",
        14: "Photo — Moving truck removing Applicant — Oct 5, 2019",
        15: "Endorsement — Justice Barnes — Feb 25, 2022",
        16: "Endorsement — Justice Barnes — Feb 25, 2022",
        17: "Endorsement — Justice Petersen — Apr 25, 2022",
        18: "Endorsement — Justice McSweeney — Sep 23, 2022",
        19: "Endorsement — Justice Agarwal — Nov 24, 2022",
        20: "Endorsement — Justice Daley — Dec 6, 2022",
        21: "Order — Justice Daley — Dec 6, 2022",
        22: "Endorsement — Justice Tzimas — Dec 30, 2022",
        23: "Endorsement — Justice Stribopoulos — Jan 3, 2023",
        24: "Costs Endorsement — Justice Daley — Apr 6, 2023",
        25: "Endorsement — Justice McSweeney — May 29, 2023",
        26: "Order — Justice McSweeney — May 29, 2023",
        27: "Endorsement — Justice LeMay — Oct 31, 2023",
        28: "Endorsement — Justice Kumaranayake — Nov 30, 2023",
        29: "Affidavit — Rino Ferrante — Sep 15, 2022",
        30: "Affidavit — Serafina Ferrante — Sep 15, 2022",
        31: "Supplementary Affidavit — Serafina Ferrante — Sep 15, 2022",
        32: "Affidavit — Serafina Ferrante — Sep 19, 2022",
        33: "Reply Affidavit — Rino Ferrante — Sep 20, 2022",
        34: "Affidavit — Serafina Ferrante — Nov 14, 2022",
        35: "Affidavit — Rino Ferrante — Nov 30, 2022",
        36: "Reply Affidavit — Serafina Ferrante — Dec 1, 2022",
        37: "Affidavit — Rino Ferrante — Dec 29, 2022",
        38: "Affidavit — Serafina Ferrante — Jan 2, 2023",
        39: "Reply Affidavit — Rino Ferrante — Jan 3, 2023",
        40: "Affidavit — Rino Ferrante — May 23, 2023",
        41: "Affidavit — Applicant — Aug 21, 2023",
        42: "Affidavit — Jolanta Chrzaszcz — Oct 24, 2023",
        43: "Reply Affidavit — Respondent — Oct 24, 2023",
        44: "Affidavit — Rino Ferrante — Oct 24, 2023",
        45: "Affidavit — David Sorbara — Oct 26, 2023",
        46: "Affidavit — Jolanta Chrzaszcz — Oct 27, 2023",
        47: "Financial Statement — Applicant — Jan 8, 2022",
        48: "Financial Statement — Respondent — Feb 12, 2022",
        49: "Financial Statement — Applicant — May 15, 2023",
        50: "Financial Statement — Respondent — Oct 13, 2023",
        51: "Financial Statement — Applicant — Nov 6, 2023",
        52: "Financial Statement — Respondent — Nov 21, 2023",
        53: "Income Tax Return — Applicant — 2016",
        54: "Income Tax Return — Applicant — 2017",
        55: "Income Tax Return — Applicant — 2018",
        56: "Income Tax Return — Applicant — 2019",
        57: "Income Tax Return — Applicant — 2020",
        58: "Income Tax Return — Respondent — 2016",
        59: "Income Tax Return — Respondent — 2017",
        60: "Income Tax Return — Respondent — 2018",
        61: "Income Tax Return — Respondent — 2019",
        62: "Income Tax Return — Respondent — 2020",
        63: "Income Tax Return — Respondent — 2021"
      };
      return tabLabels[tabNumber] || `Tab ${tabNumber}`;
    }

    return `Tab ${tabNumber}`;
  };

  async function load() {
    // INSTANT: Check cache first for immediate display
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const data = JSON.parse(cached);
        setPdfUrl(data.pdfUrl);
        setLinks(data.links);
        // Don't set loading false here, show data immediately
        return;
      } catch (_) {
        // Continue to fetch
      }
    }

    setLoading(true);
    const url = docKey === "supp13"
      ? "/out/review_13/review.json"
      : docKey === "doc63"
      ? "/out/review_63/review.json"
      : "/api/review-links/trial13";

    try {
      const response = await fetch(url, { 
        cache: "force-cache",
        priority: "high"
      });
      if (response.ok) {
        const data = await response.json();
        setPdfUrl(data.pdfUrl);
        setLinks(data.links);
        localStorage.setItem(cacheKey, JSON.stringify(data));
      }
    } catch (error) {
      console.error("Load failed:", error);
    } finally {
      setLoading(false);
    }
  }

  // Modal control handlers
  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setOpen(false);
    }
  };

  // Keyboard and body scroll management
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    
    if (open) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [open]);

  const getTitle = () => {
    switch (docKey) {
      case "supp13": return "Amended Supp Doc Brief";
      case "doc63": return "Amended Doc Brief";
      case "trial13": return "Trial Record";
      default: return "Review Hyperlinks";
    }
  };

  return (
    <>
      <button
        className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium"
        onClick={(e) => { 
          e.preventDefault();
          e.stopPropagation();
          setOpen(true); 
          // Data should already be loaded from useEffect
        }}
        onMouseEnter={() => { 
          // Ensure data is fresh on hover
          if (links.length === 0) load(); 
        }}
        data-testid={`button-review-${docKey}`}
      >
        🔗 Review Hyperlinks
      </button>

      {open && (
        <div 
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
          onClick={handleBackdropClick}
        >
          <div 
            className="w-[900px] max-h-[80vh] bg-slate-900 rounded-xl shadow-xl p-4 overflow-hidden"
            onClick={handleModalClick}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                {getTitle()} — {links.length} {links.length === 1 ? 'Tab' : 'Tabs'}
              </h2>
              <div className="space-x-2">
                {pdfUrl && (
                  <a 
                    className="underline text-blue-400 hover:text-blue-300" 
                    href={pdfUrl} 
                    target="_blank" 
                    rel="noreferrer"
                  >
                    Open Master PDF
                  </a>
                )}
                <button 
                  className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white" 
                  onClick={() => setOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>

            {loading ? (
              <div className="mt-3 space-y-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="animate-pulse h-10 bg-slate-800/60 rounded-md" />
                ))}
              </div>
            ) : (
              <div className="mt-3 overflow-auto max-h-[65vh] space-y-2">
                {links.map(row => (
                  <Row 
                    key={row.tab_number} 
                    row={row} 
                    pdfUrl={pdfUrl} 
                    docKey={docKey}
                    getTabLabel={getTabLabel}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Row({ 
  row, 
  pdfUrl, 
  docKey, 
  getTabLabel 
}: {
  row: { tab_number: number; brief_page: number; tr_dest_page: number };
  pdfUrl: string; 
  docKey: "supp13" | "doc63" | "trial13";
  getTabLabel: (tabNumber: number) => string;
}) {
  const [val, setVal] = React.useState<number>(row.tr_dest_page);
  const [busy, setBusy] = React.useState(false);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded p-3 mb-2">
      <div className="text-white mb-2">
        <div className="font-semibold">Tab {row.tab_number} — {getTabLabel(row.tab_number)}</div>
        <div className="text-sm text-slate-300 mt-1">
          Brief p.{row.brief_page} → TR p.{row.tr_dest_page}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a 
            className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded" 
            href={`${pdfUrl}#page=${row.brief_page}`} 
            target="_blank" 
            rel="noreferrer"
          >
            Open source
          </a>
          <a 
            className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white text-sm rounded" 
            href={`${pdfUrl}#page=${row.tr_dest_page}`} 
            target="_blank" 
            rel="noreferrer"
          >
            Open dest
          </a>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-white text-sm">TR page:</label>
          <input 
            type="number" 
            min={1} 
            value={val} 
            onChange={e => setVal(Number(e.target.value))}
            className="w-20 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white" 
          />
          <button 
            disabled={busy} 
            className="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-600 rounded text-white text-sm"
            onClick={async () => {
              setBusy(true);
              try {
                const response = await fetch(`/api/review-links/${docKey}/override`, {
                  method: "POST", 
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ 
                    tab_number: row.tab_number, 
                    tr_dest_page: val 
                  })
                });
                const result = await response.json();
                if (!result.ok) {
                  alert(result.error || "Update failed");
                }
              } catch (error) {
                console.error("Save failed:", error);
                alert("Save failed. Please try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}