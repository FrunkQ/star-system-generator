// src/lib/comparison/layout.ts
// THE SIZE-COMPARISON LAWS: what order the objects go in, how big each one draws, where the strip
// puts it, which one opens the view, and what the ruler marks. All pure, all testable, no three.js.
//
// TRUE SCALE IS A VIEW, NOT A DIAL. Every other surface in this app draws a body at its READABLE
// size — the span map in `rendering/scaleLaw.ts` (RENDER-S11/S41/S43), which deliberately compresses
// a range no screen can hold. This view exists to remove exactly that compression, so it binds none
// of it: a body's drawn radius here is its own `radiusKm` and nothing else. The scale law has no say
// in this file and this file has no say in the scale law.
import { EARTH_RADIUS_KM, SOLAR_RADIUS_KM, LUNA_RADIUS_KM } from '$lib/constants';
// The app's ONE nice-interval ladder, shared with the starmap's grid — a ruler that chose its own
// intervals would be a second answer to a question this codebase has already settled.
import { niceSeries } from '$lib/map/niceInterval';

/** One object on the strip. `diameterKm` is the TRUE diameter — the whole point of the view. */
export interface ComparisonItem {
  id: string;
  name: string;
  diameterKm: number;
  /** The node's `roleHint`, which is what "the median PLANET" is defined against. */
  role: string;
  colorHex?: string;
}

// --- The numbers, in one table -------------------------------------------------------------------
// Every one of these is a thing a human will want to change after using the view, so none of them is
// allowed to sit inline in a renderer (the standing rule on scattered constants).

/** The selected object fills this share of the viewport's SHORTER side on a click. Owner's figure. */
export const SELECTED_SHARE = 0.5;
/** The opening view puts the median planet at this share of the shorter side. Owner's figure. */
export const OPENING_SHARE = 0.3;
/** Gap between neighbours, as a fraction of the LARGER of the two — so a moon beside a giant is not lost. */
export const GAP_FRACTION = 0.22;
/** Below this drawn diameter an object is a DOT with a label, never an inflated disc (RENDER-S43). */
export const DOT_THRESHOLD_PX = 2;
/** The dot marker's own drawn span. A legibility device: it is a marker, not a claim about size. */
export const DOT_PX = 6;
/** Under this drawn diameter a label would overlap its neighbour's, so labels alternate above/below. */
export const LABEL_ALTERNATE_BELOW_PX = 90;
/** Two ruler labels closer than this collide, so the second drops to the next row. */
export const LABEL_MIN_GAP_PX = 110;
/** Zoomed all the way out, the largest object still spans this share of the shorter side. */
export const MIN_ZOOM_LARGEST_SHARE = 0.04;
/** Zoomed all the way in, the smallest object spans this share of the shorter side. */
export const MAX_ZOOM_SMALLEST_SHARE = 0.5;

/** The three reference diameters the ruler highlights, in km. One source; `constants.ts` holds them. */
export const REFERENCE_TICKS: { id: string; label: string; diameterKm: number }[] = [
  { id: 'luna', label: 'Luna', diameterKm: LUNA_RADIUS_KM * 2 },
  { id: 'earth', label: 'Earth', diameterKm: EARTH_RADIUS_KM * 2 },
  { id: 'sun', label: 'Sun', diameterKm: SOLAR_RADIUS_KM * 2 }
];

// --- Order ---------------------------------------------------------------------------------------

/**
 * Biggest first, the poster's order. Ties break on name so a re-render cannot reshuffle equals — two
 * moons of identical authored radius are not rare in a hand-built system.
 */
export function sortBySize(items: ComparisonItem[]): ComparisonItem[] {
  return items.slice().sort((a, b) => (b.diameterKm - a.diameterKm) || a.name.localeCompare(b.name));
}

// --- The opening selection -----------------------------------------------------------------------

/**
 * THE MEDIAN PLANET, and it is a planet on purpose: a system's moons and asteroids outnumber its
 * planets several times over, so a median taken across everything opens the view on a rock nobody
 * was looking for and pushes every world off the edge.
 *
 * On an even count take the LOWER middle — the smaller of the two — which favours the terrestrial
 * worlds a GM is likelier to be authoring over the giants. Sol has eight planets and opens on Earth.
 *
 * Three cases, all pinned: planets present, no planets (fall back to the median of everything), and
 * a lone star (which the fallback answers by itself).
 */
export function medianPlanet(items: ComparisonItem[]): ComparisonItem | null {
  if (!items.length) return null;
  const planets = items.filter((i) => i.role === 'planet');
  const pool = planets.length ? planets : items;
  const asc = pool.slice().sort((a, b) => (a.diameterKm - b.diameterKm) || a.name.localeCompare(b.name));
  return asc[Math.floor((asc.length - 1) / 2)];
}

// --- Scale ---------------------------------------------------------------------------------------

/**
 * Pixels per km such that `diameterKm` occupies `share` of the viewport's SHORTER side.
 *
 * The shorter side rather than the width, because the strip is horizontal on a desktop and vertical
 * on a phone: measuring against the shorter side is the one rule that means the same thing in both
 * orientations, so "half the screen" does not become "a fifth of it" when the device turns.
 */
export function pxPerKm(diameterKm: number, shorterSidePx: number, share: number): number {
  if (!(diameterKm > 0) || !(shorterSidePx > 0)) return 0;
  return (share * shorterSidePx) / diameterKm;
}

/**
 * How far the hand zoom may go, FROM THE SET'S OWN EXTENT (UI-L7: a bound taken from a constant is a
 * bound that is wrong for every map but the one it was tuned on). Zoomed out, the largest object is
 * still a visible sliver; zoomed in, the smallest one fills half the shorter side.
 */
export function zoomBounds(items: ComparisonItem[], shorterSidePx: number): { min: number; max: number } {
  const sizes = items.map((i) => i.diameterKm).filter((d) => d > 0);
  if (!sizes.length || !(shorterSidePx > 0)) return { min: 1, max: 1 };
  const min = pxPerKm(Math.max(...sizes), shorterSidePx, MIN_ZOOM_LARGEST_SHARE);
  const max = pxPerKm(Math.min(...sizes), shorterSidePx, MAX_ZOOM_SMALLEST_SHARE);
  return { min, max: Math.max(min, max) };
}

// --- The strip -----------------------------------------------------------------------------------

export interface LayoutSlot {
  id: string;
  name: string;
  /** The TRUE drawn diameter in px. Never floored, never inflated — this is the measurement. */
  diameterPx: number;
  /** The span the slot RESERVES: the same number, unless the object is below the floor and draws as a dot. */
  spanPx: number;
  /** Centre along the strip's axis, in px from the strip's start. */
  centrePx: number;
  /** True when the object is drawn as a dot marker rather than as a body. */
  belowFloor: boolean;
  /** Which side of the axis the label sits on: labels alternate once the bodies get small. */
  labelSide: 'start' | 'end';
}

export interface StripLayout {
  slots: LayoutSlot[];
  /** Total length of the strip along its axis, in px. */
  lengthPx: number;
  /** 'x' on a desktop, 'y' on a phone. The strip scrolls along this axis. */
  axis: 'x' | 'y';
}

/**
 * Lay the sorted objects out edge to edge along one axis, biggest first, with a gap proportional to
 * the LARGER neighbour. A constant gap looks right beside the giants and swallows the moons; a gap
 * proportional to the SMALLER neighbour does the reverse and jams a moon against Jupiter's limb.
 *
 * Horizontal on a desktop, vertical on a phone — the same `mode === 'phone'` the system view and the
 * starmap already key on, so this view does not invent a second idea of what a phone is.
 */
export function layoutStrip(
  items: ComparisonItem[],
  scale: number,
  opts: { axis?: 'x' | 'y'; gapFraction?: number } = {}
): StripLayout {
  const axis = opts.axis ?? 'x';
  const gapFraction = opts.gapFraction ?? GAP_FRACTION;
  const sorted = sortBySize(items);
  const slots: LayoutSlot[] = [];
  let cursor = 0;
  let alternate: 'start' | 'end' = 'start';
  for (let i = 0; i < sorted.length; i++) {
    const it = sorted[i];
    const diameterPx = it.diameterKm * scale;
    const belowFloor = diameterPx < DOT_THRESHOLD_PX;
    const spanPx = belowFloor ? DOT_PX : diameterPx;
    // A big body's label has room of its own; a small one's would sit on its neighbour's, so from
    // there down the labels alternate sides — the poster's Titania/Rhea rows.
    let labelSide: 'start' | 'end' = 'start';
    if (spanPx < LABEL_ALTERNATE_BELOW_PX) {
      labelSide = alternate;
      alternate = alternate === 'start' ? 'end' : 'start';
    }
    slots.push({ id: it.id, name: it.name, diameterPx, spanPx, centrePx: cursor + spanPx / 2, belowFloor, labelSide });
    cursor += spanPx;
    const next = sorted[i + 1];
    if (next) cursor += gapFraction * Math.max(spanPx, Math.max(next.diameterKm * scale, DOT_PX));
  }
  return { slots, lengthPx: cursor, axis };
}

/**
 * The note a below-the-floor object carries instead of a size. It is a legibility device and it says
 * so: the object is NOT drawn bigger to make it visible, because an inflated disc on a true-scale
 * poster is the one lie this whole view exists to remove.
 */
export function belowFloorNote(diameterPx: number): string {
  return diameterPx < 1 ? 'below 1 px at this scale' : `below ${DOT_THRESHOLD_PX} px at this scale`;
}

// --- Hiding --------------------------------------------------------------------------------------

/**
 * "Hide this and everything bigger" / "and everything smaller", by DIAMETER rather than by position,
 * so the answer does not change if the sort ever does. Inclusive of the object itself, which is what
 * the offer says out loud.
 */
export function idsAtLeast(items: ComparisonItem[], id: string): string[] {
  const pivot = items.find((i) => i.id === id);
  if (!pivot) return [];
  return items.filter((i) => i.diameterKm >= pivot.diameterKm).map((i) => i.id);
}

export function idsAtMost(items: ComparisonItem[], id: string): string[] {
  const pivot = items.find((i) => i.id === id);
  if (!pivot) return [];
  return items.filter((i) => i.diameterKm <= pivot.diameterKm).map((i) => i.id);
}

/** Hidden objects take no part in the median, the layout or the ruler's range. */
export function visibleItems(items: ComparisonItem[], hidden: ReadonlySet<string>): ComparisonItem[] {
  return items.filter((i) => !hidden.has(i.id));
}

// --- The ruler -----------------------------------------------------------------------------------

export interface ReferenceMark {
  id: string;
  label: string;
  diameterKm: number;
  /** Where the mark falls along the axis, in px. */
  posPx: number;
  /** Which label row this mark's text goes on — 0 unless it would collide with the mark before it. */
  row: number;
  /** Off the ruler's range: the view shows it as an arrow at that edge rather than dropping it. */
  off: 'none' | 'start' | 'end';
}

/**
 * Place the three reference diameters on a ruler of `lengthPx` at `scale`.
 *
 * THE RULER MEASURES SIZE, NOT POSITION, so it does NOT scroll with the strip: a mark sits at
 * `diameterKm * scale` from the ruler's zero and says "this many pixels is one Earth", which is the
 * reading that lets you judge anything on screen. A mark that falls off the range is REPORTED as off
 * rather than dropped — "the Sun runs off to the right" is information, and a ruler that silently
 * omits its own reference has stopped being one.
 *
 * `row` staggers labels that would collide. On a strip of STARS, Luna and Earth are both a handful
 * of pixels from zero and their labels land on top of each other; seen live on the 50-system Local
 * Neighbourhood map, where they overlapped into one unreadable smudge.
 */
export function referenceMarks(scale: number, lengthPx: number, labelWidthPx = LABEL_MIN_GAP_PX): ReferenceMark[] {
  const marks = REFERENCE_TICKS.map((t) => {
    const posPx = t.diameterKm * scale;
    return { ...t, posPx, row: 0, off: posPx < 0 ? 'start' : posPx > lengthPx ? 'end' : 'none' } as ReferenceMark;
  });
  let lastPos = -Infinity, row = 0;
  for (const m of marks) {
    if (m.off !== 'none') continue;
    row = m.posPx - lastPos < labelWidthPx ? row + 1 : 0;
    m.row = row;
    lastPos = m.posPx;
  }
  return marks;
}

/**
 * The MINOR ticks: a plain nice-interval scale under the three references, so the ruler reads as a
 * ruler rather than as three lonely marks. `niceSeries` is the app's existing 1/2/5 ladder — the
 * starmap's grid uses it, and a second interval-chooser here would be a second answer to one
 * question.
 */
export function minorTicks(scale: number, lengthPx: number): { km: number; posPx: number }[] {
  if (!(scale > 0) || !(lengthPx > 0)) return [];
  return niceSeries(lengthPx / scale, 6).map((km) => ({ km, posPx: km * scale }));
}
