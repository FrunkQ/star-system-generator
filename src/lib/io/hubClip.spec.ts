// R-14: the paste target for hub clips.
//
// THE OWNER'S ONE HARD REQUIREMENT: "it must be spec'd to receive hierarchies rather than one
// object." So the first gate below is the one that matters - a three-deep clip goes in whole, with
// every parent link intact - and it is written so that an implementation taking `nodes[0]` and
// dropping the rest goes red rather than looking like it worked.
//
// GATE DISCIPLINE (PHY-34): absolute anchors. Literal node counts, literal parent ids, the literal
// integer 1 for the clip format - not "the same length as the input", which a broken insert that
// happened to push the right number of wrong things would still satisfy.
import { describe, it, expect } from 'vitest';
import { parseHubClip, insertClip, looksLikeHubClip, CLIP_FORMAT } from './hubClip';
import type { System } from '$lib/types';

/** Sol-ish: a star with a planet, the planet with a moon. Three deep, which is the whole point. */
function clipText(over: Record<string, unknown> = {}): string {
	return JSON.stringify({
		sseClip: 1,
		source: { site: 'StarSystemX Explorers', url: 'https://hub.test/s/local-neighbourhood', title: 'Local Neighbourhood' },
		root: 'src-star',
		nodes: [
			{ id: 'src-star', parentId: null, kind: 'body', roleHint: 'star', name: 'Sol', massKg: 1.989e30 },
			{
				id: 'src-planet', parentId: 'src-star', kind: 'body', roleHint: 'planet', name: 'Earth', massKg: 5.97e24,
				orbit: { hostId: 'src-star', hostMu: 1.327e20, t0: 0, elements: { a_AU: 1, e: 0.016, i_deg: 0, raan_deg: 0, argp_deg: 0, M0_deg: 0 } }
			},
			{
				id: 'src-moon', parentId: 'src-planet', kind: 'body', roleHint: 'moon', name: 'Luna', massKg: 7.34e22,
				orbit: { hostId: 'src-planet', hostMu: 3.986e14, t0: 0, elements: { a_AU: 0.00257, e: 0.055, i_deg: 5.1, raan_deg: 0, argp_deg: 0, M0_deg: 0 } }
			}
		],
		...over
	});
}

/** A receiving campaign with a star to paste under. */
function hostSystem(): System {
	return {
		id: 'sys-target',
		name: 'Target',
		nodes: [
			{ id: 'target-star', parentId: null, kind: 'body', roleHint: 'star', name: 'Alpha', massKg: 1.9e30 } as any
		]
	} as unknown as System;
}

describe('R-14: a clip is read, or refused with a reason', () => {
	it('reads the hub format', () => {
		const p = parseHubClip(clipText());
		expect(p.ok).toBe(true);
		if (!p.ok) return;
		expect(p.clip.sseClip).toBe(1); // ABSOLUTE: the number the hub pins
		expect(CLIP_FORMAT).toBe(1);
		expect(p.clip.root).toBe('src-star');
		expect(p.clip.nodes.length).toBe(3);
	});

	it('says a NEWER hub made it, rather than "invalid"', () => {
		// The useful answer is "update the app", not "the copy button is broken".
		const p = parseHubClip(clipText({ sseClip: 2 }));
		expect(p.ok).toBe(false);
		if (p.ok) return;
		expect(p.problem).toMatch(/newer version of the map library/i);
		expect(p.problem).toContain('2');
	});

	it('refuses what is not a clip, without pretending to know what it is', () => {
		for (const [text, pattern] of [
			['not json at all', /not JSON/i],
			['{"hello":"world"}', /no clip marker/i],
			['[1,2,3]', /not a copied object/i],
			[JSON.stringify({ sseClip: 1, root: 'a', nodes: [] }), /empty/i]
		] as [string, RegExp][]) {
			const p = parseHubClip(text);
			expect(p.ok, text).toBe(false);
			if (!p.ok) expect(p.problem).toMatch(pattern);
		}
	});

	it('refuses a branch with a piece missing, naming the piece', () => {
		const p = parseHubClip(clipText({
			nodes: [
				{ id: 'src-star', parentId: null, kind: 'body', name: 'Sol' },
				{ id: 'src-moon', parentId: 'src-planet', kind: 'body', name: 'Luna' } // parent not copied
			]
		}));
		expect(p.ok).toBe(false);
		if (!p.ok) expect(p.problem).toContain('Luna');
	});

	it('refuses a loop', () => {
		const p = parseHubClip(clipText({
			root: 'a',
			nodes: [
				{ id: 'a', parentId: 'b', kind: 'body', name: 'A' },
				{ id: 'b', parentId: 'a', kind: 'body', name: 'B' }
			]
		}));
		expect(p.ok).toBe(false);
		if (!p.ok) expect(p.problem).toMatch(/loop/i);
	});

	it('ignores ordinary text quietly, so a paste handler need not shout at every paste', () => {
		expect(looksLikeHubClip('some notes a GM copied')).toBe(false);
		expect(looksLikeHubClip(clipText())).toBe(true);
	});
});

describe('R-14: EVERY object type, not just bodies', () => {
	// A construct is a CelestialBody with `kind: 'construct'` - ships, stations, belts, rings and
	// the megastructures all live there - so the insert must be kind-agnostic. It is; what differs
	// is the ROOT's re-home, because G64's reparentBody takes bodies only.
	function mixedClip(): string {
		return JSON.stringify({
			sseClip: 1,
			source: { url: 'https://hub.test/s/yard' },
			root: 'src-station',
			nodes: [
				{ id: 'src-station', parentId: null, kind: 'construct', roleHint: 'construct', name: 'High Yard', constructChrome: true,
				  orbit: { hostId: 'src-old', hostMu: 3.9e14, t0: 0, elements: { a_AU: 0.001, e: 0, i_deg: 0, raan_deg: 0, argp_deg: 0, M0_deg: 0 } } },
				{ id: 'src-ring', parentId: 'src-station', kind: 'construct', roleHint: 'ring', name: 'Hab Ring' },
				{ id: 'src-mega', parentId: 'src-station', kind: 'construct', roleHint: 'construct', name: 'Ringworld', artificial: true, mega: { type: 'ringworld' } },
				{ id: 'src-ship', parentId: 'src-station', kind: 'construct', roleHint: 'ship', name: 'Tender',
				  autopilot: { enabled: true, traversal: 'in-order', repeat: true, planning: 2, drive: 0.5, ignoreFuel: false, ignoreSupplies: false,
				               legs: [{ targetId: 'src-station' }, { targetId: 'src-never-copied' }], avoidPlaceIds: ['src-ring', 'src-also-never-copied'] } },
				{ id: 'src-belt', parentId: 'src-station', kind: 'body', roleHint: 'belt', name: 'Scrap Belt' }
			]
		});
	}

	it('inserts constructs, megastructures, rings, belts and ships alike', () => {
		const sys = hostSystem();
		const p = parseHubClip(mixedClip());
		expect(p.ok).toBe(true);
		if (!p.ok) return;
		const r = insertClip(sys, p.clip, 'target-star', 0);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.count).toBe(5); // ABSOLUTE: nothing was skipped for being the wrong kind
		const byName = (n: string) => sys.nodes.find((x: any) => x.name === n) as any;
		for (const n of ['High Yard', 'Hab Ring', 'Ringworld', 'Tender', 'Scrap Belt']) {
			expect(byName(n), `${n} did not arrive`).toBeTruthy();
		}
		// The kind-specific payload survives: a megastructure is still one, a ring still a ring.
		expect(byName('Ringworld').mega.type).toBe('ringworld');
		expect(byName('Hab Ring').roleHint).toBe('ring');
		expect(byName('High Yard').parentId).toBe('target-star');
	});

	it('remaps references that are NOT parentId or orbit.hostId', () => {
		// An autopilot leg and an avoid-list hold node ids. Remapping only the obvious two would
		// leave a pasted ship pointing at the source map.
		const sys = hostSystem();
		const p = parseHubClip(mixedClip());
		if (!p.ok) return;
		insertClip(sys, p.clip, 'target-star', 0);
		const ship = sys.nodes.find((n: any) => n.name === 'Tender') as any;
		const station = sys.nodes.find((n: any) => n.name === 'High Yard') as any;
		const ring = sys.nodes.find((n: any) => n.name === 'Hab Ring') as any;
		expect(ship.autopilot.legs[0].targetId).toBe(station.id);
		expect(ship.autopilot.avoidPlaceIds[0]).toBe(ring.id);
		// A reference to something that was NOT copied is left exactly as it was, not guessed at -
		// in an OBJECT property and in an ARRAY element, which are separate branches of the walk.
		expect(ship.autopilot.legs[1].targetId).toBe('src-never-copied');
		expect(ship.autopilot.avoidPlaceIds[1]).toBe('src-also-never-copied');
	});

	it('stands a pasted route down, and says so, rather than chasing ids that are not here', () => {
		const sys = hostSystem();
		const p = parseHubClip(mixedClip());
		if (!p.ok) return;
		insertClip(sys, p.clip, 'target-star', 0);
		const ship = sys.nodes.find((n: any) => n.name === 'Tender') as any;
		expect(ship.autopilot.enabled).toBe(false);
		// The SHIP is untouched - the route is what did not survive, and it is tagged, not silent.
		expect(ship.autopilot.legs.length).toBe(2);
		expect((ship.tags ?? []).some((t: any) => t.ns === 'origin' && t.key === 'hub-route-stood-down')).toBe(true);
	});

	it('leaves a construct root attached even though G64 re-homes bodies only', () => {
		// reparentBody takes `kind === 'body'`. A construct root therefore gets the plain attach:
		// parent set, host and hostMu restamped, elements kept. Pinned so the asymmetry is a
		// recorded decision rather than something nobody noticed.
		const sys = hostSystem();
		const p = parseHubClip(mixedClip());
		if (!p.ok) return;
		const r = insertClip(sys, p.clip, 'target-star', 0);
		expect(r.ok && r.mode).toBe('attached');
		const station = sys.nodes.find((n: any) => n.name === 'High Yard') as any;
		expect(station.orbit.hostId).toBe('target-star');
		expect(station.orbit.hostMu).toBeGreaterThan(0);
		expect(station.orbit.elements.a_AU).toBe(0.001); // its own shape, kept
	});
});

describe('R-14: THE WHOLE HIERARCHY goes in, or none of it', () => {
	it('inserts every level and keeps every parent link', () => {
		const sys = hostSystem();
		const p = parseHubClip(clipText());
		expect(p.ok).toBe(true);
		if (!p.ok) return;
		const r = insertClip(sys, p.clip, 'target-star', 0);
		expect(r.ok).toBe(true);
		if (!r.ok) return;

		// ABSOLUTE: three arrived, on top of the one that was there.
		expect(r.count).toBe(3);
		expect(sys.nodes.length).toBe(4);

		const byName = (n: string) => sys.nodes.find((x: any) => x.name === n) as any;
		const star = byName('Sol'), planet = byName('Earth'), moon = byName('Luna');
		expect(star && planet && moon).toBeTruthy();

		// The shape is the thing. An implementation that took nodes[0] and stopped fails here.
		expect(star.parentId).toBe('target-star');
		expect(planet.parentId).toBe(star.id);
		expect(moon.parentId).toBe(planet.id);
		expect(r.rootId).toBe(star.id);
	});

	it('re-mints every id, so one clip can be pasted twice', () => {
		const sys = hostSystem();
		const p = parseHubClip(clipText());
		if (!p.ok) return;
		insertClip(sys, p.clip, 'target-star', 0);
		insertClip(sys, p.clip, 'target-star', 0);
		expect(sys.nodes.length).toBe(7); // 1 + 3 + 3
		const ids = sys.nodes.map((n) => n.id);
		expect(new Set(ids).size, 'every id must still be unique').toBe(ids.length);
		// And no source id survived: they were only ever carried so parentId resolved inside the clip.
		expect(ids.some((i) => i.startsWith('src-'))).toBe(false);
	});

	it('remaps the orbit host too, not just parentId', () => {
		// A descendant whose `orbit.hostId` still named the SOURCE map's id would be an orbit round
		// nothing - drawn from a host the receiving campaign has never heard of.
		const sys = hostSystem();
		const p = parseHubClip(clipText());
		if (!p.ok) return;
		insertClip(sys, p.clip, 'target-star', 0);
		const planet = sys.nodes.find((n: any) => n.name === 'Earth') as any;
		const moon = sys.nodes.find((n: any) => n.name === 'Luna') as any;
		expect(moon.orbit.hostId).toBe(planet.id);
		expect(moon.orbit.hostId.startsWith('src-')).toBe(false);
	});

	it('leaves the orbits INSIDE the clip alone', () => {
		// Requirement 3: a moon's orbit about its planet came from a real save and is internally
		// consistent. Only the root's host changed.
		const sys = hostSystem();
		const p = parseHubClip(clipText());
		if (!p.ok) return;
		insertClip(sys, p.clip, 'target-star', 0);
		const moon = sys.nodes.find((n: any) => n.name === 'Luna') as any;
		expect(moon.orbit.elements.a_AU).toBe(0.00257);
		expect(moon.orbit.elements.e).toBe(0.055);
		expect(moon.orbit.elements.i_deg).toBe(5.1);
		expect(moon.orbit.hostMu).toBe(3.986e14); // its host's mass did not change, so nor did this
	});

	it('carries the credit onto the pasted root', () => {
		const sys = hostSystem();
		const p = parseHubClip(clipText());
		if (!p.ok) return;
		insertClip(sys, p.clip, 'target-star', 0);
		const star = sys.nodes.find((n: any) => n.name === 'Sol') as any;
		const tag = (star.tags ?? []).find((t: any) => t.ns === 'origin' && t.key === 'hub');
		expect(tag, 'the pasted root must say whose map it came from').toBeTruthy();
		expect(tag.value).toBe('https://hub.test/s/local-neighbourhood');
		// And only the ROOT is credited - tagging every moon would be noise.
		const moon = sys.nodes.find((n: any) => n.name === 'Luna') as any;
		expect((moon.tags ?? []).some((t: any) => t?.ns === 'origin' && t?.key === 'hub')).toBe(false);
	});

	it('pastes without a source url rather than refusing', () => {
		const sys = hostSystem();
		const p = parseHubClip(clipText({ source: undefined }));
		if (!p.ok) return;
		const r = insertClip(sys, p.clip, 'target-star', 0);
		expect(r.ok).toBe(true);
		expect(sys.nodes.length).toBe(4);
	});

	it('refuses only when the host is gone, and touches nothing when it does', () => {
		const sys = hostSystem();
		const before = sys.nodes.length;
		const p = parseHubClip(clipText());
		if (!p.ok) return;
		const r = insertClip(sys, p.clip, 'no-such-host', 0);
		expect(r.ok).toBe(false);
		expect(sys.nodes.length, 'a refused paste must leave the campaign alone').toBe(before);
	});

	it('does not rely on the documented parents-first order', () => {
		// The hub documents depth-first, parents first, and this reads that happily - but a producer
		// bug about ordering must not silently mis-parent somebody's moons.
		const forward = JSON.parse(clipText());
		const reversed = { ...forward, nodes: [...forward.nodes].reverse() };
		const p = parseHubClip(JSON.stringify(reversed));
		expect(p.ok).toBe(true);
		if (!p.ok) return;
		const sys = hostSystem();
		const r = insertClip(sys, p.clip, 'target-star', 0);
		expect(r.ok).toBe(true);
		const byName = (n: string) => sys.nodes.find((x: any) => x.name === n) as any;
		expect(byName('Luna').parentId).toBe(byName('Earth').id);
		expect(byName('Earth').parentId).toBe(byName('Sol').id);
		expect(byName('Sol').parentId).toBe('target-star');
	});

	it('STEERS rather than stopping on a physically silly paste', () => {
		// Requirement 4: a heavy star pasted under a small world is allowed. The passes tag what
		// would happen; nothing here refuses it.
		const sys = hostSystem();
		sys.nodes.push({ id: 'tiny', parentId: 'target-star', kind: 'body', roleHint: 'planet', name: 'Pebble', massKg: 1e20 } as any);
		const p = parseHubClip(clipText());
		if (!p.ok) return;
		const r = insertClip(sys, p.clip, 'tiny', 0);
		expect(r.ok, 'a silly paste is allowed - it is tagged, not refused').toBe(true);
		expect(sys.nodes.find((n: any) => n.name === 'Sol')!.parentId).toBe('tiny');
	});
});
