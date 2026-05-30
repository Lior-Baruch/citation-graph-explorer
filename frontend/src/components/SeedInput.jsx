import React, { useState } from "react";

// Seed entry: arXiv ID, DOI, S2 id, URL, or a title to search.
export default function SeedInput({ onSeed, loading }) {
  const [value, setValue] = useState("arXiv:1706.03762");

  const submit = (e) => {
    e.preventDefault();
    const q = value.trim();
    if (q) onSeed(q);
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="arXiv:1706.03762, DOI, S2 id, URL, or title…"
        className="w-96 rounded-md bg-slate-800 px-3 py-1.5 text-sm text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-blue-500"
      />
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {loading ? "Loading…" : "Explore"}
      </button>
    </form>
  );
}
