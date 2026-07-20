// WS2 GUIDE-DOCUMENT ENGINE — the one drawer.
//
// `renderDocument` flows a stack of blocks down a content column on a 2D canvas, in a theme, and hands
// back the drawn hit regions (for warp-mapped taps) + the total content height (for scroll clamping).
// It is the single primitive behind the Guide document view, the per-body info block, and (Phase 5) the
// 3D holo HUD chrome — so a player "info screen" is drawn ONE way regardless of the underlying view.
// Static / low-fps: the caller redraws only on data/selection/theme change; the shader animates the
// time uniforms. See blocks.ts for the model and docs/dev/v2.2-player-view-visual-overhaul.md §WS2.
import { wrap, ellipsise } from '../textLayout';
import { resolveDocColors, type DocBlock, type DocTheme, type ListBlock, type ListStyle } from './blocks';

// The content column the document flows within, in CSS px of the logical view.
export interface DocLayout {
  x: number;          // column left
  y: number;          // column top (first block's top, before scroll)
  w: number;          // column width
  maxY?: number;      // bottom clip: blocks below this aren't painted (still measured); default Infinity
  scrollY?: number;   // content scroll offset (px); positive scrolls content up
  fillBg?: boolean;   // paint the theme bg across the column first (default false — caller owns the ground)
}

// A drawn, tappable region in view px (post-scroll). `id` comes from a block or a list item's id.
export interface DocRegion { id: string; y0: number; y1: number; }
export interface DocResult { regions: DocRegion[]; contentH: number; }

// Vertical rhythm, all scaled by theme.fontScale. Sizes lifted to read like the existing card/list.
const GAP = 10;       // default inter-block gap
const LINE = 1.36;    // line-height multiple

function px(n: number, s: number) { return Math.round(n * s); }

export function renderDocument(
  ctx: CanvasRenderingContext2D,
  blocks: DocBlock[],
  theme: DocTheme,
  layout: DocLayout
): DocResult {
  const s = Math.max(0.7, Math.min(1.8, theme.fontScale || 1));
  const c = resolveDocColors(theme);
  const font = theme.font;
  const { x, w } = layout;
  const maxY = layout.maxY ?? Infinity;
  const scroll = Math.max(0, layout.scrollY ?? 0);
  const regions: DocRegion[] = [];

  if (layout.fillBg) {
    ctx.fillStyle = c.bg;
    ctx.fillRect(x, layout.y, w, (maxY === Infinity ? 0 : maxY - layout.y));
  }

  ctx.textBaseline = 'alphabetic';
  let y = layout.y - scroll; // running baseline-ish cursor (top of the next block)

  // Only paint a block if any of it is inside the visible band; always advance + record its region.
  const visible = (top: number, h: number) => top + h > layout.y - 2 && top < maxY + 2;

  for (const b of blocks) {
    const top = y;
    switch (b.kind) {
      case 'spacer': {
        y += px(b.h ?? GAP, s);
        break;
      }
      case 'rule': {
        const h = px(GAP, s);
        if (visible(top, h)) {
          ctx.strokeStyle = c.rule;
          ctx.lineWidth = 1;
          const ry = Math.round(top + h / 2) + 0.5;
          ctx.beginPath(); ctx.moveTo(x, ry); ctx.lineTo(x + w, ry); ctx.stroke();
        }
        y += h;
        break;
      }
      case 'heading': {
        const level = b.level ?? 1;
        const size = level === 1 ? 22 : level === 2 ? 16 : 13;
        const weight = level === 3 ? 600 : 700;
        const lh = px(size * LINE, s);
        const subLh = b.sub ? px(14, s) : 0;
        const h = lh + subLh + px(4, s);
        if (visible(top, h)) {
          ctx.textAlign = 'left';
          ctx.font = `${weight} ${px(size, s)}px ${font}`;
          ctx.fillStyle = level === 1 ? c.heading : c.body;
          ctx.fillText(b.text, x, top + px(size, s));
          if (b.sub) {
            ctx.font = `${px(11, s)}px ${font}`;
            ctx.fillStyle = c.label;
            ctx.fillText(b.sub.toUpperCase(), x, top + px(size, s) + subLh);
          }
        }
        if (b.id) regions.push({ id: b.id, y0: top, y1: top + h });
        y += h;
        break;
      }
      case 'text': {
        ctx.font = `${b.italic ? 'italic ' : ''}${px(13, s)}px ${font}`;
        const lines = wrap(ctx, b.text, w);
        const lh = px(13 * LINE, s);
        const h = lines.length * lh;
        if (visible(top, h)) {
          ctx.fillStyle = c.body;
          const align = b.align ?? 'left';
          ctx.textAlign = align;
          const tx = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
          let ly = top + px(13, s);
          for (const ln of lines) { ctx.fillText(ln, tx, ly); ly += lh; }
        }
        if (b.id) regions.push({ id: b.id, y0: top, y1: top + h });
        y += h;
        break;
      }
      case 'keyValue': {
        const lh = px(18, s);
        if (visible(top, lh)) {
          const baseY = top + px(13, s);
          ctx.font = `${px(12, s)}px ${font}`;
          ctx.textAlign = 'left';
          ctx.fillStyle = c.label;
          ctx.fillText(b.label, x, baseY);
          ctx.textAlign = 'right';
          ctx.fillStyle = c.value;
          ctx.fillText(ellipsise(ctx, b.value, w * 0.62), x + w, baseY);
        }
        if (b.id) regions.push({ id: b.id, y0: top, y1: top + lh });
        y += lh;
        break;
      }
      case 'list': {
        y = drawList(ctx, b, theme, c, font, s, x, w, top, layout.y, maxY, regions);
        break;
      }
      case 'image': {
        const maxH = (layout.maxY && layout.maxY !== Infinity ? layout.maxY - layout.y : 10000) * (b.maxHFrac ?? 0.32);
        let dw = w, dh = w / (b.aspect || 1);
        if (dh > maxH) { dh = maxH; dw = dh * (b.aspect || 1); }
        const dx = x + (w - dw) / 2;
        if (visible(top, dh)) drawImageBlock(ctx, b.img, b.crop, dx, top, dw, dh, b.aspect || 1);
        if (b.id) regions.push({ id: b.id, y0: top, y1: top + dh });
        y += dh + px(GAP, s);
        break;
      }
      case 'schematic': {
        // Phase 1 placeholder: a captioned box reserving the schematic's band so the document flows.
        // Phase 2 replaces this with the ported orbital line-diagram draw.
        const h = (maxY === Infinity ? 300 : maxY - layout.y) * (b.heightFrac ?? 0.42);
        if (visible(top, h)) {
          ctx.strokeStyle = c.rule;
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, top + 0.5, w - 1, h - 1);
          ctx.fillStyle = c.dim;
          ctx.font = `${px(11, s)}px ${font}`;
          ctx.textAlign = 'center';
          ctx.fillText('[ system schematic ]', x + w / 2, top + h / 2);
        }
        if (b.id) regions.push({ id: b.id, y0: top, y1: top + h });
        y += h + px(GAP, s);
        break;
      }
    }
  }

  return { regions, contentH: (y + scroll) - layout.y };
}

// A `list` block. Phase 1 draws every listStyle as hanging-bullet 'plain'; Phase 4 branches the glyphs.
function drawList(
  ctx: CanvasRenderingContext2D, b: ListBlock, theme: DocTheme, c: Required<import('./blocks').DocColors>,
  font: string, s: number, x: number, w: number, top: number, colTop: number, maxY: number, regions: DocRegion[]
): number {
  const style: ListStyle = b.style ?? theme.listStyle ?? 'plain';
  const lh = px(20, s);
  const indent = px(18, s);
  ctx.font = `${px(13, s)}px ${font}`;
  ctx.textBaseline = 'alphabetic';
  let y = top;
  for (let i = 0; i < b.items.length; i++) {
    const it = b.items[i];
    const rowTop = y;
    const inBand = rowTop + lh > colTop - 2 && rowTop < maxY + 2;
    if (inBand) {
      if (it.selected || (it.id && b.selected)) {
        ctx.fillStyle = theme.mono ? 'rgba(207,214,228,0.16)' : 'rgba(140,170,210,0.16)';
        ctx.fillRect(x - px(4, s), rowTop + px(2, s), w + px(8, s), lh - px(4, s));
      }
      const baseY = rowTop + px(13, s);
      ctx.textAlign = 'left';
      ctx.fillStyle = c.accent;
      ctx.font = `${px(13, s)}px ${font}`;
      ctx.fillText(bullet(style, i), x, baseY);
      ctx.fillStyle = it.selected ? c.value : c.body;
      const tw = it.sub ? w - indent - px(60, s) : w - indent;
      ctx.fillText(ellipsise(ctx, it.text, tw), x + indent, baseY);
      if (it.sub) {
        ctx.textAlign = 'right';
        ctx.fillStyle = c.label;
        ctx.fillText(it.sub, x + w, baseY);
      }
    }
    if (it.id) regions.push({ id: it.id, y0: rowTop, y1: rowTop + lh });
    y += lh;
  }
  return y;
}

// The leading glyph for a list item under a given style (Phase 1: mostly bullets; Phase 4 diverges).
function bullet(style: ListStyle, i: number): string {
  switch (style) {
    case 'numbered-dossier': return `${i + 1}.`;
    case 'terminal-log': return '>';
    case 'manifest': return '·';
    case 'ledger': return '';
    default: return '•';
  }
}

// Draw an image contained into a box, optionally letterboxing the central `crop` fraction of its height.
function drawImageBlock(
  ctx: CanvasRenderingContext2D, img: CanvasImageSource, crop: number | undefined,
  dx: number, dy: number, dw: number, dh: number, aspect: number
) {
  const iw = (img as any).naturalWidth || (img as any).width || 0;
  const ih = (img as any).naturalHeight || (img as any).height || 0;
  if (crop && crop > 0 && crop < 1 && iw && ih) {
    // Show the central `crop` fraction of the source height, full width (matches the Survey Datapad).
    const sh = ih * crop;
    const sy = (ih - sh) / 2;
    ctx.drawImage(img, 0, sy, iw, sh, dx, dy, dw, dw * (sh / iw));
  } else {
    ctx.drawImage(img, dx, dy, dw, dh);
  }
}
