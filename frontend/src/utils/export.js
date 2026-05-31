// Pure client-side export helpers. All paper metadata already lives in the node
// objects, so BibTeX / RIS / JSON are generated in the browser — no backend call.

function doiOf(node) {
  return node.externalIds?.DOI || null;
}
function arxivOf(node) {
  return node.externalIds?.ArXiv || null;
}

function lastName(author) {
  const parts = (author || "").trim().split(/\s+/);
  return parts.length ? parts[parts.length - 1] : "anon";
}

// Stable, collision-free BibTeX cite key: FirstAuthorLastName + Year + TitleWord.
function bibKey(node, used) {
  const al = lastName(node.authors?.[0]).replace(/[^A-Za-z]/g, "") || "anon";
  const yr = node.year || "n.d.";
  const tw =
    (node.title || "")
      .split(/\s+/)
      .map((w) => w.replace(/[^A-Za-z]/g, ""))
      .find((w) => w.length > 3) || "";
  let key = `${al}${yr}${tw}`;
  let candidate = key;
  let i = 1;
  while (used.has(candidate)) candidate = `${key}${String.fromCharCode(96 + i++)}`;
  used.add(candidate);
  return candidate;
}

function bibField(name, value) {
  if (value === null || value === undefined || value === "") return null;
  return `  ${name} = {${value}}`;
}

export function toBibTeX(nodes) {
  const used = new Set();
  return nodes
    .map((n) => {
      const key = bibKey(n, used);
      const fields = [
        bibField("title", n.title),
        bibField("author", (n.authors || []).join(" and ")),
        bibField("year", n.year),
        bibField("journal", n.venue),
        bibField("doi", doiOf(n)),
        bibField("eprint", arxivOf(n)),
        bibField("url", n.url),
      ].filter(Boolean);
      const type = arxivOf(n) && !n.venue ? "misc" : "article";
      return `@${type}{${key},\n${fields.join(",\n")}\n}`;
    })
    .join("\n\n");
}

export function toRIS(nodes) {
  return nodes
    .map((n) => {
      const lines = ["TY  - JOUR"];
      if (n.title) lines.push(`TI  - ${n.title}`);
      for (const a of n.authors || []) lines.push(`AU  - ${a}`);
      if (n.year) lines.push(`PY  - ${n.year}`);
      if (n.venue) lines.push(`JO  - ${n.venue}`);
      if (doiOf(n)) lines.push(`DO  - ${doiOf(n)}`);
      if (n.url) lines.push(`UR  - ${n.url}`);
      if (n.abstract) lines.push(`AB  - ${n.abstract}`);
      lines.push("ER  - ");
      return lines.join("\n");
    })
    .join("\n\n");
}

export function download(filename, text, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadDataUrl(filename, dataUrl) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
