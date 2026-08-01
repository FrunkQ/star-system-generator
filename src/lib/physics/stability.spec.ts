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

// Inbox B19: an ejection is ASYMMETRIC. Mars was tagged "flung out" because it shares a crossing
// pair with 433 Eros, a 16 km asteroid carried as a planet in the starmap Sol — and the verdict was
// merged onto BOTH members. The Hill delta there is 9.28, nowhere near the 5.5 threshold, so the
// threshold was never involved; and belts were already excluded from the pairing, so that was not
// it either. The light body is the one that gets thrown.
describe('an ejection verdict names the body that is thrown (B19)', () => {
  const SUN = 1.989e30;
  const mk = (id: string, name: string, aAU: number, massKg: number, e = 0) => ({
    id, name, kind: 'body', roleHint: 'planet', parentId: 'star', massKg, radiusKm: 100,
    orbit: { hostId: 'star', elements: { a_AU: aAU, e, i_deg: 0, Omega_deg: 0, w_deg: 0, M0_deg: 0 } }
  }) as any;

  function fatesFor(nodes: any[]) {
    const sys: any = { id: 's', name: 's', seed: 's', epochT0: 0, age_Gyr: 4.6, nodes: [
      { id: 'star', name: 'S', kind: 'body', roleHint: 'star', massKg: SUN, radiusKm: 696340 }, ...nodes
    ], tags: [] };
    annotateGravitationalStability(sys);
    const out: Record<string, string | undefined> = {};
    for (const n of sys.nodes) out[n.name] = (n.tags || []).find((t: any) => t.key.startsWith('fate/'))?.key;
    return out;
  }

  it('a planet is NOT flung out by a crossing asteroid — the asteroid is', () => {
    // Eros: a = 1.458, e = 0.223, 6.7e15 kg. Mars: a = 1.524, 6.42e23 kg. Their orbits cross.
    const f = fatesFor([mk('eros', 'Eros', 1.458, 6.687e15, 0.223), mk('mars', 'Mars', 1.5237, 6.417e23)]);
    expect(f['Mars']).toBeUndefined();
    expect(f['Eros']).toBe('fate/eject');
  });

  it('the threshold is innocent: that pair is at delta 9.28, far outside the 5.5 test', () => {
    const a1 = 1.458, a2 = 1.5237, m1 = 6.687e15, m2 = 6.417e23;
    const mutualHill = 0.5 * (a1 + a2) * Math.cbrt((m1 + m2) / (3 * SUN));
    expect((a2 - a1) / mutualHill).toBeGreaterThan(5.5);
  });

  it('comparable masses still BOTH get the (mutual) collision verdict', () => {
    const f = fatesFor([mk('a', 'A', 1.0, 5.97e24, 0.30), mk('b', 'B', 1.3, 5.97e24)]);
    expect(f['A']).toBe('fate/collision');
    expect(f['B']).toBe('fate/collision');
  });
});
