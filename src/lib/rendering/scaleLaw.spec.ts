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
	radiusKmOf, starRadiusKmOf, shipLengthMOf, trueScaleFactor, NUMERICAL_FLOOR, wireDotSize } from './scaleLaw';

// --- the old closures, verbatim -----------------------------------------------------------------
const legacyDialBlend = (trueScene: number, readable: number, bodySize: number) => {
	const t = Math.max(1e-12, trueScene);
	const r = Math.max(1e-12, readable);
	return Math.exp(Math.log(t) * (1 - bodySize) + Math.log(r) * bodySize);
};
const legacyBodyRadius = (km: number) => 0.14 + 0.1 * Math.max(0, Math.log10(km / 1000));
// S2b, THE ONE DELIBERATE DIVERGENCE from P1's byte-for-byte extraction. The bodies' floor was
// 1e-7 scene units and the constructs' 1e-10 - a thousandfold apart - so at true scale a 10 km
// moonlet rendered 2.0e-7 while a physically LARGER 22 km station rendered 5.9e-8, an ordering
// violation (R9) no dial setting could fix. /scale-reference found it on its first render. Both now
// use NUMERICAL_FLOOR. Everything else in this column still pins the law unchanged.
const legacyBodyRadiusScene = (km: number, systemLevel: boolean, bodySize: number, rMax: number) => {
	const readable = systemLevel ? legacyBodyRadius(km) : Math.min(legacyBodyRadius(km), 0.1);
	if (bodySize >= 0.999) return readable;
	const trueScene = (km / AU_KM) * (GRID_RADIUS / rMax);
	return Math.max(NUMERICAL_FLOOR, legacyDialBlend(trueScene, readable, bodySize));
};
const legacyStarRadiusScene = (km: number, bodySize: number, rMax: number) => {
	if (bodySize >= 0.999) return STAR_RADIUS;
	const trueScene = (km / AU_KM) * (GRID_RADIUS / rMax);
	return Math.max(NUMERICAL_FLOOR, legacyDialBlend(trueScene, STAR_RADIUS, bodySize));
};
const legacyShipLenScene = (lengthM: number, bodySize: number, rMax: number) => {
	const readable = Math.min(0.7, Math.max(0.14, 0.16 + 0.1 * (Math.log10(lengthM) - 1)));
	if (bodySize >= 0.999) return readable;
	const trueScene = ((lengthM / 1000) / AU_KM) * (GRID_RADIUS / rMax);
	return Math.max(1e-10, legacyDialBlend(trueScene, readable, bodySize));
};
const legacyMarkerScale = (bodySize: number) => (bodySize >= 0.999 ? 1 : Math.max(0.02, bodySize));

// A sweep wide enough to catch a clamp moving: every dial stop against real object sizes, in
// systems from a tight red dwarf (rMax 0.5 AU) to a wide one (rMax 100 AU).
const DIALS = [0, 0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.98, 0.999, 1];
const RMAXES = [0.5, 5, 30, 100];
const BODY_KM = [1, 100, 1737, 6371, 69911, 696000];      // pebble, small moon, Luna, Earth, Jupiter, Sol
const SHIP_M = [1, 20, 46, 109, 1000, 22000, 940000];     // drone .. Eros .. Ceres Station

describe('scaleLaw is the old scene.ts law, exactly (P1)', () => {
	it('dialBlend matches at every dial stop', () => {
		for (const v of DIALS) for (const t of [1e-12, 1e-9, 1e-5, 0.01, 1, 100]) for (const r of [0.1, 0.5, 1]) {
			expect(dialBlend(t, r, v)).toBe(legacyDialBlend(t, r, v));
		}
	});

	it('body radii match at every dial stop, both system-level and satellite', () => {
		for (const v of DIALS) for (const rMax of RMAXES) for (const km of BODY_KM) for (const sys of [true, false]) {
			expect(bodyRadiusScene(km, sys, { bodySize: v, rMax })).toBe(legacyBodyRadiusScene(km, sys, v, rMax));
		}
	});

	it('star radii match at every dial stop', () => {
		for (const v of DIALS) for (const rMax of RMAXES) for (const km of [70000, 696000, 6960000]) {
			expect(starRadiusScene(km, { bodySize: v, rMax })).toBe(legacyStarRadiusScene(km, v, rMax));
		}
	});

	it('ship lengths match at every dial stop', () => {
		for (const v of DIALS) for (const rMax of RMAXES) for (const m of SHIP_M) {
			expect(shipLengthScene(m, { bodySize: v, rMax })).toBe(legacyShipLenScene(m, v, rMax));
		}
	});

	it('marker scale matches', () => {
		for (const v of DIALS) expect(markerScale(v)).toBe(legacyMarkerScale(v));
	});

	it('readable bands match', () => {
		for (const km of BODY_KM) expect(readableBodyRadius(km)).toBe(legacyBodyRadius(km));
		for (const m of SHIP_M) expect(readableShipLength(m)).toBe(Math.min(0.7, Math.max(0.14, 0.16 + 0.1 * (Math.log10(m) - 1))));
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
// These are SKIPPED because today's law fails them, by design and on purpose: the ship band
// (0.14-0.7) overlaps the body band, so a 46 m frigate out-draws a 100 km moon at the readable end.
// Un-skip in P4; they are the definition of done.
describe.skip('R9 ordering (P4 acceptance - today\'s law fails these)', () => {
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
