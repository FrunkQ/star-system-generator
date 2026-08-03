// THE lattice geometry — square and hex — in MAP space, shared by every view that draws one.
//
// One generator, because the alternative is what A34 found with the construct icons: four copies of a
// shape vocabulary, agreeing by luck until one of them quietly did not. The 3D starmap scene
// (starmapScene.renderMapGrid) and the 2D starmap view both consume this, so a GM switching between
// them sees the SAME lattice rather than two implementations that happen to line up.
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
  /** Half-extent to fill, in map units, about (0,0). */
  half: number;
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
  const cap = o.maxLines ?? DEFAULT_MAX_LINES;
  const edges: LatticeEdge[] = [];
  const nx0 = Math.ceil((-half - originX) / cell), nx1 = Math.floor((half - originX) / cell);
  const ny0 = Math.ceil((-half - originY) / cell), ny1 = Math.floor((half - originY) / cell);
  for (let n = nx0; n <= Math.min(nx1, nx0 + cap); n++) {
    edges.push(...runSegments(originX + n * cell, -half, half, false, o.maxSegment));
  }
  for (let n = ny0; n <= Math.min(ny1, ny0 + cap); n++) {
    edges.push(...runSegments(originY + n * cell, -half, half, true, o.maxSegment));
  }
  return edges;
}

/** Centres of the flat-topped hex lattice, in map space. Shared by the edge builder and any labeller. */
export function hexCentres(o: LatticeOpts): { col: number; row: number; x: number; y: number }[] {
  const { cell, originX, originY, half } = o;
  const size = cell / 2;
  if (!(size > 0) || !(half > 0)) return [];
  const hd = 1.5 * size, hh = Math.sqrt(3) * size;
  const cap = o.maxLines ?? DEFAULT_MAX_LINES;
  const out: { col: number; row: number; x: number; y: number }[] = [];
  const colLo = Math.floor((-half - originX) / hd) - 1, colHi = Math.ceil((half - originX) / hd) + 1;
  const rowLo = Math.floor((-half - originY) / hh) - 1, rowHi = Math.ceil((half - originY) / hh) + 1;
  for (let col = Math.max(colLo, colHi - cap); col <= colHi; col++) {
    const x = originX + col * hd;
    const yBase = originY + (Math.abs(col) % 2) * (hh / 2);
    for (let row = Math.max(rowLo, rowHi - cap); row <= rowHi; row++) {
      const y = yBase + row * hh;
      if (Math.abs(x) > half + size || Math.abs(y) > half + hh) continue;
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
  if (type === 'hex' || type === 'traveller-hex') return hexLattice(o);
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
    if (absCol % 8 === 0) {
      edges.push([c.x + size / 2, c.y - hh / 2, c.x + size, c.y]);
      edges.push([c.x + size, c.y, c.x + size / 2, c.y + hh / 2]);
    }
    if (absRow % 10 === 0) {
      edges.push([c.x + size / 2, c.y + hh / 2, c.x - size / 2, c.y + hh / 2]);
    }
  }
  return edges;
}
