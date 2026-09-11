// R-17: `?hub=` AND `?open=` REACH THE SAME OPEN FUNCTION - pinned in the source, deliberately.
//
// This is a SHAPE gate rather than a behaviour gate, and that is the point. The behaviour it
// protects - "a shared map is classified through the importer's door, never replaces an open
// campaign without being asked, and leaves a one-step-back copy" - is already gated where it lives.
// What is NOT gated by any of that is somebody adding a second way in six months from now that
// fetches and opens on its own, gets one of those three answers wrong, and passes every existing
// test because the old path still behaves.
//
// Two doors into one campaign store is this codebase's most recurring recorded fault (the standing
// rule: "could these two answer the same question differently"). So the source is asserted: ONE
// function classifies-asks-opens, and every way of getting bytes hands them to it.
//
// It reads the route as text because there is nothing else to read - the functions are Svelte
// instance scope, not exports. A source assertion is worth exactly what its failure message says,
// so each one below names the rule rather than the string.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROUTE = join(dirname(fileURLToPath(import.meta.url)), '+page.svelte');
const src = readFileSync(ROUTE, 'utf8');

/**
 * The body of a function, found by its signature and matched brace for brace. Naive against a brace
 * inside a string or a comment; both are absent from the short functions this file asserts on, and
 * the alternative - parsing Svelte - is a great deal of machinery for four assertions.
 *
 * The block opens at the LAST brace on the signature's own line rather than the first: a return
 * type can itself be an object literal (`function hubOpenRequest(): { param: HubOpenParam; value:
 * string } | null {`), and taking the first brace walks into the TYPE and asserts against it. That
 * cost one red run before it was obvious.
 */
function bodyOf(signature: string): string {
	const at = src.indexOf(signature);
	expect(at, `the route no longer contains \`${signature}\``).toBeGreaterThan(-1);
	const eol = src.indexOf('\n', at);
	let i = src.lastIndexOf('{', eol);
	let depth = 0;
	const start = i;
	for (; i < src.length; i++) {
		if (src[i] === '{') depth++;
		else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
	}
	throw new Error(`unbalanced braces after ${signature}`);
}

/** Occurrences of a call, ignoring the function's own declaration and any import line. */
function callCount(name: string): number {
	return src
		.split('\n')
		.filter((l) => !/^\s*import\b/.test(l) && !new RegExp(`function\\s+${name}\\s*\\(`).test(l))
		.filter((l) => l.includes(`${name}(`)).length;
}

describe('R-17: one door into the campaign store', () => {
	it('declares exactly one openHubBytes', () => {
		const declarations = src.match(/async function openHubBytes\s*\(/g) ?? [];
		expect(declarations.length, 'openHubBytes must be declared exactly once').toBe(1);
	});

	it('gets bytes two ways and opens them one way', () => {
		// The split R-17 is: fetching differs, opening does not.
		expect(bodyOf('async function runHubOpen(slug: string)')).toContain('openHubBytes(');
		expect(bodyOf('async function runHubOpenFromUrl(url: string)')).toContain('openHubBytes(');
		expect(bodyOf('async function runHubOpen(slug: string)')).toContain('fetchHubMap(');
		expect(bodyOf('async function runHubOpenFromUrl(url: string)')).toContain('fetchHubMapFromUrl(');
	});

	it('does not let either fetcher classify, ask or open on its own', () => {
		// The three things `openHubBytes` and `openHubMap` own between them. A fetcher that did any
		// of these would be the second door, whatever it was called.
		for (const sig of ['async function runHubOpen(slug: string)', 'async function runHubOpenFromUrl(url: string)']) {
			const body = bodyOf(sig);
			for (const forbidden of ['classifySaveFile', 'hubOffer =', 'openStarmapPayload', 'savePreUpgradeStarmap']) {
				expect(body, `${sig} must not ${forbidden} - that is openHubBytes's job`).not.toContain(forbidden);
			}
		}
	});

	it('offers the shared map from exactly one place, and opens it from one', () => {
		expect(callCount('fetchHubMap'), 'fetchHubMap has one call site').toBe(1);
		expect(callCount('fetchHubMapFromUrl'), 'fetchHubMapFromUrl has one call site').toBe(1);
		expect(
			(src.match(/hubOffer = \{/g) ?? []).length,
			'the replace-or-keep question is asked in exactly one place'
		).toBe(1);
	});

	it('routes both parameters through the one dispatcher', () => {
		const body = bodyOf('async function maybeOpenHubMap()');
		expect(body).toContain('runHubOpen(');
		expect(body).toContain('runHubOpenFromUrl(');
		// And the dispatcher is what startup calls - not either fetcher directly.
		expect(src).toContain('await maybeOpenHubMap();');
	});
});

describe('R-20: a map picked from the Explorers list comes in by the same door', () => {
	// The list inside Load Starmap and New Starmap (G98) is a THIRD way somebody asks for a hub map.
	// It is not a third way of getting bytes: it hands over an ADDRESS, and an address already has
	// a function. What this pins is the thing that would go wrong later - a list handler that grew
	// its own fetch, or its own classify, because it was "just the panel".
	it('opens by address, through runHubOpenFromUrl, and does nothing else on its own', () => {
		const body = bodyOf('async function openHubFromList(url: string)');
		expect(body).toContain('runHubOpenFromUrl(url)');
		for (const forbidden of ['fetch(', 'fetchHubMapFromUrl', 'classifySaveFile', 'hubOffer =', 'openStarmapPayload', 'openHubBytes']) {
			expect(body, `openHubFromList must not ${forbidden} - runHubOpenFromUrl already does`).not.toContain(forbidden);
		}
	});

	it('is what BOTH load screens call when a listed map is picked', () => {
		const wired = src.split('\n').filter((l) => l.includes('on:openFromExplorers='));
		expect(wired, 'Load Starmap and New Starmap, and nothing else').toHaveLength(2);
		for (const line of wired) expect(line).toContain('openHubFromList(e.detail)');
	});
});

describe('R-17: the link is taken off the address bar, whichever one it was', () => {
	it('clears by parameter name rather than by a hardcoded `hub`', () => {
		const body = bodyOf('function clearHubParam(');
		expect(body, 'clearHubParam must delete the parameter it was given').toContain('searchParams.delete(param)');
		expect(body, "clearHubParam must not be hardcoded to 'hub'").not.toContain("delete('hub')");
	});

	it('knows both parameter names in one place', () => {
		expect(src).toContain("type HubOpenParam = 'hub' | 'open';");
		const body = bodyOf('function hubOpenRequest()');
		expect(body).toContain("param: 'hub'");
		expect(body).toContain("param: 'open'");
	});
});
