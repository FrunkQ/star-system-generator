import { describe, it, expect } from 'vitest';
import {
  circumbinaryCriticalRatio,
  circumbinaryCriticalAU,
  circumbinaryAnnulus,
  circumbinaryFitExtrapolated,
  CIRCUMBINARY_HILL_FRACTION
} from './circumbinary';
import { annotateGravitationalStability, hillRadiusAU } from './stability';
import type { System, CelestialBody, Barycenter } from '$lib/types';

const SOLAR = 1.989e30;
const AU_KM = 149597870.7;

// ---------------------------------------------------------------------------------------------
// THE FIT ITSELF, against real systems. Holman & Wiegert (1999) is an empirical fit, so the only
// check worth anything is whether it reproduces pairs that actually exist.
// ---------------------------------------------------------------------------------------------

describe('Holman & Wiegert (1999) critical semi-major axis', () => {
  it('Kepler-16b sits at 1.09x its own stability limit — the published result', () => {
    // Kepler-16 (AB): m1 = 0.6897 Msun, m2 = 0.20255 Msun, a_b = 0.22431 AU, e_b = 0.15944.
    const mu = 0.20255 / (0.6897 + 0.20255);
    const ratio = circumbinaryCriticalRatio(mu, 0.15944);
    expect(ratio).toBeCloseTo(2.88, 2);

    const aCrit = circumbinaryCriticalAU(0.22431, mu, 0.15944);
    expect(aCrit).toBeCloseTo(0.646, 3);

    // The planet orbits at 0.7048 AU — outside, but by the narrowest margin of any known
    // circumbinary planet, which is why it lands in the "on the edge" band rather than clear.
    expect(0.7048 / aCrit).toBeCloseTo(1.09, 2);
  });

  it("Pluto's small moons sit just outside the Pluto-Charon limit", () => {
    // mu = 1.586e21 / 1.461e22, a_b = 19,591 km, e_b ~ 0.
    const mu = 1.586e21 / 1.461e22;
    const sepAU = 19591 / AU_KM;
    const aCritKm = circumbinaryCriticalAU(sepAU, mu, 0) * AU_KM;
    expect(aCritKm).toBeGreaterThan(38000);
    expect(aCritKm).toBeLessThan(39500);
    expect(42656).toBeGreaterThan(aCritKm);   // Styx, the innermost, clears it
  });

  it('an equal-mass circular pair forbids ~2.39x its separation', () => {
    expect(circumbinaryCriticalRatio(0.5, 0)).toBeCloseTo(2.3875, 3);
  });

  it('eccentricity clears a much wider hole than mass ratio does', () => {
    const circular = circumbinaryCriticalRatio(0.5, 0);
    const eccentric = circumbinaryCriticalRatio(0.5, 0.4);
    expect(eccentric).toBeGreaterThan(circular * 1.4);
  });

  it('flags a pair outside the grid the fit was made on', () => {
    expect(circumbinaryFitExtrapolated(0.33, 0.3)).toBe(false);
    expect(circumbinaryFitExtrapolated(0.02, 0.3)).toBe(true);   // mu below 0.1
    expect(circumbinaryFitExtrapolated(0.33, 0.85)).toBe(true);  // e_b above 0.7
  });
});

// ---------------------------------------------------------------------------------------------

const member = (id: string, name: string, massKg: number, aAU: number, e = 0): CelestialBody =>
  ({
    id, name, kind: 'body', roleHint: 'star', parentId: 'bary', massKg, radiusKm: 696340,
    orbit: { hostId: 'bary', elements: { a_AU: aAU, e, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } },
    tags: []
  }) as unknown as CelestialBody;

describe('circumbinaryAnnulus does not care which star is listed first', () => {
  const a = member('a', 'A', SOLAR, 1 / 3);
  const b = member('b', 'B', SOLAR / 2, 2 / 3);

  it('gives the same annulus either way round', () => {
    const one = circumbinaryAnnulus(a, b);
    const two = circumbinaryAnnulus(b, a);
    expect(one!.massRatioMu).toBeCloseTo(1 / 3, 10);
    expect(two!.massRatioMu).toBeCloseTo(1 / 3, 10);
    expect(one!.innerAU).toBeCloseTo(two!.innerAU, 12);
  });

  it('publishes no outer edge without a Hill radius, and one with', () => {
    expect(circumbinaryAnnulus(a, b)!.outerAU).toBeUndefined();
    const bounded = circumbinaryAnnulus(a, b, 40)!;
    expect(bounded.hillRadiusAU).toBe(40);
    expect(bounded.outerAU).toBeCloseTo(40 * CIRCUMBINARY_HILL_FRACTION, 12);
  });

  it('abstains rather than inventing a zero for a half-built pair', () => {
    expect(circumbinaryAnnulus(a, undefined)).toBeNull();
    expect(circumbinaryAnnulus(a, member('c', 'C', 0, 0.5))).toBeNull();
  });
});

describe('the one Hill radius', () => {
  it('reproduces Pluto-Charon at 5.99e6 km', () => {
    // Combined 1.461e22 kg at 39.48 AU, e 0.2488, around the Sun.
    const hill = hillRadiusAU(39.48, 0.2488, 1.461e22, SOLAR) * AU_KM;
    expect(hill / 1e6).toBeCloseTo(5.98, 1);
  });

  it('is judged at periapsis, so an eccentric orbit gets a smaller sphere', () => {
    expect(hillRadiusAU(10, 0.5, 6e24, SOLAR)).toBeCloseTo(hillRadiusAU(10, 0, 6e24, SOLAR) * 0.5, 10);
  });

  it('returns 0 rather than NaN when there is no host', () => {
    expect(hillRadiusAU(10, 0, 6e24, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// THE CRITERION, through the real stability pass.
// ---------------------------------------------------------------------------------------------

// A 1.0 + 0.5 Msun pair at 1 AU separation (mu = 1/3, e = 0): the critical radius is 2.408 AU.
function binaryWith(planets: Array<{ id: string; aAU: number; e?: number; parentId?: string }>): System {
  const mA = SOLAR, mB = SOLAR / 2, total = mA + mB;
  const bary: Barycenter = {
    id: 'bary', kind: 'barycenter', name: 'Test Pair', parentId: null,
    memberIds: ['a', 'b'], effectiveMassKg: total, tags: []
  } as unknown as Barycenter;
  const nodes: Array<CelestialBody | Barycenter> = [
    bary,
    member('a', 'A', mA, (mB / total)),
    member('b', 'B', mB, (mA / total))
  ];
  for (const p of planets) {
    nodes.push({
      id: p.id, name: p.id.toUpperCase(), kind: 'body', roleHint: 'planet',
      parentId: p.parentId ?? 'bary', massKg: 6e24, radiusKm: 6371,
      orbit: {
        hostId: p.parentId ?? 'bary',
        elements: { a_AU: p.aAU, e: p.e ?? 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 }
      },
      tags: []
    } as unknown as CelestialBody);
  }
  return { id: 's', name: 'Test', seed: 's', epochT0: 0, age_Gyr: 5, nodes, tags: [] } as unknown as System;
}

const keysOf = (n: any) => (n.tags ?? []).map((t: any) => t.key).filter(
  (k: string) => k.startsWith('stability/') || k.startsWith('fate/'));
const nodeOf = (s: System, id: string) => s.nodes.find((n) => n.id === id) as any;

describe('a barycentre publishes its annulus', () => {
  it('publishes the inner edge for a pair with no children at all', () => {
    const s = binaryWith([]);
    annotateGravitationalStability(s);
    const cb = nodeOf(s, 'bary').circumbinary;
    expect(cb.innerAU).toBeCloseTo(2.4078, 3);
    expect(cb.pairSeparationAU).toBeCloseTo(1, 10);
    expect(cb.massRatioMu).toBeCloseTo(1 / 3, 10);
    expect(cb.fitExtrapolated).toBe(false);
  });

  it('leaves the pair with no outer edge when it is the system root', () => {
    const s = binaryWith([]);
    annotateGravitationalStability(s);
    // Nothing outside a root pair to strip it, so there is no in-system outer wall — and the field
    // is ABSENT rather than a large number standing in for infinity.
    expect(nodeOf(s, 'bary').circumbinary.outerAU).toBeUndefined();
    expect(nodeOf(s, 'bary').circumbinary.hillRadiusAU).toBeUndefined();
  });

  it('publishes an outer edge once the pair orbits something', () => {
    const s = binaryWith([]);
    const bary = nodeOf(s, 'bary');
    s.nodes.push({ id: 'host', name: 'Host', kind: 'body', roleHint: 'star', massKg: SOLAR * 20, radiusKm: 1e6, tags: [] } as any);
    bary.parentId = 'host';
    bary.orbit = { hostId: 'host', elements: { a_AU: 500, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } };
    annotateGravitationalStability(s);
    const cb = nodeOf(s, 'bary').circumbinary;
    const expectedHill = hillRadiusAU(500, 0, SOLAR * 1.5, SOLAR * 20);
    expect(cb.hillRadiusAU).toBeCloseTo(expectedHill, 10);
    expect(cb.outerAU).toBeCloseTo(expectedHill * CIRCUMBINARY_HILL_FRACTION, 10);
    expect(cb.outerAU).toBeGreaterThan(cb.innerAU);   // a real annulus, not an inverted one
  });
});

describe('the circumbinary inner limit', () => {
  it('condemns a planet inside the critical radius, and says which way it goes', () => {
    const s = binaryWith([{ id: 'p', aAU: 1.5 }]);   // limit is 2.408 AU
    annotateGravitationalStability(s);
    const p = nodeOf(s, 'p');
    expect(keysOf(p)).toContain('stability/very-unstable');
    expect(keysOf(p)).toContain('fate/eject');
    expect(keysOf(p)).toContain('stability/inside-circumbinary-limit');
    // The reason names the mechanism, not just the verdict.
    expect(p.orbitalStabilityDetails).toMatch(/Holman & Wiegert/);
    expect(p.orbitalStabilityDetails).toMatch(/turns twice per binary orbit/);
    expect(p.orbitalStabilityDetails).toMatch(/flung out/);
  });

  it('calls a planet just outside the limit marginal, and predicts no fate for it', () => {
    const s = binaryWith([{ id: 'p', aAU: 2.6 }]);   // 1.08x the limit
    annotateGravitationalStability(s);
    const p = nodeOf(s, 'p');
    expect(keysOf(p)).toEqual(['stability/marginal']);
    expect(p.orbitalStabilityDetails).toMatch(/unstable islands/);
  });

  it('leaves a planet comfortably outside completely untouched', () => {
    const s = binaryWith([{ id: 'p', aAU: 5 }]);     // 2.08x the limit
    annotateGravitationalStability(s);
    const p = nodeOf(s, 'p');
    expect(keysOf(p)).toEqual([]);
    expect(p.orbitalStability).toBeUndefined();
  });

  it('flags an eccentric orbit whose periapsis dips into the hole', () => {
    // a = 3.0 clears 2.408 by 1.25x (outside the edge band), but periapsis 3.0*0.4 = 1.2 does not.
    const s = binaryWith([{ id: 'p', aAU: 3.0, e: 0.6 }]);
    annotateGravitationalStability(s);
    const p = nodeOf(s, 'p');
    expect(keysOf(p)).toContain('stability/marginal');
    expect(p.orbitalStabilityDetails).toMatch(/periapsis reaches/);
    expect(p.orbitalStabilityDetails).toMatch(/CIRCULAR orbits/);
  });

  it('does not leak onto the pair itself', () => {
    const s = binaryWith([{ id: 'p', aAU: 1.5 }]);
    annotateGravitationalStability(s);
    // The member stars ARE the hole; they are judged as a pair, not as bodies inside it.
    expect(keysOf(nodeOf(s, 'a'))).toEqual([]);
    expect(keysOf(nodeOf(s, 'b'))).toEqual([]);
  });

  it('does not leak onto an S-type body orbiting one member', () => {
    // A planet 0.03 AU from star A is circumSTELLAR — well inside the pair separation, and the
    // circumbinary limit says nothing about it.
    const s = binaryWith([{ id: 'p', aAU: 0.03, parentId: 'a' }]);
    annotateGravitationalStability(s);
    expect(keysOf(nodeOf(s, 'p'))).toEqual([]);
  });

  it('says nothing about a child of an ordinary star', () => {
    const s = binaryWith([]);
    s.nodes = [
      { id: 'star', name: 'S', kind: 'body', roleHint: 'star', massKg: SOLAR, radiusKm: 696340, tags: [] } as any,
      {
        id: 'p', name: 'P', kind: 'body', roleHint: 'planet', parentId: 'star', massKg: 6e24, radiusKm: 6371,
        orbit: { hostId: 'star', elements: { a_AU: 1, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } },
        tags: []
      } as any
    ];
    annotateGravitationalStability(s);
    expect(keysOf(nodeOf(s, 'p'))).toEqual([]);
    expect(nodeOf(s, 'p').circumbinary).toBeUndefined();
  });
});

describe('idempotence', () => {
  it('processing twice changes nothing on the pair or its children', () => {
    const s = binaryWith([{ id: 'p', aAU: 1.5 }, { id: 'q', aAU: 5 }]);
    annotateGravitationalStability(s);
    const once = JSON.stringify(s);
    annotateGravitationalStability(s);
    annotateGravitationalStability(s);
    expect(JSON.stringify(s)).toBe(once);
  });
});
