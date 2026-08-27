// B98 — A PAIR MAY RIDE A LAGRANGE POINT, and the engine now has words for it.
//
// The report: "it keeps [putting] juventas onto an impossibly wide orbit when i make any change
// (theyre both trojans)". A GM had made two Jupiter trojans into a binary. Before the fix the
// companion's semi-major axis climbed on EVERY process - 2.5e-6, 2.91, 4.55, 5.46, 5.97, 6.26,
// 6.42, 6.51 AU - because `reconcileBarycenters` and `deriveCoOrbitalOrbits` each owned the same
// node's orbit and parentage and undid one another. The number gave it away: the chord across the
// 60-degree L4 offset is exactly the orbital radius, and that is what it converged toward - the
// reconciler was reading the Lagrange OFFSET as the pair's SEPARATION.
//
// The configuration is real. (617) Patroclus-Menoetius is a binary Jupiter trojan: two ~110 km
// bodies about 680 km apart, librating about L4 together. The tight case below is that, to scale.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SystemProcessor } from '$lib/core/SystemProcessor';
import type { RulePack, Barycenter, CelestialBody } from '$lib/types';

function loadPack(): any {
  const base = 'static/rulepacks/starter-sf';
  const merge = (a: any, b: any): any => {
    const o: any = { ...a };
    for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && a?.[k] ? merge(a[k], v) : v;
    return o;
  };
  let p: any = JSON.parse(readFileSync(`${base}/main.json`, 'utf8'));
  for (const f of ['stars.json', 'planets.json', 'generation.json', 'orbital_constants.json', 'classification.json', 'atmospheres.json', 'liquids.json']) {
    try { p = merge(p, JSON.parse(readFileSync(`${base}/${f}`, 'utf8'))); } catch { /* optional */ }
  }
  return p;
}
const pack = loadPack() as RulePack;
const SUN = 1.989e30;
const AU_KM = 149597870.7;

/** Jupiter, plus a trojan at its L4 that the GM has given a companion of comparable mass. */
function binaryTrojan(sepAU: number): any {
  return { id: 's', name: 'T', seed: 's', epochT0: 0, age_Gyr: 4.6, rulePackId: '', rulePackVersion: '', tags: [], nodes: [
    { id: 'sun', name: 'Sol', kind: 'body', roleHint: 'star', parentId: null, massKg: SUN, radiusKm: 696340,
      temperatureK: 5778, radiationOutput: 1, tags: [], classes: ['star/G2V'] },
    { id: 'jup', name: 'Jupiter', kind: 'body', roleHint: 'planet', parentId: 'sun', massKg: 1.898e27, radiusKm: 69911, tags: [],
      orbit: { hostId: 'sun', hostMu: 1.327e20, t0: 0, elements: { a_AU: 5.204, e: 0.0489, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } },
    { id: 'pomona', name: 'Pomona', kind: 'body', roleHint: 'planet', parentId: 'sun', massKg: 1.4e18, radiusKm: 40, tags: [],
      coOrbital: { hostId: 'jup', point: 'l4' },
      orbit: { hostId: 'sun', hostMu: 1.327e20, t0: 0, elements: { a_AU: 5.204, e: 0.0489, i_deg: 0, omega_deg: 60, Omega_deg: 0, M0_rad: 0 } } },
    { id: 'juventas', name: 'Juventas', kind: 'body', roleHint: 'moon', parentId: 'pomona', massKg: 1.1e18, radiusKm: 37, tags: [],
      orbit: { hostId: 'pomona', hostMu: 9.34e7, t0: 0, elements: { a_AU: sepAU, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } }
  ]};
}

const process = (s: any, times = 1) => {
  for (let i = 0; i < times; i++) s = new SystemProcessor().process(s, pack);
  return s;
};
const node = (s: any, name: string) => (s.nodes as any[]).find((n) => n.name === name);
const pairOf = (s: any) => (s.nodes as any[]).find((n) => n.kind === 'barycenter') as Barycenter;
const stab = (n: any) => (n.tags ?? []).map((t: any) => t.key).filter((k: string) => k.startsWith('stability/') || k.startsWith('fate/'));

// 673 km apart — Patroclus-Menoetius to scale.
const TIGHT = 4.5e-6;

describe('the pair rides the point, not its members', () => {
  const s = process(binaryTrojan(TIGHT), 3);

  it('promotion hands the Lagrange marker UP to the barycentre', () => {
    const bary = pairOf(s);
    expect(bary).toBeTruthy();
    expect(bary.coOrbital?.point).toBe('l4');
    expect(bary.coOrbital?.hostId).toBe('jup');
  });

  it('and takes it OFF the members, so nothing can fight over their orbits', () => {
    expect((node(s, 'Pomona') as CelestialBody).coOrbital).toBeUndefined();
    expect((node(s, 'Juventas') as CelestialBody).coOrbital).toBeUndefined();
  });

  it('the pair sits at the L-point and the members keep their own mutual orbit', () => {
    expect(pairOf(s).orbit!.elements.a_AU).toBeCloseTo(5.204, 3);
    const sep = (node(s, 'Pomona').orbit.elements.a_AU + node(s, 'Juventas').orbit.elements.a_AU) * AU_KM;
    expect(sep).toBeGreaterThan(600);
    expect(sep).toBeLessThan(750);
  });
});

describe('THE RUNAWAY IS GONE — this is the bug itself', () => {
  it('the companion does not drift by so much as a float wobble over eight passes', () => {
    let s = process(binaryTrojan(TIGHT), 1);
    const after1 = node(s, 'Juventas').orbit.elements.a_AU;
    s = process(s, 7);
    expect(node(s, 'Juventas').orbit.elements.a_AU).toBe(after1);
    // It used to reach ~6.5 AU by here. Anything near Jupiter's orbit means the Lagrange offset is
    // being read as a separation again.
    expect(node(s, 'Juventas').orbit.elements.a_AU).toBeLessThan(1e-5);
  });

  it('the whole system is byte-identical when processed again (PHY-1)', () => {
    const s = process(binaryTrojan(TIGHT), 3);
    const once = JSON.stringify(s);
    expect(JSON.stringify(process(s, 2))).toBe(once);
  });
});

describe('and it is JUDGED, which is the half that was silent before', () => {
  it('a real Patroclus-scale pair is clean', () => {
    const s = process(binaryTrojan(TIGHT), 3);
    expect(stab(node(s, 'Pomona'))).toEqual([]);
    expect(stab(node(s, 'Juventas'))).toEqual([]);
  });

  it('a pair too wide for its Hill sphere at the point is flung apart, and says why', () => {
    // 75,000 km apart: sep/Hill = 1.35 at Jupiter's L4.
    const s = process(binaryTrojan(5e-4), 3);
    for (const name of ['Pomona', 'Juventas']) {
      const n = node(s, name);
      expect(stab(n), name).toContain('stability/very-unstable');
      expect(stab(n), name).toContain('fate/eject');   // BOTH leave — no lighter member to be thrown
      expect(n.orbitalStabilityDetails).toMatch(/too widely separated to stay a pair/);
      expect(n.orbitalStabilityDetails).toMatch(/sep\/Hill=/);
    }
  });

  it('sharing Jupiter’s orbit is not an "overlap" — that is what a trojan IS', () => {
    // The pair's barycentre has exactly Jupiter's semi-major axis by construction. Before B98 the
    // binary-pair assessor read that as a crossing with a body 760 million times its mass.
    const s = process(binaryTrojan(TIGHT), 3);
    expect(node(s, 'Pomona').orbitalStabilityDetails ?? '').not.toMatch(/overlap with Jupiter/);
  });
});
