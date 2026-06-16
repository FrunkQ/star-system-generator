import { describe, it, expect } from 'vitest';
import { DEFAULT_COI_CATEGORIES, toggleCoI, constructHasCoI, constructTardiness, mergeStarmapCoIs, coiCategories } from './coi';
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
