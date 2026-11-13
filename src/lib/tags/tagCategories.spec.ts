// Migrating two stores into one, and the two ways it silently went wrong.
//
// Both faults below were caught by `solar-system-derived.json` moving, not by any assertion — which
// is exactly the argument for that baseline, and exactly the argument for these tests, because the
// baseline can only say THAT something moved, never why.
import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { migrateLegacyCategories, normalizeTagCategories, isSystemCategory, SYSTEM_CATEGORY_IDS, resolveTagColor, tagCategories, upsertCategory, deleteCategory, type TagCategory, type TagRule } from './tagCategories';
import { DEFAULT_COI_CATEGORIES, DEFAULT_POI_PACK, REASONS_DEFAULTS } from './tagDefaults';
import { poiPacks } from '../physics/reasonsToVisit';

const defaults = { coi: DEFAULT_COI_CATEGORIES, poi: DEFAULT_POI_PACK };
const migrate = (coi: any = null, poi: any = null, cfg: any = null) => migrateLegacyCategories(coi, poi, cfg, defaults);
const byId = (cats: TagCategory[], id: string) => cats.find((c) => c.id === id)!;

describe('migrating the legacy stores', () => {
  it('produces every system category, undeletable', () => {
    const cats = migrate();
    for (const id of SYSTEM_CATEGORY_IDS) {
      expect(byId(cats, id), `missing ${id}`).toBeTruthy();
      expect(byId(cats, id).system).toBe(true);
      expect(isSystemCategory(id)).toBe(true);
    }
  });

  it('carries the CoI and PoI sides into ONE resource category', () => {
    // The clearest case for unifying: `resource/*` was half owned by each store, told apart only by
    // a flag. On a body it means "extractable here", on a ship "carried" — same vocabulary.
    const resource = byId(migrate(), 'resource');
    expect(resource.appliesTo).toContain('construct');
    expect(resource.appliesTo.some((r) => r === 'planet' || r === 'moon' || r === 'belt')).toBe(true);
    expect(resource.rules.length).toBeGreaterThan(0);
  });

  // BUG 1. "No saved preference" is not "on".
  it('honours a category that ships DISABLED when there is no saved config', () => {
    expect(REASONS_DEFAULTS.categories.intrigue).toBe(false);
    expect(byId(migrate(), 'intrigue').enabled).toBe(false);
  });

  it('copies a saved enabled state verbatim, in both directions', () => {
    const on = migrate(null, null, { enabled: true, categories: { intrigue: true, science: false } });
    expect(byId(on, 'intrigue').enabled).toBe(true);
    expect(byId(on, 'science').enabled).toBe(false);
  });

  // The reason `system` means undeletable and NOT undisableable: frontier has always been
  // user-toggleable, and forcing it on would re-seed tags across an existing campaign.
  it('leaves a system category disabled if that is what the user chose', () => {
    const cats = migrate(null, null, { enabled: true, categories: { frontier: false } });
    expect(byId(cats, 'frontier').system).toBe(true);
    expect(byId(cats, 'frontier').enabled).toBe(false);
  });

  // BUG 2. Rule order is load-bearing: the seeded roll advances per rule.
  it('preserves the authored order of the rules across the move', () => {
    const cats = migrate();
    const seqs = cats.flatMap((c) => c.rules).map((r) => r.seq ?? -1);
    expect(seqs.every((s) => s >= 0), 'every migrated rule needs a seq').toBe(true);
    const sorted = cats.flatMap((c) => c.rules).slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    expect(sorted.map((r) => r.id)).toEqual(DEFAULT_POI_PACK.rules.map((r) => r.id));
  });

  it('merges two packs that define the same category without losing either\'s rules', () => {
    const extra = {
      id: 'extra', name: 'Extra', enabled: true,
      categories: [{ id: 'science', label: 'Science', desc: '' }],
      rules: [{ id: 'x1', tag: 'science/anomaly', category: 'science', chance: 1, when: true }]
    };
    const science = byId(migrate(null, [DEFAULT_POI_PACK, extra]), 'science');
    expect(science.rules.some((r) => r.id === 'x1')).toBe(true);
    expect(science.rules.length).toBeGreaterThan(1);
  });

  it('ignores a pack that was switched off', () => {
    const off = { id: 'off', name: 'Off', enabled: false, categories: [{ id: 'lore', label: 'Lore', desc: '' }], rules: [] };
    expect(migrate(null, [DEFAULT_POI_PACK, off]).some((c) => c.id === 'lore')).toBe(false);
  });

  it('is idempotent — normalising twice changes nothing', () => {
    const once = normalizeTagCategories(migrate());
    expect(normalizeTagCategories(once)).toEqual(once);
  });

  it('keeps the runtime status tags the journey code mirrors onto ships', () => {
    const status = byId(migrate([{ id: 'status', label: 'Status', tags: [] }]), 'status');
    for (const k of ['status/in-transit-interstellar', 'status/in-transit-system', 'status/adrift']) {
      expect(status.tags.some((t) => t.key === k), `missing ${k}`).toBe(true);
    }
    expect(status.tags.find((t) => t.key === 'status/adrift')?.readiness).toBe(0);
  });
});

describe('per-tag colour', () => {
  const cats: TagCategory[] = [{
    id: 'faction', shortName: 'Faction', longName: 'Faction', color: '#333333',
    appliesTo: ['planet'], enabled: true, rules: [],
    tags: [{ key: 'faction/red', label: 'Red', color: '#ff0000' }, { key: 'faction/plain', label: 'Plain' }]
  }];

  it('lets one tag override its category, which is how factions get their own flags', () => {
    expect(resolveTagColor(cats, 'faction/red')?.color).toBe('#ff0000');
  });

  it('falls back to the category colour', () => {
    expect(resolveTagColor(cats, 'faction/plain')?.color).toBe('#333333');
  });

  it('resolves regardless of the case the key was written in', () => {
    expect(resolveTagColor(cats, 'Faction/Red')?.color).toBe('#ff0000');
  });
});

// TAG-8, at the one door that did not respect it. Every body rolls once per rule in `seq` order, so
// where a rule SITS decides which roll every later rule gets. The editor's "+ rule" made a rule
// with no seq; a missing seq sorts as 0; the new rule landed second of forty-six and every
// chance-based tag on the starmap re-rolled (measured: 29 of 40 Sol bodies changed, from adding a
// rule with a 0% chance). These run against the LIVE store, because the order the engine reads is
// the store's - and each cleans up after itself.
describe('a rule added in the editor takes the last place in the evaluation order', () => {
  const order = () => get(poiPacks)[0].rules.map((r) => r.id);
  const science = () => get(tagCategories).find((c) => c.id === 'science')!;
  const rule = (id: string, over: Partial<TagRule> = {}): TagRule =>
    ({ id, tag: `science/${id}`, category: 'science', chance: 0, when: true, ...over });
  const restore = (cat: TagCategory) => tagCategories.update((cs) => cs.map((c) => (c.id === cat.id ? cat : c)));

  it('goes LAST, and no other rule moves', () => {
    const original = science();
    const before = order();
    // Exactly what TagCategoryEditor.saveRule sends: the category with one more rule, no seq on it.
    upsertCategory({ ...original, rules: [...original.rules, rule('zz-added')] });
    const after = order();
    restore(original);
    expect(after.indexOf('zz-added'), 'the new rule is dealt after every existing one').toBe(after.length - 1);
    expect(after.slice(0, -1), 'and the order of the rest is untouched').toEqual(before);
  });

  it('two added together keep the order they were listed in', () => {
    const original = science();
    upsertCategory({ ...original, rules: [...original.rules, rule('zz-first'), rule('zz-second')] });
    const after = order();
    restore(original);
    expect(after.slice(-2)).toEqual(['zz-first', 'zz-second']);
  });

  it('a rule in a brand-new category is seated too', () => {
    const before = order();
    upsertCategory({
      id: 'zz-seat-test', shortName: 'T', longName: 'T', color: '#123456', appliesTo: ['planet'], enabled: true, tags: [],
      rules: [{ id: 'zz-fresh', tag: 'zz-seat-test/x', category: 'zz-seat-test', chance: 0, when: true }]
    });
    const after = order();
    deleteCategory('zz-seat-test');
    expect(after).toEqual([...before, 'zz-fresh']);
  });

  it('does NOT move a rule that is already there with no seq - that would be the same reshuffle, once', () => {
    // A rule authored on an older build: in the store, seq-less, sorting where it always has.
    const original = science();
    const legacy = rule('zz-legacy');
    tagCategories.update((cs) => cs.map((c) => (c.id === 'science' ? { ...c, rules: [...c.rules, legacy] } : c)));
    const before = order();
    upsertCategory({ ...science(), description: 'an unrelated edit to the same category' });
    const after = order();
    restore(original);
    expect(science().rules.some((r) => r.id === 'zz-legacy')).toBe(false);   // cleaned up
    expect(after).toEqual(before);
  });

  it('editing an existing rule keeps its place', () => {
    const original = science();
    const before = order();
    const target = original.rules[0];
    upsertCategory({ ...original, rules: original.rules.map((r) => (r.id === target.id ? { ...r, chance: 0.01 } : r)) });
    const after = order();
    restore(original);
    expect(after).toEqual(before);
  });
});
