// Renders a simple text list (the starmap systems list, and any future "list" module) to a canvas so
// it can be shown through the REAL GPU filter (FilteredCanvas) instead of a CSS approximation — the
// same treatment as the cover/info-card. Static: redrawn only on data / scroll / size change (cheap).
// Returns the row hit-boxes (in CSS px of the logical view) so a warp-mapped tap can find its row.
import { drawTipBanner, drawOverlay, type HudOverlay } from './infoCard';
import { ellipsise } from './textLayout';

export interface ListRow {
  id: string;
  title: string;
  sub?: string;       // right-aligned summary
  dots?: string[];    // small colour dots at the left (e.g. a system's star colours)
  selectable?: boolean;
}
export interface ListModel {
  heading: string;
  rows: ListRow[];
}
export interface ListTips { top?: string; bottom?: string; }
export interface DrawListOpts {
  viewW: number;
  viewH: number;
  scrollY: number;      // content scroll offset in CSS px (clamped by the caller against contentH)
  model: ListModel;
  accent: string;       // theme accent ('rainbow' falls back to a readable colour)
  font: string;
  mono: boolean;        // white/monochrome scheme: draw grey so a filter colours it
  selectedId?: string | null;
  tips?: ListTips | null;
  overlay?: HudOverlay | null; // a per-screen image overlay, composited so the filter catches it
}
export interface RowHit { id: string; y0: number; y1: number; } // in CSS px of the view (post-scroll)
export interface DrawListResult { canvas: HTMLCanvasElement; rows: RowHit[]; contentH: number; }

const PAD_X = 0.08;   // side padding as a fraction of width (matches the DOM list's 8%)
const HEAD_H = 60;    // heading band height
const ROW_H = 44;     // per-row height

export function drawList(opts: DrawListOpts): DrawListResult {
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const { viewW, viewH, model, font } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(viewW * dpr));
  canvas.height = Math.max(2, Math.round(viewH * dpr));
  const ctx = canvas.getContext('2d');
  const rows: RowHit[] = [];
  const contentH = HEAD_H + model.rows.length * ROW_H + 24;
  if (!ctx) return { canvas, rows, contentH };
  ctx.scale(dpr, dpr);

  const px = Math.round(viewW * PAD_X);
  const x0 = px, x1 = viewW - px;
  const accent = opts.mono ? '#cfd6e4' : (opts.accent && opts.accent !== 'rainbow' ? opts.accent : '#8ed0ff');
  const scroll = Math.max(0, Math.min(opts.scrollY, Math.max(0, contentH - viewH)));

  // Opaque ground so the list reads as a screen (and the filter has something to tint everywhere).
  ctx.fillStyle = '#05070c';
  ctx.fillRect(0, 0, viewW, viewH);

  ctx.textBaseline = 'middle';

  // Heading.
  let y = HEAD_H / 2 - scroll;
  if (y > -HEAD_H && y < viewH + HEAD_H) {
    ctx.textAlign = 'left';
    ctx.fillStyle = accent;
    ctx.font = `700 26px ${font}`;
    ctx.fillText(model.heading || 'List', x0, y);
  }

  // Rows.
  ctx.font = `600 15px ${font}`;
  for (let i = 0; i < model.rows.length; i++) {
    const r = model.rows[i];
    const top = HEAD_H + i * ROW_H - scroll;
    const mid = top + ROW_H / 2;
    rows.push({ id: r.id, y0: top, y1: top + ROW_H });
    if (top > viewH || top + ROW_H < 0) continue; // offscreen → skip drawing (hit-box still recorded)

    // Selected highlight.
    if (r.id === opts.selectedId) {
      ctx.fillStyle = 'rgba(140,170,210,0.16)';
      ctx.fillRect(x0 - 6, top + 3, x1 - x0 + 12, ROW_H - 6);
    }
    // Divider.
    ctx.strokeStyle = 'rgba(140,170,210,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, top + ROW_H - 0.5); ctx.lineTo(x1, top + ROW_H - 0.5); ctx.stroke();

    let tx = x0;
    // Star dots.
    if (r.dots && r.dots.length) {
      for (const c of r.dots) {
        ctx.beginPath(); ctx.arc(tx + 5, mid, 5, 0, Math.PI * 2);
        ctx.fillStyle = opts.mono ? '#cfd6e4' : c; ctx.fill();
        tx += 15;
      }
      tx += 6;
    }
    // Right-aligned summary first (so we can clip the title against it).
    let sumLeft = x1;
    if (r.sub) {
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(159,176,200,0.9)';
      ctx.font = `13px ${font}`;
      ctx.fillText(r.sub, x1, mid);
      sumLeft = x1 - ctx.measureText(r.sub).width - 14;
    }
    // Title (ellipsised against the summary).
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e6ecf4';
    ctx.font = `600 15px ${font}`;
    ctx.fillText(ellipsise(ctx, r.title, Math.max(20, sumLeft - tx)), tx, mid);
  }

  if (opts.overlay) drawOverlay(ctx, opts.overlay, viewW, viewH);

  if (opts.tips) {
    const to = { accent: opts.accent, font, mono: opts.mono };
    if (opts.tips.top) drawTipBanner(ctx, opts.tips.top, 'top', viewW, viewH, to);
    if (opts.tips.bottom) drawTipBanner(ctx, opts.tips.bottom, 'bottom', viewW, viewH, to);
  }

  return { canvas, rows, contentH };
}
