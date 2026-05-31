import React from "react";
import { clusterColor } from "../colors";

// Cluster legend with per-cluster visibility toggles. Labels (and optional
// theme summaries) come from the LLM when enabled; otherwise "Cluster N".
export default function Legend({
  clusterIds,
  labels,
  summaries,
  hidden,
  toggle,
  method,
  llmEnabled,
  onSummarize,
  summariesLoading,
}) {
  if (!clusterIds.length) return null;

  const hasSummaries = summaries && Object.keys(summaries).some((k) => summaries[k]);

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
          const label = (labels && labels[String(cid)]) || `Cluster ${cid}`;
          const summary = summaries && summaries[String(cid)];
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
              {summary && !isHidden && (
                <p className="ml-5 mt-0.5 text-[10px] leading-tight text-slate-400">
                  {summary}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {llmEnabled && !hasSummaries && (
        <button
          onClick={onSummarize}
          disabled={summariesLoading}
          className="mt-2 w-full rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700 disabled:opacity-50"
        >
          {summariesLoading ? "Summarizing…" : "Summarize themes"}
        </button>
      )}
      {!llmEnabled && (
        <p className="mt-2 text-[10px] leading-tight text-amber-400/80">
          LLM labels disabled — set ANTHROPIC_API_KEY for theme names.
        </p>
      )}
    </div>
  );
}
