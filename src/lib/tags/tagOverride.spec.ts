// A GM's hand-added tag must survive the processor. Through the REAL processor, not a unit stub.
//
// tagLifecycle.spec.ts pins the rule; this pins the wiring. They fail for different reasons: that one
// breaks if the rule is wrong, this one breaks if a strip site was missed — which is the fault that
// actually existed, twenty-five times over. `solar-system-derived.json` cannot catch either, because
// the fixture carries no hand-added tags at all.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemProcessor } from '../core/SystemProcessor';
import type { RulePack, System, CelestialBody } from '../types';

function deepMerge(t: any, s: any): any {
  const o = { ...t };
  if (isObj(t) && isObj(s)) for (const k of Object.keys(s)) o[k] = isObj(s[k]) && k in t ? deepMerge(t[k], s[k]) : s[k];
  return o;
}
const isObj = (i: any) => i && typeof i === 'object' && !Array.isArray(i);
function loadPack(base: string): RulePack {
  let p = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8')) as RulePack;
  for (const f of ['construct_templates.json', 'engine-definitions.json', 'fuel-definitions.json', 'liquids.json', 'classification.json', 'atmospheres.json', 'generation.json']) {
    const q = path.join(base, f);
    if (fs.existsSync(q)) p = deepMerge(p, JSON.parse(fs.readFileSync(q, 'utf-8')));
  }
  return p;
}
const pack = loadPack(path.resolve('static/rulepacks/starter-sf'));
const fixture = JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/solar-system-input.json'), 'utf-8')) as System;

const run = (sys: System) => systemProcessor.process(JSON.parse(JSON.stringify(sys)) as System, pack);
const bodyNamed = (sys: System, name: string) => sys.nodes.find((n) => n.name === name) as CelestialBody;

// One key from each family a different pass owns, so a missed strip site in any of them shows up
// here rather than in a GM's campaign. Every one of these namespaces is wiped and re-derived.
const OVERRIDES = [
  'geology/plate-tectonics',
  'magnetic/dynamo',
  'aurora/brilliant',
  'shape/oblate',
  'volatiles/ices',
  'stability/marginal',
  'resonance/laplace',
  'habitability/earth-like',
  'surface/age',
  'ring/system',
  'tidal/volcanism',
  'thermal/self-luminous',
  'orbit/tidally-locked'
];

describe('a hand-added tag survives the processor', () => {
  for (const key of OVERRIDES) {
    it(`keeps a manual ${key} on a body whose pass owns that namespace`, () => {
      const sys = JSON.parse(JSON.stringify(fixture)) as System;
      const mars = bodyNamed(sys, 'Mars');
      expect(mars, 'fixture should contain Mars').toBeTruthy();
      mars.tags = [...(mars.tags ?? []), { key, value: 'gm', manual: true }];

      const out = run(sys);
      const got = (bodyNamed(out, 'Mars').tags ?? []).filter((t) => t.key === key);

      expect(got.length, `${key} should survive exactly once`).toBe(1);
      expect(got[0].manual, `${key} should still be the GM's`).toBe(true);
      expect(got[0].value, `${key} should keep the GM's value`).toBe('gm');
    });
  }

  // The override wins the key outright rather than sitting beside the derived one — B28/B31's answer,
  // now general. Earth is chosen because it certainly gets a derived hazard/radiation of its own.
  it('suppresses the derived twin rather than duplicating it', () => {
    const sys = JSON.parse(JSON.stringify(fixture)) as System;
    const earth = bodyNamed(sys, 'Earth');
    earth.tags = [...(earth.tags ?? []), { key: 'hazard/radiation', value: 'lethal', manual: true }];

    const tags = (bodyNamed(run(sys), 'Earth').tags ?? []).filter((t) => t.key === 'hazard/radiation');
    expect(tags).toHaveLength(1);
    expect(tags[0].value).toBe('lethal');
  });

  // Re-processing is how a GM edit is applied, so it happens constantly. An override that survived
  // once but not three times would be worse than one that never survived at all.
  it('survives repeated processing without accumulating copies', () => {
    const sys = JSON.parse(JSON.stringify(fixture)) as System;
    bodyNamed(sys, 'Mars').tags = [...(bodyNamed(sys, 'Mars').tags ?? []), { key: 'geology/plate-tectonics', manual: true }];

    let out = run(sys);
    out = run(out);
    out = run(out);

    expect((bodyNamed(out, 'Mars').tags ?? []).filter((t) => t.key === 'geology/plate-tectonics')).toHaveLength(1);
  });

  // B10 / C3c. Not an override — generation's own claim, which no pass can re-derive and none may
  // delete. If a future strip names `spin/`, this is what says no.
  it('keeps generation spin provenance through a process', () => {
    const sys = JSON.parse(JSON.stringify(fixture)) as System;
    const mars = bodyNamed(sys, 'Mars');
    mars.tags = [...(mars.tags ?? []), { key: 'spin/axis-inferred' }, { key: 'spin/period-inferred' }];

    const keys = (bodyNamed(run(sys), 'Mars').tags ?? []).map((t) => t.key);
    expect(keys).toContain('spin/axis-inferred');
    expect(keys).toContain('spin/period-inferred');
  });
});
