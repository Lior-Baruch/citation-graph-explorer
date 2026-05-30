"""Claude-powered features: cluster theme labels and lineage narration.

Graceful by design: if ANTHROPIC_API_KEY is unset, every function returns an
empty / None result and the rest of the app keeps working. Outputs are cached
in SQLite (llm_cache) keyed by a content signature so re-runs are free.
"""
import hashlib
from typing import Optional

from . import config, db

_client = None


def _get_client():
    global _client
    if _client is None:
        from anthropic import Anthropic

        _client = Anthropic(api_key=config.ANTHROPIC_API_KEY)
    return _client


def is_enabled() -> bool:
    return config.LLM_ENABLED


def _sig(*parts: str) -> str:
    return hashlib.sha256("||".join(parts).encode()).hexdigest()[:24]


_LABEL_SYSTEM = (
    "You name research-paper clusters. Given a list of paper titles and one-line "
    "summaries from a single cluster, reply with ONLY a concise theme label of "
    "2-4 words in Title Case. No quotes, no punctuation, no explanation."
)


def label_cluster(signature: str, papers: list[dict]) -> Optional[str]:
    """Return a 2-4 word theme label for one cluster, cached by its signature."""
    if not config.LLM_ENABLED:
        return None

    cache_key = f"label:{signature}"
    cached = db.llm_get(cache_key)
    if cached is not None:
        return cached

    lines = []
    for p in papers[:25]:
        title = (p.get("title") or "").strip()
        tldr = ""
        if isinstance(p.get("tldr"), dict):
            tldr = (p["tldr"].get("text") or "").strip()
        lines.append(f"- {title}" + (f" — {tldr}" if tldr else ""))
    user_text = "Papers in this cluster:\n" + "\n".join(lines)

    try:
        msg = _get_client().messages.create(
            model=config.ANTHROPIC_MODEL,
            max_tokens=20,
            system=[{"type": "text", "text": _LABEL_SYSTEM,
                     "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user_text}],
        )
        label = msg.content[0].text.strip().strip('"').strip()
    except Exception:
        return None

    db.llm_set(cache_key, label)
    return label


_LINEAGE_SYSTEM = (
    "You are a historian of science. Given an ordered chain of papers connected by "
    "citations, write ONE short paragraph (3-5 sentences) narrating how the ideas "
    "progressed from the first paper to the last — what each step contributed and how "
    "it built on the prior work. Be concrete and readable; no bullet points."
)


def narrate_lineage(ordered_papers: list[dict]) -> Optional[str]:
    """Narrate the intellectual progression along a citation path. Cached by path."""
    if not config.LLM_ENABLED or len(ordered_papers) < 2:
        return None

    path_sig = _sig(*[p.get("paperId", "") for p in ordered_papers])
    cache_key = f"lineage:{path_sig}"
    cached = db.llm_get(cache_key)
    if cached is not None:
        return cached

    lines = []
    for i, p in enumerate(ordered_papers, 1):
        title = (p.get("title") or "Untitled").strip()
        year = p.get("year") or "n.d."
        tldr = ""
        if isinstance(p.get("tldr"), dict):
            tldr = (p["tldr"].get("text") or "").strip()
        lines.append(f"{i}. ({year}) {title}" + (f" — {tldr}" if tldr else ""))
    user_text = "Citation chain (earliest idea to latest):\n" + "\n".join(lines)

    try:
        msg = _get_client().messages.create(
            model=config.ANTHROPIC_MODEL,
            max_tokens=300,
            system=[{"type": "text", "text": _LINEAGE_SYSTEM,
                     "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user_text}],
        )
        text = msg.content[0].text.strip()
    except Exception:
        return None

    db.llm_set(cache_key, text)
    return text
