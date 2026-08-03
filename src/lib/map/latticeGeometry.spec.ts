// A37: the square lattice drew NOTHING on the 3D starmap, and the cause is arithmetic rather than a
// missing branch — which means it can be PROVED here rather than looked at.
import { describe, it, expect } from 'vitest';
import { squareLattice, hexLattice, latticeFor, travellerHexLabel, subsectorLattice, hexCentres } from './latticeGeometry';

// The 3D scene's real numbers: GRID_RADIUS 12, half = 12*2.4, fade from 12*0.75 out to 12*1.9.
const HALF = 12 * 2.4;
const FADE_TO = 12 * 1.9;
const opts = { cell: 2, originX: 0, originY: 0, half: HALF };

// `addLattice` drops a segment whose BOTH ends have faded out.
const survives = (e: readonly number[]) =>
  Math.hypot(e[0], e[1]) <= FADE_TO || Math.hypot(e[2], e[3]) <= FADE_TO;

describe('lattice geometry', () => {
  it('emits both lattices, and nothing for the polar overlays', () => {
    expect(squareLattice(opts).length).toBeGreaterThan(10);
    expect(hexLattice(opts).length).toBeGreaterThan(10);
    expect(latticeFor('square', opts).length).toBe(squareLattice(opts).length);
    expect(latticeFor('off', opts)).toEqual([]);
    expect(latticeFor('plain', opts)).toEqual([]);
    expect(latticeFor('scaled', opts)).toEqual([]);
  });

  // THE BUG, stated as a test. An unsegmented square line spans the whole lattice, so both of its
  // endpoints sit beyond the fade radius and every single line is culled — while hex edges, being one
  // hex wide, always have an endpoint near their own centre. Segmenting is what makes the two behave
  // alike, and this asserts the difference rather than trusting it.
  it('is entirely culled by a per-vertex fade when NOT segmented', () => {
    const raw = squareLattice(opts);
    expect(raw.length).toBeGreaterThan(0);
    expect(raw.filter(survives).length, 'unsegmented square lines all fade out — this is the fault A37 reported').toBe(0);
  });

  it('survives the same fade once segmented', () => {
    const seg = squareLattice({ ...opts, maxSegment: 2 });
    expect(seg.filter(survives).length, 'segmented square lines must reach the visible zone').toBeGreaterThan(20);
  });

  it('leaves the hex lattice unaffected either way', () => {
    expect(hexLattice(opts).filter(survives).length, 'hex edges were always short enough to survive').toBeGreaterThan(20);
  });

  // 2D/3D PARITY. Both views call this one generator, so identical inputs must give identical output —
  // the point of doing the vocabulary first is that 2D became a consumer rather than a second copy.
  it('gives byte-identical geometry for identical inputs', () => {
    for (const type of ['square', 'hex', 'traveller-hex'] as const) {
      const a = latticeFor(type, { cell: 50, originX: 12, originY: -7, half: 500, maxSegment: 50 });
      const b = latticeFor(type, { cell: 50, originX: 12, originY: -7, half: 500, maxSegment: 50 });
      expect(a.length, `${type} produced nothing`).toBeGreaterThan(0);
      expect(a, `${type} is not deterministic`).toEqual(b);
    }
  });

  it('caps its own geometry so a tiny cell cannot run away', () => {
    const huge = squareLattice({ cell: 0.01, originX: 0, originY: 0, half: 1000, maxLines: 50 });
    expect(huge.length).toBeLessThan(5000);
  });

  // A Traveller map must LOOK like one — the 8x10 subsector boundaries are what distinguish it from a
  // plain hex field at any zoom, including the zooms where the numbers are too small to read.
  it('draws subsector boundaries, far sparser than the hexes themselves', () => {
    const o = { cell: 4, originX: 0, originY: 0, half: 120 };
    const hexes = hexLattice(o).length;
    const subs = subsectorLattice(o).length;
    expect(subs, 'no subsector boundaries at all').toBeGreaterThan(0);
    expect(subs, 'subsector lines should be a small fraction of the hex edges').toBeLessThan(hexes / 4);
  });

  // A subsector boundary is ONE CONTINUOUS LINE across the map. The horizontal run is the flat bottom
  // of each hex PLUS a bridge to the next column, which sits half a hex higher or lower depending on
  // parity — leave the bridge out and you get a row of disconnected dashes.
  //
  // Counting shared endpoints does NOT test this (the first version of this test did, and passed with
  // the bridge deleted, because the vertical zig-zags share endpoints among themselves). What tests it
  // is SPAN: walk the segments into connected components and measure how wide the widest one is. With
  // the bridge a horizontal boundary runs the width of the map; without it the widest component is a
  // single hex's flat bottom.
  it('joins its horizontal boundary into one line spanning the map', () => {
    const HALF = 200;
    const subs = subsectorLattice({ cell: 4, originX: 0, originY: 0, half: HALF });
    const key = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;
    const adj = new Map<string, string[]>();
    const xOf = new Map<string, number>();
    for (const [x1, y1, x2, y2] of subs) {
      const a = key(x1, y1), b = key(x2, y2);
      xOf.set(a, x1); xOf.set(b, x2);
      (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
      (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
    }
    let widest = 0;
    const seen = new Set<string>();
    for (const start of adj.keys()) {
      if (seen.has(start)) continue;
      let lo = Infinity, hi = -Infinity;
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const n = stack.pop()!;
        const x = xOf.get(n)!;
        if (x < lo) lo = x;
        if (x > hi) hi = x;
        for (const m of adj.get(n) ?? []) if (!seen.has(m)) { seen.add(m); stack.push(m); }
      }
      widest = Math.max(widest, hi - lo);
    }
    expect(widest, 'the widest connected run is about one hex — the boundary is dashes, not a line')
      .toBeGreaterThan(HALF);
  });

  // ALIGNMENT AND SCALE against the GM's own grid. Grid.svelte is the reference — a system the GM
  // snapped to a hex must land dead-centre in the player's hex, or the two maps are telling different
  // stories about where things are. Its formula is reproduced here VERBATIM from the component and
  // compared against the shared generator, so a change to either side breaks this rather than the map.
  it('puts its hex centres exactly where the GM grid puts them', () => {
    const gridSize = 50;                 // Starmap.svelte's default, = DEFAULT_MAP_CELL
    const originX = 0, originY = 0;      // Starmap.svelte hardcodes both
    const size = gridSize / 2;
    const hexHeight = Math.sqrt(3) * size;
    const horizDist = 1.5 * size;
    // Grid.svelte: x = col*horizDist + originX; y = row*hexHeight + (|col|%2)*(hexHeight/2) + originY
    const gm = (col: number, row: number) => ({
      x: col * horizDist + originX,
      y: row * hexHeight + (Math.abs(col) % 2) * (hexHeight / 2) + originY
    });
    const mine = new Map(
      hexCentres({ cell: gridSize, originX, originY, half: 1200 }).map((c) => [`${c.col},${c.row}`, c])
    );
    let checked = 0;
    for (let col = -6; col <= 6; col++) {
      for (let row = -6; row <= 6; row++) {
        const c = mine.get(`${col},${row}`);
        if (!c) continue;                // outside the requested extent
        const e = gm(col, row);
        expect(c.x, `hex ${col},${row} x is off the GM grid`).toBeCloseTo(e.x, 9);
        expect(c.y, `hex ${col},${row} y is off the GM grid`).toBeCloseTo(e.y, 9);
        checked++;
      }
    }
    expect(checked, 'no hexes were actually compared').toBeGreaterThan(100);
  });

  // SCALE: the scene hands the generator the GM cell multiplied by the map->scene fit, so the lattice
  // must scale linearly with that factor and nothing else.
  it('scales linearly with the map fit, so a GM cell is one player cell', () => {
    const base = hexCentres({ cell: 50, originX: 0, originY: 0, half: 600 });
    const k = 0.37;
    const scaled = hexCentres({ cell: 50 * k, originX: 0, originY: 0, half: 600 * k });
    const byKey = new Map(scaled.map((c) => [`${c.col},${c.row}`, c]));
    for (const c of base.slice(0, 60)) {
      const t = byKey.get(`${c.col},${c.row}`);
      if (!t) continue;
      expect(t.x).toBeCloseTo(c.x * k, 9);
      expect(t.y).toBeCloseTo(c.y * k, 9);
    }
  });

  it('numbers Traveller hexes as Grid.svelte does', () => {
    expect(travellerHexLabel(0, 0)).toBe('0101');
    expect(travellerHexLabel(31, 39)).toBe('3240');
    expect(travellerHexLabel(32, 40)).toBe('0101'); // wraps at the sector
  });
});
