// R-17: OPENING A MAP FROM AN ADDRESS, and the allow-list that is the whole of the defence.
//
// `?hub=<slug>` hands this app a NAME and the app builds the address on the hub's own origin, so a
// hostile link could never choose the destination. `?open=<url>` hands it the ADDRESS. That is one
// step, and it is the step that turns a funnel into an SSRF-shaped thing, so the gates below are
// about what is REFUSED and - the assertion that actually matters - about nothing being fetched
// when it is refused. A refusal that still made the request has defended nothing.
//
// GATE DISCIPLINE (PHY-34): the trusted hosts are written out LITERALLY here rather than read from
// `TRUSTED_OPEN_HOSTS`, and the list's contents are pinned as a whole. A test that builds its
// expectation from the same constant the code reads cannot see the constant being widened, and
// silently widening this particular constant is the failure with the largest blast radius in the
// file. Adding a host must cost a test edit, deliberately.
import { describe, it, expect } from 'vitest';
import { isTrustedOpenUrl, TRUSTED_OPEN_HOSTS, TRUSTED_OPEN_HOST_SUFFIXES } from './hubConfig';
import { fetchHubMapFromUrl } from './hubClient';

/** A fetch double that records every address it was asked for. */
function spyFetch(body = new Uint8Array([80, 75, 3, 4])) {
	const calls: string[] = [];
	const impl = (async (url: string) => {
		calls.push(String(url));
		return {
			ok: true,
			status: 200,
			headers: { get: () => null },
			body: null,
			arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
		} as unknown as Response;
	}) as unknown as typeof fetch;
	return { impl, calls };
}

describe('R-17: the allow-list, as data', () => {
	it('is exactly these hosts and no others', () => {
		// ABSOLUTE. If this fails, somebody widened what the app will fetch and load; read the diff
		// before making the test agree with it.
		expect([...TRUSTED_OPEN_HOSTS]).toEqual([
			'starsystemx-creator-hub.orange-tree-847c.workers.dev',
			'explorers.starsystemx.com'
		]);
		expect([...TRUSTED_OPEN_HOST_SUFFIXES]).toEqual(['.pages.dev']);
	});

	it('trusts each host the hub named, on the download path it actually uses', () => {
		for (const url of [
			'https://explorers.starsystemx.com/api/download/local-neighbourhood',
			'https://starsystemx-creator-hub.orange-tree-847c.workers.dev/api/download/local-neighbourhood',
			'https://abc123.starsystemx-creator-hub.pages.dev/api/download/local-neighbourhood'
		]) {
			expect(isTrustedOpenUrl(url), url).toBeNull();
		}
	});
});

describe('R-17: what the allow-list refuses, and why each one is on the list', () => {
	it('refuses a scheme that is not https', () => {
		// http: is a downgrade a link must not be able to ask for; javascript: and data: are not
		// fetches of a remote map at all, and file: reads the machine the app is running on.
		expect(isTrustedOpenUrl('http://explorers.starsystemx.com/api/download/x')).toMatch(/https/i);
		expect(isTrustedOpenUrl('javascript:alert(1)')).toBeTruthy();
		expect(isTrustedOpenUrl('data:application/json,{}')).toBeTruthy();
		expect(isTrustedOpenUrl('file:///c:/windows/win.ini')).toBeTruthy();
	});

	it('refuses a look-alike host, which is the case the list exists for', () => {
		// Reads as the hub to a person scanning a link. Its actual host is `evil.example`.
		expect(isTrustedOpenUrl('https://explorers.starsystemx.com.evil.example/api/download/x')).toMatch(/evil\.example/);
		// A suffix that is not a subdomain: `notpages.dev` must not pass as `*.pages.dev`.
		expect(isTrustedOpenUrl('https://notpages.dev/api/download/x')).toBeTruthy();
		expect(isTrustedOpenUrl('https://evil.example/api/download/x')).toBeTruthy();
	});

	it('refuses the userinfo trick', () => {
		// `https://explorers.starsystemx.com@evil.example/` fetches evil.example. The host check
		// already refuses it; the shape is refused as well so that a later reader who re-derives
		// the host by hand cannot reintroduce the trick.
		expect(isTrustedOpenUrl('https://explorers.starsystemx.com@evil.example/x')).toBeTruthy();
		expect(isTrustedOpenUrl('https://explorers.starsystemx.com:pw@evil.example/x')).toBeTruthy();
		// And the same trick pointed at a host that IS trusted still loses its sign-in.
		expect(isTrustedOpenUrl('https://someone:pw@explorers.starsystemx.com/x')).toMatch(/sign-in/i);
	});

	it('refuses a trusted host on a strange port, and nonsense that is not a URL', () => {
		expect(isTrustedOpenUrl('https://explorers.starsystemx.com:8443/api/download/x')).toMatch(/8443/);
		expect(isTrustedOpenUrl('not a url')).toBeTruthy();
		expect(isTrustedOpenUrl('')).toBeTruthy();
		expect(isTrustedOpenUrl(null)).toBeTruthy();
		expect(isTrustedOpenUrl(undefined)).toBeTruthy();
	});
});

describe('R-17: a refused address is never fetched', () => {
	it('makes no request at all for an untrusted host', async () => {
		// THE ASSERTION THAT MATTERS. Refusing after the request has already gone out defends
		// nothing: the address has been contacted, which is the whole of an SSRF.
		const { impl, calls } = spyFetch();
		const result = await fetchHubMapFromUrl('https://evil.example/api/download/x', impl);
		expect(result.ok).toBe(false);
		expect(calls).toEqual([]);
	});

	it('fetches the trusted address exactly as given, and hands back the bytes unexamined', async () => {
		const { impl, calls } = spyFetch(new Uint8Array([80, 75, 3, 4, 7]));
		const url = 'https://explorers.starsystemx.com/api/download/local-neighbourhood';
		const result = await fetchHubMapFromUrl(url, impl);
		expect(calls).toEqual([url]);
		expect(result.ok).toBe(true);
		expect(Array.from((result as any).bytes)).toEqual([80, 75, 3, 4, 7]);
	});

	it('sends no credentials to an address a stranger supplied', async () => {
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
		await fetchHubMapFromUrl('https://explorers.starsystemx.com/api/download/x', impl);
		expect(seen.credentials).toBe('omit');
	});
});
