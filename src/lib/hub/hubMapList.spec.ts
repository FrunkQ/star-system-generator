// R-20 (G98, Stream AA job 1): the hub's map list, read for a panel inside the app.
//
// GATE DISCIPLINE (PHY-34): the addresses below are LITERAL. A test that built its expected URL from
// `HUB.origin` and `HUB.listPath` could not see either of them being wrong, and a wrong list address
// is a panel that says "could not reach Explorers" to everybody, forever.
//
// NEVER THE LIVE HUB. Every fetch here is a double answering with a synthesised page in the shape
// measured on 2026-09-11 (`hubMapListFixtures.ts`).
import { describe, it, expect } from 'vitest';
import {
	fetchHubMapList,
	hubMapListUrl,
	parseHubMapList,
	HUB_LIST_PAGE_SIZE,
	HUB_LIST_MAX_PAGE,
	HUB_MAP_SORTS
} from './hubMapList';
import { hubListEntry, hubListPage, listFetch } from './hubMapListFixtures';

describe('R-20: the list is asked for at the hub, ten at a time', () => {
	it('builds the address the hub documents, and nothing else', () => {
		expect(HUB_LIST_PAGE_SIZE).toBe(10);
		expect(hubMapListUrl({ kind: 'starmap', sort: 'detailed', page: 1 })).toBe(
			'https://explorers.starsystemx.com/api/maps?kind=starmap&sort=detailed&limit=10&page=1'
		);
		expect(hubMapListUrl({ kind: 'starmap', sort: 'new', page: 2, tag: 'default' })).toBe(
			'https://explorers.starsystemx.com/api/maps?kind=starmap&sort=new&limit=10&page=2&tag=default'
		);
	});

	it('never asks for a page the hub would clamp into a repeat', () => {
		// The hub serves pages 1..50 and answers page 51 with page 50 again - a "next" past the end
		// would show the same ten maps twice.
		expect(HUB_LIST_MAX_PAGE).toBe(50);
		expect(hubMapListUrl({ kind: 'starmap', sort: 'loved', page: 0 })).toContain('&page=1');
		expect(hubMapListUrl({ kind: 'starmap', sort: 'loved', page: 99 })).toContain('&page=50');
	});

	it('offers the four orders the hub has, best written-up first', () => {
		expect(HUB_MAP_SORTS.map((s) => s.id)).toEqual(['detailed', 'new', 'loved', 'discussed']);
	});

	it('sends no credentials', async () => {
		const { impl, calls } = listFetch(() => ({ json: hubListPage(1) }));
		await fetchHubMapList({ kind: 'starmap', sort: 'detailed', page: 1 }, impl);
		expect(calls).toHaveLength(1);
		expect(calls[0].init?.credentials).toBe('omit');
	});
});

describe('R-20: only the contract’s fields reach the app', () => {
	it('reads ten cards from a recorded-shape page and drops every card column', async () => {
		const { impl } = listFetch(() => ({ json: hubListPage(10) }));
		const result = await fetchHubMapList({ kind: 'starmap', sort: 'detailed', page: 1 }, impl);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.maps).toHaveLength(10);
		// ABSOLUTE: the keys a card may use, spelt out. `info_density`, `cover_sha256`, `openUrl` and
		// the rest are on every object the hub sends and must not be here.
		expect(Object.keys(result.maps[0]).sort()).toEqual([
			'blurb', 'body_count', 'comments_count', 'construct_count', 'coverUrl', 'downloadUrl',
			'download_count', 'hearts_count', 'kind', 'slug', 'system_count', 'title', 'url'
		]);
		expect(result.maps[1]).toEqual({
			slug: 'synthetic-map-2',
			title: 'Synthetic Map 2',
			blurb: 'An invented campaign, number 2.',
			kind: 'starmap',
			url: 'https://explorers.starsystemx.com/s/synthetic-map-2',
			downloadUrl: 'https://explorers.starsystemx.com/api/download/synthetic-map-2',
			coverUrl: 'https://explorers.starsystemx.com/asset/' + 'ab'.repeat(32),
			system_count: 3,
			body_count: 20,
			construct_count: 0,
			hearts_count: 2,
			comments_count: 2,
			download_count: 6
		});
		expect(result.hasMore, 'a full page may have another behind it').toBe(true);
		expect(result.skipped).toBe(0);
	});

	it('keeps an absent comment count absent', () => {
		// `comments_count?` is optional in the contract. "No figure" and "nobody commented" are two
		// different statements, and a card should not make the second when it was told the first.
		const page = hubListPage(0, { maps: [hubListEntry(1, { comments_count: undefined })] });
		const result = parseHubMapList(JSON.parse(JSON.stringify(page)), 'starmap', 1);
		expect(result.ok && result.maps[0].comments_count).toBeNull();
	});

	it('says there is no next page when the hub sent fewer than ten, or this is page fifty', () => {
		const short = parseHubMapList(hubListPage(3), 'starmap', 1);
		expect(short.ok && short.hasMore).toBe(false);
		const last = parseHubMapList(hubListPage(10, { page: 50 }), 'starmap', 50);
		expect(last.ok && last.hasMore).toBe(false);
	});
});

describe('R-20: the answer is untrusted, like a map', () => {
	it('drops a map whose download is not on the hub, and does not show a cover from elsewhere', () => {
		const page = hubListPage(0, {
			maps: [
				hubListEntry(1, { downloadUrl: 'https://evil.example/api/download/x' }),
				hubListEntry(2, { coverUrl: 'https://tracker.example/pixel.png', url: 'https://evil.example/s/x' }),
				hubListEntry(3, { downloadUrl: 'http://explorers.starsystemx.com/api/download/synthetic-map-3' }),
				hubListEntry(4, { slug: '../../admin' })
			]
		});
		const result = parseHubMapList(page, 'starmap', 1);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.maps.map((m) => m.slug)).toEqual(['synthetic-map-2']);
		expect(result.maps[0].coverUrl, 'a cover off the hub is a request the GM never chose').toBeNull();
		expect(result.maps[0].url).toBeNull();
		expect(result.skipped).toBe(3);
	});

	it('drops a single system from a list that asked for campaigns', () => {
		// A system reaching a click-to-open list would open to R-18's refusal.
		const page = hubListPage(0, { maps: [hubListEntry(1), hubListEntry(2, { kind: 'system', system_count: 0 })] });
		const result = parseHubMapList(page, 'starmap', 1);
		expect(result.ok && result.maps.map((m) => m.slug)).toEqual(['synthetic-map-1']);
	});

	it('treats a negative or non-numeric count as none', () => {
		const page = hubListPage(0, { maps: [hubListEntry(1, { body_count: -4, hearts_count: 'lots', system_count: 2.7 })] });
		const result = parseHubMapList(page, 'starmap', 1);
		expect(result.ok && [result.maps[0].body_count, result.maps[0].hearts_count, result.maps[0].system_count]).toEqual([0, 0, 2]);
	});
});

describe('R-20: no test reaches the live hub', () => {
	it('is refused by the test setup itself, on every hub host, before any socket opens', async () => {
		// `src/setup.ts` rejects hub hosts so that a spec rendering a load screen without stubbing
		// `fetch` sees the offline line instead of somebody else's server. Asserted by the guard's
		// OWN words, so a real network failure cannot pass for it.
		for (const url of [
			'https://explorers.starsystemx.com/api/maps?limit=1',
			'https://starsystemx-creator-hub.orange-tree-847c.workers.dev/api/maps?limit=1'
		]) {
			await expect(fetch(url)).rejects.toThrow(/never reached from a test/);
		}
	});
});

describe('R-20: a list that could not be fetched says so, and never looks empty', () => {
	const query = { kind: 'starmap', sort: 'detailed', page: 1 } as const;

	it('names being offline when the fetch itself fails', async () => {
		const result = await fetchHubMapList(query, listFetch(() => ({ throws: true })).impl);
		expect(result.ok).toBe(false);
		expect(!result.ok && result.problem).toMatch(/Could not reach Explorers/);
		expect(!result.ok && result.problem).toContain('https://explorers.starsystemx.com');
	});

	it('gives the hub’s error number when it answers with one', async () => {
		const result = await fetchHubMapList(query, listFetch(() => ({ status: 503 })).impl);
		expect(!result.ok && result.problem).toMatch(/error 503/);
	});

	it('says it could not read an answer that is not the list', async () => {
		const garbage = await fetchHubMapList(query, listFetch(() => ({ body: new TextEncoder().encode('<html>') })).impl);
		expect(!garbage.ok && garbage.problem).toMatch(/could not read/);
		const wrongShape = await fetchHubMapList(query, listFetch(() => ({ json: { items: [] } })).impl);
		expect(!wrongShape.ok && wrongShape.problem).toMatch(/could not read/);
	});
});
