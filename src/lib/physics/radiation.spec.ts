import { describe, it, expect } from 'vitest';
import { photonParticleSplit, calculateStellarRadiationComponents } from './radiation';
import type { CelestialBody } from '$lib/types';

// Phase 04.4 — spectral-class photon/particle split. Cool dwarfs are wind/flare-dominated,
// so their particle fraction rises toward M. Magnetospheres shield particles (not photons),
// so this makes unshielded M-dwarf worlds harsher than Sun-like ones at the same flux.
function star(cls: string): CelestialBody {
  return { classes: [`star/${cls}`] } as unknown as CelestialBody;
}

describe('photonParticleSplit', () => {
  it('keeps Sun-like (G) at the historical 90/10', () => {
    const g = photonParticleSplit(star('G2V'));
    expect(g.ph).toBeCloseTo(0.9, 5);
    expect(g.pa).toBeCloseTo(0.1, 5);
  });

  it('each split sums to 1', () => {
    for (const cls of ['O', 'B', 'A', 'F', 'G', 'K', 'M']) {
      const s = photonParticleSplit(star(cls));
      expect(s.ph + s.pa).toBeCloseTo(1, 5);
    }
  });

  it('particle fraction rises monotonically from hot to cool dwarfs', () => {
    const order = ['B', 'F', 'G', 'K', 'M'].map((c) => photonParticleSplit(star(c)).pa);
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThan(order[i - 1]);
    }
    // M dwarf is markedly more particle-dominated than the Sun.
    expect(photonParticleSplit(star('M8V')).pa).toBeGreaterThan(2 * photonParticleSplit(star('G2V')).pa);
  });

  it('falls back to G for missing/odd classes', () => {
    expect(photonParticleSplit({} as CelestialBody).pa).toBeCloseTo(0.1, 5);
  });
});

// Inbox B8: the mean dose used to be built from the per-star components (which include a FLARE
// term) while the endpoints came from a second, flare-less sum — so on an active star the mean
// could sit up to 20% above its own maximum. All three now come from this one function, and the
// property that matters is that the ordering holds for a FLARING star, which is where it broke.
describe('stellar radiation components — one model for mean and endpoints', () => {
  function flaringSystem(flare: number) {
    const s = {
      id: 'star', kind: 'body', name: 'S', roleHint: 'star', classes: ['star/M5V'],
      massKg: 2e29, radiusKm: 200000, radiationOutput: 0.002, flareActivity: flare
    } as unknown as CelestialBody;
    const p = {
      id: 'p', kind: 'body', name: 'P', roleHint: 'planet', parentId: 'star',
      massKg: 6e24, radiusKm: 6400,
      orbit: { elements: { a_AU: 0.1, e: 0.25, i_deg: 0, Omega_deg: 0, w_deg: 0, M0_deg: 0 } }
    } as unknown as CelestialBody;
    return { nodes: [s, p] as any[], body: p };
  }

  it('the flare dose is in the endpoints as well as the mean', () => {
    const { nodes, body } = flaringSystem(0.8);
    const quiet = flaringSystem(0);
    const near = calculateStellarRadiationComponents(body, nodes, 'near').total;
    const nearQuiet = calculateStellarRadiationComponents(quiet.body, quiet.nodes, 'near').total;
    expect(near).toBeGreaterThan(nearQuiet); // it used to be identical — the term was missing
  });

  it('min <= mean <= max holds on an eccentric orbit round an active star', () => {
    for (const flare of [0, 0.2, 0.5, 0.9]) {
      const { nodes, body } = flaringSystem(flare);
      const min = calculateStellarRadiationComponents(body, nodes, 'far').total;
      const mean = calculateStellarRadiationComponents(body, nodes, 'current').total;
      const max = calculateStellarRadiationComponents(body, nodes, 'near').total;
      expect(min).toBeLessThanOrEqual(mean);
      expect(mean).toBeLessThanOrEqual(max);
      expect(min).toBeLessThan(max); // e = 0.25, so the range is genuinely wide
    }
  });
});
