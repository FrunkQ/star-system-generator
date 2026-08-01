// The ONE construct glyph vocabulary: triangle / circle / diamond / cross / square, the shapes a
// construct's authored `icon_type` names. A construct is drawn with these on the 2D orrery, on the
// starmap and in the holo scene, so the info block draws the same shape rather than inventing a
// look of its own (inbox A30) — the panel then agrees with the marker the reader can see on the map.
//
// Path-only: the caller owns fill, stroke and colour, because the surfaces disagree about those
// (the document bleaches to grey under a mono theme; a marker keeps its authored colour).
//
// NOTE for whoever unifies the rest: three older copies of this vocabulary still exist —
// `holo/scene.ts` (getConstructIconTexture), `components/Starmap.svelte` (iconPath, as SVG) and
// `components/SystemVisualizer.svelte`. They were out of bounds for the session that wrote this.

export type ConstructIconShape = 'triangle' | 'circle' | 'diamond' | 'cross' | 'square';

export const CONSTRUCT_ICON_SHAPES: ConstructIconShape[] = ['triangle', 'circle', 'diamond', 'cross', 'square'];

export function constructIconShape(iconType: string | undefined | null): ConstructIconShape {
  const s = String(iconType || '').toLowerCase();
  return (CONSTRUCT_ICON_SHAPES as string[]).includes(s) ? (s as ConstructIconShape) : 'triangle';
}

// Trace the glyph centred on (cx, cy) at `size` across, into the current path. `size` is the full
// width/height of the shape's bounding box, so callers can size it to whatever space they have.
export function traceConstructIcon(
  ctx: CanvasRenderingContext2D,
  shape: ConstructIconShape,
  cx: number,
  cy: number,
  size: number
): void {
  const h = size / 2;
  ctx.beginPath();
  if (shape === 'circle') {
    ctx.arc(cx, cy, h, 0, 2 * Math.PI);
  } else if (shape === 'diamond') {
    ctx.moveTo(cx, cy - h); ctx.lineTo(cx + h, cy); ctx.lineTo(cx, cy + h); ctx.lineTo(cx - h, cy);
    ctx.closePath();
  } else if (shape === 'cross') {
    const t = size / 3;
    ctx.rect(cx - t / 2, cy - h, t, size);
    ctx.rect(cx - h, cy - t / 2, size, t);
  } else if (shape === 'square') {
    ctx.rect(cx - h, cy - h, size, size);
  } else {
    // triangle (the default) — bodies are spheres, constructs read as triangles
    ctx.moveTo(cx, cy - h); ctx.lineTo(cx + h, cy + h); ctx.lineTo(cx - h, cy + h);
    ctx.closePath();
  }
}
