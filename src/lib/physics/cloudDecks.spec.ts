import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  deriveCloudDecks, effectiveComposition, applyCloudDeckTags, decksFromTags,
  parseCloudDeckValue, CLOUD_DECK_TAG, PRECIPITATION_TAG
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
const earth = () => world({
  temperatureK: 288,
  atmosphere: { pressure_bar: 1, composition: { N2: 0.78, O2: 0.21 } } as any,   // NO explicit H2O
  hydrosphere: { coverage: 0.71, composition: 'water' } as any
});
const venus = () => world({
  temperatureK: 737,
  atmosphere: { pressure_bar: 92, composition: { CO2: 0.965, N2: 0.034, H2SO4: 0.001 } } as any
});
const mars = () => world({
  temperatureK: 215,
  atmosphere: { pressure_bar: 0.006, composition: { CO2: 0.95, N2: 0.027, Ar: 0.016, H2O: 0.0013 } } as any
});
const titan = () => world({
  temperatureK: 94,
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

  it('MARS: 0.13% water still forms an ice-crystal deck over frozen ground — snow, not deletion', () => {
    // Pins BOTH halves of the original bug: the borderline trace fraction forms a deck, and the
    // frozen surface must NOT suppress it (the first-draft snow-out rule would have).
    const decks = deriveCloudDecks(mars(), pack);
    const water = decks.find((d) => d.species === 'water');
    expect(water).toBeTruthy();
    expect(water!.precip).toBe('snow');
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
      temperatureK: 165,
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
