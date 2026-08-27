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
//   NOT     - that a tiny composition edit cannot change the DECK STACK. It can, and honestly:
//             a deck arrives ~20x past opaque rather than fading in (engine-map PHY-31). That step
//             is real physics and is characterised below rather than asserted away, so that whoever
//             adds a subsaturated-haze term sees exactly which number moved.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemProcessor } from '../core/SystemProcessor';
import { fixUpImportedSystem } from '../system/importFixup';
import { decksFromTags, CLOUD_DECK_TAG } from '../physics/cloudDecks';
import { deriveApparentColorParts, CHROMOPHORE_MAX_WEIGHT } from './apparentColor';
import { giantBandRamp, chromoAlpha } from './planetTexture';
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
  it('the fixture really does sit on a deck threshold (or it pins nothing)', () => {
    const below = load(); editGasPercent(giantOf(below), 'NH3', 0.017);
    const above = load(); editGasPercent(giantOf(above), 'NH3', 0.019);
    const b = decksFromTags(giantOf(systemProcessor.process(below, pack)).tags, pack);
    const a = decksFromTags(giantOf(systemProcessor.process(above, pack)).tags, pack);
    expect(b.length, 'fixture no longer straddles a threshold - retune it or this suite is vacuous')
      .not.toBe(a.length);
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

// CHARACTERISATION, not an assertion of correctness - engine-map PHY-31. A deck does not fade in:
// it arrives already far past opaque. This is the residual sharpness in B95, it is physics rather
// than rendering, and closing it needs a subsaturated-haze term that would move every cloudy world.
// Pinned so that change is visible and deliberate rather than a surprise.
describe('B95 (characterisation): a deck arrives thick, it does not fade in', () => {
  it('the first deck to appear is already near-total cover', () => {
    const at = (pct: number) => {
      const sys = load();
      editGasPercent(giantOf(sys), 'NH3', pct);
      return decksFromTags(giantOf(systemProcessor.process(sys, pack)).tags, pack);
    };
    const before = at(0.0180);
    const after = at(0.0190);
    const arrived = after.find((d) => !before.some((b) => b.species === d.species));
    expect(arrived, 'expected a deck to appear between NH3 0.0180 and 0.0190 pct').toBeTruthy();
    // If a subsaturated-haze term ever lands, THIS is the number that should fall well below 0.5.
    expect(arrived.coverage,
      'a newly-condensing deck still arrives near-total (PHY-31) - if this fails, the haze term landed')
      .toBeGreaterThan(0.5);
  });
});
