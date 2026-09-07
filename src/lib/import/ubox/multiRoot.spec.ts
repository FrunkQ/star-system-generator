// B114 - THE UNIVERSE SANDBOX IMPORTER ASSUMED ONE STAR. Reported with a file: a distant binary of two
// 2-solar-mass stars came in as a star and a PLANET, every world of the second star as a MOON, and a
// moon's moon was pulled up a level. Measured against the v3.0.287 importer before any of this was
// written (the probe is in the B114 row): Acher was a `planet` of Ochel at 5,130 AU, its worlds
// `moon`s, and Bonae - 0.039 AU from Onae, 0.09 of the way across Onae's Hill sphere - was Acher's
// moon at 13.6 AU, because 16 AU into a 1,700 AU sphere SCORED deeper than 0.04 AU into a 0.43 AU
// one. On the Hystrine fixture the OTHER cause showed: Hill radii against the root's mass made a
// moon's sphere 30x too small, so Plunxiapus (66,050 km from Maei) was thrown to the star and
// dropped as unbound, and Aycrum (29,920 km from Uitaminus) became a planet.
//
// The user's file lives outside the repo (`../user-test-files/`, never committed), so the first
// block SKIPS when it is absent; the synthesised system below carries every shape it has, at
// numbers chosen so each fault would show on its own.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { G, SOLAR_MASS_KG, EARTH_MASS_KG, AU_KM } from '$lib/constants';
import type { System, CelestialBody, Barycenter, Kepler, RulePack } from '$lib/types';
import { systemProcessor } from '$lib/core/SystemProcessor';
import { fixUpImportedSystem } from '$lib/system/importFixup';
import { propagateState3D, orbitMeanMotion } from '$lib/physics/orbits';
import { computeWorldPositions3D } from '$lib/physics/worldPositions';
import { importUbox, buildImportReview, reviewToText } from './index';
import { convertUbox } from './convert';
import { inferHierarchy, type BodyInput } from './hierarchy';
import type { ParsedUbox, UsSimulation, UsEntity } from './types';
import type { V3 } from './kepler';

const AU_M = AU_KM * 1000;
const USER_FILE = path.resolve('../user-test-files/Diurnus-System-V2.1.2.ubox');
const haveUserFile = fs.existsSync(USER_FILE);

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

// Bodies only, by exact name: the pair's barycentre is named from both members, so a prefix match
// on a star's name would find the point instead of the star.
const node = (s: System, name: string) => s.nodes.find((n) => n.kind === 'body' && n.name === name) as CelestialBody;
const parentOf = (s: System, name: string) => s.nodes.find((n) => n.id === node(s, name).parentId);
const km = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * AU_KM;

/** The angle between two members seen from their barycentre, sampled across a period: 180 or nothing. */
function pairAnglesDeg(a: CelestialBody, b: CelestialBody, samples = 6): number[] {
  const n = Math.abs(orbitMeanMotion(a.orbit!));
  const periodMs = ((2 * Math.PI) / n) * 1000;
  return Array.from({ length: samples }, (_, i) => {
    const t = a.orbit!.t0 + (periodMs * i) / samples;
    const ra = propagateState3D(a, t).r, rb = propagateState3D(b, t).r;
    const dot = ra.x * rb.x + ra.y * rb.y + ra.z * rb.z;
    const mag = Math.hypot(ra.x, ra.y, ra.z) * Math.hypot(rb.x, rb.y, rb.z);
    return (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI;
  });
}

// ---------------------------------------------------------------------------------------------
// A synthesised Universe Sandbox save: a 2.2 / 0.3 solar-mass binary 40 AU apart (e = 0.3), with
// each star's own retinue, a moon's moon, and a circumbinary planet. Every state vector is built
// from elements by the engine's OWN propagator and handed over in the US frame (Y up), so the
// converter sees exactly what a real save would carry.
// ---------------------------------------------------------------------------------------------
const M_A = 2.2 * SOLAR_MASS_KG;
const M_B = 0.3 * SOLAR_MASS_KG;
const kep = (a_AU: number, e: number, i_deg: number, Omega_deg: number, omega_deg: number, M0_rad: number): Kepler =>
  ({ a_AU, e, i_deg, Omega_deg, omega_deg, M0_rad });

/** Relative state (metres, m/s, engine frame z-up) of a body on `el` about a host of mass `hostMass`. */
function relState(el: Kepler, hostMass: number, bodyMass: number): { r: V3; v: V3 } {
  const st = propagateState3D({ orbit: { hostId: 'h', hostMu: G * (hostMass + bodyMass), t0: 0, elements: el } }, 0);
  return { r: [st.r.x * AU_M, st.r.y * AU_M, st.r.z * AU_M], v: [st.v.x * AU_M, st.v.y * AU_M, st.v.z * AU_M] };
}
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** Engine frame (z up) -> Universe Sandbox frame (Y up): the inverse of kepler.ts `toWork`. */
const toUs = (v: V3): V3 => [v[0], v[2], v[1]];
const vec = (v: V3) => v.map((x) => x.toPrecision(17)).join(';');

interface Spec { name: string; id: number; category: 'star' | 'planet' | 'moon'; mass: number; radius: number; el?: Kepler; host?: string; }
const SPECS: Spec[] = [
  { name: 'Ochel', id: 1, category: 'star', mass: M_A, radius: 1.5e9 },
  { name: 'Acher', id: 2, category: 'star', mass: M_B, radius: 3e8, host: 'Ochel', el: kep(40, 0.3, 12, 40, 70, 1.1) },
  // Ochel's own planet, well inside the pair (S-type)
  { name: 'Yohura', id: 3, category: 'planet', mass: 300 * EARTH_MASS_KG, radius: 7e7, host: 'Ochel', el: kep(2.5, 0.02, 1, 10, 20, 0.4) },
  // Acher's planet: 0.8 AU from a 0.3-solar-mass star, with a moon and a moon's moon
  { name: 'Onae', id: 4, category: 'planet', mass: 40 * EARTH_MASS_KG, radius: 2.5e7, host: 'Acher', el: kep(0.8, 0.03, 2, 30, 50, 2.0) },
  { name: 'Bonae', id: 5, category: 'moon', mass: 0.25 * EARTH_MASS_KG, radius: 4e6, host: 'Onae', el: kep(0.004, 0.01, 1, 0, 0, 0.7) },
  { name: 'Conae', id: 6, category: 'moon', mass: 1e-4 * EARTH_MASS_KG, radius: 3e5, host: 'Bonae', el: kep(0.00003, 0.0, 0, 0, 0, 1.4) },
  // Circumbinary: 400 AU from the pair, well outside the 40 AU separation (P-type)
  { name: 'Seves', id: 7, category: 'planet', mass: 2 * EARTH_MASS_KG, radius: 8e6, host: 'PAIR', el: kep(400, 0.05, 3, 0, 0, 3.0) }
];

function synthesisedSim(): { parsed: ParsedUbox; usPos: Map<string, V3> } {
  const usPos = new Map<string, V3>();
  const absR = new Map<string, V3>();
  const absV = new Map<string, V3>();
  const massOf = new Map(SPECS.map((s) => [s.name, s.mass]));
  // Ochel is the frame origin; the pair's barycentre is where the mass-weighted mean lands.
  for (const s of SPECS) {
    if (!s.host) { absR.set(s.name, [0, 0, 0]); absV.set(s.name, [0, 0, 0]); continue; }
    if (s.host === 'PAIR') {
      const rA = absR.get('Ochel')!, rB = absR.get('Acher')!, vA = absV.get('Ochel')!, vB = absV.get('Acher')!;
      const M = M_A + M_B;
      const rP: V3 = [(rA[0] * M_A + rB[0] * M_B) / M, (rA[1] * M_A + rB[1] * M_B) / M, (rA[2] * M_A + rB[2] * M_B) / M];
      const vP: V3 = [(vA[0] * M_A + vB[0] * M_B) / M, (vA[1] * M_A + vB[1] * M_B) / M, (vA[2] * M_A + vB[2] * M_B) / M];
      const { r, v } = relState(s.el!, M, s.mass);
      absR.set(s.name, add(rP, r)); absV.set(s.name, add(vP, v));
      continue;
    }
    const { r, v } = relState(s.el!, massOf.get(s.host)!, s.mass);
    absR.set(s.name, add(absR.get(s.host)!, r));
    absV.set(s.name, add(absV.get(s.host)!, v));
  }
  const entities: UsEntity[] = SPECS.map((s) => {
    usPos.set(s.name, toUs(absR.get(s.name)!));
    return {
      $type: 'Body', Name: s.name, Id: s.id, Category: s.category, Mass: s.mass, Radius: s.radius,
      Position: vec(toUs(absR.get(s.name)!)), Velocity: vec(toUs(absV.get(s.name)!)),
      Parent: -1, CustomOrbitParentId: -1,
      Components: [
        { $type: 'Celestial', Category: s.category === 'star' ? 2 : 3, StarType: s.category === 'star' ? 1 : 0, Luminosity: s.category === 'star' ? 1e27 : 0 },
        { $type: 'HeatComponent', SurfaceTemperature: s.category === 'star' ? 6000 : 250 }
      ]
    };
  });
  const sim: UsSimulation = { Name: 'Synthesised binary', Entities: entities };
  const simText = JSON.stringify(sim);
  return { parsed: { manifest: null, sim, simText, buildRevision: 48569, buildName: 'synth' }, usPos };
}

const separationKm = (usPos: Map<string, V3>, a: string, b: string) => {
  const p = usPos.get(a)!, q = usPos.get(b)!;
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) / 1000;
};

describe('B114 - a synthesised binary with each star\'s own retinue', () => {
  const { parsed, usPos } = synthesisedSim();
  const result = convertUbox(parsed);
  const sys = result.system as System;

  it('both stars are STARS, members of ONE root barycentre - the second star is not a planet', () => {
    const stars = sys.nodes.filter((n) => (n as CelestialBody).roleHint === 'star');
    expect(stars.map((s) => s.name).sort()).toEqual(['Acher', 'Ochel']);
    const barys = sys.nodes.filter((n) => n.kind === 'barycenter') as Barycenter[];
    expect(barys.length).toBe(1);
    expect(barys[0].parentId).toBeNull();
    expect(barys[0].orbit).toBeUndefined();
    expect([...barys[0].memberIds].sort()).toEqual(stars.map((s) => s.id).sort());
    expect(barys[0].effectiveMassKg).toBe(M_A + M_B);
    expect(barys[0].tags).toEqual([{ key: 'barycenter/auto' }]);
    expect(barys[0].name).toBe('Ochel-Acher Barycentre');
    expect(result.counts).toEqual({ stars: 2, planets: 3, moons: 2, other: 1, rings: 0 });
    expect(result.skipped).toEqual([]);
  });

  it('each star seeds its own chain: Yohura is a PLANET of Ochel, Onae a PLANET of Acher', () => {
    expect(parentOf(sys, 'Yohura')!.name).toBe('Ochel');
    expect(node(sys, 'Yohura').roleHint).toBe('planet');
    expect(parentOf(sys, 'Onae')!.name).toBe('Acher');
    expect(node(sys, 'Onae').roleHint).toBe('planet');
  });

  it('a moon stays with its planet and a moon\'s moon with its moon - the star does not win on score', () => {
    // Bonae is 0.004 AU from Onae; Onae's Hill sphere about a 0.3-solar star is 0.8 * cbrt(40 Me / 0.9 Msun)
    // = 0.039 AU, so Bonae is a tenth of the way across it - and 0.8 AU into Acher's 20-AU sphere,
    // which the old depth score called "deeper".
    expect(parentOf(sys, 'Bonae')!.name).toBe('Onae');
    expect(node(sys, 'Bonae').roleHint).toBe('moon');
    expect(parentOf(sys, 'Conae')!.name).toBe('Bonae');
    expect(node(sys, 'Conae').roleHint).toBe('moon');
  });

  it('a body outside the pair\'s separation orbits the PAIR, and its orbit is honest about the pair\'s state', () => {
    const bary = sys.nodes.find((n) => n.kind === 'barycenter')!;
    expect(node(sys, 'Seves').parentId).toBe(bary.id);
    expect(node(sys, 'Seves').roleHint).toBe('planet');
    expect(node(sys, 'Seves').orbit!.hostMu).toBeCloseTo(G * (M_A + M_B), -20);
    expect(node(sys, 'Seves').orbit!.elements.a_AU).toBeCloseTo(400, 1);
  });

  it('ABSOLUTE: the stored orbits put every body where the save had it, to within a kilometre', () => {
    const pos = computeWorldPositions3D(sys, 0);
    const at = (name: string) => pos.get(node(sys, name).id)!;
    // The pair members, on their split orbits about the barycentre at the origin: each sits its
    // mass-share of the separation from the point (the old importer had Ochel AT the origin).
    const sep = km(at('Ochel'), at('Acher'));
    expect(Math.abs(sep - separationKm(usPos, 'Ochel', 'Acher'))).toBeLessThan(1);
    const origin = { x: 0, y: 0, z: 0 };
    expect(Math.abs(km(at('Ochel'), origin) - sep * (M_B / (M_A + M_B)))).toBeLessThan(1);
    expect(Math.abs(km(at('Acher'), origin) - sep * (M_A / (M_A + M_B)))).toBeLessThan(1);
    // The separation is 40 AU * (1 - 0.3) at periapsis .. this M0 lands mid-way: a real number, not a ratio.
    expect(km(at('Ochel'), at('Acher'))).toBeGreaterThan(28 * AU_KM);
    expect(km(at('Ochel'), at('Acher'))).toBeLessThan(52 * AU_KM);
    for (const [a, b] of [['Onae', 'Acher'], ['Bonae', 'Onae'], ['Conae', 'Bonae'], ['Yohura', 'Ochel'], ['Seves', 'Ochel'], ['Seves', 'Acher']]) {
      expect(Math.abs(km(at(a), at(b)) - separationKm(usPos, a, b)), `${a}-${b}`).toBeLessThan(1);
    }
  });

  it('the pair is emitted INTO the engine\'s one-epoch pair convention: process() finds nothing to change', () => {
    const pack = loadRulePack();
    const before = JSON.parse(JSON.stringify(sys)) as System;
    const after = systemProcessor.process(fixUpImportedSystem(JSON.parse(JSON.stringify(sys)), pack), pack) as System;
    for (const name of ['Ochel', 'Acher']) {
      const b = node(before, name).orbit!, a = node(after, name).orbit!;
      for (const k of ['a_AU', 'e', 'i_deg', 'Omega_deg', 'omega_deg', 'M0_rad'] as const) {
        expect(a.elements[k], `${name}.${k}`).toBeCloseTo(b.elements[k], 9);
      }
      expect(a.t0).toBe(b.t0);
      expect(a.hostMu).toBeCloseTo(b.hostMu, -20);
      expect(a.n_rad_per_s).toBeCloseTo(b.n_rad_per_s!, 15);
    }
    // ...and the members sit opposite each other at every instant, which is what a pair IS (B111).
    for (const angle of pairAnglesDeg(node(after, 'Ochel'), node(after, 'Acher'))) expect(angle).toBeCloseTo(180, 4);
    // Still one barycentre - the reconciler neither re-promoted nor demoted anything.
    expect(after.nodes.filter((n) => n.kind === 'barycenter').length).toBe(1);
    // Whole-system idempotence, the house guard: a second pass changes nothing on any pair member.
    const again = systemProcessor.process(JSON.parse(JSON.stringify(after)), pack) as System;
    for (const name of ['Ochel', 'Acher', 'Seves', 'Onae']) {
      expect(node(again, name).orbit!.elements).toEqual(node(after, name).orbit!.elements);
    }
  });

  it('a Hill radius is judged against the mass the host ACTUALLY orbits - the root-mass fault, isolated', () => {
    // ONE star, so the score fault cannot rescue this. A 0.25-Earth-mass moon 0.004 AU from a
    // 40-Earth-mass planet has a Hill sphere of 0.004 * cbrt(0.25 / 120) = 5.1e-4 AU about the
    // PLANET, but only 0.004 * cbrt(0.25 Me / 3 Msun) = 2.5e-5 AU if judged against the STAR - and
    // a moonlet 3e-5 AU out is inside the first and outside the second. Against the root's mass it
    // fell through to the planet as a second moon; it is the moon's moon.
    const star: BodyInput = { id: 's', name: 'S', category: 'star', mass: SOLAR_MASS_KG, pos: [0, 0, 0], vel: [0, 0, 0] };
    const chain: Array<[string, number, Kepler, string]> = [
      ['P', 40 * EARTH_MASS_KG, kep(0.8, 0.03, 2, 30, 50, 2.0), 's'],
      ['M', 0.25 * EARTH_MASS_KG, kep(0.004, 0.01, 1, 0, 0, 0.7), 'P'],
      ['m', 1e-4 * EARTH_MASS_KG, kep(0.00003, 0.0, 0, 0, 0, 1.4), 'M']
    ];
    const inputs: BodyInput[] = [star];
    for (const [id, mass, el, host] of chain) {
      const h = inputs.find((i) => i.id === host)!;
      const { r, v } = relState(el, h.mass, mass);
      inputs.push({ id, name: id, category: 'planet', mass, pos: add(h.pos, toUs(r)), vel: add(h.vel, toUs(v)) });
    }
    const h = inferHierarchy(inputs);
    const p = h.placements.find((x) => x.id === 'm')!;
    expect(p.parentId).toBe('M');
    expect(p.roleHint).toBe('moon');
    expect(p.unbound).toBe(false);
    expect(p.elements!.a_AU).toBeCloseTo(0.00003, 7);
    expect(h.pairs).toEqual([]);
  });

  it('the promote ratio is the engine\'s: a 5% companion stays a satellite, an 8% one pairs', () => {
    const mk = (ratio: number) => {
      const inputs: BodyInput[] = [
        { id: 'a', name: 'A', category: 'star', mass: SOLAR_MASS_KG, pos: [0, 0, 0], vel: [0, 0, 0] },
        { id: 'b', name: 'B', category: 'star', mass: ratio * SOLAR_MASS_KG, pos: [0, 0, 0], vel: [0, 0, 0] }
      ];
      const { r, v } = relState(kep(30, 0.1, 0, 0, 0, 1), SOLAR_MASS_KG, ratio * SOLAR_MASS_KG);
      inputs[1].pos = toUs(r); inputs[1].vel = toUs(v);
      return inferHierarchy(inputs);
    };
    expect(mk(0.05).pairs.length).toBe(0);
    expect(mk(0.05).placements.find((p) => p.id === 'b')!.parentId).toBe('a');
    expect(mk(0.08).pairs.length).toBe(1);
    expect(mk(0.08).pairs[0].memberIds).toEqual(['a', 'b']);
  });
});

describe.skipIf(!haveUserFile)('B114 - the reporter\'s file: two 2-solar-mass stars, 7,770 AU apart', () => {
  const result = haveUserFile ? importUbox(new Uint8Array(fs.readFileSync(USER_FILE))) : null!;
  const sys = result?.system as System;

  it('both stars are STARS, and they pair under one root barycentre', () => {
    const stars = sys.nodes.filter((n) => (n as CelestialBody).roleHint === 'star');
    expect(stars.map((s) => s.name).sort()).toEqual(['Acher Diurnus (Aeolis)', 'Ochel Diurnus (Maynoh)']);
    const barys = sys.nodes.filter((n) => n.kind === 'barycenter') as Barycenter[];
    expect(barys.length).toBe(1);
    expect(barys[0].parentId).toBeNull();
    expect([...barys[0].memberIds].sort()).toEqual(stars.map((s) => s.id).sort());
    for (const s of stars) expect(s.parentId).toBe(barys[0].id);
    expect(result.counts.stars).toBe(2);
    expect(result.skipped.filter((s) => s.reason === 'unbound')).toEqual([]);
  });

  it('Onae orbits Acher as a PLANET and Bonae orbits Onae as a MOON - a moon of a moon is not pulled up', () => {
    expect(node(sys, 'Onae').parentId).toBe(node(sys, 'Acher Diurnus (Aeolis)').id);
    expect(node(sys, 'Onae').roleHint).toBe('planet');
    expect(node(sys, 'Bonae').parentId).toBe(node(sys, 'Onae').id);
    expect(node(sys, 'Bonae').roleHint).toBe('moon');
    // Oaxaga was the same fault one level down: a moon of Kondyme (itself Nocheu's moon), pulled up to Nocheu.
    expect(parentOf(sys, 'Oaxaga')!.name).toBe('Kondyme');
  });

  it('ABSOLUTE: Bonae sits 5.8 million km from Onae, to within a kilometre of where the save put it', () => {
    const pos = computeWorldPositions3D(sys, 0);
    const d = km(pos.get(node(sys, 'Bonae').id)!, pos.get(node(sys, 'Onae').id)!);
    expect(d).toBeGreaterThan(5.7e6);
    expect(d).toBeLessThan(5.9e6);
    // The stars, 7,770 AU apart on their split orbits about the barycentre - Ochel (2.18 Msun)
    // 2.12/4.30 of the way from the point, Acher the rest. Under the old importer Ochel WAS the point.
    const ochel = node(sys, 'Ochel Diurnus (Maynoh)'), acher = node(sys, 'Acher Diurnus (Aeolis)');
    const sep = km(pos.get(ochel.id)!, pos.get(acher.id)!);
    expect(sep / AU_KM).toBeGreaterThan(7700);
    expect(sep / AU_KM).toBeLessThan(7850);
    const origin = { x: 0, y: 0, z: 0 };
    const mO = ochel.massKg!, mA = acher.massKg!;
    expect(Math.abs(km(pos.get(ochel.id)!, origin) - sep * (mA / (mO + mA)))).toBeLessThan(1);
    expect(Math.abs(km(pos.get(acher.id)!, origin) - sep * (mO / (mO + mA)))).toBeLessThan(1);
  });

  it('through fixUp + process the pair stays a pair, opposite at every instant, and the review renders', () => {
    const pack = loadRulePack();
    const snapshotClone = JSON.parse(JSON.stringify(result.snapshot));
    const processed = systemProcessor.process(fixUpImportedSystem(JSON.parse(JSON.stringify(sys)), pack), pack) as System;
    expect(processed.nodes.filter((n) => n.kind === 'barycenter').length).toBe(1);
    for (const angle of pairAnglesDeg(node(processed, 'Ochel Diurnus (Maynoh)'), node(processed, 'Acher Diurnus (Aeolis)'))) expect(angle).toBeCloseTo(180, 4);
    // The second star classifies as a STAR (it imported as a planet with no class before).
    expect(node(processed, 'Acher Diurnus (Aeolis)').classes?.[0]).toMatch(/^star\//);
    // And NOTHING MOVED: the reconciler had a pair to promote before, and its promotion offsets M0
    // by pi, which walks an eccentric member (e = 0.52 here) round its orbit. Emitting the pair in
    // the coupling pass's own convention means process() finds it settled and leaves every body put.
    const before = computeWorldPositions3D(sys, 0), after = computeWorldPositions3D(processed, 0);
    for (const name of ['Ochel Diurnus (Maynoh)', 'Acher Diurnus (Aeolis)', 'Onae', 'Bonae', 'Yohura']) {
      expect(km(before.get(node(sys, name).id)!, after.get(node(processed, name).id)!), name).toBeLessThan(1);
    }
    const text = reviewToText(buildImportReview(processed, { ...result, snapshot: snapshotClone }), { title: 'Diurnus', ageGyr: sys.age_Gyr });
    expect(text).toContain('AUDIT vs source values');
    expect(result.assumptions.some((a) => /no star found/i.test(a))).toBe(false);
  });
});
