import React from "react";

// Trace-lineage mode UI + narrated result.
export default function LineagePanel({
  active,
  onToggle,
  picks,
  result,
  loading,
  error,
  llmEnabled,
  onClear,
}) {
  return (
    <div className="rounded-lg bg-slate-900/80 p-3 ring-1 ring-slate-700">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Trace lineage
        </h3>
        <button
          onClick={onToggle}
          className={`rounded px-2 py-0.5 text-[11px] font-medium ${
            active ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-200"
          }`}
        >
          {active ? "On" : "Off"}
        </button>
      </div>

      {active && (
        <p className="mb-2 text-[11px] leading-tight text-slate-400">
          Click two nodes to trace how the ideas connect.
          <br />
          Picked: {picks.length}/2
          {picks.length > 0 && (
            <button onClick={onClear} className="ml-2 text-blue-400 hover:underline">
              clear
            </button>
          )}
        </p>
      )}

      {loading && <p className="text-xs text-slate-400">Finding path…</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}

      {result && (
        <div className="space-y-2">
          <ol className="space-y-0.5 text-[11px] text-slate-300">
            {result.papers.map((p, i) => (
              <li key={p.id} className="truncate">
                {i + 1}. ({p.year}) {p.title}
              </li>
            ))}
          </ol>
          {result.narration ? (
            <p className="border-t border-slate-700 pt-2 text-xs leading-relaxed text-slate-200">
              {result.narration}
            </p>
          ) : (
            <p className="border-t border-slate-700 pt-2 text-[11px] text-amber-400/80">
              {llmEnabled
                ? "Narration unavailable (LLM error)."
                : "Set ANTHROPIC_API_KEY to narrate this lineage."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
