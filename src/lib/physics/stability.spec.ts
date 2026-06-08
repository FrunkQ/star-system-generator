import { describe, it, expect } from 'vitest';
import { annotateGravitationalStability } from './stability';
import type { System, CelestialBody } from '$lib/types';

// A belt's massKg is a debris-density proxy, not a point mass — so it must not act as a
// gravitational sibling and destabilise a neighbouring planet (the real "belt makes a nearby
// planet unstable" bug).
function sys(beltMassKg: number): System {
  const star = { id: 'star', kind: 'body', roleHint: 'star', name: 'S', massKg: 2e30 } as CelestialBody;
  const planet = {
    id: 'p', kind: 'body', roleHint: 'planet', name: 'P', parentId: 'star', massKg: 6e24,
    orbit: { hostId: 'star', elements: { a_AU: 2.5, e: 0.02 } }
  } as CelestialBody;
  const belt = {
    id: 'b', kind: 'body', roleHint: 'belt', name: 'Belt', parentId: 'star', massKg: beltMassKg,
    radiusInnerKm: 3.5e8, radiusOuterKm: 4.5e8,
    orbit: { hostId: 'star', elements: { a_AU: 2.7, e: 0.07 } }
  } as CelestialBody;
  return { id: 's', name: 'T', nodes: [star, planet, belt] } as unknown as System;
}

const stabilityTags = (b: CelestialBody) => (b.tags ?? []).filter((t) => t.key.startsWith('stability/'));

describe('belt does not destabilise neighbours', () => {
  it('a hugely-massive belt next to a planet leaves the planet stable', () => {
    const s = sys(5e26); // ~80 Earth masses of "belt" — would wreck Hill spacing if treated as a body
    annotateGravitationalStability(s);
    const planet = s.nodes.find((n) => n.id === 'p') as CelestialBody;
    expect(stabilityTags(planet).length).toBe(0);
  });

  it('the belt itself gets no stability annotation', () => {
    const s = sys(5e26);
    annotateGravitationalStability(s);
    const belt = s.nodes.find((n) => n.id === 'b') as CelestialBody;
    expect(stabilityTags(belt).length).toBe(0);
  });
});
