// A procedural body "disc" drawn to canvas for the Guide document's info block — the illustrated
// picture The Guide is meant to carry. Deliberately simple (a shaded sphere + optional ring), not the
// full PlanetDisc SVG: it's a small in-page thumbnail that the GPU filter then wrecks with the rest of
// the document. Coloured from the body's derived true colour (apparentColorHex). See guideDocument.ts.
import type { CelestialBody } from '$lib/types';

function clampByte(n: number): number { return Math.max(0, Math.min(255, Math.round(n))); }

// Lighten (f>0, toward white) or darken (f<0, toward black) a #rrggbb colour; returns an rgb() string.
function shade(hex: string | undefined, f: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  if (!m) return hex || '#8a8f98';
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  else { r *= (1 + f); g *= (1 + f); b *= (1 + f); }
  return `rgb(${clampByte(r)},${clampByte(g)},${clampByte(b)})`;
}

export interface BodyDiscOpts { ringed?: boolean; mono?: boolean; }

// Draw a shaded disc of radius r centred at (cx, cy). Lit from the upper-left, limb-darkened; a ringed
// body gets a tilted ellipse ring (back arc behind, front arc over). `mono` draws a grey ramp so a
// tinting filter (CRT/NV) colours it.
export function drawBodyDisc(
  ctx: CanvasRenderingContext2D, body: CelestialBody, cx: number, cy: number, r: number, opts: BodyDiscOpts = {}
): void {
  const base = opts.mono ? '#b7bec9' : ((body as any).apparentColorHex || '#8a8f98');
  const ringColor = shade(base, 0.1);

  // Back half of the ring (occluded by the sphere's upper edge), drawn first.
  if (opts.ringed) drawRing(ctx, cx, cy, r, ringColor, 'back');

  // Sphere: radial gradient offset toward the light, with a limb-darkened rim.
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.38, r * 0.08, cx, cy, r);
  g.addColorStop(0, shade(base, 0.5));
  g.addColorStop(0.55, base);
  g.addColorStop(1, shade(base, -0.6));
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();

  // Front half of the ring, over the sphere.
  if (opts.ringed) drawRing(ctx, cx, cy, r, ringColor, 'front');
}

function drawRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, half: 'front' | 'back') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.42);        // slight tilt
  ctx.scale(1, 0.32);       // flatten to an ellipse
  ctx.lineWidth = r * 0.42;
  ctx.strokeStyle = color;
  ctx.globalAlpha = half === 'front' ? 0.85 : 0.5;
  ctx.beginPath();
  // front = lower semicircle (nearer the viewer), back = upper semicircle.
  if (half === 'front') ctx.arc(0, 0, r * 1.7, 0, Math.PI);
  else ctx.arc(0, 0, r * 1.7, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}
