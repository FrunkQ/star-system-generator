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

/** What a marker actually prints: the PIN carries initials, everything else carries the label. */
export function tagPillText(marker: { style: string; label: string; monogram: string }): string {
  return marker.style === 'pin' ? marker.monogram : marker.label;
}

// ---------------------------------------------------------------------------------------------
// THE FAMILIAR SHAPES — a pin and a flag, for player-facing maps.
//
// Both are the PILL with something added, never a different object: same colour, same corner radius,
// same padding, same text. A pin is the pill rounded into a map teardrop carrying initials; a flag is
// the pill flown from a short staff. That way a player who has learnt what green means on one view
// reads it instantly on another, and the GM's panel chip is still recognisably the same badge.
//
// Legibility WITHOUT colour is required (design 9.3) — a CRT or colour-blind filter can flatten the
// hue — so every shape carries text. Nothing here is decided by the renderer: which shape is used is
// the GM's per-view choice, or the individual highlight's override.
// ---------------------------------------------------------------------------------------------

/** Height of a flag's staff, and a pin's tail, as a multiple of the font size. */
export const TAG_PILL_STEM = 1.35;

/**
 * A map pin: a circular head carrying 1-2 initials, on a short tail whose POINT sits at (x, y) — the
 * thing being marked. Returns the head's diameter.
 */
export function drawTagPin(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  m: TagPillMetrics,
  bg: string,
  fg: string
): number {
  const r = m.height / 2;
  const tail = m.fontPx * TAG_PILL_STEM;
  const cy = y - tail - r * 0.35;

  ctx.fillStyle = bg;
  // ONE path, traced identically to tagPinSvg: across the top of the head from left to right, then
  // down to the point. A single path rather than a circle plus a triangle, so a semi-transparent tag
  // colour does not show a seam where the two would have overlapped.
  ctx.beginPath();
  ctx.moveTo(x - r, cy);
  ctx.arc(x, cy, r, Math.PI, 0, false);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();

  ctx.font = m.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fg;
  ctx.fillText(text, x, cy);
  return r * 2;
}

/**
 * A flag: the pill flown from a short staff planted at (x, y). Returns the width of the flag body, so
 * a caller can fan several without measuring twice.
 */
export function drawTagFlag(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  m: TagPillMetrics,
  bg: string,
  fg: string
): number {
  const staff = m.fontPx * TAG_PILL_STEM + m.height;
  const staffW = Math.max(1, m.fontPx * 0.09);

  ctx.fillStyle = bg;
  ctx.fillRect(x - staffW / 2, y - staff, staffW, staff);
  return drawTagPill(ctx, text, x + staffW / 2, y - staff + m.height / 2, m, bg, fg);
}

/** SVG geometry for the same two shapes, so the starmap and the orrery cannot draw them differently. */
export interface TagPinSvg {
  path: string;
  textX: number;
  textY: number;
  fontSize: number;
}
export function tagPinSvg(x: number, y: number, m: TagPillMetrics): TagPinSvg {
  const r = m.height / 2;
  const tail = m.fontPx * TAG_PILL_STEM;
  const cy = y - tail - r * 0.35;
  return {
    // Circle head + a wedge to the point. Drawn as two arcs so the tail meets the head tangentially.
    path: `M ${x - r} ${cy} A ${r} ${r} 0 1 1 ${x + r} ${cy} L ${x} ${y} Z`,
    textX: x,
    textY: cy,
    fontSize: m.fontPx
  };
}
export function tagFlagSvg(text: string, x: number, y: number, m: TagPillMetrics) {
  const staff = m.fontPx * TAG_PILL_STEM + m.height;
  const staffW = Math.max(0.5, m.fontPx * 0.09);
  const pill = tagPillSvg(text, x + staffW / 2, y - staff + m.height / 2, m);
  return { staff: { x: x - staffW / 2, y: y - staff, width: staffW, height: staff }, pill };
}

/**
 * Vertical room one marker needs above its anchor, including the gap to the next — used to stack
 * several without overlap. Derived from what each drawer actually reaches, not guessed: a pin rises
 * `tail + 1.35r` above its point, a flag the full height of its staff.
 */
export function markerStackStep(style: MarkerStyleName, m: TagPillMetrics): number {
  const gap = m.fontPx * TAG_PILL_RATIO.gap;
  if (style === 'pin') return m.fontPx * TAG_PILL_STEM + (m.height / 2) * 1.35 + gap;
  if (style === 'flag') return m.fontPx * TAG_PILL_STEM + m.height + gap;
  return m.rowStep;
}

export type MarkerStyleName = 'label' | 'ring' | 'both' | 'pin' | 'flag';
