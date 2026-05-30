import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import SeedInput from "./components/SeedInput";
import GraphView from "./components/GraphView";
import DetailPanel from "./components/DetailPanel";
import Legend from "./components/Legend";
import Filters from "./components/Filters";
import LineagePanel from "./components/LineagePanel";
import StatusBar from "./components/StatusBar";

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

  // Bootstrap: load config then auto-load the default demo seed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await api.config();
        if (cancelled) return;
        setConfig(cfg);
        if (cfg.default_seed) await loadSeed(cfg.default_seed);
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

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-4 border-b border-slate-800 bg-slate-900 px-4 py-2">
        <h1 className="text-sm font-bold text-slate-100">
          📈 Citation Graph Explorer
        </h1>
        <SeedInput onSeed={loadSeed} loading={loading} />
        <Filters filters={filters} setFilters={setFilters} yearBounds={yearBounds} />
      </header>

      {error && (
        <div className="bg-red-950/60 px-4 py-1.5 text-xs text-red-300">{error}</div>
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
            graphData={visibleGraph}
            clusters={clusters}
            selectedId={selectedId}
            lineagePath={lineage?.path}
            onNodeClick={handleNodeClick}
          />

          {/* Floating left controls */}
          <div className="absolute left-3 top-3 z-10 w-56 space-y-3">
            <Legend
              clusterIds={clusterIds}
              labels={labels}
              hidden={hiddenClusters}
              toggle={toggleCluster}
              method={method}
              llmEnabled={config.llm_enabled}
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
          </div>
        </main>

        {/* Right detail panel */}
        <aside className="w-80 flex-shrink-0 border-l border-slate-800 bg-slate-900">
          <DetailPanel node={selectedNode} onExpand={(n) => expand(n.id)} expanding={expanding} />
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
