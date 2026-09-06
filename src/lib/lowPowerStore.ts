import { writable } from 'svelte/store';

// LOW POWER: a switch that describes THE MACHINE, not the view and not the campaign.
//
// Owner, 2026-09-06: *"checkbox in the corner for low power machines... on GM view (option on player
// views). Just strip resource hungry transparencies (atmospheres), (alphas and dashes) etc."*
//
// WHY IT LIVES HERE AND NOT IN A PRESET, and why that is NOT the [[A10]]/[[A3]] fault this project
// has recorded twice. Those two are about wiring a PLAYER view to a GM-local store, and the reason
// they are faults is that a GM's screen and a player's view are two AUDIENCES with two answers: the
// GM's orbit-line strength is not the player's, so a value carrying presentation intent must travel
// with the preset. This value carries no intent at all. It is a statement about the hardware the
// pixels are being pushed on, and a weak GPU is weak whoever happens to be looking at it - so it
// applies to every view rendered on this device and to no view rendered anywhere else. It can only
// ever be set by the person sitting at that machine, and it is in `localStorage`, so it cannot
// travel in a campaign file or a shared link even by accident.
//
// THE PRESET FIELD IS NOT REPLACED BY IT. `atmospheres` and `auroras` already exist on a preset (a
// player on a low-end device asked for them), and the two compose the only way that is safe: OFF
// WINS. A preset that turns atmospheres off is honoured on a fast machine; this switch turns them
// off on a slow one whatever the preset says. Neither can turn the other back ON, because each is
// answering a different question and neither has the standing to overrule the other.
//
// WHAT IT DROPS is fill rate rather than geometry, which is what the owner asked for and what
// actually costs: every atmospheric shell and aurora is alpha-blended over the body it wraps, so a
// cloudy world repaints the same pixels three or four times over. See the `atmospheres` note in
// `player/presetTypes.ts`, which is the same reasoning arrived at from the player's side.

const LOW_POWER_KEY = 'sse-low-power';

const read = (): boolean => {
	if (typeof window === 'undefined') return false;
	try {
		return localStorage.getItem(LOW_POWER_KEY) === '1';
	} catch {
		// A browser with site data blocked throws on the read itself. A machine we cannot ask about
		// is assumed to be a normal one: the alternative is silently stripping everyone's clouds.
		return false;
	}
};

const store = writable<boolean>(read());

if (typeof window !== 'undefined') {
	store.subscribe((on) => {
		try {
			// The absent key IS the default, so the off state is stored as an absence rather than as
			// a "0" nobody would recognise later.
			if (on) localStorage.setItem(LOW_POWER_KEY, '1');
			else localStorage.removeItem(LOW_POWER_KEY);
		} catch {
			/* private window, or site data blocked: the switch still works for this session */
		}
	});
}

/** The GM's (or the player's) own machine is short of fill rate. Per browser; never campaign data. */
export const lowPower = store;

/**
 * Whether a feature that costs fill rate should be drawn: what the view asked for, AND not low power.
 *
 * The one place the two switches meet, so neither call site has to remember which way they compose.
 * OFF WINS, and it has to: a preset saying "no atmospheres" is a decision about the picture, and a
 * machine saying "no atmospheres" is a decision about the hardware. Either is enough on its own, and
 * neither is entitled to overrule the other in the direction of MORE work.
 */
export function drawsHeavy(wanted: boolean | undefined, low: boolean): boolean {
	return wanted !== false && !low;
}
