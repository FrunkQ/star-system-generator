// WHERE A SPIN AXIS COMES FROM WHEN NOBODY MEASURED ONE. One model, one place.
//
// Obliquity has two causes and they do not blend, which is why this is not a single spread:
//
//  - the DISC population. A planet condenses from the same disc as its star, so it starts near the
//    disc normal and is nudged from there. Drawn RAYLEIGH, which is what a random walk of the spin
//    vector in a plane gives: a peak at sigma, a tail, and no bodies at exactly zero. At the default
//    15 deg that puts Earth (23.4), Mars (25.2), Saturn (26.7) and Neptune (28.3) in the meat of the
//    distribution — which is the "typical bounds" answer, arrived at from the mechanism rather than
//    by picking a range.
//  - the CATASTROPHE population. A late giant impact does not nudge an axis, it RE-POINTS it, so the
//    outcome is an ISOTROPIC direction — uniform in cos(obliquity), not uniform in the angle — which
//    produces Uranus (97.8) and Venus (177.4) at the right rate rather than a smear of 90 deg worlds.
//    Rolled per body: it is an accident, not a system-wide property.
//
// Both knobs are RULE-PACK DATA (`axial_tilt_disc_sigma_deg`, `axial_tilt_catastrophe_chance`), per
// the physics-constants-live-in-data rule, so a GM can make a violent neighbourhood or a placid one.
//
// WHY IT LIVES HERE RATHER THAN IN THE GENERATOR, WHICH IS WHERE IT STARTED: B10 fixed this for
// GENERATED worlds and only those. The same hole was still open on every other route — 45 real-sky
// imported exoplanets (obliquity is essentially unmeasurable for an exoplanet, so the catalogue will
// never carry one) and ~50 hand-authored fiction worlds, none of which had a tilt at all (D8). A
// model that only runs on one of three body-creation routes is the shape this codebase keeps paying
// for, so the model moved to physics and the routes call it.
//
// DETERMINISTIC, on the body's own id and its own RNG stream. Drawing from a shared stream would
// shift every subsequent draw and silently re-roll every planet in every saved seed (the B9a
// precedent), and keying on the id means a re-import or a reload reproduces the same world.
import { SeededRNG } from '$lib/rng';
import type { RulePack } from '$lib/types';

export const DEFAULT_TILT_DISC_SIGMA_DEG = 15;
export const DEFAULT_TILT_CATASTROPHE_CHANCE = 0.1;

/**
 * A plausible obliquity for a body nobody measured, from its id. Stable across reloads and re-imports.
 *
 * `tipped` reports which population it came from — the interesting half, and a tag rather than a
 * float the reader has to interpret: this world was hit hard enough to re-point its axis. Uranus and
 * Venus are the Solar System's two.
 */
export function inferAxialTilt(bodyId: string, pack?: RulePack | null): { tiltDeg: number; tipped: boolean } {
	const rng = new SeededRNG(`${bodyId}-tilt`);
	const sigma = pack?.generation_parameters?.axial_tilt_disc_sigma_deg ?? DEFAULT_TILT_DISC_SIGMA_DEG;
	const catastropheChance = pack?.generation_parameters?.axial_tilt_catastrophe_chance ?? DEFAULT_TILT_CATASTROPHE_CHANCE;
	const tipped = rng.nextFloat() < catastropheChance;
	const tilt = tipped
		? Math.acos(2 * rng.nextFloat() - 1) * (180 / Math.PI)          // isotropic — a giant impact
		: Math.min(89.9, sigma * Math.sqrt(-2 * Math.log(1 - rng.nextFloat())));  // Rayleigh — the disc
	return { tiltDeg: Math.round(tilt * 10) / 10, tipped };
}

/** Which bodies HAVE a spin axis at all. A belt or a ring is not a spinning body; a star's tilt is
 *  set separately from the pack band (`stardefaults`), and a construct is hardware. */
export function bodyCanHaveTilt(roleHint: string | undefined): boolean {
	return roleHint === 'planet' || roleHint === 'moon';
}
