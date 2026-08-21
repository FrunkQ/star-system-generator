import { describe, it, expect } from 'vitest';
import { buildLattice, ringEdges, spokeEdges, type GridEdge } from './gridGeometry';
import { gridFadeWindow, SKIRT_TOP_ALPHA } from './gridFade';

const RGB = { r: 0.4, g: 0.5, b: 0.6 };
const flat: GridEdge[] = [[-1, 0, 1, 0]];

describe('buildLattice', () => {
	it('emits two vertices per edge, positions and colours in step', () => {
		const b = buildLattice(flat, RGB, { alpha: 1 });
		expect(b.linePos).toHaveLength(6);
		expect(b.lineCol).toHaveLength(8);
	});

	it('puts the line on the plane it is given', () => {
		const b = buildLattice(flat, RGB, { y0: 0.25 });
		expect(b.linePos[1]).toBe(0.25);
		expect(b.linePos[4]).toBe(0.25);
	});

	// THE RULE THE SYSTEM MAP BROKE. Three multiplies material colour by vertex colour, so the colour
	// belongs to exactly ONE of them. This emitter writes it into the vertex attribute, which obliges
	// every caller's material to stay white — the starmap's materials always were, the system map's
	// were not, and its grid rendered at the SQUARE of its intended colour.
	it('carries the colour in the vertex attribute, unmodified', () => {
		const b = buildLattice(flat, RGB, { alpha: 1 });
		expect(b.lineCol.slice(0, 3)).toEqual([0.4, 0.5, 0.6]);
		expect(b.lineCol.slice(4, 7)).toEqual([0.4, 0.5, 0.6]);
	});

	it('a material that also carried the colour would square it — the fault, stated as arithmetic', () => {
		const b = buildLattice(flat, RGB, { alpha: 1 });
		const squared = b.lineCol[0] * RGB.r;
		expect(squared).toBeCloseTo(0.16);
		expect(squared / RGB.r).toBeCloseTo(0.4); // 60% of the intensity gone, evenly, on every line
	});

	it('alpha is the line strength times the fade, and nothing else', () => {
		const b = buildLattice(flat, RGB, { alpha: 0.55 });
		expect(b.lineCol[3]).toBeCloseTo(0.55);
	});

	it('fades by distance from the centre when a window is given', () => {
		const w = { from: 0.5, to: 1.5 };
		const b = buildLattice([[0, 0, 1, 0]], RGB, { alpha: 1, fade: w });
		expect(b.lineCol[3]).toBe(1);            // the inner end, inside the window
		expect(b.lineCol[7]).toBeCloseTo(0.5);   // the outer end, halfway through it
	});

	it('does not fade at all when no window is given', () => {
		const b = buildLattice([[0, 0, 99, 0]], RGB, { alpha: 1 });
		expect(b.lineCol[3]).toBe(1);
		expect(b.lineCol[7]).toBe(1);
	});

	// At a gentle dial the window starts BEYOND the grid, so nothing fades. The system map dimmed
	// anyway, which is what proved the fault was not in the fade.
	it('a 10% dial on a radius-12 grid fades nothing — the window starts past the rim', () => {
		const w = gridFadeWindow(0.1, 12);
		expect(w.from).toBeGreaterThan(12);
		const b = buildLattice([[0, 0, 12, 0]], RGB, { alpha: 1, fade: w });
		expect(b.lineCol[3]).toBe(1);
		expect(b.lineCol[7]).toBe(1);
	});

	it('drops an edge whose both ends have faded out rather than drawing it invisible', () => {
		const w = { from: 0.1, to: 0.2 };
		const b = buildLattice([[5, 0, 6, 0]], RGB, { alpha: 1, fade: w });
		expect(b.linePos).toHaveLength(0);
	});

	describe('the depth curtain', () => {
		it('is not emitted at all when the dial is off', () => {
			expect(buildLattice(flat, RGB, { skirt: 0 }).skirtPos).toHaveLength(0);
			expect(buildLattice(flat, RGB, {}).skirtPos).toHaveLength(0);
		});

		it('is two triangles per edge — six vertices', () => {
			const b = buildLattice(flat, RGB, { skirt: 0.5, cell: 1 });
			expect(b.skirtPos).toHaveLength(18);
			expect(b.skirtCol).toHaveLength(24);
		});

		it('hangs BELOW its line and reaches full transparency at the bottom', () => {
			const b = buildLattice(flat, RGB, { skirt: 1, cell: 2, y0: 0 });
			const ys = [];
			for (let i = 1; i < b.skirtPos.length; i += 3) ys.push(b.skirtPos[i]);
			expect(Math.min(...ys)).toBeLessThan(0);
			expect(Math.max(...ys)).toBe(0);
			const bottomAlphas = ys.map((y, i) => (y < 0 ? b.skirtCol[i * 4 + 3] : null)).filter((a) => a !== null);
			expect(bottomAlphas.every((a) => a === 0)).toBe(true);
		});

		it('inherits its line’s fade, so the curtain vanishes exactly where the line does', () => {
			const w = { from: 0.5, to: 1.5 };
			const b = buildLattice([[0, 0, 1, 0]], RGB, { alpha: 1, fade: w, skirt: 1, cell: 1 });
			expect(b.skirtCol[3]).toBeCloseTo(SKIRT_TOP_ALPHA);       // inner end, unfaded
			expect(b.skirtCol[7]).toBeCloseTo(0.5 * SKIRT_TOP_ALPHA); // outer end, half faded
		});

		it('is fainter than its line, so depth reads as shading not as a second grid', () => {
			const b = buildLattice(flat, RGB, { alpha: 1, skirt: 1, cell: 1 });
			expect(b.skirtCol[3]).toBeLessThan(b.lineCol[3]);
		});

		it('yields to a ribbon — the two are alternatives, never both', () => {
			const b = buildLattice(flat, RGB, { skirt: 1, cell: 1, ribbon: 0.2 });
			const ys = [];
			for (let i = 1; i < b.skirtPos.length; i += 3) ys.push(b.skirtPos[i]);
			expect(new Set(ys).size).toBe(1); // a ribbon is flat
		});
	});
});

describe('ringEdges', () => {
	// A LineLoop cannot carry a curtain, which is the whole reason "Grid depth" did nothing to the
	// system map's rings while the starmap — which has always built rings as edges — was correct.
	it('closes the ring: the last edge ends where the first begins', () => {
		const e = ringEdges(3, 8);
		expect(e).toHaveLength(8);
		expect(e[7][2]).toBeCloseTo(e[0][0]);
		expect(e[7][3]).toBeCloseTo(e[0][1]);
	});

	it('every vertex sits on the radius', () => {
		for (const [x1, z1, x2, z2] of ringEdges(4.2, 16)) {
			expect(Math.hypot(x1, z1)).toBeCloseTo(4.2);
			expect(Math.hypot(x2, z2)).toBeCloseTo(4.2);
		}
	});

	it('refuses a degenerate ring rather than emitting one', () => {
		expect(ringEdges(0, 8)).toHaveLength(0);
		expect(ringEdges(-1, 8)).toHaveLength(0);
		expect(ringEdges(3, 2)).toHaveLength(0);
	});

	it('a ring carries a curtain, which is the whole point of it being edges', () => {
		const b = buildLattice(ringEdges(3, 16), RGB, { skirt: 0.5, cell: 1 });
		expect(b.skirtPos.length).toBeGreaterThan(0);
	});
});

describe('spokeEdges', () => {
	it('segments each spoke, so a per-vertex fade has somewhere to land (A37)', () => {
		const e = spokeEdges(4, 12, 6);
		expect(e).toHaveLength(24);
	});

	it('runs from the centre to the rim and no further', () => {
		const e = spokeEdges(3, 12, 4);
		const radii = e.flatMap(([x1, z1, x2, z2]) => [Math.hypot(x1, z1), Math.hypot(x2, z2)]);
		expect(Math.min(...radii)).toBeCloseTo(0);
		expect(Math.max(...radii)).toBeCloseTo(12);
	});

	it('emits no zero-length tail piece from float accumulation', () => {
		for (const [x1, z1, x2, z2] of spokeEdges(24, 12, 24)) {
			expect(Math.hypot(x2 - x1, z2 - z1)).toBeGreaterThan(1e-6);
		}
	});

	it('refuses degenerate input', () => {
		expect(spokeEdges(0, 12)).toHaveLength(0);
		expect(spokeEdges(4, 0)).toHaveLength(0);
	});
});
