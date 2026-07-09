// The live list of player presets = shipped built-ins + the campaign's own (saved on the starmap).
// CRUD here mutates starmap.playerPresets so presets travel with the map. See presets.ts / the design
// doc. Built-ins are read-only (duplicate to edit).
import { derived } from 'svelte/store';
import { starmapStore } from '$lib/starmapStore';
import type { Starmap } from '$lib/types';
import type { PlayerPreset } from './presetTypes';
import { BUILTIN_PRESETS, migrateLocalHoloPresets, duplicatePreset } from './presets';

// Built-ins first, then the campaign's custom presets. Always a fresh array.
export const playerPresetList = derived(starmapStore, ($sm): PlayerPreset[] => {
  return [...BUILTIN_PRESETS, ...($sm?.playerPresets ?? [])];
});

function allIds(sm: Starmap | null): string[] {
  return [...BUILTIN_PRESETS, ...(sm?.playerPresets ?? [])].map((p) => p.id);
}

export function addPreset(p: PlayerPreset): void {
  starmapStore.update((sm) => (sm ? { ...sm, playerPresets: [...(sm.playerPresets ?? []), p] } : sm));
}

export function updatePreset(p: PlayerPreset): void {
  starmapStore.update((sm) =>
    sm ? { ...sm, playerPresets: (sm.playerPresets ?? []).map((x) => (x.id === p.id ? p : x)) } : sm
  );
}

export function deletePreset(id: string): void {
  starmapStore.update((sm) =>
    sm ? { ...sm, playerPresets: (sm.playerPresets ?? []).filter((x) => x.id !== id) } : sm
  );
}

// Duplicate any preset (built-in or custom) into an editable campaign copy; returns the copy.
export function duplicateIntoStarmap(src: PlayerPreset): PlayerPreset | null {
  let copy: PlayerPreset | null = null;
  starmapStore.update((sm) => {
    if (!sm) return sm;
    copy = duplicatePreset(src, allIds(sm));
    return { ...sm, playerPresets: [...(sm.playerPresets ?? []), copy] };
  });
  return copy;
}

// One-time import of any legacy localStorage holo presets into the current starmap.
export function runPresetMigration(): void {
  starmapStore.update((sm) => {
    if (!sm) return sm;
    const migrated = migrateLocalHoloPresets(allIds(sm));
    if (!migrated.length) return sm;
    return { ...sm, playerPresets: [...(sm.playerPresets ?? []), ...migrated] };
  });
}
