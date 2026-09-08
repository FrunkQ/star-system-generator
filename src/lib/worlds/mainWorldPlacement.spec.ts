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
  atmosphereFamily,
  BAND_FRACTION_BY_ATMOSPHERE,
  TOLERANCE_ORDER,
  type MainWorldCandidate,
  type MainWorldFacts
} from './mainWorldPlacement';
import { calculateGoldilocksZone } from '$lib/physics/zones';
import type { CelestialBody } from '$lib/types';

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
const CANDIDATES: MainWorldCandidate[] = [
  { type: 'planet/earth-like', grade: 'breathable', atmosphere: [5, 6], hydrographics: [3, 9] },
  { type: 'planet/desert', grade: 'breathable', atmosphere: [5, 6], hydrographics: [0, 2] },
  { type: 'planet/super-earth', grade: 'mask', atmosphere: [4, 9] },
  { type: 'planet/terrestrial', grade: 'sealed', atmosphere: [0, 15] }
];
const BYPASS = ['He', 'Da', 'Fo'];

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
    expect(out.type).toBe('planet/earth-like');
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
    expect(out.type).toBe('planet/desert');
    expect(TOLERANCE_ORDER[0]).toBe('breathable');
  });

  it('declines only when NOTHING in the shortlist can express the UWP - and names the reason', () => {
    const out = place({ atmosphereDigit: 6 }, { candidates: [{ type: 'planet/ocean', grade: 'breathable', atmosphere: [1, 2] }] });
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
    expect(out.type).toBe('planet/earth-like');
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

describe('G87 - thicker air sits further out, and the module holds no AU table', () => {
  it('a dense atmosphere is placed further out in the band than a thin one', () => {
    // Both use the same seed, so only the atmosphere family differs.
    const thin = place({ atmosphereDigit: 3 }).a_AU;
    const dense = place({ atmosphereDigit: 8 }).a_AU;
    expect(dense).toBeGreaterThan(thin);
  });

  it('every UWP atmosphere digit maps to a family with a band fraction inside [0, 1]', () => {
    for (let d = 0; d <= 15; d++) {
      const [lo, hi] = BAND_FRACTION_BY_ATMOSPHERE[atmosphereFamily(d)];
      expect(lo, `digit ${d}`).toBeGreaterThanOrEqual(0);
      expect(hi, `digit ${d}`).toBeLessThanOrEqual(1);
      expect(hi, `digit ${d}`).toBeGreaterThan(lo);
    }
  });

  it('THE MODULE CONTAINS NO SPECTRAL-CLASS TABLE AND NO AU TABLE', async () => {
    // The bug was a table of Sol's spacing standing in for a derivation. If one grows back here,
    // this is the thing that should notice. Fractions of a derived band are fine; AU figures are not.
    const src = (await import('node:fs')).readFileSync('src/lib/worlds/mainWorldPlacement.ts', 'utf8');
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
    expect(code).not.toMatch(/HZ_ANCHORS|BODE_TABLE/);
    // No object literal keyed by spectral letter.
    expect(code).not.toMatch(/["']?O["']?\s*:\s*\d+\s*,\s*["']?B["']?\s*:/);
  });
});
