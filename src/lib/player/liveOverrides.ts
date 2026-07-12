// GM-side live control of the OPEN player view. The Player Views modal owns these; they ride the
// SYNC_PRESET broadcast to the player window(s). Momentary — never saved into a preset.
import { writable } from 'svelte/store';

export interface LiveOverrides {
  followGM: boolean | null; // null = use the preset's own flag; true/false = GM forcing it for now
  filterBypass: boolean;    // temporarily drop the visual filter (readability)
  orbitPaused: boolean;     // temporarily stop the auto view-orbit turntable
  labelsHidden: boolean;    // temporarily hide in-scene labels
  time: { rateIndex: number; playing: boolean } | null; // GM live time control (null = player's own time)
}

export const DEFAULT_OVERRIDES: LiveOverrides = { followGM: null, filterBypass: false, orbitPaused: false, labelsHidden: false, time: null };

export const liveOverrides = writable<LiveOverrides>({ ...DEFAULT_OVERRIDES });

// The preset id currently being transmitted to the player window (null = nothing running / closed).
// Session state only.
export const runningPresetId = writable<string | null>(null);
