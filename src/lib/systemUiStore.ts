import { writable } from 'svelte/store';

// THE GM'S OWN system-view preferences — LOCAL to this browser, and deliberately NOT part of any
// campaign or preset. It is the counterpart of `starmapUiStore` for the system stage.
//
// WHY IT IS SEPARATE FROM THE PRESET FIELD OF THE SAME NAME (G5): a GM's screen and a player's view
// are two audiences with two answers. The player's orbit-line strength belongs to the PRESET and
// travels with it; the GM's belongs to the GM. That is the split [[A29]] settled for Live readings
// and [[F10]] for panel width — and wiring a player view to a GM-local store is a fault this project
// has already recorded twice ([[A10]], [[A3]]), so the two must not be collapsed into one value
// however similar they look in the UI.

const SYSTEM_UI_STORE_KEY = 'system-ui-store';

export interface SystemUiState {
	/** Orbit-line strength on the GM's own system map, 0..1. 1 = the look it has always had. */
	orbitOpacity: number;
}

const DEFAULTS: SystemUiState = { orbitOpacity: 1 };

function migrate(parsed: any): SystemUiState {
	const out: SystemUiState = { ...DEFAULTS, ...(parsed ?? {}) };
	const v = Number(out.orbitOpacity);
	// A stored value is user data and may be anything; clamp rather than trust, so one bad write
	// cannot make the GM's orbit lines permanently invisible with no obvious way back.
	out.orbitOpacity = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
	return out;
}

const getInitialState = (): SystemUiState => {
	if (typeof window === 'undefined') return { ...DEFAULTS };
	const saved = localStorage.getItem(SYSTEM_UI_STORE_KEY);
	if (saved) {
		try {
			return migrate(JSON.parse(saved));
		} catch {
			return { ...DEFAULTS };
		}
	}
	return { ...DEFAULTS };
};

const store = writable(getInitialState());

if (typeof window !== 'undefined') {
	store.subscribe((value) => {
		localStorage.setItem(SYSTEM_UI_STORE_KEY, JSON.stringify(value));
	});
}

export const systemUiStore = store;
