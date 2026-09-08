// WHAT THE MACHINE SAYS ABOUT ITSELF, AND THE ONE THING WE DO ABOUT IT.
//
// C20 job 4. `navigator.deviceMemory` has been collected since the memory investigation
// (`io/diagnosticBundle.ts`) and has never decided anything - it went into a report a human read
// afterwards. A GM on a small device had to find the Low power switch for themselves, and the ones
// most likely to need it are the least likely to go looking.
//
// IT DECIDES EXACTLY ONE THING, AND THROUGH THE SWITCH THE GM ALREADY CONTROLS. Not a second hidden
// mode, not a private "small device" flag read somewhere else in the renderer - it proposes low
// power through `proposeLowPower`, the same store the checkbox writes to, and an explicit answer
// from a person beats it in both directions for the session ([[G69]]'s two facts). If a GM on a
// 2 GB tablet would rather have the clouds and accept the frame rate, that is theirs to decide and
// nothing here can undo it.
//
// WHAT THE NUMBER IS. `deviceMemory` is the DEVICE's RAM in GB, rounded DOWN to a power of two and
// capped at 8, deliberately coarse so it cannot be used to identify anyone. It is Chromium-only:
// Firefox and Safari report nothing, and a browser that says nothing gets no opinion from us - the
// same rule the rest of this stream follows, that a machine we cannot ask about is assumed normal.

import { proposeLowPower } from '$lib/lowPowerStore';

/**
 * At or below this many GB, default to low power.
 *
 * TWO IS DELIBERATELY CONSERVATIVE AND FOUR WOULD NOT BE. The value is rounded down to a power of
 * two, so the real rungs are 0.25, 0.5, 1, 2, 4 and 8: "4" is an ordinary working laptop and a great
 * many people have one, and stripping their cloud decks by default would be a visible change to the
 * product for a large group who never asked for it. "2 or less" is a low-end phone, a tablet, or a
 * machine old enough that the clouds were never going to be the good part - and it is the population
 * the owner's report is about. If this needs tuning, tune it HERE: it is the only threshold.
 */
export const SMALL_DEVICE_GB = 2;

/** The device's RAM in GB as the browser will admit it, or null if it will not say. */
export function deviceMemoryGB(): number | null {
	if (typeof navigator === 'undefined') return null;
	const gb = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
	return typeof gb === 'number' && gb > 0 ? gb : null;
}

/** Is this a machine we should be gentle with by default? Null means the browser did not say. */
export function isSmallDevice(): boolean | null {
	const gb = deviceMemoryGB();
	return gb === null ? null : gb <= SMALL_DEVICE_GB;
}

/**
 * Offer low power to a small device. Silent by design.
 *
 * NO NOTICE, and that is not an oversight. Being told "your device is small" is not news to the
 * person holding it and there is nothing for them to do about it - unlike the software-rasteriser
 * message, which names an action (close tabs, fresh window). The state is not hidden either: the
 * Low power checkbox reads the composed answer, so it simply shows as ticked, which is where a GM
 * would look and is a control rather than an announcement.
 */
export function proposeLowPowerForSmallDevice(): void {
	const gb = deviceMemoryGB();
	if (gb === null || gb > SMALL_DEVICE_GB) return;
	proposeLowPower(true, `this device reports ${gb} GB of memory`);
}
