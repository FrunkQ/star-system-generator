import { writable } from 'svelte/store';

const STARMAP_UI_STORE_KEY = 'starmap-ui-store';

// Snap-grid shape is now purely cosmetic/snapping; "Traveller mode" is its OWN flag (it used to
// be smuggled in as the gridType 'traveller-hex' value). When travellerMode is on the map renders
// the Traveller hex (numbered, 1 hex = 1 parsec) regardless of the snap-grid choice.
// WS3: 'traveller-hex' is a first-class snap-grid choice again — ANY user can pick the numbered hex
// without turning on Traveller mode. Traveller MODE remains its own flag (parsec scaling, UWP import,
// subsector detection); it just defaults the look to the numbered hex.
// A45: the shared vocabulary, narrowed to what the 2D snap grid draws — not a private union that has
// to be kept in step by hand. It was, and it lost: `subsector-hex` reached every player view at
// v2.1.378 and never reached the GM's own map, because nothing connected the two lists.
import { isSnapGridType, normaliseOverlay, type SnapGridType } from '$lib/map/mapOverlay';
type GridType = SnapGridType;
// G16: `showBackgroundImage` was retired here. The starmap's background is CAMPAIGN CONTENT now
// (`Starmap.mapBackground`) rather than a local display preference, because a map-fixed sector map
// has to travel with the save and out to every player window to stay in register.
// G26: `starScale` is the GM's OWN star-glyph size scaler for the 2D map on this screen — 0 = every
// star the same size (the map as it was), 1 = the four luminosity-class bands fully separated. A
// LOCAL preference, like the snap grid: the player views carry their own in the preset
// (`starmapStarScale`), per G5's split — never wire a player view to this store (A10/A3).
// `starSize` is the BASE glyph size, a multiplier 0.5..2 on the unit every glyph is drawn in (1 = the
// size the map shipped with) — the owner's second dial, 2026-08-19.
type UiState = { gridType: GridType; travellerMode: boolean; starScale: number; starSize: number };

const DEFAULTS: UiState = { gridType: 'off', travellerMode: false, starScale: 0, starSize: 1 };



function migrate(parsed: any): UiState {
  const out: UiState = { ...DEFAULTS, ...parsed };
  // LEGACY single-knob state (Traveller lived inside gridType and there was no travellerMode key at
  // all) → split it into hex + mode. Discriminating on the ABSENT key matters now that 'traveller-hex'
  // is a legitimate choice again: without this check, reloading would silently rewrite a user's
  // deliberate Traveller-hex selection into hex + Traveller mode.
  if (parsed && parsed.gridType === 'traveller-hex' && typeof parsed.travellerMode !== 'boolean') {
    out.gridType = 'hex';
    out.travellerMode = true;
  }
  // SPELLING migration, in the same place and shape as the Traveller split above. Stored values
  // predate the shared vocabulary ('none'/'grid'); `normaliseOverlay` is the one translator and
  // already accepts both, so this reads an old store without a second mapping of its own.
  const canonical = normaliseOverlay(out.gridType);
  out.gridType = isSnapGridType(canonical) ? canonical : 'off';
  if (typeof out.travellerMode !== 'boolean') out.travellerMode = false;
  const starScale = typeof out.starScale === 'number' && Number.isFinite(out.starScale) ? Math.max(0, Math.min(1, out.starScale)) : 0;
  const starSize = typeof out.starSize === 'number' && Number.isFinite(out.starSize) && out.starSize > 0 ? Math.max(0.5, Math.min(2, out.starSize)) : 1;
  // Only the fields this store still owns. A browser that stored the retired `showBackgroundImage`
  // would otherwise carry it forward for ever, and a dead key in a persisted store is how a future
  // reader concludes the setting still exists (G16).
  return { gridType: out.gridType, travellerMode: out.travellerMode, starScale, starSize };
}

const getInitialState = (): UiState => {
  if (typeof window === 'undefined') return { ...DEFAULTS };
  const savedState = localStorage.getItem(STARMAP_UI_STORE_KEY);
  if (savedState) {
    try {
      return migrate(JSON.parse(savedState));
    } catch {
      return { ...DEFAULTS };
    }
  }
  return { ...DEFAULTS };
};

const store = writable(getInitialState());

// Subscribe to changes and save to localStorage
if (typeof window !== 'undefined') {
  store.subscribe(value => {
    localStorage.setItem(STARMAP_UI_STORE_KEY, JSON.stringify(value));
  });
}

export const starmapUiStore = store;
