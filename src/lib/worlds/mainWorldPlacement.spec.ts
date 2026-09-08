// A MAIN WORLD WHERE PEOPLE COULD ACTUALLY LIVE (G87) - the gates.
//
// ABSOLUTE, IN AU, NOT RATIOS (PHY-34). The old code put every G star's main world at 0.85 AU and
// every M star's at 0.17 AU, so a gate phrased as "inside the band" could pass on the bug for a
// Sol-like star by coincidence. These assert the NUMBERS, and the M-dwarf gate asserts the old
// value is GONE rather than that the new one is plausible.
import { describe, it, expect } from 'vitest';
import {
  placeMainWorld,
  giantOccupyingBand,
  usableTempRange,
  TOLERANCE_ORDER,
  mainWorldProfilesFromPack,
  mainWorldBypassCodesFromPack,
  type MainWorldCandidate,
  type MainWorldFacts
} from './mainWorldPlacement';
import { calculateGoldilocksZone } from '$lib/physics/zones';
import type { CelestialBody } from '$lib/types';
import { loadStarterPack } from '$lib/import/realsky/testPack';

const SOLAR_RADIUS_KM = 696340;

const star = (over: Partial<CelestialBody> = {}): CelestialBody =>
  ({
    id: 'star', kind: 'body', roleHint: 'star', parentId: null, name: 'Star', tags: [],
    massKg: 1.989e30, radiusKm: SOLAR_RADIUS_KM, temperatureK: 5778, classes: ['star/G2V'],
    ...over
  }) as unknown as CelestialBody;

// A G2 V and an M5 V, by their real figures rather than by their letters - which is the entire point.
const G2V = star();
const M5V = star({
  id: 'star', name: 'M dwarf', classes: ['star/M5V'],
  massKg: 0.16 * 1.989e30, radiusKm: 0.2 * SOLAR_RADIUS_KM, temperatureK: 3050
});

// The shortlist, as job 2 will ship it from the pack. Passed in, never defined in the module.
// THE REAL PACK, not a hand-written copy of it. If the shipped shortlist stops being able to place
// an ordinary breathable world, that is exactly the thing these gates should notice.
const pack = loadStarterPack();
const CANDIDATES: MainWorldCandidate[] = mainWorldProfilesFromPack(pack);
const BYPASS = mainWorldBypassCodesFromPack(pack);

const facts = (over: Partial<MainWorldFacts> = {}): MainWorldFacts => ({
  sizeDigit: 8, atmosphereDigit: 6, hydrographicsDigit: 7, populationDigit: 8, tradeCodes: [], ...over
});

const place = (f: Partial<MainWorldFacts> = {}, over: Partial<Parameters<typeof placeMainWorld>[1]> = {}) =>
  placeMainWorld(facts(f), {
    star: G2V, nodes: [G2V], candidates: CANDIDATES, bypassTradeCodes: BYPASS, seed: 'Spinward Marches 1910', ...over
  });

describe('G87 - the world lands in ITS OWN star\'s band, not Sol\'s', () => {
  it('a G2 V main world lands inside the band the engine derives for that star', () => {
    const zone = calculateGoldilocksZone(G2V, [G2V]);
    const out = place();
    expect(out.placed).toBe(true);
    expect(out.a_AU).toBeGreaterThanOrEqual(zone.inner);
    expect(out.a_AU).toBeLessThanOrEqual(zone.outer);
    // ABSOLUTE: a Sun-like star's conservative band is roughly 0.95-1.7 AU, so the answer is ~1 AU
    // and emphatically not the 0.85 AU the old BODE_TABLE handed every G star.
    expect(out.a_AU).toBeGreaterThan(0.9);
    expect(out.a_AU).toBeLessThan(1.8);
  });

  it('AN M5 V LANDS NEAR ITS OWN BAND AND NOT AT 0.17 AU - the old value must be gone', () => {
    const zone = calculateGoldilocksZone(M5V, [M5V]);
    const out = place({}, { star: M5V, nodes: [M5V] });
    expect(out.placed).toBe(true);
    expect(out.a_AU).toBeGreaterThanOrEqual(zone.inner);
    expect(out.a_AU).toBeLessThanOrEqual(zone.outer);
    // The gate that would have passed on the bug: 0.17 AU was the old answer for EVERY M star.
    // A 0.16 Msun dwarf's band is nearer 0.05-0.11 AU, so this must be well inside 0.17.
    expect(out.a_AU).toBeLessThan(0.15);
    expect(out.a_AU).toBeGreaterThan(0.01);
  });

  it('the two stars get DIFFERENT answers, which the old table could never do', () => {
    const g = place().a_AU;
    const m = place({}, { star: M5V, nodes: [M5V] }).a_AU;
    expect(g / m).toBeGreaterThan(5);
  });

  it('a brighter star of the SAME letter is placed further out', () => {
    // The old code keyed on the LETTER, so these two were identical. They are not.
    const bright = star({ id: 'star', massKg: 1.1 * 1.989e30, radiusKm: 1.2 * SOLAR_RADIUS_KM, temperatureK: 6000 });
    const out = place({}, { star: bright, nodes: [bright] });
    expect(out.a_AU).toBeGreaterThan(place().a_AU);
  });
});

describe('G87 - Traveller\'s own data is the authority', () => {
  it('a HELLWORLD is not moved anywhere kinder, and says why', () => {
    const out = place({ tradeCodes: ['He', 'Hi'] });
    expect(out.bypassed).toBe(true);
    expect(out.placed).toBe(false);
    expect(out.a_AU).toBe(0);
    expect(out.reason).toMatch(/hostile stays hostile/);
  });

  it('every bypass code is honoured, and an ordinary code is not one', () => {
    for (const c of BYPASS) expect(place({ tradeCodes: [c] }).bypassed, c).toBe(true);
    for (const c of ['Ag', 'Ri', 'Hi', 'Sa']) expect(place({ tradeCodes: [c] }).bypassed, c).toBe(false);
  });
});

describe('G87 - always TRY to put somebody down', () => {
  it('a breathable UWP gets the breathable type', () => {
    const out = place({ atmosphereDigit: 6, hydrographicsDigit: 7 });
    expect(out.grade).toBe('breathable');
    expect(out.template).toBe('planet/terrestrial');
    expect(out.readsAs).toBe('planet/earth-like');
    expect(out.reason).toMatch(/the air is breathable/);
  });

  it('a tainted atmosphere drops ONE rung to a mask, not all the way', () => {
    const out = place({ atmosphereDigit: 7, hydrographicsDigit: 5 });
    expect(out.grade).toBe('mask');
    expect(out.reason).toMatch(/breathing mask/);
  });

  it('a vacuum world is still placed - underground, and it says so', () => {
    const out = place({ atmosphereDigit: 0, hydrographicsDigit: 0 });
    expect(out.placed).toBe(true);
    expect(out.grade).toBe('sealed');
    expect(out.reason).toMatch(/sealed suit, or a life lived underground/);
  });

  it('the ladder is walked in order and never skips a better grade that fits', () => {
    // Atmosphere 5 with dry hydrographics fits the desert entry, which is ALSO breathable.
    const out = place({ atmosphereDigit: 5, hydrographicsDigit: 1 });
    expect(out.grade).toBe('breathable');
    expect(out.readsAs).toBe('planet/desert');
    expect(TOLERANCE_ORDER[0]).toBe('breathable');
  });

  it('declines only when NOTHING in the shortlist can express the UWP - and names the reason', () => {
    const out = place({ atmosphereDigit: 6 }, { candidates: [{ template: 'planet/terrestrial', grade: 'breathable', atmosphere: [1, 2] }] });
    expect(out.placed).toBe(false);
    expect(out.bypassed).toBe(false);
    expect(out.reason).toMatch(/No main-world type in the shortlist/);
    // It must NOT silently fall back to an orbit, which is what the old table did by existing.
    expect(out.a_AU).toBe(0);
  });
});

describe('G87 - the main world as a gas giant\'s moon', () => {
  const zone = calculateGoldilocksZone(G2V, [G2V]);
  const giant = {
    id: 'giant', kind: 'body', roleHint: 'planet', parentId: 'star', name: 'Aldebaran Reach',
    classes: ['planet/gas-giant'], massKg: 1.9e27, radiusKm: 69911, tags: [],
    orbit: { elements: { a_AU: (zone.inner + zone.outer) / 2 } }
  } as unknown as CelestialBody;

  it('finds a giant sitting in the band, and ignores one outside it', () => {
    expect(giantOccupyingBand([G2V, giant], 'star', zone)?.id).toBe('giant');
    const far = { ...giant, orbit: { elements: { a_AU: zone.outer * 10 } } } as CelestialBody;
    expect(giantOccupyingBand([G2V, far], 'star', zone)).toBeNull();
  });

  it('THE MAIN WORLD BECOMES ITS MOON, and stays in the habitable zone', () => {
    const out = place({}, { nodes: [G2V, giant] });
    expect(out.placed).toBe(true);
    expect(out.host.kind).toBe('giant');
    expect(out.host.id).toBe('giant');
    // The orbit is now about the GIANT, so it is a moon distance, not an AU-scale one.
    expect(out.a_AU).toBeGreaterThan(0);
    expect(out.a_AU).toBeLessThan(0.05);
    expect(out.reason).toMatch(/already held by Aldebaran Reach/);
    expect(out.reason).toMatch(/stays inside the band/);
  });

  it('the UWP still decides what the moon IS - being a moon changes nothing about its air', () => {
    const out = place({ atmosphereDigit: 6, hydrographicsDigit: 7 }, { nodes: [G2V, giant] });
    expect(out.grade).toBe('breathable');
    expect(out.template).toBe('planet/terrestrial');
    expect(out.readsAs).toBe('planet/earth-like');
  });

  it('picks the heaviest giant deterministically when the band holds two', () => {
    const second = { ...giant, id: 'giant-b', name: 'Second', massKg: 5e27 } as CelestialBody;
    expect(giantOccupyingBand([G2V, giant, second], 'star', zone)?.id).toBe('giant-b');
    // ...and array order must not change the answer.
    expect(giantOccupyingBand([G2V, second, giant], 'star', zone)?.id).toBe('giant-b');
  });
});

describe('G87 - the same sector twice is the same sky (the owner\'s determinism requirement)', () => {
  it('two identical calls agree exactly', () => {
    expect(place().a_AU).toBe(place().a_AU);
  });

  it('two SESSIONS - different objects, same inputs - agree exactly', () => {
    // The requirement is "the same object fires for each user in the same way", so the inputs are
    // rebuilt from scratch here rather than reused: nothing may leak in from a shared instance.
    const runFresh = () =>
      placeMainWorld(
        { sizeDigit: 8, atmosphereDigit: 6, hydrographicsDigit: 7, populationDigit: 8, tradeCodes: [] },
        {
          star: star(), nodes: [star()],
          candidates: CANDIDATES.map((c) => ({ ...c })),
          bypassTradeCodes: [...BYPASS],
          seed: 'Spinward Marches 1910'
        }
      );
    expect(runFresh().a_AU).toBe(runFresh().a_AU);
  });

  it('a DIFFERENT system gets a different orbit, so the seed is actually being used', () => {
    expect(place({}, { seed: 'Spinward Marches 1910' }).a_AU)
      .not.toBe(place({}, { seed: 'Spinward Marches 2011' }).a_AU);
  });

  it('never reads a clock: the answer is stable across a delay', async () => {
    const first = place().a_AU;
    await new Promise((r) => setTimeout(r, 5));
    expect(place().a_AU).toBe(first);
  });
});

describe('G87 - the orbit comes from the temperature the atmosphere asks for', () => {
  // THIS REPLACED A TABLE OF BAND FRACTIONS I GUESSED AT ("thicker air traps more heat, so it sits
  // further out"). The browser proved that premise wrong: a dense N2/O2 world placed in the outer
  // half of the band came out at 204 K with no surface liquid, because the conservative band's outer
  // edge assumes a CO2 greenhouse this engine does not give a nitrogen atmosphere.
  const range = (lo: number, hi: number) => ({ atmosphereTempRangeK: [lo, hi] as [number, number] });

  it('a HOT template lands closer in than a COLD one, round the same star', () => {
    const hot = place({ atmosphereDigit: 11, ...range(700, 750) }).a_AU;   // Venusian
    const cold = place({ atmosphereDigit: 15, ...range(80, 120) }).a_AU;   // methane
    expect(hot).toBeLessThan(cold);
  });

  it('A BREATHABLE TEMPLATE IS GOVERNED BY THE BAND, not by its own stated temperature', () => {
    // AND THIS IS THE DESIGN, not a compromise. A Standard/Earth-like template says 280-310 K, which
    // is a SURFACE temperature; solving it as an EQUILIBRIUM one lands about 0.70 AU round a Sun-like
    // star, too close. The habitable-zone clamp pushes it back to the band's inner edge - which is
    // where Earth actually sits (1.0 AU against a conservative inner edge of 0.95), and which is
    // exactly the owner's rule that atmosphere 4-9 belongs in that band.
    //
    // So the two halves divide cleanly: A BREATHABLE WORLD IS PLACED BY THE BAND, because a
    // greenhouse it will have but does not yet is what closes the gap; EVERYTHING ELSE is placed by
    // the temperature its template declares, because nothing else can speak for a Venusian or a
    // methane world.
    const out = place({ atmosphereDigit: 6, ...range(280, 310) });
    expect(out.placed).toBe(true);
    expect(out.a_AU).toBeGreaterThanOrEqual(out.zone.inner);
    expect(out.a_AU).toBeLessThanOrEqual(out.zone.outer);
    expect(out.reason).toMatch(/a breathable atmosphere belongs in that band/);
  });

  it('a template with no range at all is centred in the band and SAYS so', () => {
    const out = place({ atmosphereDigit: 6, atmosphereTempRangeK: null });
    expect(out.placed).toBe(true);
    expect(out.reason).toMatch(/states no temperature of its own/);
  });

  it('a shrug of a range (vacuum, 10-1000 K) is treated as unstated, not as 505 K', () => {
    expect(usableTempRange([10, 1000])).toBeNull();
    expect(usableTempRange([280, 310])).toEqual([280, 310]);
    const out = place({ atmosphereDigit: 0, ...range(10, 1000) });
    expect(out.reason).toMatch(/states no temperature of its own/);
  });

  it('A BREATHABLE WORLD IS HELD IN THE BAND even if its template asks for something else', () => {
    // Atmosphere 4-9 must be in the habitable zone or the UWP invalidates itself (the owner's rule).
    const out = place({ atmosphereDigit: 6, ...range(700, 750) });
    const zone = out.zone;
    expect(out.a_AU).toBeGreaterThanOrEqual(zone.inner);
    expect(out.a_AU).toBeLessThanOrEqual(zone.outer);
    expect(out.reason).toMatch(/a breathable atmosphere belongs in that band/);
  });

  it('a NON-breathable world is free to leave the band, because Traveller says it is hostile', () => {
    const out = place({ atmosphereDigit: 11, ...range(700, 750) });
    expect(out.a_AU).toBeLessThan(out.zone.inner);
  });

  it('THE MODULE CONTAINS NO SPECTRAL-CLASS TABLE AND NO AU TABLE', async () => {
    const src = (await import('node:fs')).readFileSync('src/lib/worlds/mainWorldPlacement.ts', 'utf8');
    // Strip comment lines, then look for the tables in the CODE. Written without splitting on a
    // newline literal, because getting one into this file through a generator is its own trap.
    const code = src.replace(/^\s*(\/\/|\*).*$/gm, '');
    expect(code).not.toMatch(/HZ_ANCHORS|BODE_TABLE/);
    expect(code).not.toMatch(/["']?O["']?\s*:\s*\d+\s*,\s*["']?B["']?\s*:/);
  });
});


describe('G87 - the shortlist is PACK DATA, and a derived class is never an input', () => {
  it("every profile's `template` is a REAL statTemplates key", () => {
    // THE RULE THIS GUARDS: a derived CLASS is never a physics input (PHY-1's corollary, enforced by
    // system/idempotence.test.ts). `planet/earth-like`, `planet/ocean` and the sixty-odd others are
    // CLASSIFIER FINGERPRINTS, matched from a world's own physics - handing one to the generator
    // would be the fault. Only three planet templates actually exist, and a profile must name one.
    const real = Object.keys((pack as any).statTemplates ?? {}).filter((k) => k.startsWith('planet/'));
    expect(real.length).toBeGreaterThan(0);
    for (const c of CANDIDATES) expect(real, `${c.template} is not a generation template`).toContain(c.template);
  });

  it('`readsAs` names a CLASSIFIER class, and is never mistaken for the template', () => {
    const fingerprints = (pack as any).classifier.fingerprints.map((f: any) => f.class ?? f.key);
    for (const c of CANDIDATES) {
      if (!c.readsAs) continue;
      expect(fingerprints, `${c.readsAs} is not a class the classifier can produce`).toContain(c.readsAs);
    }
    // And the placement never returns a fingerprint as the thing to build with.
    const out = place();
    expect(out.template).not.toBe(out.readsAs);
  });

  it("AT LEAST ONE HUMAN-COMPATIBLE OPTION IS REACHABLE - the user's whole request", () => {
    // A standard atmosphere with oceans is the ordinary habitable case. If the shipped shortlist
    // cannot place a person on that without a suit, the feature has not been delivered.
    const out = place({ atmosphereDigit: 6, hydrographicsDigit: 7 });
    expect(out.placed).toBe(true);
    expect(out.grade).toBe('breathable');
  });

  it("the bypass codes come from the pack and include the user's own example", () => {
    expect(BYPASS.length).toBeGreaterThan(0);
    expect(BYPASS).toContain('He'); // hellworld, the code the user named
  });

  it('a pack declaring NEITHER still places somebody, sealed, rather than throwing', () => {
    expect(mainWorldBypassCodesFromPack(null)).toEqual([]);
    const fallback = mainWorldProfilesFromPack(null);
    expect(fallback.length).toBe(1);
    const out = place({ atmosphereDigit: 6 }, { candidates: fallback, bypassTradeCodes: [] });
    expect(out.placed).toBe(true);
    expect(out.grade).toBe('sealed');
  });

  it('every UWP atmosphere digit 0-15 is placeable by the shipped shortlist', () => {
    // "They will always TRY and pop a main world down." A digit the list cannot express is a hole.
    for (let d = 0; d <= 15; d++) {
      const out = place({ atmosphereDigit: d, hydrographicsDigit: 5 });
      expect(out.placed, `atmosphere ${d} could not be placed`).toBe(true);
      expect(out.template, `atmosphere ${d}`).toBeTruthy();
    }
  });
});

describe('G87 - some discomfort allowed', () => {
  // Owner, 2026-09-08: "some discomfort allowed... shirtsleeve can mean 'big coat' and a breather
  // mask". A breathable world is not pinned to the band's warm edge - a sector's worlds vary, and a
  // cold one is still somewhere people live.
  const breathable = (seed: string) =>
    placeMainWorld(facts({ atmosphereDigit: 6, atmosphereTempRangeK: [280, 310] }), {
      star: G2V, nodes: [G2V], candidates: CANDIDATES, bypassTradeCodes: BYPASS, seed
    });

  it('twenty worlds across a sector are NOT all at the same orbit', () => {
    const orbits = new Set<number>();
    for (let i = 0; i < 20; i++) orbits.add(+breathable(`Sector world ${i}`).a_AU.toFixed(4));
    expect(orbits.size).toBeGreaterThan(10);
  });

  it('...but every one of them is still inside the band', () => {
    for (let i = 0; i < 20; i++) {
      const out = breathable(`Sector world ${i}`);
      expect(out.a_AU, `world ${i}`).toBeGreaterThanOrEqual(out.zone.inner);
      expect(out.a_AU, `world ${i}`).toBeLessThanOrEqual(out.zone.outer);
    }
  });

  it('the spread stays in the INNER half, where a breathable atmosphere can still hold liquid', () => {
    // The outer half of a conservative band needs a thick CO2 greenhouse a nitrogen-oxygen world
    // does not have - measured, a world placed out there came back at 204 K and frozen.
    for (let i = 0; i < 20; i++) {
      const out = breathable(`Sector world ${i}`);
      const fraction = (out.a_AU - out.zone.inner) / (out.zone.outer - out.zone.inner);
      expect(fraction, `world ${i}`).toBeLessThanOrEqual(0.55);
    }
  });

  it('and it is still deterministic - the same world twice is the same orbit', () => {
    expect(breathable('Regina').a_AU).toBe(breathable('Regina').a_AU);
  });
});
