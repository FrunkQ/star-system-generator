import { describe, it, expect } from 'vitest';
import { localFromClient, getPointerWarpInversion, setPointerWarpInversion } from './pointerMap';

// localFromClient inverts the composed local->client affine map. We construct known forward maps,
// push a local point forward to client space, then assert the inverse recovers the local point.

const forward = (
	lin: { a: number; b: number; c: number; d: number },
	tx: number,
	ty: number,
	lx: number,
	ly: number
) => ({ x: lin.a * lx + lin.c * ly + tx, y: lin.b * lx + lin.d * ly + ty });

// tx/ty as the AABB min-based translation the helper reconstructs, for a given linear part + rect.
const aabbTranslation = (
	lin: { a: number; b: number; c: number; d: number },
	rectLeft: number,
	rectTop: number,
	W: number,
	H: number
) => ({
	tx: rectLeft - Math.min(0, lin.a * W, lin.c * H, lin.a * W + lin.c * H),
	ty: rectTop - Math.min(0, lin.b * W, lin.d * H, lin.b * W + lin.d * H)
});

describe('pointer warp inversion (localFromClient)', () => {
	it('returns null for a near-identity linear part (no warp)', () => {
		expect(localFromClient({ a: 1, b: 0, c: 0, d: 1 }, 10, 20, 100, 100, 55, 66)).toBeNull();
	});

	it('returns null for a degenerate (non-invertible) transform', () => {
		expect(localFromClient({ a: 0, b: 0, c: 0, d: 0 }, 0, 0, 100, 100, 5, 5)).toBeNull();
	});

	it('inverts a uniform scale (projector) exactly', () => {
		const lin = { a: 0.5, b: 0, c: 0, d: 0.5 };
		const W = 100, H = 100, rectLeft = 10, rectTop = 20;
		const { tx, ty } = aabbTranslation(lin, rectLeft, rectTop, W, H);
		const client = forward(lin, tx, ty, 40, 60);
		const got = localFromClient(lin, rectLeft, rectTop, W, H, client.x, client.y)!;
		expect(got.x).toBeCloseTo(40, 6);
		expect(got.y).toBeCloseTo(60, 6);
	});

	it('inverts a horizontal skew (CRT skewX) exactly — the shear the old code missed', () => {
		const lin = { a: 1, b: 0, c: 0.5, d: 1 }; // skewX, tan = 0.5
		const W = 200, H = 100, rectLeft = 0, rectTop = 0;
		const { tx, ty } = aabbTranslation(lin, rectLeft, rectTop, W, H);
		const client = forward(lin, tx, ty, 100, 80);
		// Old buggy mapping (clientX - rect.left) would give x = 140, off by 40px.
		expect(client.x - rectLeft).toBeCloseTo(140, 6);
		const got = localFromClient(lin, rectLeft, rectTop, W, H, client.x, client.y)!;
		expect(got.x).toBeCloseTo(100, 6);
		expect(got.y).toBeCloseTo(80, 6);
	});

	it('inverts a combined skew + scale', () => {
		const lin = { a: 0.9, b: 0, c: -0.3, d: 0.9 };
		const W = 320, H = 240, rectLeft = 12, rectTop = 34;
		const { tx, ty } = aabbTranslation(lin, rectLeft, rectTop, W, H);
		for (const [lx, ly] of [[0, 0], [W, 0], [0, H], [W, H], [123, 77]] as const) {
			const client = forward(lin, tx, ty, lx, ly);
			const got = localFromClient(lin, rectLeft, rectTop, W, H, client.x, client.y)!;
			expect(got.x).toBeCloseTo(lx, 5);
			expect(got.y).toBeCloseTo(ly, 5);
		}
	});
});

describe('pointer warp inversion flag (swap-back seam)', () => {
	it('defaults on and toggles', () => {
		expect(getPointerWarpInversion()).toBe(true);
		setPointerWarpInversion(false);
		expect(getPointerWarpInversion()).toBe(false);
		setPointerWarpInversion(true); // restore
		expect(getPointerWarpInversion()).toBe(true);
	});
});
