// Builds the holo "HUD" canvas — the per-screen overlay bitmap and/or the body info card — so it can be
// composited INTO the holo render (a HUD quad in scene.ts) and thus warped/rolled/tinted by the SAME
// GPU filter as the 3D. Static, once-per-change (cheap). Text is drawn light-on-dark so the CRT/NV
// shader tints it by luminance; in the WHITE colour scheme everything is pure white/grey (a filter is
// meant to colour it). The body photo is omitted (a cross-origin image would taint the WebGL texture).
import type { Fact } from './bodyFacts';
import type { GraphicPlacement } from '$lib/player/presetTypes';
import { wrap } from './textLayout';
import { renderDocument } from './document/renderDocument';
import { hudCardToBlocks, hudCardTheme } from './document/cardBlocks';

export interface HudOverlay { img: HTMLImageElement; placement: GraphicPlacement; }
// "The Guide" margin notes drawn INTO the filtered HUD (so the CRT/NV/thermal shader catches them),
// pinned to the top and/or bottom edge. Each carries its own funny line; empty = that edge is off.
export interface HudTips {
  top?: string;
  bottom?: string;
  accent: string; // theme accent for the prefix stamp (ignored when mono)
  font: string;
  mono: boolean;  // white scheme: draw grey/white so a filter colours it
}
export interface HudCard {
  panelW: number;     // info panel width (css px) — flush to the right (inside a bezel margin)
  title: string;
  sub: string;
  facts: Fact[];
  description: string;
  accent: string;     // theme accent (title) — ignored when mono
  font: string;
  fontScale: number;
  mono: boolean;      // white scheme: draw everything white/grey so a filter colours it
  // D6 unify: when present, the card body is these pre-built document blocks + theme (the SAME
  // panel-mode builder/theme the 2D aside and the Document use) instead of the legacy title/facts flow.
  blocks?: import('./document/blocks').DocBlock[];
  theme?: import('./document/blocks').DocTheme;
}
export interface HudOpts { viewW: number; viewH: number; overlay?: HudOverlay | null; card?: HudCard | null; tips?: HudTips | null; }

// The per-screen overlay bitmap, placed by the standard 9-pin + size%/stretch + opacity rules.
// Exported so the (gfx) list + cover surfaces composite an identical overlay INTO the real filter.
export function drawOverlay(ctx: CanvasRenderingContext2D, o: HudOverlay, W: number, H: number) {
  const iw = o.img.naturalWidth || o.img.width, ih = o.img.naturalHeight || o.img.height;
  if (!iw || !ih) return;
  ctx.globalAlpha = Math.max(0, Math.min(1, o.placement.opacity ?? 1));
  if (o.placement.stretch) {
    ctx.drawImage(o.img, 0, 0, W, H);
  } else {
    let w = W * (o.placement.sizePct / 100);
    let h = w * (ih / iw);
    if (h > H) { h = H; w = h * (iw / ih); } // contain
    const p = o.placement.pin;
    const x = p.endsWith('left') ? 0 : p.endsWith('right') ? W - w : (W - w) / 2;
    const y = p.startsWith('top') ? 0 : p.startsWith('bottom') ? H - h : (H - h) / 2;
    ctx.drawImage(o.img, x, y, w, h);
  }
  ctx.globalAlpha = 1;
}

// A single "Guide" margin banner pinned to the top or bottom edge (inside the bezel safe-area).
// Prefix stamp + wrapped note, on a dark translucent pill so the filter tints it by luminance.
// Exported so the cover and the (gfx) list views draw an identical banner.
// Shared layout for the tip banner — computed once so drawTipBanner and tipBannerHeight (which the
// document uses to RESERVE a header/footer band, so the banner doesn't overlap the body) agree exactly.
function tipBannerLayout(
  ctx: CanvasRenderingContext2D, text: string, edge: 'top' | 'bottom', viewW: number, viewH: number,
  opts: { accent: string; font: string; mono: boolean }
) {
  const fontPx = Math.max(12, Math.min(viewW * 0.011, viewH * 0.026, 20));
  const stampPx = Math.round(fontPx * 0.82);
  const pad = Math.round(fontPx * 0.85);
  const lineH = Math.round(fontPx * 1.32);
  // Full-width bar flush to the edge — no centred pill, no dead space. Text runs the whole page width
  // (minus a little side padding) before it wraps to a second line.
  const barW = viewW;
  const x0 = 0;
  const innerW = barW - pad * 2;
  const prefix = edge === 'top' ? 'TRAVELLER ADVISORY' : 'THE GUIDE SAYS';
  const stampFont = `700 ${stampPx}px ${opts.font}`;
  const noteFont = `italic ${Math.round(fontPx)}px ${opts.font}`;
  ctx.font = stampFont;
  const stampW = ctx.measureText(prefix + '  ').width;
  ctx.font = noteFont;
  const lines = wrap(ctx, text, innerW - stampW);
  const barH = pad * 2 + Math.max(lineH, lines.length * lineH);
  const y0 = edge === 'top' ? 0 : viewH - barH; // hard up against the top / bottom edge
  return { fontPx, pad, lineH, barW, x0, prefix, stampFont, noteFont, stampW, lines, barH, y0 };
}

// The on-screen height of a top/bottom tip banner (0 if no text) — the document reserves this so the
// banner reads as a genuine header/footer instead of overprinting the body.
export function tipBannerHeight(
  ctx: CanvasRenderingContext2D, text: string, edge: 'top' | 'bottom', viewW: number, viewH: number,
  opts: { accent: string; font: string; mono: boolean }
): number {
  if (!text) return 0;
  return tipBannerLayout(ctx, text, edge, viewW, viewH, opts).barH;
}

export function drawTipBanner(
  ctx: CanvasRenderingContext2D,
  text: string,
  edge: 'top' | 'bottom',
  viewW: number,
  viewH: number,
  opts: { accent: string; font: string; mono: boolean }
) {
  if (!text) return;
  const { fontPx, pad, lineH, barW, x0, prefix, stampFont, noteFont, stampW, lines, barH, y0 } =
    tipBannerLayout(ctx, text, edge, viewW, viewH, opts);

  // Full-width band flush to the edge (no rounded pill). A hairline on the inner edge separates it from
  // the body without a gap of dead space.
  ctx.fillStyle = 'rgba(6,8,13,0.92)';
  ctx.fillRect(x0, y0, barW, barH);
  ctx.fillStyle = 'rgba(200,214,232,0.14)';
  ctx.fillRect(x0, edge === 'top' ? y0 + barH - 1 : y0, barW, 1);
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, barW, barH); ctx.clip();

  const accent = opts.mono ? '#cfd6e4' : (opts.accent && opts.accent !== 'rainbow' ? opts.accent : '#8ed0ff');
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  let ty = y0 + pad + Math.round(fontPx * 0.92);
  ctx.font = stampFont;
  ctx.fillStyle = accent;
  ctx.fillText(prefix, x0 + pad, ty);
  ctx.font = noteFont;
  ctx.fillStyle = 'rgba(226,234,246,0.92)';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x0 + pad + (i === 0 ? stampW : 0), ty);
    ty += lineH;
  }
  ctx.restore();
}

function drawTips(ctx: CanvasRenderingContext2D, t: HudTips, viewW: number, viewH: number) {
  const o = { accent: t.accent, font: t.font, mono: t.mono };
  if (t.top) drawTipBanner(ctx, t.top, 'top', viewW, viewH, o);
  if (t.bottom) drawTipBanner(ctx, t.bottom, 'bottom', viewW, viewH, o);
}

function drawCard(ctx: CanvasRenderingContext2D, c: HudCard, viewW: number, viewH: number) {
  const panelW = Math.min(viewW, c.panelW);
  // Bezel margin: the CRT shader samples with fract() at the edges, so content flush to the edge wraps
  // around under barrel warp — inset keeps it in the safe area (reads like a screen with a bezel).
  const mx = Math.round(viewW * 0.035), my = Math.round(viewH * 0.045);
  const x0 = viewW - mx - panelW;
  const pTop = my, pBot = viewH - my;
  const pad = 18;
  const s = Math.max(0.7, Math.min(1.8, c.fontScale || 1));
  const cx = x0 + pad;

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
  ctx.clip();

  // Close glyph (the invisible DOM × takes the real click).
  ctx.strokeStyle = 'rgba(200,214,232,0.5)';
  ctx.lineWidth = 2;
  const xcx = x0 + panelW - pad - 4, xcy = pTop + pad + 2, hs = 6;
  ctx.beginPath();
  ctx.moveTo(xcx - hs, xcy - hs); ctx.lineTo(xcx + hs, xcy + hs);
  ctx.moveTo(xcx + hs, xcy - hs); ctx.lineTo(xcx - hs, xcy + hs);
  ctx.stroke();

  // Content is drawn by the SHARED document engine — the same renderDocument that draws the Document
  // system-view (D6 unify). Preferred: the caller's panel-mode blocks + full preset theme (facts, TAGS,
  // description, styled exactly like every other info block); fallback: the legacy card bridge. The
  // panel chrome (rounded bg, clip, close glyph) stays bespoke here.
  renderDocument(ctx, c.blocks ?? hudCardToBlocks(c), c.theme ?? hudCardTheme(c), {
    x: cx, y: pTop + pad + 6 * s, w: panelW - pad * 2, maxY: pBot - pad, scrollY: 0
  });
  ctx.restore();
}

export function drawHud(opts: HudOpts): HTMLCanvasElement {
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const { viewW, viewH } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(viewW * dpr));
  canvas.height = Math.max(2, Math.round(viewH * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  if (opts.overlay) drawOverlay(ctx, opts.overlay, viewW, viewH);
  if (opts.tips) drawTips(ctx, opts.tips, viewW, viewH);
  if (opts.card) drawCard(ctx, opts.card, viewW, viewH); // card panel sits OVER a banner where they meet
  return canvas;
}
