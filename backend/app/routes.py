"""API routes. The frontend talks ONLY to these endpoints — never to S2/Claude
directly — so caching and rate-limiting stay centralized here.
"""
import networkx as nx
from fastapi import APIRouter, HTTPException

from . import cluster, config, db, llm, s2_client
from .schemas import ClusterRequest, ConfigResponse, LineageRequest, ResolveRequest

router = APIRouter(prefix="/api")


def to_node(rec: dict) -> dict:
    """Normalize a raw S2 paper record into the node shape the UI consumes."""
    authors = [a.get("name") for a in (rec.get("authors") or []) if a.get("name")]
    tldr = rec.get("tldr") or {}
    ext = rec.get("externalIds") or {}
    return {
        "id": rec.get("paperId"),
        "paperId": rec.get("paperId"),
        "title": rec.get("title"),
        "year": rec.get("year"),
        "authors": authors,
        "citationCount": rec.get("citationCount") or 0,
        "influentialCitationCount": rec.get("influentialCitationCount") or 0,
        "tldr": tldr.get("text") if isinstance(tldr, dict) else None,
        "abstract": rec.get("abstract"),
        "url": rec.get("url"),
        "externalIds": ext,
        "hasEmbedding": bool(isinstance(rec.get("embedding"), dict)
                             and rec["embedding"].get("vector")),
    }


def _rank_key(p: dict) -> tuple:
    return (p.get("influentialCitationCount") or 0, p.get("citationCount") or 0)


@router.get("/config", response_model=ConfigResponse)
async def get_config():
    return ConfigResponse(
        llm_enabled=config.LLM_ENABLED,
        s2_key_present=bool(config.S2_API_KEY),
        default_seed="arXiv:1706.03762",
    )


# S2 /paper/{id} accepts these scheme prefixes (case-insensitive). A bare title
# can ALSO contain a colon (subtitles!), so we only treat a string as an id when
# the part before the first colon is one of these known schemes.
_ID_SCHEMES = {"corpusid", "doi", "arxiv", "mag", "acl", "pmid", "pmcid", "url"}


def _looks_like_id(query: str) -> bool:
    q = query.strip()
    low = q.lower()
    if low.startswith("http"):
        return True
    if len(q) == 40 and all(c in "0123456789abcdef" for c in low):
        return True  # S2 sha paperId
    if q[:3] == "10." and "/" in q:
        return True  # bare DOI
    if q.replace(".", "").isdigit():
        return True  # bare arXiv id, e.g. 1706.03762
    if ":" in q and low.split(":", 1)[0] in _ID_SCHEMES:
        return True
    return False


@router.post("/resolve")
async def resolve(req: ResolveRequest):
    query = req.query.strip()
    if not query:
        raise HTTPException(400, "Empty query")

    async def by_title():
        res = await s2_client.search_title(query, limit=1)
        data = res["data"].get("data") or []
        if not data:
            raise HTTPException(404, f"No paper found for '{query}'")
        return data[0].get("paperId"), res["source"]

    source = "live"
    try:
        if _looks_like_id(query):
            res = await s2_client.resolve(query)
            paper_id = res["data"].get("paperId")
            source = res["source"]
        else:
            paper_id, source = await by_title()
    except HTTPException:
        raise
    except Exception as exc:
        # An id-style lookup that 404s may actually be a title — fall back.
        is_404 = "404" in str(exc)
        if _looks_like_id(query) and is_404:
            try:
                paper_id, source = await by_title()
            except HTTPException:
                raise
            except Exception as exc2:
                raise HTTPException(502, f"Semantic Scholar error: {exc2}")
        else:
            raise HTTPException(502, f"Semantic Scholar error: {exc}")

    if not paper_id:
        raise HTTPException(404, f"Could not resolve '{query}'")

    hydrated = await s2_client.batch([paper_id])
    recs = hydrated["data"]
    if not recs:
        raise HTTPException(404, f"Could not load paper '{query}'")

    return {"seed": to_node(recs[0]), "source": source}


@router.get("/neighbors/{paper_id}")
async def neighbors(paper_id: str):
    """One-hop expansion: top references + top citations, ranked & capped."""
    try:
        refs_res = await s2_client.references(paper_id)
        cites_res = await s2_client.citations(paper_id)
    except Exception as exc:
        raise HTTPException(502, f"Semantic Scholar error: {exc}")

    # references payload: {data: [{citedPaper: {...}}]}
    ref_papers = [r.get("citedPaper") for r in (refs_res["data"].get("data") or [])]
    ref_papers = [p for p in ref_papers if p and p.get("paperId")]
    ref_papers.sort(key=_rank_key, reverse=True)
    ref_papers = ref_papers[: config.MAX_REFERENCES]

    # citations payload: {data: [{citingPaper: {...}}]}
    cite_papers = [c.get("citingPaper") for c in (cites_res["data"].get("data") or [])]
    cite_papers = [p for p in cite_papers if p and p.get("paperId")]
    cite_papers.sort(key=_rank_key, reverse=True)
    cite_papers = cite_papers[: config.MAX_CITATIONS]

    # Hydrate all neighbors (+ the seed) in one batch for full fields.
    all_ids = [paper_id] + [p["paperId"] for p in ref_papers] + [p["paperId"] for p in cite_papers]
    seen = set()
    dedup_ids = [i for i in all_ids if not (i in seen or seen.add(i))]
    hydrated = await s2_client.batch(dedup_ids)
    by_id = {r["paperId"]: r for r in hydrated["data"]}

    nodes = [to_node(by_id[i]) for i in dedup_ids if i in by_id]

    # Edges always point citing -> cited.
    edges = []
    for p in ref_papers:  # seed cites reference
        if p["paperId"] in by_id:
            edges.append({"source": paper_id, "target": p["paperId"], "relation": "reference"})
    for p in cite_papers:  # citing paper cites seed
        if p["paperId"] in by_id:
            edges.append({"source": p["paperId"], "target": paper_id, "relation": "citation"})

    source = "cache" if refs_res["source"] == "cache" and cites_res["source"] == "cache" else "live"
    return {
        "center": paper_id,
        "nodes": nodes,
        "edges": edges,
        "counts": {"references": len(ref_papers), "citations": len(cite_papers)},
        "source": source,
    }


@router.get("/paper/{paper_id}")
async def get_paper(paper_id: str):
    rec = db.paper_get(paper_id)
    source = "cache"
    if rec is None:
        hydrated = await s2_client.batch([paper_id])
        if not hydrated["data"]:
            raise HTTPException(404, f"Paper '{paper_id}' not found")
        rec = hydrated["data"][0]
        source = hydrated["source"]
    return {"paper": to_node(rec), "source": source}


@router.post("/cluster")
async def cluster_endpoint(req: ClusterRequest):
    records = [db.paper_get(pid) for pid in req.paperIds]
    records = [r for r in records if r]
    if not records:
        return {"clusters": {}, "labels": {}, "method": "none"}

    result = cluster.cluster_papers(records, req.edges)
    assignments = result["clusters"]
    signatures = result["signatures"]

    # Group records per cluster for labeling.
    members: dict[int, list[dict]] = {}
    for rec in records:
        cid = assignments.get(rec["paperId"])
        if cid is not None:
            members.setdefault(cid, []).append(rec)

    labels = {}
    for cid, recs in members.items():
        sig = signatures.get(cid, str(cid))
        label = llm.label_cluster(sig, recs)
        labels[str(cid)] = label  # None if LLM disabled

    return {
        "clusters": {pid: int(cid) for pid, cid in assignments.items()},
        "labels": labels,
        "method": result["method"],
        "llm_enabled": config.LLM_ENABLED,
    }


@router.post("/lineage")
async def lineage(req: LineageRequest):
    # Build a directed graph from the provided citation edges.
    G = nx.DiGraph()
    for e in req.edges or []:
        s, t = e.get("source"), e.get("target")
        if s and t:
            G.add_edge(s, t)

    if req.sourceId not in G or req.targetId not in G:
        raise HTTPException(400, "Both papers must be present in the current graph edges")

    # Try directed path either way; fall back to undirected for an idea-lineage.
    path = None
    try:
        path = nx.shortest_path(G, req.sourceId, req.targetId)
    except nx.NetworkXNoPath:
        try:
            path = nx.shortest_path(G, req.targetId, req.sourceId)
            path = list(reversed(path))
        except nx.NetworkXNoPath:
            UG = G.to_undirected()
            try:
                path = nx.shortest_path(UG, req.sourceId, req.targetId)
            except nx.NetworkXNoPath:
                raise HTTPException(404, "No citation path connects these two papers")

    ordered = [db.paper_get(pid) for pid in path]
    ordered = [r for r in ordered if r]
    nodes = [to_node(r) for r in ordered]
    narration = llm.narrate_lineage(ordered)

    return {
        "path": [n["id"] for n in nodes],
        "papers": nodes,
        "narration": narration,
        "llm_enabled": config.LLM_ENABLED,
    }
