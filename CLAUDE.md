# Citation Graph Explorer — project context for Claude Code

A local web app for literature review: enter a seed paper, explore an interactive
citation graph from Semantic Scholar, cluster papers into LLM-labeled themes, narrate
the lineage between any two papers, find semantically similar papers, discover related
work via S2 recommendations, explain papers / analyze the landscape with Claude, and
build a reading list you can export (BibTeX/RIS/JSON/PNG) with auto-saved sessions.

> Setup, install, running, env vars, and tech stack live in **[README.md](README.md)** —
> not duplicated here. This file is the AI/dev reference for the rules and constraints
> that aren't obvious from the code.

**Critical invariant:** the frontend ALWAYS talks to Semantic Scholar and the Claude API
**through the backend** — never directly — so caching and rate-limiting stay centralized.
Keep it that way; don't add direct S2/Anthropic calls from the frontend.

Keys are read from `backend/.env` (gitignored). Both `ANTHROPIC_API_KEY` and `S2_API_KEY`
are optional; the app must keep working without either (LLM features degrade gracefully).
Never commit `.env`; if a key is shared, rotate it.

## Semantic Scholar — rate limit & caching rules (enforced in `backend/app/s2_client.py`)
- **No API key required.** Without `S2_API_KEY`, all outbound S2 calls are throttled to
  **≤ 1 request/second** via an async token bucket. With a key, it's sent as `x-api-key`
  and the rate is raised.
- **Retry with exponential backoff** on HTTP 429 / 5xx (1s, 2s, 4s, …), honoring the
  `Retry-After` header when present.
- **Every S2 response is cached in SQLite** (`backend/cache.db`) keyed by endpoint + id +
  fields. The UI shows a **● cached / ● live** indicator per fetch.
- `/paper/batch` hydrates many papers at once. We deliberately use the **free** `tldr`
  and `embedding` (SPECTER2) fields instead of calling an LLM for them. `PAPER_FIELDS` also
  includes `venue` (for citation export). **Caveat:** the `papers` table caches whole
  records by id, so papers cached before a field was added won't have it until re-fetched.
- **Recommendations** live on a *separate* host/base (`RECOMMENDATIONS_BASE_URL`,
  `/recommendations/v1`), reached through the same throttled/cached `_request` path via
  `_cached_get(..., base=...)`. We default to **`from=all-cs`** — the default `recent` pool
  returns nothing for older seminal papers.
- **Title search caveat:** S2 throttles its keyless `/paper/search` endpoint very
  aggressively (frequent 429s even at 1 req/s). ID-style lookups (`arXiv:…`, `DOI:…`, S2
  ids, URLs) use the reliable `/paper/{id}` endpoint and work keyless. `resolve` detects
  ids by known scheme prefixes (so titles with a colon, e.g. "DPO: …", are searched, not
  mistaken for ids) and falls back to title search if an id 404s.

## Graph behavior (by design — don't regress)
- **Never auto-expands the whole graph.** Starts from the seed + its immediate
  neighborhood only.
- Each expansion is capped at **≤25 references + ≤25 citations**, ranked by
  `influentialCitationCount` (fallback `citationCount`).
- Clicking a node expands ITS neighborhood on demand and **merges** into the existing
  graph, deduping by `paperId`.
- Node size = citation count (log-scaled); node color = cluster; arrow direction
  distinguishes "cites" vs "cited by".

## Clustering + LLM features
- Clustering: **KMeans** over SPECTER2 embeddings (k chosen by silhouette), falling back
  to **Louvain** community detection (networkx) when embeddings are missing/sparse.
  See `backend/app/cluster.py`.
- **Cluster labels:** each cluster's titles + tldrs → Claude → a 2–4 word theme label,
  cached per cluster signature.
- **Cluster summaries:** opt-in via the `summarize` flag on `POST /api/cluster` (so the
  recluster-on-every-expand path doesn't pay for them); a 1–2 sentence theme summary cached
  per signature, surfaced lazily from the Legend.
- **Lineage narration:** pick two nodes → shortest path over citation edges → Claude
  narrates how the ideas progressed. Cached per path.
- **Explain a paper:** `POST /api/explain` loads the record server-side (by id) → Claude
  gives a plain-language explanation, cached per paper id + content.
- **Landscape analysis:** `POST /api/landscape` re-clusters, labels, and asks Claude for a
  themes-and-gaps briefing, cached by the combined cluster signatures (so it invalidates
  whenever the graph changes).
- Model: `claude-sonnet-4-6` via the Anthropic Messages API (prompt caching on each system
  prompt). All LLM outputs cached in SQLite (`llm_cache`). **The sync Anthropic SDK is
  always called via `asyncio.to_thread`** from the async routes so it never blocks the event
  loop; per-cluster label/summary calls are fanned out with `asyncio.gather`.

## Semantic similarity, discovery, export, sessions
- **Find similar (`POST /api/similar`):** paper-to-paper cosine over SPECTER2 vectors read
  from the `papers` cache (via `cluster._embedding_of`); **no S2/LLM call**, the query id is
  excluded, papers without embeddings are skipped. This is a *local highlight over loaded
  papers*, not discovery. Text/concept search is intentionally NOT supported (would need a
  heavy local SPECTER2 model; cross-embedding-space cosine is meaningless).
- **Discovery (`GET /api/recommend/{id}`):** S2 recommendations hydrated via `batch`; the UI
  shows them as "suggested" and the user chooses what to add (dashed `relation:"suggested"`
  edge) — **never auto-added**, preserving the no-runaway-graph invariant.
- **Export & sessions are client-side** (all paper metadata already lives in node objects):
  `frontend/src/utils/export.js` builds BibTeX/RIS/JSON; PNG comes from the force-graph
  canvas (`GraphView` exposes `exportPng` via `forwardRef`). Sessions auto-save to
  `localStorage` (key `cge.session.v1`, abstracts stripped to fit quota) and the bootstrap
  effect offers to restore **before** auto-loading the demo seed.

## Concurrency note (`backend/app/db.py`)
A single module-level SQLite connection is shared across threads (`check_same_thread=False`).
Because LLM calls now run concurrently under `asyncio.to_thread`, **all** connection access —
reads included (`s2_get`/`llm_get`/`paper_get`), not just writes — is guarded by the module
`_lock`; a bare concurrent read on one connection raises `sqlite3.InterfaceError`.

## Project layout
```
backend/app/
  main.py        FastAPI app, CORS, static frontend mount
  config.py      env + constants (rate limit, caps, model)
  db.py          SQLite cache (s2_cache, llm_cache, papers)
  s2_client.py   rate-limited + cached Semantic Scholar client
  cluster.py     KMeans / Louvain clustering
  llm.py         Claude labels + lineage (graceful when no key)
  routes.py      /api endpoints
  schemas.py     pydantic models
frontend/src/
  App.jsx        central state + graph merge/dedupe + similar/recs/LLM/session handlers
  api.js         backend client
  utils/export.js  client-side BibTeX/RIS/JSON + download helpers
  components/    SeedInput, GraphView (forwardRef: exportPng), DetailPanel (similar/explain/
                 recommend/star), Legend (+summaries), Filters, LineagePanel, LandscapePanel,
                 ReadingListPanel, Toolbar (export/session), StatusBar
```
