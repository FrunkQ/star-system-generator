/**
 * BASE + OFFSET - the camera motion model (phase P2 of docs/dev/camera-framing-redesign.md).
 *
 * The camera is exactly two things:
 *   BASE   - the shot the SYSTEM wants, recomputed every frame from live positions by the shot
 *            solver. Target, heading, distance.
 *   OFFSET - what the USER has done to it: turned it, zoomed it. Starts at identity, and ONLY user
 *            input writes it.
 * Rendered camera = base composed with offset.
 *
 * WHY THIS SHAPE. Every framing fault of 2026-08-05 was a mechanism moving the camera against the
 * user, or failing to move it with a subject (see section 1 of the design). Both disappear here by
 * construction rather than by rule:
 *   - The subject moving, the snapshot rebuilding, the origin rebasing - all change the BASE, and
 *     the offset rides on top untouched. So a followed ship keeps the viewpoint the user chose,
 *     at any speed, without a "carry the shot along" patch (M7) and without pausing the clock.
 *   - Nothing but user input writes the offset, so "the user has the view" is a STATE, not a flag
 *     several writers must remember to honour (`userZoomOverride`, M6). A flag nobody needs to
 *     remember cannot be forgotten.
 *   - An explicit re-frame resets the offset to identity. That is the ONLY way the system takes the
 *     camera back.
 *
 * There is no arrival counter and no easing here. Any transition is COSMETIC (see `blendToward`)
 * and cannot change the destination: interrupt it, rebuild the scene, drop a frame, and the next
 * frame still renders at base-composed-with-offset. That is what kills faults 2, 3, 4 and 6.
 *
 * THREE-free plain maths so it runs in a unit test without a renderer.
 */

import type { Vec3 } from './shotSolver';

export interface Quat { x: number; y: number; z: number; w: number }

/** The shot the system wants. `heading` is the unit offset from target towards the camera. */
export interface Shot {
	target: Vec3;
	heading: Vec3;
	dist: number;
}

/** What the user has done to it. */
export interface ViewOffset {
	/** Rotation taking the base heading to the user's chosen heading. */
	rot: Quat;
	/** Distance MULTIPLIER (R3: zoom is a ratio, never an absolute). 1 = the framed distance. */
	zoom: number;
}

export const IDENTITY_OFFSET: ViewOffset = { rot: { x: 0, y: 0, z: 0, w: 1 }, zoom: 1 };

export function isIdentity(o: ViewOffset, eps = 1e-6): boolean {
	return Math.abs(o.zoom - 1) < eps && Math.abs(o.rot.w) > 1 - eps;
}

// --- small vector/quaternion helpers (kept local so this file has no dependencies) --------------

const len = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (v: Vec3, k: number): Vec3 => ({ x: v.x * k, y: v.y * k, z: v.z * k });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
	x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x
});
function unit(v: Vec3): Vec3 {
	const L = len(v);
	return L > 1e-12 ? scale(v, 1 / L) : { x: 0, y: 1, z: 0 };
}

/** The rotation taking unit vector `from` to unit vector `to`. */
export function quatFromUnitVectors(from: Vec3, to: Vec3): Quat {
	const d = dot(from, to);
	if (d > 1 - 1e-12) return { x: 0, y: 0, z: 0, w: 1 }; // already aligned
	if (d < -1 + 1e-12) {
		// Opposed: any perpendicular axis will do; pick the most stable one.
		const axis = Math.abs(from.x) > Math.abs(from.z)
			? unit({ x: -from.y, y: from.x, z: 0 })
			: unit({ x: 0, y: -from.z, z: from.y });
		return { x: axis.x, y: axis.y, z: axis.z, w: 0 };
	}
	const c = cross(from, to);
	const q: Quat = { x: c.x, y: c.y, z: c.z, w: 1 + d };
	const L = Math.hypot(q.x, q.y, q.z, q.w);
	return { x: q.x / L, y: q.y / L, z: q.z / L, w: q.w / L };
}

/** Rotate a vector by a quaternion. */
export function applyQuat(v: Vec3, q: Quat): Vec3 {
	const ix = q.w * v.x + q.y * v.z - q.z * v.y;
	const iy = q.w * v.y + q.z * v.x - q.x * v.z;
	const iz = q.w * v.z + q.x * v.y - q.y * v.x;
	const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
	return {
		x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
		y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
		z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x
	};
}

// --- the model itself ---------------------------------------------------------------------------

/** Where the camera actually goes: the base shot with the user's offset applied. */
export function composeShot(base: Shot, offset: ViewOffset): { target: Vec3; camera: Vec3; dist: number } {
	const heading = applyQuat(base.heading, offset.rot);
	const dist = base.dist * offset.zoom;
	return { target: base.target, camera: add(base.target, scale(heading, dist)), dist };
}

/**
 * Read the user's intent back out: given where the camera actually IS and the base it was composed
 * from, what offset does that represent? Called once a frame BEFORE the base is recomputed, so
 * whatever the user did with the mouse becomes the offset that then rides the new base.
 *
 * This is the whole trick. The camera is not "owned" by either side: the system proposes a base,
 * the user's manipulation is measured relative to it, and the two are recombined every frame. No
 * arbitration, no flags, no priority rules.
 */
export function deriveOffset(base: Shot, actualCamera: Vec3, actualTarget?: Vec3): ViewOffset {
	const from = actualTarget ?? base.target;
	const v = sub(actualCamera, from);
	const d = len(v);
	if (!(d > 1e-12) || !(base.dist > 1e-12)) return { ...IDENTITY_OFFSET };
	return { rot: quatFromUnitVectors(base.heading, scale(v, 1 / d)), zoom: d / base.dist };
}

/**
 * How fast a wheel notch should zoom, given where the camera is.
 *
 * OrbitControls moves a fixed RATIO per notch (~5% at speed 1). That is the right shape - R3 says
 * everything here works in ratios - but the wrong size when the scene spans ten orders of
 * magnitude: from a true-scale ship close-up (~1e-9) back to system scale is ~400 notches, most of
 * them through featureless black, which a user cannot tell apart from the wheel having stopped
 * working. So the notch size adapts to the gulf: a constant at readable scales, growing with the
 * LOG of how far below scene scale the camera currently is. A pure function of the ratio alone, so
 * it is scale-blind in exactly the way the rest of this module is.
 */
export function wheelZoomSpeed(dist: number, sceneScale: number): number {
	if (!(dist > 0) || !(sceneScale > 0)) return 1;
	// 0.75/decade, capped at 8. Tuned against two constraints that pull opposite ways: at readable
	// scales (within ~2 decades of the scene, where something is always in frame) the notch stays
	// near today's feel, while the DEEP stretch - true-scale ship out to readable, seven decades of
	// nothing - crosses in ~60 notches instead of ~310. The integral of 1/speed over the climb is
	// what the acceptance test counts; push the coefficient up before the cap if it ever needs to
	// be faster, because the cap only governs the last couple of decades.
	return Math.min(8, 1 + 0.75 * Math.max(0, Math.log10(sceneScale / dist)));
}

/** Clamp the user's zoom so they cannot leave the scene's usable range. Ratios throughout (R3). */
export function clampZoom(offset: ViewOffset, baseDist: number, minDistance: number, maxDistance: number): ViewOffset {
	if (!(baseDist > 0)) return offset;
	const lo = minDistance / baseDist;
	const hi = maxDistance / baseDist;
	return { rot: offset.rot, zoom: Math.min(hi, Math.max(lo, offset.zoom)) };
}

/**
 * COSMETIC blend of the rendered camera towards where it belongs. Distance moves GEOMETRICALLY
 * (RENDER-S10: this scene spans ten orders of magnitude, so a linear step either crawls or
 * overshoots depending on scale) and direction moves by a bounded turn.
 *
 * It CANNOT change the destination - that is the point. `k` is a per-frame fraction; drop frames,
 * interrupt it, or rebuild the scene mid-blend and the next call still converges on `to`.
 */
export function blendToward(from: { target: Vec3; camera: Vec3 }, to: { target: Vec3; camera: Vec3 }, k: number): { target: Vec3; camera: Vec3 } {
	const t = Math.min(1, Math.max(0, k));
	const target = add(from.target, scale(sub(to.target, from.target), t));

	const fromV = sub(from.camera, from.target);
	const toV = sub(to.camera, to.target);
	const fd = len(fromV);
	const td = len(toV);
	if (!(fd > 1e-12) || !(td > 1e-12)) return { target, camera: to.camera };

	// Direction: a bounded turn towards the target heading. Directions are unit vectors, so a lerp
	// plus renormalise is a good small-angle slerp and never degenerates except when opposed.
	const a = scale(fromV, 1 / fd);
	const b = scale(toV, 1 / td);
	const mixed = unit(add(a, scale(sub(b, a), t)));
	// Distance: log space, so the same PROPORTION closes each frame at any scale.
	const dist = Math.exp(Math.log(fd) * (1 - t) + Math.log(td) * t);
	return { target, camera: add(target, scale(mixed, dist)) };
}

/** Has the rendered camera effectively reached the composed shot? A RATIO test (RENDER-S10). */
export function shotReached(from: { target: Vec3; camera: Vec3 }, to: { target: Vec3; camera: Vec3 }, tol = 0.02): boolean {
	const fd = len(sub(from.camera, from.target));
	const td = len(sub(to.camera, to.target));
	if (!(fd > 1e-12) || !(td > 1e-12)) return true;
	if (Math.abs(Math.log(fd / td)) > tol) return false;
	const a = scale(sub(from.camera, from.target), 1 / fd);
	const b = scale(sub(to.camera, to.target), 1 / td);
	return dot(a, b) > 1 - tol * tol;
}
