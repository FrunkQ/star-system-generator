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
  | 'traveller-hex'; // hex lattice + Traveller CCRR numbering / subsector lines (2D; 3D draws the lattice)

export interface MapOverlayOption { value: MapOverlay; label: string }

// The one dropdown list — every view's overlay picker renders THIS, so they can never drift apart.
export const MAP_OVERLAY_OPTIONS: MapOverlayOption[] = [
  { value: 'off',           label: 'None' },
  { value: 'square',        label: 'Square' },
  { value: 'hex',           label: 'Hex' },
  { value: 'traveller-hex', label: 'Traveller hex' },
  { value: 'plain',         label: 'Polar' },
  { value: 'scaled',        label: 'Polar + scale' }
];

// HEXES ARE A STARMAP IDEA (Alex 2026-07-29): a hex/Traveller lattice addresses interstellar space —
// one hex is a jump, and the Traveller numbering is sector/subsector addressing. Inside a single system
// the meaningful overlays are a square grid or polar distance rings, so the system views offer those
// only. Same vocabulary, filtered per scale — not a second enum.
export const SYSTEM_OVERLAY_OPTIONS: MapOverlayOption[] =
  MAP_OVERLAY_OPTIONS.filter((o) => o.value !== 'hex' && o.value !== 'traveller-hex');

// A stored system-scale overlay that predates the above (or a preset shared from a starmap) can still
// say 'hex' — fold it to the nearest system-meaningful lattice rather than rendering a stray hex grid.
export function forSystemScale(v: MapOverlay): MapOverlay {
  return v === 'hex' || v === 'traveller-hex' ? 'square' : v;
}

const ALL: MapOverlay[] = ['off', 'plain', 'scaled', 'hex', 'square', 'traveller-hex'];

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
  return v === 'square' || v === 'hex' || v === 'traveller-hex';
}
export function isPolar(v: MapOverlay): boolean {
  return v === 'plain' || v === 'scaled';
}
