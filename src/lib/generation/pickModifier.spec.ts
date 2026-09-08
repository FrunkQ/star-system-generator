// RUBBLE PILES AND CONTACT BINARIES IN THE PICK LIST (owner, 2026-09-08: *"We really SHOULD have
// rubble piles and binaries in the pick list alongside other asteroids - why not?"*).
//
// There was no reason, and the interesting half of this is what "picking a modifier" has to MEAN.
// A modifier is a property, not an identity: `asteroid/rubble-pile` says how much void a body has
// and nothing about what the rock is made of. So a pick has to (1) build on a base drawn from the
// pack, (2) leave the class list EMPTY so the classifier names the result from the composition
// actually drawn, and (3) actually satisfy the modifier's bands - which for a rubble pile means
// producing a body whose DERIVED porosity lands in band, not setting a field.
//
// The third is the one with physics in it. `maxPorosity` is a real ceiling - self-gravity crushes
// voids out, completely by about Ceres - so the mass has to come down to meet the porosity asked
// for, or the body would carry a stated void fraction the engine then refuses.
//
// SEEN RED: with the mass cap removed, the rubble pile classifies without its modifier on most
// draws; with `stackOn` ignored, it comes out with no composition and no base.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { judgeTypesAt, basesFor, canBuildTo, generateBodyOfType, ALL_GATES } from './generateBodyOfType';
import { systemProcessor } from '../core/SystemProcessor';
import { derivedPorosity, maxPorosity, maxMassForPorosity } from '$lib/physics/makeup';
import { EARTH_MASS_KG } from '$lib/constants';
import type { RulePack, Fingerprint, CelestialBody, System } from '$lib/types';

function isObject(x: any) { return x && typeof x === 'object' && !Array.isArray(x); }
function deepMerge(t: any, s: any): any {
  const o = { ...t };
  if (isObject(t) && isObject(s)) Object.keys(s).forEach((k) => { o[k] = isObject(s[k]) && k in t ? deepMerge(t[k], s[k]) : s[k]; });
  return o;
}
function loadPack(): RulePack {
  const base = path.resolve('static/rulepacks/starter-sf');
  let pack = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8')) as RulePack;
  for (const f of ['stars.json', 'planets.json', 'generation.json', 'classification.json', 'atmospheres.json', 'liquids.json']) {
    const p = path.join(base, f);
    if (fs.existsSync(p)) pack = deepMerge(pack, JSON.parse(fs.readFileSync(p, 'utf-8')));
  }
  return pack;
}
const PACK = loadPack();
const FPS = (PACK.classifier?.fingerprints ?? []) as Fingerprint[];
const byClass = (c: string) => FPS.find((f) => f.class === c)!;

/** The picker's own call: a moon slot at a cold orbit, every gate on, modifiers included. */
const offered = (includeModifiers: boolean) =>
  judgeTypesAt({ role: 'moon', teqK: 120, hostMassKg: 1.9e27, ageGyr: 4.6 }, FPS, ALL_GATES, undefined, includeModifiers)
    .filter((v) => v.ok).map((v) => v.fp);

describe('the picker offers them and the generator does not', () => {
  it('a modifier is offered to the picker', () => {
    const classes = offered(true).map((f) => f.class);
    expect(classes).toContain('asteroid/rubble-pile');
    expect(classes).toContain('asteroid/contact-binary');
  });

  // THE GENERATOR MUST NOT CHANGE. A modifier is not an identity, and letting one into the draw
  // would have shifted every seed anyone has ever generated.
  it('...and to nothing else, so the draw is untouched', () => {
    expect(offered(false).filter((f) => f.kind === 'modifier')).toEqual([]);
    // the same bases, in the same order, either way
    expect(offered(true).filter((f) => f.kind === 'base').map((f) => f.class))
      .toEqual(offered(false).map((f) => f.class));
  });

  it('a modifier can only be built on a base whose mass window it shares', () => {
    const bases = offered(false);
    const rubble = byClass('asteroid/rubble-pile');
    const mb = rubble.match['mass_Me'] as [number, number];
    const forRubble = basesFor(rubble, bases);
    expect(forRubble.length).toBeGreaterThan(0);
    // The test is the OVERLAP, not the namespace — `planet/planetesimal` is a legitimate answer
    // (Phobos classifies as one) and a rubble-pile planetesimal is a real object.
    for (const f of forRubble) {
      const bb = f.match['mass_Me'] as [number, number];
      expect(Array.isArray(bb), `${f.class} has no mass window and must not be offered`).toBe(true);
      expect(bb[0] <= mb[1] && mb[0] <= bb[1], `${f.class} does not overlap`).toBe(true);
    }
    // A planet-mass base is not on the list, and neither is a type that declares no mass at all.
    const classes = forRubble.map((f) => f.class);
    expect(classes).not.toContain('planet/terrestrial');
    expect(classes).not.toContain('planet/ecumenopolis');
  });
});

describe('picking a modifier builds a body that really is one', () => {
  const bases = offered(false).filter((f) => f.class.startsWith('asteroid/'));

  function built(modifier: string, seed: number) {
    let n = seed;
    const rng = () => { n = (n * 1103515245 + 12345) & 0x7fffffff; return n / 0x7fffffff; };
    const base = bases[seed % bases.length];
    return generateBodyOfType(byClass(modifier), {
      distAU: 5, hostMassKg: 1.9e27, role: 'moon', rng, teqK: 120, stackOn: base
    });
  }

  it('a rubble pile comes out porous — the DERIVED figure, in band', () => {
    for (let s = 1; s <= 25; s++) {
      const b = built('asteroid/rubble-pile', s) as CelestialBody;
      const p = derivedPorosity(b);
      expect(p, `seed ${s}: porosity ${p.toFixed(3)}`).toBeGreaterThanOrEqual(0.2);
      // ...and never more than the physics allows at that mass, which is what the mass cap is for.
      expect(p, `seed ${s}`).toBeLessThanOrEqual(maxPorosity((b.massKg ?? 0) / EARTH_MASS_KG) + 1e-9);
    }
  });

  it('a contact binary comes out with lobes', () => {
    for (let s = 1; s <= 25; s++) {
      expect((built('asteroid/contact-binary', s) as CelestialBody).lobes, `seed ${s}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('leaves the class list empty so the classifier names it', () => {
    expect(built('asteroid/rubble-pile', 3).classes).toEqual([]);
    // A BASE pick is unchanged: it still pins the type the GM chose.
    expect(generateBodyOfType(byClass('asteroid/c-type'), { distAU: 5, hostMassKg: 1.9e27, role: 'moon', teqK: 120 }).classes)
      .toEqual(['asteroid/c-type']);
  });

  it('gets a composition from the base, so it has something to BE', () => {
    for (let s = 1; s <= 10; s++) {
      const b = built('asteroid/rubble-pile', s) as CelestialBody;
      expect(Object.values(b.makeup ?? {}).reduce((a, v) => a + (v ?? 0), 0), `seed ${s}`).toBeGreaterThan(0);
    }
  });

  // THE WHOLE POINT, END TO END: through the real processor, the picked body comes back with a
  // composition base AND the modifier the GM asked for.
  it('classifies as a real type with the modifier stacked on it', () => {
    const seen = new Set<string>();
    for (let s = 1; s <= 20; s++) {
      const gen = built('asteroid/rubble-pile', s);
      const sys = {
        id: 'p', name: 'p', seed: 'p', epochT0: 0, age_Gyr: 4.6,
        nodes: [
          { id: 'star', name: 'S', kind: 'body', parentId: null, roleHint: 'star', massKg: 1.989e30,
            radiusKm: 696340, temperatureK: 5778, radiationOutput: 1, classes: ['star/G'],
            axial_tilt_deg: 0, rotation_period_hours: 600 },
          { id: 'rock', name: 'R', kind: 'body', parentId: 'star', roleHint: 'planet', tags: [],
            axial_tilt_deg: 0, rotation_period_hours: 11, ...gen,
            orbit: { hostId: 'star', elements: { a_AU: 5, e: 0.03, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } }
        ]
      } as unknown as System;
      const out = systemProcessor.process(JSON.parse(JSON.stringify(sys)), PACK);
      const classes = (out.nodes.find((n) => n.id === 'rock') as CelestialBody).classes ?? [];
      expect(classes, `seed ${s}: ${classes.join(', ')}`).toContain('asteroid/rubble-pile');
      expect(classes.filter((c) => c !== 'asteroid/rubble-pile'), `seed ${s}`).not.toEqual([]);
      classes.filter((c) => c !== 'asteroid/rubble-pile').forEach((c) => seen.add(c));
    }
    // Drawing the base from the pack rather than fixing one means the bases VARY - "rubble pile"
    // gives a carbonaceous, stony, metallic or icy one, not the same rock twenty times.
    expect(seen.size, `bases seen: ${[...seen].join(', ')}`).toBeGreaterThan(1);
  });
});

// THE FILTER HAS TO BE HONEST, and a list of feature names kept in step with a function by hand is
// exactly the thing that drifts. So this does not check the list: it takes EVERY modifier the picker
// would offer, builds one, runs it through the real processor, and requires the class to come back.
// A feature added to `BUILDABLE_FEATURES` without the code to build it fails here; so does a
// modifier the pack gains that the builder cannot satisfy.
describe('every modifier the picker offers can actually be built', () => {
  const slots: Array<{ role: 'planet' | 'moon'; teqK: number; hostMassKg: number; aAU: number }> = [
    { role: 'moon', teqK: 120, hostMassKg: 1.9e27, aAU: 5 },
    { role: 'moon', teqK: 280, hostMassKg: 5.97e24, aAU: 1 }
  ];

  for (const slot of slots) {
    it(`${slot.role} at ${slot.teqK} K`, () => {
      const all = judgeTypesAt({ role: slot.role, teqK: slot.teqK, hostMassKg: slot.hostMassKg, ageGyr: 4.6 },
        FPS, ALL_GATES, undefined, true).filter((v) => v.ok).map((v) => v.fp);
      const bases = all.filter((f) => f.kind === 'base');
      const offeredMods = all.filter((f) => f.kind === 'modifier' && canBuildTo(f) && basesFor(f, bases).length > 0);
      expect(offeredMods.length, 'nothing offered at all — the filter has closed up').toBeGreaterThan(0);

      for (const mod of offeredMods) {
        const options = basesFor(mod, bases);
        const misses: string[] = [];
        for (let s = 1; s <= options.length * 3; s++) {
          let n = s * 7919;
          const rng = () => { n = (n * 1103515245 + 12345) & 0x7fffffff; return n / 0x7fffffff; };
          const gen = generateBodyOfType(mod, {
            distAU: slot.aAU, hostMassKg: slot.hostMassKg, role: slot.role, rng, teqK: slot.teqK,
            stackOn: options[s % options.length]
          });
          const sys = {
            id: 'r', name: 'r', seed: 'r', epochT0: 0, age_Gyr: 4.6,
            nodes: [
              { id: 'star', name: 'S', kind: 'body', parentId: null, roleHint: 'star', massKg: 1.989e30,
                radiusKm: 696340, temperatureK: 5778, radiationOutput: 1, classes: ['star/G'],
                axial_tilt_deg: 0, rotation_period_hours: 600 },
              { id: 'rock', name: 'R', kind: 'body', parentId: 'star', roleHint: 'planet', tags: [],
                axial_tilt_deg: 0, rotation_period_hours: 9, ...gen,
                orbit: { hostId: 'star', elements: { a_AU: slot.aAU, e: 0.02, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } }
            ]
          } as unknown as System;
          const out = systemProcessor.process(JSON.parse(JSON.stringify(sys)), PACK);
          const classes = (out.nodes.find((x) => x.id === 'rock') as CelestialBody).classes ?? [];
          if (!classes.includes(mod.class)) misses.push(`${options[s % options.length].class} -> ${classes.join(', ') || '(none)'}`);
        }
        // Every draw, not most: a card that only sometimes gives you what it says is still a card
        // that lies, and the GM has no way to tell which time it was.
        expect(misses, `${mod.class} did not come back on ${misses.length} draws:\n  ${misses.slice(0, 5).join('\n  ')}`)
          .toEqual([]);
      }
    });
  }
});

describe('the porosity ceiling is read in one place', () => {
  it('inverts exactly', () => {
    for (const p of [0.05, 0.2, 0.3, 0.45, 0.6]) {
      expect(maxPorosity(maxMassForPorosity(p))).toBeCloseTo(p, 10);
    }
    expect(maxMassForPorosity(0)).toBe(Infinity);
  });
});
