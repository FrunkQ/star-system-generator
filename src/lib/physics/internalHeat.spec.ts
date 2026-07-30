import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { estimateInternalHeatK } from './temperature';
import { brownDwarfThermal } from './substellar';
import type { CelestialBody, RulePack } from '$lib/types';

// A giant is still radiating the gravitational energy of its own formation, and cooling as it does.
// So its internal heat depends on AGE and MASS and not at all on its distance from the star — which
// is the thing this model exists to say. The curve is anchored on today's solar system, and that
// anchoring is the whole guard: whatever it does at 10 Myr, it has to still produce Jupiter's real
// excess at 4.6 Gyr.
const pack = JSON.parse(readFileSync('static/rulepacks/starter-sf/atmospheres.json', 'utf8')) as unknown as RulePack;
const JUP = 1.898e27;

const giant = (mJup: number, opts: { ice?: boolean; pressureBar?: number } = {}) => ({
  roleHint: 'planet', massKg: mJup * JUP,
  classes: [opts.ice ? 'planet/ice-giant' : 'planet/gas-giant'],
  atmosphere: { pressure_bar: opts.pressureBar ?? 1, composition: { H2: 0.86, He: 0.13 } }
}) as unknown as CelestialBody;

describe('giant internal heat', () => {
  it('reproduces TODAY’S solar system — the anchor the whole curve hangs on', () => {
    // Real excesses: Jupiter +55 K, Saturn +53, Uranus +18, Neptune +25.
    expect(estimateInternalHeatK(giant(1.0), pack, 4.6)).toBeCloseTo(52, 0);
    expect(estimateInternalHeatK(giant(0.299), pack, 4.6)).toBeCloseTo(52, 0);
    expect(estimateInternalHeatK(giant(0.0457, { ice: true }), pack, 4.6)).toBeCloseTo(24, 0);
    expect(estimateInternalHeatK(giant(0.0539, { ice: true }), pack, 4.6)).toBeCloseTo(24, 0);
  });

  it('does NOT scale a sub-Jupiter giant down by mass', () => {
    // Saturn is a third of Jupiter's mass and radiates essentially the same excess, so the per-class
    // reference already covers smaller giants. Scaling by mass on top of it double-counted and cost
    // Saturn 23 K — this pins that mistake shut.
    expect(estimateInternalHeatK(giant(0.3), pack, 4.6))
      .toBeCloseTo(estimateInternalHeatK(giant(1.0), pack, 4.6), 0);
  });

  it('makes a YOUNG giant hot, which is the whole point', () => {
    const young = estimateInternalHeatK(giant(1), pack, 0.02);   // 20 Myr
    const old = estimateInternalHeatK(giant(1), pack, 4.6);
    expect(young).toBeGreaterThan(500);
    expect(young / old).toBeGreaterThan(10);
    // …and it cools monotonically the whole way.
    const ages = [0.01, 0.05, 0.1, 0.5, 1, 4.6, 10];
    const heats = ages.map((a) => estimateInternalHeatK(giant(1), pack, a));
    for (let i = 1; i < heats.length; i++) expect(heats[i]).toBeLessThan(heats[i - 1]);
  });

  it('matches the directly imaged planets we can actually check against', () => {
    // HR 8799 b–e are ~5–7 M_jup at ~30 Myr and observed at roughly 1000–1200 K. We can photograph
    // them precisely because they glow on their own account, 68 light years from anything of ours.
    for (const mJup of [5, 7]) {
      const k = estimateInternalHeatK(giant(mJup), pack, 0.03);
      expect(k).toBeGreaterThan(850);
      expect(k).toBeLessThan(1350);
    }
  });

  it('hands over to the brown-dwarf model at 8 M_jup without a step', () => {
    // Above 8 M_jup the Burrows/Baraffe tracks take over and set an absolute temperature. If the two
    // curves disagreed at the boundary, a giant would get COLDER by gaining mass.
    const ours = estimateInternalHeatK(giant(7.9), pack, 0.02);
    const bd = brownDwarfThermal(8.0 * JUP, 0.02, 71492);
    expect(bd.isSubstellar).toBe(true);
    expect(Math.abs(ours - bd.teffK) / bd.teffK).toBeLessThan(0.15);
  });

  it('ignores the quoted pressure entirely — the bug this replaced', () => {
    // A giant has no surface, so its pressure is whatever depth its author chose. The old model
    // gated on `>= 10 bar`, so every giant quoted at the 1 bar reference level — the bundled solar
    // system, and every generated one — silently got ZERO internal heat.
    const heats = [1, 5, 10, 100, 200000].map((p) => estimateInternalHeatK(giant(1, { pressureBar: p }), pack, 4.6));
    expect(new Set(heats.map((h) => Math.round(h))).size).toBe(1);
    expect(heats[0]).toBeGreaterThan(40);
  });

  it('gives a rocky world none of this — it is not contracting', () => {
    const rock = {
      roleHint: 'planet', massKg: 5.97e24, classes: ['planet/terrestrial'],
      atmosphere: { pressure_bar: 1, composition: { N2: 0.78, O2: 0.21 } }
    } as unknown as CelestialBody;
    expect(estimateInternalHeatK(rock, pack, 0.01)).toBe(0);
    // (A terrestrial's internal heat is radiogenic and tidal, modelled separately, and it moves the
    // surface temperature by ~0.02 K on Earth — geology, not climate.)
  });
});
