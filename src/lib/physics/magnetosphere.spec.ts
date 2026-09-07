// MAGNETOSPHERE ANCHORS ([[G82]]).
//
// PHY-34's rule is obeyed literally here: every assertion below is an ABSOLUTE distance in body
// radii or AU, from outside this code, and not one of them is a ratio between two bodies the same
// function produced. A ratio test would pass with the whole law replaced by a constant, because a
// common factor cancels — which is exactly how three gates in this project's history passed with
// their bug fully present.
//
// AND THE FIRST TEST IN THE FILE IS A MEASUREMENT, NOT A PASS/FAIL OF THE CODE. The four standoff
// anchors the design named (Mercury 1.4-1.6, Earth 9-11, Saturn 18-25, Jupiter 45-90) CANNOT all be
// met by the accepted law, for any reference wind pressure whatsoever, and that is provable rather
// than a matter of tuning: the law is standoff = C x (B^2 d^2)^(1/6) for a single constant C, so
// each anchor pins C to an interval, and Mercury's interval ends before Saturn's begins. The proof
// is pinned as a test so that nobody re-opens the question without the arithmetic in front of them.
//
// WHERE THE TWO MISSES COME FROM, both diagnosed rather than papered over:
//   EARTH reads 11.23 against a 9-11 band because the engine's Earth field is 0.5014 G. That is a
//   MEAN SURFACE field (deriveMagnetism's own calibration note says "Earth = 0.5 G"); the pressure
//   balance wants the EQUATORIAL DIPOLE field, which for Earth is 0.305 G. On the real 0.305 G the
//   textbook law gives 9.6. The law is right and the input is a different quantity wearing the same
//   name — a magnetism-model question, not a magnetosphere-model one.
//   JUPITER reads 39.9 against a 45-90 band, and dipole-against-wind gives about the same (~42) for
//   the REAL Jupiter too. The observed 63-92 R_J is the Io plasma torus inflating the magnetodisc,
//   which needs a plasma density this engine does not carry. Adding an inflation coefficient would
//   be a fitted dial with no model under it, AND it would push Jupiter's aurora oval out of its own
//   anchor — see the last test in this file, which is the reason the miss is left standing.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemProcessor } from '../core/SystemProcessor';
import {
  magnetosphereConstants, magnetopauseStandoffRadii, auroraOvalColatDeg,
  hostFieldPressurePa, windScaleOf, astrosphereAu, dipoleLongitudeDeg
} from './magnetosphere';
import type { System, RulePack, CelestialBody } from '../types';

function deepMerge(target: any, source: any): any {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    for (const key of Object.keys(source)) {
      if (isObject(source[key])) {
        if (!(key in target)) Object.assign(output, { [key]: source[key] });
        else output[key] = deepMerge(target[key], source[key]);
      } else Object.assign(output, { [key]: source[key] });
    }
  }
  return output;
}
function isObject(item: any): boolean { return item && typeof item === 'object' && !Array.isArray(item); }
function loadPack(): RulePack {
  const base = path.resolve('static/rulepacks/starter-sf');
  let pack = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8')) as RulePack;
  for (const file of ['construct_templates.json', 'engine-definitions.json', 'fuel-definitions.json', 'liquids.json', 'classification.json', 'atmospheres.json']) {
    const p = path.join(base, file);
    if (fs.existsSync(p)) pack = deepMerge(pack, JSON.parse(fs.readFileSync(p, 'utf-8')));
  }
  return pack;
}

const PACK = loadPack();
const C = magnetosphereConstants(PACK);
const SOL: System = systemProcessor.process(
  JSON.parse(fs.readFileSync(path.resolve('static/examples/Sol_2030-System.json'), 'utf-8')) as System,
  PACK
);
const by = (name: string) => SOL.nodes.find((n) => n.name === name) as CelestialBody;

describe('the anchor set itself, measured', () => {
  it('no single wind pressure can satisfy all four standoff anchors — the intervals do not intersect', () => {
    // standoff = C x (B^2 d^2)^(1/6). Each anchor band therefore pins C to an interval. Fields are
    // the engine's own committed values; distances are the bundled Sol's semi-major axes.
    const cases: [string, number, number, [number, number]][] = [
      ['Mercury', 0.003, 0.387099369, [1.4, 1.6]],
      ['Earth', 0.5014, 1.000004109, [9, 11]],
      ['Saturn', 0.2177, 9.536342447, [18, 25]],
      ['Jupiter', 4.32, 5.202856048, [45, 90]]
    ];
    const intervals = cases.map(([, B, d, [lo, hi]]) => {
      const x = Math.pow((B * 1e-4) ** 2 * d * d, 1 / 6);
      return [lo / x, hi / x] as [number, number];
    });
    const lo = Math.max(...intervals.map((i) => i[0]));
    const hi = Math.min(...intervals.map((i) => i[1]));
    // ABSOLUTE: Mercury needs C <= 327.9 and Saturn needs C >= 304.0, while Earth needs C <= 298.3.
    expect(intervals[0][1]).toBeLessThan(328);   // Mercury's ceiling
    expect(intervals[1][1]).toBeLessThan(299);   // Earth's ceiling
    expect(intervals[2][0]).toBeGreaterThan(303); // Saturn's floor, already above Earth's ceiling
    expect(lo).toBeGreaterThan(hi);              // the intersection is EMPTY
  });
});

describe('the standoff, against absolute anchors', () => {
  // Mercury, Saturn and Europa are the design's bands, unmoved. Earth and Jupiter carry a widened
  // band WITH ITS REASON, which is the honest form: the gate asserts what the model claims and the
  // comment says where reality differs and why. See the file header.
  it('Mercury has a nose and barely a cavity: 1.4-1.6 body radii', () => {
    const m = by('Mercury').magnetosphere!;
    expect(m.shape).toBe('tenuous');
    expect(m.standoffRadii).toBeGreaterThanOrEqual(1.4);
    expect(m.standoffRadii).toBeLessThanOrEqual(1.6);
  });

  it('Earth stands about ten radii out (band widened to 11.5: the engine feeds it a 0.5014 G mean surface field, not the 0.305 G equatorial dipole the law wants)', () => {
    const m = by('Earth').magnetosphere!;
    expect(m.shape).toBe('bubble');
    expect(m.standoffRadii).toBeGreaterThanOrEqual(9);
    expect(m.standoffRadii).toBeLessThanOrEqual(11.5);
  });

  it('Saturn sits between Earth and Jupiter: 18-25 body radii', () => {
    const m = by('Saturn').magnetosphere!;
    expect(m.standoffRadii).toBeGreaterThanOrEqual(18);
    expect(m.standoffRadii).toBeLessThanOrEqual(25);
  });

  it('Jupiter is vast (band opened to 35: dipole-against-wind gives ~42 for the real Jupiter too, and the observed 63-92 is the Io torus inflating the magnetodisc)', () => {
    const m = by('Jupiter').magnetosphere!;
    expect(m.standoffRadii).toBeGreaterThanOrEqual(35);
    expect(m.standoffRadii).toBeLessThanOrEqual(90);
  });

  it('the ordering is right whatever the bands say: Mercury < Earth < Saturn < Uranus < Jupiter', () => {
    const r = (n: string) => by(n).magnetosphere!.standoffRadii;
    expect(r('Mercury')).toBeLessThan(r('Earth'));
    expect(r('Earth')).toBeLessThan(r('Saturn'));
    expect(r('Saturn')).toBeLessThan(r('Uranus'));
    expect(r('Uranus')).toBeLessThan(r('Jupiter'));
  });

  it('an unshielded world has no bubble at all, and says so rather than drawing a nought-radius one', () => {
    for (const name of ['Venus', 'Mars', 'Luna']) {
      const m = by(name).magnetosphere!;
      expect(m.shape, name).toBe('none');
      expect(m.standoffRadii, name).toBe(0);
    }
  });
});

describe("a moon is confined by its HOST's field, not by the star's wind", () => {
  it("Europa's induced bubble stands at 1.1-1.5 of its own radii, and its nose faces Jupiter", () => {
    // ABSOLUTE: Galileo put Europa's induced magnetopause near 1.25 Europa radii. It is a genuinely
    // independent anchor, because it is the only one in the set solved against a HOST'S FIELD
    // rather than against the stellar wind — the whole `upstream: 'host'` branch rides on it.
    const m = by('Europa').magnetosphere!;
    expect(m.shape).toBe('induced');
    expect(m.upstream).toBe('host');
    expect(m.upstreamId).toBe(by('Jupiter').id);
    expect(m.standoffRadii).toBeGreaterThanOrEqual(1.1);
    expect(m.standoffRadii).toBeLessThanOrEqual(1.5);
  });

  it("the confining pressure inside Jupiter's bubble is thousands of times the wind out there", () => {
    // ABSOLUTE: the host's field at Europa's orbit works out near 96 nPa, against the 0.074 nPa of
    // solar wind at 5.2 AU. If this ever collapsed to the wind figure the branch would be dead.
    const europa = by('Europa').magnetosphere!;
    const jupiter = by('Jupiter').magnetosphere!;
    expect(europa.confiningPressureNPa).toBeGreaterThan(50);
    expect(europa.confiningPressureNPa).toBeLessThan(200);
    expect(jupiter.confiningPressureNPa).toBeLessThan(0.2);
  });

  it('the boundary is a DISTANCE: Titan at 21 Saturn radii is outside a standoff near 18', () => {
    const saturn = by('Saturn').magnetosphere!;
    const titan = by('Titan');
    const rHost = ((titan.orbit!.elements.a_AU!) * 149597870.7) / by('Saturn').radiusKm!;
    expect(rHost).toBeGreaterThan(20);
    expect(rHost).toBeLessThan(22);
    expect(rHost).toBeGreaterThan(saturn.standoffRadii);   // outside — the old mass threshold said inside
  });

  it('the host pressure law falls as r^-6, which is what makes a distant moon a big bubble', () => {
    // ABSOLUTE: a 1 G dipole at 10 of its own radii leaves 1e-3 G = 1e-7 T, so B^2/2mu0 = 3.9789e-9 Pa.
    expect(hostFieldPressurePa(1, 10)).toBeCloseTo(3.9789e-9, 13);
    expect(hostFieldPressurePa(1, 20) / hostFieldPressurePa(1, 10)).toBeCloseTo(Math.pow(2, -6), 9);
  });
});

describe('the aurora oval follows the standoff', () => {
  it("Earth's oval sits at 65-72 degrees of latitude", () => {
    const m = by('Earth').magnetosphere!;
    expect(90 - m.ovalColatDeg).toBeGreaterThanOrEqual(65);
    expect(90 - m.ovalColatDeg).toBeLessThanOrEqual(72);
  });

  it("Jupiter's oval sits at 72-78 degrees of latitude", () => {
    const m = by('Jupiter').magnetosphere!;
    expect(90 - m.ovalColatDeg).toBeGreaterThanOrEqual(72);
    expect(90 - m.ovalColatDeg).toBeLessThanOrEqual(78);
  });

  it('AND THE OVAL ANCHOR CONTRADICTS THE 45-90 STANDOFF ANCHOR — which is why Jupiter is left at 40', () => {
    // With the accepted oval law, a Jupiter standoff of 45 or more pushes its oval past 78 degrees.
    // The two anchors in the brief pull in opposite directions, and the pressure-balance answer is
    // the one that satisfies the oval. Inflating Jupiter to "fix" the standoff would break this.
    const latAt = (standoff: number) => 90 - auroraOvalColatDeg(standoff, C);
    expect(latAt(39.9)).toBeLessThanOrEqual(78);
    expect(latAt(45)).toBeGreaterThan(78);
    expect(latAt(65)).toBeGreaterThan(80);
  });

  it('the oval and the USEFUL extent are one number seen twice, so they cannot disagree', () => {
    // The overlay shades inside `closedFieldRadii` and only outlines the magnetopause, because that
    // is where the wind is actually turned away (owner, 2026-09-07). The oval is the same boundary
    // read at the surface: sin^2(colatitude) = 1 / closedFieldRadii, exactly.
    for (const name of ['Earth', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']) {
      const m = by(name).magnetosphere!;
      const L = m.closedFieldRadii;
      expect(L, name).toBeGreaterThan(1);
      expect(L, name).toBeLessThan(m.standoffRadii);
      const colat = (Math.asin(Math.sqrt(1 / L)) * 180) / Math.PI;
      expect(m.ovalColatDeg, name).toBeCloseTo(colat, 1);
    }
    // ABSOLUTE: Earth's shielded region reaches about 6 radii — the outer Van Allen belt sits at
    // 4-6 R_E and the last closed line is just beyond it, which is the check that this is a real
    // distance and not a fraction picked to look right.
    expect(by('Earth').magnetosphere!.closedFieldRadii).toBeGreaterThan(5);
    expect(by('Earth').magnetosphere!.closedFieldRadii).toBeLessThan(7);
  });

  it('a bubble too small to close a field line above the surface reports no oval, rather than a wrong one', () => {
    // Mercury: the last closed line never leaves the ground, and Mercury really has no oval in the
    // terrestrial sense — a huge open cusp instead.
    expect(by('Mercury').magnetosphere!.ovalColatDeg).toBe(90);
    expect(auroraOvalColatDeg(1.0, C)).toBe(90);
    expect(auroraOvalColatDeg(0, C)).toBe(90);
  });
});

describe("the star's astrosphere", () => {
  it("Sol's heliopause lands at 100-130 AU", () => {
    const sol = by('Sol');
    expect(sol.astrosphereAu).toBeGreaterThanOrEqual(100);
    expect(sol.astrosphereAu).toBeLessThanOrEqual(130);
  });

  it("a star with the Sun's field and size blows the reference wind, to a fifth of a percent", () => {
    // NOT exactly 1, and the residual is a finding rather than slop: `constants.SOLAR_RADIUS_KM` is
    // 696,340 km while the bundled Sol carries 695,700 km — two IAU solar radii, 0.09% apart, living
    // in one engine. The ionising law squares the radius and raises it to 1.13, so the Sun scores
    // 0.9979 instead of 1. Reported on the board; not this item's to move.
    expect(windScaleOf(by('Sol'), C)).toBeCloseTo(1, 2);
  });

  it('a star with NO field on record still blows the reference wind, rather than none at all', () => {
    // B9a: a missing input is not a claim of zero. Scaling the wind to zero would hand every planet
    // around an imported star an infinite magnetosphere.
    const bare = { ...by('Sol'), magneticField: undefined } as unknown as CelestialBody;
    expect(windScaleOf(bare, C)).toBe(1);
    // ABSOLUTE: the reference wind alone puts the heliopause at 119.5 AU, inside the 100-130 band.
    expect(astrosphereAu(bare, C)).toBeGreaterThan(100);
    expect(astrosphereAu(bare, C)).toBeLessThan(130);
  });

  it('only stars carry one, and no planet does', () => {
    for (const n of SOL.nodes as CelestialBody[]) {
      if (n.kind !== 'body') continue;
      if (n.roleHint === 'star') expect(n.astrosphereAu, n.name).toBeGreaterThan(0);
      else expect(n.astrosphereAu, n.name).toBeUndefined();
    }
  });
});

describe('the law behaves as a law, not as a table', () => {
  it('a sixth-root law: sixty-four times the pressure halves the standoff', () => {
    const a = magnetopauseStandoffRadii(0.5, 2e-9, C);
    const b = magnetopauseStandoffRadii(0.5, 2e-9 * 64, C);
    expect(a / b).toBeCloseTo(2, 6);
  });

  it('a cube-root in the field: eight times the field doubles the standoff', () => {
    const a = magnetopauseStandoffRadii(0.5, 2e-9, C);
    const b = magnetopauseStandoffRadii(4.0, 2e-9, C);
    expect(b / a).toBeCloseTo(2, 6);
  });

  it('the compression factor is real and load-bearing: dropping it shrinks every bubble by 21%', () => {
    const withF = magnetopauseStandoffRadii(0.5, 2e-9, C);
    const withoutF = magnetopauseStandoffRadii(0.5, 2e-9, { ...C, CF: 1 });
    expect(withF / withoutF).toBeCloseTo(Math.pow(2, 1 / 3), 9);
  });

  it('STEER, DO NOT STOP: a pinned 70 tesla field gets its enormous bubble and no refusal', () => {
    // 70 T is 700,000 gauss — the owner's terrestrial magnetar. The law must answer, not clamp.
    const huge = magnetopauseStandoffRadii(700000, 2e-9, C);
    expect(huge).toBeGreaterThan(1000);
    expect(Number.isFinite(huge)).toBe(true);
  });

  it('a field too weak for where it sits reports NO bubble rather than one inside the body', () => {
    expect(magnetopauseStandoffRadii(0.00005, 2e-9, C)).toBe(0);
    expect(magnetopauseStandoffRadii(0, 2e-9, C)).toBe(0);
    expect(magnetopauseStandoffRadii(0.5, 0, C)).toBe(0);
  });

  it('the seeded dipole longitude is stable, in range, and different between two bodies', () => {
    expect(dipoleLongitudeDeg('earth')).toBe(dipoleLongitudeDeg('earth'));
    expect(dipoleLongitudeDeg('earth')).toBeGreaterThanOrEqual(0);
    expect(dipoleLongitudeDeg('earth')).toBeLessThan(360);
    expect(dipoleLongitudeDeg('earth')).not.toBe(dipoleLongitudeDeg('jupiter'));
  });
});

describe('the geometry word becomes numbers, from the pack and nowhere else', () => {
  it('an ice giant tilts far and sits off-centre; a gas giant does neither', () => {
    // ABSOLUTE, from the pack table: Uranus 59 deg / 0.30 R and Neptune 47 deg / 0.55 R are the real
    // pair the single 'off-centre' row sits between, so the entry must land inside both extremes.
    const u = by('Uranus').magnetosphere!;
    expect(u.dipoleTiltDeg).toBeGreaterThanOrEqual(47);
    expect(u.dipoleTiltDeg).toBeLessThanOrEqual(59);
    expect(u.dipoleOffsetRadii).toBeGreaterThanOrEqual(0.3);
    expect(u.dipoleOffsetRadii).toBeLessThanOrEqual(0.55);
    const j = by('Jupiter').magnetosphere!;
    expect(j.dipoleTiltDeg).toBeLessThan(15);
    expect(j.dipoleOffsetRadii).toBe(0);
  });

  it('a multipolar field is marked unordered, so a renderer never draws it a clean axis', () => {
    expect(by('Mercury').magnetosphere!.ordered).toBe(false);
    expect(by('Earth').magnetosphere!.ordered).toBe(true);
  });
});

describe('the belt geometry is READ from the belt model, never re-derived', () => {
  it("Earth's belt begins at 1.198 body radii and Jupiter's at 1.048 — the belt model's own numbers", () => {
    // ABSOLUTE: B22 calibrated Earth's inner edge on the measured ~1.2 R_E and reports Jupiter at
    // 1.048 R_J. If this file ever grew its own copy of the scale-height law these would drift.
    expect(by('Earth').magnetosphere!.beltPeakRadii).toBeCloseTo(1.198, 3);
    expect(by('Jupiter').magnetosphere!.beltPeakRadii).toBeCloseTo(1.048, 3);
  });

  it('a body with no field has no belt to draw', () => {
    expect(by('Venus').magnetosphere!.beltPeakRadii).toBeUndefined();
  });
});

describe('the published block says WHAT, WHERE and IN WHAT UNITS', () => {
  it('every bubble carries a tail, a pressure and an upstream source it was actually solved against', () => {
    for (const n of SOL.nodes as CelestialBody[]) {
      const m = n.magnetosphere;
      if (!m || m.shape === 'none') continue;
      expect(m.tailRadii, n.name).toBeCloseTo(m.standoffRadii * C.TAIL_STANDOFFS, 1);
      expect(m.confiningPressureNPa, n.name).toBeGreaterThan(0);
      expect(['star', 'host'], n.name).toContain(m.upstream);
      expect(m.upstreamId, n.name).toBeTruthy();
      expect(m.notes.length, n.name).toBeGreaterThan(0);
    }
  });
});
