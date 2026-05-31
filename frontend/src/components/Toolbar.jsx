import React, { useRef } from "react";

// Header actions: export the whole graph (citations / image) and save / load
// the exploration session to a file.
export default function Toolbar({ hasGraph, onExport, onSaveSession, onLoadSession }) {
  const fileRef = useRef();

  const btn =
    "rounded px-2 py-1 text-[11px] text-slate-200 bg-slate-800 hover:bg-slate-700 disabled:opacity-40";

  return (
    <div className="ml-auto flex items-center gap-1">
      <span className="mr-1 text-[10px] uppercase tracking-wide text-slate-500">Export</span>
      <button className={btn} disabled={!hasGraph} onClick={() => onExport("bibtex")}>
        BibTeX
      </button>
      <button className={btn} disabled={!hasGraph} onClick={() => onExport("ris")}>
        RIS
      </button>
      <button className={btn} disabled={!hasGraph} onClick={() => onExport("json")}>
        JSON
      </button>
      <button className={btn} disabled={!hasGraph} onClick={() => onExport("png")}>
        PNG
      </button>
      <span className="mx-1 h-4 w-px bg-slate-700" />
      <button className={btn} disabled={!hasGraph} onClick={onSaveSession}>
        Save
      </button>
      <button className={btn} onClick={() => fileRef.current?.click()}>
        Load
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onLoadSession(f);
          e.target.value = ""; // allow re-loading the same file
        }}
      />
    </div>
  );
}
