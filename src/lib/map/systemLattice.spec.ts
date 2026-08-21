// THE SYSTEM LATTICE IS THE SAME LATTICE, PUT THROUGH A NONLINEAR MAP.
//
// Square and hex at system scale come from `latticeFor` — the generator the starmap and the GM's snap
// grid already use — so there is one lattice in the codebase and a cell means the same thing wherever
// it is drawn. The one genuine difference is that the system view's AU-to-scene map is NOT LINEAR:
// `compressRadius` blends a linear map with a log one, and the shipped default sits at 0.8.
//
// So the lattice is generated in AU and every vertex is put through that same map. A cell then spans
// its stated AU against the orrery drawn inside it, which is the only reading of "1 AU hexes" that is
// any use at a table — and it is why the cells visibly compress outward. That is the map being
// honest, not the grid being wrong.
import { describe, it, expect } from 'vitest';
import { latticeFor } from './latticeGeometry';
import { compressRadius, type RadialMap } from '$lib/holo/floatingOrigin';
import { SYSTEM_OVERLAY_OPTIONS, MAP_OVERLAY_OPTIONS, isLattice, isHexFamily } from './mapOverlay';

const R_MAX = 30, GRID_RADIUS = 12;
const mapAt = (compression: number): RadialMap => ({ gridRadius: GRID_RADIUS, rMax: R_MAX, r0Au: 0.1, compression });

/** The scene's own per-vertex mapping: scale the direction, keep the bearing. */
function toScene(x: number, y: number, m: RadialMap): [number, number] {
	const d = Math.hypot(x, y);
	if (!(d > 0)) return [0, 0];
	const k = compressRadius(d, m) / d;
	return [x * k, y * k];
}

describe('one generator for both stages', () => {
	it('offers every overlay at system scale, hexes included', () => {
		expect(SYSTEM_OVERLAY_OPTIONS).toHaveLength(MAP_OVERLAY_OPTIONS.length);
		expect(SYSTEM_OVERLAY_OPTIONS.some((o) => isHexFamily(o.value))).toBe(true);
	});

	it('treats square and every hex variant as a lattice, so one code path serves all of them', () => {
		for (const v of ['square', 'hex', 'subsector-hex', 'traveller-hex'] as const) expect(isLattice(v)).toBe(true);
		for (const v of ['off', 'plain', 'scaled'] as const) expect(isLattice(v)).toBe(false);
	});

	it('generates hexes at a given cell, which is what the fold used to make impossible here', () => {
		const hex = latticeFor('hex', { cell: 1, originX: 0, originY: 0, half: 10, clipRadius: 10 });
		expect(hex.length).toBeGreaterThan(0);
	});
});

describe('the lattice is generated in AU and then compressed', () => {
	it('puts a vertex exactly where the radial map says that AU distance goes', () => {
		const m = mapAt(0.8);
		for (const au of [0.25, 1, 5, 12]) {
			const [x, y] = toScene(au, 0, m);
			expect(Math.hypot(x, y)).toBeCloseTo(compressRadius(au, m));
		}
	});

	it('keeps the bearing — the map is radial, so a direction is never bent', () => {
		const m = mapAt(0.8);
		const [x, y] = toScene(3, 4, m);
		expect(Math.atan2(y, x)).toBeCloseTo(Math.atan2(4, 3));
	});

	it('agrees with the orrery: a body at N AU lands on the grid line for N AU', () => {
		const m = mapAt(0.8);
		const cell = 1;
		const gridLineAt3 = compressRadius(3 * cell, m);
		const bodyAt3Au = compressRadius(3, m);
		expect(gridLineAt3).toBeCloseTo(bodyAt3Au);
	});

	it('is perfectly regular when compression is 0 — the linear, honest-distance regime', () => {
		const m = mapAt(0);
		const widths = [1, 2, 3, 4, 5].map((k) => compressRadius(k, m) - compressRadius(k - 1, m));
		for (const w of widths) expect(w).toBeCloseTo(widths[0]);
	});

	it('compresses outward when compression is on — visible, and the map telling the truth', () => {
		const m = mapAt(0.8);
		const inner = compressRadius(1, m) - compressRadius(0, m);
		const outer = compressRadius(20, m) - compressRadius(19, m);
		expect(outer).toBeLessThan(inner);
	});

	it('the disc in AU is rMax, because rMax is what maps to the rim', () => {
		for (const c of [0, 0.5, 0.8, 1]) expect(compressRadius(R_MAX, mapAt(c))).toBeCloseTo(GRID_RADIUS);
	});

	it('maps the centre to the centre rather than to NaN', () => {
		expect(toScene(0, 0, mapAt(0.8))).toEqual([0, 0]);
	});
});

describe('segmentation', () => {
	// Three independent reasons, any one sufficient: a per-vertex fade judges a full-width run by its
	// far ends (A37), a curtain is built per edge, and a straight edge drawn across a NONLINEAR map
	// cuts the corner.
	it('splits long runs so a straight edge cannot cut across the compression', () => {
		const opts = { cell: 5, originX: 0, originY: 0, half: 30, clipRadius: 30 };
		const whole = latticeFor('square', opts);
		const split = latticeFor('square', { ...opts, maxSegment: 1 });
		expect(split.length).toBeGreaterThan(whole.length);
		for (const [x1, y1, x2, y2] of split) expect(Math.hypot(x2 - x1, y2 - y1)).toBeLessThanOrEqual(1 + 1e-9);
	});

	it('leaves hex edges alone — they are already one cell long', () => {
		const opts = { cell: 5, originX: 0, originY: 0, half: 30, clipRadius: 30 };
		expect(latticeFor('hex', { ...opts, maxSegment: 5 }).length).toBe(latticeFor('hex', opts).length);
	});

	it('caps the line count, so a quarter-AU cell on a wide system cannot spawn unbounded geometry', () => {
		const tight = latticeFor('square', { cell: 0.25, originX: 0, originY: 0, half: 100, clipRadius: 100, maxLines: 400 });
		expect(tight.length).toBeGreaterThan(0);
		expect(tight.length).toBeLessThan(400 * 400);
	});
});
