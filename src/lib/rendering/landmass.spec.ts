import { describe, it, expect } from 'vitest';
import {
	buildLandField, levelForArea, elevationAt, elevationAtDisc, vegetationBand, maxUsefulCoverage
} from './landmass';

/** Fraction of the SPHERE whose value falls in (low, high], weighted by cos(latitude) — recomputed
 *  here independently of the module's own helper, so the two have to agree for a test to pass. */
function areaBetween(field: ReturnType<typeof buildLandField>, low: number, high: number): number {
	let total = 0, hit = 0;
	for (let gy = 0; gy < field.h; gy++) {
		const lat = Math.PI / 2 - ((gy + 0.5) / field.h) * Math.PI;
		const wt = Math.cos(lat);
		if (wt <= 0) continue;
		for (let gx = 0; gx < field.w; gx++) {
			total += wt;
			const v = field.value[gy * field.w + gx];
			if (v > low && v <= high) hit += wt;
		}
	}
	return total ? hit / total : 0;
}

// A small field keeps the suite quick; every claim below is about proportions, not resolution.
const F = (seed: string, lf: number) => buildLandField(seed, lf, 96, 48);

describe('the land field', () => {
	it('puts the asked-for fraction of the SPHERE above sea level', () => {
		// Thresholded by AREA, not by height — a world's hydrosphere coverage is derived and we are
		// not entitled to hand back whatever area the noise happened to make.
		for (const lf of [0.05, 0.29, 0.5, 0.71, 0.95]) {
			const f = F('earth', lf);
			expect(areaBetween(f, f.seaLevel, 2)).toBeCloseTo(lf, 1);
		}
	});

	it('weights by cos(latitude), so a polar cell does not count as much as a tropical one', () => {
		// The check that the area measure is spherical rather than grid-counting: build a field whose
		// land is deliberately polar and confirm the reported fraction stays small.
		const f = F('polar', 0.3);
		const polarRows = Math.round(f.h * 0.08);
		for (let gy = 0; gy < polarRows; gy++) for (let gx = 0; gx < f.w; gx++) f.value[gy * f.w + gx] = 1;
		// Those rows are 8% of the GRID but a far smaller share of the sphere.
		expect(areaBetween(f, 0.999, 2)).toBeLessThan(0.05);
	});

	it('gives different worlds different continents and the same world the same ones', () => {
		const a = F('body-a', 0.3), b = F('body-b', 0.3), a2 = F('body-a', 0.3);
		expect(Array.from(a.value)).toEqual(Array.from(a2.value));
		expect(Array.from(a.value)).not.toEqual(Array.from(b.value));
	});

	it('is fractal and warped rather than blobby — the coast has detail at more than one scale', () => {
		// The test that this is not the circle-scatter it replaces: count sea/land FLIPS along
		// scanlines. A handful of big blobs flips a few times; a warped fractal coast flips far more.
		const f = F('coastline', 0.5);
		let flips = 0;
		for (let gy = 6; gy < f.h - 6; gy += 3) {
			let prev = f.value[gy * f.w] > f.seaLevel;
			for (let gx = 1; gx < f.w; gx++) {
				const now = f.value[gy * f.w + gx] > f.seaLevel;
				if (now !== prev) flips++;
				prev = now;
			}
		}
		expect(flips).toBeGreaterThan(40);
	});

	it('handles the degenerate ends without inventing a shore', () => {
		const none = F('x', 0);
		expect(areaBetween(none, none.seaLevel, 2)).toBe(0);
		const all = F('x', 1);
		expect(areaBetween(all, all.seaLevel, 2)).toBeCloseTo(1, 2);
	});
});

describe('one geography, two projections', () => {
	const f = F('gaia', 0.35);

	it('wraps in longitude, so there is no seam down the back of the world', () => {
		expect(elevationAt(f, 0, 0.2)).toBeCloseTo(elevationAt(f, 2 * Math.PI, 0.2), 6);
		expect(elevationAt(f, -0.05, 0.2)).toBeCloseTo(elevationAt(f, 2 * Math.PI - 0.05, 0.2), 6);
	});

	it('reads the SAME point through the disc projection as through lat/lon', () => {
		// This is the whole reason the field is spherical: the 2D orrery and the 3D holo must show one
		// world, not two. Disc centre is lon 0, lat 0.
		expect(elevationAtDisc(f, 0.5, 0.5)).toBeCloseTo(elevationAt(f, 0, 0), 6);
		// A point up and right of centre maps to a positive latitude and longitude.
		const off = elevationAtDisc(f, 0.68, 0.32)!;
		const px = 0.36, py = 0.36, pz = Math.sqrt(1 - px * px - py * py);
		expect(off).toBeCloseTo(elevationAt(f, Math.atan2(px, pz), Math.asin(py)), 6);
	});

	it('returns null outside the disc — there is no world off the edge of the world', () => {
		expect(elevationAtDisc(f, 0.02, 0.02)).toBeNull();
		expect(elevationAtDisc(f, 0.5, 0.5)).not.toBeNull();
	});

	it('spins with the body, so a rotating globe is the same geography moving', () => {
		expect(elevationAtDisc(f, 0.5, 0.5, 1.2)).toBeCloseTo(elevationAt(f, 1.2, 0), 6);
	});
});

describe('vegetation grows from the coast inwards', () => {
	const field = F('gaia', 0.3);

	it('covers the asked-for share OF THE LAND', () => {
		for (const cov of [0.2, 0.5, 0.9]) {
			const band = vegetationBand(field, cov);
			expect(areaBetween(field, band.low, band.high) / field.landFraction).toBeCloseTo(cov, 1);
		}
	});

	it('starts AT the shore and moves inland as coverage rises', () => {
		const small = vegetationBand(field, 0.15);
		const large = vegetationBand(field, 0.8);
		// Both begin at the water's edge; the INLAND edge is what moves.
		expect(small.low).toBe(field.seaLevel);
		expect(large.low).toBe(field.seaLevel);
		expect(large.high).toBeGreaterThan(small.high);
	});

	it('spills into the WATER only once the dry land is full', () => {
		expect(vegetationBand(field, 1).usesShallows).toBe(false);
		const spilled = vegetationBand(field, 1.3);
		expect(spilled.usesShallows).toBe(true);
		expect(spilled.low).toBeLessThan(field.seaLevel);
		expect(spilled.achieved).toBeGreaterThan(1);
	});

	it('lets a morphology reach as far past the shore as ITS OWN waterReach allows, and no further', () => {
		// This is how "only technology can take the oceans" is DATA rather than a rule: a shelf-bound
		// plant and a sea-roofing civilisation run the same function with a different number.
		const shelf = vegetationBand(field, 4, 0.12);
		const roofed = vegetationBand(field, 4, 1);
		expect(roofed.low).toBeLessThan(shelf.low);
		expect(areaBetween(field, roofed.low, roofed.high)).toBeGreaterThan(0.9);
		// A morphology barred from the water never leaves the land however far the slider is pushed.
		const dry = vegetationBand(field, 4, 0);
		expect(dry.usesShallows).toBe(false);
		expect(dry.low).toBe(field.seaLevel);
	});

	it('paints nothing at zero, and nothing on a world with no land', () => {
		const none = vegetationBand(field, 0);
		expect(none.high).toBe(none.low);
		expect(vegetationBand(F('ocean', 0), 0.8).achieved).toBe(0);
	});

	it('offers a bigger allowance the LESS land a world has, and more still to something that can roof the sea', () => {
		// A 5%-land world's life is mostly in the water, so its slider must reach further.
		expect(maxUsefulCoverage(0.05)).toBeGreaterThan(maxUsefulCoverage(0.6));
		expect(maxUsefulCoverage(0.6)).toBeGreaterThan(1);
		expect(maxUsefulCoverage(0)).toBe(1);
		// Same world, two morphologies: the shelf-bound one stops early, the ocean-roofing one runs on.
		expect(maxUsefulCoverage(0.3, 1)).toBeGreaterThan(maxUsefulCoverage(0.3, 0.12));
		expect(maxUsefulCoverage(0.3, 0)).toBe(1);
	});
});

describe('levelForArea', () => {
	it('is monotonic: asking for more area returns a lower threshold', () => {
		const f = F('mono', 0.5);
		let prev = Infinity;
		for (const frac of [0.1, 0.3, 0.5, 0.7, 0.9]) {
			const lvl = levelForArea(f, frac);
			expect(lvl).toBeLessThan(prev);
			prev = lvl;
		}
	});
});
