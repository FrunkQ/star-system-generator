import { describe, it, expect } from 'vitest';
import { systemVisualStars, starClusterOffsets } from './systemStars';

const star = (id: string, mass: number) => ({ id, name: id, kind: 'body', roleHint: 'star', parentId: null, massKg: mass, classes: [], apparentColorHex: undefined });
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
});
