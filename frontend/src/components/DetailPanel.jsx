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
export default function DetailPanel({
  node,
  onExpand,
  expanding,
  onFindSimilar,
  similarLoading,
  similarResults,
  similarActive,
  onClearSimilar,
  onSelectNode,
  onExplain,
  explainLoading,
  explanation,
  llmEnabled,
  onDiscover,
  recLoading,
  recommendations,
  onAddRecommended,
  isInGraph,
  inReadingList,
  onToggleReadingList,
}) {
  if (!node) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">
        Click a node to see its details, or enter a seed paper above.
      </div>
    );
  }

  const link = externalLink(node);
  const authors = node.authors || [];
  const showSimilar = similarActive && (similarResults?.length || similarLoading);
  const recs =
    recommendations && recommendations.forId === node.id ? recommendations.nodes : null;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-start gap-2">
        <h2 className="min-w-0 flex-1 text-base font-semibold leading-snug text-slate-100">
          {node.title || "Untitled"}
        </h2>
        {onToggleReadingList && (
          <button
            onClick={() => onToggleReadingList(node.id)}
            title={inReadingList ? "Remove from reading list" : "Add to reading list"}
            className={`flex-shrink-0 text-lg leading-none ${
              inReadingList ? "text-amber-400" : "text-slate-600 hover:text-slate-400"
            }`}
          >
            {inReadingList ? "★" : "☆"}
          </button>
        )}
      </div>

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

      {(explanation || explainLoading) && (
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Explanation
          </h3>
          {explainLoading && !explanation ? (
            <p className="text-xs text-slate-400">Thinking…</p>
          ) : (
            <p className="whitespace-pre-line text-xs leading-relaxed text-slate-200">
              {explanation}
            </p>
          )}
        </div>
      )}

      {showSimilar && (
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Most similar in graph
            </h3>
            <button
              onClick={onClearSimilar}
              className="text-[10px] text-slate-400 hover:text-slate-200"
            >
              clear
            </button>
          </div>
          {similarLoading ? (
            <p className="text-xs text-slate-400">Ranking…</p>
          ) : similarResults.length ? (
            <ul className="mt-1 space-y-1">
              {similarResults.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => onSelectNode?.(r.id)}
                    className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-slate-800"
                  >
                    <span className="w-8 flex-shrink-0 font-mono text-[10px] text-emerald-400">
                      {(r.score * 100).toFixed(0)}%
                    </span>
                    <span className="truncate text-slate-200">{r.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400">
              No other embedded papers to compare yet — expand the graph.
            </p>
          )}
        </div>
      )}

      {(recs || recLoading) && (
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Suggested papers
          </h3>
          {recLoading && !recs ? (
            <p className="text-xs text-slate-400">Fetching recommendations…</p>
          ) : recs && recs.length ? (
            <ul className="mt-1 space-y-1">
              {recs.map((r) => {
                const added = isInGraph?.(r.id);
                return (
                  <li
                    key={r.id}
                    className="flex items-center gap-2 rounded px-1.5 py-1 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate text-slate-200" title={r.title}>
                      {r.title}
                      {r.year ? <span className="text-slate-500"> · {r.year}</span> : ""}
                    </span>
                    <button
                      onClick={() => !added && onAddRecommended(r, node.id)}
                      disabled={added}
                      className="flex-shrink-0 rounded bg-blue-600/80 px-1.5 py-0.5 text-[10px] text-white hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400"
                    >
                      {added ? "Added ✓" : "Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-slate-400">No recommendations available.</p>
          )}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-2">
        {onDiscover && (
          <button
            onClick={() => onDiscover(node)}
            disabled={recLoading}
            title="Find related papers you may have missed (Semantic Scholar)"
            className="rounded-md bg-slate-700 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-600 disabled:opacity-40"
          >
            {recLoading ? "Discovering…" : "Discover related papers"}
          </button>
        )}
        <div className="flex gap-2">
          {onFindSimilar && (
            <button
              onClick={() => onFindSimilar(node)}
              disabled={!node.hasEmbedding || similarLoading}
              title={
                node.hasEmbedding
                  ? "Highlight loaded papers most similar to this one (free, instant)"
                  : "This paper has no SPECTER2 embedding to compare"
              }
              className="flex-1 rounded-md bg-slate-700 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-600 disabled:opacity-40"
            >
              {similarLoading ? "Finding…" : "Find similar"}
            </button>
          )}
          {onExplain && llmEnabled && (
            <button
              onClick={() => onExplain(node)}
              disabled={explainLoading || !!explanation}
              title="Plain-language explanation of this paper (LLM)"
              className="flex-1 rounded-md bg-slate-700 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-600 disabled:opacity-40"
            >
              {explainLoading ? "Explaining…" : explanation ? "Explained ✓" : "Explain"}
            </button>
          )}
        </div>
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
