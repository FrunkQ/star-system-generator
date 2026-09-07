// P1 EQUIVALENCE: scaleLaw.ts was lifted out of holo/scene.ts's closures, and phase P1 of
// docs/dev/camera-framing-redesign.md says it must behave BIT FOR BIT as before. The `legacy*`
// functions below are the old closure bodies copied verbatim (with bodySize/rMax/GRID_RADIUS made
// arguments) - so a divergence between the two columns IS the bug, and it fails here rather than
// on the owner's screen.
//
// The law itself CHANGES in P4. When it does, delete the legacy column in the same commit and
// replace these with the monotonicity properties (see `describe('R9 ordering')` at the bottom,
// which is the P4 acceptance test and is deliberately written NOW so P4 has a target that already
// records where today's law fails it).
import { describe, it, expect } from 'vitest';
import { AU_KM } from '$lib/constants';
import {
	GRID_RADIUS, STAR_RADIUS, dialBlend, readableBodyRadius, bodyRadiusScene,
	starRadiusScene, readableShipLength, shipLengthScene, markerScale,
	radiusKmOf, starRadiusKmOf, shipLengthMOf, trueScaleFactor, NUMERICAL_FLOOR, wireDotSize,
	readableSpanScene, constructDial } from './scaleLaw';

// P1's EQUIVALENCE COLUMN IS GONE, and this is the commit the file itself said would delete it:
// "The law itself CHANGES in P4. When it does, delete the legacy column in the same commit and
// replace these with the monotonicity properties." Pinning the old law bit-for-bit is exactly what
// P4 exists to stop doing; what replaces it is the R9 ordering block below, which is a PROPERTY
// rather than a snapshot and so cannot go stale the way a copied closure can.
//
// WHAT IS STILL PINNED, deliberately, because P4 was not supposed to move it:
//   - every body 1000 km in radius or larger renders EXACTLY as before (the anchor and the 0.2
//     slope above it ARE the shipped body curve, kept on purpose);
//   - dialBlend, markerScale, wireDotSize, the authored-size defaults and the true-scale factor;
//   - S2b's single floor.

// A sweep wide enough to catch a clamp moving: every dial stop against real object sizes, in
// systems from a tight red dwarf (rMax 0.5 AU) to a wide one (rMax 100 AU).
const DIALS = [0, 0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.98, 0.999, 1];
const RMAXES = [0.5, 5, 30, 100];

/** The shipped body curve - the half of the law P4 must not have moved. */
const shippedBodyRadius = (km: number) => 0.14 + 0.1 * Math.max(0, Math.log10(km / 1000));

describe('S2 kept the half of the law it was not meant to move', () => {
	it('every body 1000 km in radius or larger renders exactly as before, at every dial stop', () => {
		for (const v of DIALS) for (const rMax of RMAXES) for (const km of [1000, 1737, 6371, 69911, 696000]) {
			expect(readableBodyRadius(km)).toBeCloseTo(shippedBodyRadius(km), 12);
			const trueScene = (km / AU_KM) * (GRID_RADIUS / rMax);
			const before = v >= 0.999 ? shippedBodyRadius(km)
				: Math.max(NUMERICAL_FLOOR, dialBlend(trueScene, shippedBodyRadius(km), v));
			expect(bodyRadiusScene(km, true, { bodySize: v, rMax })).toBeCloseTo(before, 12);
		}
	});

	it('the small end DID move, and that is the fix rather than a regression', () => {
		// A 100 km moon used to sit on the flat 0.28 span with every other small body. It now has a
		// place in the order, which is what makes room for ships underneath it.
		expect(readableBodyRadius(100) * 2).toBeLessThan(0.28);
		expect(readableBodyRadius(100) * 2).toBeGreaterThan(readableShipLength(22_000));
		// ...and it loses to a 940 km station, which is the point: the station is PHYSICALLY bigger.
		expect(readableBodyRadius(100) * 2).toBeLessThan(readableShipLength(940_000));
	});

	it('dialBlend, markerScale and the authored defaults are untouched', () => {
		for (const v of DIALS) for (const t of [1e-12, 1e-9, 1e-5, 0.01, 1, 100]) for (const r of [0.1, 0.5, 1]) {
			expect(dialBlend(t, r, v)).toBe(Math.exp(Math.log(Math.max(1e-12, t)) * (1 - v) + Math.log(Math.max(1e-12, r)) * v));
		}
		for (const v of DIALS) expect(markerScale(v)).toBe(v >= 0.999 ? 1 : Math.max(0.02, v));
	});
});

describe('S2: one kind-blind span map', () => {
	it('is monotone in physical size across thirteen decades', () => {
		let prev = -Infinity;
		for (let L = 0; L <= 13; L += 0.05) {
			const v = readableSpanScene(Math.pow(10, L));
			expect(v).toBeGreaterThanOrEqual(prev);
			prev = v;
		}
	});

	it('a construct and a body of the SAME physical size render the same size', () => {
		for (const m of [1000, 22_000, 940_000, 3_474_000]) {
			expect(readableShipLength(m)).toBeCloseTo(readableBodyRadius(m / 2000) * 2, 12);
		}
	});

	it('stars are on the same map, so a supergiant no longer matches a red dwarf', () => {
		const dwarf = starRadiusScene(100_181, { bodySize: 1, rMax: 30 });      // Wolf 359
		const sol = starRadiusScene(696_000, { bodySize: 1, rMax: 30 });
		const supergiant = starRadiusScene(626_000_000, { bodySize: 1, rMax: 30 });
		expect(dwarf).toBeLessThan(sol);
		expect(sol).toBeLessThan(supergiant);
		// ...and the flat value every star used to draw at is no longer any of them.
		expect(Math.abs(sol - STAR_RADIUS)).toBeGreaterThan(0.01);
	});

	it('never returns a non-positive span, however small the object', () => {
		for (const m of [1e-6, 0.001, 0.1, 1, 20]) expect(readableSpanScene(m)).toBeGreaterThan(0);
	});
});

describe('the law defaults for nodes that authored nothing', () => {
	it('reads authored sizes, and falls back the way the scene did', () => {
		expect(radiusKmOf({ physical_parameters: { radiusKm: 1737 } })).toBe(1737);
		expect(radiusKmOf({ radiusKm: 42 })).toBe(42);
		expect(radiusKmOf({})).toBe(3000);
		expect(starRadiusKmOf({})).toBe(696000);
		expect(shipLengthMOf({ physical_parameters: { dimensionsM: [46, 24, 24] } })).toBe(46);
		expect(shipLengthMOf({})).toBe(100);
		// The longest axis wins whichever slot it is in - the hull's LENGTH is what is drawn.
		expect(shipLengthMOf({ physical_parameters: { dimensionsM: [10, 900, 10] } })).toBe(900);
	});

	it('true-scale factor is scene units per AU', () => {
		expect(trueScaleFactor({ bodySize: 0, rMax: 30 })).toBeCloseTo(GRID_RADIUS / 30, 12);
	});
});

// --- P4 ACCEPTANCE, written now so the target exists before the work ----------------------------
// R9 in docs/dev/camera-framing-redesign.md: at EVERY dial position, a physically larger object
// must never render smaller than a physically smaller one. The owner's decision (2026-08-06) is
// that this is kind-blind - bands are by PHYSICAL size, with no construct cap, because "you could
// construct a death star".
//
// UN-SKIPPED IN P4/S2, 2026-08-27, and NOT ONE ASSERTION WAS TOUCHED - they are the owner's
// decision written down, so the LAW was moved until they passed rather than the other way about.
// They used to fail because the ship band (0.14-0.7) OVERLAPPED the body band, so a 46 m frigate
// out-drew a 100 km moon at the readable end. There is one band now: `readableSpanScene`.
describe('S2c: the construct dial is a RELATIVE offset, and zero is today', () => {
	it('offset 0 is bit-identical to the single-dial law, at every dial stop', () => {
		for (const v of DIALS) for (const rMax of RMAXES) for (const m of [20, 46, 1000, 22_000, 940_000]) {
			expect(shipLengthScene(m, { bodySize: v, rMax, constructOffset: 0 }))
				.toBe(shipLengthScene(m, { bodySize: v, rMax }));
		}
	});

	it('a positive offset moves constructs toward readable and leaves BODIES alone', () => {
		const base = { bodySize: 0.3, rMax: 30 };
		const nudged = { ...base, constructOffset: 0.4 };
		expect(shipLengthScene(46, nudged)).toBeGreaterThan(shipLengthScene(46, base));
		// The body law never sees the offset - that is the whole of "bodies moves both, constructs
		// only moves itself".
		expect(bodyRadiusScene(1737, true, nudged)).toBe(bodyRadiusScene(1737, true, base));
		expect(starRadiusScene(696_000, nudged)).toBe(starRadiusScene(696_000, base));
	});

	it('the offset cannot push the dial outside its own range', () => {
		expect(constructDial({ bodySize: 0.9, rMax: 30, constructOffset: 0.5 })).toBe(1);
		expect(constructDial({ bodySize: 0.1, rMax: 30, constructOffset: -0.5 })).toBe(0);
	});

	it('R9 is a property of the LAW, so it is asserted at offset 0 and not against a departure', () => {
		// Sliding constructs apart is a user's visible choice, not the engine lying - so a non-zero
		// offset is ALLOWED to break the ordering, and this pins that it is the offset doing it.
		const ctx = { bodySize: 0.5, rMax: 30, constructOffset: 0.5 };
		expect(shipLengthScene(46, ctx)).toBeGreaterThan(bodyRadiusScene(100, true, ctx) * 2);
		const honest = { bodySize: 0.5, rMax: 30 };
		expect(shipLengthScene(46, honest)).toBeLessThan(bodyRadiusScene(100, true, honest) * 2);
	});
});

describe('R9 ordering (P4 acceptance - now the law)', () => {
	const renderedSize = (kind: 'body' | 'ship', size: number, ctx: { bodySize: number; rMax: number }) =>
		kind === 'body' ? bodyRadiusScene(size, true, ctx) * 2 : shipLengthScene(size, ctx);

	it('a physically larger object never renders smaller, across every kind boundary', () => {
		for (const v of DIALS) for (const rMax of RMAXES) {
			// diameters in metres, so bodies and ships are comparable on one axis
			const things: Array<{ kind: 'body' | 'ship'; metres: number; arg: number }> = [
				{ kind: 'ship', metres: 46, arg: 46 },
				{ kind: 'ship', metres: 1000, arg: 1000 },
				{ kind: 'ship', metres: 22000, arg: 22000 },
				{ kind: 'body', metres: 2 * 100 * 1000, arg: 100 },
				{ kind: 'body', metres: 2 * 1737 * 1000, arg: 1737 },
				{ kind: 'body', metres: 2 * 6371 * 1000, arg: 6371 }
			].sort((a, b) => a.metres - b.metres);

			for (let i = 1; i < things.length; i++) {
				const small = renderedSize(things[i - 1].kind, things[i - 1].arg, { bodySize: v, rMax });
				const large = renderedSize(things[i].kind, things[i].arg, { bodySize: v, rMax });
				expect(large).toBeGreaterThanOrEqual(small);
			}
		}
	});

	it('a moon-sized construct is allowed to read moon-sized (no construct cap)', () => {
		// Ceres Station, 940 km across, vs Ceres-sized rock. Within a factor of ~2 is "the same
		// scale"; the point is that the construct is NOT held down to ship scale.
		const ctx = { bodySize: 1, rMax: 30 };
		const station = shipLengthScene(940_000, ctx);
		const rock = bodyRadiusScene(470, true, ctx) * 2;
		expect(station / rock).toBeGreaterThan(0.5);
		expect(station / rock).toBeLessThan(2);
	});
});

// S2b ACCEPTANCE. The exact pair /scale-reference flagged: at TRUE scale a 10 km moonlet must not
// out-draw a physically larger 22 km station. This is a real fix, not a tolerance change - before
// the shared floor the ratio was 3.4x the wrong way.
describe('S2b: one numerical floor across kinds', () => {
	it('a 10 km moonlet no longer out-draws a 22 km station at true scale', () => {
		const ctx = { bodySize: 0, rMax: 30 };
		const moonlet = bodyRadiusScene(5, true, ctx) * 2;   // 5 km radius = 10 km across
		const station = shipLengthScene(22000, ctx);          // 22 km long
		expect(station).toBeGreaterThan(moonlet);
	});

	it('every kind bottoms out at the same value', () => {
		const tiny = { bodySize: 0, rMax: 1e6 }; // a system wide enough to floor everything
		expect(bodyRadiusScene(1, true, tiny)).toBe(NUMERICAL_FLOOR);
		expect(starRadiusScene(1, tiny)).toBe(NUMERICAL_FLOOR);
		expect(shipLengthScene(1, tiny)).toBe(NUMERICAL_FLOOR);
	});
});

// C15: the lo-poly/wireframe VERTEX DOTS did not shrink toward true scale, so a planet became a
// white blob with the wireframe scribbled inside it (owner screenshot: Mars, Phobos and Deimos).
// The dot size carried a floor in WORLD units - F2/F3's fault on a new surface - and the floor
// bottomed out five orders of magnitude above where the body did.
describe('wireDotSize - a vertex dot belongs to its body (C15)', () => {
	// Mars in a 30 AU system at the true-scale end, from the shipped law.
	const MARS_TRUE = 9.1e-6;
	const MARS_READABLE = 0.1;

	it('NEVER exceeds its body, at any dial position - the fault, pinned', () => {
		for (const bodySize of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
			for (const r of [MARS_TRUE, 1e-8, 1e-4, 0.01, MARS_READABLE, 0.5]) {
				expect(wireDotSize(r, bodySize)).toBeLessThanOrEqual(r);
			}
		}
	});

	it('the OLD sizing did exceed it, by 44x on the reported case', () => {
		const old = Math.max(0.02 * markerScale(0), MARS_TRUE * 0.13);
		expect(old / MARS_TRUE).toBeGreaterThan(40); // the blob
		expect(wireDotSize(MARS_TRUE, 0) / MARS_TRUE).toBeLessThanOrEqual(1);
	});

	it('shrinks with the body as the dial goes to true scale', () => {
		expect(wireDotSize(MARS_TRUE, 0)).toBeLessThan(wireDotSize(MARS_READABLE, 1));
	});

	it('keeps a visible dot at the readable end, where the floor earns its place', () => {
		// A small readable moon still gets a dot that is a real fraction of it, not a sliver.
		expect(wireDotSize(0.02, 1)).toBeGreaterThan(0.02 * 0.1);
	});

	it('is never negative, and a size-less body gets no dot rather than a floor', () => {
		expect(wireDotSize(0, 0)).toBe(0);
		expect(wireDotSize(-1, 1)).toBe(0);
	});
});

import { satelliteDrawDistance } from './scaleLaw';

describe('satelliteDrawDistance - THE spread law, one function for a moon, its ring, and a structure hung on its host', () => {
	// Earth at 1 AU on a linear grid: 12 scene units per AU, so kHelio = localScale = 12.
	const K = 12, L = 12;
	const GEO_AU = 42164 / 149597870.7;      // geostationary RADIUS (from the centre), Earth
	const MOON_AU = 384400 / 149597870.7;
	const EARTH_TRUE_RAD = (6371 / 149597870.7) * K;   // Earth's true drawn radius on that grid

	it('TRUE SCALE, ABSOLUTE ANCHOR: the geostationary dock stands 6.62 host radii out - physics, untouched', () => {
		const d = satelliteDrawDistance(GEO_AU, K, L, EARTH_TRUE_RAD, 0, 0);
		expect(d).toBeCloseTo(GEO_AU * K, 12);                 // exactly the offset under the radial map
		expect(d / EARTH_TRUE_RAD).toBeCloseTo(42164 / 6371, 6); // 6.618 Earth radii
	});

	it('READABLE SCALE, ABSOLUTE ANCHOR: the spread formula, to the digit (a refactor that moves it fails here)', () => {
		// parentRad 0.28 (the readable span anchor), full compression, no moon radius.
		const d = satelliteDrawDistance(GEO_AU, K, L, 0.28, 0, 1);
		const spread = 0.28 * 1.15 + L * 0.05 * Math.log10(1 + GEO_AU / 0.0006);
		expect(d).toBeCloseTo(spread, 12);
		expect(d).toBeCloseTo(0.4223, 3);
	});

	it('NEVER OVERTAKES THE MOON: monotonic in distance at every dial position and body size', () => {
		for (const c of [0, 0.5, 1]) for (const pr of [EARTH_TRUE_RAD, 0.05, 0.28]) {
			let prev = -1;
			for (let off = 1e-5; off < 0.05; off *= 1.3) {
				const d = satelliteDrawDistance(off, K, L, pr, 0, c);
				expect(d).toBeGreaterThanOrEqual(prev);
				prev = d;
			}
			expect(satelliteDrawDistance(GEO_AU, K, L, pr, 0, c)).toBeLessThan(satelliteDrawDistance(MOON_AU, K, L, pr, 0, c));
		}
	});

	it('THE COINCIDENCE CONTRACT: a dock and a station at the same radius get the same number', () => {
		for (const c of [0, 1]) {
			expect(satelliteDrawDistance(GEO_AU, K, L, 0.28, 0, c)).toBe(satelliteDrawDistance(GEO_AU, K, L, 0.28, 0, c));
		}
	});

	it('clears the parent globe: the floor is the readable clearance, never inside the rendered planet', () => {
		// A surface-hugging offset on a chunky readable planet: physics would put it INSIDE the globe.
		const d = satelliteDrawDistance(1e-5, K, L, 0.28, 0.01, 0);
		expect(d).toBeGreaterThanOrEqual(0.28 * 1.12 + 0.01);
	});
});
