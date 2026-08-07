// THE TAG PILL — one shape, wherever a tag appears.
//
// A marker on the map and a chip in the panel are the SAME OBJECT. They were not drawn that way: the
// panel chip is CSS, the orrery's marker was a hand-rolled canvas rect (9px font, 3px radius, 4px
// padding) and the starmap's was a hand-rolled SVG rect (6px font, 2.5px radius, 3px padding) whose
// width was guessed from the CHARACTER COUNT — so "Trade Union" and "IIIIIIIIIII" got the same pill.
// Four shapes that merely resembled each other.
//
// This module is the single authority for what a tag pill IS. Not one fixed size — the panel draws at
// reading size, the orrery small, the starmap smaller still — but one set of PROPORTIONS, so a pill at
// any size is recognisably the same object:
//
//   padding-x   0.625em      radius   0.3125em
//   padding-y   0.3125em     gap      0.46875em
//
// Those ratios are the CSS chip's own 8px / 4px / 4px / 6px measured against its 0.8rem font, so the
// panel chip is unchanged by construction and every other surface is now a scaled copy of it.
//
// CSS consumers read the --tag-pill-* tokens in styles/tokens.css; canvas and SVG consumers, which
// cannot read CSS, come here. `tagPill.spec.ts` asserts the two agree, so drift is a red test rather
// than a look that slowly stops matching.
import { resolveToken } from '../styles/paletteStore';

/**
 * The pill at PANEL size — the reference every other size is derived from. These are the literal
 * values of `.tag-chip` / `.chip` as they have always shipped; 12.8px is 0.8rem at a 16px root.
 */
export const TAG_PILL_BASE = {
  fontPx: 12.8,
  padX: 8,
  padY: 4,
  radius: 4,
  gap: 6
} as const;

/** The proportions, in em. Derived from the base rather than restated, so the two cannot disagree. */
export const TAG_PILL_RATIO = {
  padX: TAG_PILL_BASE.padX / TAG_PILL_BASE.fontPx,
  padY: TAG_PILL_BASE.padY / TAG_PILL_BASE.fontPx,
  radius: TAG_PILL_BASE.radius / TAG_PILL_BASE.fontPx,
  gap: TAG_PILL_BASE.gap / TAG_PILL_BASE.fontPx
} as const;

/**
 * Line box of the text itself. The CSS chip gets this from `normal` line-height; canvas and SVG have
 * to be told, and it must be the same number in both or the two surfaces round differently.
 */
export const TAG_PILL_LINE = 1.2;

/** The neutral "+N" pill. Not a tag, so it takes no tag colour — it is the absence of three tags. */
export const TAG_PILL_OVERFLOW_BG = 'rgba(30,34,42,0.9)';
export const TAG_PILL_OVERFLOW_FG = '#cfd6e0';

const FALLBACK_FONT = "system-ui, 'Segoe UI', Arial, sans-serif";

/** The UI font, from the token when a document exists (tests and SSR take the fallback). */
export function tagPillFontFamily(): string {
  return resolveToken('--font-ui', FALLBACK_FONT) || FALLBACK_FONT;
}

export interface TagPillMetrics {
  fontPx: number;
  padX: number;
  padY: number;
  radius: number;
  /** Full pill height including padding. */
  height: number;
  /** Baseline-to-baseline distance for a stack of pills, including the inter-pill gap. */
  rowStep: number;
  /** Ready for `ctx.font`. */
  font: string;
  /** The family alone, for SVG/CSS consumers that set size and family separately. */
  fontFamily: string;
}

/**
 * The pill's geometry at a given font size. Everything scales together — halve the font and you get
 * the same pill, half the size, rather than a differently-shaped one.
 */
export function tagPillMetrics(fontPx: number): TagPillMetrics {
  const padX = fontPx * TAG_PILL_RATIO.padX;
  const padY = fontPx * TAG_PILL_RATIO.padY;
  const height = fontPx * TAG_PILL_LINE + padY * 2;
  const fontFamily = tagPillFontFamily();
  return {
    fontPx,
    padX,
    padY,
    radius: fontPx * TAG_PILL_RATIO.radius,
    height,
    rowStep: height + fontPx * TAG_PILL_RATIO.gap,
    font: `${fontPx}px ${fontFamily}`,
    fontFamily
  };
}

// Text measurement needs a 2D context. One offscreen canvas is kept for the surfaces that have no
// context of their own to lend (SVG), rather than creating one per measurement.
let scratch: CanvasRenderingContext2D | null | undefined;
function scratchCtx(): CanvasRenderingContext2D | null {
  if (scratch !== undefined) return scratch;
  try {
    scratch = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  } catch {
    scratch = null;
  }
  return scratch;
}

/**
 * Average glyph width as a fraction of the font size, used ONLY when there is no canvas to measure
 * with (SSR, unit tests). It is an estimate and is documented as one — the point of routing SVG
 * through a real measurement is that the shipped path is no longer estimating.
 */
export const TAG_PILL_AVG_GLYPH = 0.55;

/**
 * Width of the text alone, measured where possible and estimated only where it cannot be.
 *
 * A ZERO MEASUREMENT IS NOT A MEASUREMENT. jsdom (and any environment with a stub 2D context) hands
 * back a context that answers every `measureText` with 0 — which is not "no context" and so would sail
 * past a null check and collapse every pill to bare padding. Treat a non-positive or non-finite answer
 * from a non-empty string as an absent one.
 */
export function measureTagPillText(text: string, m: TagPillMetrics, ctx?: CanvasRenderingContext2D): number {
  const c = ctx ?? scratchCtx();
  if (c) {
    const prev = c.font;
    c.font = m.font;
    const w = c.measureText(text).width;
    c.font = prev;
    if (Number.isFinite(w) && (w > 0 || !text.length)) return w;
  }
  return text.length * m.fontPx * TAG_PILL_AVG_GLYPH;
}

/** Full pill width for a piece of text. */
export function tagPillWidth(text: string, m: TagPillMetrics, ctx?: CanvasRenderingContext2D): number {
  return measureTagPillText(text, m, ctx) + m.padX * 2;
}

/**
 * Draw one pill on a canvas, its LEFT edge at x and its VERTICAL CENTRE at y. Returns the width drawn
 * so a caller can fan pills horizontally without measuring twice.
 */
export function drawTagPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  m: TagPillMetrics,
  bg: string,
  fg: string
): number {
  const w = tagPillWidth(text, m, ctx);
  const top = y - m.height / 2;

  ctx.font = m.font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = bg;
  if (typeof (ctx as any).roundRect === 'function') {
    ctx.beginPath();
    (ctx as any).roundRect(x, top, w, m.height, m.radius);
    ctx.fill();
  } else {
    ctx.fillRect(x, top, w, m.height);
  }

  ctx.fillStyle = fg;
  ctx.fillText(text, x + m.padX, y);
  return w;
}

/**
 * The same pill as SVG attributes, positioned by its left edge and vertical centre. Kept here beside
 * the canvas drawer so the two cannot be changed apart.
 */
export interface TagPillSvg {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
  textX: number;
  textY: number;
  fontSize: number;
  fontFamily: string;
}
export function tagPillSvg(text: string, x: number, y: number, m: TagPillMetrics): TagPillSvg {
  return {
    x,
    y: y - m.height / 2,
    width: tagPillWidth(text, m),
    height: m.height,
    rx: m.radius,
    textX: x + m.padX,
    textY: y,
    fontSize: m.fontPx,
    fontFamily: tagPillFontFamily()
  };
}

/** What a marker actually prints: the monogram shapes carry initials, the rest carry the label. */
export function tagPillText(marker: { style: string; label: string; monogram: string }): string {
  return marker.style === 'pin' || marker.style === 'flag' ? marker.monogram : marker.label;
}
