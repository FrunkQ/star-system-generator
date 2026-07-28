// src/lib/input/pointerMap.ts
// Map a viewport (client) pointer coordinate into an element's LOCAL pixel space, inverting any
// CSS transforms applied to the element or its ancestors.
//
// Why this exists (WS4 — "clicks don't track the CRT roll/skew"): the player views wrap the
// interactive 2D orrery in a CSS-transformed ancestor — a `skewX(...)` on the companion CRT skin
// (catalogue/+page.svelte) and a `scale(...)` on the projector. The rendered pixels shear/scale,
// but the old hit-test read `clientX - rect.getBoundingClientRect().left`, which cannot invert a
// shear (getBoundingClientRect returns the axis-aligned bounding box, not the sheared quad). The
// result: the pick lands at a different world point than the pixel the user aimed at — worst near
// the top/bottom edges, which reads as "I clicked left, it selected something to the right".
//
// This recovers the exact affine map local->client from (a) the composed LINEAR part of the
// ancestor transforms (skew/scale/rotate, read via getComputedStyle) and (b) the element's
// transformed AABB for the translation — so transform-origin and element offsets cancel out and
// never need to be walked. Inverting it gives the correct local coordinate.
//
// SWAP-BACK SEAM: `pointerWarpInversion` gates the whole thing. If the inversion ever misbehaves,
// set it to false (setPointerWarpInversion(false)) and every gesture reverts to the old rect-based
// mapping — no code surgery. The next fallback (moving the warp off the interactive layer) is a
// separate, deliberate change.

let pointerWarpInversion = true;

/** Toggle the CRT-warp pointer inversion (WS4). false = revert to the plain rect-relative mapping. */
export function setPointerWarpInversion(on: boolean): void {
	pointerWarpInversion = on;
}
export function getPointerWarpInversion(): boolean {
	return pointerWarpInversion;
}

/** 2x2 linear part of the composed local->client transform. */
export interface Linear2D {
	a: number;
	b: number;
	c: number;
	d: number;
}

/**
 * Pure core: given the composed LINEAR map (a,b,c,d) from el-local to client space, the element's
 * transformed AABB top-left (rectLeft/rectTop) and its untransformed size (W,H), invert a client
 * point back to local coordinates. Returns null when the linear part is ~identity (no warp — caller
 * uses the fast rect path) or non-invertible. Exported for unit testing.
 *
 * The translation is recovered from the AABB: the linear part maps the four local box corners, and
 * rect.left/top equals min(image.x/y) + translation. So transform-origin and element offsets cancel.
 */
export function localFromClient(
	lin: Linear2D,
	rectLeft: number,
	rectTop: number,
	W: number,
	H: number,
	clientX: number,
	clientY: number
): { x: number; y: number } | null {
	const { a, b, c, d } = lin;
	if (Math.abs(a - 1) < 1e-6 && Math.abs(d - 1) < 1e-6 && Math.abs(b) < 1e-6 && Math.abs(c) < 1e-6)
		return null; // ~identity: no meaningful warp
	const det = a * d - b * c;
	if (Math.abs(det) < 1e-9) return null;
	const tx = rectLeft - Math.min(0, a * W, c * H, a * W + c * H);
	const ty = rectTop - Math.min(0, b * W, d * H, b * W + d * H);
	const ix = clientX - tx;
	const iy = clientY - ty;
	const x = (d * ix - c * iy) / det;
	const y = (-b * ix + a * iy) / det;
	if (!isFinite(x) || !isFinite(y)) return null;
	return { x, y };
}

/**
 * Convert a client point to `el`'s local pixel coordinates (0..offsetWidth, 0..offsetHeight),
 * undoing ancestor CSS transforms. Falls back to plain `clientX - rect.left` when inversion is
 * off, the transform chain is trivial, or anything is non-invertible / unavailable.
 */
export function viewportToLocal(
	el: HTMLElement,
	clientX: number,
	clientY: number
): { x: number; y: number } {
	const rect = el.getBoundingClientRect();
	const fallback = { x: clientX - rect.left, y: clientY - rect.top };
	if (!pointerWarpInversion || typeof DOMMatrix === 'undefined') return fallback;
	try {
		// Composed LINEAR transform from el-local space to client space. Walk el -> ancestors and
		// left-multiply each transform (outer transforms apply last). getComputedStyle().transform is
		// origin-independent, so this is purely the linear (a,b,c,d) part for skew/scale/rotate.
		let m = new DOMMatrix();
		for (let n: HTMLElement | null = el; n; n = n.parentElement) {
			const tr = getComputedStyle(n).transform;
			if (tr && tr !== 'none') m = new DOMMatrix(tr).multiply(m);
		}
		const local = localFromClient(m, rect.left, rect.top, el.offsetWidth, el.offsetHeight, clientX, clientY);
		return local ?? fallback;
	} catch {
		return fallback;
	}
}
