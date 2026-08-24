/**
 * THE SHOT SOLVER - given a subject, its context and the lens, where does the camera go?
 *
 * Extracted from `holo/scene.ts` (`frameDistance` and the framing branches of `driveFocus`) as
 * phase P1 of `docs/dev/camera-framing-redesign.md`. Pure: no THREE, no scene state, no clock. The
 * geometry here was never the thing that was broken - six mechanisms wrapped AROUND it were - so
 * this file's job is to be obviously correct and stay that way while those are replaced.
 *
 * P1 RULE: reproduces today's settled shots exactly; `shotSolver.spec.ts` pins the arithmetic
 * against the old closure. The BEHAVIOUR changes in later phases, and the hooks are already here so
 * those phases are additive rather than surgery:
 *   - P3  host-aware heading: `HeadingPolicy.kind = 'host-relative'` (R2). Today's shot is
 *         'radial', and 'fixed-azimuth' is the locked-heading 2D/projector view.
 *   - P3b construct ladder: `FramingContext.routeExtent` (section 4a) - a ship IN TRANSIT frames
 *         between origin and destination, an extent that comes from the route rather than from a
 *         parent body, so it needs its own input rather than borrowing parentDist.
 *
 * Vectors are plain {x,y,z} so this runs in a unit test without a renderer. The scene converts.
 */

import { frameHalfExtent, FRAME_LEVELS, type FrameLevelConfig } from './camera';

export interface Vec3 { x: number; y: number; z: number }

export interface LensSpec {
	/** Vertical field of view, DEGREES (three.js PerspectiveCamera.fov). */
	fovYDeg: number;
	/** width / height. Framing uses min(1, aspect) so a narrow window never crops the subject. */
	aspect: number;
}

export interface FramingContext {
	/** Ladder rung: 0 pair-context, 1 context, 2 satellites, 3 close-up. */
	level: number;
	/** Distance to the furthest context peer (the parent, or a barycentre partner). */
	parentDist?: number;
	/** Distance to the furthest thing orbiting the subject. */
	maxSatelliteDist?: number;
	/** Level 0 only: out to whatever the pair as a whole orbits. */
	pairContextDist?: number;
	/**
	 * P3b/P3c: distance from the subject to the FURTHEST point of its committed route - a ship in
	 * transit frames origin-to-destination rather than a host.
	 *
	 * A distance from the SUBJECT, in the same terms as `parentDist`, and not the route's own size:
	 * the shot centres on the ship, which sits somewhere along its course rather than at the middle
	 * of it, so the half-extent that actually holds the whole journey is the reach to the far end.
	 * Measuring the route about its own centre instead would frame a ship near either end with half
	 * its journey off screen - exactly the shot the rung exists to give.
	 */
	routeExtent?: number;
}

export interface DistancePolicy {
	/** Fraction of the frame's minor axis the subject fills at a close-up. R1: 0.8. */
	fillFrac: number;
	/** The controls' own minimum approach - the ONLY lower bound in the camera path (R3/D5). */
	minDistance: number;
	/**
	 * Shot for a subject with no measurable size at all (a glyph-only construct at level 3). Kept
	 * as a policy value rather than a magic number so it is visible and testable.
	 */
	sizelessHalfExtent?: number;
}

/**
 * Distance from the subject at which it frames as asked.
 *
 * `radius` is the subject's rendered HALF-extent in scene units, from `rendering/scaleLaw.ts` - so
 * the solver and the renderer cannot disagree about how big the thing currently is (R12).
 */
export function frameDistanceFor(args: {
	radius: number;
	context: FramingContext;
	lens: LensSpec;
	policy: DistancePolicy;
	config?: FrameLevelConfig;
}): number {
	const { radius, context, lens, policy } = args;
	const cfg: FrameLevelConfig = { ...(args.config ?? FRAME_LEVELS), fillFrac: policy.fillFrac };
	// The context rung frames the ROUTE where there is one. It enters as `parentDist` rather than as a
	// fourth branch inside frameHalfExtent because it is the same question that rung always asks -
	// "how far out must I be to hold my context" - with a different context. A ship under way has its
	// journey for context; its old host is no longer where it lives.
	const contextDist = Math.max(context.parentDist ?? 0, context.routeExtent ?? 0);
	const half =
		frameHalfExtent({
			level: context.level,
			radius,
			parentDist: contextDist,
			maxSatelliteDist: context.maxSatelliteDist,
			pairContextDist: context.pairContextDist,
			config: cfg
		}) || Math.max(policy.sizelessHalfExtent ?? 0.35, policy.minDistance * 3);
	return distanceForHalfExtent(half, lens, policy.minDistance);
}

/** Turn a half-extent into a camera distance through the lens, floored at the controls' minimum. */
export function distanceForHalfExtent(half: number, lens: LensSpec, minDistance: number): number {
	const tan = Math.tan((lens.fovYDeg * Math.PI) / 360);
	const dist = half / Math.max(1e-6, tan * Math.min(1, lens.aspect));
	return Math.max(minDistance * 1.05, dist);
}

/**
 * The whole-system shot. Everything the scene draws sits inside a sphere of `gridRadius` about the
 * origin by construction, so the honest fit is the BOUNDING SPHERE, not a flat half-extent: at a
 * tilt the near edge of the disc is closer to the camera and projects larger, which a flat estimate
 * does not see (it left the outer orbits clipping off the bottom of a 64-degree shot).
 * R / sin(half-fov) fits a sphere of radius R at any tilt.
 */
export function wholeSystemDistance(gridRadius: number, lens: LensSpec, border = 1.06): number {
	const halfV = (lens.fovYDeg * Math.PI) / 360;
	const halfH = Math.atan(Math.tan(halfV) * Math.max(1e-6, lens.aspect));
	return (gridRadius * border) / Math.max(1e-6, Math.sin(Math.min(halfV, halfH)));
}

/** A belt is an annulus about the star: pull back far enough to hold the whole ring. */
export function beltDistance(outerScene: number, gridRadius: number): number {
	return Math.max(gridRadius * 0.4, outerScene * 1.9);
}

// --- Heading ------------------------------------------------------------------------------------

export type HeadingPolicy =
	/** Today's default: approach radially outward from the system centre, raised to the tilt.
	 *  A71 `level`: horizontal part only, exactly as on host-relative — and load-bearing for
	 *  CONTINUITY, not just comfort: the follow shot FALLS BACK from host-relative to radial when
	 *  the host would occlude (a wide zoom trips it), and if only one of the two levels, every
	 *  crossing of that boundary snaps the elevation by the subject's inclination — a once-per-orbit
	 *  "view reset" on an inclined orbit. Level both and the policies agree at the boundary. */
	| { kind: 'radial'; level?: boolean }
	/**
	 * P3 (R2): approach along host -> subject, so the subject sits in FRONT of its host and the host
	 * can never occlude it. The occlusion guarantee is structural, not a heuristic - see
	 * `hostWouldOcclude`.
	 *
	 * A71 `level`: use only the HORIZONTAL part of host -> subject, so the tilt alone owns the
	 * heading's elevation. Without it, a subject on an INCLINED orbit rocks the view direction up
	 * and down once per orbit — a followed 3° -inclined planet on a fast clock visibly bounces
	 * (owner-observed on an 8.8-day orbit). The follow shot passes `level: true`; the
	 * surface-construct shot must NOT (it aims along the true 3D host->construct radial at
	 * tilt = PI/2, where flattening would swing a high-latitude construct off centre).
	 */
	| { kind: 'host-relative'; level?: boolean }
	/** Locked-heading views (2D map, projector): a frozen azimuth, rotation impossible. */
	| { kind: 'fixed-azimuth'; azimuth: number };

const UP: Vec3 = { x: 0, y: 1, z: 0 };

function norm(v: Vec3): Vec3 {
	const L = Math.hypot(v.x, v.y, v.z);
	return L > 1e-12 ? { x: v.x / L, y: v.y / L, z: v.z / L } : { x: 0, y: 0, z: 1 };
}
function sub(a: Vec3, b: Vec3): Vec3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }

/**
 * Unit offset from subject to camera: tilt from vertical, i.e. up*cos(angle) + outward*sin(angle).
 * angle 0 is straight overhead.
 */
export function headingDirection(args: {
	policy: HeadingPolicy;
	tiltRad: number;
	/** Subject position, scene units. Only used by 'radial' (direction from the origin). */
	subject?: Vec3;
	/** The framing host, if any. Only used by 'host-relative'. */
	host?: Vec3;
	/** Where the system centre is drawn (the floating origin's shift). Defaults to true origin. */
	origin?: Vec3;
}): Vec3 {
	const { policy, tiltRad } = args;
	const ca = Math.cos(tiltRad);
	const sa = Math.sin(tiltRad);

	if (policy.kind === 'fixed-azimuth') {
		const pol = tiltRad;
		return {
			x: Math.sin(pol) * Math.sin(policy.azimuth),
			y: Math.cos(pol),
			z: Math.sin(pol) * Math.cos(policy.azimuth)
		};
	}

	let outward: Vec3;
	if (policy.kind === 'host-relative' && args.host && args.subject) {
		// Away from the host, so the camera stands on the subject's far side and the host falls
		// BEHIND the subject in shot rather than in front of it.
		const away = sub(args.subject, args.host);
		// A71: `level` drops the vertical component so an inclined orbit cannot rock the shot —
		// the azimuth still tracks host->subject, the elevation is the tilt's alone. Falls back to
		// the full vector when the geometry is (near-)vertical, where a horizontal azimuth would be
		// noise anyway.
		if (policy.level && Math.hypot(away.x, away.z) > 1e-9) away.y = 0;
		outward = Math.hypot(away.x, away.y, away.z) > 1e-12 ? norm(away) : { x: 0, y: 0, z: 1 };
	} else {
		const o = args.origin ?? { x: 0, y: 0, z: 0 };
		const radial = args.subject ? sub(args.subject, o) : { x: 0, y: 0, z: 1 };
		// A71: same levelling as host-relative, same near-vertical fallback.
		if (policy.kind === 'radial' && policy.level && Math.hypot(radial.x, radial.z) > 1e-9) radial.y = 0;
		// The scene's own guard: a subject sitting ON the origin has no radial direction, so fall
		// back to a fixed azimuth rather than dividing by ~0.
		outward = Math.hypot(radial.x, radial.y, radial.z) > 1e-4 ? norm(radial) : { x: 0, y: 0, z: 1 };
	}
	// NORMALISED, and this is load-bearing rather than tidy. `UP*cos + outward*sin` is a unit vector
	// ONLY when the two are orthogonal, i.e. when `outward` is horizontal. In general
	//     |UP*cos(t) + outward*sin(t)| = sqrt(1 + outward.y * sin(2t))
	// so any subject off the plane - a tilted orbit, a moon above its primary, a station on the
	// underside of its world - returns a vector longer or shorter than 1.
	//
	// That was catastrophic in the base+offset camera (RENDER-S12): compose places the camera at
	// |heading| * dist, derive reads the distance back as the zoom, so EVERY FRAME multiplied the
	// zoom by |heading|. Measured in the field: Jupiter sits slightly below the plane, |heading| =
	// 0.993, and the view crept inward 0.72% a frame until it pinned at the min-distance clamp; the
	// ISS on a host-relative heading gave |heading| = 1.28 and the view ran away outward -
	// 1.25e-9, 8.8e-8, 6.2e-6, 0.031, 7.9 - until it pinned at the max. Same bug, opposite signs,
	// which is why it looked like two faults and like it tracked the clock (the geometry moves).
	return norm({
		x: UP.x * ca + outward.x * sa,
		y: UP.y * ca + outward.y * sa,
		z: UP.z * ca + outward.z * sa
	});
}

/**
 * P3's occlusion guarantee, as a checkable predicate rather than a hope. With the camera on the
 * subject's far side from the host, the host is behind the subject whenever the camera is closer to
 * the subject than the subject is to the host. Where that does NOT hold (a close binary, a station
 * skimming its primary) the shot cannot both frame the subject and clear the host, and the caller
 * must choose - that case is a real design decision, not a rounding error, so it is surfaced.
 */
export function hostWouldOcclude(args: { dist: number; subjectRadius: number; hostSeparation: number }): boolean {
	if (!(args.hostSeparation > 0)) return false;
	return args.dist + args.subjectRadius >= args.hostSeparation;
}

/** Camera position for a shot: the subject, plus the heading scaled by the distance. */
export function cameraPosition(target: Vec3, heading: Vec3, dist: number): Vec3 {
	return { x: target.x + heading.x * dist, y: target.y + heading.y * dist, z: target.z + heading.z * dist };
}
