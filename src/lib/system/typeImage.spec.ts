// A BODY'S PHOTO ANSWERS TO ITS MODIFIERS, LIKE ITS OTHER TWO VIEWS DO.
//
// Owner, 2026-09-08: *"why are these different - everything has a 2d 3d and photo view, dont they?"*
// They do. The 2D disc and the 3D mesh have always read a body's modifiers - a toroid is drawn as a
// torus, an ellipsoid squashed, a contact binary two-lobed - while the photo was looked up on
// `classes[0]`, which a modifier can never be.
//
// THE COST OF THAT WAS FIVE DEAD FILES. `starter-sf` ships images for `planet/ringed`,
// `planet/toroidal`, `planet/ellipsoid`, `planet/disrupted` and `planet/ultra-short-period`, and not
// one had ever been shown: a ringed giant classified `planet/water-clouds-gas-giant, planet/ringed`
// and displayed the water-clouds picture. This is the gate that keeps them reachable.
//
// SEEN RED against the old expression (`body.classes?.[0]`): the ringed-giant test fails, showing the
// water-clouds picture. The `imageClassFor` block below stays green under that revert because it
// tests the chooser directly rather than the wiring - which is the point of having both.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { imageClassFor, imageVariantFor } from './classification';
import { systemProcessor } from '../core/SystemProcessor';
import type { RulePack, Fingerprint, System, CelestialBody } from '$lib/types';

function isObject(x: any) { return x && typeof x === 'object' && !Array.isArray(x); }
function deepMerge(t: any, s: any): any {
  const o = { ...t };
  if (isObject(t) && isObject(s)) Object.keys(s).forEach((k) => { o[k] = isObject(s[k]) && k in t ? deepMerge(t[k], s[k]) : s[k]; });
  return o;
}
function loadPack(): RulePack {
  const base = path.resolve('static/rulepacks/starter-sf');
  let pack = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8')) as RulePack;
  for (const f of ['stars.json', 'planets.json', 'generation.json', 'classification.json', 'atmospheres.json']) {
    const p = path.join(base, f);
    if (fs.existsSync(p)) pack = deepMerge(pack, JSON.parse(fs.readFileSync(p, 'utf-8')));
  }
  return pack;
}
const PACK = loadPack();
const FPS = (PACK.classifier?.fingerprints ?? []) as Fingerprint[];
const IMAGES = ((PACK.classifier as any)?.planetImages ?? {}) as Record<string, string>;

/** Build a body, process it, and report the picture it ends up with. */
function imageOf(extra: Record<string, unknown>, withRing = false): { classes: string; image: string } {
  const nodes: any[] = [
    { id: 'star', name: 'S', kind: 'body', parentId: null, roleHint: 'star', massKg: 1.989e30, radiusKm: 696340,
      temperatureK: 5778, radiationOutput: 1, classes: ['star/G'], axial_tilt_deg: 0, rotation_period_hours: 600 },
    { id: 'p', name: 'P', kind: 'body', parentId: 'star', roleHint: 'planet', tags: [], autoClassify: true, classes: [],
      axial_tilt_deg: 0, rotation_period_hours: 15,
      orbit: { hostId: 'star', elements: { a_AU: 1.2, e: 0.01, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }, ...extra }
  ];
  if (withRing) nodes.push({ id: 'r', name: 'R', kind: 'body', parentId: 'p', roleHint: 'ring', tags: [], classes: [],
    radiusInnerKm: 80000, radiusOuterKm: 140000, massKg: 1e19,
    orbit: { hostId: 'p', elements: { a_AU: 0.001, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } });
  const out = systemProcessor.process(
    JSON.parse(JSON.stringify({ id: 'i', name: 'i', seed: 'i', epochT0: 0, age_Gyr: 4.6, nodes })) as System, PACK);
  const b = out.nodes.find((n) => n.id === 'p') as CelestialBody;
  return { classes: (b.classes ?? []).join(', '), image: (b.image as any)?.url ?? '(none)' };
}

describe('the picture follows the modifiers, not just the base', () => {
  it('a ringed giant shows the RINGED picture, which had never been reachable', () => {
    const got = imageOf({ massKg: 1.8e27, radiusKm: 69911, makeup: { gas: 0.9, ice: 0.1 } }, true);
    expect(got.classes, got.classes).toContain('planet/ringed');
    expect(got.image).toBe(IMAGES['planet/ringed']);
  });

  // Every modifier the pack gives a picture to must be able to reach it, or the file is dead weight
  // that a reader will assume they have seen.
  it('every modifier that ships an image can reach it', () => {
    const withImages = FPS.filter((f) => f.kind === 'modifier' && IMAGES[f.class]);
    expect(withImages.length, 'no modifier ships an image — has the pack changed?').toBeGreaterThan(0);
    for (const fp of withImages) {
      const chosen = imageClassFor(['planet/terrestrial', fp.class], FPS, IMAGES);
      expect(chosen, `${fp.class} cannot reach its own picture`).toBe(fp.class);
    }
  });

  it('a modifier with NO image falls through to the base, as rubble-pile always has', () => {
    const got = imageOf({ massKg: 3.51e10, radiusKm: 0.165, makeup: { rock: 0.9, metal: 0.1 } });
    expect(got.classes, got.classes).toContain('asteroid/rubble-pile');
    expect(got.image).toBe(IMAGES['asteroid/s-type']);
  });

  it('a body with no modifiers is unchanged', () => {
    const got = imageOf({ massKg: 5.972e24, radiusKm: 6371, makeup: { metal: 0.32, rock: 0.68 } });
    expect(got.classes.split(', ').length, got.classes).toBeGreaterThan(0);
    expect(got.image).toBe(IMAGES[got.classes.split(', ')[0]]);
  });
});

describe('imageClassFor, on its own', () => {
  it('takes the base when nothing else applies', () => {
    expect(imageClassFor(['planet/terrestrial'], FPS, IMAGES)).toBe('planet/terrestrial');
    expect(imageClassFor([], FPS, IMAGES)).toBeUndefined();
    expect(imageClassFor(undefined, FPS, IMAGES)).toBeUndefined();
  });

  it('never promotes a BASE that happens to come later', () => {
    // Two bases cannot both be assigned, but a hand-authored class list can say anything, and a
    // second base must not be read as a modifier.
    expect(imageClassFor(['planet/terrestrial', 'planet/ocean'], FPS, IMAGES)).toBe('planet/terrestrial');
  });

  it('takes the FIRST modifier that has one — the classifier orders those by score', () => {
    expect(imageClassFor(['planet/terrestrial', 'asteroid/rubble-pile', 'planet/ringed'], FPS, IMAGES))
      .toBe('planet/ringed');
  });

  it('degrades to the base when the pack has no images at all', () => {
    expect(imageClassFor(['planet/terrestrial', 'planet/ringed'], FPS, undefined)).toBe('planet/terrestrial');
    expect(imageClassFor(['planet/terrestrial', 'planet/ringed'], FPS, {})).toBe('planet/terrestrial');
  });
});

// "ALL SUPER-EARTHS, REGARDLESS OF WHETHER THEY HAVE AN ATMOSPHERE OR NOT, ARE SHOWN AS HAVING ONE IN
// THE ARTIST'S VIEW ... SUBSURFACE OCEANS THAT HAVE A THICK NEPTUNE-LIKE ATMOSPHERE SHOW AS BARREN"
// (Discord, 10-22, of the "standard picture").
//
// G95 above made the photo answer to a body's MODIFIERS. It did not touch this: a class has ONE
// picture, and that picture is drawn in a particular state. `planet/super-earth` is three bands -
// mass, radius, density - and says nothing about air, while its illustration is a world wrapped in
// cloud; `planet/subsurface-ocean` is "an ocean under ice, and cold", and its illustration is a
// bare cracked ice shell. So the picture claimed an atmosphere state the class never tested.
//
// The lever is pack DATA (`classifier.planetImageVariants`): under stated conditions a class
// borrows another class's existing picture. The class itself does not change.
describe('the picture follows the atmosphere the body actually has', () => {
  const VARIANTS = (PACK.classifier as any)?.planetImageVariants as Record<string, any[]> | undefined;
  // A rocky world of five Earth masses, authored as a super-earth so the test is about the PICTURE
  // and not about which class the scoring happens to prefer.
  const superEarth = (atmosphere?: Record<string, unknown>) => imageOf({
    massKg: 5 * 5.972e24, radiusKm: 1.5 * 6371, makeup: { metal: 0.3, rock: 0.7 },
    autoClassify: false, classes: ['planet/super-earth'], ...(atmosphere ? { atmosphere } : {})
  });
  const AIR = { name: 'Nitrogen-Oxygen', main: 'N2', pressure_bar: 1, composition: { N2: 0.78, O2: 0.21 } };

  it('an AIRLESS super-earth is not pictured under a deck of cloud', () => {
    const got = superEarth();
    expect(got.classes).toBe('planet/super-earth');           // the class is untouched
    // ABSOLUTE: it is not the stock super-earth picture, and it is the airless one.
    expect(got.image).not.toBe(IMAGES['planet/super-earth']);
    expect(got.image).toBe(IMAGES['planet/barren']);
  });

  it('a super-earth WITH air keeps the picture it always had', () => {
    expect(superEarth(AIR).image).toBe(IMAGES['planet/super-earth']);
  });

  it('a subsurface-ocean world under a deep atmosphere is not pictured as a bare ice shell', () => {
    const shell = (pressure_bar?: number) => imageOf({
      massKg: 1.5e23, radiusKm: 2600, makeup: { rock: 0.4, ice: 0.6 },
      autoClassify: false, classes: ['planet/subsurface-ocean'],
      orbit: { hostId: 'star', elements: { a_AU: 9, e: 0.01, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } },
      ...(pressure_bar ? { atmosphere: { name: 'Hydrogen-Helium', main: 'H2', pressure_bar, composition: { H2: 0.85, He: 0.15 } } } : {})
    });
    expect(shell().image).toBe(IMAGES['planet/subsurface-ocean']);       // Europa stays Europa
    const deep = shell(200);
    expect(deep.classes).toBe('planet/subsurface-ocean');
    expect(deep.image).not.toBe(IMAGES['planet/subsurface-ocean']);
    expect(deep.image).toBe(IMAGES['planet/sub-neptune']);
  });

  it('every variant in the pack points at a class that has a picture, and at a different one', () => {
    expect(Object.keys(VARIANTS ?? {}).length, 'the pack ships no image variants').toBeGreaterThan(0);
    for (const [cls, list] of Object.entries(VARIANTS ?? {})) {
      expect(IMAGES[cls], `${cls} has a picture of its own`).toBeTruthy();
      for (const v of list) {
        expect(IMAGES[v.use], `${cls} borrows ${v.use}, which has no picture`).toBeTruthy();
        expect(IMAGES[v.use]).not.toBe(IMAGES[cls]);
        expect(Object.keys(v.match ?? {}).length, `${cls} -> ${v.use} has no condition`).toBeGreaterThan(0);
      }
    }
  });
});

describe('imageVariantFor, on its own', () => {
  const images = { 'planet/a': '/a.jpg', 'planet/b': '/b.jpg' };
  const variants = { 'planet/a': [{ match: { 'atm.pressure_bar': [0, 0.01] as [number, number] }, use: 'planet/b' }] };

  it('borrows the other picture only INSIDE the band - no soft shoulder', () => {
    expect(imageVariantFor('planet/a', { 'atm.pressure_bar': 0 }, variants, images)).toBe('planet/b');
    expect(imageVariantFor('planet/a', { 'atm.pressure_bar': 0.01 }, variants, images)).toBe('planet/b');
    // 0.0105 is within `bandFit`'s 15% shoulder and would still SCORE; a picture is a yes or a no.
    expect(imageVariantFor('planet/a', { 'atm.pressure_bar': 0.0105 }, variants, images)).toBe('planet/a');
    expect(imageVariantFor('planet/a', { 'atm.pressure_bar': 1 }, variants, images)).toBe('planet/a');
  });

  it('is the class itself when the pack says nothing, or says something it cannot back with a file', () => {
    expect(imageVariantFor('planet/a', { 'atm.pressure_bar': 0 }, undefined, images)).toBe('planet/a');
    expect(imageVariantFor('planet/b', { 'atm.pressure_bar': 0 }, variants, images)).toBe('planet/b');
    const dangling = { 'planet/a': [{ match: { 'atm.pressure_bar': [0, 1] as [number, number] }, use: 'planet/missing' }] };
    expect(imageVariantFor('planet/a', { 'atm.pressure_bar': 0 }, dangling, images)).toBe('planet/a');
    // A variant with no condition would swap the picture for every body of the class: ignored.
    expect(imageVariantFor('planet/a', {}, { 'planet/a': [{ match: {}, use: 'planet/b' }] }, images)).toBe('planet/a');
  });
});
