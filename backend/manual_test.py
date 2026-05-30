"""Manual end-to-end test: search DPO, then trace Attention -> RLHF -> DPO -> GRPO
through the running backend (http://127.0.0.1:8000), exactly as the UI would.
"""
import httpx

BASE = "http://127.0.0.1:8000"
c = httpx.Client(base_url=BASE, timeout=120)

# NOTE: S2 throttles its keyless /paper/search endpoint to 429, so we resolve
# by arXiv id (the reliable /paper/{id} endpoint) for this test.
QUERIES = {
    "Attention": "arXiv:1706.03762",
    "RLHF (InstructGPT)": "arXiv:2203.02155",
    "DPO": "arXiv:2305.18290",
    "GRPO (DeepSeekMath)": "arXiv:2402.03300",
}

print("=" * 70)
print("STEP 1 — resolve / search each paper")
print("=" * 70)
ids = {}
for label, q in QUERIES.items():
    resp = c.post("/api/resolve", json={"query": q})
    if resp.status_code != 200:
        print(f"\n[{label}]  HTTP {resp.status_code}: {resp.json().get('detail')}  (query={q!r})")
        continue
    r = resp.json()
    seed = r["seed"]
    ids[label] = seed["id"]
    print(f"\n[{label}]  source={r['source']}")
    print(f"  title : {seed['title']}")
    print(f"  year  : {seed['year']}   citations: {seed['citationCount']:,}")
    print(f"  id    : {seed['id']}")

print("\n" + "=" * 70)
print("STEP 2 — build the graph: expand each paper's neighborhood, union it")
print("=" * 70)
nodes = {}
edges = {}
for label, pid in ids.items():
    n = c.get(f"/api/neighbors/{pid}").json()
    for node in n["nodes"]:
        nodes[node["id"]] = node
    for e in n["edges"]:
        edges[(e["source"], e["target"])] = e
    print(f"  expanded {label:22s} -> graph now {len(nodes)} nodes, {len(edges)} edges  (src={n['source']})")

edge_list = list(edges.values())

print("\n" + "=" * 70)
print("STEP 3 — direct citation links between consecutive papers in the chain")
print("=" * 70)
chain = ["GRPO (DeepSeekMath)", "DPO", "RLHF (InstructGPT)", "Attention"]
edge_pairs = set((e["source"], e["target"]) for e in edge_list)
for a, b in zip(chain, chain[1:]):
    if a not in ids or b not in ids:
        print(f"  {a:22s} --cites--> {b:22s} : (skipped — {a if a not in ids else b} not resolved)")
        continue
    ia, ib = ids[a], ids[b]
    direct = (ia, ib) in edge_pairs  # a cites b
    print(f"  {a:22s} --cites--> {b:22s} : {'YES (direct edge in graph)' if direct else 'not a direct edge'}")

print("\n" + "=" * 70)
print("STEP 4 — lineage trace: Attention  <->  GRPO  (shortest citation path)")
print("=" * 70)
if "Attention" not in ids or "GRPO (DeepSeekMath)" not in ids:
    print("  (skipped — endpoints not both resolved)")
    c.close(); raise SystemExit(0)
src, dst = ids["Attention"], ids["GRPO (DeepSeekMath)"]
# ensure both endpoints are present in edges
present = src in {x for e in edge_list for x in (e["source"], e["target"])} and \
          dst in {x for e in edge_list for x in (e["source"], e["target"])}
print(f"  both endpoints present in edge set: {present}")
r = c.post("/api/lineage", json={"sourceId": src, "targetId": dst, "edges": edge_list})
if r.status_code != 200:
    print(f"  lineage HTTP {r.status_code}: {r.json().get('detail')}")
else:
    L = r.json()
    print(f"  path length: {len(L['path'])} papers   llm_enabled={L['llm_enabled']}")
    for i, p in enumerate(L["papers"], 1):
        print(f"    {i}. ({p['year']}) {p['title']}")
    print(f"\n  narration: {L['narration'] if L['narration'] else '(none — Anthropic key has no credits)'}")

c.close()
