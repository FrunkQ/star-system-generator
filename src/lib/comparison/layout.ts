// src/lib/comparison/layout.ts
// THE SIZE-COMPARISON LAWS: what order the objects go in, how big each one draws, where the strip
// puts it, which one opens the view, and what the ruler marks. All pure, all testable, no three.js.
//
// TRUE SCALE IS A VIEW, NOT A DIAL. Every other surface in this app draws a body at its READABLE
// size — the span map in `rendering/scaleLaw.ts` (RENDER-S11/S41/S43), which deliberately compresses
// a range no screen can hold. This view exists to remove exactly that compression, so it binds none
// of it: a body's drawn radius here is its own `radiusKm` and nothing else. The scale law has no say
// in this file and this file has no say in the scale law.
//
// BUT THE SCALE IS NOT ONE NUMBER FOR THE WHOLE STRIP, AND THAT IS THE POINT OF THE VIEW.
// Owner, 2026-09-06: "as they move through the centre of the screen they are mid sized to the
// viewport - as you scroll it zooms in and out to maintain that as it goes allowing you to see
// relative sizes easily - at the moment they are stupid massive and hard to scroll past".
// One fixed pixels-per-km across a set spanning five orders of magnitude cannot work: pick a scale
// that shows Earth and the star is a wall you drag past for a minute; pick one that shows the star
// and every moon is a speck. So the scale FOLLOWS THE SCROLL (see `scaleForFocus`), and whatever is
// at the centre of the window always draws at the same share of it.
// WHAT IS PRESERVED, and it is the thing the view exists for: ONE scale serves the WHOLE frame, so
// everything on screen at any instant is at TRUE relative size to everything else on screen. What
// changes as you travel is only how much of the screen a kilometre buys. The comparison is local
// because a screen is local — Jupiter beside Earth at true scale is one of them off the edge, on
// any screen ever made.
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
  /**
   * A ring system's true inner and outer radii in km, when the body has one.
   *
   * THEY DO NOT CHANGE THE BODY'S SIZE and they never enter the ordering: this view compares GLOBES,
   * and a strip sorted by ring extent would put Saturn above Jupiter for having jewellery. What they
   * DO change is the room the body is given — Saturn's rings reach 140,180 km, so its ring is wider
   * than Jupiter is, and without the reservation it would be drawn straight through its neighbours.
   */
  ringInnerKm?: number;
  ringOuterKm?: number;
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

/**
 * THE SHARE OF THE SHORTER SIDE THE OBJECT AT THE CENTRE OF THE VIEW DRAWS AT — the one number the
 * whole view is steered by. The strip opens at it, the hand zoom moves it, and NOTHING ELSE DOES.
 *
 * **IT IS THE TUNING KNOB, AND THE OWNER ASKED FOR IT AS ONE, 2026-09-06:** *"i think we had perhaps
 * zoom out a bit - the idea is to show size comparison so the left/right planets of the current one
 * must be seen in full ... this is to let 4-6 bodies appear on screen at once ... have this as a
 * tunable parameter we may need to come back to it"*. WHAT IT MEANS IN BODIES: the window fits
 * roughly `windowAlong / (share x shorterSide x (1 + GAP_FRACTION))` of them, so on a stage 410 px
 * across 0.22 is a little over four — the one you are looking at, its neighbours either side in
 * FULL, and the edges of the next pair. Turn it DOWN to fit more in.
 *
 * THERE WAS A SECOND SHARE — a click used to re-zoom to 0.5, then 0.28 — and it is gone, because a
 * click is NAVIGATION and not a zoom. Owner, 2026-09-06: *"rather than be forced to scroll - or
 * mousewheel this means clicking centres and everything else around scales and packs accordingly"*.
 * Nothing is lost by dropping it: the share applies to whatever is at the FOCUS, so clicking a speck
 * at the edge of the strip still brings you all the way in to it — its own frame of reference — and
 * clicking a neighbour re-frames without undoing a zoom the reader had set for themselves.
 */
export const OPENING_SHARE = 0.22;
/** How far the hand zoom may take the centre share. A share is a share: these are the honest ends. */
export const MIN_CENTRE_SHARE = 0.05;
export const MAX_CENTRE_SHARE = 0.9;
/**
 * Gap between neighbours, as a fraction of the LARGER of the two — so a moon beside a giant is not
 * lost. Owner, 2026-09-06: *"have them very close"*, because the black between two worlds is the
 * one thing on this view that says nothing. It was 0.22, which spent a fifth of every step on
 * emptiness; the second knob to reach for after the shares.
 */
export const GAP_FRACTION = 0.06;
/**
 * How much of a ring system's TRUE reach the layout reserves as room, 0 to 1.
 *
 * Owner, 2026-09-06: *"(rings can overlap)"*, and that is a deliberate reversal. Reserving the full
 * reach is correct if a ring must never cross a neighbour — but Saturn's reach 140,180 km against a
 * globe of 58,232 means a ringed planet then claims two and a half times its own room, and on a
 * strip meant to hold four to six bodies it pushes two of them off the screen to hold empty space
 * for jewellery. A ring crossing its neighbour reads as depth; a missing neighbour reads as a fault.
 * At 0 a ring claims nothing beyond its globe. Turn it UP towards 1 to give the rings their room
 * back — the drawing is unchanged either way, since a ring is always drawn at its TRUE extent.
 */
export const RING_ROOM_FRACTION = 0;
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
 * The smallest radius a tap is tested against, whatever the object's drawn size.
 *
 * A dot is `DOT_PX` = 6 px across, so a 3 px target: smaller than a mouse is steady on and far
 * smaller than a finger. A pick radius is not a claim about size (RENDER-S43 again) - the object is
 * still DRAWN at the truth - it is the smallest thing a hand can be asked to hit.
 */
export const PICK_MIN_RADIUS_PX = 8;
/**
 * How much of a screenful one stepper press (or one arrow key) moves. Less than a whole screen on
 * purpose: an overlap carries a landmark across, so you can see WHERE you have got to. A full
 * screenful teleports you and a small nudge takes forever.
 */
export const STEP_FRACTION = 0.8;

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
 * Keep the hand zoom inside the honest ends of a share. UI-L7 says a bound taken from a constant is
 * a bound that is wrong for every map but the one it was tuned on - and that rule was about an
 * ABSOLUTE scale, which is exactly what this view no longer has. The zoom now sets how much of the
 * screen the thing in front of you fills, and "between a twentieth and nine tenths of it" means the
 * same thing on a map of moons and a map of giants. So these two ARE map-independent.
 */
export function clampCentreShare(share: number): number {
  if (!Number.isFinite(share)) return OPENING_SHARE;
  return Math.min(MAX_CENTRE_SHARE, Math.max(MIN_CENTRE_SHARE, share));
}

// --- THE FOCUS: what is in the middle, and therefore what the scale is ---------------------------
//
// The scroll position is no longer a number of pixels. It is a FRACTIONAL INDEX into the strip's own
// sequence — 3.0 is "the fourth object is in the middle", 3.5 is "halfway between the fourth and the
// fifth" — and everything else falls out of it: the scale, from the size at that point, and the
// pixel scroll, from where that point landed once the strip was laid out at that scale.
//
// WHY AN INDEX AND NOT A PIXEL. A pixel offset means nothing when the scale under it is moving: the
// same 4,000 px is half a star or four hundred moons. An index is the one coordinate that stays put
// while the zoom changes, so a drag is reversible, the ends are exactly 0 and n-1, and "how far
// through this map am I" has an answer. It is also what makes the strip cheap to travel — every
// object costs about one screenful of drag whatever its size, which is the "hard to scroll past"
// fault stated as a law.

/**
 * THE OBJECTS THE SCROLL TRAVELS THROUGH ARE THE STRIP ITSELF, IN ITS OWN ORDER — every object,
 * moons included, which is `sortItems` for every order (`orbit` gives the tree's reading order, and
 * `layoutOrbit` lays its slots out in exactly that sequence).
 *
 * A first cut travelled the ORBIT layout by its COLUMNS only, so a moon could be clicked but never
 * became the focus. The owner corrected it the same day: *"Same for moons if you zoom down to them -
 * their frame of reference is themselves so you will see the vast size of your host"*. That is the
 * whole feature said in one line — the camera re-frames on WHATEVER it lands on, and a moon at the
 * centre means its planet fills the sky behind it, which is the true and rather good answer to "how
 * big is Io next to Jupiter".
 *
 * Where in the sequence an object is, or -1. The one place an id becomes a focus.
 */
export function focusIndexOf(seq: ComparisonItem[], id: string | null | undefined): number {
  return id ? seq.findIndex((i) => i.id === id) : -1;
}

/** Keep the focus on the strip. An empty strip focuses 0; a NaN would take the scale with it. */
export function clampFocus(f: number, count: number): number {
  if (!Number.isFinite(f) || count <= 1) return 0;
  return Math.min(count - 1, Math.max(0, f));
}

/**
 * The diameter AT the focus, interpolated GEOMETRICALLY between the two objects it lies between.
 *
 * Geometric rather than arithmetic because size here is a RATIO quantity: halfway between Earth and
 * Jupiter is eleven-to-one on both sides (3.3 Earths), where the arithmetic mean is six Earths and
 * sits visually right beside Jupiter. Arithmetic interpolation makes the zoom lurch — it holds still
 * while you cross the big object and then rushes — and it is the same log-space argument the unit
 * ladder already makes in `groupRefValue`.
 */
export function focusDiameterKm(seq: ComparisonItem[], f: number): number {
  if (!seq.length) return 0;
  const i = Math.max(0, Math.min(seq.length - 1, Math.floor(f)));
  const j = Math.min(seq.length - 1, i + 1);
  const t = Math.max(0, Math.min(1, f - i));
  const a = seq[i].diameterKm, b = seq[j].diameterKm;
  // EXACT at the stops. `exp(log(a))` is a. plus four parts in a quadrillion, which is nothing to
  // look at and everything to a gate: a click lands the focus exactly on an object, and "the thing
  // you clicked fills half the screen" should be true to the digit rather than to a rounding.
  if (t <= 0) return a > 0 ? a : (b > 0 ? b : 0);
  if (t >= 1) return b > 0 ? b : (a > 0 ? a : 0);
  if (!(a > 0) || !(b > 0)) return Math.max(a > 0 ? a : 0, b > 0 ? b : 0);
  return Math.exp(Math.log(a) * (1 - t) + Math.log(b) * t);
}

/**
 * THE SCALE, and the whole law is this one line: pixels per km such that whatever is at the focus
 * fills `share` of the shorter side. Everything else on screen then draws in true proportion to it.
 */
export function scaleForFocus(seq: ComparisonItem[], f: number, shorterSidePx: number, share: number): number {
  return pxPerKm(focusDiameterKm(seq, f), shorterSidePx, share);
}

/** Every slot by id — the layout is a list, and two of the focus laws want it as a lookup. */
function slotMap(layout: StripLayout): Map<string, LayoutSlot> {
  return new Map(layout.slots.map((s) => [s.id, s]));
}

/**
 * Where the focus sits ALONG the laid-out strip, in px from its start. Interpolated between the two
 * objects' centres, so the picture slides rather than snapping from one object to the next.
 */
export function focusCentrePx(layout: StripLayout, seq: ComparisonItem[], f: number): number {
  if (!seq.length) return 0;
  const by = slotMap(layout);
  const at = (i: number) => by.get(seq[Math.max(0, Math.min(seq.length - 1, i))].id)?.centrePx ?? 0;
  const i = Math.max(0, Math.min(seq.length - 1, Math.floor(f)));
  const t = Math.max(0, Math.min(1, f - i));
  return at(i) * (1 - t) + at(i + 1) * t;
}

/**
 * Where the focus sits ACROSS the strip. Zero for every flat order — only the ORBIT layout stacks
 * anything off the centreline — but it is derived from the focus exactly as the along axis is, so
 * scrolling onto a moon brings its ROW to the middle as well as its column. Two axes with one
 * source; the alternative (a free cross-drag beside a derived along-scroll) is two owners of where
 * the picture is, and they disagree the moment either moves.
 */
export function focusCrossPx(layout: StripLayout, seq: ComparisonItem[], f: number): number {
  if (!seq.length) return 0;
  const by = slotMap(layout);
  const at = (i: number) => by.get(seq[Math.max(0, Math.min(seq.length - 1, i))].id)?.crossPx ?? 0;
  const i = Math.max(0, Math.min(seq.length - 1, Math.floor(f)));
  const t = Math.max(0, Math.min(1, f - i));
  return at(i) * (1 - t) + at(i + 1) * t;
}

/**
 * THE DRAG'S EXCHANGE RATE: how many pixels of picture one whole step of focus is worth, here.
 *
 * Taken ONCE at the start of a gesture and held for its duration, so the drag is reversible — the
 * rate itself changes as you travel (that IS the zoom), and recomputing it mid-gesture would mean
 * dragging back the same distance did not put you where you started.
 *
 * MEASURED ACROSS BOTH AXES, and that is not a nicety: in the orbit layout a planet and its first
 * moon share a `centrePx` exactly and differ only in `crossPx`, so an along-only rate is ZERO there
 * and the drag divides by nothing. The floor of 1 px is the second guard on the same thing.
 */
export function focusStepPx(layout: StripLayout, seq: ComparisonItem[], f: number): number {
  if (seq.length < 2) return 0;
  const i = Math.max(0, Math.min(seq.length - 2, Math.floor(f)));
  const by = slotMap(layout);
  const a = by.get(seq[i].id), b = by.get(seq[i + 1].id);
  return Math.max(1, Math.hypot((b?.centrePx ?? 0) - (a?.centrePx ?? 0), (b?.crossPx ?? 0) - (a?.crossPx ?? 0)));
}

// `clampScroll` USED TO LIVE HERE, beside `scrollForZoom`, and has gone the same way. It kept a
// PIXEL scroll inside the strip, on both axes. Neither axis is scrolled directly any more: both are
// derived from the focus, and both must be free to run past the ends, because "the focused object
// sits in the MIDDLE of the window" is the law and the first and last objects are entitled to the
// middle as much as any other. A clamp would pin them to an edge. `clampFocus` is the bound now,
// and it bounds the one thing that is actually held.

// `scrollForZoom` USED TO LIVE HERE and is deliberately gone rather than kept beside its replacement.
// It held a chosen point of the WINDOW still while the scale changed — the right law when the scroll
// was a pixel offset and the zoom was a free dial. Under the focus law the zoom is anchored by
// construction: the focused object is at the centre before and after, because the centre is what
// the scale is derived FROM. A pinch therefore holds the middle, not the point between the fingers,
// and that is the honest behaviour rather than a simplification — anchoring elsewhere would have to
// move the focus, i.e. change what you are looking at because you zoomed.

/**
 * How big a slot DRAWS and how much room it RESERVES, which are two different questions the moment a
 * planet has rings. `diameterPx` is the body and is what the whole view is about; `reachPx` is what
 * the spacing must respect. Saturn's rings reach 140,180 km — wider than Jupiter is — so a strip
 * that spaced by the globe alone would draw them straight through its neighbours.
 *
 * One measurer, used by the flat strip AND by the tree, or the two disagree about a ringed planet.
 */
export function measureSlot(it: ComparisonItem, scale: number): {
  diameterPx: number; spanPx: number; reachPx: number; ringInnerPx: number; ringOuterPx: number; belowFloor: boolean;
} {
  const diameterPx = it.diameterKm * scale;
  const belowFloor = diameterPx < DOT_THRESHOLD_PX;
  const spanPx = belowFloor ? DOT_PX : diameterPx;
  const ringOuterPx = (it.ringOuterKm ?? 0) * scale;
  const ringInnerPx = (it.ringInnerKm ?? 0) * scale;
  // A ring narrower than the pixel floor is not drawn at all rather than floored: a floor exists to
  // keep a BODY findable, and an inflated ring would be a false statement about how far it reaches.
  const ringed = ringOuterPx > ringInnerPx && ringOuterPx * 2 >= DOT_THRESHOLD_PX;
  return {
    diameterPx, spanPx,
    reachPx: Math.max(spanPx, ringed ? ringOuterPx * 2 * RING_ROOM_FRACTION : 0),
    ringInnerPx: ringed ? ringInnerPx : 0,
    ringOuterPx: ringed ? ringOuterPx : 0,
    belowFloor
  };
}

// --- The strip -----------------------------------------------------------------------------------

export interface LayoutSlot {
  id: string;
  name: string;
  /** The TRUE drawn diameter in px. Never floored, never inflated — this is the measurement. */
  diameterPx: number;
  /** The span the slot RESERVES: the same number, unless the object is below the floor and draws as a dot. */
  spanPx: number;
  /**
   * The span the LAYOUT reserves — the body's own, or its rings' if they are wider. Spacing reads
   * this; the size comparison itself reads `diameterPx`. Keeping them apart is what lets a ringed
   * planet have room without claiming to be bigger than it is.
   */
  reachPx: number;
  /** The ring's drawn radii in px, or 0 for a body with none. Flat-shaded, at TRUE extent. */
  ringInnerPx: number;
  ringOuterPx: number;
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
    const m = measureSlot(it, scale);
    // A big body's label has room of its own; a small one's would sit on its neighbour's, so from
    // there down the labels alternate sides — the poster's Titania/Rhea rows.
    let labelSide: 'start' | 'end' = 'start';
    if (m.spanPx < LABEL_ALTERNATE_BELOW_PX) {
      labelSide = alternate;
      alternate = alternate === 'start' ? 'end' : 'start';
    }
    // The body sits at the CENTRE of the room it reserves, so its rings reach equally either side.
    slots.push({ id: it.id, name: it.name, ...m, centrePx: cursor + m.reachPx / 2, crossPx: 0, depth: 0, labelSide });
    cursor += m.reachPx;
    const next = sorted[i + 1];
    if (next) cursor += gapFraction * Math.max(m.reachPx, measureSlot(next, scale).reachPx);
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
  // SPACING reads a body's REACH — its rings, where it has them, since they are wider than it is —
  // while the drawn size stays the globe's. Same distinction the flat strip makes, same measurer.
  const measure = (it: ComparisonItem) => measureSlot(it, scale);
  const spanOf = (it: ComparisonItem) => measure(it).reachPx;
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
      id: root.id, name: root.name, ...measure(root),
      centrePx: centre, crossPx: 0, depth: 0, labelSide: 'start'
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
        id: kid.id, name: kid.name, ...measure(kid),
        centrePx: centre, crossPx: cross, depth: 1, labelSide: 'end'
      });
      let along = centre + kSpan / 2;
      for (const gc of childrenOf(kid.id)) {
        const gSpan = spanOf(gc);
        along += gap(kSpan, gSpan) + gSpan / 2;
        slots.push({
          id: gc.id, name: gc.name, ...measure(gc),
          centrePx: along, crossPx: cross, depth: 2, labelSide: 'end'
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
 * WHAT IS UNDER A POINT, tested against the LAYOUT rather than against anything on screen.
 *
 * `alongPx` is measured from the strip's start (so a pointer's offset plus the scroll) and
 * `crossPx` from the centreline. Both are the same coordinates the slots carry, which is the whole
 * reason this can be a pure function: the picture is derived from the layout, so the pick reads the
 * layout and cannot drift from what was drawn - through a filter's warp, a device pixel ratio, or a
 * canvas the DOM knows nothing about.
 *
 * THE SMALLEST CANDIDATE WINS, and that is the rule a reader means. At true scale a giant's disc
 * covers the whole window, so a tap on a moon in front of it is inside BOTH; the moon is what the
 * hand was pointing at. Distance breaks a tie between two of the same size.
 */
export function slotAt(
  layout: StripLayout, alongPx: number, crossPx: number, minRadiusPx = PICK_MIN_RADIUS_PX
): LayoutSlot | null {
  let best: LayoutSlot | null = null;
  let bestR = Infinity, bestD = Infinity;
  for (const s of layout.slots) {
    const r = Math.max(s.spanPx / 2, minRadiusPx);
    const dx = alongPx - s.centrePx, dy = crossPx - s.crossPx;
    const d = Math.hypot(dx, dy);
    if (d > r) continue;
    if (r < bestR || (r === bestR && d < bestD)) { best = s; bestR = r; bestD = d; }
  }
  return best;
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
