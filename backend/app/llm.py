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


_EXPLAIN_SYSTEM = (
    "You explain research papers to a curious non-specialist. Given a paper's "
    "title and abstract, write 2-3 short paragraphs: (1) the problem it tackles "
    "and why it matters, (2) the key idea or contribution in plain language, and "
    "(3) why it was influential or what it enabled. Be concrete and accessible; "
    "avoid jargon and do not use bullet points or headings."
)


def explain_paper(paper: dict) -> Optional[str]:
    """Plain-language explanation of one paper. Cached by paper id + content."""
    if not config.LLM_ENABLED or not paper:
        return None

    title = (paper.get("title") or "Untitled").strip()
    abstract = (paper.get("abstract") or "").strip()
    tldr = ""
    if isinstance(paper.get("tldr"), dict):
        tldr = (paper["tldr"].get("text") or "").strip()
    body = abstract or tldr
    if not body:
        return None

    cache_key = f"explain:{_sig(paper.get('paperId', ''), title, body)}"
    cached = db.llm_get(cache_key)
    if cached is not None:
        return cached

    year = paper.get("year") or "n.d."
    user_text = f"Title: {title}\nYear: {year}\nAbstract: {body}"

    try:
        msg = _get_client().messages.create(
            model=config.ANTHROPIC_MODEL,
            max_tokens=500,
            system=[{"type": "text", "text": _EXPLAIN_SYSTEM,
                     "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user_text}],
        )
        text = msg.content[0].text.strip()
    except Exception:
        return None

    db.llm_set(cache_key, text)
    return text


_CLUSTER_SUMMARY_SYSTEM = (
    "You summarize themes in a research-paper cluster. Given a list of paper titles "
    "and one-line summaries from one cluster, write ONE or TWO sentences describing "
    "what unifies this group and the sub-topics it spans. No preamble, no bullet points."
)


def summarize_cluster(signature: str, papers: list[dict]) -> Optional[str]:
    """1-2 sentence theme summary for a cluster, cached by its signature."""
    if not config.LLM_ENABLED:
        return None

    cache_key = f"summary:{signature}"
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
            max_tokens=120,
            system=[{"type": "text", "text": _CLUSTER_SUMMARY_SYSTEM,
                     "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user_text}],
        )
        text = msg.content[0].text.strip()
    except Exception:
        return None

    db.llm_set(cache_key, text)
    return text


_LANDSCAPE_SYSTEM = (
    "You are a research strategist. Given the themed clusters of a citation graph "
    "(each with a label and representative papers), write a short briefing (3-4 "
    "short paragraphs): what research areas this body of work covers, how the "
    "themes relate, and 2-3 concrete gaps or under-explored directions a researcher "
    "might pursue next. Be specific and grounded in the clusters shown; no bullet lists."
)


def analyze_landscape(clusters_payload: list[dict]) -> Optional[str]:
    """Narrate the research landscape + gaps across clusters. Cached by signatures.

    `clusters_payload` is a list of {signature, label, papers:[{title,tldr}]}.
    """
    if not config.LLM_ENABLED or not clusters_payload:
        return None

    sig = _sig(*sorted(c.get("signature", "") for c in clusters_payload))
    cache_key = f"landscape:{sig}"
    cached = db.llm_get(cache_key)
    if cached is not None:
        return cached

    blocks = []
    for c in clusters_payload:
        label = c.get("label") or "Unlabeled cluster"
        titles = []
        for p in (c.get("papers") or [])[:6]:
            t = (p.get("title") or "").strip()
            if t:
                titles.append(t)
        blocks.append(f"Theme: {label}\n  " + "\n  ".join(titles))
    user_text = "Clusters in the current graph:\n\n" + "\n\n".join(blocks)

    try:
        msg = _get_client().messages.create(
            model=config.ANTHROPIC_MODEL,
            max_tokens=600,
            system=[{"type": "text", "text": _LANDSCAPE_SYSTEM,
                     "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user_text}],
        )
        text = msg.content[0].text.strip()
    except Exception:
        return None

    db.llm_set(cache_key, text)
    return text
