// THE CONTRACT FIXTURE for the Creator Hub (creator-hub-design.md section 4).
//
// A second codebase, in its own repository and on its own release cadence, now opens these
// archives. It does not USE a campaign - no physics, no classification, no rendering - it slices
// one: it sniffs the zip, reads one JSON, walks `systems[].system.nodes[]`, lists the asset paths
// a node points at, and reads the attribution flags for the public-sharing gate. That is the whole
// shared surface, and the design's recommendation was to MIRROR it rather than publish a package.
//
// A mirrored contract needs two things to stay honest, and this file is both of them:
//   1. `bundleFormat`, an integer in the doc, bumped only on a breaking layout change; and
//   2. a canonical archive, checked in, that the hub's parser tests against.
//
// So this spec pins the fixture BYTE FOR BYTE. Change the layout and it goes red, which is the
// point: the red is the reminder to bump `BUNDLE_FORMAT` and hand the hub a fixture it can learn
// from. Regenerate deliberately with:
//
//     UPDATE_HUB_FIXTURE=1 npx vitest run src/lib/io/hubFixture.spec.ts
//
// and read the diff before you commit it. Note that reproducibility needs the zip timestamps
// pinned (`PackOptions.mtime`) - without that every regeneration is a diff and the gate is noise.
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { packBundle, unpackBundle, sniffBundle, BUNDLE_FORMAT } from './bundle';
import { readZipMembers } from '$lib/import/shared/zip';
import { strFromU8, strToU8, zipSync } from 'fflate';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'tests', 'fixtures');
const FIXTURE = join(FIXTURE_DIR, 'creator-hub-bundle.sse.zip');

// Pinned so the archive is reproducible. Any fixed instant does; this one is simply legible.
const FIXTURE_MTIME = '2026-01-01T00:00:00.000Z';

const b64 = (s: string) => btoa(s);

// THE CANONICAL CAMPAIGN. Deliberately small and deliberately complete: it carries one of every
// thing the hub slices on, including the awkward ones - a remote image URL that must survive
// untouched, a built-in starter graphic that is a static path rather than an upload, and an asset
// with NO provenance, because "no provenance recorded" is what the sharing gate actually tests.
function canonicalStarmap(): any {
	return {
		name: 'Hub Contract Sample',
		scale: { unit: 'ly', pixelsPerUnit: 10, showScaleBar: true },
		systems: [
			{
				name: 'Contract Reach',
				system: {
					id: 'sys-contract-reach',
					name: 'Contract Reach',
					nodes: [
						{ id: 'star-a', name: 'Contract A', kind: 'body', roleHint: 'star' },
						{
							id: 'planet-b',
							name: 'Bellwether',
							kind: 'body',
							roleHint: 'planet',
							parentId: 'star-a',
							image: {
								url: 'data:image/png;base64,' + b64('BELLWETHER-PNG'),
								custom: true,
								credit: 'A Painter',
								license: 'CC BY 4.0'
							}
						},
						{ id: 'moon-c', name: 'Tally', kind: 'body', roleHint: 'moon', parentId: 'planet-b' },
						{
							id: 'ship-d',
							name: 'Contract Runner',
							kind: 'construct',
							parentId: 'planet-b',
							model: { hash: 'c0ffee', name: 'Runner hull' },
							image: { url: 'https://example.test/runner.jpg' }
						}
					]
				}
			}
		],
		playerAssets: [
			{
				id: 'asset-sector-map',
				name: 'Sector map',
				dataUrl: 'data:image/png;base64,' + b64('SECTOR-MAP-PNG'),
				w: 1024,
				h: 640,
				credit: 'A Cartographer',
				license: 'CC BY 4.0',
				sourceUrl: 'https://example.test/map'
			},
			{ id: 'builtin-sse-logo', name: 'SSE', dataUrl: '/images/logo/SSE.png' }
		],
		mapBackground: {
			source: 'asset',
			assetId: 'asset-sector-map',
			attach: 'map',
			opacity: 0.8,
			sizePct: 100,
			widthUnits: 40,
			offsetX: 0,
			offsetY: 0,
			rotationDeg: 0
		}
	};
}

// The model has NO credit on purpose: the hub's public gate is `missing.length === 0`, so the
// fixture must contain something that is missing, or the gate is never exercised against it.
const MODELS = { c0ffee: { b64: b64('RUNNER-GLB'), meta: {} } };

function buildFixture(): Uint8Array {
	return packBundle('starmap', canonicalStarmap(), { models: MODELS, mtime: FIXTURE_MTIME })!;
}

describe('the Creator Hub contract fixture', () => {
	it('packs reproducibly - two runs, identical bytes', () => {
		const a = buildFixture();
		const b = buildFixture();
		expect(Buffer.from(b).equals(Buffer.from(a))).toBe(true);
	});

	it('matches the checked-in archive byte for byte', () => {
		const built = buildFixture();
		if (process.env.UPDATE_HUB_FIXTURE || !existsSync(FIXTURE)) {
			mkdirSync(FIXTURE_DIR, { recursive: true });
			writeFileSync(FIXTURE, built);
		}
		const onDisk = readFileSync(FIXTURE);
		expect(
			Buffer.from(built).equals(onDisk),
			'The bundle layout changed. If that was deliberate: bump BUNDLE_FORMAT in bundle.ts and ' +
				'regenerate with UPDATE_HUB_FIXTURE=1, in the SAME commit. The hub reads this file.'
		).toBe(true);
	});

	it('stamps the format, first in the document, where a reader meets it immediately', () => {
		const bytes = buildFixture();
		expect(sniffBundle(bytes)).toBe(true);
		const members = readZipMembers(bytes, ['.json']);
		const json = strFromU8(members[Object.keys(members).find((n) => n.endsWith('starmap.json'))!]);
		expect(JSON.parse(json).bundleFormat).toBe(BUNDLE_FORMAT);
		expect(json.indexOf('"bundleFormat"')).toBeLessThan(json.indexOf('"systems"'));
	});

	it('carries every path prefix and doc name the hub mirrors', () => {
		const members = readZipMembers(buildFixture(), ['.json', '.glb', '.png', '.md', '.txt']);
		const names = Object.keys(members);
		for (const expected of [
			'starmap.json',
			'assets/models/c0ffee.glb',
			'assets/images/planet-b.png',
			'assets/images/player/asset-sector-map.png',
			'ATTRIBUTIONS.md'
		]) {
			expect(names.some((n) => n.endsWith(expected)), `missing ${expected}`).toBe(true);
		}
		// A static starter graphic is a PATH, not an upload, and must never be extracted.
		expect(names.some((n) => n.includes('builtin-sse-logo'))).toBe(false);
	});

	it('round-trips through our own reader, and hands the format back to the caller', () => {
		const out = unpackBundle(buildFixture());
		expect(out.kind).toBe('starmap');
		expect(out.format).toBe(BUNDLE_FORMAT);
		expect(out.doc.bundleFormat).toBeUndefined(); // a container property, off the campaign again
		const nodes = out.doc.systems[0].system.nodes;
		expect(nodes.map((n: any) => n.id)).toEqual(['star-a', 'planet-b', 'moon-c', 'ship-d']);
		expect(nodes[1].image.url).toBe('data:image/png;base64,' + b64('BELLWETHER-PNG'));
		expect(nodes[3].image.url).toBe('https://example.test/runner.jpg'); // a remote URL, as authored
		expect(out.models.c0ffee.b64).toBe(b64('RUNNER-GLB'));
		expect(out.doc.playerAssets[0].dataUrl.startsWith('data:image/png;base64,')).toBe(true);
		expect(out.doc.playerAssets[1].dataUrl).toBe('/images/logo/SSE.png');
	});

	it('exercises the sharing gate: it holds one asset WITH provenance and one without', () => {
		const members = readZipMembers(buildFixture(), ['.md']);
		const md = strFromU8(members[Object.keys(members).find((n) => n.endsWith('ATTRIBUTIONS.md'))!]);
		expect(md).toContain('A Cartographer');
		expect(md).toContain('_No provenance recorded._');
	});
});

// A bundle written before the stamp existed reads as format 0 rather than throwing - the
// compatibility promise at the head of bundle.ts covers old archives as well as plain .json.
describe('an unstamped archive', () => {
	it('reads as format 0, not as an error', () => {
		const legacy = zipSync(
			{ 'system.json': strToU8(JSON.stringify({ id: 'sol', nodes: [{ id: 'earth', name: 'Earth' }] })) },
			{ level: 0 }
		);
		const out = unpackBundle(legacy);
		expect(out.format).toBe(0);
		expect(out.doc.nodes[0].id).toBe('earth');
	});
});
