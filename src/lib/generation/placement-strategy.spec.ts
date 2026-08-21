import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { calculateOrbitalSlots } from './placement-strategy';
import { calculateAllStellarZones, calculateRocheLimit } from '../physics/zones';
import { SeededRNG } from '../rng';
import type { RulePack, CelestialBody } from '$lib/types';
import { SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '../constants';

/**
 * THE FAULT THIS FILE EXISTS TO CATCH (inbox B58): planet spacing used to be the Solar System's
 * Titius-Bode law evaluated in ABSOLUTE AU, so every star — a red dwarf, a brown dwarf — was handed
 * Sol's own orbits (0.4, 0.7, 1.0, 1.6, 2.8 ... AU) and had the ones outside its zones filtered off.
 * The tests below are written so that a regression to ANY absolute-AU slot list fails loudly: they
 * compare stars against each other rather than against fixed numbers, because a fixed expected
 * number is exactly the mistake being guarded against.
 */

function deepMerge(t: any, s: any): any {
  if (typeof t !== 'object' || t === null || Array.isArray(t)) return s;
  const out = { ...t };
  for (const k of Object.keys(s || {})) out[k] = (k in out) ? deepMerge(out[k], s[k]) : s[k];
  return out;
}
function pack(): RulePack {
  const base = path.resolve('static/rulepacks/starter-sf');
  let p: any = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8'));
  for (const f of ['stars.json', 'planets.json', 'generation.json', 'orbital_constants.json',
    'classification.json', 'atmospheres.json', 'liquids.json']) {
    const fp = path.join(base, f); if (fs.existsSync(fp)) p = deepMerge(p, JSON.parse(fs.readFileSync(fp, 'utf-8')));
  }
  return p as RulePack;
}

const star = (massSolar: number, tempK: number, radiusSolar: number, cls: string): CelestialBody => ({
  id: 'star-1', name: 's', kind: 'body', roleHint: 'star', classes: [cls],
  massKg: massSolar * SOLAR_MASS_KG, radiusKm: radiusSolar * SOLAR_RADIUS_KM, temperatureK: tempK,
} as unknown as CelestialBody);

const SOL = () => star(1.0, 5778, 1.0, 'star/G');
const TRAPPIST1 = () => star(0.0898, 2566, 0.1192, 'star/M');   // M8V, the real values
const LDWARF = () => star(0.075, 1600, 0.10, 'star/L');
const YDWARF = () => star(0.020, 400, 0.09, 'star/Y');

/** Slots for a star, pooled over many seeds — one seed says nothing about a distribution. */
function pooled(s: CelestialBody, n: number, seeds = 60): number[] {
  const p = pack(); const out: number[] = [];
  for (let i = 0; i < seeds; i++) out.push(...calculateOrbitalSlots(s, p, new SeededRNG(`slot-${i}`), n));
  return out;
}
const innermostPerSeed = (s: CelestialBody, n: number, seeds = 60): number[] => {
  const p = pack(); const out: number[] = [];
  for (let i = 0; i < seeds; i++) {
    const slots = calculateOrbitalSlots(s, p, new SeededRNG(`slot-${i}`), n);
    if (slots.length) out.push(slots[0]);
  }
  return out;
};
const median = (v: number[]) => v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)];

describe('orbital slots scale with the STAR, not with the Solar System', () => {
  it('a 0.09 solar-mass star puts its innermost planet inside 0.1 AU', () => {
    // TRAPPIST-1's seven real planets sit between 0.011 and 0.062 AU. Under the old absolute-AU
    // sequence the innermost slot any star could have was 0.4 AU — 35x too far out.
    const inner = innermostPerSeed(TRAPPIST1(), 6);
    expect(inner.length).toBeGreaterThan(0);
    expect(median(inner)).toBeLessThan(0.1);
  });

  it('a dim star gets a TIGHTER system than a bright one, by orders of magnitude', () => {
    // This is the load-bearing assertion. Under any absolute-AU slot list these medians are EQUAL,
    // because the star never enters the calculation. They must differ by roughly the ratio of the
    // stars' zones, so a regression cannot slip through by nudging a constant.
    const sol = median(innermostPerSeed(SOL(), 6));
    const t1 = median(innermostPerSeed(TRAPPIST1(), 6));
    const l = median(innermostPerSeed(LDWARF(), 6));
    expect(sol / t1).toBeGreaterThan(10);
    expect(t1 / l).toBeGreaterThan(1.2);
  });

  it('an L dwarf gets planets near its OWN habitable zone, not near 1 AU', () => {
    const p = pack();
    const s = LDWARF();
    const hz = calculateAllStellarZones(s, p).goldilocks;      // roughly 0.008 to 0.016 AU
    const all = pooled(s, 6);
    expect(all.length).toBeGreaterThan(0);
    // The old behaviour put every L-dwarf planet between 0.37 and 1.05 AU, about a hundredfold out.
    expect(median(all)).toBeLessThan(hz.outer * 25);
    expect(all.filter(a => a >= hz.inner && a <= hz.outer).length).toBeGreaterThan(0);
  });

  it('a Y dwarf gets a non-empty slot list (it used to silently get none)', () => {
    // Its system limit falls near 0.07 AU, below every slot in the old absolute-AU sequence, so the
    // list came out EMPTY and the generators made zero planets without saying so. Measured before
    // this change: 200 of 200 seeds produced a planetless Y dwarf.
    const slots = pooled(YDWARF(), 6);
    expect(slots.length).toBeGreaterThan(0);
  });

  it('no slot is inside the TRUE Roche limit, remnants included', () => {
    // This used to compare against `2.44 * R_star`, which is not the Roche limit — it drops the
    // density ratio the limit is made of. That form is 26,000x too small for a NEUTRON STAR and 26x
    // too small for a WHITE DWARF, so it would happily approve orbits well inside the radius that
    // shreds a planet, and ~900x too LARGE for a supergiant. The remnants are in this list precisely
    // because they are where the difference bites.
    const WD = () => star(0.6, 12000, 0.013, 'star/WD');
    const NS = () => star(1.4, 600000, 1.7e-5, 'star/NS');
    const SUPERGIANT = () => star(15, 3500, 900, 'star/M-I');
    for (const s of [SOL(), TRAPPIST1(), LDWARF(), YDWARF(), WD(), NS(), SUPERGIANT()]) {
      const roche = calculateRocheLimit(s);
      expect(roche).toBeGreaterThan(0);
      for (const a of pooled(s, 8)) expect(a).toBeGreaterThan(roche);
    }
  });
});

describe('orbital slots pack rather than sample a fixed list', () => {
  it('a system can hold more than nine planets', () => {
    // Titius-Bode yielded a hard maximum of nine usable positions (eleven with the pack's extended
    // sequence), so no system could ever be richer however the knobs were set.
    const p = pack();
    let best = 0;
    for (let i = 0; i < 40; i++) best = Math.max(best, calculateOrbitalSlots(SOL(), p, new SeededRNG(`n-${i}`), 16).length);
    expect(best).toBeGreaterThan(11);
  });

  it('asking for more bodies never returns fewer slots for the same seed', () => {
    const p = pack();
    for (let i = 0; i < 20; i++) {
      const few = calculateOrbitalSlots(SOL(), p, new SeededRNG(`m-${i}`), 3).length;
      const many = calculateOrbitalSlots(SOL(), p, new SeededRNG(`m-${i}`), 9).length;
      expect(many).toBeGreaterThanOrEqual(few);
    }
  });

  it('slots come back sorted, strictly increasing, and inside the system limit', () => {
    const p = pack();
    for (const s of [SOL(), TRAPPIST1(), LDWARF(), YDWARF()]) {
      const limit = calculateAllStellarZones(s, p).systemLimitAu;
      for (let i = 0; i < 20; i++) {
        const slots = calculateOrbitalSlots(s, p, new SeededRNG(`s-${i}`), 10);
        for (let k = 1; k < slots.length; k++) expect(slots[k]).toBeGreaterThan(slots[k - 1]);
        for (const a of slots) expect(a).toBeLessThan(limit);
      }
    }
  });

  it('is deterministic for a given seed', () => {
    const p = pack();
    const a = calculateOrbitalSlots(SOL(), p, new SeededRNG('same'), 8);
    const b = calculateOrbitalSlots(SOL(), p, new SeededRNG('same'), 8);
    expect(a).toEqual(b);
  });

  it('asking for zero bodies returns nothing', () => {
    expect(calculateOrbitalSlots(SOL(), pack(), new SeededRNG('z'), 0)).toEqual([]);
  });
});

describe('the pack owns the spacing rules', () => {
  it('a pack with no orbital_spacing falls back to geometric spacing off the STAR, not off 0.2 AU', () => {
    // The fallback branch was unreachable while every pack shipped a Titius-Bode block, and it
    // carried its own absolute-AU floor (`Math.max(minOrbitAU, 0.2)`) — 0.2 AU is most of a brown
    // dwarf's entire system. Now that the branch can run, it must start at the star's own edge.
    const p = pack();
    delete (p as any).generation_parameters.orbital_spacing;
    const slots = calculateOrbitalSlots(TRAPPIST1(), p, new SeededRNG('fb'), 6);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0]).toBeLessThan(0.1);
  });

  it('widening the pack band widens the system: the rules are data, not code', () => {
    const tight = pack(); const wide = pack();
    (tight as any).generation_parameters.orbital_spacing.spacing_ratio = [1.1, 1.15];
    (wide as any).generation_parameters.orbital_spacing.spacing_ratio = [2.5, 3.0];
    const span = (p: RulePack) => {
      let total = 0;
      for (let i = 0; i < 30; i++) {
        const s = calculateOrbitalSlots(SOL(), p, new SeededRNG(`w-${i}`), 6);
        if (s.length > 1) total += s[s.length - 1] / s[0];
      }
      return total;
    };
    expect(span(wide)).toBeGreaterThan(span(tight));
  });

  it('the shipped pack no longer carries the Sol-fitted Titius-Bode block', () => {
    expect((pack() as any).distributions.titius_bode_law).toBeUndefined();
    expect((pack() as any).generation_parameters.orbital_spacing).toBeDefined();
  });

  it('the mutual-Hill FLOOR still holds the chain apart when the ratio would crowd it', () => {
    // The ratio is the spacing rule; the Hill radius is the floor under it. Set an absurdly tight
    // ratio and the floor must still keep successive orbits apart — that is what stops a slot
    // opening either side of a massive body.
    const p = pack();
    (p as any).generation_parameters.orbital_spacing.spacing_ratio = [1.001, 1.002];
    for (let i = 0; i < 20; i++) {
      const slots = calculateOrbitalSlots(SOL(), p, new SeededRNG(`floor-${i}`), 8);
      for (let k = 1; k < slots.length; k++) {
        // Even at a ratio of 1.001 the floor must open a real gap, not a rounding one.
        expect(slots[k] / slots[k - 1]).toBeGreaterThan(1.01);
      }
    }
  });
});
