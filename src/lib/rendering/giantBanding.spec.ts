// B95 - LOAD -> EDIT -> PROCESS, the sequence nothing in the suite pinned.
//
// `system/idempotence.test.ts` walks every key on every node and even compares pass 1 v 2 AND 2 v 3,
// because a quantity can oscillate with period 2. But it runs process(process(process(x))) with NO
// EDIT between passes, and the fault a user reported lives in load -> EDIT -> process: open a map,
// nudge one gas by the smallest step the editor allows, and a giant's whole banding changed.
//
// What is pinned here, and what is deliberately NOT:
//   PINNED  - the RENDERER contributes no cliff of its own. Band contrast must be a continuous,
//             monotone function of chromophore strength, and no chromophore must land exactly where
//             a smooth giant lands. That is the B95 fix (engine-map RENDER-S35).
//   PINNED  - an edit and its exact reversal return the body to the same tags and the same picture,
//             and reprocessing without an edit changes nothing.
//   PINNED  - the DECK STACK itself is stable across the range the reporter was editing in, and
//             where a deck genuinely does come and go - at the stoichiometric boundary, where the
//             hydrosulphide reaction has consumed all the ammonia - its coverage RAMPS.
//
// The first draft of this file pinned the opposite of that last line, as a characterisation test:
// "a newly-condensing deck arrives near-total, and that is physics we cannot smooth". It was not
// physics. It was an abundance floor (`cloud.minFraction`) deleting an optically thick deck, and
// the measurement that looked like evidence for a hard physical step was evidence for the floor.
// Kept in the comment because a wrong conclusion that survived one round of measurement is worth
// leaving a marker for.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemProcessor } from '../core/SystemProcessor';
import { fixUpImportedSystem } from '../system/importFixup';
import { decksFromTags, CLOUD_DECK_TAG } from '../physics/cloudDecks';
import { deriveApparentColorParts, CHROMOPHORE_MAX_WEIGHT } from './apparentColor';
import { giantBandRamp, chromoAlpha, stormChance } from './planetTexture';
import { deriveAppearance } from './planetAppearance';
import type { System, RulePack, CelestialBody } from '$lib/types';

function isObject(i: any) { return i && typeof i === 'object' && !Array.isArray(i); }
function deepMerge(t: any, s: any): any {
  const o = { ...t };
  if (isObject(t) && isObject(s)) for (const k of Object.keys(s)) {
    if (isObject(s[k])) { if (!(k in t)) Object.assign(o, { [k]: s[k] }); else o[k] = deepMerge(t[k], s[k]); }
    else Object.assign(o, { [k]: s[k] });
  }
  return o;
}
function loadPack(base: string): RulePack {
  let p = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8')) as RulePack;
  for (const f of ['construct_templates.json', 'engine-definitions.json', 'fuel-definitions.json',
                   'liquids.json', 'classification.json', 'atmospheres.json']) {
    const fp = path.join(base, f);
    if (fs.existsSync(fp)) p = deepMerge(p, JSON.parse(fs.readFileSync(fp, 'utf-8')));
  }
  return p;
}
const pack = loadPack(path.resolve('static/rulepacks/starter-sf'));
const fixture = () => JSON.parse(
  fs.readFileSync(path.resolve('tests/fixtures/b95-threshold-giant.json'), 'utf-8')) as System;

// THE LOAD, exactly as Starmap.svelte does it: fixUpImportedSystem then ONE process pass.
const load = () => systemProcessor.process(fixUpImportedSystem(fixture(), pack), pack);

// THE EDIT, exactly as BodyAtmosphereTab.updateGasFraction does it. This matters more than it looks:
// the editor works in PERCENT, and changing one gas REDISTRIBUTES the difference across every other
// gas and renormalises. Sweeping a raw fraction sweeps a different axis and misses the fault.
function editGasPercent(body: CelestialBody, gas: string, newPercentage: number) {
  const comp = body.atmosphere.composition as Record<string, number>;
  const newFraction = newPercentage / 100;
  const diff = newFraction - (comp[gas] || 0);
  comp[gas] = newFraction;
  const others = Object.keys(comp).filter((g) => g !== gas);
  const totalOthers = others.reduce((s, g) => s + (comp[g] || 0), 0);
  if (totalOthers > 0) for (const o of others) comp[o] = Math.max(0, comp[o] - diff * (comp[o] / totalOthers));
  const total = Object.values(comp).reduce((a, b) => a + b, 0);
  if (total > 0) for (const k of Object.keys(comp)) comp[k] = comp[k] / total;
}
const giantOf = (sys: System) => sys.nodes.find((n) => n.id === 'giant') as CelestialBody;
const deckTagValues = (b: CelestialBody) =>
  (b.tags ?? []).filter((t) => t.key === CLOUD_DECK_TAG).map((t) => t.value).sort();
const chromoWeights = (b: CelestialBody) =>
  deriveApparentColorParts(b, pack).palette.filter((p) => /band/.test(p.label ?? '')).map((p) => p.weight);

// THE PAINTER'S OWN RULE, imported rather than restated. An earlier draft of this file recomputed
// the ramp locally, which would have gone on passing if someone put the boolean back - the exact
// "two answers to one question" fault this codebase keeps finding. `giantBandRamp` is what both
// projections actually call, so pinning it pins the picture. The DRAWING needs a DOM canvas and is
// not under test here; the judgement is.
const bandRamp = (weights: number[]) =>
  giantBandRamp(weights.map((w) => ({ hex: '#bb8155', role: 'cloud', weight: w, rawHex: '#bb8155' })) as any);

describe('B95: a giant survives load -> edit -> process', () => {
  // The fixture's H2S is 0.008 %, and NH4SH consumes NH3 and H2S one for one, so below about that
  // much ammonia there is none left over to condense on its own. THAT is the real boundary, and it
  // is a chemical one rather than a threshold anybody chose.
  it('the fixture really does sit on a deck boundary (or it pins nothing)', () => {
    const below = load(); editGasPercent(giantOf(below), 'NH3', 0.0070);
    const above = load(); editGasPercent(giantOf(above), 'NH3', 0.0090);
    const b = decksFromTags(giantOf(systemProcessor.process(below, pack)).tags, pack);
    const a = decksFromTags(giantOf(systemProcessor.process(above, pack)).tags, pack);
    expect(b.length, 'fixture no longer straddles a boundary - retune it or this suite is vacuous')
      .not.toBe(a.length);
  });

  // THE REPORTED FAULT, as its own regression. He was editing around NH3 0.019 % and a 0.001-point
  // step took his Jupiter from banded to featureless. Nothing may move across this range.
  it('the deck stack and the banding are FLAT across the range the fault was reported in', () => {
    const strengths: number[] = [];
    const stacks = new Set<string>();
    for (const pct of [0.016, 0.017, 0.018, 0.0181, 0.019, 0.020, 0.022, 0.025]) {
      const sys = load();
      editGasPercent(giantOf(sys), 'NH3', pct);
      const b = giantOf(systemProcessor.process(sys, pack));
      stacks.add(decksFromTags(b.tags, pack).map((d) => d.species).sort().join('+'));
      strengths.push(bandRamp(chromoWeights(b)).strength);
    }
    expect([...stacks], 'the deck stack changed across the range the fault was reported in')
      .toHaveLength(1);
    // Not "identical" - the banding drifts very slightly as the ammonia deck thins with abundance,
    // and that gentle slide is correct. What must never come back is the SWING: before the fix this
    // same range went 0 to 0.92 in one 0.001-point step.
    const swing = Math.max(...strengths) - Math.min(...strengths);
    expect(swing, 'the banding swung across the reported range - the cliff is back').toBeLessThan(0.1);
    for (const s of strengths) expect(s, 'the banding dropped out somewhere in the range').toBeGreaterThan(0.5);
  });

  it('reprocessing without an edit changes nothing (the load is already converged)', () => {
    let sys = load();
    const first = deckTagValues(giantOf(sys));
    const firstHex = deriveApparentColorParts(giantOf(sys), pack).hex;
    for (let i = 0; i < 4; i++) {
      sys = systemProcessor.process(JSON.parse(JSON.stringify(sys)), pack);
      expect(deckTagValues(giantOf(sys))).toEqual(first);
      expect(deriveApparentColorParts(giantOf(sys), pack).hex).toBe(firstHex);
    }
  });

  it('an edit and its exact reversal come back to the same tags and the same picture', () => {
    const sys = load();
    const before = deckTagValues(giantOf(sys));
    const beforeHex = deriveApparentColorParts(giantOf(sys), pack).hex;
    const startPct = (giantOf(sys).atmosphere.composition as Record<string, number>).NH3 * 100;

    editGasPercent(giantOf(sys), 'NH3', 0.017);             // across the threshold
    const moved = systemProcessor.process(sys, pack);
    editGasPercent(giantOf(moved), 'NH3', startPct);        // and exactly back
    const back = systemProcessor.process(moved, pack);

    expect(deckTagValues(giantOf(back))).toEqual(before);
    expect(deriveApparentColorParts(giantOf(back), pack).hex).toBe(beforeHex);
  });

  it('every published band weight stays inside its declared range across the threshold', () => {
    for (const pct of [0.010, 0.015, 0.017, 0.018, 0.019, 0.020, 0.025, 0.050, 0.100, 0.500]) {
      const sys = load();
      editGasPercent(giantOf(sys), 'NH3', pct);
      for (const w of chromoWeights(giantOf(systemProcessor.process(sys, pack)))) {
        expect(w, 'NH3 ' + pct + ' pct published a band weight below zero').toBeGreaterThan(0);
        expect(w).toBeLessThanOrEqual(CHROMOPHORE_MAX_WEIGHT + 1e-9);
      }
    }
  });
});

// THE FIX ITSELF (engine-map RENDER-S35). This is what was binary: `chromo.length === 0` picked
// between 0.985/1.015 and 0.86/1.06, so ANY chromophore at all - however faint - painted a giant at
// full Jovian contrast, and losing it dropped the whole planet to featureless in one step.
describe('B95: band contrast ramps with chromophore strength, never switches', () => {
  it('no chromophore lands exactly on the smooth pair', () => {
    const r = bandRamp([]);
    expect(r.strength).toBe(0);
    expect(r.lo).toBeCloseTo(0.985, 12);
    expect(r.hi).toBeCloseTo(1.015, 12);
  });

  it('a full-strength chromophore lands exactly on the banded pair', () => {
    const r = bandRamp([CHROMOPHORE_MAX_WEIGHT]);
    expect(r.strength).toBe(1);
    expect(r.lo).toBeCloseTo(0.86, 12);
    expect(r.hi).toBeCloseTo(1.06, 12);
  });

  it('contrast is monotone and has no jump anywhere, INCLUDING off the empty case', () => {
    // THE SWEEP MUST START EMPTY. An earlier draft started at weight 0 with one stop present, and
    // the pre-B95 boolean passed it vacuously - `chromo.length` is 1 for a zero-weight stop, so
    // every sample read "banded" and the ramp looked perfectly flat. The cliff being pinned is at
    // the ORIGIN: no chromophore against a hair of one. Verified to go red against the boolean.
    const steps = 200;
    const samples = [bandRamp([])];
    for (let i = 0; i <= steps; i++) samples.push(bandRamp([(i / steps) * CHROMOPHORE_MAX_WEIGHT]));

    let prevSpread = -Infinity, maxJump = 0;
    for (const r of samples) {
      const spread = r.hi - r.lo;
      if (prevSpread > -Infinity) {
        expect(spread, 'band contrast must not decrease as the chromophore strengthens')
          .toBeGreaterThanOrEqual(prevSpread - 1e-12);
        maxJump = Math.max(maxJump, spread - prevSpread);
      }
      prevSpread = spread;
    }
    // The whole range is 0.03 -> 0.20. The old boolean took the entire 0.17 in ONE step at the
    // origin; anything close to that is the bug coming back.
    expect(maxJump, 'a single step moved contrast too far - this is the boolean returning')
      .toBeLessThan(0.005);
  });

  it('the stripe alpha fades with the stop rather than switching on', () => {
    expect(chromoAlpha(0)).toBe(0);
    const faint = chromoAlpha(0.02), mid = chromoAlpha(0.35), full = chromoAlpha(CHROMOPHORE_MAX_WEIGHT);
    expect(faint).toBeLessThan(0.05 * full);
    expect(mid).toBeGreaterThan(faint);
    expect(full).toBeGreaterThan(mid);
  });

  it('a barely-there chromophore is barely visible, not fully banded', () => {
    const faint = bandRamp([0.02]);
    const full = bandRamp([CHROMOPHORE_MAX_WEIGHT]);
    expect(faint.strength).toBeLessThan(0.05);
    expect(faint.hi - faint.lo).toBeLessThan(0.2 * (full.hi - full.lo));
  });
});

// WHERE A DECK GENUINELY DOES COME AND GO, it must arrive gradually. With the abundance floor gone
// (engine-map PHY-31) the only boundary left on this fixture is the chemical one: NH4SH takes ammonia
// and hydrogen sulphide one for one, so below about 0.008 % NH3 there is nothing left to condense on
// its own. Crossing it, coverage climbs through the whole range instead of switching.
describe('B95: a deck that does come and go, ramps', () => {
  const coverAt = (pct: number) => {
    const sys = load();
    editGasPercent(giantOf(sys), 'NH3', pct);
    const decks = decksFromTags(giantOf(systemProcessor.process(sys, pack)).tags, pack);
    return decks.find((d) => d.species === 'ammonia')?.coverage ?? 0;
  };

  it('the ammonia deck fades in across the stoichiometric boundary rather than switching', () => {
    const steps = [0.0080, 0.0082, 0.0084, 0.0086, 0.0088, 0.0090, 0.0095, 0.0100];
    const covers = steps.map(coverAt);
    // It must actually get somewhere - a flat zero would pass a "no jump" test trivially.
    expect(covers[covers.length - 1], 'the deck never forms at all - fixture drifted').toBeGreaterThan(0.5);
    // Monotone, and no single step may take more than half the range. The floor took ALL of it.
    for (let i = 1; i < covers.length; i++) {
      expect(covers[i], 'coverage must not fall as the condensable increases')
        .toBeGreaterThanOrEqual(covers[i - 1] - 1e-9);
    }
    const biggest = Math.max(...covers.slice(1).map((c, i) => c - covers[i]));
    expect(biggest, 'one step took most of the range - an abundance floor is back')
      .toBeLessThan(0.5);
  });

  it('and there are intermediate coverages, not just present-or-absent', () => {
    const mids = [0.0082, 0.0084, 0.0086].map(coverAt).filter((c) => c > 0.02 && c < 0.85);
    expect(mids.length, 'no partly-formed deck anywhere across the boundary').toBeGreaterThanOrEqual(2);
  });
});

// A LONG-LIVED STORM IS SOMETHING A BANDED CIRCULATION DOES, not decoration sprinkled on giants.
// It used to be a flat `rnd() > 0.35` on any giant that banded at all, which gave Saturn a permanent
// dark oval - and Saturn has no persistent spot, only the occasional white one. The chance now
// follows how hard the world bands, and the two we can actually check calibrate it.
describe('B95: a storm oval belongs to a giant whose jets can pen one in', () => {
  it("Jupiter's banding earns a storm and Saturn's does not", () => {
    expect(stormChance(0.843), "Jupiter bands at 0.843 and has a Great Red Spot").toBe(1);
    expect(stormChance(0.376), "Saturn bands at 0.376 and has no persistent spot").toBe(0);
  });

  it('a smooth giant and an ice giant never get one', () => {
    expect(stormChance(0)).toBe(0);
    expect(stormChance(0.2)).toBe(0);
  });

  it('and in between it is a CHANCE, not a switch', () => {
    const mid = stormChance(0.6);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    // monotone and jump-free across the whole range
    let prev = -1, biggest = 0;
    for (let i = 0; i <= 200; i++) {
      const c = stormChance(i / 200);
      if (prev >= 0) { expect(c).toBeGreaterThanOrEqual(prev - 1e-12); biggest = Math.max(biggest, c - prev); }
      prev = c;
    }
    expect(biggest, 'the chance jumped - this is a switch again').toBeLessThan(0.05);
  });
});

// THE POLAR VORTEX TAKES ITS COLOUR FROM THE BODY, not from the renderer. Two painters each held
// their own literal slate blues, which drew Saturn's hexagon as a grey patch on a gold planet.
describe('B95: the polar vortex is coloured off the body, not off a literal', () => {
  const giant = (cloudHex: string) => ({
    id: 'g', name: 'G', kind: 'body', roleHint: 'planet',
    classes: ['planet/ammonia-clouds-gas-giant'],
    massKg: 1.898e27, radiusKm: 69911, temperatureK: 160,
    makeup: { metal: 0, rock: 0, carbon: 0, ice: 0.39, gas: 0.61 },
    atmosphere: { name: 'x', pressure_bar: 1, composition: { H2: 0.86, He: 0.14 } },
    tags: [{ key: 'feature/polar-vortex', value: '6' }],
    apparentColor: { hex: cloudHex, banding: 6, palette: [
      { hex: cloudHex, role: 'surface', weight: 1, rawHex: cloudHex },
      { hex: cloudHex, role: 'cloud', weight: 0.9, label: 'ammonia cloud deck', rawHex: cloudHex }
    ] }
  }) as any;

  it('a gold giant gets a warm vortex and a blue one gets a cool vortex', () => {
    const gold = deriveAppearance(giant('#d4b294')).polarVortex!;
    const blue = deriveAppearance(giant('#62b1d1')).polarVortex!;
    const red = (h: string) => parseInt(h.slice(1, 3), 16);
    const blu = (h: string) => parseInt(h.slice(5, 7), 16);
    expect(red(gold.fillHex), 'a gold planet must not get a blue vortex').toBeGreaterThan(blu(gold.fillHex));
    expect(blu(blue.fillHex), 'a blue planet must not get a warm vortex').toBeGreaterThan(red(blue.fillHex));
  });

  it('the interior is darker than the clouds and the rim is brighter', () => {
    const v = deriveAppearance(giant('#d4b294'))!.polarVortex!;
    const lum = (h: string) => 0.2126*parseInt(h.slice(1,3),16) + 0.7152*parseInt(h.slice(3,5),16) + 0.0722*parseInt(h.slice(5,7),16);
    expect(lum(v.fillHex)).toBeLessThan(lum('#d4b294'));
    expect(lum(v.rimHex)).toBeGreaterThan(lum('#d4b294'));
  });

  it('is never the old hardcoded slate blue', () => {
    const v = deriveAppearance(giant('#d4b294'))!.polarVortex!;
    for (const h of [v.fillHex, v.rimHex, v.eyeHex]) {
      expect(h.toLowerCase()).not.toBe('#3c5078');   // rgba(60,80,120)
      expect(h.toLowerCase()).not.toBe('#304068');   // rgba(48,64,104)
    }
  });
});
