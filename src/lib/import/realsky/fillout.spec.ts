// Real-sky import — fill-out tests. The three promises under test are the
// ones the dialogue makes: anchors survive untouched, generated worlds are
// tagged and deterministic (one person's Polaris is everyone's), and nothing
// generated lands inside an anchor's dynamical exclusion zone.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CelestialBody } from '$lib/types';
import { SOL_CENTRE } from './query.mjs';
import { convertArchiveRows, convertRegion } from './convert.mjs';
import { EPOCH } from './constants.mjs';
import { GENERATED_TAG, fillOutSystem, fillOutImported } from './fillout';
import { loadStarterPack } from './testPack';
import { parallaxMasToLy } from './positions.mjs';
import { fillOutCaution, BUNDLED_CACHE_MAX_LY } from './catalogue.mjs';
import { systemProcessor } from '$lib/core/SystemProcessor';
import { fixUpImportedSystem } from '$lib/system/importFixup';

const repo = resolve(__dirname, '..', '..', '..', '..');
const cache = JSON.parse(readFileSync(join(repo, 'scripts', 'starmap-build', 'data', 'cache', 'archive-pscomppars.json'), 'utf-8'));

const rulePack = loadStarterPack();
const freshSystem = (name: string) => {
  const { systems } = convertArchiveRows(cache, { region: { centre: SOL_CENTRE, radiusLy: 30 }, generated: 'test' });
  const hit = systems.find((s: any) => s.name === name);
  if (!hit) throw new Error(`${name} not in converted set`);
  return structuredClone(hit.system);
};

describe('fillOutSystem', () => {
  it('keeps every confirmed anchor byte-identical and only ADDS nodes', () => {
    const sys = freshSystem('GJ 581');
    const before = structuredClone(sys.nodes);
    fillOutSystem(sys, rulePack);
    for (const orig of before) {
      expect(sys.nodes.find((n: any) => n.id === orig.id)).toEqual(orig);
    }
    expect(sys.nodes.length).toBeGreaterThanOrEqual(before.length);
  });

  it('tags every added node origin/generated, pins t0 to the epoch, and reports honestly', () => {
    const sys = freshSystem('HD 219134');
    const beforeIds = new Set(sys.nodes.map((n: any) => n.id));
    const report = fillOutSystem(sys, rulePack);
    const added = sys.nodes.filter((n: any) => !beforeIds.has(n.id)) as CelestialBody[];
    expect(added.length).toBe(report.addedPlanets + report.addedMoons + added.filter((n) => !['planet', 'moon'].includes(n.roleHint as string)).length);
    for (const n of added) {
      expect((n.tags ?? []).some((t) => t.key === GENERATED_TAG), `${n.id} tagged`).toBe(true);
      if (n.orbit) expect(n.orbit.t0, `${n.id} t0`).toBe(EPOCH);
    }
    // Confirmed planets stay untagged — a measured world must never read as a guess.
    for (const n of sys.nodes.filter((x: any) => beforeIds.has(x.id))) {
      expect(((n as CelestialBody).tags ?? []).some((t) => t.key === GENERATED_TAG)).toBe(false);
    }
  });

  it('is DETERMINISTIC: two independent fill-outs of the same star agree exactly', () => {
    const a = freshSystem('GJ 581');
    const b = freshSystem('GJ 581');
    fillOutSystem(a, rulePack);
    fillOutSystem(b, rulePack);
    expect(a.nodes.map((n: any) => n.id)).toEqual(b.nodes.map((n: any) => n.id));
    expect(a).toEqual(b);
  });

  it('respects the anchors dynamically: no generated planet within 3.5 mutual Hill radii', () => {
    const sys = freshSystem('GJ 581');
    const star = sys.nodes.find((n: any) => n.roleHint === 'star') as CelestialBody;
    const beforeIds = new Set(sys.nodes.map((n: any) => n.id));
    fillOutSystem(sys, rulePack);
    const anchors = sys.nodes.filter((n: any) => n.roleHint === 'planet' && beforeIds.has(n.id)) as CelestialBody[];
    const generated = sys.nodes.filter((n: any) => n.roleHint === 'planet' && !beforeIds.has(n.id)) as CelestialBody[];
    for (const g of generated) {
      for (const anchor of anchors) {
        const aG = g.orbit!.elements.a_AU, aC = anchor.orbit!.elements.a_AU;
        const rh = Math.cbrt(((g.massKg ?? 0) + (anchor.massKg ?? 0)) / (3 * star.massKg!)) * ((aG + aC) / 2);
        expect(Math.abs(aG - aC), `${g.id} vs ${anchor.id}`).toBeGreaterThanOrEqual(3.5 * rh);
      }
    }
  });

  it('names generated planets with the letters the catalogue has not used', () => {
    const sys = freshSystem('GJ 581'); // confirmed: b, c, e
    const beforeIds = new Set(sys.nodes.map((n: any) => n.id));
    fillOutSystem(sys, rulePack);
    const genNames = sys.nodes
      .filter((n: any) => n.roleHint === 'planet' && !beforeIds.has(n.id))
      .map((n: any) => n.name.split(/\s+/).pop());
    const confirmedLetters = ['b', 'c', 'e'];
    for (const g of genNames) expect(confirmedLetters).not.toContain(g);
  });
});

// "when i imported chalawan from the sky with the generator it didnt actually add any of the
// existing planets and just made the generated ones insted" (a user, 2026-09-25).
//
// Chalawan is 47 Ursae Majoris: three confirmed giants, 45 light years out. The rows below are
// SYNTHESISED from its published figures - the catalogues cannot be reached from a worker session
// (DATA-R44) - and they go through the path the dialogue actually uses: the star census, the
// archive joined on by position, the fill-out, then the app's real load path.
//
// WHAT THIS PINS, AND WHAT IT CANNOT. Given the archive's rows, all three known planets survive
// the generator untouched and the invented worlds are added AROUND them. So the transform is not
// where the report comes from, and this block never went red on that point. The only way the code
// can produce "generated planets only" is the archive rows not arriving at all - and 47 UMa lies
// just outside the bundled snapshot's 41 light years, so any failed archive fetch degrades exactly
// this star to bare. That is a fault at the fetch, which no test here can see.
describe('a real star with known planets, filled out (47 Ursae Majoris)', () => {
  const star = { main_id: '* 47 UMa', ra: 164.86655, dec: 40.43026, plx_value: 72.0, sp_type: 'G1-VFe-0.5', otype: 'PM*' };
  const host = {
    hostname: '47 UMa', sy_dist: 13.8, ra: 164.8649, dec: 40.4302, st_spectype: 'G1 V', st_teff: 5872,
    st_rad: 1.21, st_mass: 1.06, st_lum: 0.19, st_age: 6.0, sy_snum: 1, discoverymethod: 'Radial Velocity', cb_flag: 0
  };
  const known = [
    { ...host, pl_name: '47 UMa b', pl_orbper: 1078, pl_orbsmax: 2.1, pl_orbeccen: 0.032, pl_bmasse: 804.08, pl_bmassprov: 'Msini', pl_rade: 13.2, pl_dens: 1.9, disc_year: 1996 },
    { ...host, pl_name: '47 UMa c', pl_orbper: 2391, pl_orbsmax: 3.6, pl_orbeccen: 0.098, pl_bmasse: 171.6, pl_bmassprov: 'Msini', pl_rade: 14.1, pl_dens: 0.33, disc_year: 2001 },
    { ...host, pl_name: '47 UMa d', pl_orbper: 14002, pl_orbsmax: 11.6, pl_orbeccen: 0.16, pl_bmasse: 521.2, pl_bmassprov: 'Msini', pl_rade: 13.5, pl_dens: 1.16, disc_year: 2010 }
  ];
  const centre = { raDeg: star.ra, decDeg: star.dec, distLy: parallaxMasToLy(star.plx_value) };
  const chalawan = (planetRows: any[] = known) => {
    const out = convertRegion(
      { starRows: [star], planetRows, solPreset: null, statTemplates: (rulePack as any).statTemplates },
      { region: { centre, radiusLy: 4 }, generated: 'test' }
    );
    return structuredClone(out.systems[0].system);
  };
  const planetsOf = (sys: any) => sys.nodes.filter((n: any) => n.roleHint === 'planet');
  const isGenerated = (n: any) => (n.tags ?? []).some((t: any) => t.key === GENERATED_TAG);

  it('keeps all three known planets through the generator AND the load path', () => {
    const sys = chalawan();
    const before = structuredClone(planetsOf(sys));
    expect(before.map((p: any) => p.name)).toEqual(['47 UMa b', '47 UMa c', '47 UMa d']);
    const report = fillOutSystem(sys, rulePack);
    expect(report.addedPlanets, 'the generator did add something, or this proves nothing').toBeGreaterThan(0);
    const loaded = systemProcessor.process(fixUpImportedSystem(sys, rulePack), rulePack);
    for (const orig of before) {
      const after = loaded.nodes.find((n: any) => n.id === orig.id) as CelestialBody;
      expect(after, `${orig.name} is still in the system`).toBeTruthy();
      expect(after.name).toBe(orig.name);
      expect(after.massKg).toBe(orig.massKg);
      expect(after.orbit!.elements.a_AU).toBe(orig.orbit.elements.a_AU);
      expect(isGenerated(after), `${orig.name} must never read as a guess`).toBe(false);
    }
    expect(planetsOf(loaded).filter(isGenerated).length).toBe(report.addedPlanets);
  });

  it('the only route to "generated planets only" is the archive rows never arriving', () => {
    const sys = chalawan([]);
    expect(planetsOf(sys).length).toBe(0);
    fillOutSystem(sys, rulePack);
    expect(planetsOf(sys).length).toBeGreaterThan(0);
    expect(planetsOf(sys).every(isGenerated)).toBe(true);
  });

  it('a generated moon is named after the world it actually orbits', () => {
    // Was "Chalawan c I" in orbit round "Chalawan f": the generator names a moon before the
    // fill-out re-letters its parent past the letters the catalogue has used, so an invented moon
    // went on naming a CONFIRMED planet's letter as its parent.
    const sys = chalawan();
    fillOutSystem(sys, rulePack);
    const moons = sys.nodes.filter((n: any) => n.roleHint === 'moon');
    expect(moons.length, 'this system must generate a moon, or the gate is hollow').toBeGreaterThan(0);
    for (const moon of moons) {
      const parent = sys.nodes.find((n: any) => n.id === moon.parentId);
      expect(moon.name.startsWith(`${parent.name} `), `${moon.name} orbits ${parent.name}`).toBe(true);
    }
  });
});

// G33 said "whoever calls infillSystem from a UI passes its knobs", and one of the two doors the
// real-sky dialogue opens did not: building a NEW starmap ignored the dials entirely.
describe('fillOutImported - the one call both import doors make', () => {
  const entry = () => {
    const { systems } = convertArchiveRows(cache, { region: { centre: SOL_CENTRE, radiusLy: 30 }, generated: 'test' });
    const hit = systems.find((s: any) => s.name === 'GJ 581');
    return [{ id: hit.id, system: structuredClone(hit.system) }];
  };
  const added = (knobs: any) => {
    const systems = entry();
    const before = systems[0].system.nodes.length;
    fillOutImported({ fillOut: true, infillKnobs: knobs }, systems, rulePack);
    return systems[0].system.nodes.length - before;
  };

  it('does nothing at all when the box was not ticked', () => {
    const systems = entry();
    const before = structuredClone(systems[0].system);
    expect(fillOutImported({ fillOut: false, infillKnobs: { diskMass: 1 } }, systems, rulePack)).toBeNull();
    expect(systems[0].system).toEqual(before);
  });

  it('passes the dials through: a massive disc adds more worlds than a sparse one', () => {
    const sparse = added({ metallicity: 0.65, diskMass: 0, dynamicalHistory: 0.5, rarity: 0.25 });
    const massive = added({ metallicity: 0.65, diskMass: 1, dynamicalHistory: 0.5, rarity: 0.25 });
    expect(massive).toBeGreaterThan(sparse);
  });
});

// The one code path that produces "generated planets only" for a star with known planets: the
// archive did not answer, the star is beyond the bundled copy, and the box is ticked.
describe('fillOutCaution - said beside the box when real planets could not be checked', () => {
  const chalawanRegion = { centre: { raDeg: 164.87, decDeg: 40.43, distLy: 45.3 }, radiusLy: 4 };

  it('speaks when the archive fell back to the bundled copy and the region is beyond it', () => {
    const text = fillOutCaution('bundled', chalawanRegion);
    expect(text).toMatch(/NO confirmed planets/);
    expect(text).toContain(`${Math.round(BUNDLED_CACHE_MAX_LY)} light years`);
  });

  it('is silent when the archive answered, directly or through the proxy', () => {
    expect(fillOutCaution('live', chalawanRegion)).toBeNull();
    expect(fillOutCaution('live-proxy', chalawanRegion)).toBeNull();
  });

  it('is silent when the bundled copy covers the whole region - nothing is missing', () => {
    expect(fillOutCaution('bundled', { centre: SOL_CENTRE, radiusLy: 16.5 })).toBeNull();
  });
});
