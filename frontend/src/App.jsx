import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import SeedInput from "./components/SeedInput";
import GraphView from "./components/GraphView";
import DetailPanel from "./components/DetailPanel";
import Legend from "./components/Legend";
import Filters from "./components/Filters";
import LineagePanel from "./components/LineagePanel";
import LandscapePanel from "./components/LandscapePanel";
import StatusBar from "./components/StatusBar";
import Toolbar from "./components/Toolbar";
import ReadingListPanel from "./components/ReadingListPanel";
import { toBibTeX, toRIS, download } from "./utils/export";

const SESSION_KEY = "cge.session.v1";

export default function App() {
  const [config, setConfig] = useState({ llm_enabled: false, default_seed: "" });
  const [loading, setLoading] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [error, setError] = useState(null);
  const [lastSource, setLastSource] = useState(null);

  // Graph state. Node objects are reused across merges (refs in nodesById) so
  // the force layout keeps positions instead of resetting.
  const nodesById = useRef(new Map());
  const linkKeys = useRef(new Set());
  const linksArr = useRef([]);
  const [graphVersion, setGraphVersion] = useState(0);
  const graphRef = useRef();

  // Reading list (starred papers) + last-session restore prompt.
  const [readingList, setReadingList] = useState(new Set());
  const [pendingRestore, setPendingRestore] = useState(null);

  const [clusters, setClusters] = useState({}); // id -> clusterId
  const [labels, setLabels] = useState({});
  const [method, setMethod] = useState("");
  const [hiddenClusters, setHiddenClusters] = useState(new Set());

  const [selectedId, setSelectedId] = useState(null);
  const [filters, setFilters] = useState({
    minYear: null,
    maxYear: null,
    minCitations: null,
  });

  // Lineage trace mode.
  const [traceMode, setTraceMode] = useState(false);
  const [picks, setPicks] = useState([]);
  const [lineage, setLineage] = useState(null);
  const [lineageLoading, setLineageLoading] = useState(false);
  const [lineageError, setLineageError] = useState(null);

  // Semantic "find similar" highlight (paper-to-paper, over loaded embeddings).
  const [similarScores, setSimilarScores] = useState(null); // Map id->score
  const [similarQueryId, setSimilarQueryId] = useState(null);
  const [similarResults, setSimilarResults] = useState([]);
  const [similarLoading, setSimilarLoading] = useState(false);

  // LLM extras: per-paper explanations, cluster summaries, landscape analysis.
  const [explanations, setExplanations] = useState({}); // id -> text
  const [explainLoading, setExplainLoading] = useState(false);
  const [summaries, setSummaries] = useState({}); // clusterId -> text
  const [summariesLoading, setSummariesLoading] = useState(false);
  const [landscape, setLandscape] = useState(null);
  const [landscapeLoading, setLandscapeLoading] = useState(false);

  // Recommendations / discovery for the selected paper.
  const [recommendations, setRecommendations] = useState(null); // {forId, nodes}
  const [recLoading, setRecLoading] = useState(false);

  // --- graph mutation helpers ---
  const mergeGraph = useCallback((newNodes, newEdges) => {
    const map = nodesById.current;
    for (const n of newNodes) {
      if (!map.has(n.id)) {
        map.set(n.id, { ...n });
      } else {
        // Refresh metadata but keep the existing object (and its x/y).
        Object.assign(map.get(n.id), n);
      }
    }
    for (const e of newEdges) {
      const key = `${e.source}->${e.target}`;
      if (!linkKeys.current.has(key)) {
        linkKeys.current.add(key);
        linksArr.current.push({ ...e });
      }
    }
    setGraphVersion((v) => v + 1);
  }, []);

  const resetGraph = useCallback(() => {
    nodesById.current = new Map();
    linkKeys.current = new Set();
    linksArr.current = [];
    setClusters({});
    setLabels({});
    setHiddenClusters(new Set());
    setSelectedId(null);
    setPicks([]);
    setLineage(null);
    setSimilarScores(null);
    setSimilarQueryId(null);
    setSimilarResults([]);
    setExplanations({});
    setSummaries({});
    setLandscape(null);
    setRecommendations(null);
    setGraphVersion((v) => v + 1);
  }, []);

  const recluster = useCallback(async () => {
    const ids = Array.from(nodesById.current.keys());
    if (ids.length < 2) return;
    const edges = linksArr.current.map((l) => ({
      source: l.source,
      target: l.target,
    }));
    try {
      const res = await api.cluster(ids, edges);
      setClusters(res.clusters || {});
      setLabels(res.labels || {});
      setMethod(res.method || "");
      // Cluster ids are reassigned here, so any prior summaries/landscape go stale.
      setSummaries({});
      setLandscape(null);
    } catch (e) {
      /* clustering is best-effort */
    }
  }, []);

  const expand = useCallback(
    async (nodeId) => {
      setExpanding(true);
      setError(null);
      try {
        const res = await api.neighbors(nodeId);
        mergeGraph(res.nodes, res.edges);
        setLastSource(res.source);
        // New nodes have no similarity score; drop a stale highlight.
        setSimilarScores(null);
        setSimilarQueryId(null);
        setSimilarResults([]);
        await recluster();
      } catch (e) {
        setError(`Expand failed: ${e.message}`);
      } finally {
        setExpanding(false);
      }
    },
    [mergeGraph, recluster]
  );

  const loadSeed = useCallback(
    async (query) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.resolve(query);
        resetGraph();
        mergeGraph([res.seed], []);
        setLastSource(res.source);
        setSelectedId(res.seed.id);
        // Show the seed's immediate neighborhood (one hop only).
        await expand(res.seed.id);
      } catch (e) {
        setError(`Could not load "${query}": ${e.message}`);
        setLoading(false);
        return;
      }
      setLoading(false);
    },
    [expand, mergeGraph, resetGraph]
  );

  // Bootstrap: load config, then offer to restore the last session (taking
  // precedence over the demo seed) or auto-load the default seed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await api.config();
        if (cancelled) return;
        setConfig(cfg);
        let saved = null;
        try {
          const raw = localStorage.getItem(SESSION_KEY);
          if (raw) saved = JSON.parse(raw);
        } catch (_) {
          /* corrupt autosave — ignore */
        }
        if (saved && Array.isArray(saved.nodes) && saved.nodes.length) {
          setPendingRestore(saved);
        } else if (cfg.default_seed) {
          await loadSeed(cfg.default_seed);
        }
      } catch (e) {
        if (!cancelled) setError(`Backend unreachable: ${e.message}`);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- derived / filtered graph ---
  const allNodes = useMemo(
    () => Array.from(nodesById.current.values()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graphVersion]
  );

  const yearBounds = useMemo(() => {
    const years = allNodes.map((n) => n.year).filter(Boolean);
    return years.length
      ? { min: Math.min(...years), max: Math.max(...years) }
      : { min: null, max: null };
  }, [allNodes]);

  const visibleGraph = useMemo(() => {
    const visibleIds = new Set();
    const nodes = allNodes.filter((n) => {
      if (filters.minYear && (n.year ?? -Infinity) < filters.minYear) return false;
      if (filters.maxYear && (n.year ?? Infinity) > filters.maxYear) return false;
      if (filters.minCitations && (n.citationCount ?? 0) < filters.minCitations)
        return false;
      const cid = clusters[n.id];
      if (cid !== undefined && hiddenClusters.has(cid)) return false;
      visibleIds.add(n.id);
      return true;
    });
    const links = linksArr.current.filter(
      (l) => visibleIds.has(l.source?.id ?? l.source) && visibleIds.has(l.target?.id ?? l.target)
    );
    return { nodes, links };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allNodes, filters, clusters, hiddenClusters, graphVersion]);

  const clusterIds = useMemo(() => {
    const s = new Set(Object.values(clusters));
    return Array.from(s).sort((a, b) => a - b);
  }, [clusters]);

  const selectedNode = selectedId ? nodesById.current.get(selectedId) : null;

  // --- handlers ---
  const handleNodeClick = useCallback(
    (node) => {
      setSelectedId(node.id);
      if (!traceMode) return;
      setPicks((prev) => {
        if (prev.includes(node.id)) return prev;
        const next = [...prev, node.id].slice(-2);
        return next;
      });
    },
    [traceMode]
  );

  // When two nodes are picked in trace mode, request the lineage.
  useEffect(() => {
    if (!traceMode || picks.length !== 2) return;
    let cancelled = false;
    (async () => {
      setLineageLoading(true);
      setLineageError(null);
      setLineage(null);
      try {
        const edges = linksArr.current.map((l) => ({
          source: l.source?.id ?? l.source,
          target: l.target?.id ?? l.target,
        }));
        const res = await api.lineage(picks[0], picks[1], edges);
        if (!cancelled) setLineage(res);
      } catch (e) {
        if (!cancelled) setLineageError(e.message);
      } finally {
        if (!cancelled) setLineageLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [picks, traceMode]);

  const toggleCluster = (cid) => {
    setHiddenClusters((prev) => {
      const next = new Set(prev);
      next.has(cid) ? next.delete(cid) : next.add(cid);
      return next;
    });
  };

  const toggleReadingList = useCallback((id) => {
    setReadingList((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // --- session serialize / restore (the ref-based graph state is the source) ---
  const serializeSession = useCallback(
    (stripAbstract) => {
      const nodes = Array.from(nodesById.current.values()).map((n) => {
        const copy = { ...n };
        if (stripAbstract) delete copy.abstract;
        return copy;
      });
      const edges = linksArr.current.map((l) => ({
        source: l.source?.id ?? l.source,
        target: l.target?.id ?? l.target,
        relation: l.relation,
      }));
      return {
        version: 1,
        nodes,
        edges,
        clusters,
        labels,
        method,
        filters,
        readingList: Array.from(readingList),
        selectedId,
      };
    },
    [clusters, labels, method, filters, readingList, selectedId]
  );

  const restoreSession = useCallback((data) => {
    if (!data || !Array.isArray(data.nodes)) return false;
    const map = new Map();
    for (const n of data.nodes) {
      if (n && n.id) map.set(n.id, { ...n, vx: 0, vy: 0 });
    }
    const keys = new Set();
    const arr = [];
    for (const e of data.edges || []) {
      if (!e || e.source == null || e.target == null) continue;
      const key = `${e.source}->${e.target}`;
      if (!keys.has(key)) {
        keys.add(key);
        arr.push({ source: e.source, target: e.target, relation: e.relation });
      }
    }
    nodesById.current = map;
    linkKeys.current = keys;
    linksArr.current = arr;
    setClusters(data.clusters || {});
    setLabels(data.labels || {});
    setMethod(data.method || "");
    setFilters(
      data.filters || { minYear: null, maxYear: null, minCitations: null }
    );
    setReadingList(new Set(data.readingList || []));
    setSelectedId(data.selectedId || null);
    setHiddenClusters(new Set());
    setSimilarScores(null);
    setSimilarQueryId(null);
    setSimilarResults([]);
    setSummaries({});
    setLandscape(null);
    setRecommendations(null);
    setGraphVersion((v) => v + 1);
    return true;
  }, []);

  // --- exports ---
  const exportGraph = useCallback(
    (format) => {
      const nodes = Array.from(nodesById.current.values());
      if (format === "png") return graphRef.current?.exportPng();
      if (!nodes.length) return;
      if (format === "bibtex") download("citation-graph.bib", toBibTeX(nodes), "application/x-bibtex");
      else if (format === "ris") download("citation-graph.ris", toRIS(nodes), "application/x-research-info-systems");
      else if (format === "json")
        download("citation-graph.json", JSON.stringify(serializeSession(false), null, 2), "application/json");
    },
    [serializeSession]
  );

  const exportReadingList = useCallback(
    (format) => {
      const nodes = Array.from(readingList)
        .map((id) => nodesById.current.get(id))
        .filter(Boolean);
      if (!nodes.length) return;
      if (format === "bibtex") download("reading-list.bib", toBibTeX(nodes), "application/x-bibtex");
      else if (format === "ris") download("reading-list.ris", toRIS(nodes), "application/x-research-info-systems");
      else if (format === "json") download("reading-list.json", JSON.stringify(nodes, null, 2), "application/json");
    },
    [readingList]
  );

  const saveSession = useCallback(() => {
    download("citation-session.json", JSON.stringify(serializeSession(false), null, 2), "application/json");
  }, [serializeSession]);

  const loadSessionFile = useCallback(
    (file) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!restoreSession(data)) setError("That file isn't a valid session.");
        } catch (e) {
          setError(`Could not read session: ${e.message}`);
        }
      };
      reader.readAsText(file);
    },
    [restoreSession]
  );

  // Debounced autosave to localStorage. Declared after serializeSession so the
  // dependency reference isn't in its temporal dead zone. Abstracts are stripped
  // to stay under the ~5MB quota; they re-hydrate from the backend cache.
  useEffect(() => {
    if (pendingRestore || nodesById.current.size === 0) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(serializeSession(true)));
      } catch (_) {
        /* quota exceeded or serialization error — skip this autosave */
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [graphVersion, clusters, labels, method, filters, readingList, selectedId, pendingRestore, serializeSession]);

  const clearSimilar = useCallback(() => {
    setSimilarScores(null);
    setSimilarQueryId(null);
    setSimilarResults([]);
  }, []);

  const findSimilar = useCallback(async (node) => {
    if (!node?.hasEmbedding) return;
    setSimilarLoading(true);
    setSimilarQueryId(node.id);
    try {
      const ids = Array.from(nodesById.current.keys());
      const res = await api.similar(node.id, ids);
      const scores = new Map(res.results.map((r) => [r.id, r.score]));
      setSimilarScores(scores);
      setSimilarResults(
        res.results
          .slice(0, 10)
          .map((r) => ({
            id: r.id,
            score: r.score,
            title: nodesById.current.get(r.id)?.title || r.id,
          }))
      );
    } catch (e) {
      setError(`Find similar failed: ${e.message}`);
      clearSimilar();
    } finally {
      setSimilarLoading(false);
    }
  }, [clearSimilar]);

  const explainPaper = useCallback(async (node) => {
    if (!node || explanations[node.id]) return;
    setExplainLoading(true);
    try {
      const res = await api.explain(node.id);
      if (res.explanation) {
        setExplanations((prev) => ({ ...prev, [node.id]: res.explanation }));
      }
    } catch (e) {
      setError(`Explain failed: ${e.message}`);
    } finally {
      setExplainLoading(false);
    }
  }, [explanations]);

  const summarizeThemes = useCallback(async () => {
    const ids = Array.from(nodesById.current.keys());
    if (ids.length < 2) return;
    setSummariesLoading(true);
    try {
      const edges = linksArr.current.map((l) => ({
        source: l.source?.id ?? l.source,
        target: l.target?.id ?? l.target,
      }));
      const res = await api.cluster(ids, edges, true);
      setClusters(res.clusters || {});
      setLabels(res.labels || {});
      setSummaries(res.summaries || {});
      setMethod(res.method || "");
    } catch (e) {
      setError(`Summaries failed: ${e.message}`);
    } finally {
      setSummariesLoading(false);
    }
  }, []);

  const discoverRelated = useCallback(async (node) => {
    if (!node) return;
    setRecLoading(true);
    try {
      const res = await api.recommend(node.id);
      setRecommendations({ forId: node.id, nodes: res.nodes || [] });
    } catch (e) {
      setError(`Discover failed: ${e.message}`);
    } finally {
      setRecLoading(false);
    }
  }, []);

  const addRecommended = useCallback(
    async (recNode, sourceId) => {
      mergeGraph([recNode], [
        { source: sourceId, target: recNode.id, relation: "suggested" },
      ]);
      await recluster();
    },
    [mergeGraph, recluster]
  );

  const analyzeLandscape = useCallback(async () => {
    const ids = Array.from(nodesById.current.keys());
    if (ids.length < 2) return;
    setLandscapeLoading(true);
    try {
      const edges = linksArr.current.map((l) => ({
        source: l.source?.id ?? l.source,
        target: l.target?.id ?? l.target,
      }));
      const res = await api.landscape(ids, edges);
      setLandscape(res.analysis || "(no analysis returned)");
    } catch (e) {
      setError(`Landscape analysis failed: ${e.message}`);
    } finally {
      setLandscapeLoading(false);
    }
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-4 border-b border-slate-800 bg-slate-900 px-4 py-2">
        <h1 className="text-sm font-bold text-slate-100">
          📈 Citation Graph Explorer
        </h1>
        <SeedInput onSeed={loadSeed} loading={loading} />
        <Filters filters={filters} setFilters={setFilters} yearBounds={yearBounds} />
        <Toolbar
          hasGraph={allNodes.length > 0}
          onExport={exportGraph}
          onSaveSession={saveSession}
          onLoadSession={loadSessionFile}
        />
      </header>

      {error && (
        <div className="flex items-center justify-between bg-red-950/60 px-4 py-1.5 text-xs text-red-300">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
            ✕
          </button>
        </div>
      )}

      {pendingRestore && (
        <div className="flex items-center justify-between gap-3 bg-indigo-950/60 px-4 py-1.5 text-xs text-indigo-200">
          <span>
            Restore your last session ({pendingRestore.nodes.length} papers)?
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => {
                restoreSession(pendingRestore);
                setPendingRestore(null);
              }}
              className="rounded bg-indigo-600 px-2 py-0.5 text-white hover:bg-indigo-500"
            >
              Restore
            </button>
            <button
              onClick={() => {
                const seed = config.default_seed;
                setPendingRestore(null);
                if (seed) loadSeed(seed);
              }}
              className="rounded bg-slate-700 px-2 py-0.5 text-slate-200 hover:bg-slate-600"
            >
              Start fresh
            </button>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Graph */}
        <main className="relative min-w-0 flex-1">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/50 text-sm text-slate-300">
              Loading graph…
            </div>
          )}
          {!loading && allNodes.length === 0 && (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Enter a seed paper to begin.
            </div>
          )}
          <GraphView
            key="graph"
            ref={graphRef}
            graphData={visibleGraph}
            clusters={clusters}
            selectedId={selectedId}
            lineagePath={lineage?.path}
            similarScores={similarScores}
            similarQueryId={similarQueryId}
            onNodeClick={handleNodeClick}
          />

          {/* Floating left controls */}
          <div className="absolute left-3 top-3 z-10 w-56 space-y-3">
            <Legend
              clusterIds={clusterIds}
              labels={labels}
              summaries={summaries}
              hidden={hiddenClusters}
              toggle={toggleCluster}
              method={method}
              llmEnabled={config.llm_enabled}
              onSummarize={summarizeThemes}
              summariesLoading={summariesLoading}
            />
            <LineagePanel
              active={traceMode}
              onToggle={() => {
                setTraceMode((v) => !v);
                setPicks([]);
                setLineage(null);
              }}
              picks={picks}
              result={lineage}
              loading={lineageLoading}
              error={lineageError}
              llmEnabled={config.llm_enabled}
              onClear={() => {
                setPicks([]);
                setLineage(null);
              }}
            />
            <LandscapePanel
              llmEnabled={config.llm_enabled}
              onAnalyze={analyzeLandscape}
              analysis={landscape}
              loading={landscapeLoading}
              nodeCount={allNodes.length}
            />
            <ReadingListPanel
              ids={readingList}
              getNode={(id) => nodesById.current.get(id)}
              onSelect={(id) => setSelectedId(id)}
              onRemove={toggleReadingList}
              onExport={exportReadingList}
              onClear={() => setReadingList(new Set())}
            />
          </div>
        </main>

        {/* Right detail panel */}
        <aside className="w-80 flex-shrink-0 border-l border-slate-800 bg-slate-900">
          <DetailPanel
            node={selectedNode}
            onExpand={(n) => expand(n.id)}
            expanding={expanding}
            onFindSimilar={findSimilar}
            similarLoading={similarLoading}
            similarResults={similarResults}
            similarActive={selectedId === similarQueryId && similarScores !== null}
            onClearSimilar={clearSimilar}
            onSelectNode={(id) => setSelectedId(id)}
            onExplain={explainPaper}
            explainLoading={explainLoading}
            explanation={selectedId ? explanations[selectedId] : null}
            llmEnabled={config.llm_enabled}
            onDiscover={discoverRelated}
            recLoading={recLoading}
            recommendations={recommendations}
            onAddRecommended={addRecommended}
            isInGraph={(id) => nodesById.current.has(id)}
            inReadingList={selectedId ? readingList.has(selectedId) : false}
            onToggleReadingList={toggleReadingList}
          />
        </aside>
      </div>

      <StatusBar
        nodeCount={visibleGraph.nodes.length}
        edgeCount={visibleGraph.links.length}
        lastSource={lastSource}
        llmEnabled={config.llm_enabled}
      />
    </div>
  );
}
