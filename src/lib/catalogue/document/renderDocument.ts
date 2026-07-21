// WS2 GUIDE-DOCUMENT ENGINE — the one drawer.
//
// `renderDocument` flows a stack of blocks down a content column on a 2D canvas, in a theme, and hands
// back the drawn hit regions (for warp-mapped taps) + the total content height (for scroll clamping).
// It is the single primitive behind the Guide document view, the per-body info block, and (Phase 5) the
// 3D holo HUD chrome — so a player "info screen" is drawn ONE way regardless of the underlying view.
// Static / low-fps: the caller redraws only on data/selection/theme change; the shader animates the
// time uniforms. See blocks.ts for the model and docs/dev/v2.2-player-view-visual-overhaul.md §WS2.
import { wrap, ellipsise } from '../textLayout';
import { resolveDocColors, type DocBlock, type DocTheme, type ListBlock, type ListStyle, type TagsBlock, type TagStyle, type TagItem } from './blocks';
import { drawSystemSchematic, schematicHeight } from './systemSchematic';
import type { System, CelestialBody } from '$lib/types';

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
// x0/x1 are optional horizontal bounds: 1D blocks (headings, list rows) span the whole column and omit
// them; the 2D schematic sets them so a tap picks the body under the cursor, not just its row.
export interface DocRegion { id: string; y0: number; y1: number; x0?: number; x1?: number; }
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
  const headingFont = theme.headingFont || theme.font;
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
          ctx.font = `${weight} ${px(size, s)}px ${headingFont}`;
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
      case 'tags': {
        y = drawTags(ctx, b, theme, c, font, s, x, w, top);
        break;
      }
      case 'image': {
        const frame = b.frame ?? 'letterbox';
        const aspect = b.aspect || 1;
        const viewH = (layout.maxY && layout.maxY !== Infinity ? layout.maxY - layout.y : 10000);
        const maxH = viewH * (b.maxHFrac ?? (frame === 'sliver' ? 0.5 : frame === 'full' ? 0.42 : 0.32));
        let dw: number, dh: number;
        if (frame === 'full') {                 // whole image, contained
          dw = w; dh = w / aspect;
          if (dh > maxH) { dh = maxH; dw = dh * aspect; }
        } else if (frame === 'sliver') {         // tall narrow vertical slice
          dh = maxH; dw = Math.min(w, dh * 0.5);
        } else {                                 // letterbox: full width, central band
          const cropFrac = 0.4;
          dw = w; dh = (w / aspect) * cropFrac;
          if (dh > maxH) { dh = maxH; dw = (dh / cropFrac) * aspect; }
        }
        const dx = x + (w - dw) / 2;
        if (visible(top, dh)) drawImageBlock(ctx, b.img, frame, dx, top, dw, dh, aspect);
        if (b.id) regions.push({ id: b.id, y0: top, y1: top + dh });
        y += dh + px(GAP, s);
        break;
      }
      case 'bodyDisc': {
        // Reserve a transparent gap for the body graphic. It is NOT drawn into the filtered canvas — the
        // caller overlays the REAL renderer here (PlanetDisc for 2D, the holo body scene for 3D, or a
        // photo), positioned via this region. `b.id` (e.g. '__bodygfx') lets the caller find the rect.
        const bandH = (maxY === Infinity ? 300 : maxY - layout.y) * (b.heightFrac ?? 0.24);
        if (b.id) regions.push({ id: b.id, x0: x, y0: top, x1: x + w, y1: top + bandH });
        y += bandH + px(GAP, s);
        break;
      }
      case 'schematic': {
        // The ported orbital line-diagram (systemSchematic.ts). It returns 2D hit boxes (view px) for
        // its bodies, which become full DocRegions so a warp-mapped tap can pick a planet by position.
        // Reserve only the height the diagram needs at this width (capped), not a fixed band of black.
        const cap = (maxY === Infinity ? 300 : maxY - layout.y) * (b.heightFrac ?? 0.55);
        const natural = schematicHeight(b.system as System, w);
        const h = natural > 0 ? Math.min(natural, cap) : cap;
        if (visible(top, h)) {
          const hits = drawSystemSchematic(ctx, {
            system: b.system as System, x, y: top, w, h,
            theme, selectedId: b.selectedId, colorful: b.colorful
          });
          for (const hit of hits) regions.push({ id: hit.id, x0: hit.x0, y0: hit.y0, x1: hit.x1, y1: hit.y1 });
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
  const boxed = theme.navStyle === 'boxed';
  const lh = px(boxed ? 24 : 20, s);
  const indent = px(boxed ? 12 : 18, s);
  ctx.font = `${px(13, s)}px ${font}`;
  ctx.textBaseline = 'alphabetic';
  let y = top;
  for (let i = 0; i < b.items.length; i++) {
    const it = b.items[i];
    const rowTop = y;
    const sel = !!it.selected || (!!it.id && !!b.selected);
    const inBand = rowTop + lh > colTop - 2 && rowTop < maxY + 2;
    if (inBand && boxed) {
      // Boxed nav "buttons": a rounded box per row — the selected one coloured (accent), the rest plain.
      const bx = x, bw = w, by = rowTop + px(2, s), bh = lh - px(5, s), r = px(6, s);
      roundRectPath(ctx, bx, by, bw, bh, r);
      ctx.fillStyle = sel ? hexA(c.accent, 0.16) : hexA(c.rule || '#8899aa', 0.08);
      ctx.fill();
      ctx.strokeStyle = sel ? c.accent : c.rule; ctx.lineWidth = 1; ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = sel ? c.value : c.body;
      ctx.font = `${px(13, s)}px ${font}`;
      ctx.fillText(ellipsise(ctx, it.text, bw - indent * 2 - (it.sub ? px(56, s) : 0)), bx + indent, by + bh - px(6, s));
      if (it.sub) { ctx.textAlign = 'right'; ctx.fillStyle = c.label; ctx.fillText(it.sub, bx + bw - indent, by + bh - px(6, s)); }
    } else if (inBand) {
      if (sel) {
        ctx.fillStyle = theme.mono ? 'rgba(207,214,228,0.16)' : 'rgba(140,170,210,0.16)';
        ctx.fillRect(x - px(4, s), rowTop + px(2, s), w + px(8, s), lh - px(4, s));
      }
      const baseY = rowTop + px(13, s);
      ctx.textAlign = 'left';
      ctx.fillStyle = c.accent;
      ctx.font = `${px(13, s)}px ${font}`;
      ctx.fillText(bullet(style, i), x, baseY);
      ctx.fillStyle = sel ? c.value : c.body;
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

// A rounded-rect path (caller fills/strokes).
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// #rrggbb + alpha → rgba() (for translucent pill fills).
function hexA(hex: string, a: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  if (!m) return hex || '#888';
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// The body's tags, three ways (feedback): coloured pills, a plain text list, or grouped by type.
function drawTags(
  ctx: CanvasRenderingContext2D, b: TagsBlock, theme: DocTheme, c: Required<import('./blocks').DocColors>,
  font: string, s: number, x: number, w: number, top: number
): number {
  const style: TagStyle = b.style ?? 'pills';
  if (!b.tags.length) return top;
  // Monochrome bleaches EVERY object on the page — pills lose their type colour and go grey too.
  const tags: TagItem[] = theme.mono ? b.tags.map((t) => ({ ...t, color: c.value })) : b.tags;

  if (style === 'list') {
    // Plain text list — comma-separated, wrapped, in the body colour.
    ctx.font = `${px(12, s)}px ${font}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = c.body;
    const lh = px(12 * LINE, s);
    let y = top + px(12, s);
    for (const ln of wrap(ctx, tags.map((t) => t.label).join(' · '), w)) { ctx.fillText(ln, x, y); y += lh; }
    return top + wrap(ctx, tags.map((t) => t.label).join(' · '), w).length * lh;
  }

  if (style === 'grouped' || style === 'grouped-list') {
    // Group by tag type, a small heading per group, then that group's tags — as pills, or (grouped-list)
    // as a plain comma-separated line in the body colour.
    const asText = style === 'grouped-list';
    const groups = new Map<string, TagItem[]>();
    for (const t of tags) { const g = t.group || 'Other'; (groups.get(g) ?? groups.set(g, []).get(g)!).push(t); }
    let y = top;
    for (const [g, items] of [...groups.entries()].sort((a, z) => a[0].localeCompare(z[0]))) {
      ctx.font = `${px(10, s)}px ${font}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = c.label;
      ctx.fillText(g.toUpperCase(), x, y + px(10, s));
      y += px(15, s);
      if (asText) {
        ctx.font = `${px(12, s)}px ${font}`;
        ctx.fillStyle = c.body;
        const lh = px(12 * LINE, s);
        for (const ln of wrap(ctx, items.map((t) => t.label).join(' · '), w)) { ctx.fillText(ln, x, y + px(12, s)); y += lh; }
        y += px(4, s);
      } else {
        y = drawPillRow(ctx, items, font, s, x, w, y) + px(6, s);
      }
    }
    return y;
  }

  // Default: coloured pills, wrapping across the column.
  return drawPillRow(ctx, tags, font, s, x, w, top);
}

// Lay out tag pills left-to-right, wrapping to new rows; returns the bottom y.
function drawPillRow(
  ctx: CanvasRenderingContext2D, tags: TagItem[], font: string, s: number, x: number, w: number, top: number
): number {
  const padX = px(7, s), h = px(19, s), gap = px(6, s), r = h / 2;
  ctx.font = `${px(11, s)}px ${font}`;
  ctx.textBaseline = 'alphabetic';
  let cx = x, y = top;
  for (const t of tags) {
    const tw = ctx.measureText(t.label).width;
    const pw = tw + padX * 2;
    if (cx + pw > x + w && cx > x) { cx = x; y += h + gap; } // wrap
    // Pill: translucent fill + coloured border + coloured label.
    ctx.beginPath();
    ctx.moveTo(cx + r, y);
    ctx.arcTo(cx + pw, y, cx + pw, y + h, r);
    ctx.arcTo(cx + pw, y + h, cx, y + h, r);
    ctx.arcTo(cx, y + h, cx, y, r);
    ctx.arcTo(cx, y, cx + pw, y, r);
    ctx.closePath();
    ctx.fillStyle = hexA(t.color, 0.16); ctx.fill();
    ctx.strokeStyle = hexA(t.color, 0.85); ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = t.color;
    ctx.textAlign = 'left';
    ctx.fillText(t.label, cx + padX, y + h - px(6, s));
    cx += pw + gap;
  }
  return y + h;
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
  ctx: CanvasRenderingContext2D, img: CanvasImageSource, frame: 'letterbox' | 'full' | 'sliver',
  dx: number, dy: number, dw: number, dh: number, aspect: number
) {
  const iw = (img as any).naturalWidth || (img as any).width || 0;
  const ih = (img as any).naturalHeight || (img as any).height || 0;
  if (!iw || !ih) { ctx.drawImage(img, dx, dy, dw, dh); return; }
  if (frame === 'full') {
    // Whole image (the dest box already matches the aspect ratio).
    ctx.drawImage(img, 0, 0, iw, ih, dx, dy, dw, dh);
  } else if (frame === 'sliver') {
    // Central FULL-HEIGHT vertical slice, cropped to the tall dest box's aspect.
    const sw = Math.min(iw, ih * (dw / dh));
    ctx.drawImage(img, (iw - sw) / 2, 0, sw, ih, dx, dy, dw, dh);
  } else {
    // Letterbox: central full-WIDTH horizontal band, cropped to the short dest box's aspect.
    const sh = Math.min(ih, iw * (dh / dw));
    ctx.drawImage(img, 0, (ih - sh) / 2, iw, sh, dx, dy, dw, dh);
  }
}
