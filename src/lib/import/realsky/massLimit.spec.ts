// AN UPPER LIMIT ON A MASS IS NOT A MASS (the Kepler-32 f report, 2026-09-24: "i dont think the
// mass for kepler 32f is right", on an import from the sky).
//
// Kepler-32 f is a 0.82 Earth-radius world. The NASA Exoplanet Archive publishes no measured mass
// for it, only upper limits - "< 969.228 Earth masses" (3.05 Jupiters) on its Kepler-32 overview
// page - and the composite table carries a limit in the same `pl_bmasse` column as a measurement,
// told apart only by `pl_bmasselim`. The importer never asked for that flag, so "lighter than three
// Jupiters" arrived as three Jupiters inside a body smaller than Venus.
//
// THE ROW BELOW IS SYNTHESISED, NOT CAPTURED: the archive cannot be reached from a worker session
// (DATA-R44 - nothing in this suite runs a query). The two figures that matter, the 969.228 limit
// and the 0.82 radius, are the archive's own published values; the rest is plausible filler. What
// the live composite row holds for this planet is the one thing still to be seen in a browser.
//
// TWO GATES, because the fault was in the FETCH as much as the transform: the query must ASK for
// the flag (a transform test alone would pass with the column missing), and the transform must act
// on it.
import { describe, expect, it } from 'vitest';
import { convertArchiveRows, convertRegion } from './convert.mjs';
import { ARCHIVE_COLUMNS, archivePlanetsAdql, SOL_CENTRE } from './query.mjs';
import { estimateMassMe, estimateRadiusRe, planetMassFromRow, MASS_SOURCE } from './planets.mjs';
import { EARTH_MASS_KG, EARTH_RADIUS_KM, LY_PER_PC } from './constants.mjs';

const host = {
  hostname: 'Kepler-32', sy_dist: 323.0, ra: 297.8327, dec: 46.5731,
  st_spectype: 'M1 V', st_teff: 3900, st_rad: 0.53, st_mass: 0.58, st_lum: -1.2, st_age: null,
  discoverymethod: 'Transit', disc_year: 2012, cb_flag: 0, sy_snum: 1
};
const planetF = {
  ...host, pl_name: 'Kepler-32 f', pl_orbper: 0.74296, pl_orbsmax: 0.013, pl_orbeccen: 0,
  pl_bmasse: 969.228, pl_bmasselim: 1, pl_bmassprov: 'Mass', pl_rade: 0.82, pl_dens: 9670
};
const region = { centre: { raDeg: host.ra, decDeg: host.dec, distLy: host.sy_dist * LY_PER_PC }, radiusLy: 10 };

// The converter is plain untyped ESM (DATA-R5), so its results are read as `any` here.
const importOne = (row: any): any => {
  const out: any = (convertArchiveRows as any)([row], { region, generated: 'mass-limit-test' });
  return out.systems[0].system.nodes.find((n: any) => n.roleHint === 'planet');
};

describe('the archive query asks whether a mass is a value or a limit', () => {
  it('selects pl_bmasselim beside pl_bmasse', () => {
    expect(ARCHIVE_COLUMNS).toContain('pl_bmasselim');
    expect(archivePlanetsAdql({ centre: SOL_CENTRE, radiusLy: 10 })).toMatch(/pl_bmasse,.*pl_bmasselim/);
  });
});

describe('an upper limit is never imported as the mass', () => {
  it('KEPLER-32 f arrives as a sub-Earth, not as three Jupiters', () => {
    const f = importOne(planetF);
    const massMe = f.massKg / EARTH_MASS_KG;
    // Absolute, not a ratio: the fault was 969 Earth masses. A 0.82 Earth-radius rocky world is
    // about half an Earth mass.
    expect(massMe).toBeGreaterThan(0.3);
    expect(massMe).toBeLessThan(0.7);
    // The measured radius is kept exactly - it was never the problem.
    expect(f.radiusKm).toBe(Math.round(0.82 * EARTH_RADIUS_KM));
  });

  it('...is rock, because a density computed FROM the limit is not evidence', () => {
    const f = importOne(planetF);
    expect(f.makeup.gas ?? 0).toBe(0);
    // 9,670 g/cc is the limit divided by the volume. Believed, it reads as an iron world.
    expect(f.makeup.metal).toBeLessThanOrEqual(0.30);
  });

  it('...and says so: the limit is quoted as a limit and the figure as an estimate', () => {
    const f = importOne(planetF);
    expect(f.description).toMatch(/NOT MEASURED/);
    expect(f.description).toMatch(/upper limit \(under 3\.05 Jupiter masses\)/);
    expect(f.description).toMatch(/estimated from its measured radius/);
    expect(f.description).not.toMatch(/^.*\bMass 3\.05 Jupiter masses\./);
  });

  it('the stars-first path (the one the dialogue uses) agrees', () => {
    const star = { main_id: 'Kepler-32', ra: host.ra, dec: host.dec, plx_value: 1000 / host.sy_dist, sp_type: 'M1V', otype: 'PM*' };
    const out: any = (convertRegion as any)(
      { starRows: [star], planetRows: [planetF], solPreset: null, statTemplates: null },
      { region, generated: 'mass-limit-test' }
    );
    const f = out.systems[0].system.nodes.find((n: any) => n.roleHint === 'planet');
    expect(f.massKg / EARTH_MASS_KG).toBeLessThan(0.7);
  });

  it('the estimate never exceeds the limit it replaces', () => {
    // A tight limit on a big radius: the relation would say ~98 Earth masses, the study says < 20.
    const mass = planetMassFromRow({ pl_bmasse: 20, pl_bmasselim: 1, pl_rade: 11 });
    expect(mass.source).toBe(MASS_SOURCE.FROM_RADIUS);
    expect(mass.massMe).toBe(20);
  });

  it('with no measured radius the limit stays as the figure, and is CALLED a limit', () => {
    // Nothing else is known, and the planet is confirmed - so it is kept, honestly labelled.
    const row = { ...planetF, pl_name: 'Kepler-32 x', pl_rade: null, pl_dens: null, pl_bmasse: 40 };
    const p = importOne(row);
    expect(p.massKg / EARTH_MASS_KG).toBeCloseTo(40, 6);
    expect(p.description).toMatch(/no more than 40 Earth masses: an UPPER LIMIT/);
    // A radius the archive back-filled from the limit itself is the limit a second time.
    const backFilled = planetMassFromRow({ pl_bmasse: 40, pl_bmasselim: 1, pl_rade: estimateRadiusRe(40) });
    expect(backFilled.source).toBe(MASS_SOURCE.UPPER_LIMIT);
  });
});

describe('a row that is not an upper limit is read exactly as before', () => {
  it.each([
    ['no flag at all (the committed cache and the bundled snapshot)', {}],
    ['flag 0, a value', { pl_bmasselim: 0 }],
    ['flag -1, a LOWER limit, which is what a minimum mass already is', { pl_bmasselim: -1 }]
  ])('%s', (_label, flag) => {
    const row = { ...planetF, pl_bmasse: 4.2, pl_dens: 5.1, ...flag };
    if (!('pl_bmasselim' in flag)) delete (row as any).pl_bmasselim;
    const p = importOne(row);
    expect(p.massKg / EARTH_MASS_KG).toBeCloseTo(4.2, 6);
    expect(p.description).toMatch(/Mass 4\.2 Earth masses\./);
    expect(planetMassFromRow(row).densityGcc).toBe(5.1);
  });
});

describe('the inverse mass-radius relation', () => {
  it('undoes estimateRadiusRe on both rocky branches', () => {
    for (const m of [0.1, 0.477, 1, 2, 3, 10, 50, 90]) {
      expect(estimateMassMe(estimateRadiusRe(m))!, `${m} Me`).toBeCloseTo(m, 6);
    }
  });

  it('is within a tenth of a per cent at the join, where the forward relation itself steps', () => {
    // The two published branches do not quite meet at 2.04 Earth masses (1.2298 against 1.2296
    // Earth radii), so no inverse can be exact there.
    expect(Math.abs(estimateMassMe(estimateRadiusRe(2.04))! - 2.04) / 2.04).toBeLessThan(0.001);
  });

  it('answers a giant-sized radius with the mass at which the plateau begins', () => {
    const plateau = estimateMassMe(12)!;
    expect(plateau).toBeGreaterThan(90);
    expect(plateau).toBeLessThan(105);
    expect(estimateMassMe(14)).toBe(plateau);
  });

  it('has nothing to say about no radius', () => {
    expect(estimateMassMe(null as any)).toBeNull();
    expect(estimateMassMe(0)).toBeNull();
  });
});
