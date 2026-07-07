import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemProcessor } from '$lib/core/SystemProcessor';
import { fixUpImportedSystem } from '$lib/system/importFixup';
import type { System, RulePack, CelestialBody } from '$lib/types';
import { parseSc } from './parse';
import { convertSc, previewSc } from './convert';
import { importSc, buildImportReview, reviewToText } from './index';
import { isFluidGiant, rendersAsGiant } from '$lib/physics/makeup';

function isObject(x: any) { return x && typeof x === 'object' && !Array.isArray(x); }
function deepMerge(t: any, s: any): any { const o = { ...t }; if (isObject(t) && isObject(s)) Object.keys(s).forEach((k) => { o[k] = isObject(s[k]) && k in t ? deepMerge(t[k], s[k]) : s[k]; }); return o; }
function loadRulePack(): RulePack {
  const base = path.resolve('static/rulepacks/starter-sf');
  let pack = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8')) as RulePack;
  for (const f of ['liquids.json', 'classification.json', 'atmospheres.json']) { const p = path.join(base, f); if (fs.existsSync(p)) pack = deepMerge(pack, JSON.parse(fs.readFileSync(p, 'utf-8'))); }
  return pack;
}
const solMini = () => fs.readFileSync(path.resolve('tests/fixtures/spaceengine/sol-mini.sc'), 'utf-8');
const node = (s: System, name: string) => s.nodes.find((n) => n.name === name) as CelestialBody;

describe('spaceengine parse', () => {
  it('parses body blocks, keys, nested blocks and // comments', () => {
    const src = `// a comment\nStar "Sun/Sol" {\n  Class "G2V"\n  MassSol 1.0\n  Orbit { SemiMajorAxis 5 Eccentricity 0.1 }\n}\nLogLevel 0`;
    const bodies = parseSc(src);
    expect(bodies.length).toBe(1);
    expect(bodies[0].type).toBe('Star');
    expect(bodies[0].name).toBe('Sun/Sol');
    expect(bodies[0].keys.Class).toBe('G2V');
    expect(bodies[0].blocks.find((b) => b.type === 'Orbit')!.keys.SemiMajorAxis).toBe('5');
  });
});

describe('spaceengine convert — Sol fixture', () => {
  const result = convertSc([solMini()]);
  const sys = result.system;

  it('Sun is the root star (G class, 5778 K, no orbit)', () => {
    const sun = node(sys, 'Sun');
    expect(sun.roleHint).toBe('star');
    expect(sun.classes).toEqual(['star/G']);
    expect(sun.temperatureK).toBe(5778);
    expect(sun.orbit).toBeUndefined();
    expect(sun.parentId).toBeNull();
  });

  it('Earth: mass/radius/tilt/rotation + atmosphere + makeup, orbits the Sun (barycentre collapsed)', () => {
    const e = node(sys, 'Earth');
    const byId = new Map(sys.nodes.map((n) => [n.id, n]));
    expect(e.massKg! / 5.972e24).toBeCloseTo(1.0, 1);
    expect(e.radiusKm).toBeCloseTo(6378, 0);
    expect((e as any).axial_tilt_deg).toBeCloseTo(23.44, 1);
    expect(e.rotation_period_hours!).toBeCloseTo(23.93, 1);
    expect(e.atmosphere!.main).toBe('N2');
    expect(e.atmosphere!.pressure_bar!).toBeCloseTo(1.0, 1);
    expect((e.makeup!.metal ?? 0) + (e.makeup!.rock ?? 0)).toBeGreaterThan(0.9);
    // The lopsided Earth-Moon barycentre collapses → Earth orbits the Sun directly at ~1 AU.
    expect(byId.get(e.parentId as string)?.name).toBe('Sun');
    expect(e.orbit!.elements.a_AU).toBeCloseTo(1.0, 1);
  });

  it('lopsided Earth-Moon barycentre collapses: no barycentre node, Moon orbits Earth', () => {
    const byId = new Map(sys.nodes.map((n) => [n.id, n]));
    expect(sys.nodes.some((n) => n.name === 'Earth-Moon')).toBe(false); // barycentre dissolved
    const moon = node(sys, 'Moon');
    expect(byId.get(moon.parentId as string)?.name).toBe('Earth');
    expect(moon.roleHint).toBe('moon');
    // Moon's orbit around Earth is the full separation (~384,400 km).
    expect(moon.orbit!.elements.a_AU * 149597870.7).toBeGreaterThan(370000);
    expect(moon.orbit!.elements.a_AU * 149597870.7).toBeLessThan(400000);
  });

  it('system age comes from the star (4.57 Gyr)', () => {
    expect(sys.age_Gyr).toBeCloseTo(4.57, 2);
  });

  it('no derived leak: planets carry no temperatureK before processing', () => {
    expect(node(sys, 'Earth').temperatureK).toBeUndefined();
  });
});

describe('spaceengine orbit conventions + units', () => {
  const mu = 'MassSol 1.0';
  it('handles ArgOfPericen/MeanAnomaly AND LongOfPericen/MeanLongitude', () => {
    const direct = convertSc([`Star "S" { ${mu} }\nPlanet "P" { ParentBody "S" Mass 1 Radius 6000\n  Orbit { SemiMajorAxis 1 Eccentricity 0.1 Inclination 5 AscendingNode 80 ArgOfPericen 60 MeanAnomaly 30 } }`]);
    const el = (node(direct.system, 'P')).orbit!.elements;
    expect(el.Omega_deg).toBe(80); expect(el.omega_deg).toBe(60);

    const longi = convertSc([`Star "S" { ${mu} }\nPlanet "P" { ParentBody "S" Mass 1 Radius 6000\n  Orbit { SemiMajorAxis 1 Eccentricity 0.1 Inclination 5 AscendingNode 80 LongOfPericen 140 MeanLongitude 200 } }`]);
    const el2 = (node(longi.system, 'P')).orbit!.elements;
    expect(el2.omega_deg).toBe(60);   // LongOfPericen(140) - AscendingNode(80)
  });

  it('SemiMajorAxisKm is converted from km to AU', () => {
    const r = convertSc([`Star "S" { ${mu} }\nPlanet "P" { ParentBody "S" Mass 1 Radius 6000\n  Orbit { SemiMajorAxisKm 149597870.7 Eccentricity 0 } }`]);
    expect(node(r.system, 'P').orbit!.elements.a_AU).toBeCloseTo(1.0, 3);
  });

  it('mass slider skips small bodies (keeps stars/parents)', () => {
    const src = `Star "S" { ${mu} }\nPlanet "Big" { ParentBody "S" Mass 300 Radius 60000 Orbit { SemiMajorAxis 5 } }\nComet "Tiny" { ParentBody "S" Mass 1e-9 Radius 5 Orbit { SemiMajorAxis 30 } }`;
    const r = convertSc([src], { minBodyMassKg: 1e20 });
    expect(r.system.nodes.some((n) => n.name === 'Big')).toBe(true);
    expect(r.system.nodes.some((n) => n.name === 'Tiny')).toBe(false);
  });
});

describe('spaceengine binary (barycentre root)', () => {
  it('two stars parent to a root barycentre', () => {
    const src = `Barycenter "Root" { ParentBody "Root" Orbit { SemiMajorAxis 0 Eccentricity 0 } }\nStar "A" { ParentBody "Root" Class "K1V" MassSol 0.7 Orbit { SemiMajorAxis 45 Eccentricity 0.2 } }\nStar "B" { ParentBody "Root" Class "M2V" MassSol 0.6 Orbit { SemiMajorAxis 50 Eccentricity 0.2 } }`;
    const r = convertSc([src]);
    const byId = new Map(r.system.nodes.map((n) => [n.id, n]));
    const root = r.system.nodes.find((n) => !n.parentId)!;
    expect((root as any).kind).toBe('barycenter');
    const stars = r.system.nodes.filter((n) => (n as CelestialBody).roleHint === 'star');
    expect(stars.length).toBe(2);
    for (const s of stars) expect(byId.get(s.parentId as string)).toBe(root);
  });
});

describe('spaceengine ice-giant import keeps its real composition', () => {
  // SpaceEngine models an ice giant's fluid mantle as "Ices" (Neptune ≈ 78% ice / 15% gas). We used to
  // strip that and let SSG infer a gas-dominated mix so the renderer's gas>0.5 test would draw a giant;
  // now the renderer keys the giant look off mass + density, so the real composition is imported.
  const src = `Star "Sun/Sol" { Class "G2V" MassSol 1.0 }
Planet "Neptune" { ParentBody "Sun" Mass 17.15 Radius 24622
  Orbit { SemiMajorAxis 30.1 Eccentricity 0.008 }
  Interior { Composition { Ices 78 Hydrogen 15 Silicates 7 } } }`;

  it('imports the ice-dominated makeup (not stripped to gas) and reads as a fluid giant', () => {
    const neptune = node(convertSc([src]).system, 'Neptune');
    expect(neptune.makeup!.ice).toBeGreaterThan(0.7);   // real composition kept
    expect(neptune.makeup!.gas ?? 0).toBeLessThan(0.3);
    expect(isFluidGiant(neptune)).toBe(true);            // giant by mass + density, not gas fraction
    expect(rendersAsGiant(neptune)).toBe(true);
  });

  it('still classifies + renders as a giant after processing', () => {
    const pack = loadRulePack();
    const processed = systemProcessor.process(fixUpImportedSystem(convertSc([src]).system, pack), pack) as System;
    const neptune = node(processed, 'Neptune');
    expect(rendersAsGiant(neptune)).toBe(true);
    expect((neptune.classes ?? []).some((c) => /giant|neptune/.test(c))).toBe(true);
  });
});

describe('spaceengine end-to-end + review', () => {
  const pack = loadRulePack();
  it('convert → fixUp → process runs clean and classifies Earth; review renders', () => {
    const result = convertSc([solMini()]);
    const processed = systemProcessor.process(fixUpImportedSystem(result.system, pack), pack) as System;
    const earth = node(processed, 'Earth');
    expect(earth.temperatureK).toBeGreaterThan(0);
    expect((earth.classes ?? []).length).toBeGreaterThan(0);

    const text = reviewToText(buildImportReview(processed, result), { title: sysName(processed), ageGyr: processed.age_Gyr });
    expect(text).toContain('AUDIT vs source values');
  });

  it('previewSc lists bodies heaviest-first', () => {
    const preview = previewSc([solMini()]);
    expect(preview.bodies[0].name).toBe('Sun');
    for (let i = 1; i < preview.bodies.length; i++) expect(preview.bodies[i - 1].mass).toBeGreaterThanOrEqual(preview.bodies[i].mass);
  });
});

function sysName(s: System) { return s.name; }
