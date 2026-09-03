// G64 - RE-HOME A BODY FROM ITS ORBIT PANEL, WITHOUT IT JUMPING. Owner: "an advanced edit button
// next to the standard orbit - to reparent". The rule under test is one sentence: at the instant of
// the re-home the body is exactly where it was, and afterwards it orbits the new host. The trap it
// guards against is DATA-R29 / B111 - a re-home that keeps the old mean anomaly and epoch on a new
// host puts the body wherever that phase lands on the new ellipse, up to a diameter away.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { G, SOLAR_MASS_KG, EARTH_MASS_KG, AU_KM } from '$lib/constants';
import type { System, CelestialBody, Barycenter, RulePack } from '$lib/types';
import { systemProcessor } from '$lib/core/SystemProcessor';
import { computeWorldPositions3D, computeWorldStates3D } from '$lib/physics/worldPositions';
import { propagateState3D } from '$lib/physics/orbits';
import { reparentBody, hostCandidates, roleHintUnderHost, isDescendantOf } from './reparent';

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
const pack = loadRulePack();
const EPOCH = 1_700_000_000_000;
const T = EPOCH + 100 * 86400_000;           // the display instant: a hundred days in
const DAY = 86400_000;

const kep = (a_AU: number, e: number, i_deg: number, Omega_deg: number, omega_deg: number, M0_rad: number) =>
  ({ a_AU, e, i_deg, Omega_deg, omega_deg, M0_rad });
const orbit = (hostId: string, hostMassKg: number, el: ReturnType<typeof kep>) =>
  ({ hostId, hostMu: G * hostMassKg, t0: EPOCH, elements: el });

const M_SUN = SOLAR_MASS_KG;
const M_P1 = EARTH_MASS_KG, M_P2 = 318 * EARTH_MASS_KG, M_U = 14.5 * EARTH_MASS_KG, M_M1 = 0.0123 * EARTH_MASS_KG;

/** A star, a tilted Earth with a moon, a Jupiter, a Uranus on its side, and a Pluto-Charon pair. */
function fixture(): System {
  return {
    id: 'g64', name: 'Re-home', seed: 'g64', epochT0: EPOCH, age_Gyr: 4.6, rulePackId: '', rulePackVersion: '', tags: [],
    nodes: [
      { id: 'sun', kind: 'body', roleHint: 'star', name: 'Sun', parentId: null, massKg: M_SUN, radiusKm: 696000, temperatureK: 5778, classes: ['star/G'], tags: [] },
      { id: 'p1', kind: 'body', roleHint: 'planet', name: 'Earth', parentId: 'sun', massKg: M_P1, radiusKm: 6371, axial_tilt_deg: 23.4, tags: [],
        orbit: orbit('sun', M_SUN, kep(1.0, 0.017, 0.0, 0, 103, 0.5)) },
      { id: 'm1', kind: 'body', roleHint: 'moon', name: 'Luna', parentId: 'p1', massKg: M_M1, radiusKm: 1737, tags: [],
        orbit: orbit('p1', M_P1, kep(0.00257, 0.055, 5.1, 125, 318, 2.1)) },
      { id: 'p2', kind: 'body', roleHint: 'planet', name: 'Jupiter', parentId: 'sun', massKg: M_P2, radiusKm: 69911, axial_tilt_deg: 3.1, tags: [],
        orbit: orbit('sun', M_SUN, kep(5.2, 0.049, 1.3, 100, 274, 1.0)) },
      { id: 'u', kind: 'body', roleHint: 'planet', name: 'Uranus', parentId: 'sun', massKg: M_U, radiusKm: 25362, axial_tilt_deg: 97.8, tags: [],
        orbit: orbit('sun', M_SUN, kep(19.2, 0.046, 0.8, 74, 97, 4.0)) },
      { id: 'pluto', kind: 'body', roleHint: 'planet', name: 'Pluto', parentId: 'sun', massKg: 1.3e22, radiusKm: 1188, tags: [],
        orbit: orbit('sun', M_SUN, kep(39.5, 0.25, 17, 110, 113, 0.3)) },
      { id: 'charon', kind: 'body', roleHint: 'moon', name: 'Charon', parentId: 'pluto', massKg: 1.6e21, radiusKm: 606, tags: [],
        orbit: orbit('pluto', 1.3e22, kep(0.00013, 0.0, 0, 0, 0, 1.0)) }
    ]
  } as unknown as System;
}

const processed = (s: System) => systemProcessor.process(JSON.parse(JSON.stringify(s)), pack) as System;
const byId = (s: System, id: string) => s.nodes.find((n) => n.id === id) as CelestialBody;
const km = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * AU_KM;

/** Snapshot of everything a re-home writes, for the idempotence comparison. */
const shape = (s: System) => s.nodes.map((n) => ({
  id: n.id, parent: n.parentId, role: (n as CelestialBody).roleHint,
  orbit: (n as CelestialBody).orbit ? { host: (n as CelestialBody).orbit!.hostId, el: (n as CelestialBody).orbit!.elements, t0: (n as CelestialBody).orbit!.t0 } : null
}));

describe('G64 - re-home a body without moving it', () => {
  it('ABSOLUTE: a moon handed to the star is where it was, to within a kilometre, on a true orbit', () => {
    const sys = processed(fixture());
    const before = computeWorldStates3D(sys, T).get('m1')!;
    const res = reparentBody(sys, 'm1', 'sun', T);
    expect(res).toEqual({ mode: 'kepler', hostId: 'sun', hostName: 'Sun' });
    expect(byId(sys, 'm1').parentId).toBe('sun');
    expect(byId(sys, 'm1').orbit!.hostId).toBe('sun');
    expect(byId(sys, 'm1').orbit!.t0).toBe(T);
    const after = computeWorldStates3D(sys, T).get('m1')!;
    expect(km(before.r, after.r)).toBeLessThan(1);
    // The STATE is preserved, not just the position: same velocity vector to one part in a million.
    expect(Math.hypot(after.v.x - before.v.x, after.v.y - before.v.y, after.v.z - before.v.z) / Math.hypot(before.v.x, before.v.y, before.v.z)).toBeLessThan(1e-6);
    // Luna's heliocentric orbit is Earth's give or take its own kilometre a second, which at this
    // phase (moving against Earth's motion) is a = 0.94 AU: Earth's, perturbed, as it should be.
    expect(byId(sys, 'm1').orbit!.elements.a_AU).toBeGreaterThan(0.9);
    expect(byId(sys, 'm1').orbit!.elements.a_AU).toBeLessThan(1.1);
  });

  it('a moon handed to ANOTHER planet: where it was at the instant, then it follows the new host', () => {
    // The owner's case. Luna is 4.2 AU from Jupiter and arrives at Earth's 30 km/s, against an
    // escape speed of 0.6 km/s there - no ellipse exists, so it gets a circle at its current
    // distance (mode 'circular'), which keeps the instant exact and hands the physics of it to the
    // stability tags rather than refusing the GM.
    const sys = processed(fixture());
    const before = computeWorldPositions3D(sys, T).get('m1')!;
    const res = reparentBody(sys, 'm1', 'p2', T);
    expect(res).toEqual({ mode: 'circular', hostId: 'p2', hostName: 'Jupiter' });
    expect(km(before, computeWorldPositions3D(sys, T).get('m1')!)).toBeLessThan(1);
    // Ten days on, it has moved with Jupiter: still exactly the circle's radius from it (a circle is
    // frame-invariant, which is what makes this check honest under Jupiter's 3.1-degree tilt), and
    // nowhere near where Earth's orbit would have carried it.
    const later = computeWorldPositions3D(sys, T + 10 * DAY);
    const p2 = later.get('p2')!, m1 = later.get('m1')!;
    expect(Math.abs(km(m1, p2) - byId(sys, 'm1').orbit!.elements.a_AU * AU_KM)).toBeLessThan(1);
    // Earth has left it behind: 36 million km apart after ten days, against 384,000 before.
    expect(km(m1, later.get('p1')!)).toBeGreaterThan(50 * 384_400);
    // ...and its offset from Jupiter is the propagated orbit, read in Jupiter's equatorial frame.
    const rel = propagateState3D(byId(sys, 'm1'), T + 10 * DAY).r;
    const tilt = (byId(sys, 'p2').axial_tilt_deg! * Math.PI) / 180;
    const framed = { x: rel.x * Math.cos(tilt) - rel.z * Math.sin(tilt), y: rel.y, z: rel.x * Math.sin(tilt) + rel.z * Math.cos(tilt) };
    expect(km({ x: m1.x - p2.x, y: m1.y - p2.y, z: m1.z - p2.z }, framed)).toBeLessThan(1);
  });

  it('a TILTED host: a moon handed to Uranus (97.8 degrees) is still where it was - the frame BLAST', () => {
    const sys = processed(fixture());
    const before = computeWorldPositions3D(sys, T).get('m1')!;
    reparentBody(sys, 'm1', 'u', T);
    const after = computeWorldPositions3D(sys, T).get('m1')!;
    expect(km(before, after)).toBeLessThan(1);
    // And through process(), which re-reads the orbit in the parent's equatorial frame.
    const again = computeWorldPositions3D(processed(sys), T).get('m1')!;
    expect(km(before, again)).toBeLessThan(1);
  });

  it('a body handed to a host it is UNBOUND from gets a circle at its current distance, and stays put', () => {
    const sys = processed(fixture());
    const before = computeWorldPositions3D(sys, T);
    // Jupiter handed to Earth: 4.2 AU apart at tens of km/s relative - no ellipse exists.
    const res = reparentBody(sys, 'p2', 'p1', T);
    expect(res!.mode).toBe('circular');
    const o = byId(sys, 'p2').orbit!;
    expect(o.elements.e).toBe(0);
    expect(o.elements.a_AU * AU_KM).toBeCloseTo(km(before.get('p2')!, before.get('p1')!), 0);
    const after = computeWorldPositions3D(sys, T);
    expect(km(before.get('p2')!, after.get('p2')!)).toBeLessThan(1);
  });

  it('the role follows the host: a moon under a star is a planet, a planet under a planet is a moon', () => {
    const sys = processed(fixture());
    reparentBody(sys, 'm1', 'sun', T);
    expect(byId(sys, 'm1').roleHint).toBe('planet');
    reparentBody(sys, 'p1', 'p2', T);
    expect(byId(sys, 'p1').roleHint).toBe('moon');
    // ...and a star stays a star wherever it goes.
    const raw = fixture();
    raw.nodes.push({ id: 'twin', kind: 'body', roleHint: 'star', name: 'Twin', parentId: 'u', massKg: 2 * M_SUN, radiusKm: 1.2e6, temperatureK: 6000, classes: ['star/F'], tags: [],
      orbit: orbit('u', M_U, kep(0.1, 0, 0, 0, 0, 0)) } as unknown as CelestialBody);
    expect(roleHintUnderHost(raw, byId(raw, 'sun'), byId(raw, 'twin'))).toBe('star');
  });

  it('a 2-solar-mass body re-homed under a 1-solar-mass star: a PAIR forms on the next process', () => {
    const raw = fixture();
    raw.nodes.push({ id: 'twin', kind: 'body', roleHint: 'star', name: 'Twin', parentId: 'u', massKg: 2 * M_SUN, radiusKm: 1.2e6, temperatureK: 6000, classes: ['star/F'], tags: [],
      orbit: orbit('u', M_U, kep(0.1, 0, 0, 0, 0, 0)) } as unknown as CelestialBody);
    const res = reparentBody(raw, 'twin', 'sun', T);
    expect(res!.hostId).toBe('sun');
    const sys = processed(raw);
    const bary = sys.nodes.find((n) => n.kind === 'barycenter' && (n as Barycenter).memberIds.includes('twin')) as Barycenter;
    expect(bary, 'a comparable-mass companion promotes into a pair').toBeTruthy();
    expect([...bary.memberIds].sort()).toEqual(['sun', 'twin']);
    expect(byId(sys, 'twin').parentId).toBe(bary.id);
    expect(byId(sys, 'sun').parentId).toBe(bary.id);
    expect(byId(sys, 'twin').roleHint).toBe('star');
  });

  it('a member re-homed OUT of a pair dissolves it; the survivor takes the pair\'s orbit', () => {
    const sys = processed(fixture());            // Pluto-Charon (0.12) has paired
    const pair = sys.nodes.find((n) => n.kind === 'barycenter' && (n as Barycenter).memberIds.includes('charon')) as Barycenter;
    expect(pair).toBeTruthy();
    const plutoA = pair.orbit!.elements.a_AU;
    reparentBody(sys, 'charon', 'p2', T);
    const after = processed(sys);
    expect(after.nodes.some((n) => n.kind === 'barycenter' && (n as Barycenter).memberIds.includes('charon'))).toBe(false);
    expect(byId(after, 'charon').parentId).toBe('p2');
    expect(byId(after, 'pluto').parentId).toBe('sun');
    expect(byId(after, 'pluto').orbit!.elements.a_AU).toBeCloseTo(plutoA, 6);
  });

  it('process() is idempotent after a re-home, and moves nothing', () => {
    const sys = processed(fixture());
    const before = computeWorldPositions3D(sys, T).get('m1')!;
    reparentBody(sys, 'm1', 'p2', T);
    const p1 = processed(sys), p2 = processed(p1), p3 = processed(p2);
    expect(shape(p3)).toEqual(shape(p2));
    expect(km(before, computeWorldPositions3D(p3, T).get('m1')!)).toBeLessThan(1);
  });

  it('candidates: never the body itself or anything beneath it, so the root has none', () => {
    const sys = processed(fixture());
    const ids = (forBodyId: string) => hostCandidates(sys, { forBodyId }).map((n) => n.id).sort();
    // Moons host too (a moon's moon, a station), so Charon is offered; Luna is beneath Earth and is not.
    expect(ids('p1')).toEqual(['charon', 'p2', 'pluto', 'sun', 'u', ...sys.nodes.filter((n) => n.kind === 'barycenter').map((n) => n.id)].sort());
    expect(ids('p1')).not.toContain('m1');
    expect(ids('sun')).toEqual([]);
    expect(isDescendantOf(sys, 'm1', 'sun')).toBe(true);
    expect(isDescendantOf(sys, 'sun', 'm1')).toBe(false);
    // A cycle is refused rather than made: Earth cannot orbit its own moon.
    expect(reparentBody(sys, 'p1', 'm1', T)).toBeNull();
    expect(reparentBody(sys, 'p1', 'p1', T)).toBeNull();
    // The construct picker's list is the same rule without an exclusion.
    expect(hostCandidates(sys).map((n) => n.id)).toContain('m1');
  });
});
