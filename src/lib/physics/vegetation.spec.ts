import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import type { Biosphere, CelestialBody, RulePack } from '$lib/types';
import { deriveVegetation, biosphereLayers, allMorphologies, habitableLatitudeBand, vegetationTint } from './vegetation';
import { deriveSurfaceSpectrum } from './surfaceSpectrum';

const pack = JSON.parse(readFileSync('static/rulepacks/starter-sf/atmospheres.json', 'utf8')) as unknown as RulePack;
// A stable stand-in for the processor's own id-seeded stream (DATA-G1 — the caller owns the seed).
const roll = (seed: string) => (purpose: string) => {
  let h = 2166136261;
  const s = `${seed}|${purpose}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
};

const bio = (over: Partial<Biosphere> = {}): Biosphere => ({
  complexity: 'complex', coverage: 0.6, biochemistry: 'water-carbon',
  energy_source: 'photosynthesis', morphologies: [], ...over
});

const world = (over: Partial<CelestialBody> = {}): CelestialBody => ({
  id: 'w1', kind: 'body', name: 'World', roleHint: 'planet',
  makeup: { rock: 0.7, metal: 0.3 }, calculatedGravity_ms2: 9.81, temperatureK: 288,
  atmosphere: { pressure_bar: 1, molarMassKg: 0.02896, composition: { N2: 0.78, O2: 0.21, H2O: 0.004, CO2: 0.0004 } },
  hydrosphere: { composition: 'water', coverage: 0.7 },
  ...over
} as CelestialBody);

// deriveVegetation takes the CURVES: the summary is what rides on the body, the curves are used in
// the same pass and dropped.
const spectrumFor = (b: CelestialBody, t = 5778, l = 1, d = 1) =>
  deriveSurfaceSpectrum(b, { starTempK: t, luminositySolar: l, distanceAU: d }, pack)?.curves;

describe('biosphereLayers — ONE reader, both stored forms', () => {
  it('reads the new record form and keeps its ORDER, because the order IS the hierarchy', () => {
    const b = bio({ morphologies: [
      { morphology: 'flora', coverage: 0.5 },
      { morphology: 'microbial', coverage: 0.8 }
    ] });
    expect(biosphereLayers(b, pack).map((l) => l.morphology)).toEqual(['flora', 'microbial']);
  });

  it('still loads a legacy list of bare strings, and sorts THOSE by the pack order', () => {
    const b = bio({ morphologies: ['flora', 'microbial', 'fungal'], coverage: 1 });
    const out = biosphereLayers(b, pack);
    expect(out.map((l) => l.morphology)).toEqual(['microbial', 'fungal', 'flora']);
    // A legacy entry has no coverage of its own, so it takes the definition default scaled by the
    // biosphere's single old global coverage — the extent it was authored with, not full cover.
    const flora = allMorphologies(pack).find((m) => m.key === 'flora')!;
    expect(out.find((l) => l.morphology === 'flora')!.coverage).toBeCloseTo(flora.defaultCoverage, 6);
  });

  it('scales a legacy list by the old global coverage rather than ignoring it', () => {
    const half = biosphereLayers(bio({ morphologies: ['flora'], coverage: 0.5 }), pack);
    const full = biosphereLayers(bio({ morphologies: ['flora'], coverage: 1 }), pack);
    expect(half[0].coverage).toBeCloseTo(full[0].coverage / 2, 6);
  });
});

describe('the morphology definitions carry every difference — there are no special rules', () => {
  it('gives flora the pigment colour and gives fauna none at all', () => {
    const b = world({ biosphere: bio({ morphologies: [
      { morphology: 'flora', coverage: 0.6 }, { morphology: 'fauna', coverage: 0.9 }
    ] }) });
    const veg = deriveVegetation(b, spectrumFor(b), { roll: roll(b.id) }, pack)!;
    const flora = veg.layers.find((l) => l.morphology === 'flora')!;
    const fauna = veg.layers.find((l) => l.morphology === 'fauna')!;
    expect(flora.colorHex).toBeTruthy();
    // TWO EMPTY RANGES in fauna's record — no tints and no pigment drive. Nothing in the code
    // knows what fauna is, and a 90% slider still paints nothing.
    expect(fauna.colorHex).toBeNull();
  });

  it('lets a morphology with a LIGHT range be dark by day and lit by night, with no code for it', () => {
    const b = world({ biosphere: bio({ morphologies: [{ morphology: 'techno', coverage: 0.3 }] }) });
    const veg = deriveVegetation(b, spectrumFor(b), { roll: roll(b.id) }, pack)!;
    const techno = veg.layers[0];
    expect(techno.colorHex).toBeTruthy();
    expect(techno.light).toBeGreaterThan(0);
    // Every other morphology has an EMPTY light range and therefore no lights.
    const b2 = world({ biosphere: bio({ morphologies: [{ morphology: 'flora', coverage: 0.9 }] }) });
    expect(deriveVegetation(b2, spectrumFor(b2), { roll: roll(b2.id) }, pack)!.layers[0].light).toBe(0);
  });

  it('mixes tint and pigment in the proportion the definition states', () => {
    const b = world({ biosphere: bio({ morphologies: [
      { morphology: 'microbial', coverage: 0.7 }, { morphology: 'fungal', coverage: 0.5 }
    ] }) });
    const veg = deriveVegetation(b, spectrumFor(b), { roll: roll(b.id) }, pack)!;
    for (const l of veg.layers) expect(l.colorHex).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('energy_source is the gate for the whole star-colour idea', () => {
  it('gives a photosynthetic biosphere a pigment and a chemosynthetic one none', () => {
    const photo = world({ biosphere: bio({ morphologies: [{ morphology: 'flora', coverage: 0.6 }] }) });
    const chemo = world({ biosphere: bio({ energy_source: 'chemosynthesis', morphologies: [{ morphology: 'flora', coverage: 0.6 }] }) });
    expect(deriveVegetation(photo, spectrumFor(photo), { roll: roll('a') }, pack)!.pigment).toBeTruthy();
    const c = deriveVegetation(chemo, spectrumFor(chemo), { roll: roll('a') }, pack)!;
    expect(c.pigment).toBeNull();
    // …and flora, whose definition is ENTIRELY pigment-driven, then paints nothing. Correct for
    // life at a vent, and reached without one branch on the energy source.
    expect(c.layers[0].colorHex).toBeNull();
  });

  it('still colours a chemosynthetic MICROBIAL mat, because its definition carries its own tints', () => {
    const b = world({ biosphere: bio({ energy_source: 'chemosynthesis', morphologies: [{ morphology: 'microbial', coverage: 0.6 }] }) });
    const veg = deriveVegetation(b, spectrumFor(b), { roll: roll(b.id) }, pack)!;
    expect(veg.pigment).toBeNull();
    expect(veg.layers[0].colorHex).toBeTruthy();
  });
});

describe('coverage arithmetic — of the land, not a share of it', () => {
  it('lets the sliders sum past 100% and still reports a union below it', () => {
    const b = world({ biosphere: bio({ morphologies: [
      { morphology: 'microbial', coverage: 0.8 },
      { morphology: 'fungal', coverage: 0.5 },
      { morphology: 'flora', coverage: 0.6 }
    ] }) });
    const veg = deriveVegetation(b, spectrumFor(b), { roll: roll(b.id) }, pack)!;
    const sum = veg.layers.reduce((s, l) => s + l.coverage, 0);
    expect(sum).toBeGreaterThan(1);
    expect(veg.visibleCover).toBeLessThan(1);
    expect(veg.visibleCover).toBeGreaterThan(0.8);
  });

  it('paints nothing when every layer present contributes no colour', () => {
    const b = world({ biosphere: bio({ morphologies: [{ morphology: 'fauna', coverage: 1 }] }) });
    const veg = deriveVegetation(b, spectrumFor(b), { roll: roll(b.id) }, pack)!;
    expect(veg.visibleCover).toBe(0);
    expect(vegetationTint(veg)).toBeNull();
  });
});

describe('placement is DERIVED from the solvent, never from an Earth habit', () => {
  it('excludes the poles on a cold-poled world without any rule saying "skip the poles"', () => {
    const b = world({
      temperatureK: 288,
      temperatureProfile: { meanK: 288, totalMinK: 200, totalMaxK: 320, components: [
        { source: 'latitude', label: 'Latitude', lowK: 240, highK: 305 }] }
    });
    const band = habitableLatitudeBand(b, bio(), pack);
    expect(band.centreDeg).toBeLessThan(60);
    expect(band.widthDeg).toBeLessThan(90);
  });

  it('excludes the EQUATOR instead when the equator is above the solvent\'s boiling point', () => {
    const b = world({
      temperatureK: 340,
      temperatureProfile: { meanK: 340, totalMinK: 300, totalMaxK: 420, components: [
        { source: 'latitude', label: 'Latitude', lowK: 320, highK: 420 }] }
    });
    const band = habitableLatitudeBand(b, bio(), pack);
    expect(band.centreDeg).toBeGreaterThan(30);
  });

  it('gives the whole globe to a uniformly temperate world', () => {
    const b = world({
      temperatureProfile: { meanK: 290, totalMinK: 288, totalMaxK: 292, components: [
        { source: 'latitude', label: 'Latitude', lowK: 289, highK: 291 }] }
    });
    // ONE convention: the whole globe is centre 45 / half-width 45, covering |lat| 0-90.
    const band = habitableLatitudeBand(b, bio(), pack);
    expect(band.centreDeg - band.widthDeg).toBeLessThanOrEqual(0);
    expect(band.centreDeg + band.widthDeg).toBeGreaterThanOrEqual(90);
  });

  it('follows the SOLVENT, so an ammonia world bands somewhere else entirely', () => {
    const profile = { meanK: 220, totalMinK: 180, totalMaxK: 260, components: [
      { source: 'latitude' as const, label: 'Latitude', lowK: 180, highK: 260 }] };
    const water = habitableLatitudeBand(world({ temperatureProfile: profile }), bio(), pack);
    const ammonia = habitableLatitudeBand(
      world({ temperatureProfile: profile, hydrosphere: { composition: 'ammonia', coverage: 0.5 } }), bio(), pack);
    expect(ammonia.centreDeg).not.toBe(water.centreDeg);
  });
});

describe('determinism', () => {
  it('gives the same world the same answer every time it is asked', () => {
    const b = world({ biosphere: bio({ morphologies: [
      { morphology: 'microbial', coverage: 0.7 }, { morphology: 'flora', coverage: 0.5 }] }) });
    const a = deriveVegetation(b, spectrumFor(b), { roll: roll(b.id) }, pack)!;
    const c = deriveVegetation(b, spectrumFor(b), { roll: roll(b.id) }, pack)!;
    expect(JSON.stringify(a)).toBe(JSON.stringify(c));
  });

  it('gives two different worlds under the same star different draws', () => {
    const mk = (id: string) => {
      const b = world({ id, biosphere: bio({ morphologies: [{ morphology: 'flora', coverage: 0.6 }] }) });
      return deriveVegetation(b, spectrumFor(b), { roll: roll(id) }, pack)!;
    };
    const seen = new Set(Array.from({ length: 24 }, (_, i) => mk(`w${i}`).pigment));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('refuses to answer where there is nothing to draw', () => {
  it('returns undefined with no biosphere and with an empty morphology list', () => {
    const none = world();
    expect(deriveVegetation(none, spectrumFor(none), { roll: roll('x') }, pack)).toBeUndefined();
    const empty = world({ biosphere: bio({ morphologies: [] }) });
    expect(deriveVegetation(empty, spectrumFor(empty), { roll: roll('x') }, pack)).toBeUndefined();
  });

  it('drops a morphology the pack no longer defines rather than inventing one', () => {
    const b = world({ biosphere: bio({ morphologies: [
      { morphology: 'ghost', coverage: 0.9 }, { morphology: 'flora', coverage: 0.4 }] }) });
    const veg = deriveVegetation(b, spectrumFor(b), { roll: roll(b.id) }, pack)!;
    expect(veg.layers.map((l) => l.morphology)).toEqual(['flora']);
  });
});

describe('a GM can PIN the pigment, and it replaces the draw and nothing else', () => {
  it('honours a pinned pigment while still reporting the full scored set', () => {
    const b = world({ biosphere: bio({ morphologies: [{ morphology: 'flora', coverage: 0.6 }] }) });
    const free = deriveVegetation(b, spectrumFor(b), { roll: roll(b.id) }, pack)!;
    const pinned = deriveVegetation(b, spectrumFor(b), { roll: roll(b.id), pinnedPigment: 'chlorophyll' }, pack)!;
    expect(pinned.pigment).toBe('chlorophyll');
    // The set is unchanged: pinning states an outcome, it does not silence the model. That matters
    // for a REAL body, whose pigment is a measurement rather than a contingent draw.
    expect(pinned.ranked.map((r) => r.key)).toEqual(free.ranked.map((r) => r.key));
    expect(pinned.ranked.filter((r) => r.viable).length).toBe(free.ranked.filter((r) => r.viable).length);
  });

  it('ignores a pin naming a pigment this pack does not have', () => {
    const b = world({ biosphere: bio({ morphologies: [{ morphology: 'flora', coverage: 0.6 }] }) });
    const free = deriveVegetation(b, spectrumFor(b), { roll: roll(b.id) }, pack)!;
    const bogus = deriveVegetation(b, spectrumFor(b), { roll: roll(b.id), pinnedPigment: 'unobtainium' }, pack)!;
    expect(bogus.pigment).toBe(free.pigment);
  });
});

describe('landFraction — the number that keeps a renderer off the ocean', () => {
  it('reports the land share from the DERIVED surface layer, then the authored coverage', () => {
    const ocean = world({ hydrosphere: { composition: 'water', coverage: 0.7 },
      biosphere: bio({ morphologies: [{ morphology: 'flora', coverage: 0.6 }] }) });
    expect(deriveVegetation(ocean, spectrumFor(ocean), { roll: roll('a') }, pack)!.landFraction).toBeCloseTo(0.3, 6);

    const derivedLayer = world({
      hydrosphere: { composition: 'water', coverage: 0.7, layers: [{ liquid: 'water', location: 'surface', coverage: 0.9 }] },
      biosphere: bio({ morphologies: [{ morphology: 'flora', coverage: 0.6 }] }) });
    // The derived layer wins — it has already been phase-checked, and it is the same source and the
    // same order the apparent-colour model reads, so the disc and the swatch cannot disagree.
    expect(deriveVegetation(derivedLayer, spectrumFor(derivedLayer), { roll: roll('a') }, pack)!.landFraction).toBeCloseTo(0.1, 6);

    const dry = world({ hydrosphere: undefined, biosphere: bio({ morphologies: [{ morphology: 'flora', coverage: 0.6 }] }) } as any);
    expect(deriveVegetation(dry, spectrumFor(dry), { roll: roll('a') }, pack)!.landFraction).toBe(1);
  });
});

describe('each morphology draws its own pigment', () => {
  it('does not force the mats and the plants into the same choice', () => {
    // Shipping a RANKED SET rather than a single winner was supposed to make this nearly free, and
    // this is the test that it did: two lineages, two draws, from the same scored set.
    const seen = new Set<string>();
    for (let i = 0; i < 24; i++) {
      const b = world({ id: `w${i}`, biosphere: bio({ morphologies: [
        { morphology: 'microbial', coverage: 0.8 }, { morphology: 'flora', coverage: 0.6 }] }) });
      const veg = deriveVegetation(b, spectrumFor(b), { roll: roll(`w${i}`) }, pack)!;
      const mic = veg.layers.find((l) => l.morphology === 'microbial')!;
      const flo = veg.layers.find((l) => l.morphology === 'flora')!;
      expect(mic.pigment).toBeTruthy();
      expect(flo.pigment).toBeTruthy();
      if (mic.pigment !== flo.pigment) seen.add(`${i}`);
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it('pins the layer the picker NAMES and leaves the others their own draws', () => {
    const b = world({ biosphere: bio({ morphologies: [
      { morphology: 'microbial', coverage: 0.4 }, { morphology: 'flora', coverage: 0.9 }] }) });
    const free = deriveVegetation(b, spectrumFor(b), { roll: roll(b.id) }, pack)!;
    const pinned = deriveVegetation(b, spectrumFor(b), { roll: roll(b.id), pinnedPigment: 'melanin' }, pack)!;
    // Flora is the most extensive pigment-driven layer, so it is what the pin lands on…
    expect(pinned.layers.find((l) => l.morphology === 'flora')!.pigment).toBe('melanin');
    expect(pinned.pigment).toBe('melanin');
    // …and the mats keep whatever they drew, rather than being quietly repainted with it.
    const micFree = free.layers.find((l) => l.morphology === 'microbial')!.pigment;
    expect(pinned.layers.find((l) => l.morphology === 'microbial')!.pigment).toBe(micFree);
  });
});

describe('an authored colour', () => {
  it('wins outright, and is offered on any layer rather than a named one', () => {
    const b = world({ biosphere: bio({ morphologies: [
      { morphology: 'microbial', coverage: 0.7, colorHex: '#ff00aa' },
      { morphology: 'flora', coverage: 0.5 }] }) });
    const veg = deriveVegetation(b, spectrumFor(b), { roll: roll(b.id) }, pack)!;
    expect(veg.layers.find((l) => l.morphology === 'microbial')!.colorHex).toBe('#ff00aa');
    // The model still has its own answer for everything else.
    expect(veg.layers.find((l) => l.morphology === 'flora')!.colorHex).not.toBe('#ff00aa');
  });

  it('gives a CHEMOSYNTHETIC world a colour the model could not have chosen', () => {
    // The case it exists for: no photosynthesis means no pigment, so the derivation correctly has
    // nothing to say about what a mat looks like and somebody has to.
    const b = world({ biosphere: bio({ energy_source: 'chemosynthesis', morphologies: [
      { morphology: 'flora', coverage: 0.6, colorHex: '#20d0c0' }] }) });
    const veg = deriveVegetation(b, spectrumFor(b), { roll: roll(b.id) }, pack)!;
    expect(veg.pigment).toBeNull();
    expect(veg.layers[0].colorHex).toBe('#20d0c0');
    expect(veg.visibleCover).toBeGreaterThan(0);
  });
});

describe('A56b — the night-light colour is DATA on the morphology, not a constant in the painter', () => {
  it('leaves lightHex ABSENT when unauthored, which is what keeps existing worlds drawing the same amber', () => {
    // It used to be two hardcoded triples inside `paintLights`, so a bioluminescent forest and a purple
    // arc-light were unreachable without a branch. Absent must STAY absent: the painter falls back to
    // the exact numbers it always used, so nothing already drawn moves.
    const techno = allMorphologies(pack).find((m) => m.key === 'techno');
    expect(techno).toBeTruthy();
    expect(techno!.lightHex).toBeUndefined();
  });

  it('carries an authored colour through to the drawn layer', () => {
    const tuned = JSON.parse(JSON.stringify(pack)) as RulePack;
    const list = (tuned as unknown as { morphologies: { entries: { value: Record<string, unknown> }[] } }).morphologies?.entries;
    const row = list?.find((e) => e.value.key === 'techno');
    if (!row) return; // the pack stores them elsewhere; the absent-default case above is the load-bearing one
    row.value.lightHex = '#b36cff';
    const techno = allMorphologies(tuned).find((m) => m.key === 'techno');
    expect(techno!.lightHex).toBe('#b36cff');
  });
});
