// Does a hand-added tag SURVIVE BEING SAVED? Separate from tagOverride.spec.ts, which only proves it
// survives processing in memory.
//
// This is the half nothing covered. `stripBody` runs on export AND on import, and it filtered on the
// key alone — so a tag the GM added inside a derived namespace was written out of the file, and a
// free-text tag with a capital letter in it was read as a legacy display-name tag and dropped too.
// Neither showed up anywhere: `solar-system-derived.json` has no hand-added tags, and the round trip
// itself had no test. The GM's symptom would be a tag that survives every reprocess, looks permanent,
// and is gone the next time they open the campaign.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { stripSystemForExport, fixUpImportedSystem } from '../system/importFixup';
import type { RulePack, System, CelestialBody } from '../types';

function deepMerge(t: any, s: any): any {
  const o = { ...t };
  if (isObj(t) && isObj(s)) for (const k of Object.keys(s)) o[k] = isObj(s[k]) && k in t ? deepMerge(t[k], s[k]) : s[k];
  return o;
}
const isObj = (i: any) => i && typeof i === 'object' && !Array.isArray(i);
function loadPack(base: string): RulePack {
  let p = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8')) as RulePack;
  for (const f of ['classification.json', 'atmospheres.json', 'generation.json']) {
    const q = path.join(base, f);
    if (fs.existsSync(q)) p = deepMerge(p, JSON.parse(fs.readFileSync(q, 'utf-8')));
  }
  return p;
}
const pack = loadPack(path.resolve('static/rulepacks/starter-sf'));
const fixture = JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/solar-system-input.json'), 'utf-8')) as System;

const bodyNamed = (sys: System, name: string) => sys.nodes.find((n) => n.name === name) as CelestialBody;

/** The real trip a campaign takes: save the file, then open it again. */
function saveAndReopen(sys: System): System {
  const saved = stripSystemForExport(sys, pack);
  const reopened = JSON.parse(JSON.stringify(saved)) as System;   // through the file
  return fixUpImportedSystem(reopened, pack);
}

function withTag(key: string, extra: Record<string, unknown> = {}): System {
  const sys = JSON.parse(JSON.stringify(fixture)) as System;
  const mars = bodyNamed(sys, 'Mars');
  mars.tags = [...(mars.tags ?? []), { key, manual: true, ...extra } as any];
  return sys;
}
const marsKeys = (sys: System) => (bodyNamed(sys, 'Mars').tags ?? []).map((t) => t.key);

describe('a hand-added tag survives a save and reopen', () => {
  it('keeps an override inside a derived namespace', () => {
    // Was deleted on the way OUT: stripBody ran on export and did not check the manual flag.
    expect(marsKeys(saveAndReopen(withTag('geology/plate-tectonics')))).toContain('geology/plate-tectonics');
  });

  it('keeps a free-text tag with a capital letter in it', () => {
    // "Smugglers" is the Tags tab's own placeholder example, and isInterferingTag read any capital as
    // a legacy V1 display-name tag.
    expect(marsKeys(saveAndReopen(withTag('Smugglers')))).toContain('Smugglers');
  });

  it('keeps an ordinary namespaced user tag, as it always did', () => {
    expect(marsKeys(saveAndReopen(withTag('faction/red-syndicate')))).toContain('faction/red-syndicate');
  });

  it('keeps generation provenance across the trip', () => {
    const sys = JSON.parse(JSON.stringify(fixture)) as System;
    const mars = bodyNamed(sys, 'Mars');
    mars.tags = [...(mars.tags ?? []), { key: 'spin/axis-inferred' }];
    expect(marsKeys(saveAndReopen(sys))).toContain('spin/axis-inferred');
  });

  it('still drops the derived tags the save is meant to shed', () => {
    // The fix must not turn the export into a dump of everything: a physics tag is re-derived on load
    // and has no business in the file.
    const sys = JSON.parse(JSON.stringify(fixture)) as System;
    const mars = bodyNamed(sys, 'Mars');
    mars.tags = [...(mars.tags ?? []), { key: 'geology/inactive' }, { key: 'habitability/none' }];
    const keys = marsKeys(saveAndReopen(sys));
    expect(keys).not.toContain('geology/inactive');
    expect(keys).not.toContain('habitability/none');
  });

  it('still drops a class stored as a tag', () => {
    const sys = JSON.parse(JSON.stringify(fixture)) as System;
    bodyNamed(sys, 'Mars').tags = [...(bodyNamed(sys, 'Mars').tags ?? []), { key: 'planet/ice-giant' }];
    expect(marsKeys(saveAndReopen(sys))).not.toContain('planet/ice-giant');
  });

  it('survives being saved and reopened repeatedly', () => {
    let sys = withTag('geology/plate-tectonics');
    for (let i = 0; i < 3; i++) sys = saveAndReopen(sys);
    expect(marsKeys(sys).filter((k) => k === 'geology/plate-tectonics')).toHaveLength(1);
  });
});
