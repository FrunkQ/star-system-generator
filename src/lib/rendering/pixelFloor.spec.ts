/**
 * SCREEN-SPACE PIXEL FLOORS — extracted from `holo/scene.ts` so they can be tested and tuned.
 *
 * Two jobs here, and they pull in opposite directions on purpose:
 *   - the BODY clamp must be UNCHANGED by the extraction. It is pinned against the old closure
 *     arithmetic, verbatim, in the same shape P1 used for the scale law: a divergence between the
 *     two columns IS the bug, and it fails here rather than on the owner's screen.
 *   - the CONSTRUCT floor is DELIBERATELY changed (14 px -> a planet's 4.4, 7 px -> a moon's 2.4),
 *     so the old value is asserted as the thing that moved rather than quietly dropped.
 *
 * RUN AGAINST THE OLD FLOORS THIS GOES RED: put `constructFocused: 14, constructIdle: 7` back and
 * the hierarchy tests fail, naming a ship as three times a planet. Checked before this was believed.
 */
import { describe, it, expect } from 'vitest';
import {
	MIN_SPAN_PX, sceneUnitsPerPixel, onScreenPx, flooredSpanScene, floorScale,
	bodyMinSpanPx, bodyMinRadiusPx, constructMinSpanPx
} from './pixelFloor';

// The old closure arithmetic, verbatim, with camera/viewport made arguments.
const legacyPerPx = (fovYDeg: number, viewH: number) => (2 * Math.tan((fovYDeg * Math.PI) / 360)) / Math.max(1, viewH);
const LEGACY_MIN_PX_STAR = 3.2, LEGACY_MIN_PX_BODY = 2.2, LEGACY_MIN_PX_MOON = 1.2; // RADIUS px
const legacyBodyK = (radiusScene: number, isStar: boolean, satellite: boolean, fovYDeg: number, viewH: number, dist: number) => {
	const perPx = legacyPerPx(fovYDeg, viewH);
	const minPx = isStar ? LEGACY_MIN_PX_STAR : satellite ? LEGACY_MIN_PX_MOON : LEGACY_MIN_PX_BODY;
	const pxR = radiusScene / Math.max(1e-9, perPx * dist);
	return pxR < minPx ? minPx / Math.max(1e-9, pxR) : 1;
};

const FOVS = [30, 45, 60, 75];
const VIEWS = [400, 900, 1440, 2160];
const DISTS = [0.5, 5, 40, 400];
const RADII = [1e-10, 1e-7, 1e-4, 0.01, 0.14, 0.5, 3];

describe('the body clamp is BIT-UNCHANGED by the extraction', () => {
	it('matches the old closure at every fov, viewport, distance and radius', () => {
		for (const fov of FOVS) for (const viewH of VIEWS) for (const dist of DISTS) for (const r of RADII) {
			for (const [isStar, sat] of [[true, false], [false, true], [false, false]] as [boolean, boolean][]) {
				const unitsPerPx = sceneUnitsPerPixel(fov, viewH);
				// RADIUS in, radius floor out - the axis the body path measures on.
				const now = floorScale(r, bodyMinRadiusPx(isStar, sat), unitsPerPx, dist);
				expect(now).toBeCloseTo(legacyBodyK(r, isStar, sat, fov, viewH, dist), 12);
			}
		}
	});

	it('the radius view of the table is the old constant, exactly', () => {
		expect(bodyMinRadiusPx(true, false)).toBe(LEGACY_MIN_PX_STAR);
		expect(bodyMinRadiusPx(false, false)).toBe(LEGACY_MIN_PX_BODY);
		expect(bodyMinRadiusPx(false, true)).toBe(LEGACY_MIN_PX_MOON);
	});

	it('sceneUnitsPerPixel is the old expression', () => {
		for (const fov of FOVS) for (const viewH of VIEWS) {
			expect(sceneUnitsPerPixel(fov, viewH)).toBe(legacyPerPx(fov, viewH));
		}
	});
});

describe('the construct floor joins the body hierarchy (owner, 2026-08-27)', () => {
	it('a focused ship floors at a PLANET span, an idle one at a MOON span', () => {
		expect(constructMinSpanPx({ framed: false, inFocus: true })).toBe(MIN_SPAN_PX.planet);
		expect(constructMinSpanPx({ framed: false, inFocus: false })).toBe(MIN_SPAN_PX.moon);
	});

	it('it is no longer several times a planet — which was the complaint', () => {
		// The old floors, on the axis that makes them comparable: 14 px of ship LENGTH against a
		// planet's 4.4 px of DIAMETER.
		expect(14 / MIN_SPAN_PX.planet).toBeGreaterThan(3);      // what it was
		expect(constructMinSpanPx({ framed: false, inFocus: true }) / MIN_SPAN_PX.planet).toBe(1); // what it is
	});

	it('a FRAMED ship has no floor at all, and that is policy not an oversight', () => {
		// A screen-size floor pins the hull to a constant number of pixels, so while it is active the
		// camera cannot change the apparent size — the "wrestles the view" fault.
		expect(constructMinSpanPx({ framed: true, inFocus: true })).toBe(0);
		expect(floorScale(1e-9, 0, sceneUnitsPerPixel(60, 900), 10)).toBe(1);
	});

	it('the whole table is ordered star > planet = focused ship > moon = idle ship', () => {
		expect(MIN_SPAN_PX.star).toBeGreaterThan(MIN_SPAN_PX.planet);
		expect(MIN_SPAN_PX.planet).toBeGreaterThan(MIN_SPAN_PX.moon);
		expect(MIN_SPAN_PX.constructFocused).toBe(MIN_SPAN_PX.planet);
		expect(MIN_SPAN_PX.constructIdle).toBe(MIN_SPAN_PX.moon);
	});
});

describe('the floor only ever enlarges, and only when it has to', () => {
	it('leaves an honest render alone once it can be resolved', () => {
		const unitsPerPx = sceneUnitsPerPixel(60, 900);
		// A body drawn at twice its floor is untouched.
		const span = flooredSpanScene(MIN_SPAN_PX.planet * 2, unitsPerPx, 10);
		expect(floorScale(span, MIN_SPAN_PX.planet, unitsPerPx, 10)).toBe(1);
	});

	it('lifts a sub-floor thing to EXACTLY its floor, never past it', () => {
		const unitsPerPx = sceneUnitsPerPixel(60, 900);
		for (const dist of DISTS) for (const span of [1e-6, 1e-4, 1e-3]) {
			const k = floorScale(span, MIN_SPAN_PX.planet, unitsPerPx, dist);
			expect(onScreenPx(span * k, unitsPerPx, dist)).toBeCloseTo(MIN_SPAN_PX.planet, 9);
		}
	});

	it('CAPS the enlargement below 1e-9 px, so the numerical floor is not blown into a disc', () => {
		// Found by extracting it and briefly getting it wrong: something 2e-10 px across would
		// otherwise be scaled by 1.6e10, and a body sitting on NUMERICAL_FLOOR would appear as a
		// visible sphere. The cap is policy, not defensiveness. Pinned so nobody 'tidies' it away.
		const unitsPerPx = sceneUnitsPerPixel(60, 900);
		const k = floorScale(1e-12, MIN_SPAN_PX.planet, unitsPerPx, 400);
		expect(k).toBeCloseTo(MIN_SPAN_PX.planet / 1e-9, 6);
		expect(k).toBeLessThan(MIN_SPAN_PX.planet / onScreenPx(1e-12, unitsPerPx, 400));
	});

	it('never returns a scale below 1, and survives a zero span', () => {
		const unitsPerPx = sceneUnitsPerPixel(60, 900);
		for (const dist of DISTS) expect(floorScale(1e6, MIN_SPAN_PX.planet, unitsPerPx, dist)).toBe(1);
		expect(floorScale(0, MIN_SPAN_PX.planet, unitsPerPx, 10)).toBe(1);
	});
});
