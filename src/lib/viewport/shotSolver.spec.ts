// P1 EQUIVALENCE + the P3/P3b targets. See docs/dev/camera-framing-redesign.md.
//
// `legacyFrameDistance` is holo/scene.ts's closure body copied verbatim, with its scene state made
// arguments. The solver must match it exactly today; the BEHAVIOUR changes in later phases, and the
// tests for those are written here now (skipped where today's code cannot pass them) so each phase
// has a definition of done that predates the work.
import { describe, it, expect } from 'vitest';
import { frameHalfExtent, FRAME_LEVELS } from './camera';
import {
	frameDistanceFor, distanceForHalfExtent, wholeSystemDistance, beltDistance,
	headingDirection, hostWouldOcclude, cameraPosition, type Vec3
} from './shotSolver';

// --- the old closure, verbatim ------------------------------------------------------------------
function legacyFrameDistance(a: {
	radius: number; level: number; parentDist: number; maxSatelliteDist: number; pairContextDist: number;
	fillFrac: number; fovDeg: number; aspect: number; minDistance: number;
}): number {
	const half = frameHalfExtent({
		level: a.level, radius: a.radius, parentDist: a.parentDist,
		maxSatelliteDist: a.maxSatelliteDist, pairContextDist: a.pairContextDist,
		config: { ...FRAME_LEVELS, fillFrac: a.fillFrac }
	}) || Math.max(0.35, a.minDistance * 3);
	const tan = Math.tan((a.fovDeg * Math.PI) / 360);
	const dist = half / Math.max(1e-6, tan * Math.min(1, a.aspect));
	return Math.max(a.minDistance * 1.05, dist);
}

const LENS = { fovYDeg: 45, aspect: 16 / 9 };
// Radii spanning the whole range the scene works over: a true-scale hull (1e-10) to a readable star.
const RADII = [0, 1e-10, 1e-7, 1e-5, 0.001, 0.1, 0.5, 2];
const LEVELS = [0, 1, 2, 3];

describe('shotSolver reproduces the old frameDistance exactly (P1)', () => {
	it('matches across every level, radius, context and lens', () => {
		for (const level of LEVELS) for (const radius of RADII)
			for (const parentDist of [0, 1e-6, 0.02, 3])
				for (const maxSatelliteDist of [0, 0.05])
					for (const aspect of [0.6, 1, 16 / 9])
						for (const minDistance of [1e-10, 1e-6, 0.05]) {
							const lens = { fovYDeg: 45, aspect };
							expect(
								frameDistanceFor({
									radius,
									context: { level, parentDist, maxSatelliteDist, pairContextDist: 0 },
									lens,
									policy: { fillFrac: FRAME_LEVELS.fillFrac, minDistance }
								})
							).toBe(
								legacyFrameDistance({
									radius, level, parentDist, maxSatelliteDist, pairContextDist: 0,
									fillFrac: FRAME_LEVELS.fillFrac, fovDeg: 45, aspect, minDistance
								})
							);
						}
	});

	it('matches for a barycentre member at level 0', () => {
		for (const pairContextDist of [0, 0.5, 9]) {
			expect(
				frameDistanceFor({
					radius: 0.1, context: { level: 0, parentDist: 0.2, pairContextDist },
					lens: LENS, policy: { fillFrac: FRAME_LEVELS.fillFrac, minDistance: 0.05 }
				})
			).toBe(
				legacyFrameDistance({
					radius: 0.1, level: 0, parentDist: 0.2, maxSatelliteDist: 0, pairContextDist,
					fillFrac: FRAME_LEVELS.fillFrac, fovDeg: 45, aspect: 16 / 9, minDistance: 0.05
				})
			);
		}
	});

	it('gives a size-less subject the patch shot rather than zero', () => {
		const d = frameDistanceFor({
			radius: 0, context: { level: 3 }, lens: LENS,
			policy: { fillFrac: FRAME_LEVELS.fillFrac, minDistance: 1e-6 }
		});
		expect(d).toBe(distanceForHalfExtent(0.35, LENS, 1e-6));
	});

	it('whole-system and belt shots match the scene', () => {
		const halfV = (45 * Math.PI) / 360;
		const halfH = Math.atan(Math.tan(halfV) * (16 / 9));
		expect(wholeSystemDistance(12, LENS)).toBeCloseTo((12 * 1.06) / Math.sin(Math.min(halfV, halfH)), 12);
		expect(beltDistance(3, 12)).toBe(Math.max(12 * 0.4, 3 * 1.9));
		expect(beltDistance(0.1, 12)).toBe(12 * 0.4); // the floor wins for a tight ring
	});
});

describe('R3: the solver is scale-blind', () => {
	it('halving the subject halves the distance, at every scale', () => {
		// Level 3 is pure subject-size framing, so the shot must be exactly proportional - no floor,
		// no epsilon, no band. minDistance is set below the smallest shot so it cannot interfere.
		const policy = { fillFrac: 0.8, minDistance: 1e-30 };
		for (const r of [1e-10, 1e-6, 0.01, 1]) {
			const big = frameDistanceFor({ radius: r, context: { level: 3 }, lens: LENS, policy });
			const small = frameDistanceFor({ radius: r / 2, context: { level: 3 }, lens: LENS, policy });
			expect(big / small).toBeCloseTo(2, 9);
		}
	});

	it('the fill fraction is the actual knob (R1: 0.8 fills more of the frame than 0.5)', () => {
		const at = (fillFrac: number) =>
			frameDistanceFor({ radius: 0.1, context: { level: 3 }, lens: LENS, policy: { fillFrac, minDistance: 1e-30 } });
		expect(at(0.8)).toBeLessThan(at(0.5)); // fuller frame = closer camera
	});
});

describe('heading policies', () => {
	const subject: Vec3 = { x: 3, y: 0, z: 0 };
	const host: Vec3 = { x: 1, y: 0, z: 0 };

	it('radial is today\'s behaviour: outward from the system centre, raised to the tilt', () => {
		const h = headingDirection({ policy: { kind: 'radial' }, tiltRad: Math.PI / 2, subject });
		expect(h.x).toBeCloseTo(1, 9); // straight out along +x at a 90-degree tilt
		expect(h.y).toBeCloseTo(0, 9);
	});

	it('overhead (tilt 0) looks straight down whatever the policy', () => {
		for (const policy of [{ kind: 'radial' } as const, { kind: 'host-relative' } as const]) {
			const h = headingDirection({ policy, tiltRad: 0, subject, host });
			expect(h.y).toBeCloseTo(1, 9);
		}
	});

	it('a subject sitting on the origin falls back to a fixed azimuth instead of dividing by zero', () => {
		const h = headingDirection({ policy: { kind: 'radial' }, tiltRad: Math.PI / 2, subject: { x: 0, y: 0, z: 0 } });
		expect(Number.isFinite(h.x) && Number.isFinite(h.y) && Number.isFinite(h.z)).toBe(true);
		expect(Math.hypot(h.x, h.y, h.z)).toBeCloseTo(1, 9);
	});

	it('fixed-azimuth ignores the subject entirely - the shot cannot rotate', () => {
		const a = headingDirection({ policy: { kind: 'fixed-azimuth', azimuth: 0.7 }, tiltRad: 1, subject });
		const b = headingDirection({ policy: { kind: 'fixed-azimuth', azimuth: 0.7 }, tiltRad: 1, subject: { x: -9, y: 2, z: 4 } });
		expect(a).toEqual(b);
	});

	// P3 (R2). The host-relative heading puts the camera on the far side of the subject from its
	// host, so the host is behind the subject in shot. This passes today - the policy exists and is
	// correct - it is simply not yet SELECTED by the scene. P3 is the caller change.
	it('P3: host-relative stands off the host, so the host is behind the subject', () => {
		const h = headingDirection({ policy: { kind: 'host-relative' }, tiltRad: Math.PI / 2, subject, host });
		expect(h.x).toBeCloseTo(1, 9); // subject is at +x from the host, so the camera is further +x
		const cam = cameraPosition(subject, h, 0.5);
		// The camera is further from the host than the subject is: nothing of the host in between.
		expect(Math.hypot(cam.x - host.x, cam.y - host.y, cam.z - host.z)).toBeGreaterThan(
			Math.hypot(subject.x - host.x, subject.y - host.y, subject.z - host.z)
		);
	});

	it('P3: occlusion is decidable, and flags the genuinely impossible shot', () => {
		// A close-up well inside the host separation is safe...
		expect(hostWouldOcclude({ dist: 0.1, subjectRadius: 0.01, hostSeparation: 2 })).toBe(false);
		// ...and a shot that has to back off further than the host is not, which is a design
		// decision for the caller (a station skimming its primary), not a rounding error.
		expect(hostWouldOcclude({ dist: 3, subjectRadius: 0.01, hostSeparation: 2 })).toBe(true);
		expect(hostWouldOcclude({ dist: 3, subjectRadius: 0, hostSeparation: 0 })).toBe(false); // no host
	});
});

// P3b - the construct ladder's transit rung (section 4a). The input exists; the ladder that feeds
// it does not, so this is skipped. Un-skip with P3b.
describe.skip('P3b: a construct in transit frames its route', () => {
	it('frames origin-to-destination rather than a host', () => {
		const withRoute = frameDistanceFor({
			radius: 1e-9, context: { level: 1, parentDist: 0.001, routeExtent: 4 },
			lens: LENS, policy: { fillFrac: 0.8, minDistance: 1e-10 }
		});
		// The route, not the parent, sets the shot.
		expect(withRoute).toBeGreaterThan(distanceForHalfExtent(1, LENS, 1e-10));
	});
});
