import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { TravellerImporter } from './importer';
import { systemProcessor } from '$lib/core/SystemProcessor';
import type { RulePack, CelestialBody, Barycenter, System } from '$lib/types';

/**
 * A multi-star Traveller import builds a real hierarchy (inbox D27).
 *
 * The importer used to lay the stars out itself: one barycentre for the first pair with its own
 * separation law, then further stars appended around that SAME centre at 1000 x 1.5^k AU with
 * e 0.1-0.6 and i_deg drawn uniformly from 0 to 180. Measured on the owner's Caladbolg
 * (F7 V + M0 V + M4 V), that produced B and C orbiting one centre at 1,024 and 1,342 AU with
 * e ~0.5-0.6 — CROSSING orbits, not a hierarchy — at 96.8 and 79 degrees to the planets, with
 * ~33,000-year periods. It now calls the generator's planStarHierarchy, which is the same planner
 * the wizard uses.
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
    const fp = path.join(base, f);
    if (fs.existsSync(fp)) p = deepMerge(p, JSON.parse(fs.readFileSync(fp, 'utf-8')));
  }
  return p as RulePack;
}

// The owner's system, as reported.
const CALADBOLG = { name: 'Caladbolg', uwp: 'A867999-C', pbg: '703', w: '8', stars: 'F7 V M0 V M4 V', tradeCodes: [], raw: '' };
const gen = (over: Record<string, unknown> = {}): System =>
  new TravellerImporter().generateTravellerSystem({ ...CALADBOLG, ...over } as any, pack());

const stars = (s: System) => s.nodes.filter((n) => n.kind === 'body' && (n as CelestialBody).roleHint === 'star') as CelestialBody[];
const baries = (s: System) => s.nodes.filter((n) => n.kind === 'barycenter') as Barycenter[];
const el = (n: any) => n.orbit?.elements ?? {};

describe('D27 — Caladbolg (F7 V + M0 V + M4 V)', () => {
  it('builds all three stars', () => {
    expect(stars(gen())).toHaveLength(3);
  });

  it('every stellar orbit is NEAR THE PLANE, not near-polar', () => {
    // The reported failure: 96.8 and 79 degrees. Uniform 0-180 made that the norm, not bad luck.
    for (const n of [...stars(gen()), ...baries(gen())]) {
      const i = el(n).i_deg;
      if (i === undefined) continue;
      expect(Math.abs(i)).toBeLessThan(15);
    }
  });

  it('every stellar orbit has a sane eccentricity', () => {
    for (const n of [...stars(gen()), ...baries(gen())]) {
      const e = el(n).e;
      if (e === undefined) continue;
      expect(e).toBeLessThan(0.7);
    }
  });

  it('is NESTED — no two siblings on crossing orbits round one centre', () => {
    const s = gen();
    // Group every orbiting node by the centre it orbits, then check that within a group no two
    // orbits can cross: the reported fault was B at 1,024 AU and C at 1,342 AU round the same
    // barycentre with e ~0.5-0.6, whose apo/peri overlap.
    const byHost = new Map<string, any[]>();
    for (const n of s.nodes) {
      const host = (n as any).orbit?.hostId;
      if (!host) continue;
      const roleHint = (n as CelestialBody).roleHint;
      if (n.kind !== 'barycenter' && roleHint !== 'star') continue;
      byHost.set(host, [...(byHost.get(host) ?? []), n]);
    }
    for (const [, group] of byHost) {
      const ranges = group.map((n) => {
        const { a_AU = 0, e = 0 } = el(n);
        return { peri: a_AU * (1 - e), apo: a_AU * (1 + e), name: n.name };
      }).sort((x, y) => x.peri - y.peri);
      // Two members of one barycentre are a PAIR — they orbit the same centre on opposite sides and
      // their radii are the mass split of one separation, so overlap there is correct. Three or more
      // siblings round one centre is the fault itself.
      expect(group.length).toBeLessThanOrEqual(2);
      expect(ranges.length).toBeLessThanOrEqual(2);
    }
  });

  it('separations are HIERARCHICAL — the outer level is far wider than the inner', () => {
    const s = gen();
    const seps = baries(s).map((b) => {
      const members = s.nodes.filter((n) => b.memberIds?.includes(n.id));
      return members.reduce((acc, m) => acc + (el(m).a_AU ?? 0), 0);
    }).sort((a, b) => a - b);
    expect(seps.length).toBeGreaterThanOrEqual(2);     // three stars → two levels
    // Each level at least a few times the one below (the planner targets ~7x).
    for (let i = 1; i < seps.length; i++) expect(seps[i]).toBeGreaterThan(seps[i - 1] * 3);
    // ...and the whole thing stays a system, not a 1,000+ AU sprawl reached by 1000 x 1.5^k.
    expect(seps[seps.length - 1]).toBeLessThan(500);
  });

  it('the Main World is still on the PRIMARY — the star Traveller LISTS first', () => {
    const s = gen();
    const main = s.nodes.find((n) => /Main World/.test(n.name)) as CelestialBody;
    expect(main).toBeDefined();
    const host = s.nodes.find((n) => n.id === main.parentId) as CelestialBody;
    expect(host.roleHint).toBe('star');
    expect(host.name).toBe('Caladbolg A');
  });

  it('LETTERS follow the Traveller listing, not the planner mass rank', () => {
    // The planner sorts seeds by mass before numbering them, so its index is a mass RANK. Caladbolg
    // is listed heaviest-first and would pass either way; this one is listed lightest-first, and it
    // is the case that catches a factory keyed on the plan index rather than the seed id.
    const s = gen({ stars: 'M4 V G2 V' });
    const named = Object.fromEntries(stars(s).map((x) => [x.name, x.classes?.[0] ?? '']));
    expect(named['Caladbolg A']).toMatch(/^star\/M4/);
    expect(named['Caladbolg B']).toMatch(/^star\/G2/);
    const main = s.nodes.find((n) => /Main World/.test(n.name)) as CelestialBody;
    const host = s.nodes.find((n) => n.id === main.parentId) as CelestialBody;
    expect(host.name).toBe('Caladbolg A');
  });

  it('processes without the barycentre reconciler moving anything into an unstable state', () => {
    const p = pack();
    const out = systemProcessor.process(gen(), p) as System;
    for (const st of stars(out)) {
      const e = el(st).e;
      if (e !== undefined) expect(e).toBeLessThan(0.7);
      expect(Number.isFinite(st.temperatureK ?? 0)).toBe(true);
    }
  });

  it('a single-star import is untouched: no barycentre, star at the root', () => {
    const s = gen({ stars: 'G2 V' });
    expect(baries(s)).toHaveLength(0);
    const star = stars(s)[0];
    expect(star.parentId).toBeNull();
  });

  it('a two-star import makes exactly one barycentre', () => {
    const s = gen({ stars: 'G2 V M3 V' });
    expect(stars(s)).toHaveLength(2);
    expect(baries(s)).toHaveLength(1);
  });
});
