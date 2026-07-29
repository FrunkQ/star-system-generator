import { writable } from 'svelte/store';

const STARMAP_UI_STORE_KEY = 'starmap-ui-store';

// Snap-grid shape is now purely cosmetic/snapping; "Traveller mode" is its OWN flag (it used to
// be smuggled in as the gridType 'traveller-hex' value). When travellerMode is on the map renders
// the Traveller hex (numbered, 1 hex = 1 parsec) regardless of the snap-grid choice.
// WS3: 'traveller-hex' is a first-class snap-grid choice again — ANY user can pick the numbered hex
// without turning on Traveller mode. Traveller MODE remains its own flag (parsec scaling, UWP import,
// subsector detection); it just defaults the look to the numbered hex.
type GridType = 'grid' | 'hex' | 'traveller-hex' | 'none';
type UiState = { gridType: GridType; travellerMode: boolean; showBackgroundImage: boolean };

const DEFAULTS: UiState = { gridType: 'none', travellerMode: false, showBackgroundImage: true };

const GRID_TYPES: GridType[] = ['grid', 'hex', 'traveller-hex', 'none'];

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
  if (!GRID_TYPES.includes(out.gridType)) out.gridType = 'none';
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
