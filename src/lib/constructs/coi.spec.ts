import { describe, it, expect } from 'vitest';
import { tagCategories, updateTagDef, addTagToCategory, type TagCategory } from '../tags/tagCategories';
import { coiForStarmap } from './coi';
import { DEFAULT_COI_CATEGORIES, toggleCoI, constructHasCoI, constructTardiness, constructReadiness, mergeStarmapCoIs, coiCategories, activeCoICategories, exportCoIs, importCoIs, orphanedCoITags, removeCoITag, normalizeCoIs, derivedStatusKey, addCoITag, type CoICategory } from './coi';
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
  it('Status is first, required, multi-select, with derived states + readiness blockers and NO Active tag', () => {
    expect(DEFAULT_COI_CATEGORIES[0].id).toBe('status');
    const status = DEFAULT_COI_CATEGORIES[0];
    expect(status.required).toBe(true);
    expect(status.single).toBe(false);                                   // a ship can be Damaged AND Quarantined
    expect(status.tags.some((t) => t.key === 'status/active')).toBe(false); // Active removed — operational is the default
    expect(status.tags.find((t) => t.key === 'status/adrift')?.derived).toBe(true);
    expect(status.tags.find((t) => t.key === 'status/adrift')?.readiness).toBe(0);
    expect(status.tags.find((t) => t.key === 'status/derelict')?.readiness).toBe(0);
    expect(status.tags.find((t) => t.key === 'status/construction')?.readiness).toBe(0.5);
    expect(status.tags.find((t) => t.key === 'status/in-transit-interstellar')?.derived).toBe(true);
  });
  it('the six CORE categories (Status, Owner, Purpose, Resources, Hull class, FTL drive) are required', () => {
    for (const id of ['status', 'owner', 'purpose', 'resource', 'class', 'drive']) {
      expect(DEFAULT_COI_CATEGORIES.find((c) => c.id === id)?.required).toBe(true);
    }
    // Universe / Tech / Disposition are NOT core (can be toggled off)
    for (const id of ['universe', 'tech', 'disposition']) {
      expect(DEFAULT_COI_CATEGORIES.find((c) => c.id === id)?.required).not.toBe(true);
    }
  });
  it('FTL drive lists FTL methods only — no sublight/torch/solar-sail/generation; generation is a Hull class', () => {
    const drive = DEFAULT_COI_CATEGORIES.find((c) => c.id === 'drive')!;
    const keys = drive.tags.map((t) => t.key);
    expect(keys).toContain('drive/jump-drive');
    for (const gone of ['drive/sublight', 'drive/torch', 'drive/solar-sail', 'drive/generation']) {
      expect(keys).not.toContain(gone);
    }
    const cls = DEFAULT_COI_CATEGORIES.find((c) => c.id === 'class')!.tags.map((t) => t.key);
    expect(cls).toContain('class/generation-ship');
    expect(cls).toEqual(expect.arrayContaining(['class/yacht', 'class/racer']));
  });
  it('normalizeCoIs re-adds a dropped core category, forces it enabled, strips legacy Active, keeps derived', () => {
    // a stale/hand-broken set: owner disabled, wrong order, and a stale status set still carrying Active
    const broken: CoICategory[] = [
      { id: 'class', label: 'Hull', enabled: true, tags: [{ key: 'class/x', label: 'X' }] },
      { id: 'owner', label: 'Owner', enabled: false, required: true, single: true, tags: [{ key: 'owner/military', label: 'Mil' }] },
      { id: 'status', label: 'Status', required: true, enabled: true, tags: [{ key: 'status/active', label: 'Active', locked: true }, { key: 'status/damaged', label: 'Damaged' }] }
    ];
    const fixed = normalizeCoIs(broken);
    expect(fixed[0].id).toBe('status');                                  // core first, status top
    const st = fixed.find((c) => c.id === 'status')!;
    expect(st.tags.some((t) => t.key === 'status/active')).toBe(false);  // legacy Active stripped
    expect(st.tags.find((t) => t.key === 'status/adrift')?.derived).toBe(true); // derived re-added
    expect(fixed.find((c) => c.id === 'owner')?.enabled).toBe(true);     // re-enabled
    expect(fixed.find((c) => c.id === 'class')).toBeTruthy();            // non-core kept
  });
});

describe('constructReadiness (operational capability — no Active tag)', () => {
  it('is 1 by default, else the lowest status blocker; ignores non-status tags', () => {
    const base = { id: 'c', name: 'C', kind: 'construct', parentId: null, tags: [] } as any;
    expect(constructReadiness(base, DEFAULT_COI_CATEGORIES)).toBe(1);                              // operational by default
    expect(constructReadiness({ ...base, tags: [{ key: 'status/derelict' }] }, DEFAULT_COI_CATEGORIES)).toBe(0);     // dead
    expect(constructReadiness({ ...base, tags: [{ key: 'status/construction' }] }, DEFAULT_COI_CATEGORIES)).toBe(0.5); // half drive
    expect(constructReadiness({ ...base, tags: [{ key: 'status/damaged' }, { key: 'status/derelict' }] }, DEFAULT_COI_CATEGORIES)).toBe(0); // lowest wins
    expect(constructReadiness({ ...base, tags: [{ key: 'purpose/patrol' }, { key: 'status/captured' }] }, DEFAULT_COI_CATEGORIES)).toBe(1); // non-blocking
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
  it('the core trio plus Resources, Universe, Hull class, FTL drive and Tech default on (only Disposition off)', () => {
    const on = DEFAULT_COI_CATEGORIES.filter((c) => c.enabled === true).map((c) => c.id).sort();
    expect(on).toEqual(['class', 'drive', 'owner', 'purpose', 'resource', 'status', 'tech', 'universe']);
    expect(DEFAULT_COI_CATEGORIES.find((c) => c.id === 'disposition')?.enabled).not.toBe(true);
  });
  it('Profile and Cargo are not default categories (Resources reuses the resource/ namespace)', () => {
    const ids = DEFAULT_COI_CATEGORIES.map((c) => c.id);
    expect(ids).not.toContain('profile');
    expect(ids).not.toContain('cargo');
    expect(ids).toContain('resource');
  });
  it('activeCoICategories filters to enabled only', () => {
    const active = activeCoICategories(DEFAULT_COI_CATEGORIES);
    expect(active.every((c) => c.enabled === true)).toBe(true);
    expect(active.some((c) => c.id === 'disposition')).toBe(false);   // Disposition default off
  });
});

describe('CoI save / load pack', () => {
  it('round-trips through export/import', () => {
    const json = exportCoIs(DEFAULT_COI_CATEGORIES);
    expect(json).toContain('sse-coi-pack');
    const back = importCoIs(json);
    // import re-normalises (CORE categories sorted first), so compare as a set, not by order.
    expect(back.map((c) => c.id).sort()).toEqual(DEFAULT_COI_CATEGORIES.map((c) => c.id).sort());
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
    s.tags = [{ key: 'disposition/hostile', manual: true, coi: true } as any];   // Disposition is default OFF
    const orph = orphanedCoITags(s, DEFAULT_COI_CATEGORIES);
    expect(orph.map((o) => o.key)).toContain('disposition/hostile');
    expect(orph[0].label).toBe('Hostile');                                       // label still resolved from the disabled category
    removeCoITag(s, 'disposition/hostile');
    expect(s.tags!.some((t) => t.key === 'disposition/hostile')).toBe(false);
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

// OPENING YOUR OWN SAVED STARMAP WIPED EVERY PER-TAG COLOUR. A save carries the construct-side
// categories in the old CoI shape, which has no field for a tag's own colour, hover description or
// hidden-by-default flag; the merge then replaced the store's tag list with the file's, so all three
// were gone for every category the file carried. "One Faction category, a different colour per
// faction" is the feature the Tags editor advertises - and it did not survive a save and a load.
describe('opening a saved starmap keeps what the file cannot carry about a tag', () => {
  const owner = () => get(tagCategories).find((c) => c.id === 'owner')!;
  const restore = (cat: TagCategory) => tagCategories.update((cs) => cs.map((c) => (c.id === cat.id ? cat : c)));

  it('a per-tag colour, description and hidden-by-default survive the round trip', () => {
    const original = owner();
    // What a GM actually does: add a faction to Owner, and give it its own flag colour.
    const key = addTagToCategory('owner', 'Zz House Atreides')!;
    updateTagDef('owner', key, { color: '#c0ffee', textColor: '#101010', description: 'Flies the green ensign.', secretDefault: true });
    // The save, exactly as `registriesForStarmap` writes it, through the file.
    const saved = JSON.parse(JSON.stringify(coiForStarmap()));
    const inFile = saved.find((c: any) => c.id === 'owner')?.tags.find((t: any) => t.key === key);
    expect(inFile, 'the new faction is in the save').toBeTruthy();
    expect(inFile.color, 'and the file has no field for its colour').toBeUndefined();
    mergeStarmapCoIs(saved);
    const after = owner().tags.find((t) => t.key === key)!;
    restore(original);
    expect(after.color).toBe('#c0ffee');
    expect(after.textColor).toBe('#101010');
    expect(after.description).toBe('Flies the green ensign.');
    expect(after.secretDefault).toBe(true);
  });

  it('a value the file DOES state still wins', () => {
    const original = owner();
    const key = original.tags[0].key;
    updateTagDef('owner', key, { color: '#c0ffee' });
    mergeStarmapCoIs([{ id: 'owner', label: 'Owner', tags: [{ key, label: 'Renamed in the file', color: '#000001' } as any] }]);
    const after = owner().tags.find((t) => t.key === key)!;
    restore(original);
    expect(after.label).toBe('Renamed in the file');
    expect(after.color).toBe('#000001');
  });
});

describe('mergeStarmapCoIs', () => {
  it('replaces a category by id and appends new ones', () => {
    mergeStarmapCoIs([{ id: 'faction', label: 'Faction', tags: [{ key: 'faction/empire', label: 'Empire' }] }]);
    const cats = (() => { let v: any; coiCategories.subscribe((x) => (v = x))(); return v; })();
    expect(cats.some((c: any) => c.id === 'faction')).toBe(true);
  });
});
