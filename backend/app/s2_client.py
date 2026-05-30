"""Async Semantic Scholar Graph API client.

Centralizes the rules that MUST hold for every outbound S2 call:
  * Throttle to <= 1 request/second (configurable; raised when S2_API_KEY is set).
  * Retry with exponential backoff on HTTP 429 / 5xx, honoring Retry-After.
  * Cache every response in SQLite, returning a `source` of "cache" or "live".

Returned dicts use the shape {"data": ..., "source": "cache"|"live"} so callers
(and ultimately the UI) can show a cache-vs-live indicator.
"""
import asyncio
import time
from typing import Any, Optional

import httpx

from . import config, db


class _RateLimiter:
    """Simple async token-bucket enforcing a minimum interval between calls."""

    def __init__(self, rate_per_sec: float):
        self._min_interval = 1.0 / rate_per_sec if rate_per_sec > 0 else 0.0
        self._lock = asyncio.Lock()
        self._next_allowed = 0.0

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            wait = self._next_allowed - now
            if wait > 0:
                await asyncio.sleep(wait)
                now = time.monotonic()
            self._next_allowed = now + self._min_interval


_limiter = _RateLimiter(config.S2_RATE_LIMIT_PER_SEC)
_client: Optional[httpx.AsyncClient] = None


def _headers() -> dict:
    h = {"User-Agent": "citation-graph-explorer/1.0"}
    if config.S2_API_KEY:
        h["x-api-key"] = config.S2_API_KEY
    return h


async def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=config.S2_TIMEOUT, headers=_headers())
    return _client


async def close_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def _request(method: str, url: str, *, params=None, json_body=None) -> Any:
    """Throttled request with exponential backoff. Returns parsed JSON."""
    client = await get_client()
    delay = config.S2_BACKOFF_BASE
    last_exc: Optional[Exception] = None

    for attempt in range(config.S2_MAX_RETRIES):
        await _limiter.acquire()
        try:
            resp = await client.request(method, url, params=params, json=json_body)
        except (httpx.TransportError, httpx.TimeoutException) as exc:
            last_exc = exc
            await asyncio.sleep(delay)
            delay *= 2
            continue

        if resp.status_code == 429 or resp.status_code >= 500:
            retry_after = resp.headers.get("Retry-After")
            sleep_for = float(retry_after) if retry_after and retry_after.isdigit() else delay
            await asyncio.sleep(sleep_for)
            delay *= 2
            continue

        resp.raise_for_status()
        return resp.json()

    if last_exc:
        raise last_exc
    raise RuntimeError(f"S2 request failed after {config.S2_MAX_RETRIES} retries: {url}")


async def _cached_get(cache_key: str, path: str, params: dict) -> dict:
    cached = db.s2_get(cache_key)
    if cached is not None:
        return {"data": cached, "source": "cache"}
    data = await _request("GET", f"{config.S2_BASE_URL}{path}", params=params)
    db.s2_set(cache_key, data)
    return {"data": data, "source": "live"}


# --- Public API -------------------------------------------------------------

async def resolve(query: str) -> dict:
    """Resolve a seed id (arXiv:..., DOI, S2 id, URL) to {paperId, title}."""
    fields = "paperId,title,externalIds"
    key = f"resolve:{query}:{fields}"
    return await _cached_get(key, f"/paper/{query}", {"fields": fields})


async def search_title(query: str, limit: int = 10) -> dict:
    fields = "paperId,title,year,authors,citationCount,externalIds"
    key = f"search:{query}:{limit}:{fields}"
    return await _cached_get(
        key, "/paper/search", {"query": query, "limit": limit, "fields": fields}
    )


async def references(paper_id: str, limit: int = 100) -> dict:
    fields = "paperId,title,influentialCitationCount,citationCount"
    key = f"refs:{paper_id}:{limit}:{fields}"
    return await _cached_get(
        key, f"/paper/{paper_id}/references",
        {"fields": fields, "limit": limit},
    )


async def citations(paper_id: str, limit: int = 100) -> dict:
    fields = "paperId,title,influentialCitationCount,citationCount"
    key = f"cites:{paper_id}:{limit}:{fields}"
    return await _cached_get(
        key, f"/paper/{paper_id}/citations",
        {"fields": fields, "limit": limit},
    )


async def batch(paper_ids: list[str]) -> dict:
    """Fetch many full paper records in one POST. Caches per-paper in `papers`.

    Returns {"data": [records...], "source": "cache"|"mixed"|"live"}.
    """
    if not paper_ids:
        return {"data": [], "source": "cache"}

    # Serve papers already in the denormalized store; fetch the rest live.
    cached: dict[str, dict] = {}
    missing: list[str] = []
    for pid in paper_ids:
        rec = db.paper_get(pid)
        if rec is not None:
            cached[pid] = rec
        else:
            missing.append(pid)

    source = "cache"
    if missing:
        data = await _request(
            "POST",
            f"{config.S2_BASE_URL}/paper/batch",
            params={"fields": config.PAPER_FIELDS},
            json_body={"ids": missing},
        )
        fetched = [r for r in (data or []) if r]
        db.papers_put_many(fetched)
        for rec in fetched:
            cached[rec["paperId"]] = rec
        source = "live" if not cached or len(missing) == len(paper_ids) else "mixed"

    # Preserve input order; drop ids S2 couldn't resolve.
    ordered = [cached[pid] for pid in paper_ids if pid in cached]
    return {"data": ordered, "source": source}
