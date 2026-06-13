import { describe, it, expect } from 'vitest';
import { annotateReasonsToVisit, REASONS_DEFAULTS, type ReasonsConfig } from './reasonsToVisit';
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
});
