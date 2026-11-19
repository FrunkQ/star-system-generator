// THE CLASSIFIER SEAM FOR AN AUTHORED SHAPE FACT (G90).
//
// The classifier re-derives every class on every pass from the feature map `SystemProcessor` builds,
// so a class that cannot be expressed as a band over a feature CANNOT BE ASSIGNED, and a class
// assigned any other way is LOST the next time the system is processed. "This body is two lobes" is
// shape and history: no mass, radius, mix or temperature carries it, so it needs a body FACT
// published into that map. This file is the gate on that seam.
//
// IT USES A SYNTHETIC FINGERPRINT ON PURPOSE. What is under test is the SEAM — that an authored
// fact reaches the classifier and keeps reaching it — not the wording of any shipped fingerprint,
// which is `contactBinary.spec.ts`'s job. Banding a throwaway class on `lobes` here means this gate
// stays honest even if the pack's own bands are later retuned.
//
// SEEN RED: with `features['lobes']` removed from SystemProcessor the first two tests fail (the
// class is never assigned at all), which is exactly the failure the seam exists to catch.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemProcessor } from '../core/SystemProcessor';
import type { System, RulePack, CelestialBody, Fingerprint } from '$lib/types';

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

// A throwaway modifier that exists only in this file, banded on the fact and on the small-body mass
// window. `test/lobed` is not in any pack's vocabulary, so nothing else can supply it.
const PROBE: Fingerprint = {
  class: 'test/lobed',
  kind: 'modifier',
  note: 'Probe for the lobe seam.',
  match: { mass_Me: [0, 0.0001], lobes: [2, 8] }
};

function packWithProbe(): RulePack {
  const p = loadRulePack();
  (p.classifier as any).fingerprints = [...((p.classifier as any).fingerprints ?? []), PROBE];
  return p;
}

// A rubbly ~18 km rock on a cold orbit — the population a contact binary actually comes from.
function systemWith(extra: Partial<CelestialBody>): System {
  return {
    id: 'seam', name: 'seam', seed: 'seam-seed', epochT0: 0, age_Gyr: 4.6,
    nodes: [
      { id: 'star', name: 'Star', kind: 'body', parentId: null, roleHint: 'star', massKg: 1.989e30,
        radiusKm: 696340, temperatureK: 5778, radiationOutput: 1, classes: ['star/G'],
        axial_tilt_deg: 0, rotation_period_hours: 600 },
      { id: 'rock', name: 'Rock', kind: 'body', parentId: 'star', roleHint: 'planet',
        massKg: 4.6e16, radiusKm: 18, makeup: { rock: 0.55, ice: 0.45 },
        axial_tilt_deg: 0, rotation_period_hours: 15, tags: [],
        orbit: { hostId: 'star', elements: { a_AU: 3.2, e: 0.05, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } },
        ...extra }
    ]
  } as any;
}

// Process N times, feeding each pass its own output — the shape a GM's session actually takes,
// since `process()` runs again on every edit.
function reprocess(sys: System, pack: RulePack, passes: number): CelestialBody {
  let cur = JSON.parse(JSON.stringify(sys)) as System;
  for (let i = 0; i < passes; i++) {
    cur = systemProcessor.process(cur, pack);
    cur = JSON.parse(JSON.stringify(cur));
  }
  return cur.nodes.find((n) => n.id === 'rock') as CelestialBody;
}

describe('an authored shape fact reaches the classifier and keeps reaching it', () => {
  const pack = packWithProbe();

  it('publishes the fact as a feature a fingerprint can band on', () => {
    expect(reprocess(systemWith({ lobes: 2 }), pack, 1).classes).toContain('test/lobed');
  });

  // THE SEAM ITSELF. One pass proves the feature exists; three prove the class is re-derived rather
  // than remembered, which is the whole difference between a class that survives and one that does
  // not. Nothing here re-states the class between passes.
  it('keeps the class across three reprocesses', () => {
    for (const passes of [1, 2, 3]) {
      expect(reprocess(systemWith({ lobes: 2 }), pack, passes).classes, `pass ${passes}`)
        .toContain('test/lobed');
    }
  });

  it('never gains the class without the fact', () => {
    for (const passes of [1, 2, 3]) {
      expect(reprocess(systemWith({}), pack, passes).classes, `pass ${passes}`)
        .not.toContain('test/lobed');
    }
  });

  // A body a GM never gave lobes to must not be told it has one — an absent fact stays absent, and a
  // stated one stays exactly as stated. This is the read-only half of the rule: the feature map reads
  // this field and no pass anywhere may write it.
  it('is an input — no pass writes it', () => {
    expect(reprocess(systemWith({}), pack, 3).lobes).toBeUndefined();
    expect(reprocess(systemWith({ lobes: 2 }), pack, 3).lobes).toBe(2);
    // Even a number the shape source would never draw is left exactly as the GM typed it.
    expect(reprocess(systemWith({ lobes: 99 }), pack, 3).lobes).toBe(99);
  });

  // ONE lobe is an ordinary body, and it must not be a near-miss either: the classifier's soft edge
  // decays over 15% of the band's lower bound, so a fact of 1 against a [2, 8] band is fully out.
  it('one lobe is an ordinary body, not a partial match', () => {
    expect(reprocess(systemWith({ lobes: 1 }), pack, 3).classes).not.toContain('test/lobed');
  });
});
