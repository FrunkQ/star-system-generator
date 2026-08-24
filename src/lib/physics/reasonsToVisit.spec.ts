import { describe, it, expect } from 'vitest';
import { annotateReasonsToVisit, REASONS_DEFAULTS, DEFAULT_POI_PACK, exportPack, importPack, type ReasonsConfig, type PoIPack } from './reasonsToVisit';
import type { System, CelestialBody } from '../types';

function sys(): System {
  return {
    seed: 'test-seed', age_Gyr: 4.6,
    nodes: [
      { id: 'star', kind: 'body', roleHint: 'star', name: 'S', parentId: null, classes: ['star/G'] },
      // a metal-rich rocky world → resource hooks
      { id: 'p1', kind: 'body', roleHint: 'planet', name: 'Ferrum', parentId: 'star',
        massKg: 6e24, makeup: { metal: 0.6, rock: 0.4 }, equilibriumTempK: 300,
        classes: ['planet/iron'], tags: [] }
    ]
  } as unknown as System;
}
const cfg = (over: Partial<ReasonsConfig> = {}): ReasonsConfig => ({
  enabled: true, categories: { ...REASONS_DEFAULTS.categories }, ...over
});
const reasonTags = (b: CelestialBody) => (b.tags || []).map((t) => t.key).filter((k) => /^(resource|science|frontier|intrigue)\//.test(k));

describe('reasons-to-visit tagger', () => {
  it('adds resource hooks to a metal-rich world', () => {
    const s = sys();
    annotateReasonsToVisit(s, cfg());
    const p = s.nodes.find((n) => n.id === 'p1') as CelestialBody;
    expect(reasonTags(p).some((k) => k.startsWith('resource/'))).toBe(true);
  });

  it('is deterministic for the same seed/data', () => {
    const a = sys(); annotateReasonsToVisit(a, cfg());
    const b = sys(); annotateReasonsToVisit(b, cfg());
    const ta = reasonTags(a.nodes.find((n) => n.id === 'p1') as CelestialBody).sort();
    const tb = reasonTags(b.nodes.find((n) => n.id === 'p1') as CelestialBody).sort();
    expect(ta).toEqual(tb);
  });

  it('disabling a category removes only its tags, leaving the others stable', () => {
    const full = sys(); annotateReasonsToVisit(full, cfg());
    const fp = full.nodes.find((n) => n.id === 'p1') as CelestialBody;
    const science = reasonTags(fp).filter((k) => k.startsWith('science/'));

    const noRes = sys(); annotateReasonsToVisit(noRes, cfg({ categories: { ...REASONS_DEFAULTS.categories, resource: false } }));
    const np = noRes.nodes.find((n) => n.id === 'p1') as CelestialBody;
    expect(reasonTags(np).some((k) => k.startsWith('resource/'))).toBe(false);
    // The science rolls didn't shift because rolls advance regardless of category toggles.
    expect(reasonTags(np).filter((k) => k.startsWith('science/'))).toEqual(science);
  });

  it('emits nothing when disabled (and clears prior tags)', () => {
    const s = sys();
    annotateReasonsToVisit(s, cfg());
    annotateReasonsToVisit(s, cfg({ enabled: false }));
    const p = s.nodes.find((n) => n.id === 'p1') as CelestialBody;
    expect(reasonTags(p).length).toBe(0);
  });

  it('exports and re-imports a pack round-trip', () => {
    const json = exportPack(DEFAULT_POI_PACK);
    const back = importPack(json);
    expect(back.rules.length).toBe(DEFAULT_POI_PACK.rules.length);
    expect(back.categories.map((c) => c.id)).toEqual(DEFAULT_POI_PACK.categories.map((c) => c.id));
    expect(() => importPack('{"nope":1}')).toThrow();
  });

  it('can trigger on a custom tag value (text and numeric)', () => {
    const pack: PoIPack = {
      id: 'tv', name: 'Tag-value pack', description: '', enabled: true,
      categories: [{ id: 'lore', label: 'Lore', desc: '' }],
      rules: [
        { id: 't1', tag: 'lore/imperial', category: 'lore', chance: 1, when: { eq: ['tag:faction/control', 'Empire'] } },
        { id: 't2', tag: 'lore/perilous', category: 'lore', chance: 1, when: { gte: ['tag:danger', 5] } }
      ]
    };
    const conf: ReasonsConfig = { enabled: true, categories: { lore: true } };
    const s = sys();
    const p = s.nodes.find((n) => n.id === 'p1') as CelestialBody;
    p.tags = [{ key: 'faction/control', value: 'Empire' }, { key: 'danger', value: '7' }];
    annotateReasonsToVisit(s, conf, [pack]);
    expect((p.tags || []).some((t) => t.key === 'lore/imperial')).toBe(true);   // text match
    expect((p.tags || []).some((t) => t.key === 'lore/perilous')).toBe(true);   // numeric ≥ on a string value

    // A non-matching value fires neither.
    const s2 = sys();
    const p2 = s2.nodes.find((n) => n.id === 'p1') as CelestialBody;
    p2.tags = [{ key: 'faction/control', value: 'Rebels' }, { key: 'danger', value: '2' }];
    annotateReasonsToVisit(s2, conf, [pack]);
    expect((p2.tags || []).some((t) => t.key.startsWith('lore/'))).toBe(false);
  });

  it('stacks a second pack: its rules add new tags', () => {
    const extra: PoIPack = {
      id: 'sw', name: 'Test Pack', description: '', enabled: true,
      categories: [{ id: 'lore', label: 'Lore', desc: '' }],
      rules: [{ id: 'x', tag: 'lore/spice', category: 'lore', chance: 1, when: { gte: ['makeup.metal', 0.1] } }]
    };
    const s = sys();
    annotateReasonsToVisit(s, { enabled: true, categories: { ...REASONS_DEFAULTS.categories, lore: true } }, [DEFAULT_POI_PACK, extra]);
    const p = s.nodes.find((n) => n.id === 'p1') as CelestialBody;
    expect((p.tags || []).some((t) => t.key === 'lore/spice')).toBe(true);            // stacked pack fired
    expect(reasonTags(p).some((k) => k.startsWith('resource/'))).toBe(true);          // default still ran
  });
});

// B33 — a rule that means "land, dig it up and lift it" has to check there is ground. These rules
// all test BULK COMPOSITION, and a giant satisfies bulk tests trivially: a planet-sized envelope
// holds a great deal of water and metal by mass. A 751 C helium giant was offering life-support
// resupply, water/ice refuelling and water ice.
describe('surface resources need a surface (B33)', () => {
  // A cold hydrogen/helium giant with the ice fraction that used to trigger the water hooks.
  const giant = (): System => ({
    seed: 'b33-seed', age_Gyr: 4.6,
    nodes: [
      { id: 'star', kind: 'body', roleHint: 'star', name: 'S', parentId: null, classes: ['star/G'] },
      { id: 'g1', kind: 'body', roleHint: 'planet', name: 'Grolith', parentId: 'star',
        massKg: 6.7e26, makeup: { gas: 0.8, ice: 0.2 }, equilibriumTempK: 140,
        atmosphere: { name: 'H2/He', composition: { H2: 0.75, He: 0.25 }, pressure_bar: 86.6 },
        classes: ['planet/helium'], tags: [] }
    ]
  } as unknown as System);

  const tagsOf = (s: System) => {
    annotateReasonsToVisit(s, cfg());
    const b = s.nodes.find((n) => n.id === 'g1') as CelestialBody;
    return (b.tags || []).map((t) => t.key);
  };

  it('offers a giant nothing that has to be lifted off the ground', () => {
    const keys = tagsOf(giant());
    for (const k of ['resource/water-ice', 'frontier/fuel-depot', 'frontier/life-support',
                     'resource/heavy-metals', 'resource/platinum-group', 'resource/rare-earths',
                     'resource/fissiles', 'resource/diamonds', 'resource/organics', 'resource/exotic-crystals']) {
      expect(keys, `a giant should not offer ${k}`).not.toContain(k);
    }
  });

  it('still offers what you can take from orbit or the envelope', () => {
    // The gate must not be a blanket ban — helium-3 and gas skimming are the RIGHT answer for a
    // giant and are deterministic (chance 1.0 / 0.92), so their absence would mean over-reach.
    expect(tagsOf(giant())).toContain('resource/helium-3');
  });

  it('leaves a rocky body with the same ice fraction alone', () => {
    // The control: identical ice, no envelope. If this lost its water ice the gate would be
    // testing the wrong thing, and the first assertion above would pass for the wrong reason.
    const s = giant();
    const b = s.nodes.find((n) => n.id === 'g1') as CelestialBody;
    (b as any).makeup = { rock: 0.5, ice: 0.5 };
    (b as any).classes = ['planet/ice'];
    (b as any).atmosphere = undefined;
    expect(tagsOf(s)).toContain('resource/water-ice');
  });
});

// G38: the Orbit & zones + Structure feature family. Zone membership is judged against the star's
// DERIVED zones at the body's distance from the STAR — a moon answers with its host planet's
// orbit, a barycentre member with the pair's. The default pack's structural rules ride on them.
describe('orbit, zone and structure features (G38)', () => {
  const SUN = { id: 'star', kind: 'body', roleHint: 'star', name: 'S', parentId: null, classes: ['star/G'], massKg: 1.989e30, radiusKm: 696000, temperatureK: 5778 };
  const orbit = (hostId: string, a_AU: number, extra: any = {}) => ({ hostId, hostMu: 1.327e20, elements: { a_AU, e: 0, i_deg: 0, ...extra } });
  const world = (id: string, parentId: string, a_AU: number, extra: any = {}) => ({
    id, kind: 'body', roleHint: 'planet', name: id, parentId, massKg: 6e24,
    makeup: { metal: 0.3, rock: 0.7 }, equilibriumTempK: 288, tags: [], classes: [],
    orbit: orbit(parentId, a_AU), ...extra
  });
  const mkSys = (nodes: any[]): System => ({ seed: 'g38-seed', age_Gyr: 4.6, nodes: [SUN, ...nodes].map((n) => ({ ...n, tags: [...(n.tags ?? [])] })) } as unknown as System);
  const probePack = (rules: any[]): PoIPack => ({
    id: 'probe', name: 'probe', description: '', enabled: true,
    categories: [{ id: 'science', label: 'Science', desc: '' }], rules: rules.map((r, i) => ({ id: `probe${i}`, chance: 1, category: 'science', ...r }))
  });
  const keys = (s: System, id: string) => ((s.nodes.find((n) => n.id === id) as CelestialBody).tags || []).map((t) => t.key);

  it('judges the habitable zone at the STAR distance, and a moon inherits its host orbit', () => {
    const s = mkSys([
      world('earthy', 'star', 1.0),
      { ...world('luna', 'earthy', 0.00257), roleHint: 'moon', orbit: { hostId: 'earthy', hostMu: 3.98e14, elements: { a_AU: 0.00257, e: 0, i_deg: 0 } } },
      world('cold', 'star', 5.0)
    ]);
    annotateReasonsToVisit(s, cfg(), [probePack([{ tag: 'science/hz-hit', when: { eq: ['inHabitableZone', true] }, appliesTo: ['planet', 'moon'] }])]);
    expect(keys(s, 'earthy')).toContain('science/hz-hit');
    expect(keys(s, 'luna')).toContain('science/hz-hit');
    expect(keys(s, 'cold')).not.toContain('science/hz-hit');
  });

  it('frost-line and CO-line sidedness read from the derived zones', () => {
    // The CO ice line needs ~25 K: for a Sun-clone that is ~120 AU out, so the deep-cold probe
    // sits at 200 AU — 40 AU is beyond the frost line but genuinely INSIDE the CO line.
    const s = mkSys([world('inner', 'star', 0.5), world('kuiper', 'star', 40), world('oort', 'star', 200)]);
    annotateReasonsToVisit(s, cfg(), [probePack([
      { tag: 'science/icy-side', when: { eq: ['beyondFrostLine', true] } },
      { tag: 'science/deep-cold', when: { eq: ['beyondCOIceLine', true] } }
    ])]);
    expect(keys(s, 'inner')).not.toContain('science/icy-side');
    expect(keys(s, 'kuiper')).toContain('science/icy-side');
    expect(keys(s, 'kuiper')).not.toContain('science/deep-cold');
    expect(keys(s, 'oort')).toContain('science/deep-cold');
  });

  it('a barycentre pair reads inBarycenter, and the default pack calls it a double planet', () => {
    const s = mkSys([
      { id: 'bary', kind: 'barycenter', name: 'B', parentId: 'star', memberIds: ['pa', 'pb'], orbit: orbit('star', 1.2) },
      world('pa', 'bary', 0.001),
      world('pb', 'bary', 0.002),
      world('loner', 'star', 2.0)
    ]);
    annotateReasonsToVisit(s, cfg());
    expect(keys(s, 'pa')).toContain('science/double-planet');
    expect(keys(s, 'pb')).toContain('science/double-planet');
    expect(keys(s, 'loner')).not.toContain('science/double-planet');
  });

  it('a world inside the star Roche limit is on a doomed orbit (default rule, deterministic)', () => {
    // Sun-density primary: Roche ~ 0.0046 AU. 0.003 is inside; 0.03 is safely out.
    const s = mkSys([world('grazer', 'star', 0.003), world('safe', 'star', 0.03)]);
    annotateReasonsToVisit(s, cfg());
    expect(keys(s, 'grazer')).toContain('science/doomed-orbit');
    expect(keys(s, 'safe')).not.toContain('science/doomed-orbit');
  });

  it('structure: moon count, rings, moon-of-a-giant', () => {
    const s = mkSys([
      { ...world('jove', 'star', 5.2), massKg: 1.9e27, makeup: { gas: 0.95, ice: 0.05 }, classes: ['planet/gas-giant'] },
      { ...world('io', 'jove', 0.0028), roleHint: 'moon' },
      { ...world('ring', 'jove', 0.001), roleHint: 'ring' }
    ]);
    annotateReasonsToVisit(s, cfg(), [probePack([
      { tag: 'science/mooned', when: { gte: ['moonCount', 1] } },
      { tag: 'science/ringed', when: { eq: ['hasRings', true] } },
      { tag: 'science/giant-moon', when: { eq: ['isMoonOfGiant', true] }, appliesTo: ['moon'] }
    ])]);
    expect(keys(s, 'jove')).toContain('science/mooned');
    expect(keys(s, 'jove')).toContain('science/ringed');
    expect(keys(s, 'io')).toContain('science/giant-moon');
  });
});
