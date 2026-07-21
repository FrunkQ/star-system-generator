// WS2 `schematic` block — the reinstated "simple system line-drawing." A faithful CANVAS port of the
// legacy Field Guide's SVG log-scale orbital diagram (`CatalogueBrowser.svelte:194-222`), so it now
// goes through the GPU filter with the rest of the document instead of being a separate SVG that the
// new preset path dropped. Each star gets a horizontal distance-line; planets sit on it by log10(a),
// belts render as blobs, moons as a small pip. Drawn in the SVG's virtual coordinate space then scaled
// to fit the block's rect (preserveAspectRatio xMidYMin meet), and returns 2D hit boxes (view px) so
// the Phase-3 navigator can map warp-corrected taps to bodies.
import type { System } from '$lib/types';
import { AU_KM } from '$lib/constants';
import { resolveDocColors, type DocTheme } from './blocks';
import { starsOf, planetsOf, beltsOf, listBodiesOf, moonsOf, roguesOf, orbitAU, displayLabel } from './systemTopology';

export interface SchematicHit { id: string; x0: number; y0: number; x1: number; y1: number; }
export interface SchematicOpts {
  system: System;
  x: number; y: number; w: number; h: number; // target rect in view px
  theme: DocTheme;
  selectedId?: string | null;
  colorful?: boolean; // The Guide's friendly rainbow (a stable hue per body)
}

// SVG virtual space (matches the legacy diagram exactly so the look ports 1:1).
const VB_W = 600, ROW_H = 88, INNER = 86, OUTER = VB_W - 26;

// The Guide's rainbow: a stable bright hue per body, index-driven.
const hue = (i: number) => `hsl(${(i * 47 + 8) % 360}, 95%, 66%)`;

interface Row {
  planets: { id: string; x: number; label: string; hasMoons: boolean; color?: string }[];
  belts: { id: string; x1: number; x2: number; label: string; color?: string }[];
}
function diagramRow(system: System, hostId: string): Row {
  const planets = planetsOf(system, hostId).map((b) => ({ b, a: orbitAU(b) })).filter((v) => v.a > 0);
  const belts = beltsOf(system, hostId).map((b: any) => {
    const inKm = b.radiusInnerKm, outKm = b.radiusOuterKm, mid = orbitAU(b);
    const aIn = typeof inKm === 'number' && inKm > 0 ? inKm / AU_KM : mid * 0.9;
    const aOut = typeof outKm === 'number' && outKm > 0 ? outKm / AU_KM : mid * 1.1;
    return { b, aIn, aOut };
  }).filter((v) => v.aOut > 0);

  const logs = [
    ...planets.map((v) => Math.log10(v.a + 1e-5)),
    ...belts.flatMap((v) => [Math.log10(v.aIn + 1e-5), Math.log10(v.aOut + 1e-5)])
  ];
  if (!logs.length) return { planets: [], belts: [] };
  const minLog = Math.min(...logs), maxLog = Math.max(...logs);
  const spread = Math.max(1e-5, maxLog - minLog);
  const pos = (a: number) => logs.length === 1
    ? (INNER + OUTER) / 2
    : INNER + (Math.log10(a + 1e-5) - minLog) / spread * (OUTER - INNER);
  return {
    planets: planets.map((v) => ({
      id: v.b.id, x: pos(v.a), label: displayLabel(system, v.b), hasMoons: moonsOf(system, v.b.id).length > 0,
      color: (v.b as any).apparentColorHex
    })),
    belts: belts.map((v) => ({
      id: v.b.id, x1: pos(v.aIn), x2: Math.max(pos(v.aIn) + 14, pos(v.aOut)), label: displayLabel(system, v.b),
      color: (v.b as any).apparentColorHex
    }))
  };
}

export function drawSystemSchematic(ctx: CanvasRenderingContext2D, opts: SchematicOpts): SchematicHit[] {
  const { system, x, y, w, h, theme, selectedId, colorful } = opts;
  const stars = starsOf(system);
  const hits: SchematicHit[] = [];
  if (!stars.length) return hits;

  const c = resolveDocColors(theme);
  const font = theme.font;

  // Stable hue index (star, then its bodies, then rogues) — only used in `colorful`.
  const hueIndex = new Map<string, number>();
  { let i = 0; for (const s of stars) { hueIndex.set(s.id, i++); for (const b of listBodiesOf(system, s.id)) hueIndex.set(b.id, i++); } for (const r of roguesOf(system)) hueIndex.set(r.id, i++); }
  // Monochrome bleaches everything: the schematic drops its rainbow and uses the grey ramp too.
  const colorfulEff = colorful && !theme.mono;
  // Marker fill: rainbow hue (colorful), a bleached grey (mono), else the body's TRUE colour (its
  // apparentColorHex — brown/red/blue by type), falling back to a theme colour when a body has none.
  const markerCol = (id: string, bodyColor: string | undefined, fallback: string) =>
    colorfulEff ? hue(hueIndex.get(id) ?? 0) : (theme.mono ? fallback : (bodyColor || fallback));

  // Fit the virtual VB_W × (rows·ROW_H) diagram into the rect, centred horizontally, top-aligned.
  const virtH = stars.length * ROW_H;
  const scale = Math.min(w / VB_W, h / virtH);
  const drawW = VB_W * scale, drawH = virtH * scale;
  const offX = x + (w - drawW) / 2, offY = y + (h - drawH) / 2;
  const toView = (vx: number, vy: number) => [offX + vx * scale, offY + vy * scale] as const;
  const pushHit = (id: string, vx0: number, vy0: number, vx1: number, vy1: number) => {
    const [x0, y0] = toView(vx0, vy0); const [x1, y1] = toView(vx1, vy1);
    hits.push({ id, x0, y0, x1, y1 });
  };

  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = 1.5;

  // Belt hit boxes are collected here and appended AFTER stars/planets, so a tap inside a belt that
  // also overlaps a planet resolves to the PLANET first (regions are matched in order).
  const beltHits: SchematicHit[] = [];

  for (let si = 0; si < stars.length; si++) {
    const star = stars[si] as any;
    const cy = si * ROW_H + ROW_H / 2;
    const row = diagramRow(system, star.id);
    const starCol = markerCol(star.id, star.apparentColorHex, c.heading);

    // Distance line.
    ctx.strokeStyle = colorfulEff ? starCol : c.rule;
    ctx.beginPath(); ctx.moveTo(74, cy); ctx.lineTo(VB_W - 14, cy); ctx.stroke();

    // Star node.
    const starSel = selectedId === star.id;
    ctx.beginPath(); ctx.arc(42, cy, 13, 0, Math.PI * 2);
    ctx.fillStyle = starCol; ctx.globalAlpha = starSel ? 1 : 0.9; ctx.fill(); ctx.globalAlpha = 1;
    if (starSel) { ctx.strokeStyle = c.value; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1.5; }
    ctx.fillStyle = colorfulEff ? starCol : c.body;
    ctx.font = `600 13px ${font}`; ctx.textAlign = 'center';
    ctx.fillText(star.name, 42, cy + 27);
    pushHit(star.id, 42 - 15, cy - 15, 42 + 15, cy + 30);

    // Belts (wide blobs, drawn UNDER the planets). Hit box deferred so planets win overlapping taps.
    for (const e of row.belts) {
      const beltCol = markerCol(e.id, e.color, c.rule);
      ctx.fillStyle = beltCol; ctx.globalAlpha = 0.5;
      roundRect(ctx, e.x1, cy - 7, e.x2 - e.x1, 14, 7); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = colorfulEff ? beltCol : c.label; ctx.font = `10px ${font}`; ctx.textAlign = 'center';
      ctx.fillText(e.label, (e.x1 + e.x2) / 2, cy + 25);
      const [bx0, by0] = toView(e.x1, cy - 9); const [bx1, by1] = toView(e.x2, cy + 9);
      beltHits.push({ id: e.id, x0: bx0, y0: by0, x1: bx1, y1: by1 });
    }

    // Planets (drawn OVER belts; hit boxes pushed now so they take click priority). The name is written
    // at 45° sloping UP-RIGHT from the marker so tightly-packed outer planets (Uranus/Neptune/Pluto)
    // don't overprint each other; the hit box grows to cover that diagonal label so the NAME is clickable.
    for (const e of row.planets) {
      const sel = selectedId === e.id;
      const col = markerCol(e.id, e.color, c.value);
      ctx.beginPath(); ctx.arc(e.x, cy, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
      if (sel) { ctx.strokeStyle = c.value; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1.5; }
      if (e.hasMoons) { ctx.beginPath(); ctx.arc(e.x + 10, cy - 9, 2.4, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); }
      ctx.font = `${sel ? '600 ' : ''}10px ${font}`;
      const lw = ctx.measureText(e.label).width;
      ctx.save();
      ctx.translate(e.x, cy - 9);
      ctx.rotate(-Math.PI / 4); // up to the right
      ctx.textAlign = 'left';
      ctx.fillStyle = colorfulEff ? col : (sel ? c.value : c.body);
      ctx.fillText(e.label, 5, 3);
      ctx.restore();
      // Axis-aligned box over the marker + the diagonal label (extends up-right by (5+lw)/√2 each axis).
      const diag = (5 + lw) * Math.SQRT1_2;
      pushHit(e.id, e.x - 9, cy - 12 - diag, e.x + 12 + diag, cy + 9);
    }
  }
  for (const bh of beltHits) hits.push(bh); // belts last → planets/stars match first

  ctx.restore();
  return hits;
}

// The natural height (view px) the diagram wants at a given column width — one ROW_H per star, fitted
// width-first. The document reserves this (capped) so the schematic doesn't leave a band of black space.
export function schematicHeight(system: System, w: number): number {
  const rows = starsOf(system).length;
  if (!rows) return 0;
  return rows * ROW_H * (w / VB_W);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
