// THE SIX CATEGORIES THAT CANNOT BE SWITCHED OFF, AND THE TWO THAT CAN (G93).
//
// Owner, 2026-09-08, on seeing the Tagging screen: "System categories should not be switch off-able
// - we use some of them in other calcs!" ... then, on the split: "Lock the six, leave frontier and
// anomaly toggleable. Frontier is setting specific and other users will have different ones. The
// rest are USED and are general and can be reused."
//
// WHAT WAS ACTUALLY WRONG, measured before the change: `setCategoryEnabled` set `enabled`
// unconditionally, while the LOAD path forces these six back on (`enabled: src.enabled === true ||
// src.required === true`). So unticking Status held for the session and silently reverted on
// reload - a control that appeared to work and did not stay set, which is worse than either answer.
//
// AND WHAT WAS NOT WRONG, which is the more important half and is pinned below: the calculations
// were never at risk. `constructReadiness` finds the status category BY ID across every category,
// enabled or not, and reads the construct's own tags - so a damaged ship still limps whatever this
// screen says. The fault was a control offering to hide something the engine is still using.
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  tagCategories,
  setCategoryEnabled,
  isLockedCategory,
  isSystemCategory,
  LOCKED_CATEGORY_IDS,
  SYSTEM_CATEGORY_IDS
} from './tagCategories';

const idsOf = () => get(tagCategories).map((c) => c.id);
const enabledOf = (id: string) => get(tagCategories).find((c) => c.id === id)?.enabled;

describe('G93 - the locked six', () => {
  it('is exactly the six the engine reuses on every map', () => {
    expect([...LOCKED_CATEGORY_IDS].sort())
      .toEqual(['class', 'drive', 'owner', 'purpose', 'resource', 'status']);
  });

  it('REFUSES to switch one off', () => {
    for (const id of LOCKED_CATEGORY_IDS) {
      if (!idsOf().includes(id)) continue;
      setCategoryEnabled(id, false);
      expect(enabledOf(id), `${id} was switched off`).toBe(true);
    }
  });

  it('...and switching one ON is still allowed, so a stale campaign can be repaired', () => {
    // A campaign saved while one was off must not be stuck: the guard is one-directional.
    for (const id of LOCKED_CATEGORY_IDS) {
      if (!idsOf().includes(id)) continue;
      setCategoryEnabled(id, true);
      expect(enabledOf(id)).toBe(true);
    }
  });
});

describe('G93 - frontier and anomaly stay the GM\'s to switch', () => {
  const toggleable = ['frontier', 'anomaly'];

  it('they are SYSTEM but NOT locked - the two ideas are different', () => {
    for (const id of toggleable) {
      expect(isSystemCategory(id), `${id} should still be system`).toBe(true);
      expect(isLockedCategory(id), `${id} must stay toggleable`).toBe(false);
    }
  });

  it('and they really do switch off, and back on', () => {
    for (const id of toggleable) {
      if (!idsOf().includes(id)) continue;
      setCategoryEnabled(id, false);
      expect(enabledOf(id), `${id} would not switch off`).toBe(false);
      setCategoryEnabled(id, true);
      expect(enabledOf(id)).toBe(true);
    }
  });

  it('every locked category is a system one, but not the reverse', () => {
    for (const id of LOCKED_CATEGORY_IDS) expect(isSystemCategory(id), id).toBe(true);
    expect(SYSTEM_CATEGORY_IDS.length).toBeGreaterThan(LOCKED_CATEGORY_IDS.length);
  });

  it('an ordinary category is neither, and is untouched by any of this', () => {
    expect(isLockedCategory('mystery')).toBe(false);
    expect(isSystemCategory('mystery')).toBe(false);
  });
});

describe('G93 - the calculations never depended on this', () => {
  it('readiness reads the construct\'s own tags, not the enabled list', async () => {
    // The reassuring half, pinned so nobody "optimises" the lookup into `activeTagCategories` and
    // makes a settings tickbox able to stop a damaged ship being damaged.
    const { constructReadiness } = await import('$lib/constructs/coi');
    const adrift = { id: 'c', tags: [{ key: 'status/adrift' }] } as any;
    const before = constructReadiness(adrift);
    setCategoryEnabled('status', false); // refused, but prove the answer regardless
    expect(constructReadiness(adrift)).toBe(before);
    expect(before).toBeLessThan(1);
  });
});
