import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { depthProbe, pressureWords } from './depthView';
import { deriveSurfaceSpectrum } from './surfaceSpectrum';
import { GIANT_REFERENCE_BAR } from './atmosphereProfile';
import type { CelestialBody, RulePack } from '$lib/types';
import fixture from '../../../tests/output/solar-system-derived.json';

const atm = JSON.parse(readFileSync('static/rulepacks/starter-sf/atmospheres.json', 'utf8'));
const liq = JSON.parse(readFileSync('static/rulepacks/starter-sf/planets.json', 'utf8'));
const pack = { gasPhysics: atm.gasPhysics, liquids: liq.liquids } as unknown as RulePack;

const find = (n: any, name: string): any => {
  for (const b of n.nodes || []) { if (b.name === name) return b; const r = find(b, name); if (r) return r; }
  return null;
};
const root = Array.isArray(fixture) ? { nodes: fixture } : (fixture as any);
const probeFor = (name: string) => {
  const b = find(root, name) as CelestialBody;
  const s0 = (b as any).surfaceSpectrum;
  const r = deriveSurfaceSpectrum(b, { starTempK: s0.starTempK, luminositySolar: 1, distanceAU: s0.distanceAU }, pack)!;
  return depthProbe(b, r.curves.topOfAtmosphere, pack)!;
};

describe('going down into a giant', () => {
  it('exists only for a world with no ground', () => {
    const earth = find(root, 'Earth') as CelestialBody;
    const s0 = (earth as any).surfaceSpectrum;
    const r = deriveSurfaceSpectrum(earth, { starTempK: s0.starTempK, luminositySolar: 1, distanceAU: s0.distanceAU }, pack)!;
    expect(depthProbe(earth, r.curves.topOfAtmosphere, pack)).toBeNull();
    expect(probeFor('Jupiter')).toBeTruthy();
  });

  it('stops at the reference level and says why, because nothing is modelled beneath it', () => {
    const p = probeFor('Jupiter');
    expect(p.bottomBar).toBe(GIANT_REFERENCE_BAR);
    expect(p.floorReason).toMatch(/extrapolation/);
    // Asking for deeper is clamped, not extrapolated.
    expect(p.at(500).pBar).toBe(p.bottomBar);
  });

  it('gets warmer as you descend — the adiabat the cloud model already uses', () => {
    const p = probeFor('Jupiter');
    const ts = [0.001, 0.01, 0.1, 0.5, 1].map((b) => p.at(b).tempK);
    for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThanOrEqual(ts[i - 1]);
  });

  it('gets darker as you pass under a deck, and is lit by the star above it', () => {
    // Jupiter's ammonia deck has a base near 555 mbar and an optical depth in the hundreds. Above it
    // the light is the star through clear air; under it, starlight is essentially gone. That is not a
    // bug to soften — it is what being under an opaque cloud means, and the painter handles it.
    const p = probeFor('Jupiter');
    const above = p.at(0.1), below = p.at(0.9);
    expect(above.transmission).toBeCloseTo(1, 3);
    expect(below.transmission).toBeLessThan(0.01);
    expect(below.ceiling).not.toBeNull();
  });

  it('knows which deck it is looking down at, which is what the floor is painted in', () => {
    const p = probeFor('Jupiter');
    const high = p.at(0.01);
    expect(high.floor?.species).toBe('ammonia');
    expect(high.floorHex).toBeTruthy();
  });

  it('carries the light at THIS depth, so the balloons are re-lit by where they actually are', () => {
    const p = probeFor('Jupiter');
    const sum = (s: number[]) => s.reduce((a, b) => a + b, 0);
    expect(sum(p.at(0.01).light)).toBeGreaterThan(sum(p.at(0.9).light) * 50);
  });

  it('says a pressure the way a GM would', () => {
    expect(pressureWords(1)).toBe('1.0 bar');
    expect(pressureWords(0.555)).toBe('555 mbar');
    expect(pressureWords(0.00001)).toBe('10 µbar');
  });
});
