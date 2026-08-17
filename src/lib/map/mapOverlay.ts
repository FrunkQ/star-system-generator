// WS3 — THE overlay/grid vocabulary, shared by every spatial view: the 2D system orrery, the 3D holo
// system, the 2D starmap and the 3D starmap. Before this, two disjoint enums existed — a decorative
// 3D `GridMode` ('off'|'plain'|'scaled'|'hex') and the 2D SVG snap-grid `GridType`
// ('grid'|'hex'|'none', with 'traveller-hex' implemented but never offered) — so no view could show
// the full set and Traveller hex was locked behind Traveller *mode*.
//
// The four legacy 3D values are kept VERBATIM as the canonical spelling. Renaming them would have
// invalidated the `grid` field of every preset already saved in a campaign (production ships them), for
// no functional gain; extending the set costs nothing and keeps old presets loading untouched.

export type MapOverlay =
  | 'off'            // no overlay
  | 'plain'          // polar rings + spokes (decorative)
  | 'scaled'         // polar rings labelled with real distances
  | 'hex'            // hex lattice
  | 'square'         // square lattice
  | 'subsector-hex'   // hex lattice + the 8x10 subsector boundaries, NO hex numbering
  | 'traveller-hex'; // the same, plus the Traveller CCRR hex numbering

export interface MapOverlayOption { value: MapOverlay; label: string }

// The one dropdown list — every view's overlay picker renders THIS, so they can never drift apart.
export const MAP_OVERLAY_OPTIONS: MapOverlayOption[] = [
  { value: 'off',           label: 'None' },
  { value: 'square',        label: 'Square' },
  { value: 'hex',           label: 'Hex' },
  { value: 'subsector-hex', label: 'Subsector hex' },
  { value: 'traveller-hex', label: 'Traveller hex' },
  { value: 'plain',         label: 'Polar' },
  { value: 'scaled',        label: 'Polar + scale' }
];

// HEXES ARE A STARMAP IDEA (Alex 2026-07-29): a hex/Traveller lattice addresses interstellar space —
// one hex is a jump, and the Traveller numbering is sector/subsector addressing. Inside a single system
// the meaningful overlays are a square grid or polar distance rings, so the system views offer those
// only. Same vocabulary, filtered per scale — not a second enum.
// A45 — THE GM'S 2D SNAP GRID draws a subset of the vocabulary: lattices only, no polar. `Grid.svelte`
// is an SVG renderer with no concept of distance rings, so it is typed to what it can actually draw
// rather than to the whole set, and a value it cannot honour is a type error rather than a silent
// no-op. Same list, narrowed — never a second union. `subsector-hex` belongs here: the borders are
// pure lattice geometry and the numbering is what makes the Traveller variant different.
// A45 — THE PLAYER BROADCAST still speaks the LEGACY spellings, and deliberately so. `mapGrid.type`
// crosses the wire to player windows and VTT shims that are already running older builds, and the
// receiving end only ever tests it for "is there a grid at all" (`!== 'none'`). Renaming it would be a
// protocol change for no gain. So the app has ONE internal vocabulary and this is the single place it
// is translated on the way out — an adapter with a name, not a second enum with a life of its own.
export type LegacyMapGridType = 'grid' | 'hex' | 'traveller-hex' | 'none';
export function toLegacyMapGridType(v: MapOverlay): LegacyMapGridType {
  if (v === 'square') return 'grid';
  if (v === 'hex') return 'hex';
  // A subsector lattice IS a hex lattice to a receiver that only draws hexes at the GM's cell size.
  if (isHexFamily(v)) return v === 'traveller-hex' ? 'traveller-hex' : 'hex';
  return 'none';
}

export type SnapGridType = Extract<MapOverlay, 'off' | 'square' | 'hex' | 'subsector-hex' | 'traveller-hex'>;
const SNAP_GRID_SET: SnapGridType[] = ['off', 'square', 'hex', 'subsector-hex', 'traveller-hex'];
export const SNAP_GRID_OPTIONS: MapOverlayOption[] =
  MAP_OVERLAY_OPTIONS.filter((o) => (SNAP_GRID_SET as MapOverlay[]).includes(o.value));
export function isSnapGridType(v: unknown): v is SnapGridType {
  return (SNAP_GRID_SET as unknown[]).includes(v);
}

export const SYSTEM_OVERLAY_OPTIONS: MapOverlayOption[] =
  MAP_OVERLAY_OPTIONS.filter((o) => !isHexFamily(o.value));

// A stored system-scale overlay that predates the above (or a preset shared from a starmap) can still
// say 'hex' — fold it to the nearest system-meaningful lattice rather than rendering a stray hex grid.
export function forSystemScale(v: MapOverlay): MapOverlay {
  return isHexFamily(v) ? 'square' : v;
}

const ALL: MapOverlay[] = ['off', 'plain', 'scaled', 'hex', 'square', 'subsector-hex', 'traveller-hex'];

// Every overlay built on the hex lattice — three of them now, so the membership test has a NAME
// rather than being spelled out at each site and forgotten at one of them.
export function isHexFamily(v: MapOverlay): boolean {
  return v === 'hex' || v === 'subsector-hex' || v === 'traveller-hex';
}

// Does this overlay draw the 8x10 SUBSECTOR boundaries? Both Traveller variants do; they differ
// only in whether the hexes are NUMBERED. The borders are what make a map read as sectored; the
// numbers are an addressing scheme, and plenty of tables want the first without the second.
export function hasSubsectors(v: MapOverlay): boolean {
  return v === 'subsector-hex' || v === 'traveller-hex';
}

// Accepts anything that has ever been persisted (including the 2D snap-grid's 'grid'/'none' spellings)
// and returns a canonical value, so a view never has to guess what it was handed.
export function normaliseOverlay(v: unknown): MapOverlay {
  const s = String(v ?? '').trim();
  if (ALL.includes(s as MapOverlay)) return s as MapOverlay;
  if (s === 'none') return 'off';       // 2D snap-grid spelling
  if (s === 'grid') return 'square';    // 2D snap-grid spelling
  if (s === 'travellerHex') return 'traveller-hex';
  return 'off';
}

// Lattice overlays tile the plane; polar overlays ring the origin. Views that can only do one family
// (or want to treat Traveller hex as a plain hex lattice, e.g. 3D) branch on these.
export function isLattice(v: MapOverlay): boolean {
  return v === 'square' || isHexFamily(v);
}
export function isPolar(v: MapOverlay): boolean {
  return v === 'plain' || v === 'scaled';
}
