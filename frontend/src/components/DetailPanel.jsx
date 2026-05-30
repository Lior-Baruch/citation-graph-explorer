import React from "react";

function externalLink(node) {
  if (node.url) return node.url;
  const ext = node.externalIds || {};
  if (ext.ArXiv) return `https://arxiv.org/abs/${ext.ArXiv}`;
  if (ext.DOI) return `https://doi.org/${ext.DOI}`;
  if (node.paperId) return `https://www.semanticscholar.org/paper/${node.paperId}`;
  return null;
}

// Right-hand detail panel for the selected paper.
export default function DetailPanel({ node, onExpand, expanding }) {
  if (!node) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">
        Click a node to see its details, or enter a seed paper above.
      </div>
    );
  }

  const link = externalLink(node);
  const authors = node.authors || [];

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <h2 className="text-base font-semibold leading-snug text-slate-100">
        {node.title || "Untitled"}
      </h2>

      <div className="text-xs text-slate-400">
        {authors.slice(0, 6).join(", ")}
        {authors.length > 6 ? " et al." : ""}
        {node.year ? ` · ${node.year}` : ""}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">
          {node.citationCount?.toLocaleString() ?? 0} citations
        </span>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">
          {node.influentialCitationCount?.toLocaleString() ?? 0} influential
        </span>
      </div>

      {node.tldr && (
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            TL;DR
          </h3>
          <p className="text-sm leading-snug text-slate-200">{node.tldr}</p>
        </div>
      )}

      {node.abstract && (
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Abstract
          </h3>
          <p className="text-xs leading-relaxed text-slate-300">{node.abstract}</p>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-2">
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="text-center text-xs text-blue-400 hover:underline"
          >
            Open paper ↗
          </a>
        )}
        <button
          onClick={() => onExpand(node)}
          disabled={expanding}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {expanding ? "Expanding…" : "Expand neighborhood"}
        </button>
      </div>
    </div>
  );
}
