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
type UiState = { gridType: GridType; travellerMode: boolean; showBackgroundImage: boolean };

const DEFAULTS: UiState = { gridType: 'off', travellerMode: false, showBackgroundImage: true };



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
  return out;
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
