// G94 job 6 - the `age/` family (deep-time-design.md section 5): young, old, ancient, primordial.
// Three bands are RELATIVE to the system's formation and one is ABSOLUTE, and that difference is the
// thing being pinned: the relative three keep working for a young host, the absolute one keeps
// meaning something whatever the body orbits.
import { describe, it, expect } from 'vitest';
import { ageBand, deepTimeConfig, DEEP_TIME_DEFAULTS } from './ageTags';
import { setBodyAge } from './bodyAge';
import { describeTag } from '$lib/tags/tagPresentation';
import { namespaceProvenance } from '$lib/tags/tagLifecycle';
import { ENGINE_NAMESPACES } from '$lib/tags/tagDefaults';
import type { CelestialBody, RulePack } from '$lib/types';

const EPOCH = Date.UTC(2026, 8, 1, 12);            // 13.787 Gyr after the big bang
const sys = (age_Gyr: number) => ({ age_Gyr, epochT0: EPOCH });
const aged = (ageGyr: number, system = sys(4.6)): CelestialBody => {
  const b = { id: 'b', kind: 'body', roleHint: 'planet', tags: [] } as unknown as CelestialBody;
  setBodyAge(b, ageGyr, system);
  return b;
};

describe('age/ - a body that inherits its system\'s age formed with it and carries no band', () => {
  it('no age of its own is no band, in a system of any age', () => {
    const b = { id: 'b', kind: 'body', roleHint: 'planet' } as unknown as CelestialBody;
    for (const a of [0.01, 4.6, 13.7]) expect(ageBand(b, sys(a))).toBeNull();
  });
});

describe('age/ - the three RELATIVE bands, around a 4.6 Gyr system', () => {
  const s = sys(4.6);
  it('the same age, or within the 100 Myr worlds take to assemble, is the ordinary case: no band', () => {
    expect(ageBand(aged(4.6, s), s)).toBeNull();
    expect(ageBand(aged(4.55, s), s)).toBeNull();
    expect(ageBand(aged(4.501, s), s)).toBeNull();
  });
  it('younger than that is YOUNG', () => {
    expect(ageBand(aged(4.4, s), s)).toBe('young');
    expect(ageBand(aged(0.01, s), s)).toBe('young');
  });
  it('older than its system at all is OLD', () => {
    expect(ageBand(aged(4.7, s), s)).toBe('old');
    expect(ageBand(aged(5.5, s), s)).toBe('old');
  });
  it('older by two generations - 1 Gyr - is ANCIENT', () => {
    expect(ageBand(aged(5.7, s), s)).toBe('ancient');
    expect(ageBand(aged(12.5, s), s)).toBe('ancient');
  });
});

describe('age/ - PRIMORDIAL is absolute', () => {
  it('formed in the first gigayear is primordial around a 4.6 Gyr star', () => {
    expect(ageBand(aged(13, sys(4.6)), sys(4.6))).toBe('primordial');      // formed 0.787 Gyr after the big bang
    expect(ageBand(aged(12.7, sys(4.6)), sys(4.6))).toBe('ancient');       // formed 1.087 Gyr after it
  });
  it('...and around a YOUNG host, where the relative bands still read correctly too', () => {
    const young = sys(0.2);
    expect(ageBand(aged(13.5, young), young)).toBe('primordial');
    expect(ageBand(aged(3, young), young)).toBe('ancient');
    expect(ageBand(aged(0.9, young), young)).toBe('old');
    expect(ageBand(aged(0.05, young), young)).toBe('young');
  });
  it('...and it keeps its meaning when the system itself is that old: not "older than its host", still primordial', () => {
    const first = sys(13.5);
    expect(ageBand(aged(13.5, first), first)).toBe('primordial');
    expect(ageBand(aged(13.4, first), first)).toBe('primordial');
  });
});

describe('age/ - every number is pack data', () => {
  it('a pack with no deepTime block gets the defaults, and a bad value falls back one field at a time', () => {
    expect(deepTimeConfig(null)).toEqual(DEEP_TIME_DEFAULTS);
    expect(deepTimeConfig({ deepTime: { generationGyr: -3, accretionGyr: 0.3 } } as unknown as RulePack))
      .toEqual({ ...DEEP_TIME_DEFAULTS, accretionGyr: 0.3 });
  });
  it('a longer generation moves the ancient line and nothing else', () => {
    const s = sys(4.6);
    const pack = { deepTime: { generationGyr: 2 } } as unknown as RulePack;
    expect(ageBand(aged(5.7, s), s, pack)).toBe('old');           // was ancient at 0.5 Gyr a generation
    expect(ageBand(aged(9, s), s, pack)).toBe('ancient');
    expect(ageBand(aged(4.4, s), s, pack)).toBe('young');
  });
  it('the shipped pack states all four figures, and they are the defaults', async () => {
    const { readFileSync } = await import('node:fs');
    const main = JSON.parse(readFileSync('static/rulepacks/starter-sf/main.json', 'utf8'));
    expect(deepTimeConfig(main)).toEqual(DEEP_TIME_DEFAULTS);
    for (const k of Object.keys(DEEP_TIME_DEFAULTS)) expect(typeof main.deepTime[k], k).toBe('number');
  });
});

describe('age/ - the family is registered, and it is not an override', () => {
  it('each of the four has its own words, and the two oldest say that age is what was measured', () => {
    expect(describeTag('age/young').label).toBe('Young');
    expect(describeTag('age/old').label).toBe('Old');
    expect(describeTag('age/ancient').label).toBe('Ancient');
    expect(describeTag('age/primordial').label).toBe('Primordial');
    expect(describeTag('age/ancient').description).toMatch(/age alone/);
    expect(describeTag('age/primordial').description).toMatch(/age alone/);
    expect(describeTag('age/primordial').description).toMatch(/heavy elements/);
  });
  it('the namespace is engine-derived and is not offered as a hand override', () => {
    expect(namespaceProvenance('age/old')).toBe('physics');
    // `tagCategories` builds the Tags tab's override list from exactly this flag.
    expect(ENGINE_NAMESPACES.find((n) => n.id === 'age')).toMatchObject({ provenance: 'physics', overridable: false });
  });
});
