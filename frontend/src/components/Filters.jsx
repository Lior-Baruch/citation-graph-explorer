import React from "react";

// Client-side filters: year range + minimum citations. Purely hides nodes;
// never refetches.
export default function Filters({ filters, setFilters, yearBounds }) {
  const update = (patch) => setFilters({ ...filters, ...patch });

  return (
    <div className="flex items-center gap-4 text-xs text-slate-300">
      <label className="flex items-center gap-1">
        <span className="text-slate-400">Year</span>
        <input
          type="number"
          value={filters.minYear ?? ""}
          placeholder={yearBounds.min ?? "min"}
          onChange={(e) =>
            update({ minYear: e.target.value ? Number(e.target.value) : null })
          }
          className="w-16 rounded bg-slate-800 px-1.5 py-1 ring-1 ring-slate-700"
        />
        <span className="text-slate-500">–</span>
        <input
          type="number"
          value={filters.maxYear ?? ""}
          placeholder={yearBounds.max ?? "max"}
          onChange={(e) =>
            update({ maxYear: e.target.value ? Number(e.target.value) : null })
          }
          className="w-16 rounded bg-slate-800 px-1.5 py-1 ring-1 ring-slate-700"
        />
      </label>
      <label className="flex items-center gap-1">
        <span className="text-slate-400">Min citations</span>
        <input
          type="number"
          value={filters.minCitations ?? ""}
          placeholder="0"
          onChange={(e) =>
            update({
              minCitations: e.target.value ? Number(e.target.value) : null,
            })
          }
          className="w-20 rounded bg-slate-800 px-1.5 py-1 ring-1 ring-slate-700"
        />
      </label>
    </div>
  );
}
