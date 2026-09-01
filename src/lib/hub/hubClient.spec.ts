// R-05: the funnel, and the two cautions the hub attached to it.
//
// "Treat a hub map as untrusted input on the way in, exactly as an imported file already is. The
// slug comes from a URL a stranger can craft." So the gates below are mostly about what this module
// REFUSES: a slug it will not build a URL from, a response it will not finish reading, an origin it
// will not be talked into addressing.
//
// GATE DISCIPLINE (PHY-34): the anchors are absolute - literal URLs and literal byte counts, not
// "whatever the config says" - because a test that builds its expectation from the same constant
// the code reads cannot see the constant being wrong.
import { describe, it, expect } from 'vitest';
import { fetchHubMap, isValidHubSlug, parseHubReference, hubDownloadUrl, hubMapUrl, MAX_HUB_BYTES } from './hubClient';
import { HUB, shareableAppLink } from './hubConfig';

/** A fetch double: records what it was asked for, answers with what the test wants. */
function fakeFetch(reply: { status?: number; body?: Uint8Array; headers?: Record<string, string>; throws?: boolean }) {
	const calls: string[] = [];
	const impl = (async (url: string) => {
		calls.push(String(url));
		if (reply.throws) throw new TypeError('Failed to fetch');
		const body = reply.body ?? new Uint8Array([1, 2, 3]);
		return {
			ok: (reply.status ?? 200) >= 200 && (reply.status ?? 200) < 300,
			status: reply.status ?? 200,
			headers: { get: (k: string) => reply.headers?.[k.toLowerCase()] ?? null },
			body: null, // no stream: exercises the arrayBuffer fallback
			arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
		} as unknown as Response;
	}) as unknown as typeof fetch;
	return { impl, calls };
}

describe('R-05: a slug is validated BEFORE it becomes a URL', () => {
	it('accepts the shape a hub map id actually has', () => {
		for (const ok of ['a', 'my-map', 'local-neighbourhood', 'x9', '0-start']) {
			expect(isValidHubSlug(ok), ok).toBe(true);
		}
	});

	it('refuses anything that could steer the request somewhere else', () => {
		// Each of these is a way of turning "fetch a map" into "fetch something else", and every one
		// is refused before `encodeURIComponent` is ever reached - encoding is a second line, not
		// the first. `..%2f` in particular survives naive decoding on some servers.
		for (const bad of [
			'../../etc/passwd',
			'a/b',
			'..%2f..%2fadmin',
			'//evil.example.com/x',
			'https://evil.example.com/x',
			'map?x=1',
			'map#frag',
			'map with spaces',
			'-leading-hyphen',
			'UPPER',
			'',
			'   ',
			'x'.repeat(65)
		]) {
			expect(isValidHubSlug(bad), `should refuse ${JSON.stringify(bad)}`).toBe(false);
		}
		expect(isValidHubSlug(null)).toBe(false);
		expect(isValidHubSlug(undefined)).toBe(false);
		expect(isValidHubSlug(42)).toBe(false);
	});

	it('never issues a request for a slug it refused', async () => {
		const { impl, calls } = fakeFetch({});
		const result = await fetchHubMap('../../admin', impl);
		expect(result.ok).toBe(false);
		expect(calls, 'a refused slug must not reach the network at all').toEqual([]);
	});

	it('builds the download URL on the configured origin and nowhere else', () => {
		// ABSOLUTE: the literal origin, so a config edit that pointed the app at another host would
		// be a deliberate change to this line rather than a silent one.
		expect(hubDownloadUrl('my-map')).toBe(
			'https://starsystemx-creator-hub.orange-tree-847c.workers.dev/api/download/my-map'
		);
		expect(hubMapUrl('my-map')).toBe(
			'https://starsystemx-creator-hub.orange-tree-847c.workers.dev/m/my-map'
		);
		expect(hubDownloadUrl('my-map').startsWith(HUB.origin + '/')).toBe(true);
	});
});

describe('R-05: whatever somebody pasted becomes a map code, or nothing', () => {
	it('reads all three links that name the same map, and a bare code', () => {
		expect(parseHubReference('local-neighbourhood')).toBe('local-neighbourhood');
		expect(parseHubReference('https://starsystemx.com/?hub=local-neighbourhood')).toBe('local-neighbourhood');
		expect(parseHubReference(`${HUB.origin}/m/local-neighbourhood`)).toBe('local-neighbourhood');
		expect(parseHubReference(`${HUB.origin}/api/download/local-neighbourhood`)).toBe('local-neighbourhood');
	});

	it('survives what a link out of a chat app actually looks like', () => {
		expect(parseHubReference('  https://starsystemx.com/?hub=my-map&utm_source=discord  ')).toBe('my-map');
		expect(parseHubReference(`${HUB.origin}/m/my-map#screenshots`)).toBe('my-map');
		expect(parseHubReference(`${HUB.origin}/m/my-map/`)).toBe('my-map');
		expect(parseHubReference('starsystemx.com/?hub=my-map')).toBe('my-map'); // no scheme typed
		expect(parseHubReference(`${HUB.origin}/api/download/my-map.sse.zip`)).toBe('my-map');
	});

	it('returns null rather than guessing', () => {
		for (const bad of ['', '   ', 'not a link', 'https://example.com/', 'https://example.com/a/b/../c']) {
			expect(parseHubReference(bad), JSON.stringify(bad)).toBe(null);
		}
	});

	it('round-trips the link this app hands out', () => {
		expect(shareableAppLink('my-map', 'https://starsystemx.com')).toBe('https://starsystemx.com/?hub=my-map');
		// A trailing slash on the origin must not produce a double slash in a link people will paste.
		expect(shareableAppLink('my-map', 'https://starsystemx.com/')).toBe('https://starsystemx.com/?hub=my-map');
		expect(parseHubReference(shareableAppLink('my-map', 'https://starsystemx.com'))).toBe('my-map');
	});
});

describe('R-05: the answer is untrusted too', () => {
	it('refuses a body larger than the cap, on the declared length alone', async () => {
		// ABSOLUTE: 64 MB, stated here rather than read from the constant.
		expect(MAX_HUB_BYTES).toBe(64 * 1024 * 1024);
		const { impl } = fakeFetch({ headers: { 'content-length': String(MAX_HUB_BYTES + 1) } });
		const result = await fetchHubMap('big-map', impl);
		expect(result.ok).toBe(false);
		expect((result as any).problem).toMatch(/larger than this app will open/i);
	});

	it('refuses a body that exceeds the cap while it arrives, whatever it claimed', async () => {
		// The declared length is a CLAIM. A response that says nothing, or lies, still gets capped.
		const { impl } = fakeFetch({ body: new Uint8Array(MAX_HUB_BYTES + 1) });
		const result = await fetchHubMap('lying-map', impl);
		expect(result.ok).toBe(false);
	});

	it('says what a GM can do about each failure, and never throws', async () => {
		const missing = await fetchHubMap('gone', fakeFetch({ status: 404 }).impl);
		expect(missing.ok).toBe(false);
		expect((missing as any).problem).toMatch(/no longer exists/i);

		const broken = await fetchHubMap('oops', fakeFetch({ status: 500 }).impl);
		expect((broken as any).problem).toMatch(/error 500/);

		// A CORS refusal is indistinguishable from being offline, so the message offers the way
		// through rather than a diagnosis: the hub's own page, named in full.
		const offline = await fetchHubMap('any-map', fakeFetch({ throws: true }).impl);
		expect((offline as any).problem).toContain(hubMapUrl('any-map'));

		const empty = await fetchHubMap('empty', fakeFetch({ body: new Uint8Array(0) }).impl);
		expect((empty as any).problem).toMatch(/empty/i);
	});

	it('hands back the bytes unexamined when the fetch succeeds', async () => {
		// This module does not parse. Classification is the importer's door, and it stays there.
		const body = new Uint8Array([80, 75, 3, 4, 9, 9]);
		const result = await fetchHubMap('good-map', fakeFetch({ body }).impl);
		expect(result.ok).toBe(true);
		expect(Array.from((result as any).bytes)).toEqual([80, 75, 3, 4, 9, 9]);
	});

	it('never sends credentials to the hub for a link a stranger supplied', async () => {
		let seen: any = null;
		const impl = (async (_url: string, init: any) => {
			seen = init;
			return {
				ok: true, status: 200,
				headers: { get: () => null },
				body: null,
				arrayBuffer: async () => new Uint8Array([1]).buffer
			} as unknown as Response;
		}) as unknown as typeof fetch;
		await fetchHubMap('some-map', impl);
		expect(seen.credentials).toBe('omit');
	});
});
