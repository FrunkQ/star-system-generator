import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { addPlanetaryBody } from './modifiers';
import { systemProcessor } from '../core/SystemProcessor';
import { calculateAllStellarZones, calculateRocheLimit } from '../physics/zones';
import type { RulePack, CelestialBody, System } from '../types';
import { SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '../constants';

/**
 * WHERE A NEWLY CREATED PLANET APPEARS (inbox B84).
 *
 * The owner's report was "a freshly created planet is too cold until well inside the goldilocks
 * zone". The physics was honest and the atmosphere was honest; the PLACEMENT was not, and the two
 * are coupled in a way that is easy to miss — a body's air is drawn from the entries whose declared
 * temperature range covers the equilibrium temperature of THE ORBIT IT IS GIVEN, and dragging it
 * afterwards cannot give it air it was never generated with.
 *
 * MEASURED before the fix, same seed and same final orbit of 1.2 AU: born there, +28 C with 4.2 bar;
 * born at 40 AU and moved in, -28 C with no atmosphere at all. A 56 K difference decided by nothing
 * but where the body happened to appear — and the orbit was drawn uniformly from a gap running to
 * 172 AU, so it nearly always appeared somewhere airless.
 */
function deepMerge(t: any, s: any): any {
  if (typeof t !== 'object' || t === null || Array.isArray(t)) return s;
  const out = { ...t };
  for (const k of Object.keys(s || {})) out[k] = (k in out) ? deepMerge(out[k], s[k]) : s[k];
  return out;
}
function loadPack(): RulePack {
  const base = path.resolve('static/rulepacks/starter-sf');
  let p: any = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8'));
  for (const f of ['stars.json', 'planets.json', 'generation.json', 'orbital_constants.json',
    'classification.json', 'atmospheres.json', 'liquids.json']) {
    const fp = path.join(base, f);
    if (fs.existsSync(fp)) p = deepMerge(p, JSON.parse(fs.readFileSync(fp, 'utf-8')));
  }
  return p as RulePack;
}
const P = loadPack();
const STAR = {
  id: 'star', name: 'Star', kind: 'body', parentId: null, roleHint: 'star', classes: ['star/G2V'],
  massKg: SOLAR_MASS_KG, radiusKm: SOLAR_RADIUS_KM, temperatureK: 5778, radiationOutput: 1,
  axial_tilt_deg: 0, rotation_period_hours: 600, tags: []
} as unknown as CelestialBody;
// The seed varies per draw on purpose: addPlanetaryBody seeds from sys.seed + Date.now(), so a tight
// loop would otherwise share one seed (engine map M5) and every "sample" would be the same draw.
const bare = (i: number): System =>
  ({ id: 's', name: 's', seed: 'b84-' + i, epochT0: 0, age_Gyr: 4.6, nodes: [STAR] } as any);

const created = (i: number, type = 'planet/terrestrial') => {
  const sys = addPlanetaryBody(bare(i), 'star', type, P);
  const out = systemProcessor.process(sys, P);
  return out.nodes.find((n) => n.id !== 'star') as CelestialBody;
};

describe('a bare single-star system can take a planet at all', () => {
  it('does not throw "no available orbital slots"', () => {
    // Its ONLY gap runs from the stellar surface to the system limit, and so STRADDLES the CO2 ice
    // line. Both buckets filtered on the line and neither accepted a gap crossing it, so the gap was
    // silently dropped and every attempt threw. Measured: 40 of 40 before, 0 of 40 after.
    expect(() => addPlanetaryBody(bare(1), 'star', 'planet/terrestrial', P)).not.toThrow();
    expect(() => addPlanetaryBody(bare(2), 'star', 'planet/gas-giant', P)).not.toThrow();
  });
});

describe('a created planet appears somewhere a GM would recognise', () => {
  // 60 draws. The thresholds below are set from a 200-draw measurement and left WIDE, because the
  // job is to catch a regression to the old behaviour, not to pin a distribution: measured after
  // the fix, median 1.53 AU, 58% above -60 C, 43% with an atmosphere; measured before, median
  // 72.5 AU, essentially none above -60 C, 15% with an atmosphere.
  const SAMPLE = 60;
  const worlds = Array.from({ length: SAMPLE }, (_, i) => created(i));
  const aus = worlds.map((p) => p.orbit?.elements?.a_AU ?? 0).sort((a, b) => a - b);
  const temps = worlds.map((p) => (p.temperatureK ?? 0) - 273.15).sort((a, b) => a - b);
  const median = (arr: number[]) => arr[Math.floor(arr.length / 2)];

  it('never inside the Roche limit or the kill zone', () => {
    const z = calculateAllStellarZones(STAR, P);
    const floor = Math.max(calculateRocheLimit(STAR), z.killZone);
    for (const a of aus) expect(a).toBeGreaterThanOrEqual(floor * 0.999);
  });

  it('the median lands in the inner system, not the Kuiper belt', () => {
    // Before: median 72.5 AU. The cause was a UNIFORM draw over a gap spanning four decades, which
    // is the wrong measure for a ratio quantity — orbital spacing is geometric everywhere else in
    // this engine, and the pack's own spacing rules are ratios.
    expect(median(aus)).toBeLessThan(8);
    expect(median(aus)).toBeGreaterThan(0.2);
  });

  it('and is not a frozen rock by default — the reported complaint', () => {
    // A FRACTION, not the median: the distribution is legitimately broad (log-uniform over two
    // decades), so the median of a small sample swings while the fraction does not. Before the fix
    // essentially nothing landed above -60 C, because the median orbit was 72 AU.
    const warmish = temps.filter((t) => t > -60).length / temps.length;
    expect(warmish).toBeGreaterThan(0.3);
  });

  it('most of them get an atmosphere, because most of them are born somewhere that has one', () => {
    // A body's air is chosen for the orbit it is generated at; born at 100 AU it correctly gets a
    // vacuum trace, and no amount of dragging afterwards changes that.
    const withAir = worlds.filter((p) => {
      const atm = p.atmosphere as any;
      return atm && atm.name !== 'None' && (atm.pressure_bar ?? 0) > 0.01;
    });
    expect(withAir.length / SAMPLE).toBeGreaterThan(0.25);
  });
});

describe('the type is honoured where the pack says what it wants', () => {
  it('an ICE GIANT, whose fingerprint declares 0-200 K, is born cold', () => {
    // Only 18 of 71 fingerprints declare a temperature range, so this is a refinement and never a
    // requirement — a type that says nothing simply gets the log-uniform draw.
    const t = Array.from({ length: 8 }, (_, i) => created(100 + i, 'planet/ice-giant'))
      .map((p) => p.equilibriumTempK ?? 0);
    for (const teq of t) expect(teq).toBeLessThan(260);
  });

  it('a GAS GIANT still prefers beyond the ice line, as it always did', () => {
    const z = calculateAllStellarZones(STAR, P);
    const a = Array.from({ length: 8 }, (_, i) => created(200 + i, 'planet/gas-giant'))
      .map((p) => p.orbit?.elements?.a_AU ?? 0);
    expect(a.filter((x) => x > z.co2IceLine).length).toBeGreaterThan(a.length / 2);
  });
});
