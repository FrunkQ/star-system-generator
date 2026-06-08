import { writable } from 'svelte/store';

const STARMAP_UI_STORE_KEY = 'starmap-ui-store';

// Snap-grid shape is now purely cosmetic/snapping; "Traveller mode" is its OWN flag (it used to
// be smuggled in as the gridType 'traveller-hex' value). When travellerMode is on the map renders
// the Traveller hex (numbered, 1 hex = 1 parsec) regardless of the snap-grid choice.
type GridType = 'grid' | 'hex' | 'none';
type UiState = { gridType: GridType; travellerMode: boolean; showBackgroundImage: boolean };

const DEFAULTS: UiState = { gridType: 'none', travellerMode: false, showBackgroundImage: true };

// Migrate the legacy single-knob state where Traveller lived inside gridType.
function migrate(parsed: any): UiState {
  const out: UiState = { ...DEFAULTS, ...parsed };
  if (parsed && parsed.gridType === 'traveller-hex') {
    out.gridType = 'hex';
    out.travellerMode = true;
  }
  if (out.gridType !== 'grid' && out.gridType !== 'hex' && out.gridType !== 'none') out.gridType = 'none';
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
