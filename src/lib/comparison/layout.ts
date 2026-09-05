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
  /** SI, for the mass order. Absent sorts last rather than as zero — see `sortItems`. */
  massKg?: number;
  /** The node's parent, for the ORBIT order's tree. Null or absent = a root (a star). */
  parentId?: string | null;
  /** Semi-major axis in AU, for the ORBIT order. A root star has none. */
  orbitAu?: number;
}

/**
 * HOW THE STRIP IS ORDERED. `size` is the poster's own order and the default; the other three exist
 * because a GM comes to this view with different questions — "which of these is the biggest", "where
 * is the one called X", "which is the heaviest" and "what orbits what".
 *
 * `orbit` is not a re-sort but a different LAYOUT: it is the only one with a second dimension, so it
 * gets its own function below.
 */
export type SortOrder = 'size' | 'name' | 'mass' | 'orbit';

/** The button labels, in the order they are offered. One list, so the UI cannot invent a fifth. */
export const SORT_ORDERS: { id: SortOrder; label: string; title: string }[] = [
  { id: 'size', label: 'Size', title: 'Largest first — the poster order' },
  { id: 'name', label: 'Name', title: 'Alphabetical' },
  { id: 'mass', label: 'Mass', title: 'Heaviest first' },
  { id: 'orbit', label: 'Orbit', title: 'What orbits what: moons under their planet, their moons to the side' }
];

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
/**
 * How far a finger may travel and still count as a TAP rather than a drag.
 *
 * A touch surface has no separate "click": the same gesture that pans the strip ends on an object,
 * so without a slop threshold every drag that finished over a body would also select it and rescale
 * the whole view. 10 px is the usual figure for a finger; a mouse rarely moves at all.
 */
export const TAP_SLOP_PX = 10;
/**
 * How much of a screenful one stepper press (or one arrow key) moves. Less than a whole screen on
 * purpose: an overlap carries a landmark across, so you can see WHERE you have got to. A full
 * screenful teleports you and a small nudge takes forever.
 */
export const STEP_FRACTION = 0.8;
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

/**
 * The strip in whichever order was asked for. EVERY comparator falls back to the name, so no order
 * can reshuffle equal objects between renders — the fault a bare `sort` on one key always has.
 *
 * A MISSING MASS SORTS LAST, NOT AS ZERO. A body a GM has not given a mass is unknown, not weightless,
 * and putting it at the light end of the strip states something the data does not say. `orbit` is a
 * layout rather than an order and is handled by `layoutStrip`; asked for here it gives the tree's own
 * reading order, which is what the labels and the median then agree with.
 */
export function sortItems(items: ComparisonItem[], order: SortOrder = 'size'): ComparisonItem[] {
  const byName = (a: ComparisonItem, b: ComparisonItem) => a.name.localeCompare(b.name);
  if (order === 'name') return items.slice().sort(byName);
  if (order === 'mass') {
    return items.slice().sort((a, b) => {
      const am = Number.isFinite(a.massKg) ? (a.massKg as number) : -Infinity;
      const bm = Number.isFinite(b.massKg) ? (b.massKg as number) : -Infinity;
      return (bm - am) || byName(a, b);
    });
  }
  if (order === 'orbit') return orbitOrder(items);
  return sortBySize(items);
}

/**
 * THE ORBIT TREE: roots, and every item's children, each list in orbital order.
 *
 * A ROOT IS ANYTHING WHOSE PARENT IS NOT IN THIS SET **OR IS A STAR**. The second half is the one
 * that matters and it is not a technicality: every planet orbits the star, so a plain parent walk
 * makes the whole system one column of "moons of the Sun" — true, and completely useless on a poster.
 * The columns a reader wants are the star and the things that go round it; the rows under a column
 * are that body's own satellites. First cut got this wrong and the gate caught it.
 *
 * The other half makes hiding safe: hide a planet and its moons are PROMOTED to roots rather than
 * vanishing with it, and the starmap — where every star is a root already — degenerates to a flat
 * row for free.
 *
 * Siblings go innermost first, which is the order a GM reads a system in. A body with no orbit sorts
 * before those that have one (a root star is the case that matters) and then by size, so a set with
 * no orbital data at all still comes out in the poster's order rather than at random.
 *
 * The flattened reading order and the two-dimensional LAYOUT are both built from this one walk — a
 * second tree-builder beside it is two answers to "what orbits what".
 */
export function orbitTree(items: ComparisonItem[]): { roots: ComparisonItem[]; childrenOf: (id: string) => ComparisonItem[] } {
  const byId = new Map(items.map((i) => [i.id, i]));
  const kids = new Map<string, ComparisonItem[]>();
  const roots: ComparisonItem[] = [];
  for (const it of items) {
    const host = it.parentId ? byId.get(it.parentId) : undefined;
    const parent = host && host.role !== 'star' ? host.id : null;
    if (!parent) { roots.push(it); continue; }
    const list = kids.get(parent);
    if (list) list.push(it);
    else kids.set(parent, [it]);
  }
  const inOrbit = (a: ComparisonItem, b: ComparisonItem) =>
    ((a.orbitAu ?? 0) - (b.orbitAu ?? 0)) || (b.diameterKm - a.diameterKm) || a.name.localeCompare(b.name);
  roots.sort(inOrbit);
  for (const list of kids.values()) list.sort(inOrbit);
  return { roots, childrenOf: (id: string) => kids.get(id) ?? [] };
}

/** The tree flattened into reading order: each root, then its children, then theirs. */
export function orbitOrder(items: ComparisonItem[]): ComparisonItem[] {
  const { roots, childrenOf } = orbitTree(items);
  const out: ComparisonItem[] = [];
  const walk = (list: ComparisonItem[]) => {
    for (const it of list) { out.push(it); walk(childrenOf(it.id)); }
  };
  walk(roots);
  return out;
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

/**
 * Keep the strip's scroll inside the strip. Two things it must get right and one it must not:
 *  - never before the start, so the first object is always reachable;
 *  - never past the end, so you cannot scroll off into empty space beyond the smallest object;
 *  - and when the WHOLE strip fits in the window there is nothing to scroll, so the answer is 0
 *    rather than the negative number `lengthPx - spanPx` gives you, which would push the strip off
 *    the near edge.
 */
export function clampScroll(scrollPx: number, lengthPx: number, spanPx: number): number {
  // NaN is the one value that must not get through: it propagates into every position on screen and
  // the strip simply vanishes. An infinity, by contrast, clamps to the end perfectly well through
  // the two comparisons below - and pinning at the end is a better answer to a runaway than
  // snapping the reader back to the start.
  if (Number.isNaN(scrollPx)) return 0;
  return Math.min(Math.max(0, lengthPx - spanPx), Math.max(0, scrollPx));
}

/**
 * Zoom about a fixed point of the WINDOW - the pinch's centre between two fingers, or the window's
 * middle on a wheel - so whatever you are looking at stays put instead of sliding away under the
 * gesture. `anchorPx` is that point measured from the window's near edge.
 *
 * The object under the anchor sits `(scrollPx + anchorPx) / oldScale` km along the strip, and that
 * reading is what must not move; the new scroll falls out of it. The strip's own length scales with
 * the zoom, so the clamp is applied against the NEW length.
 */
export function scrollForZoom(
  scrollPx: number, anchorPx: number, oldScale: number, newScale: number,
  lengthPx: number, spanPx: number
): number {
  if (!(oldScale > 0) || !(newScale > 0)) return clampScroll(scrollPx, lengthPx, spanPx);
  const ratio = newScale / oldScale;
  return clampScroll((scrollPx + anchorPx) * ratio - anchorPx, lengthPx * ratio, spanPx);
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
  /**
   * Offset ACROSS the strip from its centreline, in px. Zero for every flat order — only the ORBIT
   * layout uses it, to stack a planet's moons off the line the planets sit on.
   */
  crossPx: number;
  /** 0 for a root, 1 for its moons, 2 for their moons. The orbit layout's indent, and a label cue. */
  depth: number;
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
  /**
   * How far the furthest row's far EDGE sits from the centreline. Zero unless the order is 'orbit' —
   * a flat strip has one row and needs no travel across it. The view clamps its cross scroll to this.
   */
  crossReachPx: number;
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
  opts: { axis?: 'x' | 'y'; gapFraction?: number; order?: SortOrder } = {}
): StripLayout {
  const axis = opts.axis ?? 'x';
  const gapFraction = opts.gapFraction ?? GAP_FRACTION;
  const order = opts.order ?? 'size';
  // The orbit order is a TREE, not a line, so it has its own function. Everything else is one row in
  // a different sequence, which is the same layout with a different comparator.
  if (order === 'orbit') return layoutOrbit(items, scale, { axis, gapFraction });
  const sorted = sortItems(items, order);
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
    slots.push({ id: it.id, name: it.name, diameterPx, spanPx, centrePx: cursor + spanPx / 2, crossPx: 0, depth: 0, belowFloor, labelSide });
    cursor += spanPx;
    const next = sorted[i + 1];
    if (next) cursor += gapFraction * Math.max(spanPx, Math.max(next.diameterKm * scale, DOT_PX));
  }
  return { slots, lengthPx: cursor, axis, crossReachPx: 0 };
}

/**
 * THE ORBIT LAYOUT — the only one with two dimensions, and the owner's own description of it: moons
 * stacked under their planet, moons of moons off to the side of them.
 *
 * One COLUMN per root, in orbital order along the strip. Inside a column the root sits on the
 * centreline; its children stack away from that line, one per row; and a child's own children run
 * along the STRIP's axis beside it, so a three-deep system reads as an indent rather than as a third
 * direction nobody has room for.
 *
 * A column is as wide as its widest row, so a planet with a long train of moons pushes the next
 * planet along rather than colliding with it — the arithmetic is done twice on purpose, once to
 * measure and once to place, because a single pass cannot know a column's width until it has walked
 * it.
 */
function layoutOrbit(
  items: ComparisonItem[],
  scale: number,
  opts: { axis: 'x' | 'y'; gapFraction: number }
): StripLayout {
  const { roots, childrenOf } = orbitTree(items);
  const slots: LayoutSlot[] = [];
  const spanOf = (it: ComparisonItem) => {
    const d = it.diameterKm * scale;
    return d < DOT_THRESHOLD_PX ? DOT_PX : d;
  };
  const gap = (a: number, b: number) => opts.gapFraction * Math.max(a, b);

  /** How far a child's row reaches along the strip, from that child's own centre rightwards. */
  const rowReach = (child: ComparisonItem): number => {
    let reach = spanOf(child) / 2;
    for (const gc of childrenOf(child.id)) reach += gap(spanOf(child), spanOf(gc)) + spanOf(gc);
    return reach;
  };

  let cursor = 0;
  let crossReach = 0;
  for (let r = 0; r < roots.length; r++) {
    const root = roots[r];
    const rootSpan = spanOf(root);
    const kids = childrenOf(root.id);
    // The column's half-widths: the root reaches its own radius both ways; a child reaches its radius
    // to the left and its whole row to the right.
    const left = Math.max(rootSpan / 2, ...kids.map((k) => spanOf(k) / 2), 0);
    const right = Math.max(rootSpan / 2, ...kids.map(rowReach), 0);
    const centre = cursor + left;

    slots.push({
      id: root.id, name: root.name, diameterPx: root.diameterKm * scale, spanPx: rootSpan,
      centrePx: centre, crossPx: 0, depth: 0,
      belowFloor: root.diameterKm * scale < DOT_THRESHOLD_PX, labelSide: 'start'
    });

    // Children stack away from the centreline, and each one's children run off to its right.
    //
    // THE GAP FROM A PLANET TO ITS FIRST MOON IS SIZED BY THE MOON, NOT BY THE PLANET — the one place
    // this layout departs from the strip's larger-of-two rule, and it earns the exception. Jupiter is
    // three thousand pixels across at a scale that makes Io eighty, so the shared rule put six
    // hundred pixels of black between them and the moons were simply lost off the bottom of the
    // window. A moon belongs tucked under its planet's limb; the planet's own radius is already all
    // the separation the eye needs. Between SIBLINGS the ordinary rule stands, because there the two
    // are comparable and the larger is what must not be crowded.
    let cross = rootSpan / 2;
    let prevSpan = 0;
    for (const kid of kids) {
      const kSpan = spanOf(kid);
      cross += (prevSpan ? gap(prevSpan, kSpan) : opts.gapFraction * kSpan) + kSpan / 2;
      slots.push({
        id: kid.id, name: kid.name, diameterPx: kid.diameterKm * scale, spanPx: kSpan,
        centrePx: centre, crossPx: cross, depth: 1,
        belowFloor: kid.diameterKm * scale < DOT_THRESHOLD_PX, labelSide: 'end'
      });
      let along = centre + kSpan / 2;
      for (const gc of childrenOf(kid.id)) {
        const gSpan = spanOf(gc);
        along += gap(kSpan, gSpan) + gSpan / 2;
        slots.push({
          id: gc.id, name: gc.name, diameterPx: gc.diameterKm * scale, spanPx: gSpan,
          centrePx: along, crossPx: cross, depth: 2,
          belowFloor: gc.diameterKm * scale < DOT_THRESHOLD_PX, labelSide: 'end'
        });
        along += gSpan / 2;
      }
      cross += kSpan / 2;
      prevSpan = kSpan;
      // The far EDGE, not the centre: this is what the cross scroll clamps against, and a bound that
      // stopped at a centre would cut the last moon in half at the end of the travel.
      crossReach = Math.max(crossReach, cross);
    }

    cursor = centre + right;
    const next = roots[r + 1];
    if (next) cursor += gap(rootSpan, spanOf(next));
  }
  return { slots, lengthPx: cursor, axis: opts.axis, crossReachPx: crossReach };
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
