// The GM's tag vocabulary reaching another device — the half of the marker-colour bug that only
// shows up off the GM's own machine, where the two windows no longer share one localStorage.
import { describe, it, expect } from 'vitest';
import { tagStyleSnapshot, tagCategoriesFromSnapshot } from './tagStyleSync';
import { markersFor } from './mapHighlights';
import type { TagCategory } from './tagCategories';

const gmCats = [
  {
    id: 'faction', shortName: 'Faction', longName: 'Faction', color: '#333333', textColor: '#ffffff',
    appliesTo: ['planet'], enabled: true, rules: [],
    tags: [
      { key: 'faction/red-syndicate', label: 'Red Syndicate', color: '#ff0000' },
      { key: 'faction/plain' }
    ]
  },
  {
    // The case the whole thing exists for: a GM who recoloured a SHIPPED category. A player device
    // has this id too, with the default colour, so the snapshot has to win.
    id: 'frontier', shortName: 'Frontier', longName: 'Frontier', color: '#00ff88',
    appliesTo: ['planet'], enabled: true, rules: [],
    tags: [{ key: 'frontier/refuelling', label: 'Fuel stop' }]
  }
] as unknown as TagCategory[];

describe('tagStyleSnapshot', () => {
  it('carries the presentation subset and nothing a player device has no business with', () => {
    const snap = tagStyleSnapshot(gmCats);
    expect(snap.categories.map((c) => c.id)).toEqual(['faction', 'frontier']);
    expect(snap.categories[1].color).toBe('#00ff88');
    for (const c of snap.categories as any[]) {
      expect(c.rules).toBeUndefined();
      expect(c.appliesTo).toBeUndefined();
    }
  });

  it('only carries a TAG that says something its category does not', () => {
    const snap = tagStyleSnapshot(gmCats);
    const keys = snap.tags.map((t) => t.key);
    expect(keys).toContain('faction/red-syndicate'); // its own colour
    expect(keys).toContain('frontier/refuelling');   // a renamed label
    // 'faction/plain' carries no colour and no label of its own, so it is left out and the receiver's
    // own fallbacks name it — the wire never carries the whole vocabulary just to repeat its defaults.
    expect(keys).not.toContain('faction/plain');
  });

  it('survives an empty or absent vocabulary rather than throwing at a receiver', () => {
    expect(tagStyleSnapshot(null).categories).toEqual([]);
    expect(tagCategoriesFromSnapshot(null)).toBeNull();
    expect(tagCategoriesFromSnapshot({ categories: [], tags: [] })).toBeNull();
  });
});

describe('the round trip', () => {
  it("a receiver resolves the GM's colours, not its own defaults", () => {
    const received = tagCategoriesFromSnapshot(tagStyleSnapshot(gmCats))!;

    // A per-TAG colour override.
    const red = markersFor([{ key: 'faction/red-syndicate' }], [{ ref: 'faction' }], received);
    expect(red[0].color).toBe('#ff0000');
    expect(red[0].label).toBe('Red Syndicate');

    // A recoloured CATEGORY, and a renamed tag inside it. This is the one a player device would
    // otherwise get wrong twice over, because it holds `frontier` itself with the shipped colour.
    const fuel = markersFor([{ key: 'frontier/refuelling' }], [{ ref: 'frontier' }], received);
    expect(fuel[0].color).toBe('#00ff88');
    expect(fuel[0].label).toBe('Fuel stop');
  });

  it('keeps category ORDER, so a body does not reshuffle its badges between devices', () => {
    const received = tagCategoriesFromSnapshot(tagStyleSnapshot(gmCats))!;
    expect(received.map((c) => c.id)).toEqual(gmCats.map((c) => c.id));
  });
});
