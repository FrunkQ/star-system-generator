// What survives a reload and what deliberately does not.
//
// The store persists on IMPORT, so each case re-imports it with a fresh module registry — otherwise
// the first test's load would be the only one that ever ran.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const KEY = 'sse-map-highlights';

async function freshStore() {
  vi.resetModules();
  return await import('./liveOverrides');
}

describe('the highlight selection survives a reload', () => {
  beforeEach(() => localStorage.clear());

  it('starts empty when nothing has been saved', async () => {
    const { liveOverrides } = await freshStore();
    expect(get(liveOverrides).mapHighlights).toEqual([]);
    expect(get(liveOverrides).highlightsMuted).toBe(false);
  });

  it('writes the selection as it is made, and reads it back on the next load', async () => {
    const first = await freshStore();
    first.liveOverrides.update((o) => ({ ...o, mapHighlights: [{ ref: 'frontier/refuelling' }, { ref: 'faction' }] }));
    expect(JSON.parse(localStorage.getItem(KEY)!).mapHighlights).toHaveLength(2);

    const reloaded = await freshStore();
    expect(get(reloaded.liveOverrides).mapHighlights.map((h) => h.ref))
      .toEqual(['frontier/refuelling', 'faction']);
  });

  it('carries a per-entry shape override, which is part of the selection', async () => {
    const first = await freshStore();
    first.liveOverrides.update((o) => ({ ...o, mapHighlights: [{ ref: 'faction', style: 'flag' }] }));
    const reloaded = await freshStore();
    expect(get(reloaded.liveOverrides).mapHighlights[0]).toEqual({ ref: 'faction', style: 'flag' });
  });

  it('remembers the mute, so a GM who muted mid-scene is not surprised on reopening', async () => {
    const first = await freshStore();
    first.liveOverrides.update((o) => ({ ...o, highlightsMuted: true }));
    const reloaded = await freshStore();
    expect(get(reloaded.liveOverrides).highlightsMuted).toBe(true);
  });

  // The other half of the design: a momentary nudge must NOT come back, or a GM launches into a
  // suspended filter with nothing on screen saying why.
  it('does NOT restore the momentary display overrides', async () => {
    const first = await freshStore();
    first.liveOverrides.update((o) => ({
      ...o, filterBypass: true, orbitPaused: true, labelsHidden: true, followGM: true,
      constructsHidden: true, mapHighlights: [{ ref: 'faction' }]
    }));
    const reloaded = await freshStore();
    const v = get(reloaded.liveOverrides);
    expect(v.filterBypass).toBe(false);
    expect(v.orbitPaused).toBe(false);
    expect(v.labelsHidden).toBe(false);
    expect(v.followGM).toBeNull();
    // A53 belongs with these, not with the selection: coming back to a launch with the whole fleet
    // silently missing is the surprise the split exists to avoid.
    expect(v.constructsHidden).toBe(false);
    expect(v.mapHighlights).toHaveLength(1); // …while the selection beside them did come back
  });

  it('ignores rubbish in storage rather than handing it to markersFor', async () => {
    localStorage.setItem(KEY, '{ not json');
    expect(get((await freshStore()).liveOverrides).mapHighlights).toEqual([]);

    localStorage.setItem(KEY, JSON.stringify({ mapHighlights: 'nope', highlightsMuted: 'yes' }));
    const v = get((await freshStore()).liveOverrides);
    expect(v.mapHighlights).toEqual([]);
    expect(v.highlightsMuted).toBe(false); // only a real `true` mutes

    localStorage.setItem(KEY, JSON.stringify({ mapHighlights: [{ ref: 'ok' }, { nope: 1 }, null, { ref: '' }] }));
    expect(get((await freshStore()).liveOverrides).mapHighlights).toEqual([{ ref: 'ok' }]);
  });
});
