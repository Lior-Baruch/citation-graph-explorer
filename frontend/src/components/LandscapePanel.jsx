import React, { useState } from "react";

// Graph-wide "research landscape" briefing: what areas the current graph covers
// and where the gaps are. On-demand (one LLM call, cached by cluster signatures).
export default function LandscapePanel({
  llmEnabled,
  onAnalyze,
  analysis,
  loading,
  nodeCount,
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg bg-slate-900/80 p-3 ring-1 ring-slate-700">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200"
      >
        <span>Landscape</span>
        <span className="text-slate-500">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {!llmEnabled ? (
            <p className="text-[10px] leading-tight text-amber-400/80">
              Set ANTHROPIC_API_KEY to analyze the research landscape.
            </p>
          ) : (
            <>
              <button
                onClick={onAnalyze}
                disabled={loading || nodeCount < 2}
                className="w-full rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700 disabled:opacity-50"
              >
                {loading
                  ? "Analyzing…"
                  : analysis
                  ? "Re-analyze landscape"
                  : "Analyze landscape & gaps"}
              </button>
              {analysis && (
                <p className="max-h-64 overflow-y-auto whitespace-pre-line text-[11px] leading-relaxed text-slate-300">
                  {analysis}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
