import { describe, it, expect } from 'vitest';
import { generateBodyOfType } from './generateBodyOfType';
import type { Fingerprint } from '$lib/types';
import { EARTH_MASS_KG } from '$lib/constants';

// Mirrors the starter pack's planet/brown-dwarf fingerprint (mass 4100–25000 M⊕ ≈ 13–79 M_jup,
// radius 9–14 R⊕). Guards the "add planet → brown dwarf → right size" path: a brown dwarf must come
// out at genuine brown-dwarf mass (a Jupiter is NOT a brown dwarf) with a Jupiter-ish, degeneracy-set
// radius — never a ~700 M⊕ gas giant.
const BD_FP: Fingerprint = {
  class: 'planet/brown-dwarf', kind: 'base',
  match: { mass_Me: [4100, 25000], radius_Re: [9, 14] }
} as any;

describe('add-planet brown-dwarf sizing', () => {
  it('always produces a genuine brown-dwarf mass (13–79 M_jup), never a gas-giant mass', () => {
    let rng = 0.0001;
    for (let i = 0; i < 200; i++) {
      rng = (rng * 9301 + 49297) % 233280 / 233280; // cheap deterministic spread over [0,1)
      const body = generateBodyOfType(BD_FP, { distAU: 5, hostMassKg: 1.989e30, role: 'planet', rng: () => rng, teqK: 120 });
      const massMe = (body.massKg ?? 0) / EARTH_MASS_KG;
      expect(massMe).toBeGreaterThanOrEqual(4100);
      expect(massMe).toBeLessThanOrEqual(25000);
      // Radius stays Jupiter-ish (degeneracy) — inside the fingerprint's 9–14 R⊕, never ballooning.
      const radiusRe = (body.radiusKm ?? 0) / 6371;
      expect(radiusRe).toBeGreaterThan(8);
      expect(radiusRe).toBeLessThan(15);
    }
  });

  it('a light brown dwarf is (slightly) larger than a heavy one — degeneracy', () => {
    const light = generateBodyOfType(BD_FP, { distAU: 5, hostMassKg: 1.989e30, role: 'planet', rng: () => 0.0, teqK: 120 });
    const heavy = generateBodyOfType(BD_FP, { distAU: 5, hostMassKg: 1.989e30, role: 'planet', rng: () => 0.999, teqK: 120 });
    expect((light.radiusKm ?? 0)).toBeGreaterThan((heavy.radiusKm ?? 0));
  });
});
