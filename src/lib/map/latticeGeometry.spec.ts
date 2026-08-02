// A37: the square lattice drew NOTHING on the 3D starmap, and the cause is arithmetic rather than a
// missing branch — which means it can be PROVED here rather than looked at.
import { describe, it, expect } from 'vitest';
import { squareLattice, hexLattice, latticeFor, travellerHexLabel } from './latticeGeometry';

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

  it('numbers Traveller hexes as Grid.svelte does', () => {
    expect(travellerHexLabel(0, 0)).toBe('0101');
    expect(travellerHexLabel(31, 39)).toBe('3240');
    expect(travellerHexLabel(32, 40)).toBe('0101'); // wraps at the sector
  });
});
