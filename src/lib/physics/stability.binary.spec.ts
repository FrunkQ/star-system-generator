import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemProcessor } from '../core/SystemProcessor';
import type { System, RulePack, CelestialBody } from '../types';

function loadRulePack(): RulePack {
  const base = path.resolve('static/rulepacks/starter-sf');
  let pack = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8')) as RulePack;
  for (const f of ['classification.json', 'atmospheres.json']) {
    const p = path.join(base, f);
    if (fs.existsSync(p)) pack = { ...pack, ...JSON.parse(fs.readFileSync(p, 'utf-8')) };
  }
  return pack;
}

// Regression for the Alpha Centauri report: a wide hierarchical companion (Proxima at 13000 AU) sharing
// the binary's barycentre as a flat third sibling made the analyzer Hill-compare it against binary member
// B and flag the tight 80-yr A/B pair as "unstable / flung out". A binary's members also share ONE period.
describe('binary star stability + period (Alpha Centauri default-starmap data)', () => {
  it('the A/B pair is stable and shares one orbital period despite a distant companion', () => {
    const pack = loadRulePack();
    const sm = JSON.parse(fs.readFileSync(path.resolve('static/example-starmaps/Local_Neighbourhood-Starmap.json'), 'utf-8'));
    const acNode = sm.systems.find((s: any) => s.system?.nodes?.some((n: any) => n.id === 'alpha-centauri-barycenter'));
    expect(acNode).toBeTruthy();

    const processed = systemProcessor.process(acNode.system as System, pack);
    const a = processed.nodes.find((n) => n.id === 'alpha-centauri-a') as CelestialBody;
    const b = processed.nodes.find((n) => n.id === 'alpha-centauri-b') as CelestialBody;

    const stabilityTags = (n: CelestialBody) =>
      (n.tags || []).map((t) => t.key).filter((k) => k.startsWith('stability/') || k.startsWith('fate/'));

    expect(stabilityTags(a)).toEqual([]);   // not flung out
    expect(stabilityTags(b)).toEqual([]);
    // both members share the one (relative) orbital period
    expect(a.orbital_period_days).toBeGreaterThan(0);
    expect(Math.abs((a.orbital_period_days || 0) - (b.orbital_period_days || 0))).toBeLessThan(1);
  });
});
