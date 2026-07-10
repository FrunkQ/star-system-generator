// Momentary GM overrides for the ACTIVE player view — live-session state, never saved into a preset
// (same semantics as the holo bar toggles). The picker's quick controls write these; player-view
// surfaces read them (and, once the deploy step lands, they ride the broadcast channel so remote
// player windows follow too).
import { writable } from 'svelte/store';

export interface LiveOverrides {
  followGM: boolean | null; // null = use the preset's own flag; true/false = GM forcing it for now
  filterBypass: boolean;    // temporarily drop the visual filter (readability)
  orbitPaused: boolean;     // temporarily stop the auto view-orbit turntable
}

export const liveOverrides = writable<LiveOverrides>({ followGM: null, filterBypass: false, orbitPaused: false });
