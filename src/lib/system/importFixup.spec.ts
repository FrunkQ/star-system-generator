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
    // tags: only the authored one survives
    expect(p.tags.map((t: any) => t.key)).toEqual(['faction/empire']);

    // STAR spectral class must survive — the processor never re-derives it, so wiping it would
    // leave the star colourless (renders white). The planet's class is still cleared (re-derived).
    const star: any = sys.nodes.find((n: any) => n.id === 'star');
    expect(star.classes).toEqual(['star/G']);
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
