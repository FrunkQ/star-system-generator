// GM-side live control of the OPEN player view. The Player Views modal owns these; they ride the
// SYNC_PRESET broadcast to the player window(s). Momentary — never saved into a preset.
import { writable } from 'svelte/store';

import type { MapHighlights } from '$lib/tags/mapHighlights';

export interface LiveOverrides {
  followGM: boolean | null; // null = use the preset's own flag; true/false = GM forcing it for now
  filterBypass: boolean;    // temporarily drop the visual filter (readability)
  orbitPaused: boolean;     // temporarily stop the auto view-orbit turntable
  labelsHidden: boolean;    // temporarily hide in-scene labels
  // "Show them where the refuelling is." A live selection of categories and/or specific tags to
  // badge on the maps — the GM's own AND the players', from one value, so what you pick is what they
  // see. Momentary like the rest of this object: never saved into a preset.
  // Secret tags and player-hidden categories are removed from the player snapshot before markers are
  // built, so highlighting a category cannot leak one.
  mapHighlights: MapHighlights;
  // The mute. Choosing WHAT to highlight happens in Find by tag, which knows what is on the map;
  // this is the one-click "not right now" for the whole set, so a GM can drop the badges mid-scene
  // without losing the selection they built.
  highlightsMuted: boolean;
}

export const DEFAULT_OVERRIDES: LiveOverrides = {
  followGM: null, filterBypass: false, orbitPaused: false, labelsHidden: false, mapHighlights: [], highlightsMuted: false
};

export const liveOverrides = writable<LiveOverrides>({ ...DEFAULT_OVERRIDES });

// The preset id currently being transmitted to the player window (null = nothing running / closed).
// Session state only.
export const runningPresetId = writable<string | null>(null);
