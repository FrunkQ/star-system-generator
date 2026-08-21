// G34: the runtime copy of the campaign's per-quantity × body-type unit choices, plus the ONE
// writer that cycles them. Same architecture as `measurementUnit`/`temperatureUnit` in stores.ts:
// SOURCE OF TRUTH is the loaded starmap's `unitPrefs` (campaign data — it rides save, bundle and
// the player snapshot); the GM app keeps this store in sync on load, and a player/projector window
// sets it from the broadcast snapshot instead — so display code has one reactive value to read
// regardless of whether a full starmap is present.
import { writable, get } from 'svelte/store';
import type { Starmap } from './types';
import { starmapStore } from './starmapStore';
import {
  cycleUnit, resolveUnitPref, unitPrefKey,
  type UnitPrefs, type UnitQuantity, type UnitBodyType
} from './units';

export const unitPrefs = writable<UnitPrefs>({});

// True on a surface that must not offer the cycle affordance — player views inherit the GM's units
// non-interactively. The player shell sets it; <UnitValue> renders a plain label when locked.
export const unitPrefsLocked = writable(false);

// Keep the runtime store in sync with the loaded starmap. Reference-guarded because the starmap
// store fires on every map touch and `unitPrefs` only changes when a pref is cycled — without the
// guard every subscriber would recompute on every autosave tick.
let lastSynced: Record<string, string> | undefined | null = null;
export function syncUnitPrefsFromStarmap(map: Starmap | null): void {
  const p = map?.unitPrefs;
  if (p === lastSynced) return;
  lastSynced = p;
  unitPrefs.set(p ?? {});
}

// Cycle the pref for one quantity × body type — every field showing that pairing follows at once.
// Writes the STARMAP when one is loaded (campaign data: the change persists via the existing
// autosave and reaches players on the next snapshot); the runtime store then follows through the
// sync above. Without a starmap (bare player window) it writes the runtime store alone.
export function cycleUnitPref(q: UnitQuantity, b: UnitBodyType): void {
  const next = cycleUnit(q, resolveUnitPref(get(unitPrefs), q, b));
  const key = unitPrefKey(q, b);
  if (get(starmapStore)) {
    starmapStore.update(m => m ? { ...m, unitPrefs: { ...m.unitPrefs, [key]: next } } : m);
  } else {
    unitPrefs.update(p => ({ ...p, [key]: next }));
  }
}
