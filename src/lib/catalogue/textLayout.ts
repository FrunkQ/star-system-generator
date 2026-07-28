// Shared canvas text-layout primitives for the "canvas → GPU filter" surfaces (info card, list,
// cover, and the WS2 document engine). These used to be copy-pasted per drawer; kept identical here so
// every filtered surface wraps and ellipsises text the same way. Measurement uses the ctx's CURRENT
// font, so set the font before calling.

// Greedy word-wrap: break `text` into lines no wider than `maxW` (in the ctx's current font).
export function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; }
    else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

// Trim `text` with a trailing ellipsis so it fits within `maxW` (in the ctx's current font).
export function ellipsise(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
