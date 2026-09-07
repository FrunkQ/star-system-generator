// R-16: A PASTED CLIP CARRIES ITS CREDIT AS AN ATTRIBUTION, NOT ONLY A TAG.
//
// The owner: "on cut and paste are we pushing through attributions with it to store on the map they
// create? If not we need to engineer that in."
//
// `origin/hub` on the pasted root is a BREADCRUMB - it says which body came from where. A credit is
// a different thing: it says whose work this is, it lives on the CAMPAIGN because nodes get renamed
// and deleted, and it is printed in the file people actually read.
//
// GATE DISCIPLINE (PHY-34): absolute anchors - the literal creator name, the literal section
// heading the hub reads, and the ABSENCE of an entry rather than an empty one.
import { describe, it, expect } from 'vitest';
import { parseHubClip, insertClip, addContentCredit } from './hubClip';
import { buildAttributionsFile } from './attributions';
import { plainSaveJson } from './bundle';
import { classifySaveFile } from './classify';
import { strToU8 } from 'fflate';
import type { System } from '$lib/types';

function clipText(source: any): string {
	return JSON.stringify({
		sseClip: 1,
		source,
		root: 'src-star',
		nodes: [
			{ id: 'src-star', parentId: null, kind: 'body', roleHint: 'star', name: 'Sol', massKg: 1.989e30 },
			{ id: 'src-planet', parentId: 'src-star', kind: 'body', roleHint: 'planet', name: 'Earth', massKg: 5.97e24 }
		]
	});
}

const FULL = {
	site: 'StarSystemX Explorers',
	url: 'https://hub.test/s/local-neighbourhood',
	title: 'Local Neighbourhood',
	creator: 'frunk'
};

function hostSystem(): System {
	return {
		id: 'sys-target', name: 'Target',
		nodes: [{ id: 'target-star', parentId: null, kind: 'body', roleHint: 'star', name: 'Alpha', massKg: 1.9e30 } as any]
	} as unknown as System;
}

function paste(map: any, source: any, into?: System) {
	// The system is threaded through, because two pastes into the SAME campaign is the real case -
	// and it is the one that mints different ids the second time round.
	const sys = into ?? hostSystem();
	const p = parseHubClip(clipText(source));
	if (!p.ok) throw new Error(p.problem);
	const r = insertClip(sys, p.clip, 'target-star', 0);
	if (!r.ok) throw new Error(r.problem);
	return { map: addContentCredit(map, r.credit), result: r, sys };
}

describe('R-16: the credit lands on the CAMPAIGN', () => {
	it('records who made the map the content came from', () => {
		const { map, result } = paste({ id: 'm', name: 'Mine' }, FULL);
		expect(map.contentCredits.length).toBe(1);
		const c = map.contentCredits[0];
		expect(c.creator).toBe('frunk'); // ABSOLUTE
		expect(c.title).toBe('Local Neighbourhood');
		expect(c.url).toBe('https://hub.test/s/local-neighbourhood');
		expect(c.site).toBe('StarSystemX Explorers');
		// The ids it covers are the ones as MINTED on the way in, not the source map's.
		expect(c.nodeIds.length).toBe(2);
		expect(c.nodeIds).toContain(result.rootId);
		expect(c.nodeIds.some((i: string) => i.startsWith('src-'))).toBe(false);
		expect(typeof c.pastedAt).toBe('string');
		expect(Number.isFinite(Date.parse(c.pastedAt)), 'pastedAt must be a real date').toBe(true);
	});

	it('KEEPS the origin/hub tag as well - they are different statements', () => {
		const { sys } = paste({ id: 'm', name: 'Mine' }, FULL);
		const root = sys.nodes.find((n: any) => n.name === 'Sol') as any;
		expect((root.tags ?? []).some((t: any) => t.ns === 'origin' && t.key === 'hub')).toBe(true);
	});

	it('merges a second paste from the SAME map into one credit', () => {
		// Six systems pasted from one map owes one credit six bodies wide, not six identical rows.
		let map: any = { id: 'm', name: 'Mine' };
		const sys = hostSystem();
		map = paste(map, FULL, sys).map;
		map = paste(map, FULL, sys).map;
		expect(map.contentCredits.length).toBe(1);
		expect(map.contentCredits[0].nodeIds.length).toBe(4);
		expect(new Set(map.contentCredits[0].nodeIds).size, 'four distinct bodies').toBe(4);
	});

	it('keeps a DIFFERENT map as its own credit', () => {
		let map: any = { id: 'm', name: 'Mine' };
		const sys = hostSystem();
		map = paste(map, FULL, sys).map;
		map = paste(map, { ...FULL, title: 'Far Reach', url: 'https://hub.test/s/far-reach', creator: 'someone-else' }, sys).map;
		expect(map.contentCredits.length).toBe(2);
		expect(map.contentCredits.map((c: any) => c.creator).sort()).toEqual(['frunk', 'someone-else']);
	});

	it('adds NOTHING when the clip named nobody and nothing', () => {
		// A row with no title, no creator and no link credits no one. Absent, not empty.
		const { map } = paste({ id: 'm', name: 'Mine' }, { site: 'Somewhere' });
		expect('contentCredits' in map).toBe(false);
	});
});

describe('R-16 addendum: the deep link and the lineage (hub 0.12.0)', () => {
	const DEEP = { ...FULL, url: 'https://hub.test/s/local-neighbourhood#node=earth' };

	it('stores the deep link WHOLE, fragment included', () => {
		// The fragment is what opens the hub's page on the right row. Trimming it would leave a
		// link to the map and lose which object it was.
		const { map } = paste({ id: 'm', name: 'Mine' }, DEEP);
		expect(map.contentCredits[0].url).toBe('https://hub.test/s/local-neighbourhood#node=earth');
	});

	it('still MERGES two objects from the same map, despite different deep links', () => {
		// This is the interaction the deep link created: matching on the whole url would file six
		// pastes from one map as six near-identical rows, which is what the merge exists to stop.
		let map: any = { id: 'm', name: 'Mine' };
		const sys = hostSystem();
		map = paste(map, DEEP, sys).map;
		map = paste(map, { ...DEEP, url: 'https://hub.test/s/local-neighbourhood#node=mars' }, sys).map;
		expect(map.contentCredits.length).toBe(1);
		expect(map.contentCredits[0].nodeIds.length).toBe(4);
	});

	it('records the chain AS RECEIVED, deepest first', () => {
		const chain = [
			{ url: 'https://hub.test/s/alpha#node=earth', title: 'Alpha', creator: 'alice' },
			{ url: 'https://hub.test/s/beta#node=e', title: 'Beta', creator: 'bob' }
		];
		const { map } = paste({ id: 'm', name: 'Mine' }, { ...DEEP, title: 'Gamma', creator: 'carol', chain });
		expect(map.contentCredits[0].chain).toEqual(chain);
	});

	it('does NOT merge two pastes whose lineages differ', () => {
		// One object native to a map and another that passed through two maps before it have
		// different histories. Merging them would claim a lineage for content that has none.
		let map: any = { id: 'm', name: 'Mine' };
		const sys = hostSystem();
		map = paste(map, DEEP, sys).map;
		map = paste(map, { ...DEEP, chain: [{ url: 'https://hub.test/s/alpha', title: 'Alpha', creator: 'alice' }] }, sys).map;
		expect(map.contentCredits.length).toBe(2);
	});

	it('omits the chain entirely when there is none', () => {
		const { map } = paste({ id: 'm', name: 'Mine' }, FULL);
		expect('chain' in map.contentCredits[0]).toBe(false);
	});

	it('prints the lineage as one sentence, in the hub’s order', () => {
		const md = buildAttributionsFile({
			name: 'Mine', systems: [],
			contentCredits: [{
				title: 'Gamma', creator: 'carol', url: 'https://hub.test/s/gamma#node=e2',
				pastedAt: '2026-09-04T10:00:00.000Z', nodeIds: ['hub-x'],
				chain: [
					{ url: 'https://hub.test/s/alpha#node=earth', title: 'Alpha', creator: 'alice' },
					{ url: 'https://hub.test/s/beta#node=e', title: 'Beta', creator: 'bob' }
				]
			}]
		})!;
		// ABSOLUTE: the exact sentence the hub asked for.
		expect(md).toContain('Lineage: from Alpha by alice, via Beta by bob, via Gamma by carol');
	});

	it('names a hop with no cartographer rather than dropping it', () => {
		const md = buildAttributionsFile({
			name: 'Mine', systems: [],
			contentCredits: [{
				title: 'Gamma', creator: 'carol', pastedAt: '2026-09-04T10:00:00.000Z', nodeIds: [],
				chain: [{ title: 'Alpha' }]
			}]
		})!;
		expect(md).toContain('Lineage: from Alpha, via Gamma by carol');
	});

	it('prints no lineage line when nothing came before', () => {
		const md = buildAttributionsFile({
			name: 'Mine', systems: [],
			contentCredits: [{ title: 'Solo', creator: 'dee', pastedAt: '2026-09-04T10:00:00.000Z', nodeIds: [] }]
		})!;
		expect(md).not.toContain('Lineage:');
	});
});

describe('R-16: it is printed where people read it', () => {
	const withCredit = (creator?: string) => ({
		name: 'Mine',
		systems: [],
		contentCredits: [{
			title: 'Local Neighbourhood', creator, url: 'https://hub.test/s/local-neighbourhood',
			site: 'StarSystemX Explorers', pastedAt: '2026-09-04T10:00:00.000Z', nodeIds: ['hub-sol', 'hub-earth']
		}]
	});

	it('writes the section the hub reads, with the cartographer named', () => {
		const md = buildAttributionsFile(withCredit('frunk'))!;
		expect(md).toContain('## Content from other cartographers'); // ABSOLUTE: the agreed heading
		expect(md).toContain('Local Neighbourhood');
		expect(md).toContain('Cartographer: frunk');
		expect(md).toContain('https://hub.test/s/local-neighbourhood');
		expect(md).toContain('2 objects in this campaign came from it.');
	});

	it('says so plainly when the cartographer was not recorded', () => {
		// A clip from a hub older than 0.11.0 carries the map but not the person.
		const md = buildAttributionsFile(withCredit(undefined))!;
		expect(md).toContain('Cartographer not recorded');
		expect(md).not.toContain('Cartographer: undefined');
	});

	it('writes the file for a campaign with pasted content and NO uploaded art', () => {
		// The old rule was "no assets, no file", which would have swallowed the credit entirely.
		const md = buildAttributionsFile(withCredit('frunk'));
		expect(md).toBeTruthy();
		expect(md!).toContain('Content from other cartographers');
	});

	it('writes no section when nothing was pasted', () => {
		const md = buildAttributionsFile({ name: 'Mine', systems: [], playerAssets: [
			{ id: 'a', name: 'Art', dataUrl: 'assets/images/player/a.png', credit: 'Someone' }
		] });
		expect(md).toBeTruthy();
		expect(md!).not.toContain('Content from other cartographers');
	});
});

describe('R-16: it survives save and load like any campaign block', () => {
	it('round-trips through a plain .json save', () => {
		const { map } = paste({ id: 'm', name: 'Mine', routes: [], systems: [] }, FULL);
		const back = classifySaveFile(strToU8(plainSaveJson(map)));
		expect(back.kind).toBe('starmap');
		expect(back.doc.contentCredits.length).toBe(1);
		expect(back.doc.contentCredits[0].creator).toBe('frunk');
		expect(back.doc.contentCredits[0].nodeIds.length).toBe(2);
	});
});
