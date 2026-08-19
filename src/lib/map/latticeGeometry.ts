// THE lattice geometry — square and hex — in MAP space, shared by every view that draws one.
//
// One generator, because the alternative is what A34 found with the construct icons: four copies of a
// shape vocabulary, agreeing by luck until one of them quietly did not. The 3D starmap scene
// (starmapScene.renderMapGrid), the 2D starmap view and the SYSTEM view's ground plate
// (holo/scene.ts) all consume this, so a GM switching between them sees the SAME lattice rather
// than implementations that happen to line up. There is exactly one hex convention here and it is
// FLAT-TOPPED; the system view's pointy-topped copy was deleted when this landed, unreachable and
// already wrong.
//
// Coordinates are the MAP's own, and the caller applies its own transform — the 3D scene multiplies by
// its fit (scene = (map - centre) * k), the 2D view by its pan/zoom. Nothing here knows about either.
//
// The hex lattice is FLAT-TOPPED and reproduces Grid.svelte's geometry exactly, so a system snapped to
// the GM's hex lands dead-centre in the player's: size = cell/2, columns at 1.5*size, rows at
// sqrt(3)*size with odd columns offset half a row.
import type { MapOverlay } from './mapOverlay';

/** A line segment in map space. */
export type LatticeEdge = [x1: number, y1: number, x2: number, y2: number];

export interface LatticeOpts {
  /** Cell size in map units (the GM's snap-grid cell). */
  cell: number;
  /** Map-space position of the lattice origin — the GM's (0,0). */
  originX: number;
  originY: number;
  /** Half-extent to fill, in map units, about the patch CENTRE (`centreX`/`centreY`, default (0,0)). */
  half: number;
  /**
   * The centre of the filled extent. Default (0,0) — the whole field, as every starmap draws it. The
   * system view's auto grid passes the point the camera is looking at, so its lines exist only in a
   * patch about the view rather than in bands about the star (A55: zoomed in anywhere off-centre,
   * an origin-centred lattice is two dense bands crossing at the star, each line the width of the
   * plate). The lattice ORIGIN (`originX`/`originY`) is the grid's phase and is unchanged by this;
   * `clipRadius` still clips to the disc about (0,0).
   */
  centreX?: number;
  centreY?: number;
  /**
   * Longest segment to emit, in map units. Callers that FADE PER VERTEX must set this, because a fade
   * evaluated at the ends of a full-width line judges the whole line by its far ends — which is
   * exactly why the 3D square grid drew nothing at all (inbox A37): every line spanned the lattice, so
   * both of its endpoints sat outside the fade radius and every single one was culled. The hex path
   * never hit it because its edges are one hex wide. Leave undefined for an unfaded consumer.
   */
  maxSegment?: number;
  /** Hard cap on rows/columns, so a tiny cell on a huge map cannot spawn unbounded geometry. */
  maxLines?: number;
  /**
   * Clip the lattice to a DISC of this radius about the origin rather than filling the square extent.
   * The system view's ground grid is a disc — it reads as a plate under the orrery — while a starmap
   * lattice fills its field. Same geometry, different boundary, so it is an option rather than a
   * second generator.
   */
  clipRadius?: number;
}

const DEFAULT_MAX_LINES = 400;

/** Split a long axis-aligned run into segments no longer than `maxSegment`. */
function runSegments(fixed: number, from: number, to: number, horizontal: boolean, maxSegment?: number): LatticeEdge[] {
  if (!maxSegment || maxSegment <= 0 || to - from <= maxSegment) {
    return [horizontal ? [from, fixed, to, fixed] : [fixed, from, fixed, to]];
  }
  const out: LatticeEdge[] = [];
  const steps = Math.ceil((to - from) / maxSegment);
  for (let i = 0; i < steps; i++) {
    const a = from + (i * (to - from)) / steps;
    const b = from + ((i + 1) * (to - from)) / steps;
    out.push(horizontal ? [a, fixed, b, fixed] : [fixed, a, fixed, b]);
  }
  return out;
}

export function squareLattice(o: LatticeOpts): LatticeEdge[] {
  const { cell, originX, originY, half } = o;
  if (!(cell > 0) || !(half > 0)) return [];
  const cx = o.centreX ?? 0, cy = o.centreY ?? 0;
  const cap = o.maxLines ?? DEFAULT_MAX_LINES;
  const edges: LatticeEdge[] = [];
  const R = o.clipRadius;
  // A clipped line runs only as far as the disc allows at its own offset — the same chord the system
  // view has always drawn (half = sqrt(R^2 - c^2)) — and never past the patch about the centre.
  const run = (c: number, lo: number, hi: number): [number, number] | null => {
    let a = lo, b = hi;
    if (R) { const h = Math.sqrt(Math.max(0, R * R - c * c)); if (!(h > 0)) return null; a = Math.max(a, -h); b = Math.min(b, h); }
    return b - a > 1e-9 ? [a, b] : null;
  };
  const nx0 = Math.ceil((cx - half - originX) / cell), nx1 = Math.floor((cx + half - originX) / cell);
  const ny0 = Math.ceil((cy - half - originY) / cell), ny1 = Math.floor((cy + half - originY) / cell);
  // A cap trims the FAR edges of the patch, not one side: centre the kept range on the view.
  const range = (n0: number, n1: number): [number, number] => { if (n1 - n0 + 1 <= cap) return [n0, n1]; const mid = Math.round((n0 + n1) / 2); return [mid - Math.floor(cap / 2), mid + Math.floor(cap / 2)]; };
  const [xa, xb] = range(nx0, nx1), [ya, yb] = range(ny0, ny1);
  for (let n = xa; n <= xb; n++) {
    const x = originX + n * cell;
    const r = run(x, cy - half, cy + half);
    if (!r) continue;
    edges.push(...runSegments(x, r[0], r[1], false, o.maxSegment));
  }
  for (let n = ya; n <= yb; n++) {
    const y = originY + n * cell;
    const r = run(y, cx - half, cx + half);
    if (!r) continue;
    edges.push(...runSegments(y, r[0], r[1], true, o.maxSegment));
  }
  return edges;
}

/** Centres of the flat-topped hex lattice, in map space. Shared by the edge builder and any labeller. */
export function hexCentres(o: LatticeOpts): { col: number; row: number; x: number; y: number }[] {
  const { cell, originX, originY, half } = o;
  const size = cell / 2;
  if (!(size > 0) || !(half > 0)) return [];
  const hd = 1.5 * size, hh = Math.sqrt(3) * size;
  const cx = o.centreX ?? 0, cy = o.centreY ?? 0;
  const cap = o.maxLines ?? DEFAULT_MAX_LINES;
  const out: { col: number; row: number; x: number; y: number }[] = [];
  const colLo = Math.floor((cx - half - originX) / hd) - 1, colHi = Math.ceil((cx + half - originX) / hd) + 1;
  const rowLo = Math.floor((cy - half - originY) / hh) - 1, rowHi = Math.ceil((cy + half - originY) / hh) + 1;
  for (let col = Math.max(colLo, colHi - cap); col <= colHi; col++) {
    const x = originX + col * hd;
    const yBase = originY + (Math.abs(col) % 2) * (hh / 2);
    for (let row = Math.max(rowLo, rowHi - cap); row <= rowHi; row++) {
      const y = yBase + row * hh;
      // Inside the patch about the centre (with a hex of slack), and inside the disc when clipped.
      if (Math.abs(x - cx) > half + size || Math.abs(y - cy) > half + hh) continue;
      if (o.clipRadius && Math.hypot(x, y) > o.clipRadius + size) continue;
      out.push({ col, row, x, y });
    }
  }
  return out;
}

export function hexLattice(o: LatticeOpts): LatticeEdge[] {
  const size = o.cell / 2;
  const hh = Math.sqrt(3) * size;
  // Flat-top vertices about a centre: R, top-R, top-L, L, bottom-L, bottom-R.
  const V: [number, number][] = [
    [size, 0], [size / 2, hh / 2], [-size / 2, hh / 2], [-size, 0], [-size / 2, -hh / 2], [size / 2, -hh / 2]
  ];
  const edges: LatticeEdge[] = [];
  for (const c of hexCentres(o)) {
    for (let i = 0; i < 6; i++) {
      const a = V[i], b = V[(i + 1) % 6];
      edges.push([c.x + a[0], c.y + a[1], c.x + b[0], c.y + b[1]]);
    }
  }
  return edges;
}

/** The lattice for any overlay type. Polar and "off" have no lattice and return nothing. */
export function latticeFor(type: MapOverlay, o: LatticeOpts): LatticeEdge[] {
  if (type === 'square') return squareLattice(o);
  if (type === 'hex' || type === 'subsector-hex' || type === 'traveller-hex') return hexLattice(o);
  return [];
}

/** The Traveller CCRR address for a hex, wrapping at the 32x40 sector — Grid.svelte's numbering. */
export function travellerHexLabel(col: number, row: number): string {
  let dCol = (col + 1) % 32;
  if (dCol <= 0) dCol += 32;
  let dRow = (row + 1) % 40;
  if (dRow <= 0) dRow += 40;
  return String(dCol).padStart(2, '0') + String(dRow).padStart(2, '0');
}

// --- TRAVELLER SUBSECTOR BOUNDARIES -------------------------------------------------------------
// What makes a Traveller hex map READ as one rather than as a plain hex field: the 8x10 subsector
// grid, drawn heavier than the hexes themselves. Same rule as Grid.svelte (`absCol % 8`,
// `absRow % 10`) and the same flat-topped geometry, so the GM's 2D map and both starmaps agree.
//
// The vertical boundary follows the ZIG-ZAG right-hand side of the last column in a subsector — a
// hex lattice has no straight vertical line, and drawing one is the giveaway that a map was made by
// somebody who had not looked at a Traveller sector.
export function subsectorLattice(o: LatticeOpts): LatticeEdge[] {
  const size = o.cell / 2;
  const hh = Math.sqrt(3) * size;
  const edges: LatticeEdge[] = [];
  for (const c of hexCentres(o)) {
    // 1-based column/row, matching the CCRR address the labels use.
    const absCol = c.col + 1, absRow = c.row + 1;

    // VERTICAL boundary, right of columns 8, 16, ... — the zig-zag down a flat-topped hex's right side.
    if (absCol % 8 === 0) {
      edges.push([c.x + size / 2, c.y - hh / 2, c.x + size, c.y]);
      edges.push([c.x + size, c.y, c.x + size / 2, c.y + hh / 2]);
    }

    // HORIZONTAL boundary, below rows 10, 20, ... — the flat bottom of the hex, PLUS a bridge to the
    // next column. The bridge is the part that matters and the part it is easy to leave out: without
    // it the boundary is a row of disconnected dashes rather than one continuous line across the map.
    // Adjacent columns are offset half a hex, so the bridge climbs or drops depending on parity —
    // an even column's neighbour sits LOWER, an odd column's sits higher. Grid.svelte's rule exactly.
    if (absRow % 10 === 0) {
      edges.push([c.x + size / 2, c.y + hh / 2, c.x - size / 2, c.y + hh / 2]);
      edges.push(Math.abs(c.col) % 2 === 0
        ? [c.x + size / 2, c.y + hh / 2, c.x + size, c.y + hh]   // down-right to the lower neighbour
        : [c.x + size / 2, c.y + hh / 2, c.x + size, c.y]);      // up-right to the higher one
    }
  }
  return edges;
}
