// WHAT THE GENERATOR'S CONTACT BINARIES COST THE REST OF THE SYSTEM ([[G90]] job 4).
//
// The owner asked for authoring first and generation "modestly", and the brief asked for the before
// and after to be MEASURED rather than asserted. So this generates the same systems with the draw on
// and with it off and diffs them body by body. The answer it prints is the record.
//
// The claim it is defending is stronger than "not much moved": NOTHING moved. `drawLobes` takes its
// number from a stream keyed on the body's own id, so it consumes nothing from the system's shared
// RNG and every other draw lands exactly where it always did. Taking one number from the shared
// stream instead would have re-rolled every body after it in every system anyone has ever seeded -
// a generator changed for everyone, to add a fact that touches almost nothing.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { generateSystemFromConfig } from './generateFromConfig';
import { drawLobes } from './generateBodyOfType';
import type { RulePack, CelestialBody, System } from '$lib/types';
import { SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '$lib/constants';
import type { StarSeed } from '$lib/physics/stellar-evolution';

function isObject(x: any) { return x && typeof x === 'object' && !Array.isArray(x); }
function deepMerge(t: any, s: any): any {
  const o = { ...t };
  if (isObject(t) && isObject(s)) Object.keys(s).forEach((k) => { o[k] = isObject(s[k]) && k in t ? deepMerge(t[k], s[k]) : s[k]; });
  return o;
}
function loadPack(): RulePack {
  const base = path.resolve('static/rulepacks/starter-sf');
  let pack = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8')) as RulePack;
  for (const f of ['stars.json', 'planets.json', 'generation.json', 'orbital_constants.json',
    'classification.json', 'atmospheres.json', 'liquids.json']) {
    const p = path.join(base, f);
    if (fs.existsSync(p)) pack = deepMerge(pack, JSON.parse(fs.readFileSync(p, 'utf-8')));
  }
  return pack;
}
const PACK = loadPack();
function packWithout(): RulePack {
  const p = JSON.parse(JSON.stringify(PACK)) as RulePack;
  (p.generation_parameters as any).contact_binary.chance = 0;
  return p;
}

const SEEDS = Array.from({ length: 40 }, (_, i) => `measure-${i}`);
const sun = (): StarSeed => ({ id: 's', temperatureK: 5778, luminositySolar: 1, massKg: SOLAR_MASS_KG,
  radiusKm: SOLAR_RADIUS_KM, spectralClass: 'G', category: 'Main Sequence', luminosityClass: 'V',
  isRemnant: false, pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } });
function generate(seed: string, pack: RulePack): System {
  return generateSystemFromConfig(seed, pack, { seeds: [sun()], ageGyr: 4.6 });
}
/**
 * Everything about a body except the new fact, so a diff names what actually changed.
 *
 * `orbit.t0` is stamped with `Date.now()` when a body is made, so two generations from one seed are
 * never literally identical and comparing raw objects reports every body as different. That is the
 * generator's own behaviour, not this change's; it is excluded here rather than worked around.
 */
const CB = 'asteroid/contact-binary';
function fingerprintOf(n: any): string {
  const { lobes, orbit, classes, classification, ...rest } = n;
  const o = orbit ? { ...orbit, t0: undefined } : orbit;
  // THE THREE INTENDED CHANGES, and nothing else may move: the fact, the class the classifier
  // derives from it, and that class's entry in the stored "why this type" explanation. Each is
  // stripped SURGICALLY rather than by dropping the whole field, so the base type and the rest of
  // the explanation are still compared.
  const cf = classification
    ? { ...classification, modifiers: (classification.modifiers ?? []).filter((m: any) => m?.class !== CB) }
    : classification;
  return JSON.stringify({
    ...rest, orbit: o, classification: cf,
    classes: (classes ?? []).filter((c: string) => c !== CB)
  });
}

describe('the contact-binary draw changes nothing else about a generated system', () => {
  it('produces byte-identical systems apart from the lobe counts, over forty seeds', () => {
    const diffs: string[] = [];
    let bodies = 0, lobed = 0;
    for (const seed of SEEDS) {
      const withDraw = generate(seed, PACK);
      const without = generate(seed, packWithout());
      if (withDraw.nodes.length !== without.nodes.length) {
        diffs.push(`${seed}: node count ${without.nodes.length} -> ${withDraw.nodes.length}`);
        continue;
      }
      for (let i = 0; i < withDraw.nodes.length; i++) {
        const a = withDraw.nodes[i] as CelestialBody, b = without.nodes[i] as CelestialBody;
        bodies++;
        if (a.lobes) lobed++;
        if ((b as any).lobes !== undefined) diffs.push(`${seed}/${b.id}: lobes present with the draw OFF`);
        if (fingerprintOf(a) !== fingerprintOf(b)) diffs.push(`${seed}/${a.id}: differs beyond the lobe count`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[G90 job 4] ${SEEDS.length} systems, ${bodies} nodes: ${lobed} carry a lobe count, ` +
      `${diffs.length} other differences.`);
    expect(diffs.slice(0, 10)).toEqual([]);
  });

  // WHAT SYSTEMS ACTUALLY CONTAIN, before and after. The interesting number here is small on
  // purpose: this generator places planets, moons and belts, and never a free-flying asteroid, so
  // the only bodies inside the type's mass window are captured small moons.
  it('reports the population it reaches, and leaves every class count alone', () => {
    const count = (pack: RulePack) => {
      const classes = new Map<string, number>();
      let nodes = 0, small = 0, lobed = 0;
      for (const seed of SEEDS) {
        for (const n of generate(seed, pack).nodes as CelestialBody[]) {
          nodes++;
          for (const c of n.classes ?? []) classes.set(c, (classes.get(c) ?? 0) + 1);
          if ((n.massKg ?? 0) > 0 && (n.massKg ?? 0) / 5.972e24 <= 0.0001) small++;
          if (n.lobes) lobed++;
        }
      }
      return { classes, nodes, small, lobed };
    };
    const after = count(PACK), before = count(packWithout());

    // eslint-disable-next-line no-console
    console.log(`[G90 job 4] before: ${before.nodes} nodes, ${before.small} inside the small-body ` +
      `mass window, ${before.lobed} lobed. after: ${after.nodes} nodes, ${after.small} small, ` +
      `${after.lobed} lobed (${after.small ? ((after.lobed / after.small) * 100).toFixed(0) : '0'}% of the eligible population).`);

    expect(after.nodes).toBe(before.nodes);
    // EXACTLY ONE class count moves, and it is the one being added. Every other type appears the
    // same number of times, which is what "does not distort what systems normally contain" means
    // when it is measured rather than asserted.
    expect(before.classes.get(CB) ?? 0).toBe(0);
    expect(after.classes.get(CB) ?? 0).toBe(after.lobed);
    for (const [cls, n] of before.classes) if (cls !== CB) expect(after.classes.get(cls) ?? 0, cls).toBe(n);
    for (const [cls, n] of after.classes) if (cls !== CB) expect(before.classes.get(cls) ?? 0, cls).toBe(n);
    // ...and the population it reaches is a small share of a small population.
    expect(after.lobed).toBeGreaterThan(0);
    expect(after.lobed / after.nodes).toBeLessThan(0.05);
  });
});

describe('the draw reads the type, not a name', () => {
  const small = { id: 'x', massKg: 4.6e16, radiusKm: 18 };

  it('is deterministic for a given id and off entirely at chance 0', () => {
    expect(drawLobes(small, PACK)).toBe(drawLobes(small, PACK));
    expect(drawLobes(small, packWithout())).toBeUndefined();
  });

  it('reaches roughly the declared fraction, and is almost always exactly two lobes', () => {
    const counts = new Map<number, number>();
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const k = drawLobes({ ...small, id: `body-${i}` }, PACK);
      if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const hits = [...counts.values()].reduce((a, b) => a + b, 0);
    const declared = (PACK.generation_parameters as any).contact_binary.chance as number;
    expect(hits / n).toBeGreaterThan(declared * 0.85);
    expect(hits / n).toBeLessThan(declared * 1.15);
    // Every contact binary anyone has photographed has exactly two lobes; three is the curiosity.
    expect((counts.get(2) ?? 0) / hits).toBeGreaterThan(0.85);
    expect((counts.get(3) ?? 0) / hits).toBeLessThan(0.15);
    expect([...counts.keys()].filter((k) => k > 3)).toEqual([]);
  });

  it('never touches a body outside the type\'s own mass window', () => {
    for (let i = 0; i < 500; i++) {
      expect(drawLobes({ id: `earth-${i}`, massKg: 5.972e24, radiusKm: 6371 }, PACK)).toBeUndefined();
      expect(drawLobes({ id: `dwarf-${i}`, massKg: 1.3e22, radiusKm: 1188 }, PACK)).toBeUndefined();
    }
  });

  // The type is found by the FEATURE it bands on, so a pack that renames the class keeps its
  // generation and a pack with no lobed type at all gets none.
  it('finds the type by its band and declines when there is none', () => {
    const renamed = JSON.parse(JSON.stringify(PACK)) as RulePack;
    const fp = renamed.classifier!.fingerprints!.find((f) => 'lobes' in (f.match ?? {}))!;
    fp.class = 'asteroid/some-other-name';
    expect(drawLobes(small, renamed)).toBe(drawLobes(small, PACK));

    const none = JSON.parse(JSON.stringify(PACK)) as RulePack;
    none.classifier!.fingerprints = none.classifier!.fingerprints!.filter((f) => !('lobes' in (f.match ?? {})));
    expect(drawLobes(small, none)).toBeUndefined();
  });

  // A pack that bands its lobed type on something this function cannot evaluate before the
  // processor has run gets NO generation rather than a body drawn lobed and then classified as
  // something else.
  it('declines rather than guessing at a band it cannot check', () => {
    const exotic = JSON.parse(JSON.stringify(PACK)) as RulePack;
    const fp = exotic.classifier!.fingerprints!.find((f) => 'lobes' in (f.match ?? {}))!;
    (fp.match as Record<string, unknown>)['porosity'] = [0.2, 1];
    expect(drawLobes(small, exotic)).toBeUndefined();
  });
});
