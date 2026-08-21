// D28: ONE OBJECT, TWO CATALOGUES. A wide directly-imaged companion reaches us twice - the NASA
// Exoplanet Archive files it as a PLANET with a measured mass (Ross 458 c, 6 Mjup, a ~1,100 AU) and
// SIMBAD files it as a STAR with class-typical parameters (BD+13 2618C, T8.5) - and before the merge
// both were emitted: two nodes, two vast crossing orbits, one body. Ross 458 is the fixture the
// inbox row names, built synthetically here so the test does not depend on live catalogue files.
import { describe, expect, it } from 'vitest';
import { convertRegion } from './convert.mjs';

// Ross 458 sits at ~114 ly (plx ~28.5 mas). The companion's separation is ~1,190 AU projected, which
// at that distance is ~36 arcsec: dec offset of 0.01 degrees at plx 28.5 gives that order. The
// numbers below are chosen so projectedSeparationAu(host, companion) lands within 35% of the
// archive's 1,100 AU - the merge's own tolerance - as the real pair does.
const PLX = 28.5;
const starRows = [
  { main_id: 'Ross  458', ra: 195.0, dec: 13.0, plx_value: PLX, sp_type: 'M2V', otype: 'Star' },
  { main_id: 'BD+13 2618C', ra: 195.0, dec: 13.0102, plx_value: PLX, sp_type: 'T8.5p', otype: 'BrownD*' }
];
const planetRows = [{
  pl_name: 'Ross 458 c', hostname: 'Ross 458', ra: 195.0, dec: 13.0, sy_dist: 35.0, sy_snum: 3,
  pl_bmasse: 1907, pl_rade: 14.01, pl_orbsmax: 1168, pl_orbeccen: null, pl_orbper: null,
  st_teff: 3600, st_rad: 0.44, st_mass: 0.49, st_age: null, discoverymethod: 'Imaging'
}];

const region = { centre: { raDeg: 195.0, decDeg: 13.0, distLy: 114.4 }, radiusLy: 5 };
const out = convertRegion({ starRows, planetRows, solPreset: null, statTemplates: null }, { region, generated: 'test' });

describe('a wide companion known to both catalogues is ONE node (D28)', () => {
  const sys = out.systems.find((s: any) => s.system.nodes.some((n: any) => n.name === 'Ross 458 c'));

  it('emits the system with the pair merged: one star, one planet-role companion', () => {
    expect(sys).toBeTruthy();
    const stars = sys!.system.nodes.filter((n: any) => n.roleHint === 'star');
    const planets = sys!.system.nodes.filter((n: any) => n.roleHint === 'planet');
    expect(stars.length).toBe(1);
    expect(planets.length).toBe(1);
  });

  it('keeps the measured mass and says where the other filing went', () => {
    const c = sys!.system.nodes.find((n: any) => n.name === 'Ross 458 c');
    expect(c.massKg).toBeCloseTo(1907 * 5.972e24, -20);
    expect(c.description).toContain('SIMBAD');
    expect(c.description).toContain('T8.5');
    const note = out.skipped.find((s: any) => /same object as Ross 458 c/.test(s.reason));
    expect(note).toBeTruthy();
  });

  it('gives the placeholder eccentricity the thermal draw a wide pair gets, not 0', () => {
    const c = sys!.system.nodes.find((n: any) => n.name === 'Ross 458 c');
    expect(c.orbit.elements.e).toBeGreaterThan(0.04);
    expect(c.orbit.elements.e).toBeLessThan(0.86);
  });

  it('says the archive lists more stars than the census resolved (the missing Ross 458 B)', () => {
    const primary = sys!.system.nodes.find((n: any) => n.roleHint === 'star');
    expect(primary.description).toContain('lists 3 stars');
  });
});
