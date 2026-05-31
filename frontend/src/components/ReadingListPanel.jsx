import React, { useState } from "react";

// Floating panel listing starred papers, with per-item remove and exports
// scoped to just the reading list.
export default function ReadingListPanel({
  ids,
  getNode,
  onSelect,
  onRemove,
  onExport,
  onClear,
}) {
  const [open, setOpen] = useState(false);
  const count = ids.size;
  if (count === 0) return null;

  const items = Array.from(ids)
    .map((id) => ({ id, node: getNode(id) }))
    .filter((x) => x.node);

  return (
    <div className="rounded-lg bg-slate-900/80 p-3 ring-1 ring-slate-700">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200"
      >
        <span>★ Reading list ({count})</span>
        <span className="text-slate-500">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {items.map(({ id, node }) => (
              <li key={id} className="flex items-center gap-1 text-xs">
                <button
                  onClick={() => onSelect(id)}
                  className="min-w-0 flex-1 truncate text-left text-slate-200 hover:text-white"
                  title={node.title}
                >
                  {node.title || id}
                </button>
                <button
                  onClick={() => onRemove(id)}
                  className="flex-shrink-0 text-slate-500 hover:text-red-400"
                  title="Remove"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-1">
            <span className="mr-1 text-[10px] uppercase tracking-wide text-slate-500">
              Export
            </span>
            {["bibtex", "ris", "json"].map((f) => (
              <button
                key={f}
                onClick={() => onExport(f)}
                className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700"
              >
                {f === "bibtex" ? "BibTeX" : f.toUpperCase()}
              </button>
            ))}
            <button
              onClick={onClear}
              className="ml-auto text-[10px] text-slate-500 hover:text-red-400"
            >
              clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
