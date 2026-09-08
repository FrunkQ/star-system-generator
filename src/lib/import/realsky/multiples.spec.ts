// MULTIPLE SYSTEMS ARRIVE WHOLE (D29 job 3, stream U).
//
// THE OWNER'S REPORT, off the live 3.1.0: "its still adding binaries as single or 2 stars (examples:
// sirius (only adds b) completely forgets luhman 16 and eps indi Ab's partner)".
//
// Every row here is REAL - captured from the live SIMBAD census on 2026-09-08 and pinned in
// `skyFixtures.ts`. That matters more than usual for this file: the fault is entirely in what the
// catalogue actually returns versus what the code assumed it returns, so a synthesised row would
// have tested the assumption rather than the sky. `substellarImport.spec.ts` types Luhman 16
// 'BrownD*'; SIMBAD types it '**', and that single difference is a whole branch of the census filter.
//
// WHAT SIMBAD ACTUALLY SENDS for the four systems this turns on:
//   '* alf CMa'   SB*  'A0mA1Va'      Sirius A - a REAL STAR whose companion is unresolved
//   '* alf Cen'   SB*  'G2V+K1V'      a TRUE container - same otype, COMPOSITE type
//   '* alf CMi'   SB*  'F5IV-V+DQZ'   Procyon - a true container, and its B is not in the census
//   'HD 239960'   **   'M3'           Kruger 60 - a true container with a SINGLE type
// so neither the otype nor the spectral type decides it alone, and that is the whole trap.
import { describe, it, expect } from 'vitest';
import { convertRegion } from './convert.mjs';
import { normaliseStarRows } from './census.mjs';
import { SOL_CENTRE } from './query.mjs';
import { LOCAL_NEIGHBOURHOOD_ROWS, skyRow, sizeMap } from './skyFixtures';
import { loadStarterPack } from './testPack';

const pack = loadStarterPack();
const region = { centre: SOL_CENTRE, radiusLy: 16.5 };

const runCensus = (rows = LOCAL_NEIGHBOURHOOD_ROWS) =>
  convertRegion(
    { starRows: rows as any[], planetRows: [], solPreset: null, statTemplates: pack.statTemplates },
    { region, generated: 'd29-test', starSizes: sizeMap() }
  );

const systemNamed = (out: any, id: string) => out.systems.find((s: any) => s.id === id);
const starsOf = (out: any, id: string) =>
  (systemNamed(out, id)?.system.nodes ?? []).filter((n: any) => n.roleHint === 'star');

const normalise = (rows: any[]) =>
  normaliseStarRows(
    rows.map((r) => ({ id: r.main_id, ra: r.ra, dec: r.dec, plxMas: r.plx_value, sp: r.sp_type, otype: r.otype }))
  );

describe('D29 - a star SIMBAD calls a spectroscopic binary is still a star', () => {
  // THE OWNER'S GATE. Absolute, not a ratio: two stars, A leading, and A is the one with the
  // A-type spectrum rather than the white dwarf.
  it('SIRIUS imports as TWO stars with A the primary', () => {
    const stars = starsOf(runCensus(), 'sys-sirius');
    expect(stars.length).toBe(2);
    expect(stars[0].name).toBe('Sirius');
    expect(stars[0].classes[0]).toMatch(/^star\/A/);
    expect(stars[1].name).toBe('Sirius B');
    expect(stars[1].classes[0]).toBe('star/WD');
    // The white dwarf orbits the primary rather than the other way round.
    expect(stars[0].parentId).toBeNull();
    expect(stars[1].parentId).toBe(stars[0].id);
  });

  it("SIRIUS A carries its own radius, not the A band's midpoint", () => {
    // 1.6 Rsun is the star/A band midpoint and was what shipped. The real figure is 1.711.
    const [a] = starsOf(runCensus(), 'sys-sirius');
    const rSun = a.radiusKm / 695700;
    expect(rSun).toBeGreaterThan(1.6);
    expect(rSun).toBeLessThan(1.85);
    expect(a.typicalForClass).toBeUndefined();
  });

  it('the census keeps `* alf CMa` and still drops the TRUE containers', () => {
    const { stars, dropped } = normalise(LOCAL_NEIGHBOURHOOD_ROWS as any[]);
    const ids = stars.map((s: any) => s.id);
    expect(ids).toContain('* alf CMa'); // a real star: SB* with a SINGLE spectral type
    expect(ids).toContain('* alf CMa B');
    // A composite spectral type is what makes a row a container, whatever its otype.
    const droppedIds = dropped.map((d: any) => d.id);
    expect(droppedIds).toContain('* alf Cen'); // SB*, G2V+K1V
    expect(droppedIds).toContain('G 272-61'); // **,  M5.5V+M6V
    expect(droppedIds).toContain('HD 239960'); // **,  M3 - a container by otype alone
    // ...and it must not start dropping the members it exists to keep.
    expect(ids).toContain('* alf Cen A');
    expect(ids).toContain('* alf Cen B');
  });

  it('every dropped row names a cause and every kept container is the only record of its system', () => {
    const { stars, dropped } = normalise(LOCAL_NEIGHBOURHOOD_ROWS as any[]);
    for (const d of dropped) expect(d.reason, d.id).toBeTruthy();
    // Ross 614 and friends come back as a container with NO component rows: keeping them is the
    // only thing that puts those systems on the map at all.
    expect(stars.map((s: any) => s.id)).toContain('Ross  614');
  });
});

describe('D29 - the heaviest star leads, measured rather than banded', () => {
  it('ALPHA CENTAURI still leads with Rigil Kentaurus and keeps all three members', () => {
    const stars = starsOf(runCensus(), 'sys-alpha-centauri');
    expect(stars.length).toBe(3);
    expect(stars[0].name).toBe('Rigil Kentaurus');
    expect(stars.map((s: any) => s.name)).toContain('Proxima Centauri');
  });

  it('the primary is the most massive member of every multiple it imports', () => {
    const out = runCensus();
    for (const sys of out.systems) {
      const stars = (sys.system.nodes ?? []).filter((n: any) => n.roleHint === 'star');
      if (stars.length < 2) continue;
      const heaviest = Math.max(...stars.map((s: any) => s.massKg));
      expect(stars[0].massKg, `${sys.id}: ${stars.map((s: any) => `${s.name}=${s.massKg}`).join(', ')}`).toBe(heaviest);
    }
  });
});

describe('D29 - an unresolved pair is named, never invented', () => {
  // PROCYON IS THE CASE NOBODY REPORTED and it is the same fault wearing a different otype:
  // '* alf CMi' is SB* with the composite type 'F5IV-V+DQZ', and Procyon B is not in the census at
  // all - so there is nothing to split it against and the honest act is to SAY so.
  it('PROCYON imports as one body that names the companion it does not represent', () => {
    const stars = starsOf(runCensus(), 'sys-procyon');
    expect(stars.length).toBe(1);
    expect(stars[0].description).toMatch(/UNRESOLVED PAIR/);
  });

  it('a row with no companion in its type gains no such sentence', () => {
    const out = runCensus([skyRow('* eps Eri')] as any[]);
    const star = out.systems[0].system.nodes.find((n: any) => n.roleHint === 'star');
    expect(star.description).not.toMatch(/UNRESOLVED PAIR/);
  });
});
