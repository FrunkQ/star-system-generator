// P3c: the route a player actually receives. Written the way shipBurnPlayer.spec.ts ended up -
// covering the PLUMBING as well as the unit, because that suite stayed green while a player's ship
// showed no plume: every test exercised the maths in isolation and none asserted that the snapshot a
// player is SENT carries the data.
//
// AND covering the SHAPE OF THE INPUT, which is how the first version of this file went wrong. Its
// fixture handed every segment a real `startState.r` / `endState.r`; the real `calculateFastPlan`
// writes zeroes there. The suite was green and the published route ran through the star. So the
// fixtures below are built the way the planner really builds them - geometry in `pathPoints`, states
// left as the placeholders they often are - and one test asserts exactly that failure cannot return.
import { describe, it, expect } from 'vitest';
import { compactRoute, routeOf, isUnderWay, routePolyline, routeStateAt } from './shipRoute';
import { computePlayerStarmapSnapshot } from '$lib/system/utils';
import { buildFlightUpdate, applyFlightUpdate } from './flightState';

/** A segment as the planner really emits one: geometry in pathPoints, states often placeholders. */
const seg = (type: string, startTime: number, endTime: number, pathPoints: any[], states?: any) => ({
	type, startTime, endTime, pathPoints,
	startState: states?.from ?? { r: { x: 0, y: 0 }, v: { x: 0, y: 0 } },
	endState: states?.to ?? { r: { x: 0, y: 0 }, v: { x: 0, y: 0 } }
});
const ship = (segments: any[], extra: any = {}) =>
	({ kind: 'construct', id: 'ship', name: 'Ship', scheduled_journeys: [{ plans: [{ segments }] }], ...extra });

/** Points along a circular arc of radius `r`, from angle a0 to a1 - a stand-in for a transfer arc. */
const arc = (r: number, a0: number, a1: number, n: number) =>
	Array.from({ length: n }, (_, i) => {
		const a = a0 + ((a1 - a0) * i) / (n - 1);
		return { x: r * Math.cos(a), y: r * Math.sin(a) };
	});

/** A quarter-turn transfer at 1 AU, split accel / coast / brake the way a real plan is. */
const ARC_LEG = [
	seg('Accel', 0, 10000, arc(1, 0, Math.PI / 8, 40)),
	seg('Coast', 10000, 20000, arc(1, Math.PI / 8, (3 * Math.PI) / 8, 200)),
	seg('Brake', 20000, 30000, arc(1, (3 * Math.PI) / 8, Math.PI / 2, 40))
];

/** A short straight hop - the easy case, which must stay as cheap as it is simple. */
const HOP = [seg('Accel', 0, 10000, [{ x: 5, y: 0 }, { x: 5.01, y: 0 }, { x: 5.02, y: 0 }])];

/**
 * Worst distance from `pts` to the LINE drawn through a route's knots.
 *
 * Point-to-SEGMENT, not point-to-vertex. Measuring to the nearest tessellated vertex instead reports
 * half the tessellation spacing as if it were fitting error, which made a converged fit look three
 * times out of tolerance - the metric failing, not the code. It is the same distinction A23 had to
 * make about orbit rings (RENDER-S10's neighbourhood): the drawn thing is a chain of segments, so
 * the honest question is how far the truth is from a segment.
 */
const strayFrom = (route: any, pts: any[]) => {
	const curve = routePolyline(route, 8);
	let worst = 0;
	for (const p of pts) {
		let best = Infinity;
		for (let i = 0; i < curve.length - 1; i++) {
			const a = curve[i], b = curve[i + 1];
			const ex = b.x - a.x, ey = b.y - a.y, ee = ex * ex + ey * ey;
			const t = ee > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / ee)) : 0;
			best = Math.min(best, Math.hypot(p.x - a.x - ex * t, p.y - a.y - ey * t));
		}
		worst = Math.max(worst, best);
	}
	return worst;
};

describe('compactRoute takes its geometry from pathPoints', () => {
	it('NEVER from the segment states, which the Fast planner leaves as zeroes', () => {
		// This is the regression. `calculateFastPlan` writes {r:{x:0,y:0}} for accel-end,
		// coast-start, coast-end and brake-start, so a route built from the states ran
		// origin -> star -> star -> star -> destination. Every knot must sit on the real arc.
		const r = compactRoute(ship(ARC_LEG))!;
		for (const n of r.p) expect(Math.hypot(n.x, n.y)).toBeCloseTo(1, 6);
		expect(r.p.some((n) => n.x === 0 && n.y === 0)).toBe(false);
	});

	it('spans the whole committed course', () => {
		const r = compactRoute(ship(ARC_LEG))!;
		expect(r.s).toBe(0);
		expect(r.e).toBe(30000);
		expect(r.p[0]).toMatchObject({ x: 1, y: 0 });
		expect(r.p[r.p.length - 1].x).toBeCloseTo(0, 6);
		expect(r.p[r.p.length - 1].y).toBeCloseTo(1, 6);
	});

	it('keeps the segment boundaries as knots, so the burn colours land in the right place', () => {
		const times = compactRoute(ship(ARC_LEG))!.p.map((n) => n.t);
		for (const t of [0, 10000, 20000, 30000]) expect(times).toContain(t);
	});
});

describe('the drawn CURVE tracks the flown path', () => {
	const truth = ARC_LEG.flatMap((s) => s.pathPoints);

	it('holds a curved transfer to a fraction of a percent of its own size', () => {
		const r = compactRoute(ship(ARC_LEG))!;
		expect(strayFrom(r, truth)).toBeLessThan(0.005); // 0.5% of the 1 AU arc
	});

	it('beats the chords that a boundaries-only route would have drawn', () => {
		// The design's original shape: knots at the segment boundaries and straight lines between.
		// Kept as a live comparison rather than an anecdote - it is the reason for the whole fit.
		const r = compactRoute(ship(ARC_LEG))!;
		const boundariesOnly = { s: 0, e: 30000, p: r.p.filter((n) => [0, 10000, 20000, 30000].includes(n.t)) };
		const chords = { ...boundariesOnly };
		const chordStray = Math.max(
			...truth.map((p) => {
				let best = Infinity;
				for (let i = 0; i < chords.p.length - 1; i++) {
					const a = chords.p[i], b = chords.p[i + 1];
					const ex = b.x - a.x, ey = b.y - a.y, ee = ex * ex + ey * ey;
					const t = ee > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / ee)) : 0;
					best = Math.min(best, Math.hypot(p.x - a.x - ex * t, p.y - a.y - ey * t));
				}
				return best;
			})
		);
		expect(chordStray).toBeGreaterThan(0.02); // the arc really does cut its corner
		expect(strayFrom(r, truth)).toBeLessThan(chordStray / 4);
	});

	it('spends nothing on a straight hop', () => {
		expect(compactRoute(ship(HOP))!.p.length).toBeLessThanOrEqual(3);
	});
});

describe('compactRoute stays small enough for the broadcast path', () => {
	it('is a handful of knots, not a path array', () => {
		// A construct in transit rewrites the broadcast snapshot ~2x/second, so this rides the
		// hottest path in the app. 280 true samples must not become 280 published points.
		const r = compactRoute(ship(ARC_LEG))!;
		expect(r.p.length).toBeLessThanOrEqual(16);
		expect(JSON.stringify(r).length).toBeLessThan(1400);
	});

	it('carries no path arrays, drafts or destinations beyond the geometry', () => {
		const r = compactRoute(ship(ARC_LEG))!;
		expect(Object.keys(r).sort()).toEqual(['e', 'p', 's']);
		expect(Object.keys(r.p[0]).sort()).toEqual(['t', 'x', 'y', 'z']);
	});
});

describe('compactRoute and the journeys it must not draw', () => {
	it('drops a cancelled journey entirely', () => {
		const c = ship(ARC_LEG);
		c.scheduled_journeys[0].status = 'cancelled';
		expect(compactRoute(c)).toBeNull();
	});

	it('truncates a journey cancelled MID-FLIGHT where the ship actually stopped', () => {
		const c = ship(ARC_LEG);
		c.scheduled_journeys[0].cancelledAtSec = 15; // 15000 ms - halfway through the coast
		const r = compactRoute(c)!;
		expect(r.e).toBe(15000);
		const last = r.p[r.p.length - 1];
		expect(last.t).toBe(15000);
		// Halfway through the coast is a quarter turn along the arc, still at 1 AU.
		expect(Math.hypot(last.x, last.y)).toBeCloseTo(1, 3);
		expect(Math.atan2(last.y, last.x)).toBeCloseTo(Math.PI / 4, 2);
		// ...and nothing from the abandoned brake segment survives.
		expect(r.p.some((n) => n.t > 15000)).toBe(false);
	});

	it('returns null rather than a degenerate line for a construct going nowhere', () => {
		expect(compactRoute({ kind: 'construct' })).toBeNull();
		expect(compactRoute(ship([]))).toBeNull();
	});

	it('falls back to the segment states only when a segment has no path at all', () => {
		const bare = ship([seg('Accel', 0, 1000, [], { from: { r: { x: 2, y: 0 } }, to: { r: { x: 3, y: 0 } } })]);
		const r = compactRoute(bare)!;
		expect(r.p[0]).toMatchObject({ x: 2, y: 0 });
		expect(r.p[r.p.length - 1]).toMatchObject({ x: 3, y: 0 });
	});
});

describe('routeOf reads either source, so GM and player draw the same course (R11)', () => {
	it('prefers the published compact route, and falls back to the journeys', () => {
		const gm = ship(ARC_LEG);
		const published = compactRoute(gm)!;
		const player: any = { kind: 'construct', route: published }; // journeys stripped
		expect(routeOf(player)).toEqual(published);
		expect(routeOf(gm)).toEqual(published);
	});

	it('knows when a ship is under way', () => {
		const gm = ship(ARC_LEG);
		expect(isUnderWay(gm, -1)).toBe(false);
		expect(isUnderWay(gm, 15000)).toBe(true);
		expect(isUnderWay(gm, 30001)).toBe(false);
	});
});

// THE PLUMBING. This is the test that was missing for the plume, and its absence let a green suite
// coexist with a broken feature for weeks.
//
// G51 CHANGED THE ROAD, NOT THE DESTINATION. The route used to ride the campaign snapshot; it now
// travels on SYNC_FLIGHT, because a field that changed every tick inside a multi-megabyte document
// is what stopped `sendIfChanged` deduping it. "What the player receives" is therefore the campaign
// snapshot WITH the flight update applied - what the catalogue actually does - and the property
// guarded here is word for word the one that was guarded before.
describe('the route reaches the player', () => {
	const mapWith = (construct: any) => ({
		id: 'map', name: 'Map',
		systems: [{ id: 'sys', name: 'Sys', system: { nodes: [
			{ id: 'star', name: 'Star', kind: 'body', roleHint: 'star' }, construct
		] } }]
	}) as any;
	const playerNode = (map: any, atMs = 1) => {
		const snap: any = computePlayerStarmapSnapshot(map);
		const merged: any = applyFlightUpdate(snap, buildFlightUpdate(map, atMs));   // the second half of the wire
		return merged.systems[0].system.nodes.find((n: any) => n.id === 'ship');
	};

	it('crosses to the player, and draws the same course the GM sees', () => {
		const gm = ship(ARC_LEG);
		const player = playerNode(mapWith(gm));
		expect(player.route).toBeDefined();
		expect(routeOf(player)).toEqual(routeOf(gm));
	});

	it('still strips the journeys and the GM\'s DRAFT plan', () => {
		const player = playerNode(mapWith(ship(ARC_LEG, { draft_transit_plan: [{ secret: 'not yet committed' }] })));
		expect(player.scheduled_journeys).toBeUndefined();
		expect(player.draft_transit_plan).toBeUndefined();
	});

	it('attaches nothing to a construct that is not going anywhere', () => {
		const player = playerNode(mapWith({ id: 'ship', name: 'Ship', kind: 'construct' }));
		expect(player.route).toBeUndefined();
	});
});

// The route as a TIME-to-position function (routeStateAt) - the position half of the line, used to
// place a ship on a followed player view. The contract that matters: it agrees with the drawn curve
// by construction, and it answers null outside its window so the caller falls back to the stamped
// truth (a scrubbing player must NOT see traffic replayed against their own clock).
describe('routeStateAt places the ship on its own drawn line', () => {
	const route = () => compactRoute(ship(ARC_LEG))!;

	it('is null outside the window - before departure, after arrival, and with no route', () => {
		expect(routeStateAt(route(), -1)).toBeNull();
		expect(routeStateAt(route(), 30001)).toBeNull();
		expect(routeStateAt(null, 15000)).toBeNull();
	});

	it('lands exactly on the knots at their own times', () => {
		const r = route();
		const first = routeStateAt(r, r.p[0].t)!;
		const last = routeStateAt(r, r.p[r.p.length - 1].t)!;
		expect(Math.hypot(first.x - r.p[0].x, first.y - r.p[0].y)).toBeLessThan(1e-12);
		expect(Math.hypot(last.x - r.p[r.p.length - 1].x, last.y - r.p[r.p.length - 1].y)).toBeLessThan(1e-12);
	});

	it('stays on the flown arc mid-span, and progresses monotonically along it', () => {
		const r = route();
		let prevAngle = -Infinity;
		for (const t of [1000, 8000, 15000, 22000, 29000]) {
			const p = routeStateAt(r, t)!;
			// On the unit arc to within the fit tolerance...
			expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 2);
			// ...and always further along it than the earlier sample.
			const a = Math.atan2(p.y, p.x);
			expect(a).toBeGreaterThan(prevAngle);
			prevAngle = a;
		}
	});
});
