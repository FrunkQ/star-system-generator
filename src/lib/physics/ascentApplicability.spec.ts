import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ascentBudgetApplies } from './orbits';
import { systemProcessor } from '../core/SystemProcessor';
import { bodyFacts } from '../catalogue/bodyFacts';
import type { System, RulePack, CelestialBody } from '../types';

/**
 * A surface flight budget is published only where it means something (inbox B37).
 *
 * `calculateDeltaVBudgets` writes -1 as a "not applicable" sentinel, and four consumers each decided
 * for themselves what -1 meant. Two tested it for truthiness — and -1 is truthy — so every belt and
 * ring in the app read "Ascent Dv -0.0 km/s". A third printed it as -1.0 m/s. The fourth, the ascent
 * tag, was the only one that gated properly, so the tag said nothing about Jupiter while the info
 * block beside it said 50.3 km/s.
 */
function deepMerge(t: any, s: any): any {
  if (typeof t !== 'object' || t === null || Array.isArray(t)) return s;
  const out = { ...t };
  for (const k of Object.keys(s || {})) out[k] = (k in out) ? deepMerge(out[k], s[k]) : s[k];
  return out;
}
function loadRulePack(): RulePack {
  const base = path.resolve('static/rulepacks/starter-sf');
  let p: any = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8'));
  for (const f of ['stars.json', 'planets.json', 'generation.json', 'orbital_constants.json',
    'classification.json', 'atmospheres.json', 'liquids.json']) {
    const fp = path.join(base, f);
    if (fs.existsSync(fp)) p = deepMerge(p, JSON.parse(fs.readFileSync(fp, 'utf-8')));
  }
  return p as RulePack;
}
const pack = loadRulePack();
const sol = () => systemProcessor.process(
  JSON.parse(fs.readFileSync(path.resolve('static/examples/Sol_2030-System.json'), 'utf-8')) as System,
  pack
);
const body = (s: System, name: string) => s.nodes.find((n) => n.name === name) as CelestialBody;

describe('ascentBudgetApplies — one predicate, four consumers', () => {
  it('applies to a rocky planet and to a moon', () => {
    const s = sol();
    expect(ascentBudgetApplies(body(s, 'Earth')).applies).toBe(true);
    expect(ascentBudgetApplies(body(s, 'Mars')).applies).toBe(true);
    expect(ascentBudgetApplies(body(s, 'Luna')).applies).toBe(true);
    expect(ascentBudgetApplies(body(s, 'Titan')).applies).toBe(true);
  });

  it('is WITHHELD on a belt and a ring, with the reason, not a fragment figure', () => {
    const s = sol();
    for (const name of ['The Main Belt', 'Kuiper Belt', "Saturn's Rings"]) {
      const verdict = ascentBudgetApplies(body(s, name));
      expect(verdict.applies).toBe(false);
      // A belt's massKg is a debris-density proxy (PHY-13), so there is no honest figure to publish
      // and no fragment in the data to publish one FROM. See the note on the predicate.
      expect((verdict as any).reason).toMatch(/no surface to leave/);
    }
  });

  it('is withheld on a body with no solid surface — gas AND ice giants', () => {
    const s = sol();
    // Jupiter and Saturn are the obvious half. Uranus and Neptune are the half a `classes` regex on
    // "gas-giant" silently let through, which is why the predicate asks the makeup instead.
    for (const name of ['Jupiter', 'Saturn', 'Uranus', 'Neptune']) {
      const verdict = ascentBudgetApplies(body(s, name));
      expect(verdict.applies).toBe(false);
      expect((verdict as any).reason).toMatch(/no solid surface/);
    }
  });

  it('is withheld on a star', () => {
    expect(ascentBudgetApplies(body(sol(), 'Sol')).applies).toBe(false);
  });
});

describe('what the info block actually publishes', () => {
  const ascentRow = (b: CelestialBody, nodes: any) => {
    const facts = bodyFacts(b, nodes, pack, 'metric' as any) as any[];
    return facts.find((f) => /Ascent/.test(f.label));
  };

  it('never prints a negative or zero speed as if it were a measurement', () => {
    const s = sol();
    for (const n of s.nodes as CelestialBody[]) {
      if (n.kind !== 'body') continue;
      const row = ascentRow(n, s.nodes);
      if (!row) continue;
      expect(String(row.value)).not.toMatch(/^-/);
      // "0.0 km/s" reads as free. Phobos really costs 9 m/s and it should say so.
      expect(String(row.value)).not.toMatch(/^0(\.0)? (km|mi)\/s$/);
    }
  });

  it('a belt says why the figure is absent rather than showing -0.0 km/s', () => {
    const s = sol();
    const row = ascentRow(body(s, 'The Main Belt'), s.nodes);
    expect(row).toBeDefined();
    expect(String(row.value)).toMatch(/not applicable/);
    expect(String(row.value)).not.toMatch(/km\/s/);
  });

  it('a rocky world still shows its real figure, to its anchors', () => {
    const s = sol();
    expect(String(ascentRow(body(s, 'Earth'), s.nodes).value)).toMatch(/10\.4 km\/s/);
    expect(String(ascentRow(body(s, 'Luna'), s.nodes).value)).toMatch(/1\.9 km\/s/);
    // ...and a tiny moon reads in the unit that can carry it.
    expect(String(ascentRow(body(s, 'Phobos'), s.nodes).value)).toMatch(/^9 m\/s$/);
  });

  it('the ASCENT TAG and the info block now agree on every body', () => {
    const s = sol();
    for (const n of s.nodes as CelestialBody[]) {
      if (n.kind !== 'body') continue;
      const tagged = (n.tags ?? []).some((t) => t.key === 'flight/ascent');
      const row = ascentRow(n, s.nodes);
      const showsFigure = !!row && /\d/.test(String(row.value)) && !/not applicable/.test(String(row.value));
      // The tag has its own extra condition (dv > 0), so a figure without a tag is possible on a
      // body whose budget rounds to nothing; a TAG without a figure never is.
      if (tagged) expect(showsFigure).toBe(true);
    }
  });
});
