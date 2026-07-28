import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  deriveCloudDecks, effectiveComposition, applyCloudDeckTags, decksFromTags, deriveWeather,
  parseCloudDeckValue, CLOUD_DECK_TAG, PRECIPITATION_TAG, LIGHTNING_TAG
} from './cloudDecks';
import type { CelestialBody, RulePack, Tag } from '$lib/types';

// The REAL default data — these fixtures pin the shipped behaviour of the shipped numbers, per
// docs/dev/cloud-decks-design.md. If a data edit breaks an archetype, that is the signal.
const gasPhysics = JSON.parse(readFileSync('static/rulepacks/starter-sf/atmospheres.json', 'utf8')).gasPhysics;
const pack = { gasPhysics } as unknown as RulePack;

const world = (over: Partial<CelestialBody>) => ({
  id: 'w', roleHint: 'planet', tags: [], ...over
}) as unknown as CelestialBody;

const species = (decks: ReturnType<typeof deriveCloudDecks>) => decks.map((d) => d.species);

// ── Archetypes ───────────────────────────────────────────────────────────────────────────────────
// Mass, radius and equilibrium temperature are part of the fixture now, not decoration: the profile
// needs gravity to weigh a column and the equilibrium temperature to set the skin temperature aloft.
const earth = () => world({
  temperatureK: 288, equilibriumTempK: 255, radiusKm: 6371, massKg: 5.97e24,
  atmosphere: { pressure_bar: 1, composition: { N2: 0.78, O2: 0.21 } } as any,   // NO explicit H2O
  hydrosphere: { coverage: 0.71, composition: 'water' } as any
});
const venus = () => world({
  temperatureK: 737, equilibriumTempK: 232, radiusKm: 6052, massKg: 4.87e24,
  // Real trace abundances — the acid deck DERIVES from SO2 + H2O rather than being authored.
  atmosphere: { pressure_bar: 92, composition: { CO2: 0.965, N2: 0.034, SO2: 0.00015, H2O: 0.00002 } } as any
});
const mars = () => world({
  temperatureK: 215, equilibriumTempK: 210, radiusKm: 3390, massKg: 6.42e23,
  atmosphere: { pressure_bar: 0.006, composition: { CO2: 0.95, N2: 0.027, Ar: 0.016, H2O: 0.0013 } } as any
});
const titan = () => world({
  temperatureK: 94, equilibriumTempK: 82, radiusKm: 2575, massKg: 1.35e23,
  atmosphere: { pressure_bar: 1.5, composition: { N2: 0.95, CH4: 0.05 } } as any,
  hydrosphere: { coverage: 0.3, composition: 'methane' } as any                   // seas AND air CH4
});

describe('cloud decks — the single evaluation', () => {
  it('EARTH: water clouds from the ocean alone (no H2O in the declared composition), raining', () => {
    const decks = deriveCloudDecks(earth(), pack);
    expect(species(decks)).toContain('water');
    expect(decks.find((d) => d.species === 'water')!.precip).toBe('rain');
  });

  it('VENUS: keeps its sulphuric-acid deck despite a 737 K surface — and the rain never lands', () => {
    // The deck forms ALOFT where it is cold; testing at surface temperature would delete it.
    const decks = deriveCloudDecks(venus(), pack);
    const acid = decks.find((d) => d.species === 'sulfuric-acid');
    expect(acid).toBeTruthy();
    expect(acid!.precip).toBe('virga');   // gas again long before the 737 K ground
  });

  it('VENUS is wrapped COMPLETELY: a deck that never rains out cannot clear', () => {
    // A few ppm of vapour, but the droplets evaporate on the way down and recycle (virga), so the
    // cover is permanent — which is how Venus is total overcast on less water than Earth carries.
    const acid = deriveCloudDecks(venus(), pack).find((d) => d.species === 'sulfuric-acid')!;
    expect(acid.bucket).toBe('veil');
    // Earth's water DOES reach the ground and leaves gaps, so it stays short of a total veil.
    expect(deriveCloudDecks(earth(), pack).find((d) => d.species === 'water')!.bucket).not.toBe('veil');
  });

  it('MARS: 0.13% water still forms an ice-crystal deck over frozen ground — snow, not deletion', () => {
    // Pins BOTH halves of the original bug: the borderline trace fraction forms a deck, and the
    // frozen surface must NOT suppress it (the first-draft snow-out rule would have).
    const decks = deriveCloudDecks(mars(), pack);
    const water = decks.find((d) => d.species === 'water');
    expect(water).toBeTruthy();
    // VIRGA, not snow: the air at the Martian surface is nowhere near saturated, so the ice
    // sublimes on the way down and never lands. The profile is what makes that answerable.
    expect(water!.precip).toBe('virga');
    // CO2 has NO cloud block by default (Alex: not cloud-forming, yet — a GM can add it in data).
    expect(species(decks)).not.toContain('carbon-dioxide');
  });

  it('TITAN: sea CH4 and atmospheric CH4 dedupe to ONE methane deck, raining methane', () => {
    const decks = deriveCloudDecks(titan(), pack);
    const methane = decks.filter((d) => d.species === 'methane');
    expect(methane.length).toBe(1);
    expect(methane[0].precip).toBe('rain');   // 94 K sits inside methane's 91–112 K liquid span
  });

  it('AIRLESS: a condensable-dominated exosphere forms nothing (pressure gate)', () => {
    const mercury = world({
      temperatureK: 440,
      atmosphere: { pressure_bar: 1e-11, composition: { Na: 0.6, K: 0.4 } } as any
    });
    expect(deriveCloudDecks(mercury, pack)).toEqual([]);
  });

  it('SUPERCRITICAL: past the critical point there is no deck', () => {
    // Deep hot world: water's critical point is 647 K — at a deck temperature above it, no water deck.
    const hot = world({
      temperatureK: 2400,
      atmosphere: { pressure_bar: 200, composition: { N2: 0.9, H2O: 0.1 } } as any
    });
    expect(species(deriveCloudDecks(hot, pack))).not.toContain('water');
  });

  it('stack order: deeper-condensing species first, top deck last', () => {
    // Jupiter-ish mix: ammonia condenses colder than water → water sits DEEPER (first).
    const jovian = world({
      temperatureK: 165,
      atmosphere: { pressure_bar: 10, composition: { H2: 0.86, He: 0.13, NH3: 0.004, H2O: 0.002 } } as any
    });
    const s = species(deriveCloudDecks(jovian, pack));
    expect(s.indexOf('water')).toBeLessThan(s.indexOf('ammonia'));
  });
});

describe('reaction products (one generation)', () => {
  it('NH4SH derives from NH3 + H2S, limited by the scarcer constituent, which depletes', () => {
    const comp = effectiveComposition({ NH3: 0.004, H2S: 0.001 }, pack);
    expect(comp.NH4SH).toBeCloseTo(0.001, 9);
    expect(comp.H2S).toBeCloseTo(0, 9);          // fully consumed
    expect(comp.NH3).toBeCloseTo(0.003, 9);      // the excess survives to make its own deck
  });

  it('a Jupiter-ish mix yields the NH3-over-NH4SH pair — the belts as data, not code', () => {
    const jovian = world({
      temperatureK: 165, equilibriumTempK: 110, radiusKm: 69911, massKg: 1.898e27,
      makeup: { gas: 0.95, ice: 0.03, rock: 0.02 } as any,     // a GIANT: no surface to frost onto
      atmosphere: { pressure_bar: 10, composition: { H2: 0.86, He: 0.13, NH3: 0.004, H2S: 0.0008 } } as any
    });
    const s = species(deriveCloudDecks(jovian, pack));
    expect(s).toContain('ammonia');
    expect(s).toContain('ammonium-hydrosulfide');
    // NH4SH condenses warmer → deeper than the ammonia deck above it.
    expect(s.indexOf('ammonium-hydrosulfide')).toBeLessThan(s.indexOf('ammonia'));
  });

  it('no chains: a product does not react further, and an explicit product is left alone', () => {
    const explicit = effectiveComposition({ NH4SH: 0.002, NH3: 0.004, H2S: 0.001 }, pack);
    expect(explicit.NH4SH).toBe(0.002);          // declared wins — nothing derived on top
    expect(explicit.NH3).toBe(0.004);
  });

  it('YIELD scales photochemical traces: Titan makes ppm-level HCN, not min(N2, CH4)', () => {
    // Without yield, N2 0.95 + CH4 0.05 would put HCN at 5% of the sky. Real conversion is a sliver.
    const comp = effectiveComposition({ N2: 0.95, CH4: 0.05 }, pack);
    expect(comp.HCN).toBeCloseTo(0.05 * 0.002, 9);
    expect(comp.CH4).toBeCloseTo(0.05 - 0.05 * 0.002, 9);   // only the converted amount depletes
  });

  it('VENUS example: SO2 + H2O derive the sulphuric acid that IS the Venus deck', () => {
    // A Venus authored WITHOUT explicit H2SO4 still grows its acid clouds from the precursors.
    const primordialVenus = world({
      temperatureK: 737, equilibriumTempK: 232, radiusKm: 6052, massKg: 4.87e24,
      atmosphere: { pressure_bar: 92, composition: { CO2: 0.96, N2: 0.034, SO2: 0.003, H2O: 0.002 } } as any
    });
    const s = species(deriveCloudDecks(primordialVenus, pack));
    expect(s).toContain('sulfuric-acid');
  });
});

describe('visibility floors vs reactions', () => {
  it('a reaction must not erase BOTH its reactant and its product', () => {
    // Real Jupiter: NH3 0.026%, H2S 0.008%. The reaction consumes all the H2S and leaves NH3 at
    // 0.018% — if the floors sit above those remainders, the ammonia deck AND the NH4SH deck both
    // vanish and the giant silently loses its whole belt chemistry. That is what happened when the
    // floors were first set from bulk-abundance intuition rather than visibility.
    const jupiter = world({
      temperatureK: 166, equilibriumTempK: 110, radiusKm: 69911, massKg: 1.898e27,
      makeup: { gas: 0.95, ice: 0.03, rock: 0.02 } as any,
      atmosphere: { pressure_bar: 1, composition: { H2: 0.86, He: 0.13, CH4: 0.003, NH3: 0.00026, H2S: 0.00008 } } as any
    });
    const s = species(deriveCloudDecks(jupiter, pack));
    expect(s).toContain('ammonia');
    expect(s).toContain('ammonium-hydrosulfide');
    // …and stacked correctly: NH4SH condenses warmer, so it sits DEEPER than the ammonia above it.
    expect(s.indexOf('ammonium-hydrosulfide')).toBeLessThan(s.indexOf('ammonia'));
  });

  it('trace condensables at REAL abundances still form decks (Mars ~210 ppm water)', () => {
    // The floors are a visibility threshold, not a bulk-abundance one — Mars genuinely has
    // water-ice cloud. This is the original reported bug, at the real number.
    const realMars = world({
      temperatureK: 217, equilibriumTempK: 210, radiusKm: 3390, massKg: 6.42e23,
      atmosphere: { pressure_bar: 0.006, composition: { CO2: 0.95, N2: 0.027, H2O: 0.00021 } } as any
    });
    const decks = deriveCloudDecks(realMars, pack);
    expect(species(decks)).toContain('water');
    expect(decks.find((d) => d.species === 'water')!.bucket).toBe('wisps');  // thin, but there
  });
});

describe('weather — derived, not sprinkled', () => {
  it('EARTH: a warm thick convecting deck over an ocean gets lightning and a monsoon', () => {
    const e = earth(); (e as any).axial_tilt_deg = 23.4;
    const w = deriveWeather(e, deriveCloudDecks(e, pack), pack);
    expect(w.lightning).toBeTruthy();
    expect(w.monsoon).toBe('water');       // rain that lands + an ocean + a real tilt
    expect(w.dustStorms).toBeUndefined();  // an ocean pins the dust down
  });

  it('MARS: dry, thin-aired and cloudless enough for dust storms — and no monsoon', () => {
    const m = mars(); (m as any).axial_tilt_deg = 25;
    const w = deriveWeather(m, deriveCloudDecks(m, pack), pack);
    expect(w.dustStorms).toBeTruthy();
    expect(w.monsoon).toBeUndefined();     // no ocean to supply it
  });

  it('a tilt-less ocean world rains but has no monsoon (no seasons to swing)', () => {
    const flat = earth(); (flat as any).axial_tilt_deg = 0;
    expect(deriveWeather(flat, deriveCloudDecks(flat, pack), pack).monsoon).toBeUndefined();
  });

  it('an airless body gets no weather at all', () => {
    const rock = world({ temperatureK: 300, atmosphere: { pressure_bar: 0, composition: {} } as any });
    expect(deriveWeather(rock, [], pack)).toEqual({});
  });

  it('a GIANT gets lightning from its own internal convection, not its cold cloud tops', () => {
    // Jupiter's cloud tops are ~125 K. Judged on that alone it reads "too cold for storms" — about
    // the most electrically violent place in the solar system.
    const jovian = world({
      temperatureK: 125,
      makeup: { gas: 0.9, ice: 0.1 } as any,
      atmosphere: { pressure_bar: 1, composition: { H2: 0.86, He: 0.13, NH3: 0.004, H2S: 0.0008 } } as any
    });
    expect(deriveWeather(jovian, deriveCloudDecks(jovian, pack), pack).lightning).toBeTruthy();
  });

  it('volcanism drives lightning even through a thinner atmosphere', () => {
    const ashy = world({
      temperatureK: 300,
      atmosphere: { pressure_bar: 0.8, composition: { N2: 0.6, H2O: 0.2, SO2: 0.2 } } as any,
      tags: [{ key: 'tidal/volcanism' }]
    });
    expect(deriveWeather(ashy, deriveCloudDecks(ashy, pack), pack).lightning).toBeTruthy();
  });
});

describe('tags — the published interface', () => {
  it('emits one deck tag + one precipitation tag per deck, and round-trips through the parser', () => {
    const tags = applyCloudDeckTags([], deriveCloudDecks(earth(), pack));
    const deckTags = tags.filter((t) => t.key === CLOUD_DECK_TAG);
    const precipTags = tags.filter((t) => t.key === PRECIPITATION_TAG);
    expect(deckTags.length).toBeGreaterThan(0);
    expect(precipTags.length).toBe(deckTags.length);
    const parsed = parseCloudDeckValue(deckTags[0].value);
    expect(parsed.species).toBe('water');
    expect(decksFromTags(tags, pack)[0].species).toBe('water');
  });

  it('IDEMPOTENT: a second pass over its own output changes nothing (the anti-Mars-bug test)', () => {
    const decks = deriveCloudDecks(mars(), pack);
    const once = applyCloudDeckTags([], decks);
    const twice = applyCloudDeckTags(once, decks);
    expect(twice).toEqual(once);
  });

  it('manual tags survive re-derivation and beat an auto deck of the same species', () => {
    const manual: Tag = { key: CLOUD_DECK_TAG, value: 'water veil', manual: true };
    const tags = applyCloudDeckTags([manual], deriveCloudDecks(earth(), pack));
    const waterTags = tags.filter((t) => t.key === CLOUD_DECK_TAG && parseCloudDeckValue(t.value).species === 'water');
    expect(waterTags).toEqual([manual]);         // the GM's veil, not the derived bucket
    // And the renderer draws the GM's version.
    expect(decksFromTags(tags, pack).find((d) => d.species === 'water')!.bucket).toBe('veil');
  });

  it('legacy values (old saves held a colour word) parse leniently instead of throwing', () => {
    expect(parseCloudDeckValue('white')).toEqual({ species: 'white', bucket: 'scattered' });
    expect(parseCloudDeckValue(undefined).bucket).toBe('scattered');
  });
});

// ── The adiabat ──────────────────────────────────────────────────────────────────────────────────
// These pin the thing the profile was built for. Before it existed, condensation was tested at one
// notional "deck temperature" fudged from the surface, and the giants paid for it: Saturn grew a
// methane deck the real planet does not have and read grey instead of gold. The test that matters
// most here is an ABSENCE.
describe('the temperature profile places decks at real pressure levels', () => {
  const giant = (over: Partial<CelestialBody>) => world({
    makeup: { gas: 0.95, ice: 0.03, rock: 0.02 } as any, ...over
  });
  const jupiter = () => giant({
    temperatureK: 165, equilibriumTempK: 110, radiusKm: 69911, massKg: 1.898e27,
    atmosphere: { pressure_bar: 1, composition: { H2: 0.898, He: 0.1, CH4: 0.003, NH3: 0.00026, H2S: 0.00008 } } as any
  });
  const saturn = () => giant({
    temperatureK: 134, equilibriumTempK: 95, radiusKm: 58232, massKg: 5.68e26,
    atmosphere: { pressure_bar: 1, composition: { H2: 0.963, He: 0.032, CH4: 0.0045, NH3: 0.000125, H2S: 0.00004 } } as any
  });
  const uranus = () => giant({
    temperatureK: 76, equilibriumTempK: 59, radiusKm: 25362, massKg: 8.68e25,
    atmosphere: { pressure_bar: 1, composition: { H2: 0.83, He: 0.15, CH4: 0.023 } } as any
  });

  it('SATURN has NO methane deck — the bug this whole model exists to fix', () => {
    // Saturn carries HALF AGAIN as much methane as Jupiter and is colder, so any model testing
    // condensation at a single notional temperature gives it a methane deck, and Saturn comes out
    // grey. It does not have one: its profile bottoms out at the skin temperature well before the
    // methane partial pressure ever reaches saturation. The deck it does get is the ammonium
    // hydrosulphide that makes the real planet gold.
    const s = species(deriveCloudDecks(saturn(), pack));
    expect(s).not.toContain('methane');
    expect(s).toContain('ammonium-hydrosulfide');
  });

  it('a giant quoted at DEPTH is still read at the reference level', () => {
    // Real saved data quotes a giant's pressure at anything from 1 bar to 200000 — it has no surface,
    // so the number is whatever depth its author picked, while the TEMPERATURE is by this app's
    // convention the ~1 bar reading. Anchoring 165 K at 200000 bar puts the whole visible atmosphere
    // at its coldest-sky temperature and grows Jupiter a methane deck it has never had.
    const deep = () => giant({
      temperatureK: 165, equilibriumTempK: 110, radiusKm: 69911, massKg: 1.898e27,
      atmosphere: { pressure_bar: 200000, composition: { H2: 0.86, He: 0.13, CH4: 0.003 } } as any
    });
    expect(species(deriveCloudDecks(deep(), pack))).not.toContain('methane');
  });

  it('URANUS, colder and far richer in methane, does get one', () => {
    // The discriminator is the profile, not the abundance: same species, same physics, and the two
    // planets diverge because their temperatures do.
    expect(species(deriveCloudDecks(uranus(), pack))).toContain('methane');
  });

  it('JUPITER stacks ammonia over ammonium hydrosulphide, and no methane either', () => {
    const decks = deriveCloudDecks(jupiter(), pack);
    const s = species(decks);
    expect(s).not.toContain('methane');
    expect(s.indexOf('ammonium-hydrosulfide')).toBeLessThan(s.indexOf('ammonia'));
    // Deepest-first, and the bases are real pressures: the hydrosulphide condenses lower down.
    expect(decks[0].baseBar!).toBeGreaterThan(decks[decks.length - 1].baseBar!);
  });

  it('places EARTH cloud base near 1 bar and MARS ice near a millibar', () => {
    const w = deriveCloudDecks(earth(), pack).find((d) => d.species === 'water')!;
    expect(w.baseBar!).toBeGreaterThan(0.5);
    expect(w.baseBar!).toBeLessThan(1);
    const m = deriveCloudDecks(mars(), pack).find((d) => d.species === 'water')!;
    expect(m.baseBar!).toBeLessThan(0.006);        // aloft, not at the ground
    expect(m.baseK!).toBeLessThan(mars().temperatureK!);
  });

  it('EARTH is broken-to-overcast and VENUS is a total veil, from the same rule', () => {
    // Not a special case any more: Earth's water reaches the ground, drains the deck and leaves
    // gaps; Venus's acid evaporates on the way down and goes straight back up.
    expect(deriveCloudDecks(earth(), pack).find((d) => d.species === 'water')!.coverage)
      .toBeLessThan(0.8);
    expect(deriveCloudDecks(venus(), pack).find((d) => d.species === 'sulfuric-acid')!.bucket)
      .toBe('veil');
  });
});
