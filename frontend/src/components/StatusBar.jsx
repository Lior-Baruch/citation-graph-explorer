import React from "react";

// Bottom status strip: node/edge counts + the cache-vs-live "nerd" indicator.
export default function StatusBar({ nodeCount, edgeCount, lastSource, llmEnabled }) {
  return (
    <div className="flex items-center gap-4 border-t border-slate-800 bg-slate-900 px-3 py-1 text-[11px] text-slate-400">
      <span>{nodeCount} papers</span>
      <span>{edgeCount} edges</span>
      {lastSource && (
        <span className="flex items-center gap-1">
          last fetch:
          <span
            className={
              lastSource === "cache"
                ? "rounded bg-emerald-900/60 px-1.5 py-0.5 text-emerald-300"
                : "rounded bg-sky-900/60 px-1.5 py-0.5 text-sky-300"
            }
          >
            {lastSource === "cache" ? "● cached" : "● live"}
          </span>
        </span>
      )}
      <span className="ml-auto">
        LLM:{" "}
        <span className={llmEnabled ? "text-emerald-400" : "text-amber-400"}>
          {llmEnabled ? "enabled" : "disabled"}
        </span>
      </span>
    </div>
  );
}
