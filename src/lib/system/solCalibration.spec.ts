// G62 PART 2 - THE BUNDLED SOL, CALIBRATED TO REALITY AT THE DATUM.
//
// Owner: "there were always 2 sides to this - 1 get the seconds from big bang properly aligned -
// then 2 calibrate the map as we have random planetary positioning... before there was no point in
// aligning the planets to reality as time was arbitrary - not now."
//
// Every planet carried `Omega_deg: 0` and `omega_deg: 0` - placeholders, not an ephemeris - because
// until the anchor existed there was no instant for them to be right AT. They now carry real
// elements for 2026-09-01T12:00:00Z (the anchor's stake), from Standish's Keplerian elements for
// the planets and Meeus ch.47 for Luna.
//
// WHAT THIS DOES AND DOES NOT BUY, asserted rather than claimed. The Sun's longitude - which drives
// dates and seasons - lands within half a degree. The MOON lands within about a day of phase,
// because mean elements omit the large periodic terms (evection 1.27 deg, variation 0.66 deg) that
// a fixed-element Kepler orbit cannot carry. An eclipse needs a tenth of that, so this makes the
// eclipse SEASONS right without making eclipse TIMINGS right. See the last test.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeWorldPositions3D } from '$lib/physics/worldPositions';
import { orbitMeanMotion } from '$lib/physics/orbits';
import type { System } from '$lib/types';

const DATUM_MS = Date.parse('2026-09-01T12:00:00Z');
const MAPS = [
  'static/example-starmaps/Local_Neighbourhood-Starmap.json',
  'static/example-starmaps/Local_Neighbourhood_SciFi-Starmap.json'
];
const SYSTEMS = ['static/examples/Sol_2030-System.json', 'static/examples/Sol_Expanse-System.json'];

function solOf(path: string): System {
  const j = JSON.parse(readFileSync(path, 'utf8'));
  const entries = j.systems ?? [j];
  const hit = entries.map((e: any) => e.system ?? e).find((s: any) => /^(sol|sun)$/i.test(s.name));
  return hit as System;
}
const ALL = [...MAPS, ...SYSTEMS];
const deg = (r: number) => ((r * 180 / Math.PI) % 360 + 360) % 360;

describe('the bundled Sol is calibrated, in every file that carries it', () => {
  it('all four files agree on the datum and on every calibrated element', () => {
    const sols = ALL.map(solOf);
    for (const s of sols) expect(s.epochT0).toBe(DATUM_MS);
    // The four copies must not drift apart - that is the whole reason this sweeps every file.
    const fingerprint = (s: System) => JSON.stringify(
      s.nodes
        .filter((n: any) => /^(mercury|venus|earth|luna|mars|jupiter|saturn|uranus|neptune)$/i.test(n.name))
        .sort((a: any, b: any) => a.name.localeCompare(b.name))
        .map((n: any) => [n.name, n.orbit.elements, n.orbit.t0, n.orbit.n_rad_per_s])
    );
    for (const s of sols.slice(1)) expect(fingerprint(s)).toBe(fingerprint(sols[0]));
  });

  it('no planet is left on the placeholder node any more', () => {
    for (const path of ALL) {
      for (const n of solOf(path).nodes as any[]) {
        if (!/^(mercury|venus|earth|mars|jupiter|saturn|uranus|neptune|luna)$/i.test(n.name)) continue;
        // Earth defines the ecliptic, so ITS node is legitimately zero; nothing else may be.
        if (/^earth$/i.test(n.name)) continue;
        expect(n.orbit.elements.Omega_deg, `${path} ${n.name} node`).not.toBe(0);
        expect(n.orbit.elements.omega_deg, `${path} ${n.name} periapsis`).not.toBe(0);
      }
    }
  });

  it("Luna's stored mean motion is the sidereal month, not the one-body approximation", () => {
    const luna: any = solOf(MAPS[0]).nodes.find((n: any) => /^luna$/i.test(n.name));
    const days = 2 * Math.PI / orbitMeanMotion(luna.orbit) / 86400;
    // ABSOLUTE (PHY-34): 27.321661 d is the sidereal month, from outside this code. Deriving n from
    // sqrt(GM_earth/a^3) gives 27.4518 d - it ignores the Moon's own mass - which is 0.13 d of drift
    // EVERY lunation and was what put the predicted eclipses two years out.
    expect(Math.abs(days - 27.321661)).toBeLessThan(0.001);
  });

  it("Luna's node sits where it really did at the datum, and that is what sets eclipse seasons", () => {
    const luna: any = solOf(MAPS[0]).nodes.find((n: any) => /^luna$/i.test(n.name));
    // ABSOLUTE: the Moon's mean ascending node on 2026-09-01 is about 329.3 deg (it regresses a full
    // turn in 18.6 years, so 19.3 deg/yr). Zero - the shipped placeholder - is 329 degrees wrong.
    expect(luna.orbit.elements.Omega_deg).toBeCloseTo(329.275, 1);
    expect(luna.orbit.elements.i_deg).toBeCloseTo(5.145, 2);
  });

  it('the Sun is where the almanac puts it, to within half a degree', () => {
    const sol = solOf(MAPS[0]);
    for (const [iso, almanac] of [
      ['2026-09-01T12:00:00Z', 158.8], ['2026-12-21T00:00:00Z', 269.2], ['2027-03-20T12:00:00Z', 359.8]
    ] as const) {
      const p = computeWorldPositions3D(sol, Date.parse(iso));
      const s = p.get('solar-system-sun')!, e = p.get('solar-system-earth')!;
      const lon = deg(Math.atan2(s.y - e.y, s.x - e.x));
      const err = ((lon - almanac + 540) % 360) - 180;
      expect(Math.abs(err), `${iso} sun longitude ${lon.toFixed(2)}`).toBeLessThan(0.6);
    }
  });

  // THE ECLIPSE CHECK, stating exactly how far it got. Before calibration the engine's first Earth
  // eclipse after 2026-06-01 was 2028-09-22, 771.7 days from the real total of 2026-08-12. It now
  // puts the Moon ON the Sun at that instant - a new moon near the node - which is the geometry an
  // eclipse is made of. It is NOT yet minute-accurate, and the gate says which of the two it is.
  it('at the 2026-08-12 total eclipse the Moon is on the Sun, near the node', () => {
    const sol = solOf(MAPS[0]);
    const p = computeWorldPositions3D(sol, Date.parse('2026-08-12T17:46:00Z'));
    const s = p.get('solar-system-sun')!, e = p.get('solar-system-earth')!, m = p.get('solar-system-luna')!;
    const sunLon = deg(Math.atan2(s.y - e.y, s.x - e.x));
    const moonLon = deg(Math.atan2(m.y - e.y, m.x - e.x));
    const elong = ((moonLon - sunLon + 540) % 360) - 180;
    const dist = Math.hypot(m.x - e.x, m.y - e.y, m.z - e.z);
    const lat = Math.asin((m.z - e.z) / dist) * 180 / Math.PI;
    expect(Math.abs(elong), `elongation ${elong.toFixed(2)} deg - must be a NEW moon`).toBeLessThan(2);
    expect(Math.abs(lat), `ecliptic latitude ${lat.toFixed(2)} deg - must be near the node`).toBeLessThan(1.5);
    // And the honest ceiling: mean elements leave about a degree on the Moon, where totality needs
    // about a tenth of one. This asserts the geometry is RIGHT, not that the timing is to the minute.
  });
});

describe('one quantity, one answer: the published period follows the motion', () => {
  it("Luna's reported orbital period is the one it actually moves at", async () => {
    // The rate a body MOVES at comes from `orbitMeanMotion`, which respects a stored `n_rad_per_s`.
    // The period a body REPORTS came from a^3/M_primary regardless - so a calibrated Luna moved at
    // 27.32 d and reported 27.45. One quantity with two answers, which is exactly the fault the
    // duplication rule is for; SystemProcessor now derives the readout from the same authority.
    const { SystemProcessor } = await import('$lib/core/SystemProcessor');
    const base = 'static/rulepacks/starter-sf';
    const merge = (a: any, b: any): any => {
      const o: any = { ...a };
      for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && a?.[k] ? merge(a[k], v) : v;
      return o;
    };
    let pack: any = JSON.parse(readFileSync(`${base}/main.json`, 'utf8'));
    for (const f of ['stars.json', 'planets.json', 'generation.json', 'orbital_constants.json', 'classification.json', 'atmospheres.json']) {
      pack = merge(pack, JSON.parse(readFileSync(`${base}/${f}`, 'utf8')));
    }
    const sol: any = solOf(SYSTEMS[0]);
    const processed: any = new SystemProcessor().process(JSON.parse(JSON.stringify(sol)), pack);
    const luna: any = processed.nodes.find((n: any) => /^luna$/i.test(n.name));
    const moves = 2 * Math.PI / orbitMeanMotion(luna.orbit) / 86400;
    expect(luna.orbital_period_days).toBeCloseTo(moves, 4);
    // ABSOLUTE: the sidereal month, from outside this code.
    expect(luna.orbital_period_days).toBeCloseTo(27.321661, 2);
  });
});
