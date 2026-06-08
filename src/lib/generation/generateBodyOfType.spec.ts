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

  it('an iron world gets a metal-rich makeup and derived radius', () => {
    const fp = fingerprints().find((f) => f.class === 'planet/iron')!;
    const body = generateBodyOfType(fp, { distAU: 0.5, hostMassKg: 2e30, role: 'planet', rng: mid });
    expect((body.makeup?.metal ?? 0)).toBeGreaterThan(0.3);
    expect(body.radiusKm).toBeGreaterThan(0);
  });
});
