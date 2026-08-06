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
 * So the route travels as its SEGMENT BOUNDARIES: a real transit plan is a handful of segments
 * (accel, coast, brake), so this is a few points, not thousands. The curve between two boundaries is
 * a ballistic arc, and at the zooms a route line is read at, straight chords between boundaries are
 * indistinguishable from it - the same argument the orbit rings make in reverse (they need 1024
 * samples because you fly ALONG them; you never fly along a route line, you look at it).
 *
 * WHAT STILL MUST NOT CROSS: `draft_transit_plan` - the GM thinking aloud. "Current flight plan"
 * means the committed one the ship is actually flying.
 */

/** One boundary on the route: a position in AU, and the game-clock ms the ship is there. */
export interface RouteNode {
	/** Game-clock milliseconds. */
	t: number;
	x: number;
	y: number;
	z: number;
}

/** The published route: when it starts, when it ends, and the points between. */
export interface CompactRoute {
	s: number;
	e: number;
	p: RouteNode[];
}

const num = (v: any): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

function nodeFrom(state: any, t: number): RouteNode | null {
	const r = state?.r;
	if (!r) return null;
	return { t, x: num(r.x), y: num(r.y), z: num(r.z) };
}

/**
 * Reduce a construct's COMMITTED journeys to their segment boundaries. Pure; safe on a node with no
 * journeys (returns null, and the caller then attaches nothing).
 *
 * A cancelled journey is dropped entirely, and one cancelled MID-FLIGHT is truncated at the moment
 * it was cancelled - the ship is adrift from there, so the rest of the plan is a course it will
 * never fly. That mirrors `compactBurns`, deliberately: a route line that outlived its burns would
 * show a ship coasting along a path it had abandoned.
 */
export function compactRoute(construct: any): CompactRoute | null {
	const out: RouteNode[] = [];
	let s = Infinity;
	let e = -Infinity;

	for (const log of construct?.scheduled_journeys ?? []) {
		if (log?.status === 'cancelled') continue;
		const cancelledAtMs = log?.cancelledAtSec ? Number(BigInt(log.cancelledAtSec) * 1000n) : null;
		for (const plan of log?.plans ?? []) {
			for (const seg of plan?.segments ?? []) {
				const st = num(seg?.startTime);
				const en = num(seg?.endTime);
				if (!(en > st)) continue;
				if (cancelledAtMs !== null && st >= cancelledAtMs) continue; // never flown
				const stop = cancelledAtMs !== null ? Math.min(en, cancelledAtMs) : en;

				const a = nodeFrom(seg.startState, st);
				if (a && (!out.length || out[out.length - 1].t !== a.t)) out.push(a);
				// A truncated segment ends where the ship actually stopped thrusting, not where the
				// plan said it would arrive. Interpolating the boundary is honest enough for a line:
				// the alternative is claiming it reached a point it never did.
				const b = nodeFrom(seg.endState, en);
				if (b) {
					if (stop < en && a) {
						const f = (stop - st) / (en - st);
						out.push({ t: stop, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f });
					} else {
						out.push(b);
					}
				}
				s = Math.min(s, st);
				e = Math.max(e, stop);
			}
		}
	}

	if (out.length < 2) return null;
	return { s, e, p: out };
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
