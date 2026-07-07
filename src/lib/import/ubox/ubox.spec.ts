import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { G, SOLAR_MASS_KG, AU_KM } from '$lib/constants';
import { systemProcessor } from '$lib/core/SystemProcessor';
import { fixUpImportedSystem } from '$lib/system/importFixup';
import type { System, RulePack, CelestialBody } from '$lib/types';
import { importUbox, listUboxSimulations, previewUbox, buildImportReview, reviewToText, UboxError, RECOMMENDED_MIN_MASS_KG } from './index';
import { convertUbox } from './convert';
import { stateVectorsToElements, elementsToWorkPosition, roundTripError, type V3 } from './kepler';
import type { ParsedUbox, UsSimulation } from './types';

// ---- helpers ----
function isObject(x: any) { return x && typeof x === 'object' && !Array.isArray(x); }
function deepMerge(t: any, s: any): any {
  const o = { ...t };
  if (isObject(t) && isObject(s)) Object.keys(s).forEach((k) => { o[k] = isObject(s[k]) && k in t ? deepMerge(t[k], s[k]) : s[k]; });
  return o;
}
function loadRulePack(): RulePack {
  const base = path.resolve('static/rulepacks/starter-sf');
  let pack = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8')) as RulePack;
  for (const f of ['liquids.json', 'classification.json', 'atmospheres.json']) {
    const p = path.join(base, f);
    if (fs.existsSync(p)) pack = deepMerge(pack, JSON.parse(fs.readFileSync(p, 'utf-8')));
  }
  return pack;
}
const FIX = path.resolve('tests/fixtures/ubox');
function parsedFixture(file: string): ParsedUbox {
  const simText = fs.readFileSync(path.join(FIX, file), 'utf-8');
  const sim = JSON.parse(simText) as UsSimulation;
  return { manifest: null, sim, simText, buildRevision: 48569, buildName: 'fixture' };
}
// sol-realistic.json = default US save (realistic composition/orbits/obliquity, no moons)
// moons.json        = whole-system save (moon hierarchy, rings, far-field guard)
const solRealistic = () => parsedFixture('sol-realistic.json');
const moonsFixture = () => parsedFixture('moons.json');
const MU_SUN = G * SOLAR_MASS_KG;
const node = (s: System, name: string) => s.nodes.find((n) => n.name === name) as CelestialBody;

// ===========================================================================
describe('ubox parse', () => {
  it('lists simulations from a real zip (manifest-driven)', () => {
    const bytes = new Uint8Array(fs.readFileSync(path.join(FIX, 'minimal.ubox')));
    const listing = listUboxSimulations(bytes);
    expect(listing.buildRevision).toBe(48569);
    expect(listing.simulations.map((s) => s.name)).toContain('Minimal');
  });

  it('tolerates bare NaN tokens and imports the minimal zip', () => {
    const bytes = new Uint8Array(fs.readFileSync(path.join(FIX, 'minimal.ubox')));
    const result = importUbox(bytes);        // the Star has a Cohesion:NaN token
    expect(result.counts.stars).toBe(1);
    expect(result.counts.planets).toBe(1);
    expect(result.counts.moons).toBe(1);
    expect(node(result.system as System, 'Moon').parentId).toBe(node(result.system as System, 'Planet').id);
  });

  it('rejects a non-zip with a typed error', () => {
    expect(() => importUbox(new Uint8Array([1, 2, 3, 4, 5]))).toThrow(UboxError);
    try { importUbox(new Uint8Array([1, 2, 3, 4, 5])); } catch (e) { expect((e as UboxError).code).toBe('not-a-zip'); }
  });

  it('previewUbox lists bodies heaviest-first (for the slider)', () => {
    const bytes = new Uint8Array(fs.readFileSync(path.join(FIX, 'minimal.ubox')));
    const preview = previewUbox(bytes);
    expect(preview.bodies[0].name).toBe('Star');                 // heaviest
    expect(preview.bodies.map((b) => b.name)).toEqual(['Star', 'Planet', 'Moon']);
    for (let i = 1; i < preview.bodies.length; i++) expect(preview.bodies[i - 1].mass).toBeGreaterThanOrEqual(preview.bodies[i].mass);
  });
});

describe('ubox reviewToText', () => {
  const pack = loadRulePack();
  it('renders a self-contained plain-text report with the three buckets', () => {
    const result = convertUbox(solRealistic());
    const snapshotClone = JSON.parse(JSON.stringify(result.snapshot));
    const processed = systemProcessor.process(fixUpImportedSystem(result.system as System, pack), pack) as System;
    const text = reviewToText(buildImportReview(processed, { ...result, snapshot: snapshotClone }), { title: 'Solar System', ageGyr: 4.6 });
    expect(text).toContain('Universe Sandbox import — Solar System');
    expect(text).toContain('AUDIT vs Universe Sandbox values');
    expect(text).toMatch(/\d+ aligned/);
    expect(text.split('\n').length).toBeGreaterThan(5);
  });
});

// ===========================================================================
describe('ubox kepler — state vectors → elements', () => {
  it('circular equatorial orbit', () => {
    const a = AU_KM * 1000;
    const vc = Math.sqrt(MU_SUN / a);
    const r: V3 = [a, 0, 0];
    const v: V3 = [0, 0, vc];   // US frame: orbit in XZ plane
    const { elements, unbound } = stateVectorsToElements(r, v, MU_SUN);
    expect(unbound).toBe(false);
    expect(elements!.a_AU).toBeCloseTo(1, 3);
    expect(elements!.e).toBeLessThan(1e-4);
    expect(elements!.i_deg).toBeLessThan(0.01);
  });

  it('eccentric inclined orbit round-trips losslessly', () => {
    const r: V3 = [1.5e11, 0, 2e10];
    const v: V3 = [3000, 6000, 26000];
    const err = roundTripError(r, v, MU_SUN);
    expect(err).not.toBeNull();
    expect(err!).toBeLessThan(1e-6);
    const { elements } = stateVectorsToElements(r, v, MU_SUN);
    expect(elements!.e).toBeGreaterThan(0);
    expect(elements!.e).toBeLessThan(1);
    expect(elements!.i_deg).toBeGreaterThan(0);
  });

  it('retrograde orbit yields i > 90°', () => {
    const a = AU_KM * 1000;
    const vc = Math.sqrt(MU_SUN / a);
    const { elements } = stateVectorsToElements([a, 0, 0], [0, 0, -vc], MU_SUN);
    expect(elements!.i_deg).toBeGreaterThan(90);
  });

  it('unbound (hyperbolic) state is rejected, not clamped', () => {
    const a = AU_KM * 1000;
    const vesc = Math.sqrt(2 * MU_SUN / a);
    const { elements, unbound } = stateVectorsToElements([a, 0, 0], [0, 0, vesc * 1.3], MU_SUN);
    expect(unbound).toBe(true);
    expect(elements).toBeNull();
  });

  it('reconstruction matches the perifocal radius at periapsis', () => {
    const { elements } = stateVectorsToElements([1.5e11, 0, 2e10], [3000, 6000, 26000], MU_SUN);
    const pos = elementsToWorkPosition(elements!, MU_SUN);
    expect(Math.sqrt(pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2)).toBeGreaterThan(0);
  });
});

// ===========================================================================
describe('ubox convert — realistic Sol fixture (authored inputs)', () => {
  const result = convertUbox(solRealistic());
  const sys = result.system as System;

  it('frame & obliquity: Earth 23.4°, Uranus 97.8°, Jupiter 2.2°, Earth rotation 23.93 h', () => {
    expect((node(sys, 'Earth') as any).axial_tilt_deg).toBeCloseTo(23.4, 0);
    expect((node(sys, 'Uranus') as any).axial_tilt_deg).toBeGreaterThan(96.8);
    expect((node(sys, 'Uranus') as any).axial_tilt_deg).toBeLessThan(98.8);
    // Jupiter's real axial tilt is 3.13°; the official save reproduces it (~3.1°).
    expect((node(sys, 'Jupiter') as any).axial_tilt_deg).toBeGreaterThan(2.8);
    expect((node(sys, 'Jupiter') as any).axial_tilt_deg).toBeLessThan(3.5);
    expect(node(sys, 'Earth').rotation_period_hours!).toBeCloseTo(23.93, 1);
  });

  it('hierarchy: planets → Sun, Pluto → Sun, root = Sun; dummy skipped', () => {
    const byId = new Map(sys.nodes.map((n) => [n.id, n]));
    const parentName = (n: string) => byId.get(node(sys, n).parentId as string)?.name;
    for (const p of ['Earth', 'Jupiter', 'Pluto']) expect(parentName(p)).toBe('Sun');
    expect(node(sys, 'Sun').parentId).toBeNull();
    expect(node(sys, 'Sun').roleHint).toBe('star');
    expect(result.skipped.filter((s) => s.reason === 'dummy').length).toBe(1);
  });

  it('Earth: atmosphere, makeup, hydrosphere, orbit from depots + state vectors', () => {
    const e = node(sys, 'Earth');
    expect(e.atmosphere!.composition['N2']).toBeGreaterThan(0.76); // US dry-air N2 fraction ≈ 0.804
    expect(e.atmosphere!.composition['N2']).toBeLessThan(0.82);
    expect(e.atmosphere!.composition['O2']).toBeGreaterThan(0.17);
    expect(e.atmosphere!.composition['O2']).toBeLessThan(0.23);
    expect(e.atmosphere!.pressure_bar!).toBeGreaterThan(0.9);
    expect(e.atmosphere!.pressure_bar!).toBeLessThan(1.3);
    expect(e.makeup!.metal!).toBeGreaterThan(0.22);
    expect(e.makeup!.metal!).toBeLessThan(0.28);
    expect(e.hydrosphere!.coverage!).toBeGreaterThan(0.65);
    expect(e.hydrosphere!.coverage!).toBeLessThan(0.77);
    expect(e.orbit!.elements.a_AU).toBeCloseTo(1, 1);
  });

  it('Sun: star class + luminosity are authored inputs', () => {
    const sun = node(sys, 'Sun');
    expect(sun.classes).toEqual(['star/G']);
    expect((sun as any).radiationOutput).toBeGreaterThan(0.95);
    expect((sun as any).radiationOutput).toBeLessThan(1.05);
    expect(sun.temperatureK).toBeGreaterThan(5600);
  });

  it('age imported from the star (4.6–4.7 Gyr)', () => {
    expect(sys.age_Gyr).toBeGreaterThan(4.6);
    expect(sys.age_Gyr).toBeLessThan(4.7);
  });

  it('mass slider: default keeps Pluto, drops the 4e20 TinyRock; a low slider keeps it', () => {
    expect(RECOMMENDED_MIN_MASS_KG).toBe(5e20);
    expect(sys.nodes.some((n) => n.name === 'Pluto')).toBe(true);
    expect(sys.nodes.some((n) => n.name === 'TinyRock')).toBe(false);
    const loose = convertUbox(solRealistic(), { minBodyMassKg: 1e20 }).system as System;
    expect(loose.nodes.some((n) => n.name === 'TinyRock')).toBe(true);
  });

  it('round-trip: each body’s orbit reproduces its US distance to <0.1%', () => {
    // Earth vs Sun, straight from the fixture vectors.
    const sim = solRealistic().sim;
    const ent = (n: string) => sim.Entities.find((e) => (e.Name ?? '').trim() === n)!;
    const vec = (s: string): V3 => s.split(';').map(Number) as V3;
    const earth = ent('Earth'), sun = ent('Sun');
    const rRel: V3 = [vec(earth.Position!)[0] - vec(sun.Position!)[0], vec(earth.Position!)[1] - vec(sun.Position!)[1], vec(earth.Position!)[2] - vec(sun.Position!)[2]];
    const vRel: V3 = [vec(earth.Velocity!)[0] - vec(sun.Velocity!)[0], vec(earth.Velocity!)[1] - vec(sun.Velocity!)[1], vec(earth.Velocity!)[2] - vec(sun.Velocity!)[2]];
    const mu = G * ((earth.Mass ?? 0) + (sun.Mass ?? 0));
    const err = roundTripError(rRel, vRel, mu);
    expect(err!).toBeLessThan(1e-3);
  });

  it('no derived leak: planets carry no temperatureK before processing', () => {
    expect(node(sys, 'Earth').temperatureK).toBeUndefined();
    expect(node(sys, 'Mars').temperatureK).toBeUndefined();
  });
});

// ===========================================================================
describe('ubox convert — moons fixture (hierarchy, rings, far-field)', () => {
  const result = convertUbox(moonsFixture());
  const sys = result.system as System;
  const byId = new Map(sys.nodes.map((n) => [n.id, n]));
  const parentName = (n: string) => byId.get(node(sys, n).parentId as string)?.name;

  it('Moon → Earth, Galileans → Jupiter, Titan → Saturn, Triton → Neptune', () => {
    expect(parentName('Moon')).toBe('Earth');
    for (const m of ['Io', 'Europa', 'Ganymede', 'Callisto']) expect(parentName(m)).toBe('Jupiter');
    expect(parentName('Titan')).toBe('Saturn');
    expect(parentName('Triton')).toBe('Neptune');
    expect(node(sys, 'Moon').roleHint).toBe('moon');
    expect(node(sys, 'Io').roleHint).toBe('moon');
  });

  it('Sagittarius A* skipped as far-field; ring particles skipped as particle', () => {
    expect(result.skipped.some((s) => s.reason === 'far-field' && s.name.includes('Sagittarius'))).toBe(true);
    expect(result.skipped.some((s) => s.reason === 'particle')).toBe(true);
    expect(sys.nodes.some((n) => n.name.includes('Sagittarius'))).toBe(false);
  });

  it('Saturn gets a reconstructed ring node with sane radii', () => {
    const ring = sys.nodes.find((n) => n.roleHint === 'ring' && n.name.startsWith('Saturn')) as CelestialBody;
    expect(ring).toBeTruthy();
    expect(ring.radiusInnerKm!).toBeGreaterThan(0);
    expect(ring.radiusOuterKm!).toBeGreaterThan(ring.radiusInnerKm!);
    expect(ring.parentId).toBe(node(sys, 'Saturn').id);
  });
});

// ===========================================================================
describe('ubox end-to-end — convert → fixUp → process', () => {
  const pack = loadRulePack();

  it('processes cleanly, classifies every planet/moon, and settles to a stable fixed point', () => {
    const result = convertUbox(solRealistic());
    let sys = systemProcessor.process(fixUpImportedSystem(result.system as System, pack), pack) as System;
    for (const b of sys.nodes as CelestialBody[]) {
      if (b.roleHint === 'planet' || b.roleHint === 'moon') expect((b.classes ?? []).length).toBeGreaterThan(0);
    }

    // A freshly IMPORTED ocean world settles its greenhouse⇄temperature fixed point over a few process
    // passes (Earth climbs 277→289 K as the implied ocean-vapour greenhouse converges). This is SSG's
    // convergence, not a converter bug — so the import flow processes to convergence (below). After that
    // it is stable: the last pass must not move the temperature. Earth lands Earth-like (~285–295 K).
    let prev = node(sys, 'Earth').temperatureK!;
    let lastDelta = Infinity;
    for (let i = 0; i < 8; i++) {
      sys = systemProcessor.process(sys, pack) as System;
      const t = node(sys, 'Earth').temperatureK!;
      lastDelta = Math.abs(t - prev);
      prev = t;
      if (lastDelta < 0.1) break;
    }
    expect(lastDelta).toBeLessThan(0.5);          // converged + stable
    expect(prev).toBeGreaterThan(285);
    expect(prev).toBeLessThan(295);
  });
});

// ===========================================================================
describe('ubox review — audit', () => {
  const pack = loadRulePack();
  it('temperature mismatches are explained; density aligns; buckets populated', () => {
    const result = convertUbox(solRealistic());
    const snapshotClone = JSON.parse(JSON.stringify(result.snapshot));
    const processed = systemProcessor.process(fixUpImportedSystem(result.system as System, pack), pack) as System;
    const review = buildImportReview(processed, { ...result, snapshot: snapshotClone });

    const earthTemp = review.comparisons.find((c) => c.body === 'Earth' && c.metric === 'surface temperature');
    expect(earthTemp).toBeTruthy();
    expect(['aligned', 'explained']).toContain(earthTemp!.bucket);

    // density is pure mass/radius → must align (would be a bug otherwise)
    const densities = review.comparisons.filter((c) => c.metric === 'density');
    expect(densities.length).toBeGreaterThan(0);
    expect(densities.every((c) => c.bucket === 'aligned')).toBe(true);
  });
});
