import { describe, it, expect } from 'vitest';
import { systemVisualStars, starClusterOffsets, blackHoleState } from './systemStars';
import { STELLAR_ACTIVITY_TAG } from '$lib/physics/stellarActivity';
import { STELLAR_JETS_TAG, STELLAR_SHEDDING_TAG } from '$lib/physics/stellarOutflows';

const star = (id: string, mass: number, extra: any = {}) => ({ id, name: id, kind: 'body', roleHint: 'star', parentId: null, massKg: mass, classes: [], apparentColorHex: undefined, tags: [], ...extra });
const planet = (id: string) => ({ id, name: id, kind: 'body', roleHint: 'planet', parentId: 's1', classes: [] });

describe('systemVisualStars', () => {
  it('returns every star of a multi-star system (binary → two glyphs), primary first', () => {
    const sys: any = { nodes: [planet('p'), star('s2', 1e30), star('s1', 2e30)] };
    const vis = systemVisualStars(sys);
    expect(vis.map((v) => v.id)).toEqual(['s1', 's2']); // heavier first
  });

  it('single star system returns one', () => {
    expect(systemVisualStars({ nodes: [star('s1', 2e30), planet('p')] } as any)).toHaveLength(1);
  });

  it('starless system falls back to the root body', () => {
    const sys: any = { nodes: [{ id: 'r', name: 'Rogue', kind: 'body', roleHint: 'planet', parentId: null, classes: [] }] };
    expect(systemVisualStars(sys)).toHaveLength(1);
  });

  it('empty / null is safe', () => {
    expect(systemVisualStars(null)).toEqual([]);
    expect(systemVisualStars({ nodes: [] } as any)).toEqual([]);
  });

  it('cluster offsets scale with star count', () => {
    expect(starClusterOffsets(1)).toHaveLength(1);
    expect(starClusterOffsets(2)).toHaveLength(2);
    expect(starClusterOffsets(3)).toHaveLength(3);
    expect(starClusterOffsets(5)).toHaveLength(5);
  });

  // G26: everything a glyph DRAWS rides the record — the band from the class, the decorations from
  // the TAGS. Both maps read these fields and decide nothing themselves.
  it('carries the size band from the luminosity class', () => {
    const sys: any = { nodes: [star('g', 3e30, { classes: ['star/K-III'] }), star('d', 2e30, { classes: ['star/G2V'] }), star('w', 1e30, { classes: ['star/WD'] })] };
    expect(systemVisualStars(sys).map((v) => v.band)).toEqual(['giant', 'dwarf', 'compact']);
  });

  it('reads activity, flares, jets and shedding OFF THE TAGS — no tag, no mark', () => {
    const quiet = systemVisualStars({ nodes: [star('s', 2e30, { classes: ['star/G2V'] })] } as any)[0];
    expect(quiet.flares).toBe(false);
    expect(quiet.jets).toBe(0);
    expect(quiet.shedding).toBe(0);
    expect(quiet.activity).toBeGreaterThan(0);   // an untagged star still draws a quiet corona
    const loud = systemVisualStars({ nodes: [star('s', 2e30, { classes: ['star/M5V'], tags: [
      { key: STELLAR_ACTIVITY_TAG, value: 'flare-star' }, { key: STELLAR_JETS_TAG, value: 'strong' }, { key: STELLAR_SHEDDING_TAG, value: 'wind' }
    ] })] } as any)[0];
    expect(loud.flares).toBe(true);
    expect(loud.activity).toBe(1);
    expect(loud.jets).toBe(2);
    expect(loud.shedding).toBe(1);
  });

  it('removing the tag removes the mark (the decoration has no other source)', () => {
    const node = star('s', 2e30, { classes: ['star/NS'], tags: [{ key: STELLAR_JETS_TAG, value: 'strong' }] });
    expect(systemVisualStars({ nodes: [node] } as any)[0].jets).toBe(2);
    node.tags = [];
    expect(systemVisualStars({ nodes: [node] } as any)[0].jets).toBe(0);
  });

  it('flags black holes, feeding or quiescent — the one copy of that test', () => {
    expect(blackHoleState({ classes: ['star/BH_active'] } as any)).toBe('active');
    expect(blackHoleState({ classes: ['star/BH'] } as any)).toBe('quiescent');
    expect(blackHoleState({ classes: ['BH'] } as any)).toBe('quiescent');
    expect(blackHoleState({ classes: ['star/G2V'] } as any)).toBeUndefined();
  });
});
