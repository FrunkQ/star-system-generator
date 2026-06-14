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
