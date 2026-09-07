// LUMINOSITY FROM SIZE AND TEMPERATURE — Stefan-Boltzmann, once.
//
// L = 4*pi*R^2 * sigma * T^4, which in solar units collapses to (R/Rsun)^2 * (T/Tsun)^4 and needs no
// constants at all. It is the same law whether the object is fusing or not, which is exactly why it
// belongs in one place: the substellar cooling track and the star editor were each doing it their own
// way, in different unit conventions, in different files. They agreed — but only by coincidence of
// two correct implementations, and a change to either would have opened a step at the fusion limit
// that nothing would have caught.
//
// That limit is the reason this matters. A body crossing 80 Jupiter masses hands over from the brown
// dwarf track to the stellar model, and if the two disagree about how bright a given radius and
// temperature are, IGNITING changes a star's brightness for no physical reason.
//
// [[B110]] WIDENED THIS TO THE WHOLE ENGINE, 2026-08-28. The sweep found EIGHT places computing a
// star's output from its radius and temperature, in three unit conventions, two of which used a
// hardcoded 5778 rather than any named constant. All eight now come here. They agreed - that was
// never the question. The question the standing rule asks is whether they COULD answer the same
// question differently, and the answer became yes the moment anything dims a star.
//
// WHAT THIS FUNCTION MEANS, and the distinction the occlusion work turns on: it is the star's
// INTRINSIC output, what the photosphere emits. Most callers want exactly that - the zones, the
// generator's stored `radiationOutput`, the plausibility check that compares a stored figure
// against this one. A Dyson swarm, a dust lane or an eclipsing companion changes what a particular
// body RECEIVES, which is a second quantity that belongs beside this one and must be derived FROM
// it - never a second R^2 T^4 with a factor bolted on.
//
// AS OF G53 PHASE 4 THE RECEIVED SIDE EXISTS: `receivedLuminosityWatts` below is that second
// quantity, and `physics/starlightOcclusion.ts` is the ONE place the transmission factor is
// computed (who shades whom, and by how much). The equilibrium-temperature chain now reads the
// received form; anything else that asks "how much light lands HERE" must come through the same
// pair rather than multiplying its own factor in - that is the exact fork this header warns about.
//
// THE INVERSES LIVE ELSEWHERE AND MUST STAY CONSISTENT WITH THIS LAW: `stellar-evolution.ts` solves
// the same relation for radius (`Math.sqrt(L) / (T/Tsun)^2`, twice) and for temperature
// (`Tsun * L^0.25 / sqrt(R)`). They are not duplicates of this - they answer "how big" and "how hot"
// rather than "how bright" - but they share the constant, which is why there is now only one of it.
import { SOLAR_RADIUS_KM, STEFAN_BOLTZMANN_CONSTANT } from '$lib/constants';

/** The Sun's effective temperature — the reference the solar-unit form is written against. */
export const SOLAR_TEFF_K = 5778;

/**
 * Solar luminosities from a radius in km and an effective temperature in K. THE PRIMITIVE: every
 * other form here is derived from this one, so a factor applied here reaches all of them.
 *
 * The ratio form is deliberate. It needs no constants, it is one multiply and one power rather than
 * a 1e26-scale intermediate divided by another, and it is exactly 1.0 for the Sun by construction.
 */
export function luminositySolarFromRT(radiusKm: number, tempK: number): number {
	if (!(radiusKm > 0) || !(tempK > 0)) return 0;
	const rSuns = radiusKm / SOLAR_RADIUS_KM;
	return rSuns * rSuns * Math.pow(tempK / SOLAR_TEFF_K, 4);
}

/** The Sun's bolometric output in watts, from its own radius and effective temperature. */
export const SOLAR_LUMINOSITY_W =
	4 * Math.PI * Math.pow(SOLAR_RADIUS_KM * 1000, 2) * STEFAN_BOLTZMANN_CONSTANT * Math.pow(SOLAR_TEFF_K, 4);

/**
 * The same luminosity in WATTS, for the SI half of the engine - equilibrium temperature works in
 * flux and cannot use solar units. DERIVED from the solar form rather than computed again, which is
 * the whole point of [[B110]]: two correct implementations of R^2 T^4 agree until something DIMS a
 * star, and then a Dyson swarm or a dust lane applied at one site and not the other gives a star
 * that is faint for the habitable zone and bright for a planet's temperature. Silent, and physically
 * incoherent.
 */
export function luminosityWattsFromRT(radiusKm: number, tempK: number): number {
	return luminositySolarFromRT(radiusKm, tempK) * SOLAR_LUMINOSITY_W;
}

/**
 * WHAT A PARTICULAR BODY RECEIVES, in watts: the intrinsic output through a transmission factor -
 * the header's "second quantity", derived FROM the primitive so a dimmed star cannot disagree with
 * its own brightness. The factor comes from `physics/starlightOcclusion.ts` (megastructure
 * shading, G53 phase 4) and is clamped here so a malformed factor can only darken, never amplify:
 * nothing between a star and a world manufactures light.
 */
export function receivedLuminosityWatts(radiusKm: number, tempK: number, transmissionFrac: number): number {
	const t = Number.isFinite(transmissionFrac) ? Math.min(1, Math.max(0, transmissionFrac)) : 1;
	return luminosityWattsFromRT(radiusKm, tempK) * t;
}
