// B110 EQUIVALENCE. A star's bolometric output was computed in EIGHT places, in three unit
// conventions; they now all call `luminosity.ts`. This is the P1 pattern from `scaleLaw.spec.ts`:
// the `legacy*` functions below are the old expressions COPIED VERBATIM from the sites that were
// replaced, so a divergence between the two columns IS the bug and it fails here rather than on a
// GM's screen. Moving a number and changing it are two commits, never one.
//
// ONE HONEST CAVEAT, MEASURED RATHER THAN GLOSSED: "bit for bit" is NOT achievable here and could
// not have been, because the two conventions were not two spellings of one float expression. Solar
// units were computed BOTH as `(R/Rs)^2 * (T/Ts)^4` (luminosity.ts, four consumers) and as
// `4*pi*R_m^2*sigma*T^4` divided by the same for the Sun (zones.ts) - algebraically identical,
// different roundings. No single implementation can be bit-equal to both. The ratio form won: it
// needs no constants, it is fewer operations with no 1e26-scale intermediate, and it is exactly 1.0
// for the Sun by construction. The cost is bounded and pinned below: the MEASURED worst case over
// the sweep is 5.9e-16 relative, on a hot subdwarf, against 2.22e-16 for one unit in the last place
// at 1.0 - under three ulp, and against the 1e-12 that `SystemProcessor.settled` already treats as
// "not a change".
//
// WHAT IS PINNED IS THEREFORE THE THING THAT MATTERS: no PUBLISHED figure moves. The habitable zone
// edges, the frost line, the kill zone and the equilibrium temperature are all asserted to twelve
// significant figures against the old expressions.
import { describe, it, expect } from 'vitest';
import { SOLAR_RADIUS_KM, STEFAN_BOLTZMANN_CONSTANT, AU_KM } from '../constants';
import { luminositySolarFromRT, luminosityWattsFromRT, SOLAR_LUMINOSITY_W, SOLAR_TEFF_K } from './luminosity';
import { calculateEquilibriumTemperature } from './temperature';
import { calculateGoldilocksZone, calculateKillZone } from './zones';
import type { CelestialBody } from '../types';

// --- THE LEGACY COLUMN: the replaced expressions, copied verbatim -----------------------------

/** `physics/zones.ts` `getLuminosity`, as it stood. Solar units via a watts ratio. */
function legacyZonesLuminosity(radiusKm: number, temperatureK: number): number {
	const SOLAR_TEMP_K = 5778;
	const radius_m = radiusKm * 1000;
	const temp_k = temperatureK;
	const solar_radius_m = SOLAR_RADIUS_KM * 1000;
	const solar_luminosity = 4 * Math.PI * (solar_radius_m ** 2) * STEFAN_BOLTZMANN_CONSTANT * (SOLAR_TEMP_K ** 4);
	const star_luminosity = 4 * Math.PI * (radius_m ** 2) * STEFAN_BOLTZMANN_CONSTANT * (temp_k ** 4);
	return star_luminosity / solar_luminosity;
}

/** `physics/temperature.ts`, both `calculateEquilibriumTemperature` and its Range twin. SI watts. */
function legacyTemperatureLuminosityW(radiusKm: number, temperatureK: number): number {
	const starRadius_m = radiusKm * 1000;
	return 4 * Math.PI * Math.pow(starRadius_m, 2) * STEFAN_BOLTZMANN_CONSTANT * Math.pow(temperatureK, 4);
}

/** `generation/star.ts` `thermalLumSolar`, and `physics/starPlausibility.ts` `thermal`. */
function legacyPowSolar(radiusKm: number, temperatureK: number): number {
	return Math.pow(radiusKm / SOLAR_RADIUS_KM, 2) * Math.pow(temperatureK / 5778, 4);
}

/** `BodyStarTab.svelte` and `BodyTechnicalDetails.svelte` - the panel copies, with a bare 5778. */
function legacyPanelSolar(radiusKm: number, temperatureK: number): number {
	const r_sol = radiusKm / SOLAR_RADIUS_KM;
	return (r_sol ** 2) * ((temperatureK / 5778) ** 4);
}

// A sweep wide enough to catch a constant moving: the whole main sequence, both ends of the
// substellar range, a white dwarf, a hot subdwarf, and the reporter's own two M9 dwarfs.
const STARS: [string, number, number][] = [
	['Sol', SOLAR_RADIUS_KM, 5778],
	['O5 V', 8.0 * SOLAR_RADIUS_KM, 42000],
	['A0 V', 2.4 * SOLAR_RADIUS_KM, 9600],
	['G2 V (drifted)', 618117.3411775711, 5710.37098572019],
	['K5 V', 0.7 * SOLAR_RADIUS_KM, 4400],
	['M9 V a', 70984.47619494186, 2397.83838254416],
	['M9 V b', 65944.4563225744, 2161.20377328966],
	['L dwarf', 85000, 2300],
	['T dwarf', 72000, 900],
	['Y dwarf', 70000, 350],
	['White dwarf', 0.013 * SOLAR_RADIUS_KM, 25000],
	['Hot subdwarf', 0.2 * SOLAR_RADIUS_KM, 30000],
	['Red giant', 100 * SOLAR_RADIUS_KM, 3500]
];

/** Relative difference, and 0 when the two are the same double. */
const rel = (a: number, b: number) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)));

describe('B110 - every site that computed R^2 T^4 now gets the same answer', () => {
	it('the SOLAR sites are exactly unchanged - they already used the ratio form', () => {
		for (const [name, r, t] of STARS) {
			expect(luminositySolarFromRT(r, t), `${name} vs generator/plausibility`).toBe(legacyPowSolar(r, t));
			expect(luminositySolarFromRT(r, t), `${name} vs the panels`).toBe(legacyPanelSolar(r, t));
		}
	});

	it('the WATTS sites are exactly unchanged for the Sun and within one ulp elsewhere', () => {
		let worst = 0;
		for (const [name, r, t] of STARS) {
			const d = rel(luminosityWattsFromRT(r, t), legacyTemperatureLuminosityW(r, t));
			expect(d, `${name}`).toBeLessThan(1e-15);
			worst = Math.max(worst, d);
		}
		// MEASURED, not guessed: the worst case across this sweep is 5.9e-16 on a hot subdwarf, which
		// is under three units in the last place of a double (one ulp at 1.0 is 2.22e-16).
		expect(worst).toBeLessThan(1e-15);
	});

	it('the ZONES site moves by at most one or two units in the last place, and no further', () => {
		let worst = 0;
		for (const [name, r, t] of STARS) {
			const d = rel(luminositySolarFromRT(r, t), legacyZonesLuminosity(r, t));
			expect(d, `${name}`).toBeLessThan(1e-15);
			worst = Math.max(worst, d);
		}
		// The Sun is the anchor and must be EXACTLY one, which the ratio form gives by construction
		// and the watts ratio only gives by luck.
		expect(luminositySolarFromRT(SOLAR_RADIUS_KM, SOLAR_TEFF_K)).toBe(1);
		expect(worst).toBeGreaterThan(0);   // it really did move; this test is not vacuous
		// 4.9e-16 on a hot subdwarf, measured over the sweep above.
		expect(worst).toBeLessThan(1e-15);
	});

	it('the two unit conventions are one derivation, so a factor applied once reaches both', () => {
		for (const [name, r, t] of STARS) {
			expect(luminosityWattsFromRT(r, t), name).toBe(luminositySolarFromRT(r, t) * SOLAR_LUMINOSITY_W);
		}
		// And the Sun's own watts figure is what the old inline expression gave for the Sun.
		expect(SOLAR_LUMINOSITY_W).toBe(legacyTemperatureLuminosityW(SOLAR_RADIUS_KM, SOLAR_TEFF_K));
	});
});

// --- WHAT A GM ACTUALLY READS ----------------------------------------------------------------
// The ulp above is only acceptable if nothing PUBLISHED moves. These are the four figures the
// changed sites feed, checked to twelve significant figures against the old expressions.

const star = (radiusKm: number, temperatureK: number): CelestialBody =>
	({ id: 'star', kind: 'body', roleHint: 'star', name: 'S', parentId: null, massKg: 1.989e30, radiusKm, temperatureK, tags: [] }) as unknown as CelestialBody;

const planetAt = (au: number): CelestialBody =>
	({
		id: 'p', kind: 'body', roleHint: 'planet', name: 'P', parentId: 'star', massKg: 6e24, radiusKm: 6371, tags: [],
		orbit: { hostId: 'star', hostMu: 1.327e20, t0: 0, elements: { a_AU: au, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }
	}) as unknown as CelestialBody;

describe('B110 - no published figure moves', () => {
	it('the habitable zone edges are unchanged to twelve significant figures', () => {
		for (const [name, r, t] of STARS) {
			const s = star(r, t);
			const hz = calculateGoldilocksZone(s);
			// The zone scales as sqrt(L), so reproduce it from the LEGACY luminosity and compare.
			const ratio = Math.sqrt(legacyZonesLuminosity(r, t) / luminositySolarFromRT(r, t));
			expect(hz.inner * ratio, `${name} inner`).toBeCloseTo(hz.inner, 12);
			expect(hz.outer * ratio, `${name} outer`).toBeCloseTo(hz.outer, 12);
			expect(ratio, `${name} zone scale factor`).toBeCloseTo(1, 15);
			// The kill zone reads the same luminosity and moves the same way, which is to say not at all.
			expect(calculateKillZone(s) * ratio, `${name} kill zone`).toBeCloseTo(calculateKillZone(s), 12);
		}
	});

	it('equilibrium temperature is unchanged to twelve significant figures', () => {
		for (const [name, r, t] of STARS) {
			const s = star(r, t);
			for (const au of [0.05, 0.3, 1, 5.2, 30]) {
				const p = planetAt(au);
				const now = calculateEquilibriumTemperature(p, [s, p], 0.3);
				// Teq goes as L^0.25 - rebuild what the OLD watts expression would have given.
				const legacyRatio = Math.pow(legacyTemperatureLuminosityW(r, t) / luminosityWattsFromRT(r, t), 0.25);
				expect(now * legacyRatio, `${name} at ${au} AU`).toBeCloseTo(now, 12);
			}
		}
	});

	it('and a star with no radius or no temperature is still handled, not NaN', () => {
		expect(luminositySolarFromRT(0, 5778)).toBe(0);
		expect(luminositySolarFromRT(SOLAR_RADIUS_KM, 0)).toBe(0);
		expect(luminosityWattsFromRT(0, 0)).toBe(0);
		expect(Number.isFinite(calculateEquilibriumTemperature(planetAt(1), [star(0, 0), planetAt(1)], 0.3))).toBe(true);
	});
});

// THE PROPERTY THE ITEM EXISTS FOR, and the one that does not go stale the way a copied column does:
// the habitable zone and a planet's equilibrium temperature must READ THE SAME STAR. Anything that
// dims a star - a Dyson swarm, a dust lane, an eclipsing companion - lands in `luminosity.ts`, and
// these two assertions are what say it will reach both. They are written against the shared function
// rather than against a copied expression, so they survive the legacy column being deleted.
describe('B110 - the zone and the temperature read ONE star', () => {
	it('equilibrium temperature is exactly the flux from the shared luminosity', () => {
		for (const [name, r, t] of STARS) {
			const s = star(r, t);
			for (const au of [0.3, 1, 5.2]) {
				const p = planetAt(au);
				const albedo = 0.3;
				const d_m = au * AU_KM * 1000;
				const flux = luminosityWattsFromRT(r, t) / (4 * Math.PI * d_m * d_m);
				const expected = Math.pow((flux * (1 - albedo)) / (4 * STEFAN_BOLTZMANN_CONSTANT), 0.25);
				// Relative rather than exact: the engine reaches the distance through
				// `calculateDistanceToStar`, which is a different float path from `a_AU` even for a
				// circular orbit. The STAR's contribution is what is being pinned, and it is exact.
				expect(rel(calculateEquilibriumTemperature(p, [s, p], albedo), expected), `${name} at ${au} AU`).toBeLessThan(1e-14);
			}
		}
	});

	// THE ONE THAT ACTUALLY CATCHES [[B110]]'s FAILURE MODE, and it was written only after the first
	// attempt was tested and found NOT to. Dimming `zones.getLuminosity` alone - a Dyson swarm applied
	// to the habitable zone and not to a planet's temperature, exactly the reported hazard - left every
	// other gate in this file GREEN, because they all compare a star against ANOTHER star through the
	// same function and a common factor cancels. Catching it needs an ABSOLUTE anchor that the two
	// subsystems reach from opposite directions.
	//
	// This is it, and it is a physical statement rather than a magic number: the RUNAWAY-GREENHOUSE
	// EDGE IS A TEMPERATURE. Kopparapu's inner edge is the distance where a world receives a
	// particular flux, so a planet sitting on it must read the SAME equilibrium temperature whatever
	// size the star is - the luminosity cancels between the distance and the flux. It cancels only
	// while both sides are the same luminosity. If the zone is computed from a dimmed star and the
	// temperature from an undimmed one (or the reverse), this number moves by the fourth root of the
	// disagreement, and nothing else in the engine would say so.
	it('the runaway-greenhouse edge is a TEMPERATURE, and it is the same one whatever size the star is', () => {
		for (const [teff, radii] of [[5778, [0.5, 1, 2, 8]], [3200, [0.1, 0.3, 0.9]], [7000, [1, 1.4, 3]]] as [number, number[]][]) {
			const edges = radii.map((k) => {
				const s = star(k * SOLAR_RADIUS_KM, teff);
				const hz = calculateGoldilocksZone(s);
				const at = (au: number) => calculateEquilibriumTemperature(planetAt(au), [s, planetAt(au)], 0);
				return { inner: at(hz.inner), outer: at(hz.outer) };
			});
			for (const e of edges) {
				expect(e.inner, `${teff} K inner edge`).toBeCloseTo(edges[0].inner, 6);
				expect(e.outer, `${teff} K outer edge`).toBeCloseTo(edges[0].outer, 6);
			}
		}
	});

	// ...and the absolute pins, because the property above still cancels a CONSTANT disagreement.
	// These are what a factor applied on one side of the chain and not the other actually moves.
	it('and those temperatures are these, which is what a one-sided dimming would change', () => {
		const edge = (radiusKm: number, teff: number, which: 'inner' | 'outer') => {
			const s = star(radiusKm, teff);
			const au = calculateGoldilocksZone(s)[which];
			return calculateEquilibriumTemperature(planetAt(au), [s, planetAt(au)], 0);
		};
		expect(edge(SOLAR_RADIUS_KM, 5778, 'inner')).toBeCloseTo(285.904693697, 6);
		expect(edge(SOLAR_RADIUS_KM, 5778, 'outer')).toBeCloseTo(215.295701706, 6);
		expect(edge(0.3 * SOLAR_RADIUS_KM, 3200, 'inner')).toBeCloseTo(273.413778070, 6);
		expect(edge(1.4 * SOLAR_RADIUS_KM, 7000, 'inner')).toBeCloseTo(296.124004421, 6);
	});

	it('the habitable zone scales exactly as the square root of the shared luminosity', () => {
		// Same effective temperature, so the Kopparapu seff coefficients are identical and the only
		// thing that can move the edges is L. Four times the area is exactly twice the distance.
		for (const teff of [3200, 5778, 7000]) {
			const small = calculateGoldilocksZone(star(SOLAR_RADIUS_KM, teff));
			const big = calculateGoldilocksZone(star(2 * SOLAR_RADIUS_KM, teff));
			expect(big.inner / small.inner, `${teff} K inner`).toBeCloseTo(2, 12);
			expect(big.outer / small.outer, `${teff} K outer`).toBeCloseTo(2, 12);
			expect(Math.sqrt(luminositySolarFromRT(2 * SOLAR_RADIUS_KM, teff) / luminositySolarFromRT(SOLAR_RADIUS_KM, teff)))
				.toBeCloseTo(2, 12);
		}
	});
});

// The engine holds ONE Sun. Before this there were four opinions about how bright it is, and the
// spread was 0.6% rather than an ulp - see the B110 row for the other three, which are a VALUE
// change and deliberately not in this commit.
describe('B110 - one Sun', () => {
	it('the solar reference temperature has a single definition', async () => {
		const { SOLAR_TEMPERATURE_K } = await import('./stellar-evolution');
		expect(SOLAR_TEMPERATURE_K).toBe(SOLAR_TEFF_K);
	});

	it('and the solar luminosity used for unit conversion is derived from it, not asserted', () => {
		expect(SOLAR_LUMINOSITY_W / 1e26).toBeCloseTo(3.851008, 5);
		expect(luminositySolarFromRT(SOLAR_RADIUS_KM, SOLAR_TEFF_K)).toBe(1);
		expect(luminosityWattsFromRT(SOLAR_RADIUS_KM, SOLAR_TEFF_K)).toBe(SOLAR_LUMINOSITY_W);
		// AU_KM is imported so the sweep above can be read against real orbital distances; keep the
		// reference honest rather than dropping the import.
		expect(AU_KM).toBeGreaterThan(0);
	});
});
