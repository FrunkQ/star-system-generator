// P2: the base+offset motion model. These are the REGRESSION tests for the six framing faults of
// 2026-08-05 (section 1 of docs/dev/camera-framing-redesign.md) - each one written so it would have
// caught the original bug, expressed against the model that replaces it.
import { describe, it, expect } from 'vitest';
import {
	IDENTITY_OFFSET, composeShot, deriveOffset, clampZoom, wheelZoomSpeed, blendToward, shotReached,
	quatFromUnitVectors, applyQuat, isIdentity, type Shot, ownsDistance } from './cameraRig';
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
		const clamped = clampZoom({ dAz: 0, dEl: 0, zoom: 0.5 }, baseDist, 1e-10, 100);
		expect(clamped.zoom).toBe(0.5); // 5e-10 is above the 1e-10 floor: allowed
		expect(baseDist * clamped.zoom).toBeGreaterThan(1e-10);
	});

	it('still refuses to go inside the controls\' minimum', () => {
		const baseDist = 1e-9;
		const clamped = clampZoom({ dAz: 0, dEl: 0, zoom: 1e-6 }, baseDist, 1e-10, 100);
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
	function frame(state: { cam: Vec3; target: Vec3; offset: any; lastBase: Shot | null; reframing: boolean; reframePending: boolean }, base: Shot, userActed = true) {
		// 1. read the user back out - but ONLY when they actually acted, and never while the system
		//    itself is moving the camera
		if (state.lastBase && !state.reframePending && !state.reframing && userActed) {
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

	// THE RUNAWAY. The scene uses a floating origin: every so often the whole world is shifted so the
	// camera's target sits near (0,0,0). That shift moves camera AND target together, so the shot is
	// unchanged - but `lastBase.target` is in scene coordinates too, and leaving it in the old frame
	// made deriveOffset read the entire rebase delta as "the user dragged the camera out by that
	// much". Applying that offset moved the camera further out, which made the next rebase delta
	// bigger. Measured on a real system: 1.1, 2.3, 4.6, 9.2, 18.7, 37.8, 76.5 - doubling every frame
	// until it saturated at maxDistance, leaving the view beyond Pluto.
	it('survives a floating-origin rebase without the offset running away', () => {
		const state = { cam: v(0, 0.85, 0), target: v(0, 0, 0), offset: { ...IDENTITY_OFFSET }, lastBase: null as Shot | null, reframing: false, reframePending: false };
		let worldShift = 0;
		for (let i = 0; i < 60; i++) {
			// The subject drifts, and every few frames the origin is rebased under it.
			worldShift += 0.01;
			const base = shot(v(worldShift, 0, 0), v(0, 1, 0), 0.85);
			frame(state, base);
			if (i % 5 === 4) {
				// A rebase: the world (camera, target AND the rig's remembered base) all shift together.
				const d = { x: worldShift, y: 0, z: 0 };
				state.cam = v(state.cam.x - d.x, state.cam.y, state.cam.z);
				state.target = v(state.target.x - d.x, state.target.y, state.target.z);
				if (state.lastBase) state.lastBase = shot(v(state.lastBase.target.x - d.x, state.lastBase.target.y, state.lastBase.target.z), state.lastBase.heading, state.lastBase.dist);
				worldShift = 0;
			}
		}
		// The user never touched anything, so the shot must still be the framed one.
		expect(state.offset.zoom).toBeCloseTo(1, 6);
		expect(dist(state.cam, state.target)).toBeCloseTo(0.85, 6);
	});

	// THE FEEDBACK LOOP, closed for good. Reading the offset back out of the camera only works if
	// the user is the only thing that moves it, and that assumption failed twice - a floating-origin
	// rebase, then another writer. Each time the rig read the nudge as intent, applied it, and fed
	// its own output back in: offsetZoom 1.4, 2.9, 6.0, 12.3, 25.3, 52.2, 106, 217, 442, 902 until it
	// clamped and the view sat beyond Pluto. The rig now reads the camera ONLY on a frame where the
	// user actually acted, so an unknown writer cannot be mistaken for them.
	it('ignores camera movement the user did not cause, however large', () => {
		const base = shot(v(0, 0, 0), v(0, 1, 0), 0.065);
		const state = { cam: v(0, 0.065, 0), target: v(0, 0, 0), offset: { ...IDENTITY_OFFSET }, lastBase: null as Shot | null, reframing: false, reframePending: false };
		frame(state, base, true); // settle
		for (let i = 0; i < 40; i++) {
			// Something outside the rig shoves the camera outward by 2x every frame - the exact failure.
			state.cam = v(state.cam.x * 2, state.cam.y * 2, state.cam.z * 2);
			frame(state, base, false); // ...but the user did NOT touch anything
		}
		expect(state.offset.zoom).toBe(1);          // intent unchanged
		expect(dist(state.cam, state.target)).toBeCloseTo(0.065, 9); // and the shot is restored
	});

	it('still reads the user when they DO act', () => {
		const base = shot(v(0, 0, 0), v(0, 1, 0), 0.065);
		const state = { cam: v(0, 0.065, 0), target: v(0, 0, 0), offset: { ...IDENTITY_OFFSET }, lastBase: null as Shot | null, reframing: false, reframePending: false };
		frame(state, base, true);
		state.cam = v(0, 0.26, 0);      // they wheel out to 4x
		frame(state, base, true);       // user acted this frame
		expect(state.offset.zoom).toBeCloseTo(4, 6);
		frame(state, base, false);      // and it STICKS without further input
		expect(dist(state.cam, state.target)).toBeCloseTo(0.26, 9);
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

// A DRAG IS A ROTATION. Measured in the field: while dragging, the camera-to-target distance decayed
// ~0.72% per FRAME and the derived zoom rode it down to the min-distance clamp, so dragging
// sideways slowly zoomed in and a wheel-out was immediately hauled back. Sourcing zoom only from
// wheel input makes that creep - and any future one, whatever causes it - unable to masquerade as
// intent. Rotation is still read from any drag.
describe('a drag rotates and must never zoom', () => {
	it('keeps the distance exactly while the camera is dragged around', () => {
		const base = shot(v(0, 0, 0), v(0, 1, 0), 0.00065);
		let offset = { ...IDENTITY_OFFSET };
		let cam = composeShot(base, offset).camera;
		for (let i = 0; i < 200; i++) {
			// Simulate BOTH: the user rotating, and the observed inward creep of 0.72% a frame.
			const rotated = { x: cam.z * 0.05 + cam.x * 0.999, y: cam.y, z: cam.z * 0.999 - cam.x * 0.05 };
			cam = { x: rotated.x * 0.9928, y: rotated.y * 0.9928, z: rotated.z * 0.9928 };
			const derived = deriveOffset(base, cam, base.target);
			offset = { dAz: derived.dAz, dEl: derived.dEl, zoom: offset.zoom }; // drag: take rotation, keep zoom
			cam = composeShot(base, offset).camera;
		}
		// The shot distance is untouched after 200 frames of creep...
		expect(Math.hypot(cam.x, cam.y, cam.z)).toBeCloseTo(0.00065, 12);
		expect(offset.zoom).toBe(1);
	});

	it('...but a wheel still changes it, and it sticks', () => {
		const base = shot(v(0, 0, 0), v(0, 1, 0), 0.00065);
		const wheeled = deriveOffset(base, v(0, 0.0013, 0), base.target); // user pulls out to 2x
		expect(wheeled.zoom).toBeCloseTo(2, 9);
		expect(composeShot(base, wheeled).dist).toBeCloseTo(0.0013, 12);
	});
});

// The wheel's notch size adapts to the gulf (wheelZoomSpeed). The reported symptom was "zoom out
// from a construct STOPS": it never stopped - at a fixed 5%/notch, a true-scale close-up is ~400
// notches from the system view, most through featureless black, which is indistinguishable from a
// dead wheel. These pin the shape of the adaptation, not a feel.
describe('wheelZoomSpeed - the notch adapts to how deep the camera is', () => {
	it('is the plain 1x at scene scale and above', () => {
		expect(wheelZoomSpeed(12, 12)).toBe(1);
		expect(wheelZoomSpeed(120, 12)).toBe(1); // zoomed OUT past the scene: no boost either
	});

	it('grows with the LOG of the depth, and caps', () => {
		const shallow = wheelZoomSpeed(0.1, 12);
		const deep = wheelZoomSpeed(1e-5, 12);
		const abyssal = wheelZoomSpeed(1e-9, 12);
		expect(shallow).toBeGreaterThan(1);
		expect(deep).toBeGreaterThan(shallow);
		expect(abyssal).toBeGreaterThanOrEqual(deep);
		expect(abyssal).toBeLessThanOrEqual(8); // capped: a notch may be big, never a teleport
	});

	it('stays near today\'s feel at readable scales', () => {
		// Within ~2 decades of the scene there is always something in frame, and the app's whole
		// existing zoom feel was built at speed 1. The adaptation must be gentle there - the deep
		// stretch is where it earns its keep.
		expect(wheelZoomSpeed(6, 12)).toBeLessThan(1.5);
		expect(wheelZoomSpeed(1.2, 12)).toBeLessThan(2);
	});

	it('is a function of the RATIO alone (R3), and never degenerate', () => {
		expect(wheelZoomSpeed(1e-9, 12)).toBeCloseTo(wheelZoomSpeed(1e-11, 0.12), 12);
		expect(wheelZoomSpeed(0, 12)).toBe(1);
		expect(wheelZoomSpeed(1, 0)).toBe(1);
		expect(wheelZoomSpeed(NaN, 12)).toBe(1);
	});

	it('makes the abyss crossable', () => {
		// The acceptance criterion behind the whole function, split the way the constraint really
		// splits. The DEEP stretch (true-scale ship to the readable threshold, seven decades of
		// featureless black) must go by fast - that is the stretch that read as a dead wheel. The
		// TOP two decades keep something in frame, so they may stay leisurely; the total is only
		// bounded loosely. Walk a camera out applying OrbitControls' rule (distance / 0.95^speed
		// per notch, speed re-read each notch exactly as the scene binds it) and count.
		const climb = (from: number, to: number) => {
			let d = from, n = 0;
			while (d < to && n < 500) { d /= Math.pow(0.95, wheelZoomSpeed(d, 12)); n++; }
			return n;
		};
		expect(climb(1e-9, 0.12)).toBeLessThan(80); // the black stretch: was ~310 at fixed speed 1
		expect(climb(1e-9, 12)).toBeLessThan(140); // the whole climb: was ~450
	});
});

// C10: PINCH-ZOOM WAS REVERTED ON EVERY TOUCH DEVICE. The rig reads the distance back off the
// camera only when a zoom gesture put it there (RENDER-S15); that set was written inline in the
// scene as `kind !== 'wheel'`, which is right for a mouse and wrong for every phone, because a
// pinch fires no wheel event. OrbitControls dollied the camera, the rig was never told a zoom had
// happened, and the distance was put back the next frame - so pinch did nothing while rotate
// worked, and a refresh appeared to "fix" it because nothing was ever broken.
//
// This is the regression test for the SET, which is the part that goes wrong. A drag must not own
// the distance (that fault is already paid for - a ~0.72%/frame creep rode the derived zoom to the
// min-distance clamp), and every ZOOM gesture must, whatever hardware it arrives from.
describe('ownsDistance - which inputs may move the camera in and out (C10)', () => {
	it('accepts BOTH zoom gestures: the wheel and the pinch', () => {
		expect(ownsDistance('wheel')).toBe(true);
		expect(ownsDistance('pinch')).toBe(true);
	});

	it('rejects a drag - a drag rotates, and must never change the distance', () => {
		expect(ownsDistance('drag')).toBe(false);
	});

	it('rejects everything that is not a zoom, including the turntable and the unknown', () => {
		// The turntable moves the camera on the user's behalf but is not them reaching for the
		// distance; 'other' is noteUserInput's default and must never be trusted with it.
		for (const kind of ['turntable', 'other', '', 'zoom', 'Wheel', 'PINCH']) {
			expect(ownsDistance(kind)).toBe(false);
		}
	});
});

// A71 (the follow bob). The base heading of a followed planet YAWS a full circle per orbit. The
// offset must ride that yaw without changing what the user chose — which is exactly what the old
// quaternion representation could not do: a parked -30° pitch, derived once and re-applied around
// the sweep, swung the camera elevation through 60° (22°..82°), identically on flat and inclined
// orbits (measured before the fix; this suite asserts the cure and pins the mechanism).
describe('a parked offset rides a yawing base at constant elevation (A71)', () => {
	const baseAt = (th: number, incl: number): Shot => {
		const s = { x: 2 * Math.cos(th), y: 2 * Math.sin(th) * Math.sin(incl), z: 2 * Math.sin(th) };
		// levelled follow heading at a 38-degree framing tilt, exactly as the scene builds it
		const tilt = 0.66, ca = Math.cos(tilt), sa = Math.sin(tilt);
		const h = Math.hypot(s.x, s.z);
		return { target: s, heading: { x: (s.x / h) * sa, y: ca, z: (s.z / h) * sa }, dist: 0.8 };
	};
	const elevOf = (shot: { camera: Vec3; target: Vec3 }) => {
		const d = { x: shot.camera.x - shot.target.x, y: shot.camera.y - shot.target.y, z: shot.camera.z - shot.target.z };
		return Math.asin(d.y / Math.hypot(d.x, d.y, d.z));
	};

	it('elevation is constant around the whole orbit, flat and inclined, park it anywhere', () => {
		for (const incl of [0, (3 * Math.PI) / 180]) {
			const b0 = baseAt(0, incl);
			// park: pitch the view down 30 degrees at azimuth 0
			const parked = composeShot(b0, { dAz: 0, dEl: (-30 * Math.PI) / 180, zoom: 1 });
			const off = deriveOffset(b0, parked.camera, b0.target);
			const e0 = elevOf(composeShot(baseAt(0, incl), off));
			for (let k = 1; k <= 48; k++) {
				const e = elevOf(composeShot(baseAt((k / 48) * 2 * Math.PI, incl), off));
				expect(Math.abs(e - e0)).toBeLessThan(1e-9);
			}
		}
	});

	it('the ride-along still happens: the azimuth advances with the base', () => {
		const off = { dAz: 0.4, dEl: -0.3, zoom: 1 };
		const a = composeShot(baseAt(0, 0), off);
		const b = composeShot(baseAt(Math.PI / 2, 0), off);
		const az = (s: { camera: Vec3; target: Vec3 }) => Math.atan2(s.camera.x - s.target.x, s.camera.z - s.target.z);
		// this orbit parametrisation (x=cos, z=sin) sweeps the azimuth BACKWARD: a quarter orbit
		// advances the base heading by -PI/2, and the offset must ride it exactly
		expect(Math.abs(Math.atan2(Math.sin(az(b) - az(a) + Math.PI / 2), Math.cos(az(b) - az(a) + Math.PI / 2)))).toBeLessThan(1e-9);
	});
});
