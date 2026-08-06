// P3c: the route a player actually receives. Written the way shipBurnPlayer.spec.ts ended up -
// covering the PLUMBING as well as the unit, because that suite stayed green while a player's ship
// showed no plume: every test exercised the maths in isolation and none asserted that the snapshot a
// player is SENT carries the data.
import { describe, it, expect } from 'vitest';
import { compactRoute, routeOf, isUnderWay, routeHalfExtentAU } from './shipRoute';
import { computePlayerStarmapSnapshot } from '$lib/system/utils';

const seg = (type: string, startTime: number, endTime: number, from: number[], to: number[]) => ({
	type, startTime, endTime,
	startState: { r: { x: from[0], y: from[1], z: from[2] }, v: { x: 0, y: 0, z: 0 } },
	endState: { r: { x: to[0], y: to[1], z: to[2] }, v: { x: 0, y: 0, z: 0 } }
});
const ship = (segments: any[], extra: any = {}) =>
	({ kind: 'construct', id: 'ship', name: 'Ship', scheduled_journeys: [{ plans: [{ segments }] }], ...extra });

const LEG = [
	seg('Accel', 0, 10000, [0, 0, 0], [1, 0, 0]),
	seg('Coast', 10000, 20000, [1, 0, 0], [4, 1, 0]),
	seg('Brake', 20000, 30000, [4, 1, 0], [5, 1, 0])
];

describe('compactRoute', () => {
	it('reduces a plan to its segment boundaries, in order, without duplicates', () => {
		const r = compactRoute(ship(LEG))!;
		expect(r.s).toBe(0);
		expect(r.e).toBe(30000);
		expect(r.p.map((n) => n.t)).toEqual([0, 10000, 20000, 30000]); // 4 points for 3 segments
		expect(r.p[0]).toMatchObject({ x: 0, y: 0, z: 0 });
		expect(r.p[3]).toMatchObject({ x: 5, y: 1, z: 0 });
	});

	it('is SMALL - the whole point of publishing it at all', () => {
		// A construct in transit rewrites the broadcast snapshot ~2x/second, so this rides the
		// hottest path in the app. A realistic plan must stay a handful of points.
		const r = compactRoute(ship(LEG))!;
		expect(r.p.length).toBeLessThanOrEqual(8);
		expect(JSON.stringify(r).length).toBeLessThan(400);
	});

	it('carries no path arrays, drafts or destinations beyond the geometry', () => {
		const r = compactRoute(ship(LEG))!;
		expect(Object.keys(r).sort()).toEqual(['e', 'p', 's']);
		expect(Object.keys(r.p[0]).sort()).toEqual(['t', 'x', 'y', 'z']);
	});

	it('drops a cancelled journey entirely', () => {
		const c = ship(LEG);
		c.scheduled_journeys[0].status = 'cancelled';
		expect(compactRoute(c)).toBeNull();
	});

	it('truncates a journey cancelled MID-FLIGHT where the ship actually stopped', () => {
		const c = ship(LEG);
		c.scheduled_journeys[0].cancelledAtSec = 15; // 15000 ms - halfway through the coast
		const r = compactRoute(c)!;
		expect(r.e).toBe(15000);
		const last = r.p[r.p.length - 1];
		expect(last.t).toBe(15000);
		expect(last.x).toBeCloseTo(2.5, 9); // halfway from (1,0,0) to (4,1,0)
		expect(last.y).toBeCloseTo(0.5, 9);
		// ...and nothing from the abandoned brake segment survives.
		expect(r.p.some((n) => n.t > 15000)).toBe(false);
	});

	it('returns null rather than a degenerate line for a construct going nowhere', () => {
		expect(compactRoute({ kind: 'construct' })).toBeNull();
		expect(compactRoute(ship([]))).toBeNull();
	});
});

describe('routeOf reads either source, so GM and player draw the same course (R11)', () => {
	it('prefers the published compact route, and falls back to the journeys', () => {
		const gm = ship(LEG);
		const published = compactRoute(gm)!;
		const player: any = { kind: 'construct', route: published }; // journeys stripped
		expect(routeOf(player)).toEqual(published);
		expect(routeOf(gm)).toEqual(published);
	});

	it('knows when a ship is under way', () => {
		const gm = ship(LEG);
		expect(isUnderWay(gm, -1)).toBe(false);
		expect(isUnderWay(gm, 15000)).toBe(true);
		expect(isUnderWay(gm, 30001)).toBe(false);
	});
});

describe('routeHalfExtentAU - the construct ladder\'s in-transit rung', () => {
	it('measures the route, not the distance from the origin', () => {
		expect(routeHalfExtentAU(compactRoute(ship(LEG)))).toBeCloseTo(2.5, 9); // 5 AU across
		// A leg far from the star still measures its own length, not its distance out.
		const far = compactRoute(ship([seg('Accel', 0, 1000, [100, 0, 0], [101, 0, 0])]))!;
		expect(routeHalfExtentAU(far)).toBeCloseTo(0.5, 9);
	});

	it('is zero for no route, so the caller falls back to the host rung', () => {
		expect(routeHalfExtentAU(null)).toBe(0);
	});
});

// THE PLUMBING. This is the test that was missing for the plume, and its absence let a green suite
// coexist with a broken feature for weeks.
describe('the route reaches the player', () => {
	const mapWith = (construct: any) => ({
		id: 'map', name: 'Map',
		systems: [{ id: 'sys', name: 'Sys', system: { nodes: [
			{ id: 'star', name: 'Star', kind: 'body', roleHint: 'star' }, construct
		] } }]
	}) as any;
	const playerNode = (map: any) =>
		(computePlayerStarmapSnapshot(map) as any).systems[0].system.nodes.find((n: any) => n.id === 'ship');

	it('crosses to the player, and draws the same course the GM sees', () => {
		const gm = ship(LEG);
		const player = playerNode(mapWith(gm));
		expect(player.route).toBeDefined();
		expect(routeOf(player)).toEqual(routeOf(gm));
	});

	it('still strips the journeys and the GM\'s DRAFT plan', () => {
		const player = playerNode(mapWith(ship(LEG, { draft_transit_plan: [{ secret: 'not yet committed' }] })));
		expect(player.scheduled_journeys).toBeUndefined();
		expect(player.draft_transit_plan).toBeUndefined();
	});

	it('attaches nothing to a construct that is not going anywhere', () => {
		const player = playerNode(mapWith({ id: 'ship', name: 'Ship', kind: 'construct' }));
		expect(player.route).toBeUndefined();
	});
});
