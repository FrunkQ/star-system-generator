import { describe, it, expect } from 'vitest';
import { regionOfInterest, inRegionOfInterest } from './regionOfInterest';
import type { CelestialBody } from '$lib/types';

// star
//  +- planetA          <- siblings of each other
//  |    +- moonA1      <- child of planetA
//  |         +- subA1  <- grandchild of planetA
//  +- planetB
//       +- moonB1      <- a SIBLING's child: never in view unless it is the selection's own line
const n = (id: string, parentId: string | null, kind: 'body' | 'barycenter' = 'body') =>
  ({ id, name: id, kind, parentId } as unknown as CelestialBody);

const TREE = [
  n('star', null),
  n('planetA', 'star'), n('moonA1', 'planetA'), n('subA1', 'moonA1'),
  n('planetB', 'star'), n('moonB1', 'planetB')
];

const roi = (id: string | null) => {
  const r = regionOfInterest(TREE, id);
  return r === null ? null : [...r].sort();
};

describe('region of interest', () => {
  it('no selection means no narrowing at all', () => {
    expect(regionOfInterest(TREE, null)).toBeNull();
    expect(inRegionOfInterest(null, 'anything')).toBe(true);
  });

  it('a planet sees itself, its star, its siblings and ALL its own descendants', () => {
    // moonA1 AND subA1 — "all children", not one level.
    expect(roi('planetA')).toEqual(['moonA1', 'planetA', 'planetB', 'star', 'subA1']);
  });

  it("does not show a sibling's children", () => {
    expect(roi('planetA')).not.toContain('moonB1');
  });

  it('a moon sees the whole ancestor chain, not just its planet', () => {
    // star is the GRANDparent — the old one-level rule stopped at planetA.
    const r = roi('moonA1')!;
    expect(r).toContain('planetA');
    expect(r).toContain('star');
    expect(r).toContain('subA1');   // its own child
  });

  it('a moon does not show its parent-planet\'s siblings\' children, nor its aunts', () => {
    const r = roi('moonA1')!;
    expect(r).not.toContain('moonB1');
    // planetB is an ancestor's other child - an aunt - and is NOT in view from moonA1.
    expect(r).not.toContain('planetB');
  });

  it('the root sees itself and everything under it', () => {
    expect(roi('star')).toEqual(['moonA1', 'moonB1', 'planetA', 'planetB', 'star', 'subA1']);
  });

  it('an unknown id narrows nothing rather than hiding everything', () => {
    expect(regionOfInterest(TREE, 'ghost')).toBeNull();
  });
});

// The case the whole thing has to get right for G45, and it needs no rule of its own.
describe('a circumbinary body is a sibling', () => {
  const PAIR = [
    n('star', null),
    n('bary', 'star', 'barycenter'),
    n('pluto', 'bary'), n('charon', 'bary'),
    n('styx', 'bary'),                        // circumbinary — same parent as the members
    n('plutoMoon', 'pluto')
  ];
  const r = (id: string) => [...regionOfInterest(PAIR, id)!].sort();

  it('selecting a pair member brings in the other member AND the circumbinary bodies', () => {
    const s = r('pluto');
    expect(s).toContain('charon');   // the other member — a sibling
    expect(s).toContain('styx');     // circumbinary — also a sibling, no special case
    expect(s).toContain('bary');     // the parent, which is what makes the annulus drawable
    expect(s).toContain('plutoMoon');// its own child
  });

  it('selecting the circumbinary body brings in the pair it orbits', () => {
    const s = r('styx');
    expect(s).toEqual(['bary', 'charon', 'pluto', 'star', 'styx']);
  });

  it('selecting a pair member does NOT bring in the other member\'s moons', () => {
    const withCharonMoon = [...PAIR, n('charonMoon', 'charon')];
    expect([...regionOfInterest(withCharonMoon, 'pluto')!]).not.toContain('charonMoon');
  });
});

describe('robustness', () => {
  it('survives a cyclic parent chain instead of hanging', () => {
    const cyclic = [n('a', 'b'), n('b', 'a')];
    const r = regionOfInterest(cyclic, 'a')!;
    expect(r.has('a')).toBe(true);
    expect(r.has('b')).toBe(true);
  });
});
