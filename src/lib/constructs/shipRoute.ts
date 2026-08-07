/**
 * A construct's ROUTE, reduced to what a LINE needs - the transit sibling of `shipBurn.ts`.
 *
 * Phase P3c of `docs/dev/camera-framing-redesign.md`. A ship under way should draw its course the
 * way a body draws its orbit, and the owner's decision (2026-08-06) is that the current flight plan
 * DOES cross to players - "I honestly thought we transmitted the current flight plan".
 *
 * WHY THIS IS COMPACT RATHER THAN JUST PUBLISHING THE JOURNEYS. `slimNode` strips
 * `scheduled_journeys` for two reasons and only one of them is secrecy: they carry huge `pathPoint`
 * arrays, the broadcast layer RE-STRINGIFIES THE WHOLE SNAPSHOT on every change, and a construct in
 * transit rewrites that snapshot about twice a second. Publishing them raw would multiply the
 * payload on the hottest path in the app (the DataChannel frame trap that caused Mappadux's
 * v2.16.71 reconnect loop is the same shape of mistake).
 *
 * WHY THE GEOMETRY COMES FROM `pathPoints` AND NEVER FROM THE SEGMENT STATES. The first version of
 * this file read `segment.startState.r` / `endState.r`, on the reasonable assumption that a segment
 * knows where it begins and ends. It does not. `calculateFastPlan` writes literal
 * `{ r: {x:0,y:0}, v: {x:0,y:0} }` for accel-end, coast-start, coast-end and brake-start, filling in
 * only the first start and the final end - so for any Fast-mode plan the published route ran
 * origin -> STAR -> STAR -> STAR -> destination, straight through the middle of the system. The
 * suite stayed green because its fixture supplied states the real planner never writes, which is
 * RENDER-S8's trap in data form: the instrument agreed with the intent rather than with the input.
 * `pathPoints` is the only description of the course that is always populated, and it is also the
 * one the SHIP ITSELF is placed from (`samplePlanPathAtTime` interpolates linearly between them),
 * so building the line from it is what makes the line and the vessel agree by construction.
 *
 * WHY KNOTS AND A CURVE RATHER THAN A DECIMATED POLYLINE. The flown path is a genuinely curved arc -
 * an RK4 conic about the star with a drift-correction ramp - sampled 300 to 5000 times. Straight
 * chords between a handful of points cut the corner off that arc by a large fraction of its own
 * radius, and no amount of subdividing a chord recovers the curvature, because subdividing a
 * straight line yields more points on the same straight line. So the published knots are read as a
 * centripetal Catmull-Rom instead: the curve carries the bend from the knot SPACING alone, at no
 * cost on the wire, and because it is analytic the scene can tessellate it as finely as the camera
 * needs (the route's answer to what A23 does for an orbit ring, which cannot apply here - A23
 * re-samples a propagator, and a player has none). Fitting knots so the CURVE tracks the path,
 * rather than so the chords do, converges roughly as the fourth power of knot spacing instead of
 * the square: a whole transfer lands in a dozen knots where chords needed fifty.
 *
 * WHAT STILL MUST NOT CROSS: `draft_transit_plan` - the GM thinking aloud. "Current flight plan"
 * means the committed one the ship is actually flying.
 */

/** One knot on the route: a position in AU, and the game-clock ms the ship is there. */
export interface RouteNode {
	/** Game-clock milliseconds. */
	t: number;
	x: number;
	y: number;
	z: number;
}

/** The published route: when it starts, when it ends, and the knots between. */
export interface CompactRoute {
	s: number;
	e: number;
	p: RouteNode[];
}

/**
 * Ceiling on published knots. A dozen or so holds a whole transfer inside the tolerance below; the
 * cap exists so a pathological plan cannot quietly put a kilobyte on the broadcast path.
 */
const MAX_KNOTS = 16;
/** How many of the true path's samples the fit is scored against. Enough to see every wobble. */
const FIT_SAMPLES = 256;
/** Allowed distance from the true path to the drawn curve, as a fraction of the route's own size. */
const FIT_TOL_FRAC = 0.002;

const num = (v: any): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

interface Sample extends RouteNode {
	/** Forced knot: a segment boundary, where the ship's burn state changes. */
	hard?: boolean;
}

/**
 * The whole committed course as dense time-stamped samples, in flight order.
 *
 * `pathPoints` are uniform IN TIME across their segment - that is exactly how
 * `samplePlanPathAtTime` reads them back - so the time of sample i is a straight lerp of the
 * segment's own bounds. Getting this mapping right is what keeps the ship on the line it is drawn
 * beside; getting it wrong would slide the two apart in a way no static picture would reveal.
 */
function denseSamples(construct: any): Sample[] {
	const out: Sample[] = [];
	const push = (n: Sample) => {
		const last = out[out.length - 1];
		if (last && last.t === n.t) {
			if (n.hard) last.hard = true; // a join is a boundary even when the point is shared
			return;
		}
		out.push(n);
	};

	for (const log of construct?.scheduled_journeys ?? []) {
		if (log?.status === 'cancelled') continue;
		const cancelledAtMs = log?.cancelledAtSec ? Number(BigInt(log.cancelledAtSec) * 1000n) : null;
		for (const plan of log?.plans ?? []) {
			for (const seg of plan?.segments ?? []) {
				const st = num(seg?.startTime);
				const en = num(seg?.endTime);
				if (!(en > st)) continue;
				if (cancelledAtMs !== null && st >= cancelledAtMs) continue; // never flown

				const pts: any[] = Array.isArray(seg?.pathPoints) ? seg.pathPoints : [];
				if (pts.length >= 2) {
					for (let i = 0; i < pts.length; i++) {
						const t = st + ((en - st) * i) / (pts.length - 1);
						push({ t, x: num(pts[i]?.x), y: num(pts[i]?.y), z: num(pts[i]?.z), hard: i === 0 || i === pts.length - 1 });
					}
				} else {
					// No path to read: fall back to the segment's own states, which is the only thing
					// left. They may be the zeroed placeholders described above, so this is a floor
					// against drawing nothing, not a second source of truth.
					const a = seg?.startState?.r, b = seg?.endState?.r;
					if (a) push({ t: st, x: num(a.x), y: num(a.y), z: num(a.z), hard: true });
					if (b) push({ t: en, x: num(b.x), y: num(b.y), z: num(b.z), hard: true });
				}
			}
		}
		// A journey cancelled MID-FLIGHT is truncated at the moment it was cancelled - the ship is
		// adrift from there, so the rest of the plan is a course it will never fly. That mirrors
		// `compactBurns` deliberately: a route line that outlived its burns would show a ship
		// coasting along a path it had abandoned.
		if (cancelledAtMs !== null) truncateAt(out, cancelledAtMs);
	}
	return out;
}

/** Cut the sample list at `stop`, interpolating the final point so the line ends where the ship did. */
function truncateAt(out: Sample[], stop: number) {
	let i = out.findIndex((n) => n.t > stop);
	if (i <= 0) return;
	const a = out[i - 1], b = out[i];
	out.length = i;
	if (b.t > a.t) {
		const f = (stop - a.t) / (b.t - a.t);
		out.push({ t: stop, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, hard: true });
	}
}

// --- The curve --------------------------------------------------------------------------------

/**
 * Centripetal Catmull-Rom through the knots. Centripetal (the 0.5 exponent) rather than uniform
 * because a uniform spline through unevenly spaced knots overshoots into a cusp exactly where the
 * spacing changes - which on a route is the accel/coast boundary, the one place the eye is drawn to.
 *
 * ONE implementation, used by BOTH the fitter here and the scene that draws it. If the scene used
 * three's own curve instead, the fit would be scoring a different line from the one on screen, and
 * a tolerance measured against the wrong curve is not a tolerance at all.
 */
export function routePointAt(route: CompactRoute, span: number, u: number): RouteNode {
	const p = route.p;
	const i = Math.max(0, Math.min(p.length - 2, Math.floor(span)));
	const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
	const t = Math.max(0, Math.min(1, u));

	// Knot spacings by centripetal parameterisation; the epsilon keeps coincident knots finite.
	const d = (a: RouteNode, b: RouteNode) => Math.max(1e-12, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) ** 0.5);
	const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
	const tt = t1 + (t2 - t1) * t;

	const lerp = (a: RouteNode, b: RouteNode, ta: number, tb: number, x: number): RouteNode => {
		const f = (x - ta) / (tb - ta);
		return { t: a.t + (b.t - a.t) * f, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
	};
	const a1 = lerp(p0, p1, t0, t1, tt), a2 = lerp(p1, p2, t1, t2, tt), a3 = lerp(p2, p3, t2, t3, tt);
	const b1 = lerp(a1, a2, t0, t2, tt), b2 = lerp(a2, a3, t1, t3, tt);
	return lerp(b1, b2, t1, t2, tt);
}

/** The curve as a polyline, `perSpan` samples between each pair of knots. */
export function routePolyline(route: CompactRoute, perSpan: number): RouteNode[] {
	const out: RouteNode[] = [];
	if (route.p.length < 2) return route.p.slice();
	const n = Math.max(1, Math.floor(perSpan));
	for (let i = 0; i < route.p.length - 1; i++) {
		for (let k = 0; k < n; k++) out.push(routePointAt(route, i, k / n));
	}
	out.push(route.p[route.p.length - 1]);
	return out;
}

// --- The fit ----------------------------------------------------------------------------------

/** Distance from a point to a segment - the honest "how far is the drawn line from the truth". */
function distToSegment(p: RouteNode, a: RouteNode, b: RouteNode): number {
	const ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z;
	const ee = ex * ex + ey * ey + ez * ez;
	const px = p.x - a.x, py = p.y - a.y, pz = p.z - a.z;
	const t = ee > 0 ? Math.max(0, Math.min(1, (px * ex + py * ey + pz * ez) / ee)) : 0;
	return Math.hypot(px - ex * t, py - ey * t, pz - ez * t);
}

/** How far the curve through `knots` strays from the true path, and which sample strays worst. */
function worstError(samples: Sample[], knots: Sample[]): { err: number; at: number } {
	const curve = routePolyline({ s: 0, e: 0, p: knots }, 8);
	let err = 0, at = -1;
	for (let i = 0; i < samples.length; i++) {
		let best = Infinity;
		for (let j = 0; j < curve.length - 1; j++) {
			const d = distToSegment(samples[i], curve[j], curve[j + 1]);
			if (d < best) best = d;
			if (best === 0) break;
		}
		if (best > err) { err = best; at = i; }
	}
	return { err, at };
}

/**
 * Reduce a construct's COMMITTED journeys to a handful of knots whose CURVE tracks the flown path.
 * Pure; safe on a node with no journeys (returns null, and the caller then attaches nothing).
 *
 * Greedy rather than analytic: start from the segment boundaries (which must be knots anyway, since
 * they are where the burn state changes and so where the colour changes), then repeatedly promote
 * whichever sample the curve currently misses by most. It converges in a few rounds because each
 * promotion halves the span that was failing, and it stops the moment the tolerance is met - a
 * straight hop keeps its two knots and costs nothing.
 */
export function compactRoute(construct: any): CompactRoute | null {
	const dense = denseSamples(construct);
	if (dense.length < 2) return null;

	const s = dense[0].t;
	const e = dense[dense.length - 1].t;

	// Score the fit against a bounded subsample: the path is already a fine polyline, and 256 points
	// see every feature of it while keeping this cheap enough to run on the broadcast path.
	const stride = Math.max(1, Math.floor(dense.length / FIT_SAMPLES));
	const scored: Sample[] = [];
	for (let i = 0; i < dense.length; i += stride) scored.push(dense[i]);
	if (scored[scored.length - 1] !== dense[dense.length - 1]) scored.push(dense[dense.length - 1]);

	// Tolerance scales with the route, so a 0.02 AU hop and a 30 AU haul are held to the same
	// RELATIVE straightness - R3's rule that nothing in this subsystem carries an absolute epsilon.
	let lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity };
	for (const n of dense) {
		lo = { x: Math.min(lo.x, n.x), y: Math.min(lo.y, n.y), z: Math.min(lo.z, n.z) };
		hi = { x: Math.max(hi.x, n.x), y: Math.max(hi.y, n.y), z: Math.max(hi.z, n.z) };
	}
	const tol = Math.hypot(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z) * FIT_TOL_FRAC;

	// Seed with the forced knots: every segment boundary, plus the two ends.
	const idx = new Set<number>([0, dense.length - 1]);
	for (let i = 0; i < dense.length; i++) if (dense[i].hard) idx.add(i);
	const knotsFrom = (set: Set<number>) => [...set].sort((a, b) => a - b).map((i) => dense[i]);

	let knots = knotsFrom(idx);
	while (knots.length < MAX_KNOTS) {
		const { err, at } = worstError(scored, knots);
		if (!(err > tol) || at < 0) break;
		// Promote the true-path sample the curve misses by most. Map back from the scored subsample
		// to its index in the dense list, so the knot lands on a real point of the flown path.
		const dIdx = Math.min(dense.length - 1, at * stride);
		if (idx.has(dIdx)) break; // already a knot: nothing left to give, stop rather than spin
		idx.add(dIdx);
		knots = knotsFrom(idx);
	}

	return { s, e, p: knots.map(({ t, x, y, z }) => ({ t, x, y, z })) };
}

/**
 * The route to DRAW, from whichever source this node has: the compact form on a player's snapshot,
 * or derived from the journeys on the GM's. One reader, so the two views cannot draw different
 * courses - R11, and the same dual-source shape `shipBurnAt` uses for the plume.
 */
export function routeOf(construct: any): CompactRoute | null {
	const published: CompactRoute | undefined = construct?.route;
	if (published?.p?.length >= 2) return published;
	return compactRoute(construct);
}

/** Is this construct under way at `timeMs`? Used to decide whether the line draws at all. */
export function isUnderWay(construct: any, timeMs: number): boolean {
	const r = routeOf(construct);
	return !!r && timeMs >= r.s && timeMs <= r.e;
}

/**
 * Half-extent of the route in AU - the construct ladder's IN-TRANSIT rung (`routeExtent`), which
 * frames origin-to-destination rather than a host. Measured about the route's own centre so a long
 * outbound leg does not drag the shot off to one side.
 */
export function routeHalfExtentAU(route: CompactRoute | null): number {
	if (!route || route.p.length < 2) return 0;
	let minX = Infinity, minY = Infinity, minZ = Infinity;
	let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
	for (const n of route.p) {
		minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
		minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
		minZ = Math.min(minZ, n.z); maxZ = Math.max(maxZ, n.z);
	}
	return Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2;
}
