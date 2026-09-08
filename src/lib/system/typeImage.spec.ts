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
import { imageClassFor } from './classification';
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
