// The live list of player presets = shipped built-ins + the campaign's own (saved on the starmap).
// CRUD here mutates starmap.playerPresets so presets travel with the map. See presets.ts / the design
// doc. Built-ins are read-only (duplicate to edit).
import { derived } from 'svelte/store';
import { starmapStore } from '$lib/starmapStore';
import type { Starmap } from '$lib/types';
import type { PlayerPreset, PlayerAsset } from './presetTypes';
import { BUILTIN_PRESETS, BUILTIN_ASSETS, migrateLocalHoloPresets, duplicatePreset, normalizePreset } from './presets';

// Built-ins first, then the campaign's custom presets — normalised so presets saved by an older
// beta always carry the current schema's fields. Always a fresh array.
export const playerPresetList = derived(starmapStore, ($sm): PlayerPreset[] => {
  return [...BUILTIN_PRESETS, ...($sm?.playerPresets ?? []).map(normalizePreset)];
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

// All placeable graphics: shipped starters + this campaign's uploads.
export const playerAssetList = derived(starmapStore, ($sm): PlayerAsset[] => {
  return [...BUILTIN_ASSETS, ...($sm?.playerAssets ?? [])];
});

// Store an uploaded image on the starmap, downscaled to a PNG data URL (max 512px on the long edge —
// big enough for a cover splash, small enough to ride the starmap file + broadcast). Returns the new
// asset via callback once the image decodes.
export function addAssetFromFile(file: File, name: string, done: (a: PlayerAsset | null) => void): void {
  const img = new Image();
  img.onload = () => {
    const max = 512;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * scale));
    c.height = Math.max(1, Math.round(img.height * scale));
    const ctx = c.getContext('2d');
    if (!ctx) { done(null); return; }
    ctx.drawImage(img, 0, 0, c.width, c.height); // PNG keeps alpha
    const asset: PlayerAsset = {
      id: 'asset-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + c.width,
      name: name || file.name,
      dataUrl: c.toDataURL('image/png')
    };
    starmapStore.update((sm) => (sm ? { ...sm, playerAssets: [...(sm.playerAssets ?? []).filter((x) => x.id !== asset.id), asset] } : sm));
    done(asset);
  };
  img.onerror = () => done(null);
  img.src = URL.createObjectURL(file);
}

export function deleteAsset(id: string): void {
  starmapStore.update((sm) =>
    sm ? { ...sm, playerAssets: (sm.playerAssets ?? []).filter((x) => x.id !== id) } : sm
  );
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
