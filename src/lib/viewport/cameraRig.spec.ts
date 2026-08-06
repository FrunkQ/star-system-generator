// P2: the base+offset motion model. These are the REGRESSION tests for the six framing faults of
// 2026-08-05 (section 1 of docs/dev/camera-framing-redesign.md) - each one written so it would have
// caught the original bug, expressed against the model that replaces it.
import { describe, it, expect } from 'vitest';
import {
	IDENTITY_OFFSET, composeShot, deriveOffset, clampZoom, blendToward, shotReached,
	quatFromUnitVectors, applyQuat, isIdentity, type Shot
} from './cameraRig';
import type { Vec3 } from './shotSolver';

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const shot = (target: Vec3, heading: Vec3, d: number): Shot => ({ target, heading, dist: d });

describe('quaternion helpers', () => {
	it('takes one unit vector to another, including the opposed case', () => {
		const pairs: Array<[Vec3, Vec3]> = [
			[v(0, 1, 0), v(1, 0, 0)],
			[v(0, 1, 0), v(0, -1, 0)],   // opposed - the degenerate one
			[v(0, 0, 1), v(0, 0, 1)],    // identical
			[v(0.6, 0.8, 0), v(0, 0, 1)]
		];
		for (const [a, b] of pairs) {
			const got = applyQuat(a, quatFromUnitVectors(a, b));
			expect(dist(got, b)).toBeLessThan(1e-9);
		}
	});
});

describe('compose and derive are inverses - the user\'s view is read back exactly', () => {
	it('round-trips an arbitrary manipulation', () => {
		const base = shot(v(1, 2, 3), v(0, 1, 0), 10);
		for (const cam of [v(1, 12, 3), v(6, 4, 3), v(-4, 2.5, 9), v(1, 2, 3.001)]) {
			const off = deriveOffset(base, cam);
			const back = composeShot(base, off);
			expect(dist(back.camera, cam)).toBeLessThan(1e-9);
		}
	});

	it('an untouched camera derives the identity offset', () => {
		const base = shot(v(0, 0, 0), v(0, 1, 0), 5);
		const off = deriveOffset(base, composeShot(base, IDENTITY_OFFSET).camera);
		expect(isIdentity(off)).toBe(true);
	});
});

// FAULT 3 REGRESSION. The ease flew through absolute space while the subject moved, so a station in
// low orbit outran it: it closed to 1.3e-4 and found the target 6.5e-4 away on the next frame,
// forever. Base+offset cannot do that - the base is recomputed FROM the subject, so the shot is
// carried by definition.
describe('a moving subject cannot outrun the shot (fault 3)', () => {
	it('holds the user\'s viewpoint exactly while the subject flies', () => {
		let base = shot(v(0, 0, 0), v(0, 1, 0), 1e-9);
		// The user has swung round and zoomed out a bit.
		const chosen = deriveOffset(base, v(3e-9, 1e-9, 0));
		const relStart = composeShot(base, chosen);
		const offsetStart = { x: relStart.camera.x - base.target.x, y: relStart.camera.y - base.target.y, z: relStart.camera.z - base.target.z };

		// Now the subject moves a MILLION times its own framing distance, in one frame.
		for (let i = 1; i <= 100; i++) {
			base = shot(v(i * 1e-3, i * 5e-4, 0), v(0, 1, 0), 1e-9);
			const now = composeShot(base, chosen);
			const rel = { x: now.camera.x - base.target.x, y: now.camera.y - base.target.y, z: now.camera.z - base.target.z };
			// The camera's position RELATIVE to the subject is unchanged: it travelled with it.
			//
			// Measured against the SHOT'S OWN SCALE, not as an absolute epsilon. Composing a 1e-9
			// offset onto a target that has walked out to 0.1 loses absolute precision to
			// cancellation - float64 carries ~1e-17 absolute at that magnitude, so demanding
			// 1e-18 asks for more than the format has. That cancellation is exactly what the
			// scene's floating origin exists to prevent; here it is harmless because the ratio is
			// what the eye sees, and a relative error of 1e-6 of the framing distance is invisible.
			expect(dist(rel, offsetStart)).toBeLessThan(relStart.dist * 1e-6);
			expect(Math.abs(now.dist / relStart.dist - 1)).toBeLessThan(1e-9);
		}
	});
});

// FAULT 6 REGRESSION. setSystem wiped focus on every snapshot, and a ship in transit rewrites the
// snapshot ~2x/second, so the shot restarted continuously. Here a rebuild is just a new base.
describe('a scene rebuild does not disturb the view (fault 6)', () => {
	it('the offset survives an arbitrary number of base replacements', () => {
		const chosen = deriveOffset(shot(v(0, 0, 0), v(0, 1, 0), 2), v(1, 1, 0));
		let last: Vec3 | null = null;
		for (let i = 0; i < 50; i++) {
			const base = shot(v(0, 0, 0), v(0, 1, 0), 2); // "rebuilt" identically
			const c = composeShot(base, chosen).camera;
			if (last) expect(dist(c, last)).toBeLessThan(1e-12);
			last = c;
		}
	});
});

// FAULT 2 + 4 REGRESSION. The ease was linear in distance across a scene spanning ten orders of
// magnitude, so it never arrived; and it measured against a sliding target, so the two fought.
describe('the cosmetic blend converges at ANY scale (faults 2 and 4)', () => {
	it('reaches the shot in a bounded number of frames from 1e10x out', () => {
		for (const [fromD, toD] of [[20, 1e-9], [1e-9, 20], [1, 1], [1e-12, 1e-3]]) {
			let cur = { target: v(0, 0, 0), camera: v(0, fromD, 0) };
			const dest = { target: v(0, 0, 0), camera: v(0, toD, 0) };
			let frames = 0;
			while (!shotReached(cur, dest) && frames < 200) { cur = blendToward(cur, dest, 0.2); frames++; }
			expect(frames).toBeLessThan(120);
			expect(shotReached(cur, dest)).toBe(true);
		}
	});

	it('is interruptible: dropped frames and restarts still converge on the destination', () => {
		let cur = { target: v(0, 0, 0), camera: v(0, 20, 0) };
		const dest = { target: v(5, 0, 0), camera: v(5, 1e-8, 0) };
		for (let i = 0; i < 200; i++) {
			// Simulate a hitch every few frames: no progress at all.
			if (i % 3 === 0) continue;
			cur = blendToward(cur, dest, 0.2);
		}
		expect(shotReached(cur, dest)).toBe(true);
	});

	it('never overshoots below the destination distance', () => {
		let cur = { target: v(0, 0, 0), camera: v(0, 10, 0) };
		const dest = { target: v(0, 0, 0), camera: v(0, 1e-6, 0) };
		for (let i = 0; i < 100; i++) {
			cur = blendToward(cur, dest, 0.3);
			expect(Math.hypot(cur.camera.x, cur.camera.y, cur.camera.z)).toBeGreaterThanOrEqual(1e-6 * 0.999999);
		}
	});
});

// FAULT 5 REGRESSION. The follow policy's floor sat a thousand times further out than a true-scale
// hull's own framing distance and hauled the camera back. Zoom is now a ratio clamped by the
// controls' OWN limits, so a floor cannot be expressed independently of the subject.
describe('zoom is a ratio, clamped only by the controls (fault 5)', () => {
	it('lets the camera reach a true-scale hull', () => {
		const baseDist = 1e-9;
		const clamped = clampZoom({ rot: IDENTITY_OFFSET.rot, zoom: 0.5 }, baseDist, 1e-10, 100);
		expect(clamped.zoom).toBe(0.5); // 5e-10 is above the 1e-10 floor: allowed
		expect(baseDist * clamped.zoom).toBeGreaterThan(1e-10);
	});

	it('still refuses to go inside the controls\' minimum', () => {
		const baseDist = 1e-9;
		const clamped = clampZoom({ rot: IDENTITY_OFFSET.rot, zoom: 1e-6 }, baseDist, 1e-10, 100);
		expect(baseDist * clamped.zoom).toBeCloseTo(1e-10, 20);
	});
});

// THE FRAME LOOP. Every test above exercises one function; this one runs the actual per-frame
// SEQUENCE the scene runs - derive, compose, blend - which is where the real bug was. Reported as
// "in the player view it zooms OUT when I select a body, not IN... it just looks like the zoom is
// inverted", and it survived a green unit suite because compose/derive/blend are each correct in
// isolation and only fight each other across frames.
describe('the frame loop: a re-frame must actually arrive (regression)', () => {
	/** One frame of the scene's loop, in the same order scene.ts runs it. */
	function frame(state: { cam: Vec3; target: Vec3; offset: any; lastBase: Shot | null; reframing: boolean; reframePending: boolean }, base: Shot) {
		// 1. read the user back out - but NOT while the system itself is moving the camera
		if (state.lastBase && !state.reframePending && !state.reframing) {
			state.offset = deriveOffset(state.lastBase, state.cam, state.lastBase.target);
		}
		if (state.reframePending) { state.offset = { ...IDENTITY_OFFSET }; state.reframePending = false; }
		// 2. compose
		const want = composeShot(base, state.offset);
		// 3. move
		if (state.reframing) {
			const from = { target: state.target, camera: state.cam };
			const to = { target: want.target, camera: want.camera };
			if (shotReached(from, to)) state.reframing = false;
			else {
				const step = blendToward(from, to, 0.18);
				state.target = step.target; state.cam = step.camera; state.lastBase = base; return;
			}
		}
		state.target = want.target; state.cam = want.camera; state.lastBase = base;
	}

	it('flies all the way in when a body is selected from a wide shot', () => {
		const base = shot(v(0, 0, 0), v(0, 1, 0), 0.001); // a close-up of a small world
		// Camera starts on the whole-system shot, 20 units out, with nothing focused.
		const state = { cam: v(0, 20, 0), target: v(0, 0, 0), offset: { ...IDENTITY_OFFSET }, lastBase: null as Shot | null, reframing: true, reframePending: true };
		for (let i = 0; i < 200 && state.reframing; i++) frame(state, base);

		const finalDist = Math.hypot(state.cam.x, state.cam.y, state.cam.z);
		// It must ARRIVE at the framed distance - not stall a few percent from where it started,
		// which is what "it zooms out instead of in" actually was: the blend stepped 18% inward,
		// the next frame's deriveOffset read that intermediate position as "the user is zoomed
		// out", re-applied it as the offset, and the shot collapsed onto where the camera already
		// was. One step of blend, then done, for every selection.
		expect(finalDist).toBeCloseTo(0.001, 6);
		expect(state.reframing).toBe(false);
	});

	it('hands control back afterwards, and then holds the user\'s zoom', () => {
		const base = shot(v(0, 0, 0), v(0, 1, 0), 0.001);
		const state = { cam: v(0, 20, 0), target: v(0, 0, 0), offset: { ...IDENTITY_OFFSET }, lastBase: null as Shot | null, reframing: true, reframePending: true };
		for (let i = 0; i < 200 && state.reframing; i++) frame(state, base);
		// The user now wheels out to 3x the framed distance.
		state.cam = v(0, 0.003, 0);
		for (let i = 0; i < 5; i++) frame(state, base);
		expect(Math.hypot(state.cam.x, state.cam.y, state.cam.z)).toBeCloseTo(0.003, 9);
		expect(state.offset.zoom).toBeCloseTo(3, 6);
	});
});

describe('R5: only the user writes the offset', () => {
	it('a re-frame is the one way the system takes the camera back', () => {
		const base = shot(v(0, 0, 0), v(0, 1, 0), 4);
		const userView = deriveOffset(base, v(4, 0, 0));
		expect(isIdentity(userView)).toBe(false);
		// An explicit re-frame resets to identity - and nothing else in the model can do that.
		const reframed = { ...IDENTITY_OFFSET };
		expect(composeShot(base, reframed).camera).toEqual({ x: 0, y: 4, z: 0 });
	});
});
