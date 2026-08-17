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
import { SOLAR_RADIUS_KM } from '$lib/constants';

/** The Sun's effective temperature — the reference the solar-unit form is written against. */
export const SOLAR_TEFF_K = 5778;

/** Solar luminosities from a radius in km and an effective temperature in K. */
export function luminositySolarFromRT(radiusKm: number, tempK: number): number {
	if (!(radiusKm > 0) || !(tempK > 0)) return 0;
	const rSuns = radiusKm / SOLAR_RADIUS_KM;
	return rSuns * rSuns * Math.pow(tempK / SOLAR_TEFF_K, 4);
}
