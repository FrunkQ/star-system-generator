import { describe, it, expect } from 'vitest';
import { photonParticleSplit } from './radiation';
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
