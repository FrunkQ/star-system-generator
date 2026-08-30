// WHAT AN OBSERVER MEASURES (G54 phase 2) — and every assertion that could hide a constant factor
// is ABSOLUTE, because PHY-34 was paid for this week in exactly this territory.
//
// THE LESSON, restated so it is not re-learned a fourth time: an equivalence gate that compares two
// things THROUGH THE SAME FUNCTION cannot see a factor applied to that function. `observed/intrinsic`
// is precisely that shape — multiply `blackbodySpectrum` by a hundred and the ratio does not move.
// So the spectral assertions here are pinned to NUMBERS, not to each other:
//
//   - the in-band radiant power of a 5778 K blackbody normalised to unit bolometric output;
//   - the transmission of tau=1 dust at its own reference wavelength, which is exp(-1) by definition;
//   - the band-integrated transmission of a G star behind that dust, which is a real spectral
//     integral over Planck's law and a 1/lambda curve and can only come out right if both are;
//   - the re-radiation temperature of a 1 AU shell, in kelvin, WHICH IS ALSO REACHED FROM THE
//     OPPOSITE DIRECTION by the equilibrium-temperature chain. That second reach is the part that
//     matters: a factor bolted onto either subsystem breaks the relation between them, and no ratio
//     inside one of them would have noticed.
import { describe, it, expect } from 'vitest';
import {
	greyTransmission, dustTransmission, composeLineOfSight, reradiationTempK, observedStarReading,
	observedStarOf, observedStarHex, orbitPlaneNormal, bandCoversBearing, occluderEffect,
	EXTINCTION_REFERENCE_NM, ANOMALY_THRESHOLDS, CLEAR_READING, DUST_OVERRIDE_KEY,
	type LineOfSightEffect
} from './observedStar';
import { GRID_NM, GRID_MAX_NM, blackbodySpectrum, gridShare, radiantPower } from './spectrum';
import { SOLAR_LUMINOSITY_W, SOLAR_TEFF_K } from './luminosity';
import { calculateEquilibriumTemperature } from './temperature';
import { SOLAR_RADIUS_KM } from '$lib/constants';
import type { CelestialBody } from '../types';

const idx550 = GRID_NM.indexOf(EXTINCTION_REFERENCE_NM);

const star = (over: Partial<CelestialBody> = {}): CelestialBody => ({
	id: 'sun', name: 'Sun', kind: 'body', roleHint: 'star', parentId: null,
	radiusKm: SOLAR_RADIUS_KM, temperatureK: SOLAR_TEFF_K, massKg: 1.989e30, tags: [],
	...over
} as CelestialBody);

/** A megastructure orbiting `sun` at `aAU`, in a plane tilted `iDeg`. */
const mega = (megaType: string, aAU: number, iDeg = 0, id = 'm1'): CelestialBody => ({
	id, name: megaType, kind: 'construct', roleHint: 'mega', parentId: 'sun', tags: [],
	megaType,
	orbit: { hostId: 'sun', hostMu: 1.327e20, elements: { a_AU: aAU, e: 0, i_deg: iDeg, Omega_deg: 0, omega_deg: 0, M0_rad: 0, t0_ms: 0 } }
} as unknown as CelestialBody);

// ── ABSOLUTE ANCHORS ─────────────────────────────────────────────────────────────────────────────

describe('the absolute anchors — no ratios, per PHY-34', () => {
	it('pins the in-band radiant power of a Sun-temperature blackbody', () => {
		// ABSOLUTE. Every transmission figure below is this number's ratio to another, and a ratio is
		// blind to a factor applied to both — so the denominator itself is pinned.
		expect(radiantPower(blackbodySpectrum(SOLAR_TEFF_K, gridShare(SOLAR_TEFF_K))))
			.toBeCloseTo(0.8385026526836152, 12);
	});

	it('pins tau=1 dust to exp(-1) at its own reference wavelength, which is what tau MEANS', () => {
		// ABSOLUTE, and it is the definition of the authored number. A constant divergence in the
		// extinction builder — a factor, a wrong reference wavelength, natural log for log10 — moves
		// this and nothing else in the file would have caught it.
		expect(dustTransmission(1)[idx550]).toBeCloseTo(Math.exp(-1), 15);
		expect(dustTransmission(1)[idx550]).toBeCloseTo(0.36787944117144233, 15);
	});

	it('pins the band-integrated transmission of a G star behind tau=1 dust', () => {
		// ABSOLUTE, and the strongest spectral assertion here: it is a real integral of Planck's law
		// against a 1/lambda curve over the shared grid, so it can only come out right if the grid,
		// the blackbody and the extinction law are all right at once.
		const los = composeLineOfSight([{ sourceId: 'd', sourceName: 'Dust', transmission: dustTransmission(1) }]);
		expect(observedStarReading(SOLAR_TEFF_K, los).transmission).toBeCloseTo(0.42850611227272434, 12);
	});

	it('pins a 1 AU shell to 394.208 K in kelvin', () => {
		// ABSOLUTE. sigma T^4 = L / (4 pi r^2), which at 1 AU is the solar constant itself.
		expect(reradiationTempK(SOLAR_LUMINOSITY_W, 1)).toBeCloseTo(394.20806310526365, 10);
	});

	it('AND REACHES THAT SAME TEMPERATURE FROM THE OPPOSITE DIRECTION — the PHY-34 shape', () => {
		// A shell intercepts the WHOLE luminosity over its own sphere; a black planet intercepts a
		// quarter of that per unit area (pi r^2 caught, 4 pi r^2 radiating). So the shell is exactly
		// 4^(1/4) = sqrt(2) hotter than the equilibrium temperature the temperature chain computes
		// for a zero-albedo world at the same distance — and that chain is a different subsystem
		// reached through different code. A factor bolted onto EITHER breaks this; a ratio taken
		// inside either one would not have noticed.
		const sun = star();
		const rock = {
			id: 'rock', name: 'Rock', kind: 'body', roleHint: 'planet', parentId: 'sun', tags: [],
			radiusKm: 6371,
			orbit: { hostId: 'sun', hostMu: 1.327e20, elements: { a_AU: 1, e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 0, t0_ms: 0 } }
		} as unknown as CelestialBody;
		const planetK = calculateEquilibriumTemperature(rock, [sun, rock], 0);
		expect(planetK).toBeGreaterThan(0);
		expect(reradiationTempK(SOLAR_LUMINOSITY_W, 1) / planetK).toBeCloseTo(Math.SQRT2, 12);
	});

	it('puts the re-emission peak far outside the grid, which is why it is a scalar and not a curve', () => {
		// THE OUT-OF-BAND RULE AS A GATE. 7,351 nm against a grid that stops at 1,400: reaching it
		// would mean tens of thousands of samples per spectrum on every body on every pass. If this
		// ever falls inside the grid, the split in this module's header is the thing to re-examine.
		const los = composeLineOfSight([occluderEffect(
			{ id: 's', name: 'Shell', fraction: 1, radiusAu: 1 }, SOLAR_LUMINOSITY_W)]);
		const r = observedStarReading(SOLAR_TEFF_K, los, SOLAR_LUMINOSITY_W);
		expect(r.reradiatedPeakNm).toBeCloseTo(7350.869315491958, 8);
		expect(r.reradiatedPeakNm).toBeGreaterThan(5 * GRID_MAX_NM);
	});

	it('pins the watts a swarm takes, absolutely', () => {
		const e = occluderEffect({ id: 's', name: 'Swarm', fraction: 0.4, radiusAu: 1 }, SOLAR_LUMINOSITY_W);
		expect(e.reradiatedW).toBeCloseTo(1.5404032573819511e26, -14);
	});
});

// ── THE §2 CORRECTION, AS ASSERTIONS ─────────────────────────────────────────────────────────────

describe('a swarm dims without reddening; dust dims AND reddens', () => {
	const grey = (f: number) => composeLineOfSight([{ sourceId: 'g', sourceName: 'Swarm', transmission: greyTransmission(f) }]);

	it('grey attenuation moves the brightness and NOT the colour, at any depth', () => {
		// The owner-corrected physics as a gate: absorption flat across wavelength cuts FLUX without
		// touching COLOUR, which is why "a G star that looks M" is a nebula story and not a swarm one.
		for (const f of [0.01, 0.1, 0.4, 0.75, 0.99]) {
			const r = observedStarReading(SOLAR_TEFF_K, grey(f));
			expect(r.transmission).toBeCloseTo(1 - f, 12);
			expect(r.reddened).toBe(false);
			// All three human primaries lose the SAME share — that is what "no hue change" means.
			expect(r.colourGain[0]).toBeCloseTo(1 - f, 10);
			expect(r.colourGain[1]).toBeCloseTo(1 - f, 10);
			expect(r.colourGain[2]).toBeCloseTo(1 - f, 10);
		}
	});

	it('and does it for a cool star and a hot one alike, because grey is grey', () => {
		for (const tempK of [3200, SOLAR_TEFF_K, 30000]) {
			const r = observedStarReading(tempK, grey(0.4));
			expect(r.transmission).toBeCloseTo(0.6, 12);
			expect(r.reddened).toBe(false);
		}
	});

	it('dust takes strictly more from the blue end than the red', () => {
		const r = observedStarReading(SOLAR_TEFF_K, composeLineOfSight([
			{ sourceId: 'd', sourceName: 'Dust', transmission: dustTransmission(1) }
		]));
		expect(r.reddened).toBe(true);
		expect(r.colourGain[0]).toBeGreaterThan(r.colourGain[1]);
		expect(r.colourGain[1]).toBeGreaterThan(r.colourGain[2]);
		// ABSOLUTE, so a curve that reddened by the wrong AMOUNT would not pass on ordering alone.
		expect(r.colourGain[0]).toBeCloseTo(0.42239007352193225, 12);
		expect(r.colourGain[2]).toBeCloseTo(0.2859178755765584, 12);
	});

	it('reddens an M dwarf too — the effect is the dust, not the star', () => {
		const r = observedStarReading(3200, composeLineOfSight([
			{ sourceId: 'd', sourceName: 'Dust', transmission: dustTransmission(1) }
		]));
		expect(r.reddened).toBe(true);
		expect(r.colourGain[0]).toBeGreaterThan(r.colourGain[2]);
	});

	it('deepens monotonically with optical depth', () => {
		let last = 1;
		for (const tau of [0.5, 1, 2, 3, 5]) {
			const t = observedStarReading(SOLAR_TEFF_K, composeLineOfSight([
				{ sourceId: 'd', sourceName: 'Dust', transmission: dustTransmission(tau) }
			])).transmission;
			expect(t).toBeLessThan(last);
			last = t;
		}
	});
});

// ── NOTHING IN THE WAY CHANGES NOTHING ───────────────────────────────────────────────────────────

describe('an empty line of sight is the exact identity', () => {
	it('reads clear', () => {
		const r = observedStarReading(SOLAR_TEFF_K, composeLineOfSight([]));
		expect(r.transmission).toBeCloseTo(1, 15);
		expect(r.magnitudeDrop).toBeCloseTo(0, 12);
		expect(r.anomalous).toBe(false);
		expect(r.reddened).toBe(false);
		expect(r.colourGain).toEqual([1, 1, 1]);
	});

	it('leaves the star colour BYTE-IDENTICAL, not merely close', () => {
		// The regression this guards: a colour recomputed spectrally rather than SCALED would move
		// every star on the map the day this shipped, swarm or no swarm.
		for (const hex of ['#fff4ea', '#9bb0ff', '#ffd2a1', '#000000', '#ffffff']) {
			expect(observedStarHex(hex, CLEAR_READING)).toBe(hex);
		}
	});

	it('a swarm at zero density is the same as no swarm at all', () => {
		const r = observedStarReading(SOLAR_TEFF_K, composeLineOfSight([
			{ sourceId: 'g', sourceName: 'Swarm', transmission: greyTransmission(0) }
		]));
		expect(r.colourGain).toEqual([1, 1, 1]);
		expect(observedStarHex('#fff4ea', r)).toBe('#fff4ea');
	});

	it('declines to guess for a star with no temperature', () => {
		expect(observedStarReading(0, composeLineOfSight([]))).toEqual(CLEAR_READING);
	});
});

// ── COMPOSITION ──────────────────────────────────────────────────────────────────────────────────

describe('composing several things in the way', () => {
	const swarm: LineOfSightEffect = { sourceId: 'a', sourceName: 'Swarm', transmission: greyTransmission(0.5), reradiatedW: 4, reradiatedTempK: 400 };
	const dust: LineOfSightEffect = { sourceId: 'b', sourceName: 'Dust', transmission: dustTransmission(1) };

	it('multiplies transmissions, so order cannot change the light that arrives', () => {
		const ab = composeLineOfSight([swarm, dust]);
		const ba = composeLineOfSight([dust, swarm]);
		for (let i = 0; i < GRID_NM.length; i++) expect(ab.transmission[i]).toBeCloseTo(ba.transmission[i], 15);
	});

	it('but keeps the order it was told, because that is the order a reader is told', () => {
		expect(composeLineOfSight([swarm, dust]).sources.map((s) => s.id)).toEqual(['a', 'b']);
		expect(composeLineOfSight([dust, swarm]).sources.map((s) => s.id)).toEqual(['b', 'a']);
	});

	it('sums the re-emission and weights its temperature by POWER, not by count', () => {
		const cold: LineOfSightEffect = { sourceId: 'c', sourceName: 'Ring', reradiatedW: 1, reradiatedTempK: 100 };
		const c = composeLineOfSight([swarm, cold]);
		expect(c.reradiatedW).toBe(5);
		// 4 W at 400 K and 1 W at 100 K: the mean a bolometer is told, not (400+100)/2.
		expect(c.reradiatedTempK).toBeCloseTo((4 * 400 + 1 * 100) / 5, 12);
		expect(c.reradiatedTempK).toBeCloseTo(340, 12);
	});

	it('says zero rather than NaN when nothing re-radiates', () => {
		expect(composeLineOfSight([dust]).reradiatedTempK).toBe(0);
		expect(composeLineOfSight([]).reradiatedTempK).toBe(0);
	});
});

// ── DIRECTION (design §2b) ───────────────────────────────────────────────────────────────────────

describe('a band dims only observers near its plane; a shell dims everyone', () => {
	it('takes the plane normal from the elements, with the standard convention', () => {
		expect(orbitPlaneNormal({ i_deg: 0, Omega_deg: 0 } as never)).toEqual([0, -0, 1]);
		const n = orbitPlaneNormal({ i_deg: 90, Omega_deg: 0 } as never);
		expect(n[0]).toBeCloseTo(0, 12);
		expect(n[1]).toBeCloseTo(-1, 12);
		expect(n[2]).toBeCloseTo(0, 12);
	});

	it('covers a bearing in its own plane and not one over its pole', () => {
		const w = 0.05;   // ~2.9 degrees of latitude
		const flat = { i_deg: 0, Omega_deg: 0 } as never;
		expect(bandCoversBearing(w, flat, [1, 0, 0])).toBe(true);
		expect(bandCoversBearing(w, flat, [0, 1, 0])).toBe(true);
		expect(bandCoversBearing(w, flat, [0, 0, 1])).toBe(false);
	});

	it('has an edge exactly at its own half-angle', () => {
		const w = 0.05;
		const flat = { i_deg: 0, Omega_deg: 0 } as never;
		const just = Math.sin(w) * 0.999, over = Math.sin(w) * 1.001;
		expect(bandCoversBearing(w, flat, [Math.sqrt(1 - just * just), 0, just])).toBe(true);
		expect(bandCoversBearing(w, flat, [Math.sqrt(1 - over * over), 0, over])).toBe(false);
	});

	it('does not care about the length of the bearing vector', () => {
		const flat = { i_deg: 0, Omega_deg: 0 } as never;
		expect(bandCoversBearing(0.05, flat, [1000, 0, 0])).toBe(true);
		expect(bandCoversBearing(0.05, flat, [0, 0, 0])).toBe(false);
	});

	it('a band with no extent covers nothing', () => {
		expect(bandCoversBearing(0, { i_deg: 0, Omega_deg: 0 } as never, [1, 0, 0])).toBe(false);
	});
});

// ── THE WHOLE READING, FROM A SYSTEM ─────────────────────────────────────────────────────────────

describe('reading a real star with real structures around it', () => {
	it('a clear star is not anomalous and not dimmed', () => {
		const sun = star();
		const { reading } = observedStarOf(sun, [sun]);
		expect(reading.transmission).toBeCloseTo(1, 15);
		expect(reading.anomalous).toBe(false);
	});

	it('a Dyson swarm dims it from every direction and puts out an infrared excess', () => {
		const sun = star();
		const swarm = mega('dyson-swarm', 1);
		for (const dir of [[1, 0, 0], [0, 0, 1], [0.3, -0.9, 0.2]] as const) {
			const { reading } = observedStarOf(sun, [sun, swarm], { viewDir: dir });
			expect(reading.transmission).toBeCloseTo(0.7, 10);   // registry default density 0.3
			expect(reading.reddened).toBe(false);
			expect(reading.irExcessFrac).toBeCloseTo(0.3, 10);
			expect(reading.anomalous).toBe(true);
		}
	});

	it('a ringworld dims it only from within its own plane', () => {
		// The owner's refinement, as the acceptance case: two crews in different systems honestly
		// disagree about what this star looks like, and both are right.
		const sun = star();
		const ring = mega('ringworld', 1);
		const inPlane = observedStarOf(sun, [sun, ring], { viewDir: [1, 0, 0] });
		expect(inPlane.reading.transmission).toBeCloseTo(0, 12);   // a solid ring: it blacks the star out
		expect(inPlane.reading.anomalous).toBe(true);

		const overPole = observedStarOf(sun, [sun, ring], { viewDir: [0, 0, 1] });
		expect(overPole.reading.transmission).toBeCloseTo(1, 12);
		expect(overPole.reading.anomalous).toBe(false);

		// A default ringworld subtends about a third of a degree, so even one degree off is clear.
		const oneDegOff = observedStarOf(sun, [sun, ring], { viewDir: [Math.cos(Math.PI / 180), 0, Math.sin(Math.PI / 180)] });
		expect(oneDegOff.reading.transmission).toBeCloseTo(1, 12);
	});

	it('follows the ring when the ring is tilted, rather than following the map', () => {
		const sun = star();
		const tilted = mega('ringworld', 1, 90);   // a polar ring
		expect(observedStarOf(sun, [sun, tilted], { viewDir: [0, 0, 1] }).reading.transmission).toBeCloseTo(0, 12);
		expect(observedStarOf(sun, [sun, tilted], { viewDir: [0, 1, 0] }).reading.transmission).toBeCloseTo(1, 12);
	});

	it('with NO viewpoint chosen it gives the isotropic answer and SAYS SO', () => {
		// Design §2b: "fall back to the isotropic answer and say so". Silently applying a band's
		// dimming would tell every GM without a chosen home system that their star is blacked out.
		const sun = star();
		const ring = mega('ringworld', 1, 0, 'ring');
		const swarm = mega('dyson-swarm', 1, 0, 'swarm');
		const { reading, los } = observedStarOf(sun, [sun, ring, swarm]);
		expect(reading.transmission).toBeCloseTo(0.7, 10);        // the swarm counts; the ring waits
		expect(los.bandsUnresolved.map((b) => b.id)).toEqual(['ring']);
	});

	it('an authored dust lane reddens it, and composes with the structures', () => {
		const sun = star({ overrides: { [DUST_OVERRIDE_KEY]: 1 } as never });
		const clear = observedStarOf(sun, [sun]);
		expect(clear.reading.reddened).toBe(true);
		expect(clear.reading.transmission).toBeCloseTo(0.42850611227272434, 12);

		const withSwarm = observedStarOf(sun, [sun, mega('dyson-swarm', 1)], { viewDir: [1, 0, 0] });
		expect(withSwarm.reading.transmission).toBeCloseTo(0.42850611227272434 * 0.7, 12);
		expect(withSwarm.los.sources.map((s) => s.name)).toEqual(['dyson-swarm', 'Foreground dust']);
	});

	it('needs the dimming to be real before it calls a star anomalous', () => {
		// The thresholds are DATA and this is what they are for: a one-per-cent collector array is
		// not a technosignature, and saying it is would make the badge meaningless.
		const r = observedStarReading(SOLAR_TEFF_K, composeLineOfSight([
			{ sourceId: 'g', sourceName: 'Array', transmission: greyTransmission(0.005) }
		]), SOLAR_LUMINOSITY_W);
		expect(r.magnitudeDrop).toBeLessThan(ANOMALY_THRESHOLDS.magnitudeDrop);
		expect(r.anomalous).toBe(false);
	});

	it('and calls it anomalous on the infrared alone when the dimming is marginal', () => {
		// The three measurements are independent evidence: an excess where none belongs is enough.
		const r = observedStarReading(SOLAR_TEFF_K, {
			transmission: greyTransmission(0), emission: greyTransmission(1).map(() => 0),
			reradiatedW: 0.05 * SOLAR_LUMINOSITY_W, reradiatedTempK: 300,
			sources: [{ id: 'x', name: 'A collector array' }]
		}, SOLAR_LUMINOSITY_W);
		expect(r.magnitudeDrop).toBeCloseTo(0, 12);
		expect(r.irExcessFrac).toBeCloseTo(0.05, 12);
		expect(r.anomalous).toBe(true);
	});
});
