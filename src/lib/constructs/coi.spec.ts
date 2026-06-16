import { describe, it, expect } from 'vitest';
import { DEFAULT_COI_CATEGORIES, toggleCoI, constructHasCoI, constructTardiness, mergeStarmapCoIs, coiCategories, activeCoICategories, exportCoIs, importCoIs, orphanedCoITags, removeCoITag, normalizeCoIs, derivedStatusKey, addCoITag, type CoICategory } from './coi';
import { get } from 'svelte/store';
import type { CelestialBody } from '../types';

const ship = (): CelestialBody => ({ id: 's', name: 'Ship', kind: 'construct', parentId: null, tags: [] } as any);
const owner = DEFAULT_COI_CATEGORIES.find((c) => c.id === 'owner')!;
const purpose = DEFAULT_COI_CATEGORIES.find((c) => c.id === 'purpose')!;

describe('CoI defaults', () => {
  it('owner is single-select and carries the tardiness mapping', () => {
    expect(owner.single).toBe(true);
    const t = (k: string) => owner.tags.find((x) => x.key === k)?.tardiness;
    expect(t('owner/military')).toBe(0);
    expect(t('owner/corporation')).toBe(0.25);
    expect(t('owner/consortium')).toBe(0.5);
    expect(t('owner/pirate')).toBe(0.75);
    expect(t('owner/owner-operator')).toBe(1);
  });
  it('purpose is multi-select with the starter list', () => {
    expect(purpose.single).toBe(false);
    expect(purpose.tags.map((t) => t.key)).toContain('purpose/patrol');
    expect(purpose.tags.map((t) => t.key)).toContain('purpose/mining');
  });
});

describe('core categories (autopilot needs Status, Owner, Purpose)', () => {
  it('Status is first, required, multi-select, with a locked Active + derived states', () => {
    expect(DEFAULT_COI_CATEGORIES[0].id).toBe('status');
    const status = DEFAULT_COI_CATEGORIES[0];
    expect(status.required).toBe(true);
    expect(status.single).toBe(false);                                   // a ship can be Damaged AND Active
    expect(status.tags.find((t) => t.key === 'status/active')?.locked).toBe(true);
    expect(status.tags.find((t) => t.key === 'status/adrift')?.derived).toBe(true);
    expect(status.tags.find((t) => t.key === 'status/in-transit-interstellar')?.derived).toBe(true);
    expect(status.tags.find((t) => t.key === 'status/in-transit-system')?.derived).toBe(true);
  });
  it('Status, Owner and Purpose are all required', () => {
    for (const id of ['status', 'owner', 'purpose']) {
      expect(DEFAULT_COI_CATEGORIES.find((c) => c.id === id)?.required).toBe(true);
    }
  });
  it('normalizeCoIs re-adds a dropped core category, forces it enabled, and locks Active', () => {
    // a stale/hand-broken set: no status, owner disabled, in the wrong order
    const broken: CoICategory[] = [
      { id: 'class', label: 'Hull', enabled: true, tags: [{ key: 'class/x', label: 'X' }] },
      { id: 'owner', label: 'Owner', enabled: false, required: true, single: true, tags: [{ key: 'owner/military', label: 'Mil' }] }
    ];
    const fixed = normalizeCoIs(broken);
    expect(fixed[0].id).toBe('status');                                  // core first, status top
    expect(fixed.find((c) => c.id === 'status')?.tags.some((t) => t.key === 'status/active' && t.locked)).toBe(true);
    expect(fixed.find((c) => c.id === 'owner')?.enabled).toBe(true);     // re-enabled
    expect(fixed.find((c) => c.id === 'class')).toBeTruthy();            // non-core kept
  });
});

describe('ensureConstructActiveTag (legacy ships default to Active)', () => {
  it('adds status/active to a construct with no status tag, idempotently', async () => {
    const { ensureConstructActiveTag } = await import('./coi');
    const s = { id: 'c', name: 'C', kind: 'construct', parentId: null, tags: [] } as any;
    expect(ensureConstructActiveTag(s)).toBe(true);
    expect(s.tags.some((t: any) => t.key === 'status/active')).toBe(true);
    expect(ensureConstructActiveTag(s)).toBe(false);   // idempotent
    const tagged = { id: 'c2', name: 'C2', kind: 'construct', parentId: null, tags: [{ key: 'status/damaged' }] } as any;
    expect(ensureConstructActiveTag(tagged)).toBe(false);   // already has a status — leave it
  });
});

describe('addCoITag (custom-tag adder)', () => {
  it('adds a tag to an existing category (so it shows everywhere)', () => {
    const key = addCoITag('purpose', 'Purpose', 'Privateer');
    expect(key).toBe('purpose/privateer');
    const purpose = get(coiCategories).find((c) => c.id === 'purpose')!;
    expect(purpose.tags.some((t) => t.key === 'purpose/privateer' && t.label === 'Privateer')).toBe(true);
  });
  it('creates a Custom category for a free tag', () => {
    const key = addCoITag('custom', 'Custom', 'Flagship');
    expect(key).toBe('custom/flagship');
    const custom = get(coiCategories).find((c) => c.id === 'custom');
    expect(custom?.enabled).toBe(true);
    expect(custom?.tags.some((t) => t.key === 'custom/flagship')).toBe(true);
  });
});

describe('derived status mirrors internal state', () => {
  it('maps placement kind to a status tag', () => {
    expect(derivedStatusKey('transit')).toBe('status/in-transit-interstellar');
    expect(derivedStatusKey('adrift')).toBe('status/adrift');
    expect(derivedStatusKey('system')).toBeNull();
  });
});

describe('CoI enabled / active set', () => {
  it('only Owner, Purpose and Status default on', () => {
    const on = DEFAULT_COI_CATEGORIES.filter((c) => c.enabled === true).map((c) => c.id).sort();
    expect(on).toEqual(['owner', 'purpose', 'status']);
  });
  it('Profile and Cargo are not default categories', () => {
    const ids = DEFAULT_COI_CATEGORIES.map((c) => c.id);
    expect(ids).not.toContain('profile');
    expect(ids).not.toContain('cargo');
  });
  it('activeCoICategories filters to enabled only', () => {
    const active = activeCoICategories(DEFAULT_COI_CATEGORIES);
    expect(active.every((c) => c.enabled === true)).toBe(true);
    expect(active.some((c) => c.id === 'class')).toBe(false);   // Hull class default off
  });
});

describe('CoI save / load pack', () => {
  it('round-trips through export/import', () => {
    const json = exportCoIs(DEFAULT_COI_CATEGORIES);
    expect(json).toContain('sse-coi-pack');
    const back = importCoIs(json);
    expect(back.map((c) => c.id)).toEqual(DEFAULT_COI_CATEGORIES.map((c) => c.id));
    expect(() => importCoIs('{"nope":1}')).toThrow();
  });
});

describe('toggleCoI', () => {
  it('multi-select category keeps multiple tags', () => {
    const s = ship();
    toggleCoI(s, purpose, 'purpose/patrol');
    toggleCoI(s, purpose, 'purpose/refuel');
    expect(constructHasCoI(s, 'purpose/patrol')).toBe(true);
    expect(constructHasCoI(s, 'purpose/refuel')).toBe(true);
  });
  it('single-select category replaces the previous choice', () => {
    const s = ship();
    toggleCoI(s, owner, 'owner/military');
    toggleCoI(s, owner, 'owner/corporation');
    expect(constructHasCoI(s, 'owner/military')).toBe(false);   // replaced
    expect(constructHasCoI(s, 'owner/corporation')).toBe(true);
  });
  it('toggling an applied tag removes it; CoI tags are flagged manual', () => {
    const s = ship();
    toggleCoI(s, purpose, 'purpose/mining');
    expect(s.tags!.find((t) => t.key === 'purpose/mining')?.manual).toBe(true);
    toggleCoI(s, purpose, 'purpose/mining');
    expect(constructHasCoI(s, 'purpose/mining')).toBe(false);
  });
});

describe('orphaned CoI tags (category turned off / removed)', () => {
  it('a CoI tag from an inactive category is reported orphaned, labelled, and removable', () => {
    const s = ship();
    s.tags = [{ key: 'class/cruiser', manual: true, coi: true } as any];   // Hull class is default OFF
    const orph = orphanedCoITags(s, DEFAULT_COI_CATEGORIES);
    expect(orph.map((o) => o.key)).toContain('class/cruiser');
    expect(orph[0].label).toBe('Cruiser');                                  // label still resolved from the disabled category
    removeCoITag(s, 'class/cruiser');
    expect(s.tags!.some((t) => t.key === 'class/cruiser')).toBe(false);
  });
  it('a tag in an active category is not orphaned', () => {
    const s = ship();
    toggleCoI(s, purpose, 'purpose/patrol');
    expect(orphanedCoITags(s, DEFAULT_COI_CATEGORIES).length).toBe(0);
  });
});

describe('constructTardiness', () => {
  it('reflects the owner CoI', () => {
    const s = ship();
    expect(constructTardiness(s)).toBeUndefined();
    toggleCoI(s, owner, 'owner/pirate');
    expect(constructTardiness(s)).toBe(0.75);
  });
});

describe('mergeStarmapCoIs', () => {
  it('replaces a category by id and appends new ones', () => {
    mergeStarmapCoIs([{ id: 'faction', label: 'Faction', tags: [{ key: 'faction/empire', label: 'Empire' }] }]);
    const cats = (() => { let v: any; coiCategories.subscribe((x) => (v = x))(); return v; })();
    expect(cats.some((c: any) => c.id === 'faction')).toBe(true);
  });
});
