import React, { useCallback, useMemo, useRef, useEffect, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { clusterColor } from "../colors";

// Edge colors: subtle distinction between "this paper cites ->" (reference)
// and "<- cited by this paper" (citation). Both arrows point citing -> cited.
const REFERENCE_COLOR = "rgba(96,165,250,0.35)"; // outgoing (seed cites)
const CITATION_COLOR = "rgba(244,114,182,0.30)"; // incoming (cites seed)

function nodeRadius(node) {
  // Log-scaled by citation count.
  return 3 + Math.log10((node.citationCount || 0) + 1) * 2.2;
}

export default function GraphView({
  graphData,
  clusters,
  selectedId,
  lineagePath,
  onNodeClick,
}) {
  const fgRef = useRef();
  const containerRef = useRef();
  const [dims, setDims] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Spread nodes apart so dense neighborhoods stay legible, and re-fit the view
  // whenever the data changes (seed load / expand / filter) — but NOT after a
  // plain node drag, so manual positioning isn't fought by the camera.
  const dataChanged = useRef(false);
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force("charge")?.strength(-160);
    fg.d3Force("link")?.distance(55);
    fg.d3ReheatSimulation?.();
    dataChanged.current = true;
  }, [graphData]);

  const handleEngineStop = useCallback(() => {
    if (dataChanged.current && graphData.nodes.length > 0) {
      fgRef.current?.zoomToFit(400, 60);
      dataChanged.current = false;
    }
  }, [graphData]);

  const pathSet = useMemo(() => new Set(lineagePath || []), [lineagePath]);
  const pathEdgeSet = useMemo(() => {
    const s = new Set();
    const p = lineagePath || [];
    for (let i = 0; i < p.length - 1; i++) {
      s.add(`${p[i]}->${p[i + 1]}`);
      s.add(`${p[i + 1]}->${p[i]}`);
    }
    return s;
  }, [lineagePath]);

  const paintNode = useCallback(
    (node, ctx, globalScale) => {
      const r = nodeRadius(node);
      const cid = clusters[node.id];
      const color = clusterColor(cid);
      const isSelected = node.id === selectedId;
      const inPath = pathSet.has(node.id);

      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      if (isSelected || inPath) {
        ctx.lineWidth = 2 / globalScale;
        ctx.strokeStyle = isSelected ? "#ffffff" : "#fde047";
        ctx.stroke();
      }

      // Label larger nodes / when zoomed in.
      if (globalScale > 1.3 || r > 7) {
        const label = (node.title || "").slice(0, 40);
        const fontSize = Math.max(2.5, 10 / globalScale);
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = "rgba(226,232,240,0.85)";
        ctx.textAlign = "center";
        ctx.fillText(label, node.x, node.y + r + fontSize + 1);
      }
    },
    [clusters, selectedId, pathSet]
  );

  const linkColor = useCallback(
    (link) => {
      const s = typeof link.source === "object" ? link.source.id : link.source;
      const t = typeof link.target === "object" ? link.target.id : link.target;
      if (pathEdgeSet.has(`${s}->${t}`)) return "rgba(253,224,71,0.9)";
      return link.relation === "citation" ? CITATION_COLOR : REFERENCE_COLOR;
    },
    [pathEdgeSet]
  );

  return (
    <div ref={containerRef} className="h-full w-full">
      <ForceGraph2D
        ref={fgRef}
        width={dims.width}
        height={dims.height}
        graphData={graphData}
        backgroundColor="#0b0f1a"
        nodeRelSize={1}
        nodeVal={(n) => nodeRadius(n)}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={(node, color, ctx) => {
          const r = nodeRadius(node);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 2, 0, 2 * Math.PI);
          ctx.fill();
        }}
        linkColor={linkColor}
        linkWidth={(l) => {
          const s = typeof l.source === "object" ? l.source.id : l.source;
          const t = typeof l.target === "object" ? l.target.id : l.target;
          return pathEdgeSet.has(`${s}->${t}`) ? 2.5 : 1;
        }}
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
        onNodeClick={onNodeClick}
        onEngineStop={handleEngineStop}
        cooldownTicks={120}
      />
    </div>
  );
}
