// Migrating two stores into one, and the two ways it silently went wrong.
//
// Both faults below were caught by `solar-system-derived.json` moving, not by any assertion — which
// is exactly the argument for that baseline, and exactly the argument for these tests, because the
// baseline can only say THAT something moved, never why.
import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { migrateLegacyCategories, normalizeTagCategories, isSystemCategory, SYSTEM_CATEGORY_IDS, resolveTagColor, tagCategories, upsertCategory, deleteCategory, exportCategory, importCategory, addImportedCategory, rehomeCategory, freeCategoryId, type TagCategory, type TagRule } from './tagCategories';
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

// "importing a tag catagory makes the tag just reset rather then actually import", and "there
// doesnt seem to be a way to import a COPY of a tag catagory" (a GM, 2026-10-23, whose workaround
// was to rename the namespace in the exported file by hand).
//
// Three things were wrong on that one path, and each has a block below: a file whose namespace was
// already in use overwrote the GM's category without asking; there was no way to land it beside
// the original; and a file with a hand-renamed `id` became a category whose tags and rules all
// still lived in the OLD namespace.
describe('importing a tag category', () => {
  const byNs = (id: string) => get(tagCategories).find((c) => c.id === id);
  const order = () => get(poiPacks)[0].rules.map((r) => r.id);
  const faction = (): TagCategory => ({
    id: 'zz-faction', shortName: 'Faction', longName: 'Faction', color: '#aa2222', appliesTo: ['planet'], enabled: true,
    tags: [{ key: 'zz-faction/reds', label: 'Reds', color: '#ff0000' }, { key: 'zz-faction/blues', label: 'Blues' }],
    rules: [
      { id: 'zr1', tag: 'zz-faction/reds', category: 'zz-faction', chance: 0.5, when: { not: { hasTag: 'zz-faction/blues' } } },
      { id: 'zr2', tag: 'zz-faction/blues', category: 'zz-faction', chance: 0.5, when: { all: [{ hasTagPrefix: 'zz-faction/' }, { eq: ['tag:zz-faction/reds', 'strong'] }, { hasTag: 'resource/helium-3' }] } }
    ]
  });
  const cleanup = () => { for (const c of get(tagCategories)) if (c.id.startsWith('zz-')) deleteCategory(c.id); };

  describe('a namespace already in use has to be answered, never silently overwritten', () => {
    it('refuses to choose for the GM', () => {
      upsertCategory(faction());
      const file = importCategory(exportCategory({ ...faction(), longName: 'Faction as exported last week', tags: [] }));
      expect(() => addImportedCategory(file)).toThrow(/already exists/);
      // ...and the category the GM has is exactly as it was.
      expect(byNs('zz-faction')!.longName).toBe('Faction');
      expect(byNs('zz-faction')!.tags).toHaveLength(2);
      cleanup();
    });

    it('REPLACE takes the incoming definition whole', () => {
      upsertCategory(faction());
      const file = importCategory(exportCategory({
        ...faction(), longName: 'Houses', color: '#00aa00',
        tags: [{ key: 'zz-faction/greens', label: 'Greens' }], rules: []
      }));
      expect(addImportedCategory(file, 'replace')).toBe('zz-faction');
      const now = byNs('zz-faction')!;
      expect(now.longName).toBe('Houses');
      expect(now.color).toBe('#00aa00');
      expect(now.tags.map((t) => t.key)).toEqual(['zz-faction/greens']);
      expect(now.rules).toHaveLength(0);
      expect(get(tagCategories).filter((c) => c.id.startsWith('zz-faction'))).toHaveLength(1);
      cleanup();
    });

    it('COPY lands the file beside the original, under its own namespace, and leaves the original alone', () => {
      upsertCategory(faction());
      const mine = structuredClone(byNs('zz-faction')!);
      const landed = addImportedCategory(importCategory(exportCategory(faction())), 'copy');
      expect(landed).toBe('zz-faction-copy');
      expect(byNs('zz-faction')).toEqual(mine);
      const copy = byNs('zz-faction-copy')!;
      expect(copy.longName).toBe('Faction (copy)');
      // Every tag and every rule moved into the copy's own namespace...
      expect(copy.tags.map((t) => t.key)).toEqual(['zz-faction-copy/reds', 'zz-faction-copy/blues']);
      expect(copy.tags[0].color, 'a per-tag colour comes with it').toBe('#ff0000');
      expect(copy.rules.map((r) => [r.tag, r.category])).toEqual([
        ['zz-faction-copy/reds', 'zz-faction-copy'], ['zz-faction-copy/blues', 'zz-faction-copy']
      ]);
      // ...with ids of their own, so nothing looked up by rule id confuses the two.
      const ids = get(tagCategories).flatMap((c) => c.rules.map((r) => r.id));
      expect(new Set(ids).size).toBe(ids.length);
      cleanup();
    });

    it('a copy\'s conditions follow its own tags, and keep pointing at anybody else\'s', () => {
      upsertCategory(faction());
      addImportedCategory(importCategory(exportCategory(faction())), 'copy');
      const [r1, r2] = byNs('zz-faction-copy')!.rules;
      expect(r1.when).toEqual({ not: { hasTag: 'zz-faction-copy/blues' } });
      expect(r2.when).toEqual({ all: [
        { hasTagPrefix: 'zz-faction-copy/' },
        { eq: ['tag:zz-faction-copy/reds', 'strong'] },
        { hasTag: 'resource/helium-3' }                      // not this category's tag - untouched
      ] });
      cleanup();
    });

    it('a second copy takes the next free namespace', () => {
      upsertCategory(faction());
      addImportedCategory(importCategory(exportCategory(faction())), 'copy');
      expect(addImportedCategory(importCategory(exportCategory(faction())), 'copy')).toBe('zz-faction-copy-2');
      expect(freeCategoryId(get(tagCategories), 'zz-faction')).toBe('zz-faction-copy-3');
      cleanup();
    });

    it('a copy of a SYSTEM category is an ordinary category the GM can delete', () => {
      const status = byNs('status')!;
      const landed = addImportedCategory(importCategory(exportCategory(status)), 'copy');
      const copy = byNs(landed)!;
      expect(landed).toBe('status-copy');
      expect(copy.system).toBeUndefined();
      expect(copy.tags.some((t) => t.locked || t.derived), 'no tag the GM could never remove').toBe(false);
      expect(byNs('status')).toEqual(status);
      expect(deleteCategory(landed)).toBe(true);
    });
  });

  it('a file with no clash is simply added', () => {
    expect(addImportedCategory(importCategory(exportCategory(faction())))).toBe('zz-faction');
    expect(byNs('zz-faction')!.tags).toHaveLength(2);
    cleanup();
  });

  // The GM's own workaround: rename `"id"` in the exported file. That gave a category called
  // `zz-houses` whose tags and rules were all still `zz-faction/...`.
  it('a file whose id was renamed by hand comes in wholly inside the namespace it names', () => {
    const file = exportCategory(faction()).replace('"id": "zz-faction"', '"id": "zz-houses"');
    const cat = importCategory(file);
    expect(cat.id).toBe('zz-houses');
    expect(cat.tags.map((t) => t.key)).toEqual(['zz-houses/reds', 'zz-houses/blues']);
    expect(cat.rules.every((r) => r.category === 'zz-houses' && r.tag.startsWith('zz-houses/'))).toBe(true);
    expect(cat.rules[0].when).toEqual({ not: { hasTag: 'zz-houses/blues' } });
  });

  it('a well-formed file is not changed by being re-homed onto its own id', () => {
    const cat = faction();
    expect(rehomeCategory(cat, cat.id)).toEqual(cat);
    for (const shipped of get(tagCategories)) expect(rehomeCategory(shipped, shipped.id), shipped.id).toEqual(shipped);
  });

  // TAG-8 again, at the import door: an exported category's rules carry the seq numbers of the
  // store that exported them, which here are the very numbers the originals still hold.
  it('importing never changes the order the rules already here are dealt in', () => {
    const before = order();
    const science = byNs('science')!;
    const landed = addImportedCategory(importCategory(exportCategory(science)), 'copy');
    const after = order();
    deleteCategory(landed);
    expect(after.slice(0, before.length), 'every rule that was here is dealt exactly as before').toEqual(before);
    expect(after.length).toBe(before.length + science.rules.length);
  });

  it('replacing a category with its own export moves nothing either', () => {
    const before = order();
    const science = structuredClone(byNs('science')!);
    addImportedCategory(importCategory(exportCategory(science)), 'replace');
    expect(order()).toEqual(before);
    expect(byNs('science')).toEqual(science);
  });

  it('still rejects a file that is not a category', () => {
    expect(() => importCategory('{"hello": "world"}')).toThrow(/Not a tag category file/);
    expect(() => importCategory(JSON.stringify({ id: '///', tags: [] }))).toThrow(/Not a tag category file/);
  });
});
