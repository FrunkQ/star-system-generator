// THE AURORA OVAL SITS WHERE THE FIELD PUTS IT ([[G82]] job 3).
//
// It was nailed at 0.15 and 0.85 of the texture - 27 degrees of colatitude, 63 of latitude - for every
// world in the app, from Mercury to Jupiter. The oval is the FOOTPRINT of the last closed field line,
// so it belongs to the magnetosphere, and it is now taken from `magnetosphere.ovalColatDeg` - the same
// number the 2D overlay shades to, so the picture on the map and the picture on the globe cannot
// disagree about where a field closes.
//
// The texture itself is a canvas and cannot be checked headlessly ([[E7]]). The PLACEMENT is
// arithmetic, so it was separated out into `auroraRingCentres` and that is what is gated here.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemProcessor } from '../core/SystemProcessor';
import { auroraRingCentres, AURORA_OVAL_SIGMA } from '$lib/holo/bodyFeatures';
import type { System, RulePack, CelestialBody } from '../types';

function deepMerge(t: any, s: any): any {
  const o = { ...t };
  if (isObj(t) && isObj(s)) {
    for (const k of Object.keys(s)) {
      if (isObj(s[k])) { if (!(k in t)) Object.assign(o, { [k]: s[k] }); else o[k] = deepMerge(t[k], s[k]); }
      else Object.assign(o, { [k]: s[k] });
    }
  }
  return o;
}
function isObj(i: any) { return i && typeof i === 'object' && !Array.isArray(i); }
function loadPack(): RulePack {
  const b = path.resolve('static/rulepacks/starter-sf');
  let p = JSON.parse(fs.readFileSync(path.join(b, 'main.json'), 'utf-8')) as RulePack;
  for (const f of ['construct_templates.json', 'engine-definitions.json', 'fuel-definitions.json', 'liquids.json', 'classification.json', 'atmospheres.json']) {
    const fp = path.join(b, f);
    if (fs.existsSync(fp)) p = deepMerge(p, JSON.parse(fs.readFileSync(fp, 'utf-8')));
  }
  return p;
}
const SOL: System = systemProcessor.process(
  JSON.parse(fs.readFileSync(path.resolve('static/examples/Sol_2030-System.json'), 'utf-8')) as System,
  loadPack()
);
const by = (name: string) => SOL.nodes.find((n) => n.name === name) as CelestialBody;

describe('the oval is placed from the published colatitude', () => {
  it("EARTH'S ring lands at 0.132 of the texture, not the old 0.15", () => {
    // ABSOLUTE: Earth's oval is 23.73 degrees of colatitude, and v = colat / 180 = 0.13183.
    // The old fixed 0.15 was 27 degrees - three and a half degrees of latitude too far from the pole.
    const r = auroraRingCentres(by('Earth').magnetosphere!.ovalColatDeg);
    expect(r.north).toBeCloseTo(0.13183, 4);
    expect(r.south).toBeCloseTo(1 - 0.13183, 4);
    expect(r.north * 180).toBeCloseTo(23.73, 2);
  });

  it("JUPITER'S hugs the pole at 0.069, which is the whole point of the change", () => {
    // ABSOLUTE: 12.33 degrees of colatitude - 77.7 of latitude. The old fixed ring put it at 63,
    // fifteen degrees of latitude out on the most photographed aurora in the solar system.
    const r = auroraRingCentres(by('Jupiter').magnetosphere!.ovalColatDeg);
    expect(r.north).toBeCloseTo(0.0685, 4);
    expect(90 - r.north * 180).toBeCloseTo(77.67, 1);
  });

  it('the two are DIFFERENT, which the old code could not manage', () => {
    const e = auroraRingCentres(by('Earth').magnetosphere!.ovalColatDeg);
    const j = auroraRingCentres(by('Jupiter').magnetosphere!.ovalColatDeg);
    expect(j.north).toBeLessThan(e.north);
    expect(e.north - j.north).toBeGreaterThan(0.05);
  });

  it('a bigger bubble puts its oval closer to the pole, monotonically', () => {
    // The relation the physics asserts: sin^2(colat) = 1 / (fraction x standoff), so a stronger field
    // or a thinner wind pulls the oval poleward. Checked over the whole published set.
    const rows = (SOL.nodes as CelestialBody[])
      .filter((n) => n.magnetosphere && n.magnetosphere.ovalColatDeg < 90)
      .map((n) => ({ name: n.name, standoff: n.magnetosphere!.standoffRadii, v: auroraRingCentres(n.magnetosphere!.ovalColatDeg).north }))
      .sort((a, b) => a.standoff - b.standoff);
    expect(rows.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].v, `${rows[i].name} vs ${rows[i - 1].name}`).toBeLessThanOrEqual(rows[i - 1].v + 1e-9);
    }
  });

  it('a body with no oval to draw is not given one', () => {
    // Mercury's bubble is too small to close a field line above the ground, and it reports 90 degrees.
    // 90 puts the "ring" on the equator, where the gaussian covers the whole globe - so the SHELL is
    // what must not be built for it, and that is the strength gate one level up, not this function.
    // What this asserts is only that nothing here invents a polar ring for it.
    expect(by('Mercury').magnetosphere!.ovalColatDeg).toBe(90);
    expect(auroraRingCentres(90).north).toBe(0.5);
  });

  it('the curtain never spills over the pole, and Earth keeps the width the app has always used', () => {
    // The width is a drawing choice - the physics page says the oval is exaggerated for legibility -
    // but a tight oval with a wide curtain would wrap the pole and read as a cap rather than a ring.
    expect(auroraRingCentres(by('Earth').magnetosphere!.ovalColatDeg).sigma).toBeCloseTo(AURORA_OVAL_SIGMA, 6);
    const j = auroraRingCentres(by('Jupiter').magnetosphere!.ovalColatDeg);
    expect(j.sigma).toBeLessThan(AURORA_OVAL_SIGMA);
    expect(j.north - j.sigma).toBeGreaterThan(0);
    for (const colat of [1, 2, 5, 12, 24, 40, 89]) {
      const r = auroraRingCentres(colat);
      expect(r.north - r.sigma, `colat ${colat}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('an older save with no magnetosphere block keeps the ring it always had', () => {
    // Honest fallback: undefined means "nothing published", not "put it at the pole".
    expect(auroraRingCentres(undefined).north).toBeCloseTo(0.15, 6);
    expect(auroraRingCentres(undefined).sigma).toBeCloseTo(AURORA_OVAL_SIGMA, 6);
  });
});
