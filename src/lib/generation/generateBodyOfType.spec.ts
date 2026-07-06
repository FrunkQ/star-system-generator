import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { generateBodyOfType, viableTypesAt } from './generateBodyOfType';
import { classifyByFingerprint } from '../system/classification';
import type { Fingerprint } from '$lib/types';

function fingerprints(): Fingerprint[] {
  const j = JSON.parse(fs.readFileSync(path.resolve('static/rulepacks/starter-sf/classification.json'), 'utf-8'));
  return j.classifier.fingerprints as Fingerprint[];
}
// Deterministic-ish RNG for the test (mid-band picks).
const mid = () => 0.5;

describe('viableTypesAt — location filters the menu', () => {
  it('the Goldilocks zone offers life/ocean worlds, not lava', () => {
    const fps = fingerprints();
    const names = viableTypesAt(290, 'planet', fps).map((f) => f.class);
    expect(names).toContain('planet/ocean');
    expect(names).toContain('planet/jungle');
    expect(names).not.toContain('planet/lava');
  });
  it('a hot close-in orbit offers lava, not ocean', () => {
    const names = viableTypesAt(1500, 'planet', fingerprints()).map((f) => f.class);
    expect(names).toContain('planet/lava');
    expect(names).not.toContain('planet/ocean');
  });
  it('moons are not offered giant types', () => {
    const names = viableTypesAt(150, 'moon', fingerprints()).map((f) => f.class);
    expect(names.every((n) => !/gas-giant|jupiter|neptune/.test(n))).toBe(true);
  });

  it('moons are mass-gated by the host: a terrestrial offers only small airless/icy moons (E1)', () => {
    const fps = fingerprints();
    const EARTH = 5.972e24;
    const names = viableTypesAt(250, 'moon', fps, 1 * EARTH).map((f) => f.class);
    expect(names).not.toContain('planet/super-earth');  // 2–10 M⊕ — far too big for a 1 M⊕ host
    expect(names).not.toContain('planet/ocean');         // substantial-world type — needs a real planet
    expect(names).not.toContain('planet/earth-like');
    expect(names.some((n) => /ice|barren|mesoplanet|planetesimal|desert|crater/.test(n))).toBe(true); // airless/icy stay
  });

  it('a gas-giant host offers MORE moon types than a terrestrial host, and 0 host mass = no gate (E1)', () => {
    const fps = fingerprints();
    const EARTH = 5.972e24;
    const terr = viableTypesAt(250, 'moon', fps, 1 * EARTH).length;
    const giant = viableTypesAt(250, 'moon', fps, 318 * EARTH).length;
    const ungated = viableTypesAt(250, 'moon', fps).length; // hostMassKg defaults 0 → no mass gate
    expect(giant).toBeGreaterThan(terr);
    expect(ungated).toBeGreaterThan(terr);
  });

  it('greenhouse types still offered at a cold-edge orbit (bare T_eq below the band)', () => {
    // earth-like band is T_eq [250,315]; at 235 K bare equilibrium it would fall out WITHOUT the
    // greenhouse cold-slack — but we know it carries a warming atmosphere, so it stays on the menu.
    const fps = fingerprints();
    const cold = viableTypesAt(235, 'planet', fps).map((f) => f.class);
    expect(cold).toContain('planet/earth-like');
    expect(cold).toContain('planet/ocean');
    // a non-greenhouse type with the same kind of band is NOT rescued this far down
    expect(cold).not.toContain('planet/lava');
  });
});

describe('generateBodyOfType — params land in the type bands', () => {
  it('a generated ocean world has high water coverage and the right mass band', () => {
    const fps = fingerprints();
    const fp = fps.find((f) => f.class === 'planet/ocean')!;
    const body = generateBodyOfType(fp, { distAU: 1, hostMassKg: 2e30, role: 'planet', rng: mid });
    expect(body.hydrosphere?.composition).toBe('water');
    expect(body.hydrosphere?.coverage).toBeGreaterThan(0.85);
    // and it MUST come with a greenhouse atmosphere, else its ocean would freeze at bare T_eq
    expect(body.atmosphere?.name).not.toBe('None');
    expect((body.atmosphere?.pressure_bar ?? 0)).toBeGreaterThan(0.5);
    expect((body.atmosphere as any)?.composition?.CO2).toBeGreaterThan(0);
  });

  it('a generated jungle world gets a biosphere (the life the GM is placing)', () => {
    const fp = fingerprints().find((f) => f.class === 'planet/jungle')!;
    const body = generateBodyOfType(fp, { distAU: 1, hostMassKg: 2e30, role: 'planet', rng: mid });
    expect(body.biosphere).toBeTruthy();
    expect(body.hydrosphere?.coverage).toBeGreaterThan(0.3);
  });

  it('an O2-biosignature habitable type (earth-like) still gets a greenhouse atmosphere', () => {
    // earth-like's fingerprint defines only an O2 band (greenhouse 0) — without sizing CO2 to the
    // orbit it would freeze at its cold edge. Generated at a cold T_eq it must carry CO2 (and keep O2).
    const fp = fingerprints().find((f) => f.class === 'planet/earth-like')!;
    const body = generateBodyOfType(fp, { distAU: 1, hostMassKg: 2e30, role: 'planet', rng: mid, teqK: 250 });
    const comp = (body.atmosphere as any)?.composition ?? {};
    expect(comp.O2).toBeGreaterThan(0);   // biosignature kept
    expect(comp.CO2).toBeGreaterThan(0);  // greenhouse added for the cold orbit
  });

  it('a superhabitable world is a super-earth with an iron core (dynamo + tectonics)', () => {
    // It must carry metal (for the molten-iron dynamo → magnetosphere) and land in the super-earth
    // mass band (so it earns the super-habitable bonus and stays geologically active when old).
    const fp = fingerprints().find((f) => f.class === 'planet/superhabitable')!;
    const body = generateBodyOfType(fp, { distAU: 1, hostMassKg: 2e30, role: 'planet', rng: mid, teqK: 285 });
    expect((body.makeup?.metal ?? 0)).toBeGreaterThan(0.1);
    const massMe = (body.massKg ?? 0) / 5.972e24;
    expect(massMe).toBeGreaterThanOrEqual(1.3);
    expect(massMe).toBeLessThanOrEqual(3.5);
  });

  it('earth-like gets an iron-core makeup (so the processor derives a magnetosphere)', () => {
    const fp = fingerprints().find((f) => f.class === 'planet/earth-like')!;
    const body = generateBodyOfType(fp, { distAU: 1, hostMassKg: 2e30, role: 'planet', rng: mid, teqK: 280 });
    expect((body.makeup?.metal ?? 0)).toBeGreaterThan(0.1);
  });

  it('a frozen type (ice) is NOT given a warming atmosphere', () => {
    // ice has a water hydrosphere too, but it must STAY frozen — the liquid-water atmosphere logic
    // must exclude it (no atmosphere, or at least no CO2 to warm it).
    const fp = fingerprints().find((f) => f.class === 'planet/ice')!;
    const body = generateBodyOfType(fp, { distAU: 5, hostMassKg: 2e30, role: 'planet', rng: mid, teqK: 150 });
    const comp = (body.atmosphere as any)?.composition ?? {};
    expect(comp.CO2 ?? 0).toBe(0);
  });

  it('a moon defaults to a small (not gravitationally significant) size (E1)', () => {
    // A no-mass-band type (airless rock) placed as a moon should default to a small body, not Earth-mass.
    const fp = fingerprints().find((f) => f.class === 'planet/barren')
      ?? fingerprints().find((f) => f.kind === 'base' && !f.match['mass_Me'] && !/giant|jupiter|neptune/.test(f.class))!;
    const body = generateBodyOfType(fp, { distAU: 1, hostMassKg: 5.972e24, role: 'moon', rng: mid });
    const massMe = (body.massKg ?? 0) / 5.972e24;
    expect(massMe).toBeGreaterThan(0);
    expect(massMe).toBeLessThan(0.1); // well under Earth — a proper satellite, not a co-planet
  });

  it('an iron world gets a metal-rich makeup and derived radius', () => {
    const fp = fingerprints().find((f) => f.class === 'planet/iron')!;
    const body = generateBodyOfType(fp, { distAU: 0.5, hostMassKg: 2e30, role: 'planet', rng: mid });
    expect((body.makeup?.metal ?? 0)).toBeGreaterThan(0.3);
    expect(body.radiusKm).toBeGreaterThan(0);
  });
});
