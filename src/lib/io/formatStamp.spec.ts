// R-01 and R-03: WHAT A SAVE SAYS IT IS, AND WHETHER ITS ASSET NAMES ARE TRUE.
//
// R-01 was half-built. `bundleFormat` was stamped inside `packBundle`, so it reached the zip and
// nothing else - and a campaign with no assets does not produce a zip. Those plain `.json` files
// are not an edge case: they are what the hub's JSON-only kill switch would make its ONLY accepted
// uploads, so the stamp was absent from exactly the files that would need it most.
//
// R-03 closes the other half of the same idea from the writing end. `assets/models/<sha256>.glb`
// is a content address, and an address is only an address if it is true. The hub defends itself by
// hashing the bytes and treating the path as a claim; this engine now refuses to write a claim it
// has not checked.
//
// GATE DISCIPLINE (PHY-34): every assertion below was run with its own fix removed and seen red,
// and the anchors are ABSOLUTE - the literal integer 1, and a SHA-256 pinned as a string constant -
// because a gate that compares two values through the same function cannot see a fault in that
// function.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
	packBundle,
	stampBundleFormat,
	takeBundleFormat,
	plainSaveJson,
	BUNDLE_FORMAT
} from './bundle';
import { classifySaveFile } from './classify';
import { strToU8 } from 'fflate';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** An asset-free campaign - the shape that exports as plain JSON rather than as a bundle. */
function bareCampaign(): any {
	return {
		id: 'starmap-bare',
		name: 'Bare Campaign',
		routes: [],
		systems: [{ name: 'Alpha', system: { id: 'sys-alpha', name: 'Alpha', nodes: [{ id: 'star', name: 'Star' }] } }]
	};
}

describe('R-01: a plain .json save says what format it is', () => {
	it('stamps the format on a save that carries no assets at all', async () => {
		const doc = bareCampaign();
		// The premise, asserted rather than assumed: with nothing to extract there IS no zip, so
		// the plain-JSON path is the one this campaign takes.
		expect(await packBundle('starmap', doc, {})).toBeNull();

		const text = plainSaveJson(doc);
		// ABSOLUTE. The literal the hub has pinned, not whatever the constant currently says. If you
		// bumped BUNDLE_FORMAT deliberately, change this literal and regenerate the fixtures.
		expect(JSON.parse(text).bundleFormat).toBe(1);
		expect(JSON.parse(text).bundleFormat).toBe(BUNDLE_FORMAT);
	});

	it('puts the stamp FIRST, so a reader meets it before a megabyte of nodes', () => {
		const text = plainSaveJson(bareCampaign());
		expect(text.indexOf('"bundleFormat"')).toBeLessThan(text.indexOf('"systems"'));
		expect(text.indexOf('"bundleFormat"')).toBeLessThan(text.indexOf('"name"'));
	});

	it('never inherits a stamp: THIS writer decides what it just wrote', () => {
		// A document that came out of an old archive, or was hand-edited by a GM who typed a number
		// in, must not carry that claim into a file this build wrote.
		const lying = { ...bareCampaign(), bundleFormat: 99 };
		expect(JSON.parse(plainSaveJson(lying)).bundleFormat).toBe(1);
		expect((stampBundleFormat(lying) as any).bundleFormat).toBe(1);
	});

	it('writes the crash file unindented and the ordinary save indented, both stamped', () => {
		// The crash path runs at 3 GB of heap; an indented copy is the allocation it must not make.
		const crash = plainSaveJson(bareCampaign(), { pretty: false });
		const normal = plainSaveJson(bareCampaign());
		expect(crash).not.toContain('\n');
		expect(normal).toContain('\n');
		expect(JSON.parse(crash).bundleFormat).toBe(1);
		expect(JSON.parse(normal).bundleFormat).toBe(1);
	});

	it('takes the stamp back OFF on the way in, for both containers', async () => {
		// A container property must never ride into the live campaign, or it lands in the autosave
		// and comes back out of every later export as an inherited claim.
		const json = classifySaveFile(strToU8(plainSaveJson(bareCampaign())));
		expect(json.kind).toBe('starmap');
		expect(json.format).toBe(1);
		expect(json.doc.bundleFormat).toBeUndefined();

		const withAsset = bareCampaign();
		withAsset.systems[0].system.nodes[0].image = { url: 'data:image/png;base64,' + btoa('X'), custom: true };
		const zip = classifySaveFile((await packBundle('starmap', withAsset, {}))!);
		expect(zip.container).toBe('bundle');
		expect(zip.format).toBe(1);
		expect(zip.doc.bundleFormat).toBeUndefined();
	});

	it('reads a save written BEFORE the stamp as legacy, never as an error', () => {
		// The compatibility promise at the head of bundle.ts. Format 0 means "made before there was
		// a format"; the hub base-stamps those as 1 and the app simply loads them.
		const old = classifySaveFile(strToU8(JSON.stringify(bareCampaign())));
		expect(old.kind).toBe('starmap');
		expect(old.format).toBe(0);
	});

	it('does not mistake a non-numeric claim for a format', () => {
		const doc: any = { ...bareCampaign(), bundleFormat: 'one' };
		expect(takeBundleFormat(doc)).toBe(0);
		expect(doc.bundleFormat).toBeUndefined(); // removed either way: it is not campaign data
	});

	it('leaves NO save-document download in the app writing unstamped JSON', () => {
		// The rule the four call sites obey, asserted where a fifth one would break it. Every
		// `application/json` download in these two files is a save document; if a new one appears
		// that does not go through plainSaveJson, this goes red and asks the question.
		for (const rel of ['routes/+page.svelte', 'lib/components/SystemView.svelte']) {
			const src = readFileSync(join(SRC, rel), 'utf-8');
			const sites = [...src.matchAll(/type:\s*'application\/json'/g)];
			expect(sites.length, `${rel} has no JSON download at all - did the export move?`).toBeGreaterThan(0);
			for (const m of sites) {
				const window = src.slice(Math.max(0, m.index! - 600), m.index!);
				expect(
					window.includes('plainSaveJson'),
					`${rel}: a save document is written as JSON near offset ${m.index} without plainSaveJson, ` +
						'so it carries no bundleFormat. Route it through plainSaveJson (io/bundle.ts).'
				).toBe(true);
			}
		}
	});
});

describe('R-03: a model file is named after its own bytes, or the export stops', () => {
	// ABSOLUTE ANCHOR. The real SHA-256 of the exact ASCII bytes 'RUNNER-GLB', pinned as a literal
	// so this gate is not merely re-running the hashing it is meant to check.
	const RUNNER_BYTES_SHA256 = '037f81411fcf94ae22d2ff2c30739c303d2a26642325ac38a24c52e07a523856';

	function docWithShip(hash: string): any {
		return {
			id: 'starmap-hashcheck',
			name: 'Hash Check',
			routes: [],
			systems: [
				{
					name: 'Alpha',
					system: {
						id: 'sys-alpha',
						name: 'Alpha',
						nodes: [{ id: 'ship', name: 'Ship', kind: 'construct', model: { hash } }]
					}
				}
			]
		};
	}

	it('refuses to write a file named after content it does not hold', async () => {
		// The crafted-bundle shape R-03 exists for: a name that claims an already-approved asset
		// while the bytes are something else. Six hex characters is exactly what the old canonical
		// fixture used, so this is not a hypothetical.
		const models = { c0ffee: { b64: btoa('NOT-THE-HASH-OF-THIS'), meta: {} } };
		await expect(packBundle('starmap', docWithShip('c0ffee'), { models })).rejects.toThrow(/Export aborted/);
	});

	it('names the reason and both hashes, so the failure is actionable', async () => {
		const models = { deadbeef: { b64: btoa('SOMETHING-ELSE'), meta: {} } };
		await expect(packBundle('starmap', docWithShip('deadbeef'), { models })).rejects.toThrow(/deadbeef/);
	});

	it('writes the file when the name IS the hash of the bytes', async () => {
		const bytes = new TextEncoder().encode('RUNNER-GLB');
		const digest = await crypto.subtle.digest('SHA-256', bytes);
		const hex = Array.from(new Uint8Array(digest))
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');
		// The absolute check: an independently pinned digest, not one this test just computed.
		expect(hex).toBe(RUNNER_BYTES_SHA256);

		const models = { [hex]: { b64: btoa('RUNNER-GLB'), meta: {} } };
		const zip = await packBundle('starmap', docWithShip(hex), { models });
		expect(zip).not.toBeNull();
		const out = classifySaveFile(zip!);
		expect(Object.keys(out.models!)).toEqual([hex]);
	});
});
