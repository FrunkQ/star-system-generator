import { writable, derived, get } from 'svelte/store';

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

/**
 * THE SWITCH HOLDS TWO FACTS, NOT ONE, and [[G69]] is why this is not optional.
 *
 * The frame-rate guard learned it the expensive way: a scene that stored only the DRAWN answer had
 * it undone within the second, because the host re-asserts every setting on every change. So it
 * keeps what was REQUESTED apart from what was SHED and draws the AND of the two. The same shape is
 * needed here for a different reason, and it is the one that matters to a person:
 *
 *   `choice` is what the GM said. `auto` is what the machine worked out about itself.
 *
 * WITHOUT THAT SPLIT AN AUTOMATIC DEFAULT IS INDISTINGUISHABLE FROM A DECISION, and it silently
 * overrules one. A GM who deliberately turns low power OFF on a small laptop - because they would
 * rather have the clouds and accept the frame rate, which is their call to make - would have it
 * turned straight back on by the next thing that measured the machine, with no way to win. An
 * explicit answer therefore beats every automatic one, in BOTH directions, for the whole session.
 *
 * WHICH IS WHY "OFF" IS NOW STORED. It used to be an absence, on the reasoning that the absent key
 * IS the default - true when nothing else could set the value, and false the moment something can.
 * Absence now means AUTO: nobody has said, so the machine may answer. `'0'` means a person said no.
 */
export type LowPowerChoice = 'auto' | 'on' | 'off';

const readChoice = (): LowPowerChoice => {
	if (typeof window === 'undefined') return 'auto';
	try {
		const raw = localStorage.getItem(LOW_POWER_KEY);
		// '1' is the spelling shipped since G80 and is still read as an explicit yes, so a GM who
		// ticked the box before this change keeps their answer.
		return raw === '1' ? 'on' : raw === '0' ? 'off' : 'auto';
	} catch {
		// A browser with site data blocked throws on the read itself. A machine we cannot ask about
		// is assumed to be a normal one: the alternative is silently stripping everyone's clouds.
		return 'auto';
	}
};

/** What the person at this machine has actually said. Persisted; per browser; never campaign data. */
export const lowPowerChoice = writable<LowPowerChoice>(readChoice());

if (typeof window !== 'undefined') {
	lowPowerChoice.subscribe((choice) => {
		try {
			if (choice === 'auto') localStorage.removeItem(LOW_POWER_KEY);
			else localStorage.setItem(LOW_POWER_KEY, choice === 'on' ? '1' : '0');
		} catch {
			/* private window, or site data blocked: the switch still works for this session */
		}
	});
}

/**
 * What the machine worked out about ITSELF this session, and the reason, or null if nothing has.
 *
 * DELIBERATELY NOT PERSISTED. It is a measurement of the conditions right now - a browser that has
 * been open for three days with sixty tabs, a GPU process that has fallen over - and every one of
 * those is cured by the fresh window the notice recommends. Writing it down would carry today's bad
 * afternoon into next week and there would be no way to tell it had gone stale.
 */
export const lowPowerAuto = writable<{ on: boolean; reason: string } | null>(null);

/** The effective answer: a person's word if there is one, otherwise the machine's, otherwise no. */
const effective = derived([lowPowerChoice, lowPowerAuto], ([choice, auto]) =>
	choice === 'auto' ? auto?.on === true : choice === 'on'
);

/**
 * This machine is short of fill rate. READ it for the answer everything draws from; SET it to record
 * that a person has chosen.
 *
 * The asymmetry is the whole point rather than a convenience. Reading gives the composed answer, so
 * no call site has to know an automatic default exists. Writing can only ever come from the
 * checkbox, i.e. from a person - so a write IS the explicit choice, and it takes the machine's
 * opinion out of play from then on. There is no way to spell "set this automatically" through here,
 * which is what stops a second hidden switch growing beside the one the GM controls.
 */
export const lowPower = {
	subscribe: effective.subscribe,
	set: (on: boolean) => lowPowerChoice.set(on ? 'on' : 'off'),
	update: (fn: (on: boolean) => boolean) => lowPowerChoice.set(fn(get(effective)) ? 'on' : 'off')
};

/**
 * RECORD what the machine worked out about itself. It is a fact, not a decision.
 *
 * IT DOES NOT CHECK WHETHER A PERSON HAS ALREADY ANSWERED, and that omission is deliberate and was
 * arrived at the hard way: it used to, and a mutation test proved the check was DEAD - removing it
 * changed no behaviour at all, because the composition above already gives an explicit choice
 * priority. Two copies of "explicit beats automatic" is two places that can drift, which is this
 * codebase's most recurring fault, so the copy that was not load-bearing went. Precedence is settled
 * in exactly one expression, `effective`, and nowhere else.
 */
export function proposeLowPower(on: boolean, reason: string): void {
	lowPowerAuto.set({ on, reason });
}

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
