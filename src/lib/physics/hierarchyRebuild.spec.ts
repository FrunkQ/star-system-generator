// Dissolving an auto-barycentre must not orphan whatever pointed at it.
//
// The fault this pins shipped in `Uggi_(Traveller_Example)-System.json` and was found by D9's new
// examples guard on its first run: "Hades-Cerebus Alpha Barycenter" points its `parentId` at another
// auto-barycentre that is not in the file, so `pathToRoot` dies for Cerebus Alpha and nothing
// downstream of it — distance to star, temperature range, eclipses — can be answered at all.
//
// `stripAutoBarycenters` re-parented a barycentre's two MEMBERS and then deleted every
// auto-barycentre unconditionally. Two routes to a dangling parent, both closed:
//   1. NESTED — an auto-barycentre whose parent is another auto-barycentre is nobody's member, so
//      nothing ever updated its `parentId` when the parent was deleted.
//   2. SKIPPED-BUT-DELETED — a malformed barycentre took an early `continue`, so its members were
//      never re-parented, and the unconditional filter then deleted it out from under them.
import { describe, expect, it } from 'vitest';
import { stripAutoBarycenters } from './hierarchyRebuild';
import type { System } from '../types';

const auto = (id: string, parentId: string | null, memberIds: string[]) => ({
	id, name: id, kind: 'barycenter' as const, parentId, memberIds,
	tags: [{ key: 'barycenter/auto' }],
	orbit: { hostId: parentId ?? '', hostMu: 1, t0: 0, elements: { a_AU: 1, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }
});
const body = (id: string, parentId: string | null, massKg: number) => ({
	id, name: id, kind: 'body' as const, roleHint: 'planet', parentId, massKg, radiusKm: 1000, tags: [],
	orbit: { hostId: parentId ?? '', hostMu: 1, t0: 0, elements: { a_AU: 0.01, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }
});
const sys = (nodes: any[]): System => ({ id: 's', name: 's', nodes } as any);

// Every parentId and orbit.hostId must land on a node that is still present.
const danglers = (s: System) => {
	const ids = new Set(s.nodes.map((n) => n.id));
	const out: string[] = [];
	for (const n of s.nodes) {
		if (n.parentId != null && !ids.has(n.parentId)) out.push(`${n.id}.parentId -> ${n.parentId}`);
		const h = (n as any).orbit?.hostId;
		if (h && !ids.has(h)) out.push(`${n.id}.orbit.hostId -> ${h}`);
		for (const m of (n as any).memberIds ?? []) if (!ids.has(m)) out.push(`${n.id}.memberIds -> ${m}`);
	}
	return out;
};

describe('stripAutoBarycenters', () => {
	// THE UGGI SHAPE, exactly: `inner`'s parent is `outer`, but `outer` does NOT list `inner` among
	// its members — so nothing in the member-re-parenting loop ever touches `inner`, and deleting
	// `outer` leaves it pointing at nothing. (A nested barycentre that IS its parent's member happens
	// to survive the old code, which is why that variant proves nothing.)
	it('leaves no dangling parent when a nested barycentre is NOT its parent\'s member (the Uggi shape)', () => {
		const s = sys([
			body('star', null, 2e30),
			auto('outer', 'star', ['p', 'q']),
			auto('inner', 'outer', ['hades', 'alpha']),   // parent is a barycentre; not a member of it
			body('hades', 'inner', 6.8e25),
			body('alpha', 'inner', 3.7e24),
			body('p', 'outer', 1e24),
			body('q', 'outer', 2e24)
		]);
		stripAutoBarycenters(s);
		expect(danglers(s)).toEqual([]);
		// and everything can still walk to the root
		const ids = new Set(s.nodes.map((n) => n.id));
		for (const n of s.nodes) {
			let cur: any = n, hops = 0;
			while (cur?.parentId != null && hops++ < 32) cur = s.nodes.find((x) => x.id === cur.parentId);
			expect(cur, `${n.id} cannot reach a root`).toBeTruthy();
			expect(ids.has(cur.id)).toBe(true);
		}
	});

	it('does not delete a malformed barycentre out from under its members', () => {
		const s = sys([
			body('star', null, 2e30),
			auto('broken', 'star', ['only-one']),          // one member: the re-parent step skips it
			body('only-one', 'broken', 1e24)
		]);
		stripAutoBarycenters(s);
		expect(danglers(s)).toEqual([]);
		expect(s.nodes.find((n) => n.id === 'only-one')!.parentId).toBe('star');
	});

	it('drops a deleted member from a surviving MANUAL barycentre', () => {
		const s = sys([
			body('star', null, 2e30),
			{ id: 'manual', name: 'manual', kind: 'barycenter', parentId: 'star', memberIds: ['a', 'gone'], tags: [] },
			body('a', 'manual', 1e24),
			auto('gone', 'manual', ['a', 'a'])
		]);
		stripAutoBarycenters(s);
		expect(danglers(s)).toEqual([]);
	});

	it('still does its original job — members re-parented, auto-barycentres removed', () => {
		const s = sys([
			body('star', null, 2e30),
			auto('bary', 'star', ['big', 'small']),
			body('big', 'bary', 9e24),
			body('small', 'bary', 1e24)
		]);
		stripAutoBarycenters(s);
		expect(s.nodes.some((n) => n.kind === 'barycenter')).toBe(false);
		expect(s.nodes.find((n) => n.id === 'big')!.parentId).toBe('star');   // heavier goes up
		expect(s.nodes.find((n) => n.id === 'small')!.parentId).toBe('big');  // lighter orbits it
		expect(danglers(s)).toEqual([]);
	});

	it('cannot hang on a cycle of dissolved barycentres', () => {
		const s = sys([
			body('star', null, 2e30),
			auto('a', 'b', ['x', 'y']),
			auto('b', 'a', ['x', 'y']),
			body('x', 'a', 1e24),
			body('y', 'b', 1e24)
		]);
		stripAutoBarycenters(s);
		expect(danglers(s)).toEqual([]);
	});
});
