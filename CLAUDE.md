# Citation Graph Explorer — project context for Claude Code

A local web app for literature review: enter a seed paper, explore an interactive
citation graph from Semantic Scholar, cluster papers into LLM-labeled themes, and
narrate the lineage between any two papers.

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
  and `embedding` (SPECTER2) fields instead of calling an LLM for them.
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
- **Lineage narration:** pick two nodes → shortest path over citation edges → Claude
  narrates how the ideas progressed. Cached per path.
- Model: `claude-sonnet-4-6` via the Anthropic Messages API (prompt caching on the system
  prompt). All LLM outputs cached in SQLite (`llm_cache`).

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
  App.jsx        central state + graph merge/dedupe
  api.js         backend client
  components/    SeedInput, GraphView, DetailPanel, Legend, Filters, LineagePanel, StatusBar
```
