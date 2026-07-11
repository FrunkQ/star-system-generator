// Draws the body "info card" onto a canvas so it can be composited INTO the holo render (a HUD quad
// in scene.ts) and thus warped/rolled/tinted by the SAME GPU filter as the 3D — no CSS approximation.
// It's a static, once-per-selection draw (cheap). Text is drawn light-on-dark so the CRT/NV shader
// tints it by luminance, exactly like the rest of the picture. The body photo is deliberately omitted
// (a cross-origin image would taint the canvas and break the WebGL texture upload).
import type { Fact } from './bodyFacts';

export interface InfoCardOpts {
  viewW: number;      // holo canvas size (css px)
  viewH: number;
  panelW: number;     // info panel width (css px) — drawn flush to the right edge
  title: string;
  sub: string;        // e.g. "PLANET"
  facts: Fact[];
  description: string;
  accent: string;     // theme accent (title)
  font: string;       // theme font-family
  fontScale: number;  // info-block font-size slider (~0.8..1.6)
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
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

export function drawInfoCard(opts: InfoCardOpts): HTMLCanvasElement {
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const { viewW, viewH, font, accent } = opts;
  const panelW = Math.min(viewW, opts.panelW);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(viewW * dpr));
  canvas.height = Math.max(2, Math.round(viewH * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);

  // Keep the panel INSIDE a bezel margin: the CRT shader wraps (fract) at the screen edges under barrel
  // warp, so content flush to the edge would wrap around. An inset reads like a screen with a bezel.
  const mx = Math.round(viewW * 0.035), my = Math.round(viewH * 0.045);
  const x0 = viewW - mx - panelW;
  const pTop = my, pBot = viewH - my;
  const pad = 18;
  const s = Math.max(0.7, Math.min(1.8, opts.fontScale || 1));
  const cx = x0 + pad;
  const rx = viewW - mx - pad; // right edge for values

  // Screen panel (opaque, rounded — reads as part of the picture, not a translucent overlay).
  const r = 10;
  ctx.beginPath();
  ctx.moveTo(x0 + r, pTop);
  ctx.arcTo(x0 + panelW, pTop, x0 + panelW, pBot, r);
  ctx.arcTo(x0 + panelW, pBot, x0, pBot, r);
  ctx.arcTo(x0, pBot, x0, pTop, r);
  ctx.arcTo(x0, pTop, x0 + panelW, pTop, r);
  ctx.closePath();
  ctx.fillStyle = 'rgba(6,8,13,0.97)';
  ctx.fill();
  ctx.save();
  ctx.clip(); // keep all text within the panel

  // Close glyph, top-right (the invisible DOM × sits here to take the actual click).
  ctx.strokeStyle = 'rgba(200,214,232,0.5)';
  ctx.lineWidth = 2;
  const xcx = x0 + panelW - pad - 4, xcy = pTop + pad + 2, hs = 6;
  ctx.beginPath();
  ctx.moveTo(xcx - hs, xcy - hs); ctx.lineTo(xcx + hs, xcy + hs);
  ctx.moveTo(xcx + hs, xcy - hs); ctx.lineTo(xcx - hs, xcy + hs);
  ctx.stroke();

  let y = pTop + pad + 20 * s;
  ctx.textBaseline = 'alphabetic';

  // Title + sub
  ctx.textAlign = 'left';
  ctx.fillStyle = accent && accent !== 'rainbow' ? accent : '#e8edf4';
  ctx.font = `700 ${Math.round(22 * s)}px ${font}`;
  ctx.fillText(opts.title, cx, y);
  y += 8 * s;
  ctx.fillStyle = 'rgba(200,214,232,0.6)';
  ctx.font = `${Math.round(11 * s)}px ${font}`;
  y += 14 * s;
  ctx.fillText(opts.sub.toUpperCase(), cx, y);
  y += 16 * s;

  // Stats grid: label left (muted), value right (bright).
  const rowH = Math.round(18 * s);
  const labelFont = `${Math.round(12 * s)}px ${font}`;
  const valFont = `${Math.round(12 * s)}px ${font}`;
  for (const f of opts.facts) {
    if (y > pBot - pad - rowH) break;
    ctx.font = labelFont;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(190,205,224,0.7)';
    ctx.fillText(f.label, cx, y);
    ctx.font = valFont;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e8edf4';
    ctx.fillText(f.value, rx, y);
    y += rowH;
  }

  // Description (wrapped, muted italic).
  if (opts.description && y < pBot - pad - 20 * s) {
    y += 10 * s;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(200,214,232,0.8)';
    ctx.font = `italic ${Math.round(12 * s)}px ${font}`;
    const lines = wrap(ctx, opts.description, panelW - pad * 2);
    for (const ln of lines) {
      if (y > pBot - pad) break;
      ctx.fillText(ln, cx, y);
      y += Math.round(16 * s);
    }
  }
  ctx.restore();
  return canvas;
}
