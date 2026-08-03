// Real-sky import — fill-out tests. The three promises under test are the
// ones the dialogue makes: anchors survive untouched, generated worlds are
// tagged and deterministic (one person's Polaris is everyone's), and nothing
// generated lands inside an anchor's dynamical exclusion zone.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CelestialBody } from '$lib/types';
import { SOL_CENTRE } from './query.mjs';
import { convertArchiveRows } from './convert.mjs';
import { EPOCH } from './constants.mjs';
import { GENERATED_TAG, fillOutSystem } from './fillout';
import { loadStarterPack } from './testPack';

const repo = resolve(__dirname, '..', '..', '..', '..');
const cache = JSON.parse(readFileSync(join(repo, 'scripts', 'starmap-build', 'data', 'cache', 'archive-pscomppars.json'), 'utf-8'));

const rulePack = loadStarterPack();
const freshSystem = (name: string) => {
  const { systems } = convertArchiveRows(cache, { region: { centre: SOL_CENTRE, radiusLy: 30 }, generated: 'test' });
  const hit = systems.find((s: any) => s.name === name);
  if (!hit) throw new Error(`${name} not in converted set`);
  return structuredClone(hit.system);
};

describe('fillOutSystem', () => {
  it('keeps every confirmed anchor byte-identical and only ADDS nodes', () => {
    const sys = freshSystem('GJ 581');
    const before = structuredClone(sys.nodes);
    fillOutSystem(sys, rulePack);
    for (const orig of before) {
      expect(sys.nodes.find((n: any) => n.id === orig.id)).toEqual(orig);
    }
    expect(sys.nodes.length).toBeGreaterThanOrEqual(before.length);
  });

  it('tags every added node origin/generated, pins t0 to the epoch, and reports honestly', () => {
    const sys = freshSystem('HD 219134');
    const beforeIds = new Set(sys.nodes.map((n: any) => n.id));
    const report = fillOutSystem(sys, rulePack);
    const added = sys.nodes.filter((n: any) => !beforeIds.has(n.id)) as CelestialBody[];
    expect(added.length).toBe(report.addedPlanets + report.addedMoons + added.filter((n) => !['planet', 'moon'].includes(n.roleHint as string)).length);
    for (const n of added) {
      expect((n.tags ?? []).some((t) => t.key === GENERATED_TAG), `${n.id} tagged`).toBe(true);
      if (n.orbit) expect(n.orbit.t0, `${n.id} t0`).toBe(EPOCH);
    }
    // Confirmed planets stay untagged — a measured world must never read as a guess.
    for (const n of sys.nodes.filter((x: any) => beforeIds.has(x.id))) {
      expect(((n as CelestialBody).tags ?? []).some((t) => t.key === GENERATED_TAG)).toBe(false);
    }
  });

  it('is DETERMINISTIC: two independent fill-outs of the same star agree exactly', () => {
    const a = freshSystem('GJ 581');
    const b = freshSystem('GJ 581');
    fillOutSystem(a, rulePack);
    fillOutSystem(b, rulePack);
    expect(a.nodes.map((n: any) => n.id)).toEqual(b.nodes.map((n: any) => n.id));
    expect(a).toEqual(b);
  });

  it('respects the anchors dynamically: no generated planet within 3.5 mutual Hill radii', () => {
    const sys = freshSystem('GJ 581');
    const star = sys.nodes.find((n: any) => n.roleHint === 'star') as CelestialBody;
    const beforeIds = new Set(sys.nodes.map((n: any) => n.id));
    fillOutSystem(sys, rulePack);
    const anchors = sys.nodes.filter((n: any) => n.roleHint === 'planet' && beforeIds.has(n.id)) as CelestialBody[];
    const generated = sys.nodes.filter((n: any) => n.roleHint === 'planet' && !beforeIds.has(n.id)) as CelestialBody[];
    for (const g of generated) {
      for (const anchor of anchors) {
        const aG = g.orbit!.elements.a_AU, aC = anchor.orbit!.elements.a_AU;
        const rh = Math.cbrt(((g.massKg ?? 0) + (anchor.massKg ?? 0)) / (3 * star.massKg!)) * ((aG + aC) / 2);
        expect(Math.abs(aG - aC), `${g.id} vs ${anchor.id}`).toBeGreaterThanOrEqual(3.5 * rh);
      }
    }
  });

  it('names generated planets with the letters the catalogue has not used', () => {
    const sys = freshSystem('GJ 581'); // confirmed: b, c, e
    const beforeIds = new Set(sys.nodes.map((n: any) => n.id));
    fillOutSystem(sys, rulePack);
    const genNames = sys.nodes
      .filter((n: any) => n.roleHint === 'planet' && !beforeIds.has(n.id))
      .map((n: any) => n.name.split(/\s+/).pop());
    const confirmedLetters = ['b', 'c', 'e'];
    for (const g of genNames) expect(confirmedLetters).not.toContain(g);
  });
});
