import React, { useEffect } from "react";

interface Props {
  docKey: "supp13" | "doc63" | "trial13";
  buttonText?: string;
}

interface LinkData {
  tab_number?: number;
  brief_page?: number;
  tr_dest_page?: number;
  label?: string;
  tr_page?: number;
  rect?: string;
}

interface ResponseData {
  ok: boolean;
  total: number;
  pdfUrl: string;
  links: LinkData[];
}

export default function ReviewHyperlinksButton({ docKey, buttonText = "🔗 Review Hyperlinks" }: Props) {
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<ResponseData | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Prevent modal from auto-closing and add keyboard support
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    
    if (open) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [open]);

  async function load() {
    if (loading) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/review-links/${docKey}`);
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error("Failed to load links:", error);
    }
    setLoading(false);
  }

  const getTitle = () => {
    switch (docKey) {
      case "supp13": return "Amended Supp Doc Brief — 13 Tabs";
      case "doc63": return "Amended Doc Brief — 63 Tabs";
      case "trial13": return "Trial Record — 13 Subrule Documents";
      default: return "Review Hyperlinks";
    }
  };

  const getTabLabel = (tabNumber: number) => {
    // Detailed labels for supp13 (13-tab supplemental brief)
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
    
    // Detailed labels for doc63 (63-tab amended doc brief)
    if (docKey === "doc63") {
      const tabLabels: { [key: number]: string } = {
        1: "Executed Separation Agreement — Oct 4, 2019",
        2: "Comparative Market Analysis — Katherine Loucaidou (Property Gallery Realty Inc.) — Sep 14, 2019",
        3: "Letter — Nancy Richards (Royal LePage Signature Realty) — Sep 2019",
        4: "Email — Paul Rishi (Royal LePage Vendex Realty) re: market value — Sep 17, 2019",
        5: "Abstract of Title — Aug 19, 2023",
        6: "Effort Trust — Executed Mortgage Offer (1st mortgage) — Feb 15, 2019",
        7: "Effort Trust — Letter confirming mortgage details — Mar 7, 2019",
        8: "Indigo Blue — Executed Mortgage Commitment (2nd mortgage) — May 24, 2019",
        9: "Effort Trust — Executed Mortgage Renewal — Feb 4, 2021",
        10: "Email — Pat Dowling to Mary Ann re: Mortgage Approval — Mar 11, 2021",
        11: "Request to Admit of Applicant — Feb 22, 2024",
        12: "Text message (Applicant ↔ Respondent 'what time can I come by?') — Mar 24, 2021",
        13: "Photo — Respondent blocking driveway — Sep 11, 2019",
        14: "Photo — Moving truck removing Applicant — Oct 5, 2019",
        15: "Endorsement — Justice Barnes (renew mortgage) — Feb 25, 2022",
        16: "Endorsement — Justice Barnes (motion dismissed; costs to Applicant) — Feb 25, 2022",
        17: "Endorsement — Justice Petersen (case conference; leave for motions) — Apr 25, 2022",
        18: "Endorsement — Justice McSweeney (schedule settlement conference) — Sep 23, 2022",
        19: "Endorsement — Justice Agarwal (adjournment) — Nov 24, 2022",
        20: "Endorsement — Justice Daley (interim child support) — Dec 6, 2022",
        21: "Order — Justice Daley (interim child support) — Dec 6, 2022",
        22: "Endorsement — Justice Tzimas (mortgage renewal) — Dec 30, 2022",
        23: "Endorsement — Justice Stribopoulos (mortgage renewal) — Jan 3, 2023",
        24: "Costs Endorsement — Justice Daley — Apr 6, 2023",
        25: "Endorsement — Justice McSweeney (settlement conference) — May 29, 2023",
        26: "Order — Justice McSweeney (interim support & disclosure) — May 29, 2023",
        27: "Endorsement — Justice LeMay (document disclosure) — Oct 31, 2023",
        28: "Endorsement — Justice Kumaranayake (TMC) — Nov 30, 2023",
        29: "Affidavit — Rino Ferrante (re-mortgage ability) — Sep 15, 2022",
        30: "Affidavit — Serafina Ferrante (re-mortgage ability) — Sep 15, 2022",
        31: "Supplementary Affidavit — Serafina Ferrante — Sep 15, 2022",
        32: "Affidavit — Serafina Ferrante — Sep 19, 2022",
        33: "Reply Affidavit — Rino Ferrante (re-mortgage ability) — Sep 20, 2022",
        34: "Affidavit — Serafina Ferrante (child support motion by Applicant) — Nov 14, 2022",
        35: "Affidavit — Rino Ferrante (child support motion by Applicant) — Nov 30, 2022",
        36: "Reply Affidavit — Serafina Ferrante (child support & questioning) — Dec 1, 2022",
        37: "Affidavit — Rino Ferrante (Respondent's motion) — Dec 29, 2022",
        38: "Affidavit — Serafina Ferrante (emergency mortgage renewal) — Jan 2, 2023",
        39: "Reply Affidavit — Rino Ferrante — Jan 3, 2023",
        40: "Affidavit — Rino Ferrante (financial update) — May 23, 2023",
        41: "Affidavit — Applicant (strike pleadings) — Aug 21, 2023",
        42: "Affidavit — Jolanta Chrzaszcz (emails served) — Oct 24, 2023",
        43: "Reply Affidavit — Respondent (undefended trial motion) — Oct 24, 2023",
        44: "Affidavit — Rino Ferrante (productions & undertakings) — Oct 24, 2023",
        45: "Affidavit — David Sorbara (reply to Respondent) — Oct 26, 2023",
        46: "Affidavit — Jolanta Chrzaszcz (reply to Sorbara) — Oct 27, 2023",
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
    
    // For other document types, use generic tab labels
    return `Tab ${tabNumber}`;
  };

  const renderLink = (link: LinkData, index: number) => {
    if (docKey === "trial13") {
      return (
        <div key={index} className="flex justify-between items-center bg-slate-800 border border-slate-700 rounded p-3">
          <div className="text-white">
            {index + 1 < 10 ? `0${index + 1}` : index + 1}. {link.label}
          </div>
          <div className="flex items-center gap-2">
            <a 
              className="underline text-blue-400 hover:text-blue-300" 
              href={`${data?.pdfUrl}#page=${link.tr_page}`} 
              target="_blank" 
              rel="noreferrer"
            >
              Open p.{link.tr_page}
            </a>
            <input
              type="number" min={1}
              className="w-20 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white"
              defaultValue={link.tr_page}
              onChange={(e) => {
                const newPage = Number(e.target.value);
                if (newPage > 0) {
                  handleOverride({ doc_number: index + 1, tr_page: newPage });
                }
              }}
            />
          </div>
        </div>
      );
    } else {
      return (
        <div key={link.tab_number} className="bg-slate-800 border border-slate-700 rounded p-3 mb-2">
          <div className="text-white mb-2">
            <div className="font-semibold">Tab {link.tab_number} — {getTabLabel(link.tab_number!)}</div>
            <div className="text-sm text-slate-300 mt-1">
              Brief p.{link.brief_page} → TR p.{link.tr_dest_page}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <a 
                className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded" 
                href={`${data?.pdfUrl}#page=${link.brief_page}`} 
                target="_blank" 
                rel="noreferrer"
              >
                Open source
              </a>
              <a 
                className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white text-sm rounded" 
                href={`${data?.pdfUrl}#page=${link.tr_dest_page}`} 
                target="_blank" 
                rel="noreferrer"
              >
                Open dest
              </a>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-white text-sm">TR page:</label>
              <input
                type="number" min={1}
                className="w-20 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white"
                defaultValue={link.tr_dest_page}
                placeholder="TR page"
                onChange={(e) => {
                  const newPage = Number(e.target.value);
                  if (newPage > 0) {
                    handleOverride({ tab_number: link.tab_number, tr_dest_page: newPage });
                  }
                }}
              />
            </div>
          </div>
        </div>
      );
    }
  };

  const handleOverride = async (params: any) => {
    try {
      const response = await fetch(`/api/review-links/${docKey}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params)
      });
      const result = await response.json();
      if (result.ok) {
        load(); // Refresh data
      }
    } catch (error) {
      console.error("Override failed:", error);
    }
  };

  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium"
        onMouseEnter={() => { if (!data && !loading) load(); }}
        onClick={(e) => { 
          e.preventDefault();
          e.stopPropagation();
          setOpen(true); 
          if (!data && !loading) load(); 
        }}
        data-testid={`button-review-${docKey}`}
      >
        {buttonText}
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
                {getTitle()} ({data?.total || 0})
              </h2>
              <div className="space-x-2">
                {data?.pdfUrl && (
                  <a 
                    className="underline text-blue-400 hover:text-blue-300" 
                    href={data.pdfUrl} 
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
              <div className="p-6 text-center text-white">Loading hyperlinks...</div>
            ) : data ? (
              <div className="mt-3 overflow-auto max-h-[65vh] space-y-2">
                {data.links.map((link, index) => renderLink(link, index))}
              </div>
            ) : (
              <div className="p-6 text-center text-red-400">
                Failed to load hyperlinks. Please build the links first.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}