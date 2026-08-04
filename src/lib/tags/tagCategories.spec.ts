// Migrating two stores into one, and the two ways it silently went wrong.
//
// Both faults below were caught by `solar-system-derived.json` moving, not by any assertion — which
// is exactly the argument for that baseline, and exactly the argument for these tests, because the
// baseline can only say THAT something moved, never why.
import { describe, it, expect } from 'vitest';
import { migrateLegacyCategories, normalizeTagCategories, isSystemCategory, SYSTEM_CATEGORY_IDS, resolveTagColor, type TagCategory } from './tagCategories';
import { DEFAULT_COI_CATEGORIES, DEFAULT_POI_PACK, REASONS_DEFAULTS } from './tagDefaults';

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
