"""Cluster the current graph's papers into themes.

Primary: KMeans over SPECTER2 embeddings, k chosen by silhouette score.
Fallback: Louvain community detection over the citation graph (networkx) when
embeddings are missing / too sparse.

Returns assignments {paperId: clusterId} plus a stable per-cluster signature
(hash of sorted member paperIds) used to cache LLM-generated labels.
"""
import hashlib
from typing import Optional

import numpy as np

# Need at least this many embedded papers to bother with KMeans.
MIN_FOR_KMEANS = 6


def _embedding_of(paper: dict) -> Optional[list[float]]:
    emb = paper.get("embedding")
    if isinstance(emb, dict):
        vec = emb.get("vector")
        if vec:
            return vec
    return None


def _cluster_signature(member_ids: list[str]) -> str:
    joined = "|".join(sorted(member_ids))
    return hashlib.sha256(joined.encode()).hexdigest()[:16]


def _kmeans_assignments(papers: list[dict]) -> Optional[dict]:
    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score
    from sklearn.preprocessing import normalize

    embedded = [(p["paperId"], _embedding_of(p)) for p in papers]
    embedded = [(pid, v) for pid, v in embedded if v is not None]
    if len(embedded) < MIN_FOR_KMEANS:
        return None

    ids = [pid for pid, _ in embedded]
    X = normalize(np.array([v for _, v in embedded], dtype=np.float64))

    n = len(ids)
    best_k, best_labels, best_score = 2, None, -1.0
    # Search a small range of k; cap at 8 clusters or n-1.
    for k in range(2, min(8, n - 1) + 1):
        km = KMeans(n_clusters=k, n_init=10, random_state=42)
        labels = km.fit_predict(X)
        if len(set(labels)) < 2:
            continue
        score = silhouette_score(X, labels)
        if score > best_score:
            best_k, best_labels, best_score = k, labels, score

    if best_labels is None:
        best_labels = np.zeros(n, dtype=int)

    return {pid: int(lbl) for pid, lbl in zip(ids, best_labels)}


def _louvain_assignments(papers: list[dict], edges: list[dict]) -> dict:
    import networkx as nx

    ids = [p["paperId"] for p in papers]
    G = nx.Graph()
    G.add_nodes_from(ids)
    id_set = set(ids)
    for e in edges or []:
        s, t = e.get("source"), e.get("target")
        if s in id_set and t in id_set:
            G.add_edge(s, t)

    try:
        communities = nx.community.louvain_communities(G, seed=42)
    except Exception:
        communities = list(nx.connected_components(G))

    assignments = {}
    for cid, members in enumerate(communities):
        for pid in members:
            assignments[pid] = cid
    # Any isolated node not covered gets its own bucket.
    next_id = len(communities)
    for pid in ids:
        if pid not in assignments:
            assignments[pid] = next_id
            next_id += 1
    return assignments


def cluster_papers(papers: list[dict], edges: list[dict]) -> dict:
    """Return {clusters: {paperId: clusterId}, signatures: {clusterId: sig}, method}."""
    papers = [p for p in papers if p and p.get("paperId")]
    if not papers:
        return {"clusters": {}, "signatures": {}, "method": "none"}

    method = "kmeans"
    assignments = _kmeans_assignments(papers)
    if assignments is None:
        method = "louvain"
        assignments = _louvain_assignments(papers, edges)

    # Build per-cluster signatures from member ids.
    members_by_cluster: dict[int, list[str]] = {}
    for pid, cid in assignments.items():
        members_by_cluster.setdefault(cid, []).append(pid)
    signatures = {cid: _cluster_signature(m) for cid, m in members_by_cluster.items()}

    return {"clusters": assignments, "signatures": signatures, "method": method}
