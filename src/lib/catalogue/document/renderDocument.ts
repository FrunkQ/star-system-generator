// WS2 GUIDE-DOCUMENT ENGINE — the one drawer.
//
// `renderDocument` flows a stack of blocks down a content column on a 2D canvas, in a theme, and hands
// back the drawn hit regions (for warp-mapped taps) + the total content height (for scroll clamping).
// It is the single primitive behind the Guide document view, the per-body info block, and (Phase 5) the
// 3D holo HUD chrome — so a player "info screen" is drawn ONE way regardless of the underlying view.
// Static / low-fps: the caller redraws only on data/selection/theme change; the shader animates the
// time uniforms. See blocks.ts for the model and docs/dev/v2.2-player-view-visual-overhaul.md §WS2.
import { wrap, ellipsise } from '../textLayout';
import { resolveDocColors, type DocBlock, type DocTheme, type ListBlock, type ListStyle, type TagsBlock, type TagStyle, type TagItem, type ImageFocus } from './blocks';
import { drawSystemSchematic, schematicHeight } from './systemSchematic';
import { traceConstructIcon } from '$lib/constructs/constructIcon';
import { deriveAppearance } from '$lib/rendering/planetAppearance';
import { getPlanetTexture } from '$lib/rendering/planetTexture';
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

// The Guide's rainbow: when the preset's accent is 'rainbow', HEADINGS are painted with the spectrum
// rather than falling back to a flat readable colour — the rainbow is the Guide's signature, so it
// should carry through the document, not just the schematic. Same hues as the app's RAINBOW_GRADIENT.
const RAINBOW_STOPS = ['#ff4d4d', '#ff9f43', '#ffd93d', '#4dff88', '#4db8ff', '#9d6bff', '#ff5ecd'];
function rainbowFill(ctx: CanvasRenderingContext2D, x: number, w: number): CanvasGradient {
  const g = ctx.createLinearGradient(x, 0, x + Math.max(1, w), 0);
  RAINBOW_STOPS.forEach((c, i) => g.addColorStop(i / (RAINBOW_STOPS.length - 1), c));
  return g;
}


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
  const rainbow = theme.accent === 'rainbow';
  const { x: colX, w: colW } = layout;   // full content column
  const maxY = layout.maxY ?? Infinity;
  const scroll = Math.max(0, layout.scrollY ?? 0);
  const regions: DocRegion[] = [];

  if (layout.fillBg) {
    ctx.fillStyle = c.bg;
    ctx.fillRect(colX, layout.y, colW, (maxY === Infinity ? 0 : maxY - layout.y));
  }

  ctx.textBaseline = 'alphabetic';
  let y = layout.y - scroll; // running baseline-ish cursor (top of the next block)

  // Two-column (sliver) state: while active, blocks render in the RIGHT column (indented) and an image
  // is drawn as a strip down the LEFT, sized to the right column's height when the column closes.
  let colIndent = 0;
  let col: { img: CanvasImageSource; aspect: number; stripW: number; top: number; focus?: ImageFocus | null } | null = null;

  // Only paint a block if any of it is inside the visible band; always advance + record its region.
  const visible = (top: number, h: number) => top + h > layout.y - 2 && top < maxY + 2;

  for (const b of blocks) {
    // Effective column for THIS block (shifted right while a left-image column is open).
    const x = colX + colIndent;
    const w = colW - colIndent;
    const top = y;
    switch (b.kind) {
      case 'columnStart': {
        const stripW = colW * (b.stripWFrac ?? 0.34);
        col = { img: b.img, aspect: b.aspect, stripW, top: y, focus: b.focus };
        colIndent = stripW + px(12, s); // right column starts past the strip + a gap
        break; // don't advance y — the right column starts level with the strip top
      }
      case 'columnEnd': {
        if (col) {
          const minH = colW * 0.5 / (col.aspect || 1);
          const stripH = Math.max(y - col.top, minH);
          if (col.top + stripH > layout.y - 2 && col.top < maxY + 2) {
            if (theme.mono) ctx.filter = 'grayscale(1) brightness(1.05)';
            drawImageBlock(ctx, col.img, 'sliver', colX, col.top, col.stripW, stripH, col.aspect, col.focus);
            ctx.filter = 'none';
          }
          y = Math.max(y, col.top + stripH);
        }
        col = null; colIndent = 0;
        break;
      }
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
          // Rainbow accent → paint the heading across the spectrum (never under mono, which deliberately
          // bleaches the whole page for a tinting filter). The gradient spans the heading's own width so
          // every heading shows the full sweep rather than a slice of a page-wide ramp.
          // A builder-set colour wins: it is a deliberate per-heading choice (the starmap dossier gives
          // each system its own hue), and the page-wide rainbow sweep would flatten that back out.
          if (b.color && !theme.mono) {
            ctx.fillStyle = b.color;
          } else if (rainbow && !theme.mono) {
            ctx.fillStyle = rainbowFill(ctx, x, ctx.measureText(b.text).width);
          } else {
            ctx.fillStyle = level === 1 ? c.heading : c.body;
          }
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
      case 'fieldGrid': {
        // Columns are DERIVED from the width, not authored: as many as fit at a readable cell size,
        // capped, minimum one. Each label and its value live inside one cell, so they stay together —
        // which is the whole point, since a full-width keyValue row puts them at opposite edges of a
        // desktop page and they stop reading as a pair.
        const gut = px(26, s);
        const minCol = px(b.minColPx ?? 300, s);
        const cols = Math.max(1, Math.min(b.maxCols ?? 4, Math.floor((w + gut) / (minCol + gut))));
        const cellW = (w - gut * (cols - 1)) / cols;
        // A printed form: an optional glyph, then the label RIGHT-aligned hard against the field, then
        // the value starting on a fixed line with a faint rule under it. Right-aligning the label is
        // what keeps the pair together whatever the label's length — left-aligning it leaves a ragged
        // gap after every short word, and right-aligning the VALUE instead reintroduces the very fault
        // this block exists to fix, in miniature: a "9" a whole cell away from the "Planets" it answers.
        const hasIcons = b.fields.some((f) => f.icon);
        const iconW = hasIcons ? px(15, s) : 0;
        const labW = (cellW - iconW) * 0.42;
        const valX0 = iconW + labW;              // the field line, shared down the whole column
        const lh = px(19, s);
        const rows = Math.ceil(b.fields.length / cols);
        const h = rows * lh;
        if (visible(top, h)) {
          b.fields.forEach((f, i) => {
            // Row-major, so the fields read left to right in the same direction as the rest of the page
            // and a short final row simply leaves a gap at the end rather than an unbalanced column.
            const cx = x + (i % cols) * (cellW + gut);
            const cy = top + Math.floor(i / cols) * lh + px(13, s);
            ctx.font = `${px(12, s)}px ${font}`;
            // Icon and label travel together, right-aligned as ONE group against the field line. Parking
            // the icon in a left gutter instead leaves it stranded a whole column away from the short
            // word it belongs to, which is the same "pair that stopped being a pair" fault again.
            const labEnd = cx + valX0 - px(9, s);
            ctx.textAlign = 'right';
            ctx.fillStyle = c.label;
            const lab = ellipsise(ctx, f.label, labW - px(9, s) - iconW);
            ctx.fillText(lab, labEnd, cy);
            if (f.icon) {
              ctx.fillStyle = c.accent;
              ctx.fillText(f.icon, labEnd - ctx.measureText(lab).width - px(5, s), cy);
            }
            ctx.textAlign = 'left';
            ctx.fillStyle = c.value;
            ctx.fillText(ellipsise(ctx, f.value, cellW - valX0), cx + valX0, cy);
            if (b.rules !== false) {
              ctx.save();
              ctx.globalAlpha = 0.35;
              ctx.strokeStyle = c.rule;
              ctx.lineWidth = 1;
              const ry = Math.round(cy + px(4, s)) + 0.5;
              ctx.beginPath();
              ctx.moveTo(cx + valX0 - px(4, s), ry); ctx.lineTo(cx + cellW, ry);
              ctx.stroke();
              ctx.restore();
            }
          });
        }
        if (b.id) regions.push({ id: b.id, x0: x, y0: top, x1: x + w, y1: top + h });
        y += h;
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
        if (visible(top, dh)) {
          if (theme.mono) ctx.filter = 'grayscale(1) brightness(1.05)'; // bleach the photo under mono
          drawImageBlock(ctx, b.img, frame, dx, top, dw, dh, aspect, b.focus);
          ctx.filter = 'none';
        }
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
      case 'glyphRow': {
        // A run of real body discs. Each is the body's OWN procedural 2D texture — the same canvas the
        // orrery and PlanetDisc use — so the colours arrive already derived from apparentColor and no
        // class-to-colour table exists anywhere in this path. A body with no palette falls back to the
        // appearance model's baseColorHex, which is derived too (composition for a world, temperature
        // for a star). Under mono the whole row is bleached, like every other mark on the page.
        const rowH = px(b.height ?? 26, s);
        const gap = px(5, s);
        const labW = b.label ? Math.min(w * 0.34, px(190, s)) : 0;
        if (visible(top, rowH)) {
          if (b.label) {
            ctx.textAlign = 'left';
            ctx.font = `600 ${px(13, s)}px ${theme.headingFont || font}`;
            ctx.fillStyle = (!theme.mono && b.labelColor) || c.heading;
            ctx.fillText(ellipsise(ctx, b.label, labW - px(8, s)), x, top + rowH * 0.5 + px(4, s));
          }
          let gx = x + labW;
          const limit = x + w - px(46, s); // keep room for the trailing caption
          let drawn = 0;
          for (const it of b.items) {
            const d = Math.max(px(3, s), rowH * Math.max(0.05, Math.min(1, it.scale)));
            if (gx + d > limit) break;
            drawBodyGlyph(ctx, it.body as CelestialBody, gx, top + (rowH - d) / 2, d, theme.mono);
            gx += d + gap;
            drawn++;
          }
          const hidden = b.items.length - drawn;
          ctx.textAlign = 'left';
          ctx.font = `${px(11, s)}px ${font}`;
          ctx.fillStyle = c.label;
          // Never silently truncate: say how many did not fit.
          const tail = [hidden > 0 ? `+${hidden}` : '', b.sub ?? ''].filter(Boolean).join('  ');
          if (tail) ctx.fillText(ellipsise(ctx, tail, x + w - gx), gx + px(4, s), top + rowH * 0.5 + px(4, s));
        }
        if (b.id) regions.push({ id: b.id, x0: x, y0: top, x1: x + w, y1: top + rowH });
        y += rowH + px(4, s);
        break;
      }
      case 'constructGlyph': {
        // A30: the construct's own authored icon, centred, at info-block size. Drawn INTO the document
        // (unlike bodyDisc, which reserves a gap for a live renderer) — it is a flat vector shape, so
        // it needs no overlay and both consumers get it for free. Under a mono theme it takes the
        // page's ink rather than its authored colour, like every other mark on a bleached page.
        const bandH = (maxY === Infinity ? 300 : maxY - layout.y) * (b.heightFrac ?? 0.24);
        // Capped in absolute px as well as by the band: it is an emblem, not an illustration, and a
        // 120 px flat square in a full-page document reads as a missing picture rather than a marker.
        const size = Math.min(bandH * 0.8, w * 0.42, px(84, s));
        if (visible(top, bandH) && size > 2) {
          const cx = x + w / 2, cy = top + bandH / 2;
          ctx.save();
          traceConstructIcon(ctx, b.shape, cx, cy, size);
          ctx.fillStyle = theme.mono ? c.heading : b.color;
          ctx.globalAlpha = 0.92;
          ctx.fill();
          // A thin ring of the page's rule colour so a dark glyph still reads against a dark ground.
          ctx.globalAlpha = 1;
          ctx.strokeStyle = c.rule;
          ctx.lineWidth = Math.max(1, px(1, s));
          ctx.stroke();
          ctx.restore();
        }
        if (b.id) regions.push({ id: b.id, x0: x, y0: top, x1: x + w, y1: top + bandH });
        y += bandH + px(GAP, s);
        break;
      }
      case 'schematic': {
        // The ported orbital line-diagram (systemSchematic.ts). It returns 2D hit boxes (view px) for
        // its bodies, which become full DocRegions so a warp-mapped tap can pick a planet by position.
        // Reserve only the height the diagram needs at this width (capped), not a fixed band of black.
        // A FIXED height wins over the fraction: a repeating strip cannot be sized off the view (see
        // blocks.ts). The drawer fits its virtual box into whatever rect it gets, so this just works.
        const cap = b.height !== undefined
          ? px(b.height, s)
          : (maxY === Infinity ? 300 : maxY - layout.y) * (b.heightFrac ?? 0.55);
        const natural = schematicHeight(b.system as System, w);
        const h = b.height !== undefined ? cap : (natural > 0 ? Math.min(natural, cap) : cap);
        if (visible(top, h)) {
          const hits = drawSystemSchematic(ctx, {
            system: b.system as System, x, y: top, w, h,
            theme, selectedId: b.selectedId, colorful: b.colorful, labels: b.labels
          });
          // `wholeHit` keeps the per-body boxes out of the hit map — at starmap level they would
          // dispatch a planet id to a caller that is expecting a system.
          if (!b.wholeHit) {
            for (const hit of hits) regions.push({ id: hit.id, x0: hit.x0, y0: hit.y0, x1: hit.x1, y1: hit.y1 });
          }
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

  // CHIPS: buttons flowing across the page and wrapping, rather than one per line. A star's planet
  // list runs to thirteen entries in Sol alone, and one row each turns a page of facts into a column
  // of links. Laid out here rather than as a new block kind because it is the same list — only its
  // arrangement changes — so every drill-in list (moons, rings, companions, constructs, the parent
  // row) gets it at once and none of them has to know.
  // A block may override the theme's navigator style (blocks.ts ListBlock.nav) — see there for why.
  const navStyle = b.nav ?? theme.navStyle;

  // CARDS: a pickable bordered box per item, as many across the page as fit. It is a LIST STYLE, not a
  // layout, so it composes with whichever arrangement the starmap document is in and reaches every
  // other navigator list for free.
  // The column placement is the fieldGrid technique — derive the count from the width, then place —
  // NOT columnStart/columnEnd, which is the image-strip machinery and is no use as a general grid.
  // A block that overrode `nav` is asking to be an ACTION rather than a navigator (the dossier's
  // "System data" button), so it keeps its own shape rather than becoming a card.
  if (style === 'cards' && b.nav === undefined) {
    ctx.textBaseline = 'alphabetic';
    const gap = px(10, s);
    const minCard = px(190, s);
    const cols = Math.max(1, Math.min(6, Math.floor((w + gap) / (minCard + gap))));
    const cardW = (w - gap * (cols - 1)) / cols;
    const anySub = b.items.some((it) => it.sub);
    const cardH = px(anySub ? 46 : 32, s);
    const r = px(8, s);
    b.items.forEach((it, i) => {
      const cx = x + (i % cols) * (cardW + gap);
      const cy = top + Math.floor(i / cols) * (cardH + gap);
      const sel = !!it.selected || (!!it.id && !!b.selected);
      if (cy + cardH > colTop - 2 && cy < maxY + 2) {
        // Builder-set hue (the rainbow: one part of the spectrum per card). Ignored under mono, which
        // bleaches the page on purpose — the same exemption the rainbow headings and chips take.
        const own = !theme.mono ? it.color : undefined;
        roundRectPath(ctx, cx, cy, cardW, cardH, r);
        if (own) {
          const a0 = ctx.globalAlpha;
          ctx.globalAlpha = a0 * (sel ? 0.28 : 0.12);
          ctx.fillStyle = own; ctx.fill();
          ctx.globalAlpha = a0;
        } else {
          ctx.fillStyle = sel ? hexA(c.accent, 0.16) : hexA(c.rule || '#8899aa', 0.07);
          ctx.fill();
        }
        ctx.strokeStyle = own ?? (sel ? c.accent : c.rule);
        ctx.lineWidth = sel ? 2 : 1;
        ctx.stroke();
        const padX = px(11, s);
        ctx.textAlign = 'left';
        ctx.font = `600 ${px(14, s)}px ${theme.headingFont || font}`;
        ctx.fillStyle = own ?? (sel ? c.value : c.heading);
        ctx.fillText(ellipsise(ctx, it.text, cardW - padX * 2), cx + padX, cy + px(anySub ? 20 : 21, s));
        if (it.sub) {
          ctx.font = `${px(11, s)}px ${font}`;
          ctx.fillStyle = c.label;
          ctx.fillText(ellipsise(ctx, it.sub, cardW - padX * 2), cx + padX, cy + px(37, s));
        }
      }
      // x-bounded, like chips: cards share a y band, so a tap has to be resolved by column too.
      if (it.id) regions.push({ id: it.id, x0: cx, x1: cx + cardW, y0: cy, y1: cy + cardH });
    });
    const rows = Math.ceil(b.items.length / cols);
    return top + rows * (cardH + gap) + px(2, s);
  }
  if (navStyle === 'chips') {
    ctx.font = `${px(13, s)}px ${font}`;
    ctx.textBaseline = 'alphabetic';
    const padX = px(10, s), gap = px(6, s), chipH = px(23, s), r = px(6, s);
    let cx = x, cy = top;
    for (const it of b.items) {
      const sel = !!it.selected || (!!it.id && !!b.selected);
      const label = it.sub ? `${it.text}  ${it.sub}` : it.text;
      // A chip never exceeds the column: an over-long name is ellipsised to a full-width chip rather
      // than running off the edge, which is the one way a flowing layout can break where rows cannot.
      const chipW = Math.min(w, ctx.measureText(label).width + padX * 2);
      if (cx > x && cx + chipW > x + w) { cx = x; cy += chipH + gap; } // wrap
      if (cy + chipH > colTop - 2 && cy < maxY + 2) {
        // The builder may hand each item its own colour (the Guide's rainbow: a chip takes the hue of
        // that body's marker on the chart above). Monochrome bleaches the page on purpose, so it is
        // ignored there — the same exemption the rainbow headings take.
        const own = !theme.mono ? it.color : undefined;
        roundRectPath(ctx, cx, cy, chipW, chipH, r);
        // The item colour is an hsl() string (the schematic's hue), which `hexA` cannot take an alpha
        // from — it only parses #rrggbb and would hand back a fully opaque fill. Canvas alpha works
        // whatever the colour format, so the tint goes through globalAlpha instead.
        if (own) {
          const a0 = ctx.globalAlpha;
          ctx.globalAlpha = a0 * (sel ? 0.3 : 0.14);
          ctx.fillStyle = own;
          ctx.fill();
          ctx.globalAlpha = a0;
        } else {
          ctx.fillStyle = sel ? hexA(c.accent, 0.16) : hexA(c.rule || '#8899aa', 0.08);
          ctx.fill();
        }
        ctx.strokeStyle = own ?? (sel ? c.accent : c.rule);
        ctx.lineWidth = sel ? 2 : 1; ctx.stroke();
        ctx.textAlign = 'left';
        ctx.fillStyle = own ?? (sel ? c.value : c.body);
        ctx.fillText(ellipsise(ctx, label, chipW - padX * 2), cx + padX, cy + chipH - px(7, s));
      }
      // x-bounded region: side-by-side chips share a y band, so a tap has to be resolved by column
      // too. The hit test already prefers x when a region carries it (schematic boxes do the same).
      if (it.id) regions.push({ id: it.id, x0: cx, x1: cx + chipW, y0: cy, y1: cy + chipH });
      cx += chipW + gap;
    }
    return cy + chipH + px(4, s);
  }

  const boxed = navStyle === 'boxed';
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
    // The builder may hand an item its own colour. Every nav style must honour it, not just chips:
    // it went in for the Guide's rainbow, where a drill-in takes the hue of that body's marker, and a
    // GM switching the navigator to boxed or plain silently lost the colour the builder had chosen.
    // Same fault family as F9 — a builder-set colour that only reached one branch of the renderer.
    const own = !theme.mono ? it.color : undefined;
    if (inBand && boxed) {
      // Boxed nav "buttons": a rounded box per row — the selected one coloured (accent), the rest plain.
      const bx = x, bw = w, by = rowTop + px(2, s), bh = lh - px(5, s), r = px(6, s);
      roundRectPath(ctx, bx, by, bw, bh, r);
      // hsl() item colours carry no alpha for hexA to work from, so the tint goes through globalAlpha.
      if (own) {
        const a0 = ctx.globalAlpha;
        ctx.globalAlpha = a0 * (sel ? 0.3 : 0.14);
        ctx.fillStyle = own; ctx.fill();
        ctx.globalAlpha = a0;
      } else {
        ctx.fillStyle = sel ? hexA(c.accent, 0.16) : hexA(c.rule || '#8899aa', 0.08);
        ctx.fill();
      }
      ctx.strokeStyle = own ?? (sel ? c.accent : c.rule); ctx.lineWidth = sel ? 2 : 1; ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = own ?? (sel ? c.value : c.body);
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
      ctx.fillStyle = own ?? c.accent;
      ctx.font = `${px(13, s)}px ${font}`;
      ctx.fillText(bullet(style, i), x, baseY);
      ctx.fillStyle = own ?? (sel ? c.value : c.body);
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

// Draw an image contained into a box. With a `focus` (the subject's box, from imageFocus.ts) the source
// crop is centred on the BODY and zoomed so it fills the frame with a small margin — so every frame shows
// the planet's edge, not the picture's. Without focus it falls back to the old picture-centred crop.
function drawImageBlock(
  ctx: CanvasRenderingContext2D, img: CanvasImageSource, frame: 'letterbox' | 'full' | 'sliver',
  dx: number, dy: number, dw: number, dh: number, aspect: number, focus?: ImageFocus | null
) {
  const iw = (img as any).naturalWidth || (img as any).width || 0;
  const ih = (img as any).naturalHeight || (img as any).height || 0;
  if (!iw || !ih) { ctx.drawImage(img, dx, dy, dw, dh); return; }
  if (focus) {
    // Source crop, dest-aspect, centred on the subject and sized so its larger extent fills ~82%.
    const destAspect = dw / dh;
    const bw = Math.max(2, 2 * focus.hx * iw), bh = Math.max(2, 2 * focus.hy * ih);
    const margin = frame === 'full' ? 1.14 : 1.22; // a touch tighter for the cropping frames
    let sw = Math.max(bw * margin, bh * margin * destAspect);
    let sh = sw / destAspect;
    if (sw > iw) { sw = iw; sh = sw / destAspect; }
    if (sh > ih) { sh = ih; sw = sh * destAspect; if (sw > iw) sw = iw; }
    let sx = focus.cx * iw - sw / 2, sy = focus.cy * ih - sh / 2;
    sx = Math.max(0, Math.min(iw - sw, sx));
    sy = Math.max(0, Math.min(ih - sh, sy));
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    return;
  }
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

// ONE small body disc, drawn into the document canvas at (x, y, d). Mirrors what PlanetDisc does in
// SVG: the body's procedural texture clipped to a circle, else a flat fill of its derived base colour,
// with a soft terminator so a sphere reads as a sphere and a star reads as a light source.
// NOTHING here decides a colour. `getPlanetTexture` builds its image from the derived apparentColor
// palette and `deriveAppearance().baseColorHex` is the same value the orrery and the 3D holo use — a
// class-to-colour lookup added here would be exactly the renderer shortcut that was reverted once.
function drawBodyGlyph(
  ctx: CanvasRenderingContext2D, body: CelestialBody, x: number, y: number, d: number, mono: boolean
): void {
  const r = d / 2, cx = x + r, cy = y + r;
  let a: ReturnType<typeof deriveAppearance> | null = null;
  try { a = deriveAppearance(body); } catch { a = null; }
  const base = a?.baseColorHex || '#8a8f99';
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.clip();
  let tex: HTMLCanvasElement | null = null;
  // Stars and belts have no surface texture in this model (the appearance model zeroes their banding);
  // they take their derived colour flat, with a star given a glow below.
  if (a && !a.isStar && !a.isBelt && (body as any).apparentColor) {
    try { tex = getPlanetTexture(body); } catch { tex = null; }
  }
  if (tex) ctx.drawImage(tex, cx - r, cy - r, d, d);
  else { ctx.fillStyle = base; ctx.fillRect(cx - r, cy - r, d, d); }
  if (mono) { // the bleached page tints from the filter, so wash the disc to its own luminance
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = '#808080';
    ctx.fillRect(cx - r, cy - r, d, d);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (a?.isStar) {
    // A light source, not a lit ball: brighten the centre rather than shading one limb.
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, d, d);
  } else {
    // Soft terminator from the upper left, the same stylised light PlanetDisc uses at this size.
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.16)');
    g.addColorStop(0.6, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, d, d);
  }
  ctx.restore();
}
