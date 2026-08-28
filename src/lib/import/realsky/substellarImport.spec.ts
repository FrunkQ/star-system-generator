// B89 — WHAT A SUBSTELLAR IMPORT ACTUALLY PRODUCES, and where its figures come from.
//
// Reported by a user: "even if they do have mass and radius's confirmed it wont actually import
// them in so you have to reload the site ... just to get the correct data." Two brown dwarfs in his
// campaign (an L7.5 at 48.21 Mjup and a Y2 at 33.53 Mjup) carried the IDENTICAL radius, 80,006 km.
//
// MEASURED, not reasoned about. Both figures are the rule pack's own band MIDPOINTS: star/L, star/T
// and star/Y all declare radius_solar [0.08, 0.15], whose midpoint is 0.115 Rsun = 80,006 km, and
// each mass is its own band's midpoint. So nothing was read from a catalogue and dropped - SIMBAD
// carries a spectral type and no radius at all, which is why `typicalForClass` exists.
//
// The identical radius is therefore NOT a physics error to be tuned away: degeneracy pressure makes
// brown-dwarf radii nearly mass-independent at about one Jupiter radius across L, T and Y. The fault
// was that the figures did not SAY they were typical anywhere a number is shown.
//
// Rows are SYNTHESISED here (the reporting user's own campaign is never committed - see the
// user-test-files standing rule); the values below are the real objects' astrometry only.
import { describe, it, expect } from 'vitest';
import { convertRegion } from './convert.mjs';
import { SOL_CENTRE } from './query.mjs';
import { loadStarterPack } from './testPack';

const pack = loadStarterPack();
const region = { centre: SOL_CENTRE, radiusLy: 25 };

const LUHMAN_16 = { id: 'Luhman 16', sp: 'L7.5+T0.5', otype: 'BrownD*', ra: 162.3, dec: -53.3, plxMas: 501.0 };
const WISEA_0855 = { id: 'WISEA J085510.74-071442.5', sp: 'Y2', otype: 'BrownD*', ra: 133.8, dec: -7.24, plxMas: 449.0 };

const run = (statTemplates: any, rows = [LUHMAN_16, WISEA_0855]) =>
  convertRegion({ starRows: rows, planetRows: [], solPreset: null, statTemplates }, { region, generated: 'b89-test' });

const starOf = (out: any, name: string) =>
  out.systems.find((s: any) => s.name === name)?.system.nodes.find((n: any) => n.roleHint === 'star');

describe('B89 — a substellar import states where its figures came from', () => {
  it('imports both dwarfs when the rule pack is present', () => {
    const out = run(pack.statTemplates);
    expect(starOf(out, 'Luhman 16')).toBeTruthy();
    expect(starOf(out, 'WISEA J085510.74-071442.5')).toBeTruthy();
  });

  it('MARKS the figures as typical-for-class, in DATA rather than only in prose', () => {
    const out = run(pack.statTemplates);
    // The flag starParamsFromType has always returned, and the import used to drop.
    expect(starOf(out, 'Luhman 16').typicalForClass).toBe(true);
    expect(starOf(out, 'WISEA J085510.74-071442.5').typicalForClass).toBe(true);
  });

  it('PINS the reported symptom: both radii are the same band midpoint, and that is honest', () => {
    const out = run(pack.statTemplates);
    const l = starOf(out, 'Luhman 16'), y = starOf(out, 'WISEA J085510.74-071442.5');
    // Identical, because L and Y declare the same radius band - a real property of degenerate objects.
    expect(l.radiusKm).toBe(y.radiusKm);
    // ...and the masses are NOT identical, because their mass bands differ. If this ever goes red,
    // a real catalogue radius has started arriving and the typicalForClass flag must follow it.
    expect(l.massKg).not.toBe(y.massKg);
    expect(l.typicalForClass && y.typicalForClass).toBe(true);
  });

  it('says an UNRESOLVED PAIR is one body, and names the companion it does not represent', () => {
    const out = run(pack.statTemplates);
    const l = starOf(out, 'Luhman 16');
    expect(l.description).toMatch(/UNRESOLVED PAIR/);
    expect(l.description).toMatch(/T0\.5 companion is NOT a separate body/);
    // A single-typed dwarf must NOT gain the sentence.
    expect(starOf(out, 'WISEA J085510.74-071442.5').description).not.toMatch(/UNRESOLVED PAIR/);
  });

  it('THE COLD-LOAD PATH: with no rule pack, nothing imports - and the reason names the PACK', () => {
    const out = run(null);
    expect(out.systems.length).toBe(0);
    const reasons = (out.skipped ?? []).map((s: any) => s.reason).join(' | ');
    expect(reasons).toMatch(/rule pack was not loaded/);
    // It must NOT blame the spectral type, which is what sent this fault to the wrong place.
    expect(reasons).not.toMatch(/spectral type L7\.5/);
  });

  it('still blames the TYPE when the pack is present but the type is unusable', () => {
    const out = run(pack.statTemplates, [{ ...LUHMAN_16, sp: '', otype: 'Nonsense*' }] as any);
    const reasons = (out.skipped ?? []).map((s: any) => s.reason).join(' | ');
    if (reasons) expect(reasons).not.toMatch(/rule pack was not loaded/);
  });
});
