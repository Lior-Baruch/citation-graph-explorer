# Citation Graph Explorer

A local web app for literature review: enter a seed paper, explore an interactive
citation graph fetched from Semantic Scholar, cluster papers into LLM-labeled
themes, and narrate the intellectual lineage between any two papers.

The frontend ALWAYS talks to Semantic Scholar and the Claude API **through the
backend** — never directly — so caching and rate-limiting stay centralized.

## Architecture

```
frontend (Vite/React) ──/api──► FastAPI backend ──► Semantic Scholar Graph API
                                              └────► Claude API (Anthropic)
                                              └────► SQLite cache (cache.db)
```

## Prerequisites
- Python 3.11+ (a `.venv` already exists in the repo root).
- Node.js 18+ (LTS) for the frontend.

## Setup

### Backend
```powershell
# From the repo root. Activate the existing venv:
.\.venv\Scripts\Activate.ps1

pip install -r backend\requirements.txt

# Configure keys (both optional — see "Environment variables" below):
copy backend\.env.example backend\.env   # then edit backend\.env
```

### Frontend
```powershell
cd frontend
npm install
```

## Environment variables (`backend/.env`)
Both are **optional** — the app runs fully without either.

| Variable            | Effect when set                                                              |
|---------------------|------------------------------------------------------------------------------|
| `ANTHROPIC_API_KEY` | Enables LLM cluster labels + lineage narration. Without it those features are gracefully disabled and the UI says so. |
| `S2_API_KEY`        | Raises Semantic Scholar throughput. Without it the backend throttles to ≤1 request/second. |

> ⚠️ **Security:** never commit `backend/.env` (it is gitignored). If a key has
> ever been pasted into a chat or shared, rotate it.

## Running

Two terminals:

```powershell
# Terminal 1 — backend (from backend/)
cd backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

```powershell
# Terminal 2 — frontend dev server (from frontend/)
cd frontend
npm run dev      # http://localhost:5173  (proxies /api -> http://127.0.0.1:8000)
```

Open http://localhost:5173. It auto-loads the demo seed
**"Attention Is All You Need" (arXiv:1706.03762)**.

### Single-port production mode
```powershell
cd frontend
npm run build            # emits frontend/dist
cd ..\backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
# Whole app served from http://127.0.0.1:8000
```

## Semantic Scholar — rate limit & caching rules (important)
These are enforced centrally in `backend/app/s2_client.py`:

- **No API key required** to start. Without `S2_API_KEY`, all outbound S2 calls
  are throttled to **≤ 1 request/second** via an async token bucket.
- With `S2_API_KEY`, the key is sent as `x-api-key` and the rate is raised.
- **Retry with exponential backoff** on HTTP 429 / 5xx (1s, 2s, 4s, …), honoring
  the `Retry-After` header when present.
- **Every S2 response is cached in SQLite** (`backend/cache.db`) keyed by
  endpoint + id + fields. Repeat panning / re-runs are instant and free, and the
  UI shows a **"● cached" vs "● live"** indicator per fetch.
- The `/paper/batch` endpoint hydrates many papers in one request. We deliberately
  use the **free** `tldr` (one-line summary) and `embedding` (SPECTER2 vector,
  used for clustering) fields instead of calling an LLM for them.
- **Title search caveat:** Semantic Scholar throttles its **keyless `/paper/search`
  endpoint very aggressively** (frequent HTTP 429 even at 1 req/s). ID-style lookups
  (`arXiv:…`, `DOI:…`, S2 ids, URLs) use the reliable `/paper/{id}` endpoint and work
  keyless. For dependable **title** search, set `S2_API_KEY`. `resolve` auto-detects
  ids by known scheme prefixes (so titles containing a colon, e.g. "DPO: …", are
  searched, not mistaken for ids) and falls back to title search if an id 404s.

## Graph behavior (by design)
- **Never auto-expands the whole graph.** Starts from the seed + its immediate
  neighborhood only.
- Each expansion is capped at **≤25 references + ≤25 citations**, ranked by
  `influentialCitationCount` (fallback `citationCount`).
- Clicking any node expands ITS neighborhood on demand and **merges** into the
  existing graph, deduping by `paperId`.
- Node size = citation count (log-scaled); node color = cluster; arrow direction
  distinguishes "cites" vs "cited by".

## Clustering + LLM features
- Clustering: **KMeans** over SPECTER2 embeddings (k chosen by silhouette),
  falling back to **Louvain** community detection (networkx) when embeddings are
  missing/sparse. See `backend/app/cluster.py`.
- **Cluster labels:** each cluster's titles + tldrs are sent to Claude for a 2–4
  word theme label, cached per cluster signature.
- **Lineage narration:** pick two nodes → shortest path over citation edges →
  Claude narrates how the ideas progressed. Cached per path.
- Model: `claude-sonnet-4-6` via the Anthropic Messages API (prompt caching on
  the system prompt). All LLM outputs cached in SQLite (`llm_cache`).

## Project layout
```
backend/
  app/
    main.py        FastAPI app, CORS, static frontend mount
    config.py      env + constants (rate limit, caps, model)
    db.py          SQLite cache (s2_cache, llm_cache, papers)
    s2_client.py   rate-limited + cached Semantic Scholar client
    cluster.py     KMeans / Louvain clustering
    llm.py         Claude labels + lineage (graceful when no key)
    routes.py      /api endpoints
    schemas.py     pydantic models
  requirements.txt
frontend/
  src/
    App.jsx               central state + graph merge/dedupe
    api.js                backend client
    components/           SeedInput, GraphView, DetailPanel, Legend,
                          Filters, LineagePanel, StatusBar
```
