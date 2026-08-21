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

// The two resolutions an uploaded image can be kept at, and WHY there are two.
//
// 512px is right for what this store was built for: a cover splash, a corner logo, a watermark. It is
// small enough that a campaign carrying several of them still crosses a WebRTC data channel without
// thinking about it.
//
// A MAP BACKGROUND IS A DIFFERENT ANIMAL (G16). A GM zooms into a sector map to read the place names
// on it, and 512px on the long edge is a blur the moment they do — the picture would be there and
// useless, which is worse than absent. So a background is kept at 2048px, and the cost is stated
// rather than hidden: it is roughly sixteen times the pixels, it rides SYNC_STARMAP on every campaign
// change, and the save bundle stores it as a real file rather than base64 (DATA-M3).
export const ASSET_MAX_PX = 512;
export const BACKGROUND_MAX_PX = 2048;

// Store an uploaded image on the starmap as a PNG data URL, downscaled to `maxPx` on the long edge.
// Returns the new asset via callback once the image decodes.
export function addAssetFromFile(
  file: File,
  name: string,
  done: (a: PlayerAsset | null) => void,
  maxPx: number = ASSET_MAX_PX
): void {
  const img = new Image();
  img.onload = () => {
    const max = maxPx > 0 ? maxPx : ASSET_MAX_PX;
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
      dataUrl: c.toDataURL('image/png'),
      // G16: recorded at upload so a map-fixed background never flashes at the wrong aspect ratio
      // while its bitmap decodes. Every surface still measures the image when this is absent.
      w: c.width,
      h: c.height
    };
    starmapStore.update((sm) => (sm ? { ...sm, playerAssets: [...(sm.playerAssets ?? []).filter((x) => x.id !== asset.id), asset] } : sm));
    done(asset);
  };
  img.onerror = () => done(null);
  img.src = URL.createObjectURL(file);
}

/**
 * Edit the provenance recorded against one uploaded image (DATA-M4).
 *
 * It is not decoration: the save bundle writes ATTRIBUTIONS.md from these fields, and a CC-BY image
 * with no credit is called out there as a breach rather than a gap. A GM's own sector map needs
 * nothing filled in; one they downloaded does.
 */
export function updateAssetProvenance(id: string, fields: Pick<PlayerAsset, 'credit' | 'license' | 'sourceUrl'>): void {
  starmapStore.update((sm) =>
    sm
      ? {
          ...sm,
          playerAssets: (sm.playerAssets ?? []).map((a) =>
            a.id === id
              ? { ...a, credit: fields.credit || undefined, license: fields.license || undefined, sourceUrl: fields.sourceUrl || undefined }
              : a
          )
        }
      : sm
  );
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
