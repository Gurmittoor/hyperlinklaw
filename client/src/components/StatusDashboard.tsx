import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type Summary = {
  health: { status: string; timestamp: string };
  ready: { status: string; services: { database: string } };
  counters: { status: string; c: number }[];
  recentErrors: { id: string; title: string; index_status: string; index_count: number|null; index_detected_at: string|null }[];
};

type DocItem = {
  id: string;
  title: string;
  created_at: string;
  index_status: "pending"|"ok"|"error"|"none";
  index_count: number | null;
  index_detected_at: string | null;
  total_pages: number | null;
  has_links: boolean;
};

function Badge({ kind, children }: { kind: "ok"|"pending"|"error"|"none"; children: any }) {
  const theme = {
    ok: "bg-green-100 text-green-700 border-green-200",
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    error: "bg-rose-100 text-rose-700 border-rose-200",
    none: "bg-slate-100 text-slate-700 border-slate-200",
  }[kind];
  return <span className={`px-2 py-0.5 rounded-md text-xs border ${theme}`}>{children}</span>;
}

export default function StatusDashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [summaryResponse, docsResponse] = await Promise.all([
        fetch("/api/status/summary", { credentials: 'include' }),
        fetch("/api/status/recent-docs?limit=12", { credentials: 'include' }),
      ]);

      if (summaryResponse.ok && docsResponse.ok) {
        const [summaryData, docsData] = await Promise.all([
          summaryResponse.json(),
          docsResponse.json(),
        ]);
        setSummary(summaryData);
        setDocs(docsData.items);
      }
    } catch (error) {
      console.error("Failed to fetch status data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(fetchAll, 10_000); // 10s refresh
    return () => clearInterval(t);
  }, [autoRefresh, fetchAll]);

  const totals = useMemo(() => {
    const map = new Map(summary?.counters.map(x => [x.status, x.c]) || []);
    return {
      ok: map.get("ok") || 0,
      pending: map.get("pending") || 0,
      error: map.get("error") || 0,
      none: map.get("none") || 0,
    };
  }, [summary]);

  const handleRetryIndex = async (docId: string) => {
    try {
      await api.documents.retryIndexDetection(docId);
      fetchAll(); // Refresh data
    } catch (error) {
      console.error("Failed to retry index:", error);
    }
  };

  const handleRetryLinks = async (docId: string) => {
    try {
      await api.documents.retryLinkBuilding(docId);
      fetchAll(); // Refresh data
    } catch (error) {
      console.error("Failed to retry links:", error);
    }
  };

  return (
    <div className="p-4 grid gap-4" data-testid="status-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">System Status</h1>
        <div className="flex items-center gap-3">
          <label className="text-sm flex items-center gap-2">
            <input 
              type="checkbox" 
              checked={autoRefresh} 
              onChange={e => setAutoRefresh(e.target.checked)}
              data-testid="checkbox-autorefresh"
            />
            Auto-refresh
          </label>
          <button 
            onClick={fetchAll} 
            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800"
            data-testid="button-refresh"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Health cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="rounded-2xl border p-4" data-testid="card-health">
          <div className="text-sm text-slate-500">Health</div>
          <div className="mt-1">
            <Badge kind={summary?.health.status === "healthy" ? "ok" : "error"}>
              {summary?.health.status ?? "…"}
            </Badge>
          </div>
          <div className="text-xs text-slate-500 mt-2">
            {summary?.health.timestamp ? new Date(summary.health.timestamp).toLocaleString() : "…"}
          </div>
        </div>

        <div className="rounded-2xl border p-4" data-testid="card-database">
          <div className="text-sm text-slate-500">Database</div>
          <div className="mt-1">
            <Badge kind={summary?.ready.services.database === "connected" ? "ok" : "error"}>
              {summary?.ready.services.database ?? "…"}
            </Badge>
          </div>
          <div className="text-xs text-slate-500 mt-2">Ready: {summary?.ready.status ?? "…"}</div>
        </div>

        <div className="rounded-2xl border p-4" data-testid="card-index-ok">
          <div className="text-sm text-slate-500">Index OK</div>
          <div className="mt-1 text-2xl font-semibold" data-testid="text-index-ok-count">{totals.ok}</div>
          <div className="text-xs text-slate-500 mt-2">Completed</div>
        </div>

        <div className="rounded-2xl border p-4" data-testid="card-pending-errors">
          <div className="text-sm text-slate-500">Pending / Errors</div>
          <div className="mt-1 text-2xl font-semibold" data-testid="text-pending-error-count">
            {totals.pending} / {totals.error}
          </div>
          <div className="text-xs text-slate-500 mt-2">In-flight / Failed</div>
        </div>
      </div>

      {/* Recent errors */}
      {summary?.recentErrors?.length ? (
        <div className="rounded-2xl border p-4" data-testid="card-recent-errors">
          <div className="mb-2 font-medium">Recent Index Errors (24h)</div>
          <ul className="text-sm space-y-1">
            {summary.recentErrors.map(e => (
              <li key={e.id} className="flex items-center gap-2" data-testid={`error-${e.id}`}>
                <Badge kind="error">error</Badge>
                <span className="truncate">{e.title || e.id}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">
                  {e.index_detected_at ? new Date(e.index_detected_at).toLocaleString() : "–"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Recent documents table */}
      <div className="rounded-2xl border overflow-hidden" data-testid="table-recent-docs">
        <div className="px-4 py-3 border-b bg-slate-50/50 font-medium">Recent Documents</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50/50">
              <tr className="text-left">
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2">Index</th>
                <th className="px-4 py-2">Count</th>
                <th className="px-4 py-2">Links</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500" data-testid="text-loading">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && docs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500" data-testid="text-no-docs">
                    No documents yet
                  </td>
                </tr>
              )}
              {docs.map(d => (
                <tr key={d.id} className="border-t" data-testid={`row-doc-${d.id}`}>
                  <td className="px-4 py-2 max-w-[320px] truncate" data-testid={`text-title-${d.id}`}>
                    {d.title || d.id}
                  </td>
                  <td className="px-4 py-2" data-testid={`text-created-${d.id}`}>
                    {new Date(d.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2" data-testid={`badge-index-${d.id}`}>
                    <Badge kind={d.index_status === "ok" ? "ok" : d.index_status === "pending" ? "pending" : d.index_status === "error" ? "error" : "none"}>
                      {d.index_status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2" data-testid={`text-count-${d.id}`}>
                    {typeof d.index_count === "number" ? d.index_count : "—"}
                  </td>
                  <td className="px-4 py-2" data-testid={`badge-links-${d.id}`}>
                    {d.has_links ? <Badge kind="ok">linked</Badge> : <Badge kind="none">none</Badge>}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {d.index_status === "error" && (
                        <button
                          onClick={() => handleRetryIndex(d.id)}
                          className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                          data-testid={`button-retry-index-${d.id}`}
                        >
                          Retry Index
                        </button>
                      )}
                      {d.index_status === "ok" && d.index_count && d.index_count > 0 && !d.has_links && (
                        <button
                          onClick={() => handleRetryLinks(d.id)}
                          className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                          data-testid={`button-retry-links-${d.id}`}
                        >
                          Retry Links
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}