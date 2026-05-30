// Thin client for the backend API. The browser only ever talks to these routes.

async function jsonFetch(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch (_) {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

export const api = {
  config: () => jsonFetch("/api/config"),

  resolve: (query) =>
    jsonFetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    }),

  neighbors: (paperId) =>
    jsonFetch(`/api/neighbors/${encodeURIComponent(paperId)}`),

  paper: (paperId) => jsonFetch(`/api/paper/${encodeURIComponent(paperId)}`),

  cluster: (paperIds, edges) =>
    jsonFetch("/api/cluster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paperIds, edges }),
    }),

  lineage: (sourceId, targetId, edges) =>
    jsonFetch("/api/lineage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId, targetId, edges }),
    }),
};
