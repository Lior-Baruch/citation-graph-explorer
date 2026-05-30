import React from "react";
import { clusterColor } from "../colors";

// Cluster legend with per-cluster visibility toggles. Labels come from the LLM
// when enabled; otherwise we show a neutral "Cluster N".
export default function Legend({ clusterIds, labels, hidden, toggle, method, llmEnabled }) {
  if (!clusterIds.length) return null;

  return (
    <div className="rounded-lg bg-slate-900/80 p-3 ring-1 ring-slate-700">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Clusters
        </h3>
        <span className="text-[10px] text-slate-500">{method}</span>
      </div>
      <ul className="space-y-1">
        {clusterIds.map((cid) => {
          const isHidden = hidden.has(cid);
          const label =
            (labels && labels[String(cid)]) ||
            (llmEnabled ? `Cluster ${cid}` : `Cluster ${cid}`);
          return (
            <li key={cid}>
              <button
                onClick={() => toggle(cid)}
                className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-slate-800 ${
                  isHidden ? "opacity-40" : ""
                }`}
              >
                <span
                  className="inline-block h-3 w-3 flex-shrink-0 rounded-sm"
                  style={{ background: clusterColor(cid) }}
                />
                <span className="truncate text-slate-200">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {!llmEnabled && (
        <p className="mt-2 text-[10px] leading-tight text-amber-400/80">
          LLM labels disabled — set ANTHROPIC_API_KEY for theme names.
        </p>
      )}
    </div>
  );
}
