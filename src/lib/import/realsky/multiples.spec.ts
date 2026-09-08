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
import { SOL_CENTRE, simbadComponentsOfAdql } from './query.mjs';
import { LOCAL_NEIGHBOURHOOD_ROWS, skyRow, sizeMap, H_LINK_CHILDREN } from './skyFixtures';
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

describe('D29 - a container whose members have no parallax of their own', () => {
  // "completely forgets luhman 16". It was never forgotten - it arrived as ONE body, because
  // `NAME Luhman 16` is a single row typed `L7.5+T0.5` and its components are not in the census.
  // They ARE in SIMBAD's h_link, with positions, spectral types and NO PARALLAX - which is exactly
  // why every star query, all of which carry `plx_value > 0`, could never return them.
  // `loadContainerComponents` fetches them and gives them the PARENT'S parallax; from there the
  // census needs no help at all, because the container is now a container with components present.
  const withComponents = () => [
    ...LOCAL_NEIGHBOURHOOD_ROWS,
    ...H_LINK_CHILDREN['NAME Luhman 16'].map((c) => ({ ...c, plx_value: skyRow('NAME Luhman 16').plx_value }))
  ];

  it('LUHMAN 16 imports as a PAIR once its members are recovered', () => {
    const stars = starsOf(runCensus(withComponents() as any[]), 'sys-luhman-16');
    expect(stars.length).toBe(2);
    expect(stars.map((s: any) => s.name)).toEqual(['Luhman 16A', 'Luhman 16B']);
    expect(stars[0].classes[0]).toBe('star/L7.5');
    expect(stars[1].classes[0]).toBe('star/T0.5');
  });

  it('...orbiting each other on their REAL projected separation, not an invented one', () => {
    const [, b] = starsOf(runCensus(withComponents() as any[]), 'sys-luhman-16');
    // 0.92 arcsec at 6.5 ly. The true pair is a 27-year eccentric orbit of about 3.5 AU, so a
    // projected separation of a couple of AU is the honest present-day figure.
    expect(b.orbit.elements.a_AU).toBeGreaterThan(1);
    expect(b.orbit.elements.a_AU).toBeLessThan(4);
  });

  it('THE SYSTEM IS CALLED LUHMAN 16, not Luhman 16A', () => {
    const out = runCensus(withComponents() as any[]);
    const sys = systemNamed(out, 'sys-luhman-16');
    expect(sys).toBeTruthy();
    expect(sys.name).toBe('Luhman 16');
    // The container row itself must be gone - it is the same object as its two members.
    expect(out.systems.some((x: any) => x.id === 'sys-luhman-16a')).toBe(false);
  });

  it('the container row is dropped with a reason naming the members that replaced it', () => {
    const out = runCensus(withComponents() as any[]);
    const reason = out.skipped.find((s: any) => s.hostname === 'NAME Luhman 16')?.reason ?? '';
    expect(reason).toMatch(/components present/);
    expect(reason).toMatch(/Luhman 16A/);
  });

  it('both members keep their class-band size, because degeneracy is the honest answer', () => {
    // DATA-R24: an L and a T dwarf really do share a radius. What was wrong was the silence.
    const stars = starsOf(runCensus(withComponents() as any[]), 'sys-luhman-16');
    expect(stars[0].radiusKm).toBe(stars[1].radiusKm);
    expect(stars[0].typicalForClass).toBe(true);
    expect(stars[0].description).toMatch(/TYPICAL FOR ITS/);
    // ...and neither is still described as an unresolved pair, because they are now resolved.
    for (const s of stars) expect(s.description).not.toMatch(/UNRESOLVED PAIR/);
  });
});

describe('D29 - the component fetch must not silently truncate', () => {
  // A BUG I SHIPPED AND THE BROWSER CAUGHT, WHICH IS WHY THIS TEST EXISTS. The row limit was a flat
  // `top 40`, which is ample for the 16.5 ly census this file's fixtures come from - NINE containers
  // - and the import dialogue fetches at 41 ly, where there are SIXTY-SEVEN. It came back with
  // exactly 40 children, Luhman 16's were not among them, and every test here still passed because
  // they feed the transform directly. A limit that is fine for the fixture and wrong for the app is
  // invisible to a fixture-driven suite, so the limit itself is now the thing under test.
  const limitOf = (n: number) => Number(/top (\d+)/.exec(simbadComponentsOfAdql(Array(n).fill('x')))![1]);

  it('asks for enough rows to cover every container it names', () => {
    for (const n of [1, 9, 67, 100]) {
      // Six per container is well clear of any real multiple; the point is that it SCALES.
      expect(limitOf(n), `${n} containers`).toBeGreaterThanOrEqual(n * 6);
    }
  });

  it('the 41 ly case that actually broke asks for more than 40', () => {
    expect(limitOf(67)).toBeGreaterThan(40);
  });

  it('is still bounded, so a pathological region cannot ask for the whole table', () => {
    expect(limitOf(10000)).toBeLessThanOrEqual(600);
  });

  it('names every parent it was given', () => {
    const adql = simbadComponentsOfAdql(['NAME Luhman 16', "G 272-61"]);
    expect(adql).toContain("'NAME Luhman 16'");
    expect(adql).toContain("'G 272-61'");
    // ...and the plx_value > 0 clause must NOT be here - it is the whole reason this query exists.
    expect(adql).not.toMatch(/plx_value\s*>/);
  });
});
