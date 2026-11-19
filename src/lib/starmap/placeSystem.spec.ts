// ONE FUNCTION PUTS A SYSTEM ON THE MAP (R-18, Stream AA job 3) - and what it must keep doing for
// every door that calls it: the wizard's (examples, files, and now Explorers systems) and the
// starmap's "paste as a new system".
//
// GATE DISCIPLINE (PHY-34): ids, clock and credit rows are literal, not computed from the helpers the
// function itself calls.
import { describe, it, expect } from 'vitest';
import { placeSystemOnMap } from './placeSystem';
import { creditDownloadedSystem } from '$lib/io/hubClip';
import type { ContentCredit, Starmap, System } from '$lib/types';

const system = (id: string, name = 'Sol'): System =>
	({ id, name, seed: id, epochT0: 0, nodes: [{ id: `${id}-star`, name, kind: 'body', roleHint: 'star', parentId: null }] }) as unknown as System;

const map = (systemIds: string[] = []): Starmap =>
	({
		id: 'm', name: 'Map', distanceUnit: 'ly', unitIsPrefix: false, routes: [],
		temporal: { displayTimeSec: '1234567' },
		systems: systemIds.map((id) => ({ id, name: id, position: { x: 0, y: 0 }, system: system(id) }))
	}) as unknown as Starmap;

const credit = (nodeIds: string[], url = 'https://explorers.starsystemx.com/s/tau-ceti'): ContentCredit => ({
	title: 'Tau Ceti', creator: 'Frunk', url, pastedAt: '2026-09-11T12:00:00.000Z', nodeIds
});

describe('a system is placed with its own id, or the first free spelling of it (A107)', () => {
	it('keeps a free id and takes -2 when it is taken', () => {
		expect(placeSystemOnMap(map(), system('solar-system'), { x: 1, y: 2 }).id).toBe('solar-system');
		const second = placeSystemOnMap(map(['solar-system']), system('solar-system'), { x: 1, y: 2 });
		expect(second.id).toBe('solar-system-2');
		const node = second.map.systems[1];
		expect([node.id, node.system.id], 'outer and inner id move together').toEqual(['solar-system-2', 'solar-system-2']);
	});
});

describe('the node is stamped as both old doors stamped it', () => {
	it('carries the position, the system name and the campaign display clock', () => {
		const { map: next } = placeSystemOnMap(map(), system('tau', 'Tau Ceti'), { x: 5, y: -3, z: 2 });
		expect(next.systems[0]).toMatchObject({ id: 'tau', name: 'Tau Ceti', position: { x: 5, y: -3, z: 2 }, time: { displayTimeSec: '1234567' } });
	});

	it('returns a new map and leaves the one it was given alone', () => {
		const before = map(['a']);
		const { map: next } = placeSystemOnMap(before, system('b'), { x: 0, y: 0 });
		expect(next).not.toBe(before);
		expect(before.systems.map((s) => s.id)).toEqual(['a']);
		expect(next.systems.map((s) => s.id)).toEqual(['a', 'b']);
	});
});

describe('credits land on the campaign (R-16), whichever door placed the system', () => {
	it('adds one row per source, ignores a missing credit, and merges a second placement from the same map', () => {
		const first = placeSystemOnMap(map(), system('tau'), { x: 0, y: 0 }, [credit(['tau-star']), undefined]).map;
		expect((first as any).contentCredits).toHaveLength(1);
		const second = placeSystemOnMap(first, system('tau'), { x: 1, y: 1 }, [credit(['tau-star'], 'https://explorers.starsystemx.com/s/tau-ceti#node=x')]).map;
		const rows = (second as any).contentCredits as ContentCredit[];
		expect(rows, 'one map, one row').toHaveLength(1);
		expect(rows[0].creator).toBe('Frunk');
	});
});

describe('a system that arrived by DOWNLOAD earns what a pasted one earns (R-18)', () => {
	const downloaded = () => ({
		nodes: [
			{ id: 'bary', kind: 'barycenter', parentId: null },
			{ id: 'a', kind: 'body', roleHint: 'star', parentId: 'bary' },
			{ id: 'b', kind: 'body', roleHint: 'star', parentId: 'bary' },
			{ id: 'p', kind: 'body', roleHint: 'planet', parentId: 'a' }
		] as any[]
	});
	const source = { url: 'https://explorers.starsystemx.com/s/alpha-centauri', title: 'Alpha Centauri', creator: 'Frunk' };

	it('tags the top node with where it came from, and only the top node', () => {
		const sys = downloaded();
		creditDownloadedSystem(sys, source);
		const tagged = sys.nodes.filter((n) => (n.tags ?? []).some((t: any) => t.ns === 'origin' && t.key === 'hub'));
		expect(tagged.map((n) => n.id)).toEqual(['bary']);
		expect(tagged[0].tags[0].value).toBe('https://explorers.starsystemx.com/s/alpha-centauri');
	});

	it('returns a credit covering every node, naming the map and its creator', () => {
		const c = creditDownloadedSystem(downloaded(), source)!;
		expect({ title: c.title, creator: c.creator, url: c.url, nodeIds: c.nodeIds }).toEqual({
			title: 'Alpha Centauri', creator: 'Frunk', url: 'https://explorers.starsystemx.com/s/alpha-centauri', nodeIds: ['bary', 'a', 'b', 'p']
		});
	});

	it('credits nobody when the list named nobody and nothing, and tags nothing without a page', () => {
		const sys = downloaded();
		expect(creditDownloadedSystem(sys, {})).toBeUndefined();
		expect(sys.nodes.some((n) => n.tags)).toBe(false);
	});
});
