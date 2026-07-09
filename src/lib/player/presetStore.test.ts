import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { starmapStore } from '$lib/starmapStore';
import type { Starmap } from '$lib/types';
import {
  playerPresetList, addPreset, updatePreset, deletePreset, duplicateIntoStarmap, runPresetMigration
} from './presetStore';
import { BUILTIN_PRESETS, DEFAULT_PRESET } from './presets';

function makeStarmap(): Starmap {
  return {
    id: 'sm', name: 'Test', systems: [], routes: [], distanceUnit: 'ly', unitIsPrefix: false
  } as unknown as Starmap;
}

describe('player preset store', () => {
  beforeEach(() => { starmapStore.set(makeStarmap()); });

  it('lists built-ins plus the campaign presets', () => {
    expect(get(playerPresetList)).toHaveLength(BUILTIN_PRESETS.length);
    addPreset({ ...DEFAULT_PRESET, id: 'mine', name: 'Mine' });
    const list = get(playerPresetList);
    expect(list).toHaveLength(BUILTIN_PRESETS.length + 1);
    expect(list[list.length - 1].id).toBe('mine');
  });

  it('updates and deletes only campaign presets', () => {
    addPreset({ ...DEFAULT_PRESET, id: 'mine', name: 'Mine' });
    updatePreset({ ...DEFAULT_PRESET, id: 'mine', name: 'Renamed' });
    expect(get(playerPresetList).find((p) => p.id === 'mine')!.name).toBe('Renamed');
    deletePreset('mine');
    expect(get(playerPresetList).find((p) => p.id === 'mine')).toBeUndefined();
    // built-ins are untouched
    expect(get(playerPresetList)).toHaveLength(BUILTIN_PRESETS.length);
  });

  it('duplicates a built-in into an editable campaign copy', () => {
    const src = BUILTIN_PRESETS.find((p) => p.id === 'holo')!;
    const copy = duplicateIntoStarmap(src)!;
    expect(copy.builtIn).toBe(false);
    expect(copy.id).not.toBe(src.id);
    const stored = get(starmapStore)!.playerPresets ?? [];
    expect(stored.some((p) => p.id === copy.id)).toBe(true);
  });

  it('migration is a no-op when there is nothing in localStorage', () => {
    runPresetMigration();
    expect(get(starmapStore)!.playerPresets ?? []).toHaveLength(0);
  });

  it('CRUD is safe when no starmap is loaded', () => {
    starmapStore.set(null);
    expect(() => addPreset({ ...DEFAULT_PRESET, id: 'x', name: 'X' })).not.toThrow();
    expect(get(playerPresetList)).toHaveLength(BUILTIN_PRESETS.length);
  });
});
