import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, ChevronDown, ChevronRight, FileText, Gavel, Upload, Search, Link2, ShieldCheck, PlayCircle, ListChecks, UserRound, FolderOpen, Settings2, RefreshCcw, Eye } from "lucide-react";

/**
 * hyperlinklaw.com: Collapsible Left Panel Stepper (10-step flow)
 * --------------------------------------------------------
 * Drop this file into your React app (TypeScript). It renders a full-page
 * case workspace with:
 *   - Left, collapsible step-by-step panel with checkmarks
 *   - Per-case progress persisted locally and synced to your backend
 *   - A central content area with context-aware actions for each step
 *   - Non-destructive: add as a *new* route/view; does not alter existing code
 *
 * Minimal integration:
 *   <CaseWorkspace caseId={selectedCaseId} />
 *
 * Backend contract (FastAPI suggested):
 *   GET  /api/cases/:id/progress            -> { caseId, steps: StepState[] }
 *   PATCH /api/cases/:id/progress           -> { ok: true }
 *   POST /instant (FastAPI)                 -> processing PDFs -> returns paths + validation
 *   POST /api/cases/:id/submit              -> marks submitted
 *
 * Notes:
 * - Uses Tailwind classes; ensure Tailwind is enabled.
 * - Uses Framer Motion + Lucide icons (available in Replit by default in this project setup).
 * - This file is UI-only; wire the TODOs to your existing API.
 */

// 9 canonical steps with merged upload
const STEP_DEFS = [
  { key: "login",            label: "Log in",                                 icon: UserRound },
  { key: "create_case",      label: "Create or select case",                 icon: FolderOpen },
  { key: "case_details",     label: "Enter case details",                    icon: FileText },
  { key: "upload_all",       label: "Upload all case PDFs",                  icon: Upload },
  { key: "detect_refs",      label: "Detect references (AI)",                icon: Search },
  { key: "review_refs",      label: "Review suggestions (Lawyer)",           icon: ListChecks },
  { key: "generate_master",  label: "Generate Master PDF",                   icon: PlayCircle },
  { key: "validate_links",   label: "Validate links (0 broken)",             icon: ShieldCheck },
  { key: "submit_court",     label: "Finalize & export for court",          icon: Gavel },
] as const;

export type StepKey = typeof STEP_DEFS[number]["key"]; // union of keys

export type StepState = {
  key: StepKey;
  done: boolean;         // checked
  startedAt?: string;    // ISO
  finishedAt?: string;   // ISO
  meta?: Record<string, any>; // store per-step data if needed
};

const DEFAULT_STATE: StepState[] = STEP_DEFS.map(s => ({ key: s.key, done: false }));

function useCaseProgress(caseId: string | number | undefined) {
  const storageKey = caseId ? `jl:progress:${caseId}` : undefined;
  const [steps, setSteps] = useState<StepState[]>(DEFAULT_STATE);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Load from localStorage immediately, then try backend
  useEffect(() => {
    if (!caseId) return;
    setLoading(true);
    // local snapshot
    if (storageKey) {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        try { setSteps(JSON.parse(raw)); } catch {}
      }
    }
    // backend snapshot (non-blocking UI)
    (async () => {
      try {
        const r = await fetch(`/api/cases/${caseId}/progress`);
        if (r.ok) {
          const data = await r.json();
          if (Array.isArray(data?.steps)) {
            setSteps(mergeStates(DEFAULT_STATE, data.steps));
          }
        }
      } catch {}
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  // Persist to local + backend (debounced)
  const saveRef = useRef<number | null>(null);
  useEffect(() => {
    if (!caseId) return;
    if (storageKey) {
      localStorage.setItem(storageKey, JSON.stringify(steps));
    }
    // Debounced backend save
    if (saveRef.current) window.clearTimeout(saveRef.current);
    saveRef.current = window.setTimeout(async () => {
      try {
        setSaving(true);
        await fetch(`/api/cases/${caseId}/progress`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ steps }),
        });
      } catch {}
      setSaving(false);
    }, 400);
  }, [steps, caseId, storageKey]);

  function setDone(key: StepKey, done: boolean, meta?: Record<string, any>) {
    setSteps(prev => prev.map(s => s.key === key
      ? {
          ...s,
          done,
          meta: meta ? { ...(s.meta||{}), ...meta } : s.meta,
          startedAt: s.startedAt || (done ? new Date().toISOString() : s.startedAt),
          finishedAt: done ? new Date().toISOString() : undefined,
        }
      : s
    ));
  }

  function markNextUndoneAsActive(): StepKey | null {
    const next = STEP_DEFS.find(s => !steps.find(x => x.key === s.key)?.done);
    return next?.key ?? null;
  }

  return { steps, setSteps, setDone, loading, saving, markNextUndoneAsActive };
}

function mergeStates(base: StepState[], incoming: StepState[]): StepState[] {
  const map = new Map<StepKey, StepState>(base.map(s => [s.key, s]));
  for (const s of incoming) map.set(s.key, { ...map.get(s.key)!, ...s });
  return STEP_DEFS.map(d => map.get(d.key)!);
}

function StepItem({
  idx,
  total,
  label,
  Icon,
  done,
  active,
  onClick,
}: {
  idx: number; total: number; label: string; Icon: any; done: boolean; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left transition ${active ? "bg-zinc-800/70 text-white" : "hover:bg-zinc-800/40 text-zinc-200"}`}
    >
      <div className="relative">
        {done ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
        ) : (
          <div className={`h-5 w-5 rounded-full border ${active ? "border-white" : "border-zinc-400/60"}`} />
        )}
      </div>
      <Icon className={`h-4 w-4 ${done ? "text-emerald-400" : "text-zinc-300"}`} />
      <div className="flex-1">
        <div className="text-sm font-medium leading-tight">{idx + 1}. {label}</div>
        <div className="text-[10px] uppercase tracking-wide text-zinc-400">Step {idx + 1} of {total}</div>
      </div>
      <ChevronRight className={`h-4 w-4 ${active ? "opacity-100" : "opacity-40"}`} />
    </button>
  );
}

export default function CaseWorkspace({ caseId }: { caseId?: string | number }) {
  const { steps, setDone, loading, saving } = useCaseProgress(caseId ?? "demo");
  const [collapsed, setCollapsed] = useState(false);
  const [activeKey, setActiveKey] = useState<StepKey>(STEP_DEFS[0].key);

  // Auto-advance active key to first undone on first mount if nothing is done yet
  useEffect(() => {
    const firstUndone = STEP_DEFS.find(s => !steps.find(x => x.key === s.key)?.done);
    if (firstUndone) setActiveKey(firstUndone.key);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeIdx = STEP_DEFS.findIndex(s => s.key === activeKey);
  const progress = Math.round((steps.filter(s => s.done).length / STEP_DEFS.length) * 100);

  return (
    <div className="min-h-screen w-full bg-zinc-900 text-zinc-100 flex">
      {/* Left Panel - Always Visible */}
      <div className="w-[320px] border-r border-zinc-800 bg-zinc-900/60 backdrop-blur-sm fixed left-0 top-0 h-full z-10">
        {/* Header */}
        <div className="flex items-center p-3">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-emerald-400" />
            <div className="text-sm font-semibold">Judge‑Link — Steps</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-3 pb-2">
          <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-zinc-400">{progress}% complete</div>
        </div>

        {/* Steps */}
        <div className="px-2 py-2 space-y-1">
          {STEP_DEFS.map((s, i) => (
            <StepItem
              key={s.key}
              idx={i}
              total={STEP_DEFS.length}
              label={s.label}
              Icon={s.icon}
              done={steps.find(x => x.key === s.key)?.done ?? false}
              active={activeKey === s.key}
              onClick={() => setActiveKey(s.key)}
            />
          ))}
        </div>

        {/* Footer status */}
        <div className="mt-auto p-3 text-[11px] text-zinc-400">
          {loading ? "Loading…" : saving ? "Saving…" : "Synced"}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 min-w-0 ml-[320px]">
        <div className="max-w-5xl mx-auto p-6">
          <Header caseId={caseId} />

          <AnimatePresence mode="wait">
            <motion.div
              key={activeKey}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-lg"
            >
              <StepBody
                stepKey={activeKey}
                onComplete={(meta) => {
                  setDone(activeKey, true, meta);
                  // jump to next step
                  const next = STEP_DEFS[activeIdx + 1];
                  if (next) setActiveKey(next.key);
                }}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Header({ caseId }: { caseId?: string | number }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div>
        <div className="text-xs uppercase tracking-wider text-zinc-400">Case</div>
        <div className="text-lg font-semibold">{caseId ?? "Demo"}</div>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-zinc-300">
        <Settings2 className="h-4 w-4" />
        <span>Deterministic processing • AI arbiter • 0 broken links required</span>
      </div>
    </div>
  );
}

function StepBody({ stepKey, onComplete }: { stepKey: StepKey; onComplete: (meta?: any) => void }) {
  switch (stepKey) {
    case "login":
      return <BodyCard title="Log in" subtitle="Authenticate to continue." cta="I am logged in" onComplete={onComplete} icon={UserRound} />;
    case "create_case":
      return <BodyCard title="Create or select case" subtitle="Name the case and select it to proceed." cta="Case selected" onComplete={onComplete} icon={FolderOpen} />;
    case "case_details":
      return <BodyCard title="Enter case details" subtitle="Plaintiff, defendant, court, judge, filing dates, case number." cta="Details saved" onComplete={onComplete} icon={FileText} />;
    case "upload_all":
      return <UploadAllCasePDFs onComplete={onComplete} />;
    case "detect_refs":
      return <DetectRefs onComplete={onComplete} />;
    case "review_refs":
      return <ReviewRefs onComplete={onComplete} />;
    case "generate_master":
      return <GenerateMaster onComplete={onComplete} />;
    case "validate_links":
      return <ValidateLinks onComplete={onComplete} />;
    case "submit_court":
      return <BodyCard title="Finalize & export" subtitle="Export Master PDF + validation report for court submission." cta="Mark as submitted" onComplete={onComplete} icon={Gavel} />;
    default:
      return null;
  }
}

function BodyCard({ title, subtitle, cta, onComplete, icon: Icon }: { title: string; subtitle: string; cta: string; onComplete: (meta?: any) => void; icon: any }) {
  return (
    <div className="text-center">
      <Icon className="h-12 w-12 mx-auto text-emerald-400 mb-4" />
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <p className="text-zinc-400 mb-6">{subtitle}</p>
      <button
        onClick={() => onComplete()}
        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition"
      >
        {cta}
      </button>
    </div>
  );
}

function UploadAllCasePDFs({ onComplete }: { onComplete: (meta?: any) => void }) {
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [classification, setClassification] = useState<{briefs: string[], trialRecord: string} | null>(null);

  const handleUpload = async () => {
    if (!files) return;
    setUploading(true);
    setClassifying(true);

    // Simulate upload and auto-classification
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Mock auto-classification logic (largest file = trial record, others = briefs)
    const fileArray = Array.from(files);
    const largestFile = fileArray.reduce((largest, current) => 
      current.size > largest.size ? current : largest
    );
    
    const briefs = fileArray.filter(f => f !== largestFile).map(f => f.name);
    const trialRecord = largestFile.name;
    
    setClassification({ briefs, trialRecord });
    setClassifying(false);
    setUploading(false);
    
    onComplete({ 
      totalFiles: files.length, 
      briefCount: briefs.length,
      trialRecord: trialRecord,
      classification 
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <Upload className="h-12 w-12 mx-auto text-emerald-400 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Upload All Case PDFs</h2>
        <p className="text-zinc-400 mb-6">
          Drop all case documents at once: Brief PDFs + Trial Record
          <br />
          <span className="text-sm text-zinc-500">System will auto-classify documents by size and filename</span>
        </p>
      </div>

      {/* Upload Pad */}
      <div className="border-2 border-dashed border-zinc-600 rounded-lg p-8 text-center hover:border-emerald-500 transition-colors">
        <input
          type="file"
          accept=".pdf"
          multiple
          onChange={(e) => setFiles(e.target.files)}
          className="w-full text-sm text-zinc-400 file:mr-4 file:py-3 file:px-6 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 file:cursor-pointer"
        />
        <div className="mt-3 text-sm text-zinc-400">
          Select all PDFs or drag and drop them here
        </div>
      </div>
      
      {files && files.length > 0 && (
        <div className="p-4 bg-zinc-800/50 rounded-lg">
          <div className="text-sm font-medium text-zinc-300 mb-2">
            {files.length} file(s) selected:
          </div>
          <div className="space-y-1 text-sm text-zinc-400">
            {Array.from(files).map((file, i) => (
              <div key={i} className="flex justify-between">
                <span>{file.name}</span>
                <span>{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {classification && (
        <div className="p-4 bg-emerald-900/20 border border-emerald-800 rounded-lg">
          <div className="text-sm font-medium text-emerald-300 mb-2">Auto-Classification Complete:</div>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-zinc-400">Trial Record:</span>
              <span className="text-zinc-100 ml-2">{classification.trialRecord}</span>
            </div>
            <div>
              <span className="text-zinc-400">Brief Documents ({classification.briefs.length}):</span>
              <ul className="ml-4 mt-1">
                {classification.briefs.map((brief, i) => (
                  <li key={i} className="text-zinc-300">• {brief}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
      
      <div className="text-center">
        <button
          onClick={handleUpload}
          disabled={!files || uploading}
          className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-medium transition"
        >
          {uploading ? (
            classifying ? "Classifying documents..." : "Uploading..."
          ) : (
            "Upload & Classify All PDFs"
          )}
        </button>
      </div>

      {classifying && (
        <div className="text-center text-sm text-zinc-400">
          AI is automatically identifying Brief PDFs vs Trial Record...
        </div>
      )}
    </div>
  );
}

function DetectRefs({ onComplete }: { onComplete: (meta?: any) => void }) {
  const [detecting, setDetecting] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [tabsResult, setTabsResult] = useState<{ 
    total_links: number, 
    brief_63_links: number, 
    brief_13_links: number, 
    broken_links: number 
  } | null>(null);

  const handleDetect = async () => {
    setDetecting(true);
    // TODO: Wire to your /instant endpoint or detection API
    await new Promise(resolve => setTimeout(resolve, 3000)); // Mock AI processing
    onComplete({ referencesFound: 127 });
    setDetecting(false);
  };

  const handleOCRRebuild = async () => {
    setRebuilding(true);
    try {
      const response = await fetch('/api/rebuild-tabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error(`Rebuild failed: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.ok && data.summary) {
        setTabsResult(data.summary);
        onComplete({ 
          tabsRebuilt: true, 
          ...data.summary 
        });
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (error: any) {
      console.error('OCR rebuild failed:', error);
      alert(`OCR rebuild failed: ${error.message}`);
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* OCR Tab Rebuild Section */}
      <div className="p-6 bg-zinc-800/50 border border-zinc-700 rounded-lg">
        <div className="flex items-center justify-center gap-2 mb-4">
          <RefreshCcw className="h-6 w-6 text-amber-400" />
          <h3 className="text-lg font-medium text-amber-400">OCR-Backed Tab Rebuild</h3>
        </div>
        <p className="text-sm text-zinc-400 mb-4 text-center">
          One-click rebuild that guarantees 63 + 13 Tab hyperlinks with CSV validation
        </p>
        
        {tabsResult && (
          <div className="mb-4 p-4 bg-emerald-900/30 border border-emerald-800 rounded-lg">
            <div className="text-sm text-emerald-300 space-y-1 text-center">
              <div className="font-semibold">✅ OCR Rebuild Complete!</div>
              <div>📊 Total: {tabsResult.total_links} Tab links</div>
              <div>📋 Doc Brief: {tabsResult.brief_63_links} links</div>
              <div>📋 Supp Brief: {tabsResult.brief_13_links} links</div>
              <div>🔗 Broken: {tabsResult.broken_links} links</div>
            </div>
          </div>
        )}
        
        <div className="text-center">
          <button
            onClick={handleOCRRebuild}
            disabled={rebuilding}
            className="px-6 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg font-medium transition flex items-center justify-center gap-2 mx-auto"
          >
            {rebuilding ? (
              <>
                <RefreshCcw className="h-4 w-4 animate-spin" />
                OCR Rebuilding...
              </>
            ) : (
              <>
                <RefreshCcw className="h-4 w-4" />
                Rebuild Tab Links (OCR)
              </>
            )}
          </button>
        </div>
      </div>

      {/* Original AI Detection */}
      <div className="text-center">
        <Search className="h-12 w-12 mx-auto text-emerald-400 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Detect References (AI)</h2>
        <p className="text-zinc-400 mb-6">AI will scan briefs and identify all cross-references to the trial record</p>
        
        <button
          onClick={handleDetect}
          disabled={detecting}
          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-medium transition"
        >
          {detecting ? "Analyzing documents..." : "Start AI Detection"}
        </button>
        
        {detecting && (
          <div className="mt-4 text-sm text-zinc-300">
            AI is processing your documents...
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewRefs({ onComplete }: { onComplete: (meta?: any) => void }) {
  const [lawyerName, setLawyerName] = useState("");
  const [selectedReference, setSelectedReference] = useState<number | null>(null);
  const [references] = useState([
    {
      id: 1,
      source: "Amended Supp Doc Brief - Ferrante - 3 July 2025 (2)",
      sourceText: "As shown in Exhibit A, the defendant failed to comply with the court order...",
      targetText: "EXHIBIT A - Court Order dated June 15, 2025 regarding compliance requirements...",
      targetPage: 47,
      type: "Exhibit",
      confidence: 0.98,
      status: "pending", // pending, approved, declined
      alternates: [48, 49]
    },
    {
      id: 2,
      source: "Amended Doc Brief - Ferrante - 3 July 2025",
      sourceText: "The witness refused to answer as documented in Refusal #3...",
      targetText: "REFUSAL #3: Question regarding the events of March 12, 2025. Witness cited privilege...",
      targetPage: 156,
      type: "Refusal",
      confidence: 0.95,
      status: "pending",
      alternates: [157, 158]
    },
    {
      id: 3,
      source: "Amended Supp Doc Brief - Ferrante - 3 July 2025 (2)",
      sourceText: "Per the undertaking given during examination, the document was to be produced...",
      targetText: "UNDERTAKING: Counsel undertakes to produce all relevant correspondence by...",
      targetPage: 203,
      type: "Undertaking",
      confidence: 0.92,
      status: "pending",
      alternates: [204, 205]
    }
  ]);

  const [referenceStates, setReferenceStates] = useState<Record<number, 'approved' | 'declined' | 'pending'>>(
    references.reduce((acc, ref) => ({ ...acc, [ref.id]: ref.status as 'approved' | 'declined' | 'pending' }), {} as Record<number, 'approved' | 'declined' | 'pending'>)
  );

  const approvedCount = Object.values(referenceStates).filter(status => status === 'approved').length;
  const declinedCount = Object.values(referenceStates).filter(status => status === 'declined').length;
  const pendingCount = Object.values(referenceStates).filter(status => status === 'pending').length;

  const handleReferenceAction = (refId: number, action: 'approve' | 'decline' | 'alternate', alternatePage?: number) => {
    setReferenceStates(prev => ({
      ...prev,
      [refId]: action === 'alternate' ? 'approved' : action === 'approve' ? 'approved' : 'declined'
    }));
  };

  const allReferencesReviewed = pendingCount === 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
      {/* Left Panel: References List */}
      <div className="lg:col-span-1 space-y-4">
        <div>
          <h2 className="text-xl font-semibold mb-2">Step 7: Lawyer Review Required</h2>
          <p className="text-zinc-400 text-sm mb-4">
            Review each AI-detected reference. Click to see side-by-side comparison.
          </p>
        </div>

        {/* Lawyer Name Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            Reviewing Lawyer Name
          </label>
          <input
            type="text"
            value={lawyerName}
            onChange={(e) => setLawyerName(e.target.value)}
            placeholder="Enter your full name and bar number"
            className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        {/* References List */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {references.map((ref) => (
            <div
              key={ref.id}
              onClick={() => setSelectedReference(ref.id)}
              className={`p-3 rounded-lg border cursor-pointer transition ${
                selectedReference === ref.id
                  ? 'bg-emerald-900/30 border-emerald-600'
                  : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs px-2 py-1 rounded ${
                  ref.type === 'Exhibit' ? 'bg-blue-900/50 text-blue-300' :
                  ref.type === 'Refusal' ? 'bg-red-900/50 text-red-300' :
                  'bg-yellow-900/50 text-yellow-300'
                }`}>
                  {ref.type}
                </span>
                <span className={`text-xs ${
                  referenceStates[ref.id] === 'approved' ? 'text-green-400' :
                  referenceStates[ref.id] === 'declined' ? 'text-red-400' :
                  'text-zinc-400'
                }`}>
                  {referenceStates[ref.id] === 'approved' ? '✓ Approved' :
                   referenceStates[ref.id] === 'declined' ? '✗ Declined' :
                   '○ Pending'}
                </span>
              </div>
              <div className="text-sm text-zinc-300 truncate">
                {ref.sourceText.substring(0, 60)}...
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                → Page {ref.targetPage} ({Math.round(ref.confidence * 100)}% confidence)
              </div>
            </div>
          ))}
        </div>

        {/* Progress Summary */}
        <div className="p-3 bg-zinc-800/30 rounded-lg border border-zinc-700">
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <div className="text-green-400 font-semibold">{approvedCount}</div>
              <div className="text-zinc-400">Approved</div>
            </div>
            <div>
              <div className="text-red-400 font-semibold">{declinedCount}</div>
              <div className="text-zinc-400">Declined</div>
            </div>
            <div>
              <div className="text-zinc-400 font-semibold">{pendingCount}</div>
              <div className="text-zinc-400">Pending</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel: Side-by-Side Comparison */}
      <div className="lg:col-span-2">
        {selectedReference ? (
          <SideBySideReview
            reference={references.find(r => r.id === selectedReference)!}
            onAction={handleReferenceAction}
            lawyerName={lawyerName}
          />
        ) : (
          <div className="h-full flex items-center justify-center bg-zinc-800/30 rounded-lg border border-zinc-700">
            <div className="text-center text-zinc-400">
              <ListChecks className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Select a reference from the left panel to review</p>
            </div>
          </div>
        )}
      </div>

      {/* Complete Button - Fixed at bottom */}
      {allReferencesReviewed && (
        <div className="lg:col-span-3 text-center">
          <button
            onClick={() => onComplete({ 
              approved: approvedCount,
              declined: declinedCount,
              total: references.length,
              lawyerName 
            })}
            disabled={!lawyerName}
            className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition"
          >
            Complete Review ({references.length} references processed)
          </button>
          {!lawyerName && (
            <p className="text-sm text-red-400 mt-2">Please enter your name to complete review</p>
          )}
        </div>
      )}
    </div>
  );
}

function SideBySideReview({ 
  reference, 
  onAction, 
  lawyerName 
}: { 
  reference: any; 
  onAction: (refId: number, action: 'approve' | 'decline' | 'alternate', alternatePage?: number) => void;
  lawyerName: string;
}) {
  return (
    <div className="h-full bg-zinc-800/30 rounded-lg border border-zinc-700 p-4">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold">Side-by-Side Review</h3>
          <span className={`text-xs px-2 py-1 rounded ${
            reference.type === 'Exhibit' ? 'bg-blue-900/50 text-blue-300' :
            reference.type === 'Refusal' ? 'bg-red-900/50 text-red-300' :
            'bg-yellow-900/50 text-yellow-300'
          }`}>
            {reference.type} • {Math.round(reference.confidence * 100)}% Confidence
          </span>
        </div>
      </div>

      {/* Side-by-Side Content */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Source (Brief) */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-zinc-300">Source (Brief Document)</div>
          <div className="p-4 bg-zinc-900/50 rounded-lg border border-zinc-700">
            <div className="text-xs text-zinc-400 mb-2">{reference.source}</div>
            <div className="text-sm text-zinc-100 leading-relaxed">
              <span className="bg-yellow-500/20 px-1 rounded">{reference.sourceText}</span>
            </div>
          </div>
        </div>

        {/* Target (Trial Record) */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-zinc-300">Target (Trial Record Page {reference.targetPage})</div>
          <div className="p-4 bg-zinc-900/50 rounded-lg border border-zinc-700">
            <div className="text-xs text-zinc-400 mb-2">Trial Record - Page {reference.targetPage}</div>
            <div className="text-sm text-zinc-100 leading-relaxed">
              <span className="bg-emerald-500/20 px-1 rounded">{reference.targetText}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Alternate Pages */}
      {reference.alternates && reference.alternates.length > 0 && (
        <div className="mb-6">
          <div className="text-sm font-medium text-zinc-300 mb-2">Alternative Target Pages:</div>
          <div className="flex gap-2">
            {reference.alternates.map((page: number) => (
              <button
                key={page}
                onClick={() => onAction(reference.id, 'alternate', page)}
                disabled={!lawyerName}
                className="px-3 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-300 rounded transition"
              >
                Page {page}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => onAction(reference.id, 'approve')}
          disabled={!lawyerName}
          className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg font-medium transition"
        >
          ✓ Approve Link
        </button>
        <button
          onClick={() => onAction(reference.id, 'decline')}
          disabled={!lawyerName}
          className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-medium transition"
        >
          ✗ Decline Link
        </button>
      </div>

      {!lawyerName && (
        <p className="text-xs text-red-400 mt-2 text-center">Enter lawyer name above to take actions</p>
      )}
    </div>
  );
}

function GenerateMaster({ onComplete }: { onComplete: (meta?: any) => void }) {
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    // TODO: Wire to your Master PDF generation endpoint
    await new Promise(resolve => setTimeout(resolve, 2000)); // Mock generation
    onComplete({ masterPdfPath: "/downloads/master.pdf" });
    setGenerating(false);
  };

  return (
    <div className="text-center">
      <PlayCircle className="h-12 w-12 mx-auto text-emerald-400 mb-4" />
      <h2 className="text-xl font-semibold mb-2">Generate Master PDF</h2>
      <p className="text-zinc-400 mb-6">Create the final Master PDF with all approved hyperlinks</p>
      
      <button
        onClick={handleGenerate}
        disabled={generating}
        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-medium transition"
      >
        {generating ? "Generating PDF..." : "Generate Master PDF"}
      </button>
    </div>
  );
}

function ValidateLinks({ onComplete }: { onComplete: (meta?: any) => void }) {
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<{ brokenLinks: number } | null>(null);

  const handleValidate = async () => {
    setValidating(true);
    // TODO: Wire to your validation endpoint
    await new Promise(resolve => setTimeout(resolve, 1500)); // Mock validation
    const mockResult = { brokenLinks: 0 };
    setResult(mockResult);
    setValidating(false);
    if (mockResult.brokenLinks === 0) {
      onComplete(mockResult);
    }
  };

  return (
    <div className="text-center">
      <ShieldCheck className="h-12 w-12 mx-auto text-emerald-400 mb-4" />
      <h2 className="text-xl font-semibold mb-2">Validate Links (0 broken)</h2>
      <p className="text-zinc-400 mb-6">Ensure all hyperlinks are valid and court-ready</p>
      
      {result && (
        <div className={`mb-4 p-4 rounded-lg ${result.brokenLinks === 0 ? 'bg-emerald-900/30 border border-emerald-800' : 'bg-red-900/30 border border-red-800'}`}>
          <div className="text-sm">
            {result.brokenLinks === 0 ? (
              <span className="text-emerald-300">✓ All links are valid! Court-ready.</span>
            ) : (
              <span className="text-red-300">⚠ {result.brokenLinks} broken links found</span>
            )}
          </div>
        </div>
      )}
      
      <button
        onClick={handleValidate}
        disabled={validating}
        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-medium transition"
      >
        {validating ? "Validating..." : "Validate All Links"}
      </button>
    </div>
  );
}