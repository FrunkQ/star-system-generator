import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { deriveAlbedo } from './albedo';
import { deriveCloudDecks, type CloudDeck } from './cloudDecks';
import type { CelestialBody, RulePack } from '$lib/types';
import { EARTH_MASS_KG, EARTH_RADIUS_KM, LIQUIDS } from '$lib/constants';

// The REAL shipped data: the per-condensate reflectivities live in the rule pack, so a spec that
// invented its own would be testing nothing.
const gasPhysics = JSON.parse(readFileSync('static/rulepacks/starter-sf/atmospheres.json', 'utf8')).gasPhysics;
const pack = { gasPhysics, liquids: LIQUIDS } as unknown as RulePack;

const body = (p: Partial<CelestialBody>): CelestialBody =>
  ({ id: 'x', kind: 'body', roleHint: 'planet', tags: [], massKg: EARTH_MASS_KG, radiusKm: EARTH_RADIUS_KM, ...p }) as CelestialBody;

const deck = (species: string, coverage: number): CloudDeck =>
  ({ species, coverage, bucket: 'broken', condenseK: 250, precip: 'rain' }) as CloudDeck;

describe('deriveAlbedo — optics only; the decks are handed to it', () => {
  it('a bare surface with no decks is its makeup, and says so', () => {
    const a = deriveAlbedo(body({ makeup: { rock: 0.9, metal: 0.1 } }), 270, [], pack);
    expect(a.cloudCover).toBe(0);
    expect(a.cloudSpecies).toBeUndefined();
    expect(a.albedo).toBeLessThan(0.2);
    expect(a.note).toMatch(/cloud-free/i);
  });

  it('a deck reflects its OWN rule-pack cloudAlbedo over the share of sky it covers', () => {
    const bare = deriveAlbedo(body({ makeup: { rock: 1 } }), 270, [], pack);
    const clouded = deriveAlbedo(body({ makeup: { rock: 1 } }), 270, [deck('water', 0.5)], pack);
    // water's cloudAlbedo is 0.42 in the shipped data; half the sky of it over a 0.15 surface.
    expect(clouded.albedo).toBeCloseTo(0.42 * 0.5 + bare.albedo * 0.5, 3);
    expect(clouded.cloudSpecies).toBe('water');
    expect(clouded.cloudCover).toBeCloseTo(0.5, 2);
  });

  it('decks stack: the TOP one (last in the array) has the final say', () => {
    // A bright veil over a dark one reads bright, and the reverse reads dark — order matters, and
    // deriveCloudDecks hands them over deepest-first.
    const brightOnTop = deriveAlbedo(body({ makeup: { rock: 1 } }), 200, [deck('methane', 0.9), deck('sulfuric-acid', 0.9)], pack);
    const darkOnTop = deriveAlbedo(body({ makeup: { rock: 1 } }), 200, [deck('sulfuric-acid', 0.9), deck('methane', 0.9)], pack);
    expect(brightOnTop.albedo).toBeGreaterThan(darkOnTop.albedo);
    expect(brightOnTop.cloudSpecies).toBe('sulfuric-acid');
    expect(darkOnTop.cloudSpecies).toBe('methane');
  });

  it('an unlisted condensate still draws a deck (a user-added liquid gets the default)', () => {
    const a = deriveAlbedo(body({ makeup: { rock: 1 } }), 270, [deck('unobtainium-vapour', 1)], pack);
    expect(a.albedo).toBeCloseTo(0.45, 2);
  });

  // --- What is UNDER the clouds -----------------------------------------------------------------
  it('a liquid ocean is dark and a frozen one is bright — from the solvent phase at the SURFACE', () => {
    const hydro = { composition: 'water', coverage: 0.7 } as any;
    const atm = { main: 'N2', pressure_bar: 1, composition: { N2: 0.8 } } as any;
    const warm = deriveAlbedo(body({ hydrosphere: hydro, atmosphere: atm, temperatureK: 288 }), 255, [], pack);
    const frozen = deriveAlbedo(body({ hydrosphere: hydro, atmosphere: atm, temperatureK: 220 }), 255, [], pack);
    expect(warm.surfaceAlbedo).toBeLessThan(0.2);
    expect(frozen.surfaceAlbedo).toBeGreaterThan(0.4);
  });

  it('does not snowball: a greenhouse world with a cold EQUILIBRIUM temp keeps its ocean', () => {
    // Earth's equilibrium temperature is 255 K, well under freezing; its surface is not.
    const a = deriveAlbedo(body({
      hydrosphere: { composition: 'water', coverage: 0.7 } as any,
      atmosphere: { main: 'N2', pressure_bar: 1, composition: { N2: 0.8 } } as any,
      temperatureK: 288
    }), 255, [], pack);
    expect(a.surfaceAlbedo).toBeLessThan(0.2);
  });

  it('a boiled-off hydrosphere leaves the bare ground showing, not a sea', () => {
    const a = deriveAlbedo(body({
      makeup: { rock: 1 },
      hydrosphere: { composition: 'water', coverage: 0.9 } as any,
      atmosphere: { main: 'N2', pressure_bar: 0.5, composition: { N2: 1 } } as any,
      temperatureK: 700
    }), 600, [], pack);
    expect(a.surfaceAlbedo).toBeCloseTo(0.15, 2);
  });

  // --- Giants -----------------------------------------------------------------------------------
  it('a giant composites its decks over a deep atmosphere, not a surface', () => {
    const jovian = body({ makeup: { gas: 0.9, ice: 0.1 } });
    const clear = deriveAlbedo(jovian, 110, [], pack);
    const clouded = deriveAlbedo(jovian, 110, [deck('ammonium-hydrosulfide', 0.5), deck('ammonia', 0.9)], pack);
    expect(clear.note).toMatch(/cloud-free giant/i);
    expect(clouded.note).toMatch(/deep atmosphere/i);
    expect(clouded.albedo).toBeGreaterThan(clear.albedo);   // ammonia veil brightens it
  });

  it('a hot giant is dark: its clear air absorbs rather than scatters', () => {
    const hot = deriveAlbedo(body({ makeup: { gas: 0.95 } }), 1800, [], pack);
    const cool = deriveAlbedo(body({ makeup: { gas: 0.95 } }), 110, [], pack);
    expect(hot.albedo).toBeLessThan(0.1);
    expect(cool.albedo).toBeGreaterThan(0.25);
  });

  // --- Overrides --------------------------------------------------------------------------------
  it('a manually pinned albedo wins', () => {
    const a = deriveAlbedo(body({ albedo: 0.9 } as any), 300, [], pack);
    expect(a.albedo).toBe(0.9);
    expect(a.note).toMatch(/manual/i);
  });

  it('a GM albedo OVERRIDE (overrides.albedo) wins over the derived value', () => {
    const a = deriveAlbedo(body({
      hydrosphere: { composition: 'water', coverage: 0.7 } as any,
      overrides: { albedo: 0.05 }
    }), 255, [deck('water', 0.8)], pack);
    expect(a.albedo).toBe(0.05);
    expect(a.note).toMatch(/override/i);
  });
});

// The bug this module was rewritten to kill: albedo.ts had its own condensation test, so the albedo
// model and the cloud-deck model could describe the same sky two different ways on the same body.
describe('albedo and the cloud-deck model cannot disagree', () => {
  const withDecks = (b: CelestialBody) => deriveAlbedo(b, b.equilibriumTempK ?? 0, deriveCloudDecks(b, pack), pack);

  it('ADRIAN: nothing in 8 bar of hot CO2 condenses, so there is no deck in either model', () => {
    // Tau Ceti's Adrian (bundled science-fiction starmap). The old model read CO2 at 91% against a
    // 195 K boiling point times 1.6, called it a cloud deck, and put the albedo at 0.649 — while the
    // deck model, walking the actual atmospheric column, found nothing condensing at all.
    const adrian = body({
      massKg: 2.347e25, radiusKm: 9219, equilibriumTempK: 304, temperatureK: 641,
      atmosphere: { main: 'CO2', pressure_bar: 8, composition: { CO2: 0.9095, N2: 0.08, Ar: 0.01 } } as any
    });
    expect(deriveCloudDecks(adrian, pack)).toEqual([]);
    const a = withDecks(adrian);
    expect(a.cloudSpecies).toBeUndefined();
    expect(a.cloudCover).toBe(0);
    expect(a.albedo).toBeLessThan(0.25);
  });

  it('VENUS: the deck is sulphuric acid in both models, not CO2', () => {
    const venus = body({
      massKg: 4.87e24, radiusKm: 6052, equilibriumTempK: 230, temperatureK: 754,
      atmosphere: { pressure_bar: 92, composition: { CO2: 0.965, N2: 0.034, SO2: 0.00015, H2O: 0.00002 } } as any
    });
    const a = withDecks(venus);
    expect(a.cloudSpecies).toBe('sulfuric-acid');
    // Venus's measured Bond albedo is 0.76.
    expect(a.albedo).toBeGreaterThan(0.7);
    expect(a.albedo).toBeLessThan(0.82);
  });

  it('EARTH: water clouds the ocean makes for itself, at the measured Bond albedo', () => {
    const earth = body({
      massKg: 5.97e24, radiusKm: 6371, equilibriumTempK: 254, temperatureK: 288,
      atmosphere: { pressure_bar: 1, composition: { N2: 0.78, O2: 0.21 } } as any,
      hydrosphere: { coverage: 0.71, composition: 'water' } as any
    });
    const a = withDecks(earth);
    expect(a.cloudSpecies).toBe('water');
    expect(a.albedo).toBeGreaterThan(0.28);   // measured 0.306
    expect(a.albedo).toBeLessThan(0.34);
  });
});
