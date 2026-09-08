// THE MAIN WORLD, THROUGH THE REAL IMPORTER (G87 job 5).
//
// `mainWorldPlacement.spec.ts` gates the MODEL. This gates the WIRING: that the importer actually
// uses it, that the tables are gone, that a hostile world is untouched, that a satellite main world
// is a moon - and, hardest of all, THAT W STILL COUNTS.
//
// W IS A HARD COUNT OF PRIMARY PLANETS AND NEVER INCLUDES MOONS (G32). That is the regression this
// change could most easily cause, because a satellite main world stops being a primary planet the
// moment it becomes a moon - so something else has to take its place in the count or every `Sa`
// system silently comes up one world short.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { TravellerImporter, legacyMainWorldOrbitAU } from './importer';
import { calculateGoldilocksZone } from '$lib/physics/zones';
import type { RulePack, CelestialBody } from '$lib/types';

function deepMerge(t: any, s: any): any {
  if (typeof t !== 'object' || t === null || Array.isArray(t)) return s;
  const out = { ...t };
  for (const k of Object.keys(s || {})) out[k] = k in out ? deepMerge(out[k], s[k]) : s[k];
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

// A778999-C: size 7, atmosphere 7 (standard tainted), hydrographics 8. An ordinary inhabited world.
const world = (over: Record<string, any> = {}) => ({
  name: 'Testworld', uwp: 'A778999-C', pbg: '703', w: '8', stars: 'G2 V', tradeCodes: ['Ri'], raw: '', ...over
});
const gen = (over: Record<string, any> = {}, opts: any = {}) =>
  new TravellerImporter().generateTravellerSystem(world(over), pack(), opts);

const mainOf = (sys: any) => sys.nodes.find((n: any) => /Main World/.test(n.name)) as CelestialBody;
const nodeById = (sys: any, id?: string | null) => sys.nodes.find((n: any) => n.id === id) as CelestialBody;
const primaryPlanets = (sys: any, rootId: string) =>
  sys.nodes.filter((n: any) => n.parentId === rootId && (n.roleHint === 'planet' || n.roleHint === 'belt')) as CelestialBody[];
const rootStar = (sys: any) => sys.nodes.find((n: any) => n.roleHint === 'star' && !n.parentId) as CelestialBody;
const bandOf = (sys: any) => calculateGoldilocksZone(rootStar(sys), sys.nodes);

// THE IMPORTER DRAWS EACH STAR FROM ITS CLASS BAND, seeded from the system name and UWP - so "an
// M5 V" is not one star, it is any M dwarf. A gate asserting an absolute AU figure per spectral
// class is therefore asserting the wrong thing, and my first cut of this file did exactly that.
// The sharp form is below: the world is inside ITS OWN band, AND the value the old table would have
// produced for that same star is OUTSIDE it - which proves the old answer was wrong here and means
// the gate cannot pass on the bug.
const legacyFor = (sys: any, uwpSizeDigit: number) => {
  const cls = (rootStar(sys).classes?.[0] ?? 'star/G2V').split('/')[1];
  const sub = Number.isNaN(parseInt(cls[1])) ? 2 : parseInt(cls[1]);
  return legacyMainWorldOrbitAU(cls[0], sub, uwpSizeDigit);
};

describe('G87 job 5 - the importer asks the star, not its letter', () => {
  it('an ordinary main world lands inside ITS star’s derived habitable zone', () => {
    const sys = gen();
    const star = rootStar(sys);
    const zone = calculateGoldilocksZone(star, sys.nodes);
    const a = mainOf(sys).orbit!.elements.a_AU;
    expect(a).toBeGreaterThanOrEqual(zone.inner);
    expect(a).toBeLessThanOrEqual(zone.outer);
  });

  it("AN M DWARF MAIN WORLD IS IN ITS OWN BAND, AND THE OLD TABLE'S ANSWER IS NOT", () => {
    const sys = gen({ stars: 'M5 V' });
    const zone = bandOf(sys);
    const a = mainOf(sys).orbit!.elements.a_AU;
    expect(a).toBeGreaterThanOrEqual(zone.inner);
    expect(a).toBeLessThanOrEqual(zone.outer);
    // 0.17 AU was the old answer for EVERY M star whatever its luminosity. It falls outside this
    // star's real band, so the old code was demonstrably wrong here.
    const legacy = legacyFor(sys, 7);
    expect(legacy).toBe(0.17);
    expect(legacy < zone.inner || legacy > zone.outer).toBe(true);
  });

  it('and the same for a G star, whose old answer was 0.85 AU', () => {
    const sys = gen();
    const zone = bandOf(sys);
    const a = mainOf(sys).orbit!.elements.a_AU;
    expect(a).toBeGreaterThanOrEqual(zone.inner);
    expect(a).toBeLessThanOrEqual(zone.outer);
    expect(legacyFor(sys, 7)).toBe(0.85);
  });

  it('two DIFFERENT stars get different orbits, which the old letter table could not express', () => {
    // NOT M5 vs M0: MEASURED 2026-09-08, the importer draws a star from its LETTER band and ignores
    // the subtype, so `M0 V` and `M9 V` come out as the same star. That is a real fault and it is
    // not this item's - reported on G87 - so this uses two stars the importer does distinguish.
    const g = gen({ stars: 'G2 V' });
    const m = gen({ stars: 'M5 V' });
    expect(mainOf(g).orbit!.elements.a_AU).not.toBe(mainOf(m).orbit!.elements.a_AU);
    expect(bandOf(g).inner).toBeGreaterThan(bandOf(m).outer);
  });

  it('THE SIZE NUDGE IS GONE - a large world is not pushed three slots out', () => {
    // `if (uwpSizeDigit >= 10) orbitIndex += 3` moved a big world outward for a non-thermal reason.
    for (const uwp of ['A178999-C', 'AA78999-C']) {   // size 1 and size A (10)
      const sys = gen({ uwp });
      const zone = bandOf(sys);
      const a = mainOf(sys).orbit!.elements.a_AU;
      expect(a, uwp).toBeGreaterThanOrEqual(zone.inner);
      expect(a, uwp).toBeLessThanOrEqual(zone.outer);
    }
  });
});

describe('G87 job 5 - the option, and what OFF means', () => {
  it('defaults ON', () => {
    const sys = gen();
    const zone = calculateGoldilocksZone(rootStar(sys), sys.nodes);
    expect(mainOf(sys).orbit!.elements.a_AU).toBeGreaterThanOrEqual(zone.inner);
  });

  it('OFF returns today’s behaviour exactly - the old table, within its own jitter', () => {
    const sys = gen({ stars: 'M5 V' }, { placeMainWorldInHabitableZone: false });
    const a = mainOf(sys).orbit!.elements.a_AU;
    // The legacy answer is 0.17 with +-10% jitter.
    expect(a).toBeGreaterThan(0.17 * 0.89);
    expect(a).toBeLessThan(0.17 * 1.11);
  });
});

describe('G87 job 5 - Traveller’s own data still wins', () => {
  it('a HELLWORLD keeps the orbit the old table gave it, option on or off', () => {
    const on = mainOf(gen({ stars: 'M5 V', tradeCodes: ['He'] })).orbit!.elements.a_AU;
    const off = mainOf(gen({ stars: 'M5 V', tradeCodes: ['He'] }, { placeMainWorldInHabitableZone: false })).orbit!.elements.a_AU;
    for (const a of [on, off]) {
      expect(a).toBeGreaterThan(0.17 * 0.89);
      expect(a).toBeLessThan(0.17 * 1.11);
    }
    expect(on).toBe(off);
  });

  it('an ordinary trade code is NOT a bypass', () => {
    const sys = gen({ stars: 'M5 V', tradeCodes: ['Ri', 'Ag'] });
    const zone = bandOf(sys);
    const a = mainOf(sys).orbit!.elements.a_AU;
    expect(a).toBeGreaterThanOrEqual(zone.inner);
    expect(a).toBeLessThanOrEqual(zone.outer);
  });
});

describe('G87 job 5 - a satellite main world is a MOON, and W still counts', () => {
  // MEASURED 2026-09-08 BEFORE THIS CHANGE: `Sa` did nothing at all. The main world came out as an
  // ordinary planet round its star with no tag, because the method that handles it ran before infill,
  // found no sibling to orbit, and returned. These are therefore NEW gates, not preserved ones.
  const sa = () => gen({ tradeCodes: ['Sa'] });

  it('the main world orbits a GIANT, not the star, and carries its tag', () => {
    const sys = sa();
    const main = mainOf(sys);
    const host = nodeById(sys, main.parentId);
    expect(host).toBeDefined();
    expect(host.roleHint).toBe('planet');
    expect(host.classes?.[0]).toMatch(/giant/);
    expect((main.tags ?? []).some((t) => t.key === 'traveller/satellite-main-world')).toBe(true);
  });

  it('THE MOON IS STILL IN THE HABITABLE ZONE - which is the entire point', () => {
    // The giant inherits the world's placed orbit, so the world keeps its position in the band.
    const sys = sa();
    const star = rootStar(sys);
    const zone = calculateGoldilocksZone(star, sys.nodes);
    const host = nodeById(sys, mainOf(sys).parentId);
    expect(host.orbit!.elements.a_AU).toBeGreaterThanOrEqual(zone.inner);
    expect(host.orbit!.elements.a_AU).toBeLessThanOrEqual(zone.outer);
  });

  it('the moon’s own orbit is a MOON distance, not an AU-scale one', () => {
    const main = mainOf(sa());
    expect(main.orbit!.elements.a_AU).toBeGreaterThan(0);
    expect(main.orbit!.elements.a_AU).toBeLessThan(0.05);
  });

  it("A SATELLITE HOMEWORLD COUNTS AS TWO WORLDS - the owner's ruling, 2026-09-08", () => {
    // "W never includes moons" (G32) has exactly ONE allowed exception and this is it. Owner:
    // "that is the one edge case allowed... it is a moon!", and "For a satellite homeworld we can
    // count that as 2 worlds" - so the moon AND the giant it orbits both count. Every OTHER moon
    // stays uncounted, because as he put it they are small rocks, and Traveller does not list them.
    //
    // OBSERVABLE FORM: for the same seed and the same W, a satellite system ends with exactly ONE
    // FEWER PRIMARY planet than the identical non-satellite system - because two of its counted
    // worlds are a giant and a moon rather than two primaries. If that difference becomes zero the
    // pair has stopped counting as two; if it becomes two, the moon has stopped counting at all.
    const withSat = sa();
    const without = gen();
    const satCount = primaryPlanets(withSat, rootStar(withSat).id).length;
    const plainCount = primaryPlanets(without, rootStar(without).id).length;
    expect(plainCount - satCount).toBe(1);
  });

  it('the moon is NOT a primary planet, and its host IS', () => {
    const sys = sa();
    const primaries = primaryPlanets(sys, rootStar(sys).id).map((p) => p.id);
    const main = mainOf(sys);
    expect(primaries).not.toContain(main.id);
    expect(primaries).toContain(main.parentId!);
  });

  it('ORDINARY moons still do not count - only the homeworld is the exception', () => {
    const sys = gen();
    const root = rootStar(sys).id;
    const primaries = primaryPlanets(sys, root).map((p) => p.id);
    for (const m of sys.nodes.filter((n: any) => n.roleHint === 'moon')) {
      expect(primaries).not.toContain((m as any).id);
    }
    expect(primaries).toContain(mainOf(sys).id);
  });

  it('the giant is deterministic - the same sector twice gives the same host', () => {
    const a = sa(), b = sa();
    const ha = nodeById(a, mainOf(a).parentId), hb = nodeById(b, mainOf(b).parentId);
    expect(ha.massKg).toBe(hb.massKg);
    expect(ha.orbit!.elements.a_AU).toBe(hb.orbit!.elements.a_AU);
  });
});

describe('G87 job 5 - determinism through the whole importer', () => {
  it('the same sector row imported twice gives the same main-world orbit', () => {
    expect(mainOf(gen()).orbit!.elements.a_AU).toBe(mainOf(gen()).orbit!.elements.a_AU);
  });

  it('two different worlds get different orbits, so the seed is doing something', () => {
    expect(mainOf(gen()).orbit!.elements.a_AU)
      .not.toBe(mainOf(gen({ name: 'Elsewhere', uwp: 'B778999-9' })).orbit!.elements.a_AU);
  });
});
