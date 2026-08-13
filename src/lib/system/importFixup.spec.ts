import { describe, it, expect } from 'vitest';
import { isInterferingTag, fixUpImportedSystem } from './importFixup';
import type { System } from '$lib/types';
import { EARTH_MASS_KG, EARTH_RADIUS_KM } from '$lib/constants';

describe('isInterferingTag', () => {
  it('strips derived namespaces, managed flat tags, and legacy display names', () => {
    for (const k of ['geology/inactive', 'magnetic/dynamo', 'structure/icy-shell', 'habitability/none',
      'inert', 'noble-gas', 'cloud-former', 'volcanic', 'Tidally Locked', 'Active Volcanism', 'Airless Rock']) {
      expect(isInterferingTag(k)).toBe(true);
    }
  });
  it('keeps genuinely-authored lowercase-namespaced tags', () => {
    for (const k of ['faction/empire', 'plot/ancient-ruins', 'lore/homeworld']) {
      expect(isInterferingTag(k)).toBe(false);
    }
  });

  it('strips classification class-tags (a type is a class, never a tag)', () => {
    const classes = new Set(['ice-giant', 'puffy', 'terrestrial']);
    expect(isInterferingTag('planet/ice-giant')).toBe(true);   // namespaced class
    expect(isInterferingTag('star/G')).toBe(true);
    expect(isInterferingTag('ice-giant', classes)).toBe(true); // bare type name (with pack class list)
    expect(isInterferingTag('puffy', classes)).toBe(true);
    expect(isInterferingTag('ice-giant')).toBe(false);         // without the class list it's just kept
  });
});

describe('fixUpImportedSystem', () => {
  it('strips baked-in derived data + legacy tags, keeps authored inputs', () => {
    const sys = {
      id: 's', name: 'Old', rulePackId: 'starter-sf', nodes: [
        {
          id: 'star', name: 'Sun', kind: 'body', roleHint: 'star', parentId: null,
          massKg: 2e30, radiusKm: 696000, temperatureK: 5778, classes: ['star/G'], tags: []
        },
        {
          id: 'p', name: 'OldWorld', kind: 'body', roleHint: 'planet', parentId: 'star',
          massKg: EARTH_MASS_KG, radiusKm: EARTH_RADIUS_KM,
          // INPUTS (keep)
          atmosphere: { name: 'N2', main: 'N2', pressure_bar: 1, composition: { N2: 0.78, O2: 0.21 }, molarMassKg: 0.029 },
          hydrosphere: { composition: 'water', coverage: 0.7, layers: [{ liquid: 'water', location: 'surface' }] },
          makeup: { rock: 0.7, metal: 0.3 },
          // DERIVED (strip)
          temperatureK: 288, equilibriumTempK: 255, greenhouseTempK: 33, habitabilityScore: 95,
          albedo: 0.31, apparentColorHex: '#abc', magnetism: { source: 'iron-core' }, geoActivity: { regime: 'plate-tectonics' },
          classes: ['planet/earth-analogue'],
          tags: [{ key: 'Tidally Locked' }, { key: 'inert' }, { key: 'geology/plate-tectonics' },
                 { key: 'habitability/earth-like' }, { key: 'faction/empire' }]
        }
      ], orbit: undefined
    } as unknown as System;

    fixUpImportedSystem(sys);
    const p: any = sys.nodes.find((n: any) => n.id === 'p');

    // derived gone
    expect(p.temperatureK).toBeUndefined();
    expect(p.greenhouseTempK).toBeUndefined();
    expect(p.habitabilityScore).toBeUndefined();
    expect(p.albedo).toBeUndefined();
    expect(p.magnetism).toBeUndefined();
    expect(p.geoActivity).toBeUndefined();
    expect(p.classes).toEqual([]);
    expect(p.hydrosphere.layers).toBeUndefined();
    expect(p.atmosphere.molarMassKg).toBeUndefined();
    // inputs kept
    expect(p.massKg).toBe(EARTH_MASS_KG);
    expect(p.makeup).toEqual({ rock: 0.7, metal: 0.3 });
    expect(p.hydrosphere.composition).toBe('water');
    expect(p.atmosphere.composition.O2).toBe(0.21);
    // Tags: the authored one survives every strip, and NOTHING derived does — except the spin
    // provenance tag, which is ADDED here rather than kept. This body has no `axial_tilt_deg`, so
    // the fix-up infers one (D8: an exoplanet's obliquity is unmeasurable and fiction data rarely
    // carries one), and D2a requires that an inferred value be distinguishable from a measured one.
    // The tag is the mechanism, so its presence is the assertion that the inference is HONEST.
    expect(p.tags.map((t: any) => t.key).sort()).toEqual(['faction/empire', 'spin/axis-inferred']);
    expect(p.axial_tilt_deg).toBeGreaterThanOrEqual(0);
    // …and an AUTHORED tilt is never overwritten, nor labelled as inferred.
    const authored = { id: 'a', name: 'a', kind: 'body', roleHint: 'planet', parentId: 'star',
      massKg: EARTH_MASS_KG, radiusKm: 6371, axial_tilt_deg: 23.44, tags: [] } as any;
    fixUpImportedSystem({ id: 's2', name: 's2', nodes: [authored] } as unknown as System);
    expect(authored.axial_tilt_deg).toBe(23.44);
    expect(authored.tags.map((t: any) => t.key)).toEqual([]);

    // STAR spectral class must survive — the processor never re-derives it, so wiping it would
    // leave the star colourless (renders white). The planet's class is still cleared (re-derived).
    const star: any = sys.nodes.find((n: any) => n.id === 'star');
    expect(star.classes).toEqual(['star/G']);
    // A star's temperatureK is its effective temp (an INPUT) — must survive import (was stripped → 0 K bug).
    expect(star.temperatureK).toBe(5778);
    // A planet's temperatureK is a derived surface temp — still stripped.
    expect(p.temperatureK).toBeUndefined();
  });

  it('KEEPS a GM-pinned planet type (autoClassify=false) across load; still wipes an auto class', () => {
    const sys = {
      id: 's', name: 'N', rulePackId: 'starter-sf', nodes: [
        // GM turned auto-classify OFF and picked "Ocean world" — authored, must survive.
        { id: 'pinned', name: 'Pinned', kind: 'body', roleHint: 'planet', parentId: null,
          massKg: EARTH_MASS_KG, radiusKm: EARTH_RADIUS_KM, makeup: { rock: 0.7, metal: 0.3 },
          autoClassify: false, classes: ['planet/ocean'], tags: [] },
        // A body left on auto-classify — its baked class is derived data, still stripped.
        { id: 'auto', name: 'Auto', kind: 'body', roleHint: 'planet', parentId: null,
          massKg: EARTH_MASS_KG, radiusKm: EARTH_RADIUS_KM, makeup: { rock: 0.7, metal: 0.3 },
          autoClassify: true, classes: ['planet/terrestrial'], tags: [] }
      ], orbit: undefined
    } as unknown as System;

    fixUpImportedSystem(sys);
    const pinned: any = sys.nodes.find((n: any) => n.id === 'pinned');
    const auto: any = sys.nodes.find((n: any) => n.id === 'auto');
    expect(pinned.classes).toEqual(['planet/ocean']); // hand-picked type survives (processor won't re-derive it)
    expect(auto.classes).toEqual([]);                   // auto class wiped → re-derived by the processor
  });

  it('KEEPS auto-barycentres so a nested pair is not orphaned (Sirius Ab collapse regression)', () => {
    // A v1 planet + oversized-moon pair that v1 promoted into an auto-barycentre carrying the REAL orbit
    // around the star (a_AU 4.44). Deleting the barycentre here orphaned the members; the processor then
    // re-homed them onto the system root with only their tiny local separation, collapsing them to centre.
    // fixUpImportedSystem must now PRESERVE the auto-barycentre so reconcileBarycenters can place it right.
    const sys = {
      id: 's', name: 'Binary', rulePackId: 'starter-sf', nodes: [
        { id: 'star', name: 'Star A', kind: 'body', roleHint: 'star', parentId: null, massKg: 2e30, radiusKm: 696000, classes: ['star/A'], tags: [] },
        {
          id: 'bary', name: 'Ab-AbI Barycenter', kind: 'barycenter', parentId: 'star',
          memberIds: ['ab', 'abi'], effectiveMassKg: 1.8e25, tags: [{ key: 'barycenter/auto' }],
          orbit: { hostId: 'star', hostMu: 2.7e20, t0: 0, elements: { a_AU: 4.44, e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 0 } }
        },
        { id: 'ab', name: 'Ab', kind: 'body', roleHint: 'planet', parentId: 'bary', massKg: 1.7e25, radiusKm: 6000,
          orbit: { hostId: 'bary', hostMu: 1.2e15, t0: 0, elements: { a_AU: 0.0012, e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 0 } }, tags: [] },
        { id: 'abi', name: 'Ab I', kind: 'body', roleHint: 'moon', parentId: 'bary', massKg: 1.5e24, radiusKm: 2000,
          orbit: { hostId: 'bary', hostMu: 1.2e15, t0: 0, elements: { a_AU: 0.0018, e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 3.2 } }, tags: [] }
      ], orbit: undefined
    } as unknown as System;

    fixUpImportedSystem(sys);
    const bary: any = sys.nodes.find((n: any) => n.id === 'bary');
    expect(bary).toBeDefined();                          // NOT deleted
    expect(bary.orbit.elements.a_AU).toBe(4.44);         // real orbit preserved
    expect(sys.nodes.find((n: any) => n.id === 'ab')?.parentId).toBe('bary'); // pair still intact
  });

  it('recovers a star spectral class that only survived as a class-tag (old v1 save)', () => {
    const sys = {
      id: 's', name: 'V1', rulePackId: 'starter-sf', nodes: [
        {
          id: 'star', name: 'Sun', kind: 'body', roleHint: 'star', parentId: null,
          massKg: 2e30, radiusKm: 696000, temperatureK: 5260,
          classes: [], tags: [{ key: 'star/K' }, { key: 'faction/empire' }]
        }
      ], orbit: undefined
    } as unknown as System;

    fixUpImportedSystem(sys);
    const star: any = sys.nodes.find((n: any) => n.id === 'star');
    expect(star.classes).toEqual(['star/K']);          // promoted from the tag
    expect(star.tags.map((t: any) => t.key)).toEqual(['faction/empire']);  // class-tag stripped, authored kept
  });
});

// Giants written before the cloud model carried bulk H2/He and, at best, methane — nothing that
// could condense, so Saturn loaded with an empty sky. That is missing DATA rather than stale derived
// state, so unlike everything else in this file it has to be filled in rather than stripped.
describe('older giants get the traces that were never written', () => {
  const giant = (composition: Record<string, number>, pressure_bar = 100000) => ({
    id: 'g', kind: 'body', roleHint: 'planet', name: 'Saturn',
    makeup: { gas: 0.95, ice: 0.04, rock: 0.01 }, massKg: 5.68e26, radiusKm: 58232,
    atmosphere: { main: 'H2', pressure_bar, composition }
  }) as unknown as CelestialBody;
  const fix = (b: CelestialBody) => {
    const out = fixUpImportedSystem({ nodes: [b] } as any).nodes[0] as CelestialBody;
    return out.atmosphere!;
  };

  it('fills an old bulk-only giant and re-anchors it to the reference level', () => {
    const a = fix(giant({ H2: 0.96, He: 0.03, CH4: 0.0045 }));
    expect(a.composition!.NH3).toBeGreaterThan(0);
    expect(a.composition!.H2S).toBeGreaterThan(0);
    expect(a.pressure_bar).toBe(1);                 // was 100000 — the level its temperature belongs to
  });

  it('is REPEATABLE — a repair must not roll dice', () => {
    expect(fix(giant({ H2: 0.96, He: 0.03, CH4: 0.0045 })).composition)
      .toEqual(fix(giant({ H2: 0.96, He: 0.03, CH4: 0.0045 })).composition);
  });

  it('leaves a giant somebody actually authored completely alone', () => {
    // Any gas outside the old default trio means a real authoring decision was made here.
    const authored = { H2: 0.9, He: 0.06, CH4: 0.003, SO2: 0.004 };
    const a = fix(giant(authored, 2));
    expect(a.composition).toEqual(authored);
    expect(a.pressure_bar).toBe(2);
    // …and so does an ammonia figure of their own, even using only the default gases.
    const withNH3 = { H2: 0.9, He: 0.09, NH3: 0.001 };
    expect(fix(giant(withNH3, 5)).composition).toEqual(withNH3);
  });

  it('leaves worlds with a SURFACE alone — this is a giant repair only', () => {
    const mars = {
      id: 'm', kind: 'body', roleHint: 'planet', name: 'Mars',
      makeup: { rock: 0.7, metal: 0.3 }, massKg: 6.42e23, radiusKm: 3390,
      atmosphere: { main: 'CO2', pressure_bar: 0.006, composition: { CO2: 0.95, N2: 0.027 } }
    } as unknown as CelestialBody;
    const out = fixUpImportedSystem({ nodes: [mars] } as any).nodes[0] as CelestialBody;
    expect(out.atmosphere!.composition).toEqual({ CO2: 0.95, N2: 0.027 });
    expect(out.atmosphere!.pressure_bar).toBe(0.006);
  });
});
