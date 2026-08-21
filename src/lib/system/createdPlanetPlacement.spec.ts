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
// A FRESH STAR PER DRAW, and this is not tidiness — it was a real, order-dependent flake.
//
// `systemProcessor.process` MUTATES the bodies it is given: measured, the shared STAR went from 13
// keys to 21 and gained `flareActivity` 0.0518 on the first pass. B81's kill zone READS
// `flareActivity`, so the zone moved 0.08998 -> 0.09995 AU, an 11% jump, the moment any draw was
// processed. Every later draw was then placed against the bigger floor while the assertion judged
// them all against whichever value STAR happened to hold at the end — so an early body placed at
// 0.0905 failed a floor of 0.09995 that did not exist when it was placed. It passed in isolation and
// failed under the full suite, which is the signature of exactly this.
//
// The engine itself is consistent (generation always sees an unprocessed star, and `process` is
// idempotent from pass 1); it is only a fixture that mixes the two states that can disagree.
const freshStar = (): CelestialBody => JSON.parse(JSON.stringify(STAR));
// The seed varies per draw on purpose: addPlanetaryBody seeds from sys.seed + Date.now(), so a tight
// loop would otherwise share one seed (engine map M5) and every "sample" would be the same draw.
const bare = (i: number): System =>
  ({ id: 's', name: 's', seed: 'b84-' + i, epochT0: 0, age_Gyr: 4.6, nodes: [freshStar()] } as any);
/** The zones as PLACEMENT saw them: from an unprocessed star, which is the state it is handed. */
const placementZones = () => calculateAllStellarZones(freshStar(), P);

// The body the star gained. NOT `find(n => n.id !== 'star')`: the generator can return moons and can
// re-type what it built, so the first non-star node is not reliably the thing under test.
const created = (i: number, type = 'planet/terrestrial') => {
  const sys = addPlanetaryBody(bare(i), 'star', type, P);
  const out = systemProcessor.process(sys, P);
  return (out.nodes.find((n) => n.parentId === 'star' && n.id !== 'star')
    ?? out.nodes.find((n) => n.id !== 'star')) as CelestialBody;
};

/** Migration moves a body AFTER placement, on purpose. See the gas-giant case at the foot of this file. */
const migrated = (b: CelestialBody) => (b.tags ?? []).some((t) => t.key === 'origin/migrated');

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

  it('is never PLACED inside the Roche limit or the kill zone', () => {
    // PLACED, and the word is load-bearing. This asserted the final orbit and flaked under the full
    // suite — rarely, and never in fourteen isolated runs, which is exactly the signature of a
    // stochastic generator sampled through a correlated seed (`sys.seed + Date.now()`, engine map
    // M5: consecutive seeds in a tight loop are neighbouring strings, so a small sample explores a
    // narrow region and a rare case hides). Chasing a bigger sample would only move the odds.
    //
    // What `addPlanetaryBody` actually guarantees is the PLACEMENT: the chosen orbit lies inside a
    // gap whose lower bound is the floor. What happens next is the generator's business — migration
    // deliberately moves a body inward after placement — so the exact rule is "unless it migrated",
    // and an exact rule cannot flake.
    const z = placementZones();
    const floor = Math.max(calculateRocheLimit(freshStar()), z.killZone);
    for (const w of worlds) {
      if (migrated(w)) continue;
      expect(w.orbit?.elements?.a_AU ?? 0, `${w.name} was placed inside the floor`)
        .toBeGreaterThanOrEqual(floor * 0.999);
    }
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

  it('a GAS GIANT is placed beyond the ice line unless it was MIGRATED there', () => {
    // THIS ASSERTION WAS STATISTICAL AND IT FLAKED — 1 run in 6, because it took a majority over
    // eight samples. Measured over 150 draws to find out why: 85% land beyond the line, and the 22
    // that do not are EXACTLY the 22 tagged `origin/generated`'s neighbour, `origin/migrated`. Zero
    // counterexamples. So the placement rule is exact and the apparent noise was a real, deliberate
    // downstream behaviour — hot-Jupiter migration (`planet_migration_chance`) — being counted as a
    // failure. Assert the exact rule instead, and it cannot flake.
    //
    // The other confounder the same measurement turned up, and the reason this reads roleHint: about
    // one request in five for a `planet/gas-giant` comes back as a BELT, because the generator
    // re-types what it built. That is not this item's business, but a test that assumed otherwise
    // would fail for a reason nothing to do with placement.
    const z = placementZones();
    for (let i = 0; i < 12; i++) {
      const b = created(200 + i, 'planet/gas-giant');
      if (b.roleHint !== 'planet') continue;                              // re-typed to a belt
      if (migrated(b)) continue;                                           // moved in on purpose
      expect(b.orbit?.elements?.a_AU ?? 0, `sample ${i} landed inside the ice line unmigrated`)
        .toBeGreaterThan(z.co2IceLine);
    }
  });
});
