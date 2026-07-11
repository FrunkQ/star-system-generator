// Draws the preset COVER onto a canvas so it can be shown through the real GPU filter (FilteredCanvas)
// — the cover has no 3D scene behind it, so it gets its own filtered surface instead of a CSS fake.
// Mirrors CoverView's layout closely enough to read the same; the graphic is placed by the standard
// 9-pin/size/stretch/opacity rules. Static (once per change).
import type { CoverConfig, GraphicPlacement } from '$lib/player/presetTypes';

const RAINBOW_STOPS = ['#ff4d4d', '#ff9f43', '#ffd93d', '#4dff88', '#4db8ff', '#9d6bff', '#ff5ecd'];

export interface CoverOpts {
  viewW: number;
  viewH: number;
  cover: CoverConfig;
  accent: string;   // 'rainbow' or a hex
  font: string;
  companyName: string;
  footerText: string;
  graphic?: { img: HTMLImageElement; placement: GraphicPlacement } | null;
}

function drawGraphic(ctx: CanvasRenderingContext2D, g: NonNullable<CoverOpts['graphic']>, W: number, H: number) {
  const iw = g.img.naturalWidth || g.img.width, ih = g.img.naturalHeight || g.img.height;
  if (!iw || !ih) return;
  ctx.globalAlpha = Math.max(0, Math.min(1, g.placement.opacity ?? 1));
  if (g.placement.stretch) {
    ctx.drawImage(g.img, 0, 0, W, H);
  } else {
    let w = W * (g.placement.sizePct / 100);
    let h = w * (ih / iw);
    if (h > H) { h = H; w = h * (iw / ih); }
    const p = g.placement.pin;
    const x = p.endsWith('left') ? 0 : p.endsWith('right') ? W - w : (W - w) / 2;
    const y = p.startsWith('top') ? 0 : p.startsWith('bottom') ? H - h : (H - h) / 2;
    ctx.drawImage(g.img, x, y, w, h);
  }
  ctx.globalAlpha = 1;
}

export function drawCover(opts: CoverOpts): HTMLCanvasElement {
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const { viewW: W, viewH: H, cover, font } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(W * dpr));
  canvas.height = Math.max(2, Math.round(H * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#05070c';
  ctx.fillRect(0, 0, W, H);
  if (opts.graphic) drawGraphic(ctx, opts.graphic, W, H);

  const cx = W / 2;
  const rainbow = opts.accent === 'rainbow';
  const accentCss = rainbow ? '#ffd93d' : (opts.accent || '#6aa0ff');

  // Label stamp (bordered, uppercase) near the top.
  if (cover.label) {
    ctx.font = `600 ${14}px ${font}`;
    ctx.textAlign = 'center';
    const txt = cover.label.toUpperCase();
    const w = ctx.measureText(txt).width + 24;
    ctx.strokeStyle = accentCss; ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - w / 2, H * 0.16, w, 26);
    ctx.fillStyle = accentCss;
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, cx, H * 0.16 + 14);
  }

  // Title — big, centred; rainbow draws a horizontal spectrum gradient.
  const titleSize = Math.min(96, Math.max(40, W * 0.075));
  ctx.font = `800 ${titleSize}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const ty = H * 0.44;
  if (rainbow) {
    const tw = ctx.measureText(cover.title || '').width;
    const grad = ctx.createLinearGradient(cx - tw / 2, 0, cx + tw / 2, 0);
    RAINBOW_STOPS.forEach((c, i) => grad.addColorStop(i / (RAINBOW_STOPS.length - 1), c));
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = accentCss;
  }
  ctx.fillText(cover.title || '', cx, ty);

  let y = ty + titleSize * 0.5;
  if (cover.subtitle) {
    ctx.fillStyle = 'rgba(232,237,244,0.85)';
    ctx.font = `${Math.round(titleSize * 0.26)}px ${font}`;
    y += 26;
    ctx.fillText(cover.subtitle, cx, y);
  }
  if (cover.body) {
    ctx.fillStyle = 'rgba(200,214,232,0.7)';
    ctx.font = `${16}px ${font}`;
    y += 30;
    ctx.fillText(cover.body, cx, y);
  }

  // Footer (company / footer text).
  ctx.font = `${12}px ${font}`;
  ctx.fillStyle = 'rgba(200,214,232,0.5)';
  if (opts.companyName) { ctx.textAlign = 'left'; ctx.fillText(opts.companyName.toUpperCase(), W * 0.06, H * 0.94); }
  if (opts.footerText) { ctx.textAlign = 'right'; ctx.fillText(opts.footerText, W * 0.94, H * 0.94); }

  return canvas;
}
