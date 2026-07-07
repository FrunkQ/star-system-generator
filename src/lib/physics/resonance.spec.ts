import { describe, it, expect } from 'vitest';
import { annotateResonances } from './resonance';
import type { System, CelestialBody } from '../types';

const SUN = 1.989e30, JUP = 1.898e27;
function planet(id: string, name: string, aAU: number, massKg: number, e = 0.01): CelestialBody {
  return { id, name, kind: 'body', roleHint: 'planet', parentId: 'star', massKg, tags: [],
    orbit: { hostId: 'star', elements: { a_AU: aAU, e } } } as any;
}
function moon(id: string, name: string, aAU: number, massKg: number, e = 0.004): CelestialBody {
  return { id, name, kind: 'body', roleHint: 'moon', parentId: 'jup', massKg, tags: [],
    orbit: { hostId: 'jup', elements: { a_AU: aAU, e } } } as any;
}
function sys(bodies: CelestialBody[], extraHosts: CelestialBody[] = []): System {
  const star = { id: 'star', name: 'Star', kind: 'body', roleHint: 'star', parentId: null, massKg: SUN } as any;
  return { id: 's', name: 'S', epochT0: 0, nodes: [star, ...extraHosts, ...bodies] } as any;
}
const ratio = (b: CelestialBody) => b.orbit?.resonance;
const tags = (b: CelestialBody) => (b.tags || []).map((t) => t.key);

describe('annotateResonances', () => {
  it('Neptune–Pluto land on a protective 3:2 resonance', () => {
    const neptune = planet('n', 'Neptune', 30.1, 1.024e26, 0.009);
    const pluto = planet('p', 'Pluto', 39.48, 1.3e22, 0.25);
    annotateResonances(sys([neptune, pluto]));
    expect(ratio(pluto)).toEqual({ numerator: 3, denominator: 2 });
    expect(tags(pluto)).toContain('resonance/3-2');
    expect((pluto as any).resonanceProtective).toBe(true); // tiny body shepherded by Neptune
  });

  it('the Galilean moons form a Laplace chain (protective + tidal)', () => {
    const jup = { id: 'jup', name: 'Jupiter', kind: 'body', roleHint: 'planet', parentId: 'star', massKg: JUP,
      orbit: { hostId: 'star', elements: { a_AU: 5.2, e: 0.05 } } } as any;
    const io = moon('io', 'Io', 0.002819, 8.93e22);
    const europa = moon('eu', 'Europa', 0.004486, 4.8e22);
    const ganymede = moon('ga', 'Ganymede', 0.007155, 1.48e23);
    annotateResonances(sys([io, europa, ganymede], [jup]));
    for (const m of [io, europa, ganymede]) {
      expect(tags(m)).toContain('resonance/laplace');
      expect((m as any).resonanceProtective).toBe(true);
      expect((m as any).resonanceTidal).toBe(true);
    }
  });

  it('non-resonant neighbours get nothing', () => {
    const a = planet('a', 'A', 1.0, 6e24);
    const b = planet('b', 'B', 1.9, 6e24); // ratio ~2.6, not near a small integer
    annotateResonances(sys([a, b]));
    expect(ratio(b)).toBeFalsy();
    expect(tags(b).filter((t) => t.startsWith('resonance/'))).toHaveLength(0);
  });
});
