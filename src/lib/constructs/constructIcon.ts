// The ONE construct glyph vocabulary: triangle / circle / diamond / cross / square, the shapes a
// construct's authored `icon_type` names. A construct is drawn with these on the 2D orrery, on the
// starmap and in the holo scene, so the info block draws the same shape rather than inventing a
// look of its own (inbox A30) — the panel then agrees with the marker the reader can see on the map.
//
// Path-only: the caller owns fill, stroke and colour, because the surfaces disagree about those
// (the document bleaches to grey under a mono theme; a marker keeps its authored colour).
//
// UNIFIED at v2.1.367 (inbox A34): `holo/scene.ts`, `components/Starmap.svelte` and
// `components/SystemVisualizer.svelte` all read this module now. They were said to "agree today";
// one did not — the starmap's SVG copy fell back to a DIAMOND where every other surface falls back
// to a triangle, so a construct with no authored icon_type drew as a different shape on the starmap
// than on the orrery, the holo scene and in its own info block.

export type ConstructIconShape = 'triangle' | 'circle' | 'diamond' | 'cross' | 'square' | 'mast';

export const CONSTRUCT_ICON_SHAPES: ConstructIconShape[] = ['triangle', 'circle', 'diamond', 'cross', 'square', 'mast'];

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
  } else if (shape === 'mast') {
    // THE BEANSTALK (G53, owner-picked): a full-height stem with the knob at the GEOSTATIONARY
    // point - "the blob is geostationary" - so the ribbon honestly runs PAST it to the
    // counterweight. Knob centre sits a third of the way down from the top.
    const t = size / 6;
    const r = size / 5;
    const knobY = cy - h + size / 3;
    ctx.rect(cx - t / 2, cy - h, t, size);
    ctx.moveTo(cx + r, knobY);
    ctx.arc(cx, knobY, r, 0, 2 * Math.PI);
  } else {
    // triangle (the default) — bodies are spheres, constructs read as triangles
    ctx.moveTo(cx, cy - h); ctx.lineTo(cx + h, cy + h); ctx.lineTo(cx - h, cy + h);
    ctx.closePath();
  }
}


// The same geometry as an SVG path string, for the surfaces that draw vectors rather than pixels.
// A second EMITTER of one shape table, not a second table — which is the whole point: add a shape
// to CONSTRUCT_ICON_SHAPES and both the canvas tracer above and this fall out of the same case.
export function constructIconPath(shape: ConstructIconShape, cx = 0, cy = 0, size = 10): string {
  const h = size / 2;
  if (shape === 'circle') {
    // Two arcs, so a caller with no <circle> element still gets a round glyph.
    return `M${cx - h},${cy} a${h},${h} 0 1,0 ${size},0 a${h},${h} 0 1,0 ${-size},0 Z`;
  }
  if (shape === 'diamond') return `M${cx},${cy - h} L${cx + h},${cy} L${cx},${cy + h} L${cx - h},${cy} Z`;
  if (shape === 'square') return `M${cx - h},${cy - h} H${cx + h} V${cy + h} H${cx - h} Z`;
  if (shape === 'cross') {
    const t = size / 3, q = t / 2;
    return `M${cx - q},${cy - h} H${cx + q} V${cy - q} H${cx + h} V${cy + q} H${cx + q} V${cy + h} `
         + `H${cx - q} V${cy + q} H${cx - h} V${cy - q} H${cx - q} Z`;
  }
  if (shape === 'mast') {
    // Stem the full height, knob (the geostationary dock) a third down from the top - same
    // geometry as the canvas case above, one table (this module's whole point).
    const t = size / 6, q = t / 2, r = size / 5;
    const knobY = cy - h + size / 3;
    return `M${cx - q},${cy - h} H${cx + q} V${cy + h} H${cx - q} Z `
         + `M${cx - r},${knobY} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0 Z`;
  }
  return `M${cx},${cy - h} L${cx + h},${cy + h} L${cx - h},${cy + h} Z`;   // triangle
}
