// GM-side live control of the OPEN player view. The Player Views modal owns these; they ride the
// SYNC_PRESET broadcast to the player window(s). Never saved into a PRESET — a preset is a design, and
// these are what is happening right now.
//
// TWO KINDS OF VALUE LIVE HERE, AND ONLY ONE OF THEM SURVIVES A RELOAD.
//
// The display overrides — followGM, filterBypass, orbitPaused, labelsHidden — are genuinely momentary:
// "drop the filter for a second so they can read that". Restoring one of those on the next launch
// would leave a GM with a suspended filter and nothing on screen saying why, which is worse than
// losing it. They start clean every time, deliberately.
//
// The HIGHLIGHT SELECTION is not momentary and was being treated as though it were. It is a piece of
// prep — "tonight they are hunting refuelling stops" — often built up tag by tag before a session, and
// a hard refresh threw the lot away. It is persisted, per machine.
//
// Machine-local rather than on the campaign, on purpose: it is what THIS GM is pointing at, not a
// property of the map, so it must not travel inside a shared .starmap file. Not keyed by campaign
// either, because tag keys are engine-wide — a selection built in one campaign means the same thing in
// the next, and a ref that matches nothing simply draws nothing.
import { writable } from 'svelte/store';

import type { MapHighlights } from '$lib/tags/mapHighlights';

export interface LiveOverrides {
  followGM: boolean | null; // null = use the preset's own flag; true/false = GM forcing it for now
  filterBypass: boolean;    // temporarily drop the visual filter (readability)
  orbitPaused: boolean;     // temporarily stop the auto view-orbit turntable
  labelsHidden: boolean;    // temporarily hide in-scene labels
  // Hide every artificial construct from the players' view — ships, stations, gates. Sits with the
  // momentary nudges rather than with the highlight selection above, and therefore does NOT survive a
  // reload: it is "don't show them that, right now", and coming back to a launch with the whole fleet
  // silently missing is exactly the surprise the persistence split exists to avoid.
  constructsHidden: boolean;
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
  followGM: null, filterBypass: false, orbitPaused: false, labelsHidden: false, constructsHidden: false,
  mapHighlights: [], highlightsMuted: false
};

/** Only the two fields that are prep rather than a momentary nudge — see the header. */
type PersistedOverrides = Pick<LiveOverrides, 'mapHighlights' | 'highlightsMuted'>;
const HIGHLIGHTS_KEY = 'sse-map-highlights';

function loadHighlights(): PersistedOverrides {
  const empty: PersistedOverrides = { mapHighlights: [], highlightsMuted: false };
  if (typeof localStorage === 'undefined') return empty;
  try {
    const raw = JSON.parse(localStorage.getItem(HIGHLIGHTS_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return empty;
    // Validated rather than trusted: this is user-editable storage, and a malformed entry here would
    // otherwise reach markersFor on every render.
    const refs = Array.isArray(raw.mapHighlights) ? raw.mapHighlights : [];
    return {
      mapHighlights: refs
        .filter((h: any) => h && typeof h.ref === 'string' && h.ref)
        .map((h: any) => (h.style ? { ref: h.ref, style: h.style } : { ref: h.ref })),
      highlightsMuted: raw.highlightsMuted === true
    };
  } catch {
    return empty;
  }
}

export const liveOverrides = writable<LiveOverrides>({ ...DEFAULT_OVERRIDES, ...loadHighlights() });

// Written on every change rather than at chosen call sites, for the same reason the broadcast moved to
// the host: Find by tag, the Player Views panel and a drag onto the tray all mutate this store, and a
// save wired at each of them is three places to forget.
if (typeof localStorage !== 'undefined') {
  liveOverrides.subscribe((v) => {
    try {
      localStorage.setItem(HIGHLIGHTS_KEY, JSON.stringify({ mapHighlights: v.mapHighlights, highlightsMuted: v.highlightsMuted }));
    } catch { /* private mode — the selection is still live for this session */ }
  });
}

// The preset id currently being transmitted to the player window (null = nothing running / closed).
// Session state only.
export const runningPresetId = writable<string | null>(null);
