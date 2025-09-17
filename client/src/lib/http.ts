export async function safeApiRequest(input: RequestInfo, init?: RequestInit) {
  const res = await fetch(input, { credentials: "include", ...init });

  // Handle non-2xx
  if (!res.ok) {
    const ct = res.headers.get("content-type") || "";
    let detail: any = null;
    if (ct.includes("application/json")) {
      try { detail = await res.json(); } catch {}
    } else {
      try { detail = await res.text(); } catch {}
    }
    const err: any = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    err.detail = detail;
    throw err;
  }

  // 204 No Content → return null
  if (res.status === 204) return null;

  // Try JSON, otherwise text
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}