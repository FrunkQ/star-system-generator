// TAG CONSISTENCY (inbox B29).
//
// A tag is a claim made to a reader. This asserts that every claim the engine publishes matches the
// quantity behind it — the class of fault that produced A33 (a relative ratio printed beside an
// absolute dose), B27 (a belt peak labelled "orbital") and B28 (an appearance driver published as a
// hazard reading). All three were found by accident. These run over every bundled body, so the next
// one is found by the suite instead.
//
// The point is NOT the three corrected labels. A corrected label drifts again the moment the physics
// moves; an assertion does not.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { describeTag, formatTagValue } from './tagPresentation';
import { radiationHazardBucket } from '../physics/radiation';
import { systemProcessor } from '../core/SystemProcessor';
import type { RulePack, System } from '../types';

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
const derived = JSON.parse(fs.readFileSync(path.resolve('tests/output/solar-system-derived.json'), 'utf-8'));

// Every body the project ships — but PROCESSED, not read out of the stored JSON. A bundled starmap
// is a snapshot that may have been serialised many versions ago, so auditing it as-is audits history
// rather than the engine. Processing first means this asserts what the code emits TODAY, which is
// the only thing a consistency test can usefully defend.
function allBodies(): any[] {
  const out = [...derived.nodes];
  for (const f of ['Local_Neighbourhood-Starmap.json', 'Local_Neighbourhood_SciFi-Starmap.json']) {
    const m = JSON.parse(fs.readFileSync(path.resolve('static/example-starmaps', f), 'utf-8'));
    for (const s of m.systems ?? []) {
      if (!s.system?.nodes) continue;
      out.push(...systemProcessor.process(JSON.parse(JSON.stringify(s.system)) as System, pack).nodes);
    }
  }
  return out.filter((n) => n?.kind === 'body');
}
const bodies = allBodies();
const tagsOf = (b: any) => (b.tags ?? []) as { key: string; value?: string; manual?: boolean }[];

describe('tag consistency', () => {
  it('has bodies to audit', () => expect(bodies.length).toBeGreaterThan(100));

  // A35 / B29. A bare number in a tag value reaches the player as "Brilliant aurora: 0.78" — a float
  // on a scale nothing states. Either the value is words, or the presentation layer gives it a unit
  // or suppresses it. Nothing numeric may fall through unhandled.
  it('never shows a reader a bare unitless number', () => {
    const offenders = new Set<string>();
    for (const b of bodies) {
      for (const t of tagsOf(b)) {
        if (t.value == null || t.value === '') continue;
        if (!/^-?\d+(\.\d+)?$/.test(String(t.value))) continue;   // words are fine
        const shown = formatTagValue(t.key, String(t.value));
        // Handled means: suppressed entirely, or given something that is not just the digits back.
        if (shown !== null && shown === String(t.value)) offenders.add(`${t.key} = ${t.value}`);
      }
    }
    expect([...offenders], `raw numeric tag values with no unit and no suppression:\n  ${[...offenders].join('\n  ')}`).toEqual([]);
  });

  // The architecture doc's idiom: one tag, one value, no delimited mini-formats beyond
  // "<species> <bucket>". A body with several of a thing emits the key several times.
  it('packs no delimited list into a single tag value', () => {
    const offenders = new Set<string>();
    for (const b of bodies) {
      for (const t of tagsOf(b)) {
        if (typeof t.value === 'string' && /[+,;|]/.test(t.value)) offenders.add(`${t.key} = ${t.value}`);
      }
    }
    expect([...offenders], `delimited mini-formats in tag values:\n  ${[...offenders].join('\n  ')}`).toEqual([]);
  });

  // B28's own example, generalised: the hazard word must follow the dose it claims to describe. A
  // world taking a lethal dose may not read as safe, whatever any other radiation quantity says.
  it('never contradicts the dose with the hazard tag', () => {
    const bad: string[] = [];
    for (const b of bodies) {
      const dose = b.surfaceRadiation;
      const tag = tagsOf(b).find((t) => t.key === 'hazard/radiation');
      if (typeof dose !== 'number' || !tag || tag.manual) continue;
      const expected = radiationHazardBucket(dose);
      if (tag.value !== expected) bad.push(`${b.name}: ${dose.toPrecision(4)} mSv/yr is "${expected}" but tagged "${tag.value}"`);
    }
    expect(bad, bad.join('\n  ')).toEqual([]);
  });

  // Every key a body actually carries must be REGISTERED. An unregistered tag renders as a
  // title-cased key with a namespace-level fallback description — it looks deliberate and explains
  // nothing, which is how a tag ends up meaning whatever the reader guesses.
  it('registers every tag it emits', () => {
    const unknown = new Set<string>();
    for (const b of bodies) {
      for (const t of tagsOf(b)) {
        if (t.manual || t.source) continue;                    // hand-added and PoI-rule tags are the user's
        if (!describeTag(t.key).description) unknown.add(t.key);
      }
    }
    expect([...unknown].sort(), `emitted but unregistered:\n  ${[...unknown].sort().join('\n  ')}`).toEqual([]);
  });
});
