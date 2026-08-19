import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { depthProbe, pressureWords } from './depthView';
import { deriveSurfaceSpectrum } from './surfaceSpectrum';
import { GIANT_REFERENCE_BAR } from './atmosphereProfile';
import { GIANT_DEPTH_LIMIT_BAR } from './depthView';
import { deriveCloudDecks } from './cloudDecks';
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

  it('goes to the depth limit and says why it stops there', () => {
    const p = probeFor('Jupiter');
    expect(p.bottomBar).toBe(GIANT_DEPTH_LIMIT_BAR);
    expect(p.floorReason).toMatch(/Galileo/);
    // Asking for deeper is clamped, not extrapolated.
    expect(p.at(5000).pBar).toBe(p.bottomBar);
  });

  it('matches the one real descent — Galileo into Jupiter — to a few percent', () => {
    // The probe read ~330 K at 10 bar and ~425 K at 22 bar, where it died. This is the check that
    // the dry adiabat is honest this deep, and the reason the limit is 100 bar and not 1.
    const p = probeFor('Jupiter');
    expect(p.at(10).tempK).toBeGreaterThan(300);
    expect(p.at(10).tempK).toBeLessThan(350);
    expect(p.at(22).tempK).toBeGreaterThan(390);
    expect(p.at(22).tempK).toBeLessThan(450);
  });

  it('keeps the stored temperature AT the reference level, whatever depth it continues to', () => {
    // Continuing the profile below 1 bar must not move the reading at 1 bar, or descending would
    // quietly rewrite what the processor published.
    const p = probeFor('Jupiter');
    const j = find(root, 'Jupiter');
    expect(p.at(GIANT_REFERENCE_BAR).tempK).toBeCloseTo(j.temperatureK, 0);
  });

  it('does NOT change the decks the processor publishes', () => {
    // The published set comes from the shallow profile and is what a renderer looking down from
    // space can see. The deep scan is the balloon's business only.
    const j = find(root, 'Jupiter');
    const published = deriveCloudDecks(j, pack).map((d) => `${d.species}@${d.baseBar!.toFixed(2)}`);
    expect(published).toEqual(['ammonium-hydrosulfide@0.75', 'ammonia@0.56']);
  });

  it('finds a water deck below the reference when there is water to condense', () => {
    // The fixture's Jupiter carries no H2O at all (H2, He, CH4, NH3, H2S), so its deep scan
    // correctly finds none — that is a catalogue fact, not a model limit. Give it Galileo's ~0.05%
    // and the deck appears where Galileo met it, a few bar down.
    const j = find(root, 'Jupiter');
    const wet = { ...j, atmosphere: { ...j.atmosphere, composition: { ...j.atmosphere.composition, H2O: 0.0005 } } };
    const s0 = j.surfaceSpectrum;
    const r = deriveSurfaceSpectrum(wet as any, { starTempK: s0.starTempK, luminositySolar: 1, distanceAU: s0.distanceAU }, pack)!;
    const p = depthProbe(wet as any, r.curves.topOfAtmosphere, pack)!;
    const water = p.decks.find((d) => d.species === 'water');
    expect(water, p.decks.map((d) => d.species).join(',')).toBeTruthy();
    expect(water!.baseBar!).toBeGreaterThan(GIANT_REFERENCE_BAR);
    expect(water!.baseBar!).toBeLessThan(20);
  });

  it('closes the view as the air thickens — haze veils your lamps and shortens your sight', () => {
    const p = probeFor('Jupiter');
    // High up the horizon binds — the air at a microbar would let you see for ever — so the figure
    // is the same down to where the density finally overtakes it, then it falls fast.
    expect(p.at(100).seeM).toBeLessThan(p.at(1).seeM / 2);
    expect(p.at(100).extinctionPerM).toBeGreaterThan(p.at(1).extinctionPerM * 20);
    expect(p.at(1).seeM).toBeLessThanOrEqual(p.at(0.05).seeM);
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
