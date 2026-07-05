// A deliberately small Markdown → HTML converter for rendering our OWN bundled docs (the autopilot guide,
// etc.) inside a help modal — NOT a general-purpose engine and NOT for untrusted input. It handles exactly
// the constructs our guides use: ATX headings, paragraphs, unordered lists (with wrapped/continuation
// lines), pipe tables, and inline `code`, **bold**, *italic*. Source is HTML-escaped first, so the result is
// safe to drop through {@html} for trusted docs. Anything fancier (nested lists, ordered lists, links,
// blockquotes, images) is intentionally out of scope — keep the docs within this subset.

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Inline spans. Run on already-assembled (line-joined) text so a **bold** that wraps across source lines
// still matches. Order matters: code first (so * inside a code span isn't treated as emphasis), then bold
// (greedy pair) before italic (single).
const inline = (s: string): string =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');

export function mdToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  const isBlank = (s: string) => /^\s*$/.test(s);
  const isUL = (s: string) => /^-\s+/.test(s);
  const isHeading = (s: string) => /^#{1,6}\s+/.test(s);
  const isTable = (s: string) => /^\|/.test(s);
  const isIndentCont = (s: string) => /^\s{2,}\S/.test(s); // a wrapped continuation line of a list item

  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { const n = Math.min(6, h[1].length); out.push(`<h${n}>${inline(h[2].trim())}</h${n}>`); i++; continue; }

    // Pipe table (needs a |---|---| separator row directly under the header)
    if (isTable(line) && i + 1 < lines.length && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const cells = (s: string) => s.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
      const header = cells(line);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && isTable(lines[i])) { rows.push(cells(lines[i])); i++; }
      const thead = `<thead><tr>${header.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
      out.push(`<table>${thead}${tbody}</table>`);
      continue;
    }

    // Unordered list. Items may wrap across indented continuation lines; those are joined (with a space)
    // and inline-formatted as one, so bold/italic spanning a wrap still resolves.
    if (isUL(line)) {
      const items: string[] = [];
      let cur = '';
      const flush = () => { if (cur.trim()) items.push(cur.trim()); cur = ''; };
      while (i < lines.length) {
        const l = lines[i];
        if (isUL(l)) { flush(); cur = l.replace(/^-\s+/, ''); i++; continue; }
        if (isIndentCont(l)) { cur += ' ' + l.trim(); i++; continue; }
        if (isBlank(l) && isIndentCont(lines[i + 1] ?? '')) { i++; continue; } // blank then indented → same item
        break; // blank-then-nonindented, or a col-0 line, ends the list
      }
      flush();
      out.push(`<ul>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</ul>`);
      continue;
    }

    // Paragraph — consecutive non-block lines, joined then inline-formatted.
    const para: string[] = [];
    while (i < lines.length && !isBlank(lines[i]) && !isHeading(lines[i]) && !isUL(lines[i]) && !isTable(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }

  return out.join('\n');
}
