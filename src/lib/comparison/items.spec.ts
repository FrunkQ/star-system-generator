import { describe, it, expect, beforeEach } from 'vitest';
import { itemsForSystem, itemsForStarmap, hiddenKey, loadHidden, saveHidden } from './items';
import { sortItems } from './layout';
import { SOLAR_RADIUS_KM, EARTH_RADIUS_KM } from '$lib/constants';
import derived from '../../../tests/output/solar-system-derived.json';

// THE STARMAP HALF OF THIS FILE EXISTS BECAUSE THE FIRST LIVE RUN FOUND IT EMPTY. `starmap.systems`
// is `StarSystemNode[]` — a WRAPPER carrying the map position and the system's name, with the actual
// `System` on `.system` — and reading `nodes` off the wrapper returns `undefined` for every system
// on the map. The unit tests at the time asserted the LAWS and nothing asserted this SHAPE, so a
// fifty-system map produced a strip with nothing on it. That is the gate now.

const sol = derived as any;

describe('what goes on the strip — a system', () => {
  it('takes every body with a true size, and its size is the AUTHORED radius', () => {
    const items = itemsForSystem(sol);
    const byName = new Map(items.map((i) => [i.name, i]));
    expect(byName.get('Earth')!.diameterKm).toBeCloseTo(EARTH_RADIUS_KM * 2, 6);
    // THE AUTHORED radius, not the app constant — and Sol is where the difference shows. The bundled
    // Sol data carries 695,700 km (the classic photospheric figure, the same number
    // `import/realsky/constants.mjs` uses) while `constants.ts` SOLAR_RADIUS_KM is the IAU nominal
    // 696,340. This view draws what the GM's data says and never substitutes a constant for it; the
    // ruler's Sun TICK is the app constant, and the two being 1,280 km apart on the diameter is the
    // point of inbox B121. Both pinned here so neither can drift into the other.
    const solNode = (sol.nodes as any[]).find((n) => n.name === 'Sol');
    expect(byName.get('Sol')!.diameterKm).toBeCloseTo(solNode.radiusKm * 2, 6);
    expect(byName.get('Sol')!.diameterKm).toBeCloseTo(1391400, 6);
    expect(byName.get('Sol')!.diameterKm).not.toBeCloseTo(SOLAR_RADIUS_KM * 2, 0);
    expect(byName.get('Luna')!.diameterKm).toBeCloseTo(3474.8, 6);
    expect(byName.get('Earth')!.role).toBe('planet');
    expect(byName.get('Luna')!.role).toBe('moon');
    expect(byName.get('Sol')!.role).toBe('star');
  });

  it('carries the NODE through, because the scene needs it to build a look', () => {
    const earth = itemsForSystem(sol).find((i) => i.name === 'Earth')!;
    expect(earth.node).toBeTruthy();
    expect(earth.node.id).toBe(earth.id);
  });

  it('leaves out belts, rings and anything with no radius — a scope line, not an oversight', () => {
    const items = itemsForSystem(sol);
    const roles = new Set(items.map((i) => i.role));
    expect(roles.has('belt')).toBe(false);
    expect(roles.has('ring')).toBe(false);
    expect(items.every((i) => i.diameterKm > 0)).toBe(true);
    // The fixture HAS belts and rings, so this is a real exclusion rather than a vacuous one.
    expect((sol.nodes as any[]).some((n) => n.roleHint === 'belt' || n.roleHint === 'ring')).toBe(true);
  });

  it('answers an absent or empty system with nothing rather than throwing', () => {
    expect(itemsForSystem(null)).toEqual([]);
    expect(itemsForSystem({ nodes: [] })).toEqual([]);
  });
});

describe('a barycentre is a door, not a destination', () => {
  // [[B135]]. Pluto's own `a_AU` is the 2,035 km waltz it dances with Charon about the point between
  // them, and reading it straight put Pluto SECOND on the strip - between the Sun and Mercury, which
  // is where the owner found it. The pair's distance from the star is the BARYCENTRE's orbit, and a
  // barycentre is not on the strip because it has no body, so the strip has to step through it.
  it('gives Pluto the PAIR’s orbit and the barycentre’s own host, from the real Sol', () => {
    const items = itemsForSystem(sol);
    const pluto = items.find((i) => i.name === 'Pluto')!;
    const charon = items.find((i) => i.name === 'Charon')!;
    const bary = (sol.nodes as any[]).find((n) => n.kind === 'barycenter' && /Pluto/.test(String(n.name)));
    const sun = (sol.nodes as any[]).find((n) => n.name === 'Sol');
    // The fixture really is shaped this way, or the gate proves nothing: both bodies name the
    // barycentre, and their own orbits are the tiny mutual ones.
    expect(String(bary.parentId)).toBe(String(sun.id));
    expect(bary.orbit.elements.a_AU).toBeCloseTo(39.482, 3);
    expect((sol.nodes as any[]).find((n) => n.name === 'Pluto').parentId).toBe(bary.id);
    expect((sol.nodes as any[]).find((n) => n.name === 'Pluto').orbit.elements.a_AU).toBeLessThan(0.001);
    // And the strip reads through it: 39.5 AU, under the star, for BOTH members.
    expect(pluto.orbitAu).toBeCloseTo(39.482, 3);
    expect(charon.orbitAu).toBeCloseTo(39.482, 3);
    expect(pluto.parentId).toBe(String(sun.id));
    expect(charon.parentId).toBe(String(sun.id));
  });

  it('puts the pair at the far end of the orbit order, larger first', () => {
    const seq = sortItems(itemsForSystem(sol), 'orbit');
    const names = seq.map((i) => i.name);
    expect(names.slice(-2)).toEqual(['Pluto', 'Charon']);
    expect(names[0]).toBe('Sol');
    expect(names[1]).toBe('Mercury');          // the fault: Pluto used to sit here
    expect(names.indexOf('Pluto')).toBeGreaterThan(names.indexOf('Neptune'));
  });

  it('leaves a body whose parent is a BODY exactly where it was', () => {
    const luna = itemsForSystem(sol).find((i) => i.name === 'Luna')!;
    const earth = (sol.nodes as any[]).find((n) => n.name === 'Earth');
    expect(luna.parentId).toBe(String(earth.id));
    expect(luna.orbitAu).toBeCloseTo(
      (sol.nodes as any[]).find((n) => n.name === 'Luna').orbit.elements.a_AU, 12);
  });

  it('walks a CHAIN of barycentres out to the one that orbits something real', () => {
    const nodes = [
      { id: 'star', kind: 'body', roleHint: 'star', name: 'Star', radiusKm: 700000 },
      { id: 'outer', kind: 'barycenter', parentId: 'star', orbit: { elements: { a_AU: 12 } } },
      { id: 'inner', kind: 'barycenter', parentId: 'outer', orbit: { elements: { a_AU: 0.4 } } },
      { id: 'a', kind: 'body', roleHint: 'planet', name: 'A', parentId: 'inner', radiusKm: 6000,
        orbit: { elements: { a_AU: 0.0002 } } }
    ];
    const a = itemsForSystem({ nodes })!.find((i) => i.name === 'A')!;
    expect(a.parentId).toBe('star');
    expect(a.orbitAu).toBe(12);
  });

  it('gives up on a CYCLE rather than hanging the view', () => {
    const nodes = [
      { id: 'x', kind: 'barycenter', parentId: 'y' },
      { id: 'y', kind: 'barycenter', parentId: 'x' },
      { id: 'a', kind: 'body', roleHint: 'planet', name: 'A', parentId: 'x', radiusKm: 6000 }
    ];
    const items = itemsForSystem({ nodes });
    expect(items.map((i) => i.name)).toEqual(['A']);
    expect(items[0].orbitAu).toBeUndefined();
  });
});

describe('what goes on the strip — the starmap', () => {
  // Two systems in the shape the campaign file actually uses: a WRAPPER with the System on `.system`.
  const wrapped = {
    systems: [
      { id: 'sys-sol', name: 'Sol', position: { x: 0, y: 0 }, system: sol },
      { id: 'sys-b', name: 'Far Reach', position: { x: 10, y: 4 }, system: {
        id: 'far', name: 'Far Reach', nodes: [
          { id: 'far-a', kind: 'body', roleHint: 'star', name: 'Far Reach A', parentId: null, radiusKm: 900000, massKg: 3e30, tags: [] },
          { id: 'far-b', kind: 'body', roleHint: 'star', name: 'Far Reach B', parentId: null, radiusKm: 400000, massKg: 1e30, tags: [] }
        ]
      } }
    ]
  };

  it('reads through the wrapper and finds every system’s stars', () => {
    const items = itemsForStarmap(wrapped);
    expect(items.length).toBeGreaterThan(0);
    expect(items.map((i) => i.name)).toContain('Sol');
  });

  it('is multi-star aware — a binary appears twice, primary first', () => {
    const far = itemsForStarmap(wrapped).filter((i) => i.id.startsWith('sys-b:'));
    expect(far.map((i) => i.name)).toEqual(['Far Reach A', 'Far Reach B']);
    expect(far[0].diameterKm).toBe(1800000);
    expect(far[1].diameterKm).toBe(800000);
  });

  it('keys each entry by system AND star, so two stars called A never collide', () => {
    const ids = itemsForStarmap(wrapped).map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('sys-b:far-a');
  });

  it('puts only stars on the strip — a starmap compares systems, not their moons', () => {
    expect(itemsForStarmap(wrapped).every((i) => i.role === 'star')).toBe(true);
  });

  it('answers an absent starmap with nothing rather than throwing', () => {
    expect(itemsForStarmap(null)).toEqual([]);
    expect(itemsForStarmap({ systems: [] })).toEqual([]);
  });
});

describe('the hidden set', () => {
  beforeEach(() => localStorage.clear());

  it('is keyed per map, because hiding the moons here says nothing about the next system', () => {
    expect(hiddenKey('system', 'a')).not.toBe(hiddenKey('system', 'b'));
    expect(hiddenKey('system', 'a')).not.toBe(hiddenKey('starmap', 'a'));
  });

  it('round-trips, and survives re-entry', () => {
    const k = hiddenKey('system', 'sol');
    saveHidden(k, new Set(['mercury', 'phobos']));
    const back = loadHidden(k);
    expect([...back].sort()).toEqual(['mercury', 'phobos']);
  });

  it('clears the key rather than storing an empty list', () => {
    const k = hiddenKey('system', 'sol');
    saveHidden(k, new Set(['mercury']));
    saveHidden(k, new Set());
    expect(localStorage.getItem(k)).toBeNull();
    expect(loadHidden(k).size).toBe(0);
  });

  it('survives a stored value someone else wrote', () => {
    const k = hiddenKey('system', 'sol');
    localStorage.setItem(k, 'not json at all');
    expect(loadHidden(k).size).toBe(0);
    localStorage.setItem(k, '{"not":"an array"}');
    expect(loadHidden(k).size).toBe(0);
  });
});
