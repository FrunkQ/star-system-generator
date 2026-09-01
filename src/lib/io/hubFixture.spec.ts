// THE CONTRACT FIXTURES for the Creator Hub (creator-hub-design.md section 4, hub R-02).
//
// A second codebase, in its own repository and on its own release cadence, now opens these
// archives. It does not USE a campaign - no physics, no classification, no rendering - it slices
// one: it sniffs the zip, reads one JSON, walks `systems[].system.nodes[]`, lists the asset paths
// a node points at, and reads the attribution flags for the public-sharing gate. That is the whole
// shared surface, and the design's recommendation was to MIRROR it rather than publish a package.
//
// A mirrored contract needs two things to stay honest, and this file is both of them:
//   1. `bundleFormat`, an integer in the doc, bumped only on a breaking layout change; and
//   2. canonical archives, checked in, that the hub's parser tests against.
//
// TWO ARCHIVES, NOT ONE, AND THIS IS A JUDGEMENT CALL WORTH STATING. R-02 asks for "`starmap.json`
// AND a `system.json` sibling - the hub handles both kinds". A single bundle cannot hold both:
// `packBundle` writes exactly one document per archive, and `unpackBundle` finds `starmap.json`
// first and would silently ignore a `system.json` beside it. An archive holding both would teach
// the hub a layout this engine never writes, which is the opposite of what a contract fixture is
// for. So "sibling" is honoured as a sibling FILE: two archives, one per kind, both real saves.
//
// WHAT THE FIXTURES DELIBERATELY DO NOT CARRY A LIVE COPY OF: `appVersion` here is a PINNED
// LITERAL, not `APP_VERSION`, and the zip timestamps are pinned too - because these files are
// byte-pinned, and a field that changed every release would turn the gate below into noise that
// gets regenerated unread. The value is present so the hub's reader exercises the field; it is
// fixed so the bytes only move when the LAYOUT does.
//
// So this spec pins both fixtures BYTE FOR BYTE. Change the layout and they go red, which is the
// point: the red is the reminder to bump `BUNDLE_FORMAT` and hand the hub fixtures it can learn
// from. Regenerate deliberately with:
//
//     UPDATE_HUB_FIXTURE=1 npx vitest run src/lib/io/hubFixture.spec.ts
//
// and read the diff before you commit it.
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { packBundle, unpackBundle, sniffBundle, BUNDLE_FORMAT } from './bundle';
import { classifySaveFile } from './classify';
import { hashModelBytes } from '$lib/constructs/modelStore';
import { readZipMembers } from '$lib/import/shared/zip';
import { strFromU8, strToU8, zipSync } from 'fflate';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'tests', 'fixtures');
const STARMAP_FIXTURE = join(FIXTURE_DIR, 'creator-hub-bundle.sse.zip');
const SYSTEM_FIXTURE = join(FIXTURE_DIR, 'creator-hub-system.sse.zip');

// Pinned so the archives are reproducible. Any fixed instant does; this one is simply legible.
const FIXTURE_MTIME = '2026-01-01T00:00:00.000Z';
const FIXTURE_APP_VERSION = '3.0.0';

const b64 = (s: string) => btoa(s);

// A REAL GLB CONTAINER, not a label pretending to be one. Twelve-byte header, one JSON chunk,
// padded to four bytes as the spec requires - so a consumer that sniffs the `glTF` magic finds
// what it expects instead of discovering that the canonical fixture was never a model at all.
function minimalGlb(tag: string): Uint8Array {
	const json = strToU8(
		JSON.stringify({
			asset: { version: '2.0', generator: `Star System Explorer hub contract fixture (${tag})` },
			scene: 0,
			scenes: [{ nodes: [] }],
			nodes: []
		})
	);
	const pad = (4 - (json.length % 4)) % 4;
	const chunkLen = json.length + pad;
	const total = 12 + 8 + chunkLen;
	const out = new Uint8Array(total);
	const dv = new DataView(out.buffer);
	dv.setUint32(0, 0x46546c67, true); // 'glTF'
	dv.setUint32(4, 2, true); // version 2
	dv.setUint32(8, total, true);
	dv.setUint32(12, chunkLen, true);
	dv.setUint32(16, 0x4e4f534a, true); // 'JSON'
	out.set(json, 20);
	out.fill(0x20, 20 + json.length, 20 + chunkLen); // the spec pads a JSON chunk with spaces
	return out;
}

const RUNNER_HULL = minimalGlb('shared runner hull');
const TENDER_HULL = minimalGlb('survey tender hull');

// THE ABSOLUTE ANCHORS (PHY-34). Hashing the bytes and comparing the result against a path built
// from that same hash is a comparison THROUGH ONE FUNCTION, and it cannot fail however wrong the
// hashing gets. These literals are the outside reference: the real SHA-256 of the bytes above,
// computed independently, so a change to the digest, the padding or the GLB layout goes red here.
const RUNNER_HULL_SHA256 = 'bd80fe63d2ad7dff5eb09f2ff4d4fa5f33ecb4c5c62bb6059b0b7ae0e38b6da4';
const TENDER_HULL_SHA256 = '065ffd682c64615af76a68f074ce65485b0bcb4d41bf9bd1d5397eb7fd0b5bee';

// THE CANONICAL CAMPAIGN. Deliberately small and deliberately complete: it carries one of every
// thing the hub slices on, including the awkward ones - a remote image URL that must survive
// untouched, a built-in starter graphic that is a static path rather than an upload, an asset with
// NO provenance because "no provenance recorded" is what the sharing gate actually tests, and ONE
// HULL FLOWN BY TWO SHIPS, which is the "stored once, credited once" path.
function canonicalStarmap(): any {
	return {
		// A real save carries a stable id (it is what lets the hub recognise an update rather than a
		// new map) and `routes`, which is how `classifyJsonDoc` tells a campaign from a system. The
		// previous fixture had neither, so the canonical campaign was a shape this app would have
		// refused had it arrived as plain JSON.
		id: 'starmap-hub-contract-sample',
		name: 'Hub Contract Sample',
		appVersion: FIXTURE_APP_VERSION,
		// R-12 and R-10, present so the hub's reader exercises them. Both are pinned rather than
		// produced: a byte-pinned fixture cannot carry a counter that moves.
		revision: 7,
		exportMode: 'gm',
		distanceUnit: 'ly',
		scale: { unit: 'ly', pixelsPerUnit: 10, showScaleBar: true },
		routes: [],
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
							// FULLY credited: the sharing gate's passing direction.
							image: {
								url: 'data:image/png;base64,' + b64('BELLWETHER-PNG'),
								custom: true,
								title: 'Bellwether from orbit',
								credit: 'A Painter',
								license: 'CC BY 4.0',
								sourceUrl: 'https://example.test/bellwether'
							}
						},
						{
							id: 'moon-c',
							name: 'Tally',
							kind: 'body',
							roleHint: 'moon',
							parentId: 'planet-b',
							// NOTHING recorded: the sharing gate's failing direction, in the same file.
							image: { url: 'data:image/png;base64,' + b64('TALLY-PNG'), custom: true }
						},
						{
							id: 'ship-d',
							name: 'Contract Runner',
							kind: 'construct',
							parentId: 'planet-b',
							model: {
								hash: RUNNER_HULL_SHA256,
								name: 'Runner hull',
								credit: 'A Modeller',
								license: 'CC BY 4.0',
								sourceUrl: 'https://example.test/runner-hull'
							},
							// A remote URL is someone else's hosting: never extracted, never credited here.
							image: { url: 'https://example.test/runner.jpg' }
						},
						{
							id: 'ship-e',
							name: 'Second Runner',
							kind: 'construct',
							parentId: 'star-a',
							// THE SAME HULL. One file in assets/models, one entry in ATTRIBUTIONS.md,
							// two ships listed under it.
							model: {
								hash: RUNNER_HULL_SHA256,
								name: 'Runner hull',
								credit: 'A Modeller',
								license: 'CC BY 4.0',
								sourceUrl: 'https://example.test/runner-hull'
							}
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
		// R-07: the creator's own choice of cover, pointing at a graphic the bundle actually carries.
		// Deliberately the SAME asset the map background uses, because that is the case where the
		// hub's guess would have been right anyway - and a fixture should exercise the field, not
		// prove a point.
		coverAssetId: 'asset-sector-map',
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

// THE CANONICAL SINGLE SYSTEM - the `system.json` sibling. A system save is a bare system document
// (`nodes` at the top level, no `systems` wrapper), which is a genuinely different walk for the
// hub's reader, and it carries its own model so the models directory is exercised on both kinds.
function canonicalSystem(): any {
	return {
		id: 'sys-hub-contract-single',
		name: 'Contract Anchorage',
		appVersion: FIXTURE_APP_VERSION,
		// A single system carries the LABEL but no revision - it is a slice of a campaign rather
		// than a separately versioned document. See the R-12 note in SystemView's save.
		exportMode: 'player',
		nodes: [
			{ id: 'star-anchor', name: 'Anchorage', kind: 'body', roleHint: 'star' },
			{
				id: 'planet-quay',
				name: 'Quay',
				kind: 'body',
				roleHint: 'planet',
				parentId: 'star-anchor',
				image: {
					url: 'data:image/png;base64,' + b64('QUAY-PNG'),
					custom: true,
					title: 'Quay',
					credit: 'A Painter',
					license: 'CC0 1.0'
				}
			},
			{
				id: 'ship-tender',
				name: 'Survey Tender',
				kind: 'construct',
				parentId: 'planet-quay',
				// No credit at all, so the single-system fixture exercises the gate in both directions too.
				model: { hash: TENDER_HULL_SHA256, name: 'Tender hull' }
			}
		]
	};
}

const bytesToB64 = (b: Uint8Array) => {
	let s = '';
	for (const byte of b) s += String.fromCharCode(byte);
	return btoa(s);
};

async function buildStarmapFixture(): Promise<Uint8Array> {
	const models = {
		[RUNNER_HULL_SHA256]: {
			b64: bytesToB64(RUNNER_HULL),
			meta: {
				name: 'Runner hull',
				credit: 'A Modeller',
				license: 'CC BY 4.0',
				sourceUrl: 'https://example.test/runner-hull'
			}
		}
	};
	return (await packBundle('starmap', canonicalStarmap(), { models, mtime: FIXTURE_MTIME }))!;
}

async function buildSystemFixture(): Promise<Uint8Array> {
	const models = { [TENDER_HULL_SHA256]: { b64: bytesToB64(TENDER_HULL), meta: {} } };
	return (await packBundle('system', canonicalSystem(), { models, mtime: FIXTURE_MTIME }))!;
}

function pin(built: Uint8Array, path: string, what: string) {
	if (process.env.UPDATE_HUB_FIXTURE || !existsSync(path)) {
		mkdirSync(FIXTURE_DIR, { recursive: true });
		writeFileSync(path, built);
	}
	expect(
		Buffer.from(built).equals(readFileSync(path)),
		`The ${what} bundle layout changed. If that was deliberate: bump BUNDLE_FORMAT in bundle.ts ` +
			'and regenerate with UPDATE_HUB_FIXTURE=1, in the SAME commit. The hub reads these files.'
	).toBe(true);
}

describe('the Creator Hub contract fixtures', () => {
	it('pack reproducibly - two runs, identical bytes', async () => {
		expect(Buffer.from(await buildStarmapFixture()).equals(Buffer.from(await buildStarmapFixture()))).toBe(true);
		expect(Buffer.from(await buildSystemFixture()).equals(Buffer.from(await buildSystemFixture()))).toBe(true);
	});

	it('match the checked-in archives byte for byte', async () => {
		pin(await buildStarmapFixture(), STARMAP_FIXTURE, 'starmap');
		pin(await buildSystemFixture(), SYSTEM_FIXTURE, 'system');
	});

	it('name every model file after the REAL hash of the bytes inside it', async () => {
		// The absolute anchor. `assets/models/<sha256>.glb` is only a content address if the hash is
		// the content's - the previous fixture was named `c0ffee.glb`, six hex characters that were
		// never the digest of anything, so the canonical file would have failed R-03's own assertion.
		const cases: [Uint8Array, string, Uint8Array][] = [
			[RUNNER_HULL, RUNNER_HULL_SHA256, await buildStarmapFixture()],
			[TENDER_HULL, TENDER_HULL_SHA256, await buildSystemFixture()]
		];
		for (const [bytes, expected, fixture] of cases) {
			expect(await hashModelBytes(bytes)).toBe(expected);
			expect(expected).toMatch(/^[0-9a-f]{64}$/);
			const names = Object.keys(readZipMembers(fixture, ['.glb']));
			expect(names.some((n) => n.endsWith(`assets/models/${expected}.glb`)), `missing ${expected}.glb`).toBe(true);
		}
	});

	it('stamp the format, first in the document, where a reader meets it immediately', async () => {
		const cases: [Uint8Array, string][] = [
			[await buildStarmapFixture(), 'starmap.json'],
			[await buildSystemFixture(), 'system.json']
		];
		for (const [bytes, docName] of cases) {
			expect(sniffBundle(bytes)).toBe(true);
			const members = readZipMembers(bytes, ['.json']);
			const json = strFromU8(members[Object.keys(members).find((n) => n.endsWith(docName))!]);
			// Absolute: the number the hub has pinned, not whatever the constant happens to say. If
			// you bumped BUNDLE_FORMAT deliberately, change this literal in the same commit.
			expect(JSON.parse(json).bundleFormat).toBe(1);
			expect(JSON.parse(json).bundleFormat).toBe(BUNDLE_FORMAT);
			expect(json.indexOf('"bundleFormat"')).toBeLessThan(json.indexOf('"name"'));
		}
	});

	it('carry every path prefix and doc name the hub mirrors', async () => {
		const members = readZipMembers(await buildStarmapFixture(), ['.json', '.glb', '.png', '.md', '.txt']);
		const names = Object.keys(members);
		for (const expected of [
			'starmap.json',
			`assets/models/${RUNNER_HULL_SHA256}.glb`,
			'assets/images/planet-b.png',
			'assets/images/moon-c.png',
			'assets/images/player/asset-sector-map.png',
			'ATTRIBUTIONS.md',
			'README.txt'
		]) {
			expect(names.some((n) => n.endsWith(expected)), `missing ${expected}`).toBe(true);
		}
		// A static starter graphic is a PATH, not an upload, and must never be extracted.
		expect(names.some((n) => n.includes('builtin-sse-logo'))).toBe(false);
		// ONE HULL, TWO SHIPS: stored once. Two entries here would mean the content addressing is
		// not doing the one job it exists for.
		expect(names.filter((n) => n.endsWith('.glb')).length).toBe(1);

		const sys = Object.keys(readZipMembers(await buildSystemFixture(), ['.json', '.glb', '.png', '.md', '.txt']));
		for (const expected of [
			'system.json',
			`assets/models/${TENDER_HULL_SHA256}.glb`,
			'assets/images/planet-quay.png',
			'ATTRIBUTIONS.md',
			'README.txt'
		]) {
			expect(sys.some((n) => n.endsWith(expected)), `missing ${expected}`).toBe(true);
		}
	});

	it('round-trip through our own reader, and hand the format back to the caller', async () => {
		const out = unpackBundle(await buildStarmapFixture());
		expect(out.kind).toBe('starmap');
		expect(out.format).toBe(BUNDLE_FORMAT);
		expect(out.doc.bundleFormat).toBeUndefined(); // a container property, off the campaign again
		const nodes = out.doc.systems[0].system.nodes;
		expect(nodes.map((n: any) => n.id)).toEqual(['star-a', 'planet-b', 'moon-c', 'ship-d', 'ship-e']);
		expect(nodes[1].image.url).toBe('data:image/png;base64,' + b64('BELLWETHER-PNG'));
		expect(nodes[3].image.url).toBe('https://example.test/runner.jpg'); // a remote URL, as authored
		expect(out.models[RUNNER_HULL_SHA256].b64).toBe(bytesToB64(RUNNER_HULL));
		expect(out.doc.playerAssets[0].dataUrl.startsWith('data:image/png;base64,')).toBe(true);
		expect(out.doc.playerAssets[1].dataUrl).toBe('/images/logo/SSE.png');

		const sys = unpackBundle(await buildSystemFixture());
		expect(sys.kind).toBe('system');
		expect(sys.format).toBe(BUNDLE_FORMAT);
		expect(sys.doc.nodes.map((n: any) => n.id)).toEqual(['star-anchor', 'planet-quay', 'ship-tender']);
		expect(sys.models[TENDER_HULL_SHA256].b64).toBe(bytesToB64(TENDER_HULL));
	});

	it('are files THIS APP would open - both kinds, through the one classification door', async () => {
		// R-02 asks for a REAL save. A fixture the writing app would itself refuse is not one, and
		// the previous campaign had no `routes`, so as plain JSON it classified as 'unknown'.
		const map = classifySaveFile(await buildStarmapFixture());
		expect(map.kind).toBe('starmap');
		expect(map.format).toBe(BUNDLE_FORMAT);
		const sys = classifySaveFile(await buildSystemFixture());
		expect(sys.kind).toBe('system');
		expect(sys.format).toBe(BUNDLE_FORMAT);
		// And the same documents as PLAIN JSON, which is what a JSON-only consumer would receive.
		expect(classifySaveFile(strToU8(JSON.stringify(canonicalStarmap()))).kind).toBe('starmap');
		expect(classifySaveFile(strToU8(JSON.stringify(canonicalSystem()))).kind).toBe('system');
	});

	it('carry the revision and the export-mode label the hub reads', async () => {
		const members = readZipMembers(await buildStarmapFixture(), ['.json']);
		const map = JSON.parse(
			strFromU8(members[Object.keys(members).find((n) => n.endsWith('starmap.json'))!])
		);
		expect(map.revision).toBe(7);
		expect(map.exportMode).toBe('gm');
		const sysMembers = readZipMembers(await buildSystemFixture(), ['.json']);
		const sys = JSON.parse(
			strFromU8(sysMembers[Object.keys(sysMembers).find((n) => n.endsWith('system.json'))!])
		);
		// Both label values appear across the pair, so a reader meets each at least once.
		expect(sys.exportMode).toBe('player');
		expect(sys.revision).toBeUndefined();
	});

	it('names the chosen cover, and it points at a file the archive actually holds', async () => {
		const bytes = await buildStarmapFixture();
		const members = readZipMembers(bytes, ['.json', '.png']);
		const map = JSON.parse(strFromU8(members[Object.keys(members).find((n) => n.endsWith('starmap.json'))!]));
		expect(map.coverAssetId).toBe('asset-sector-map');
		// A cover is only useful if the picture it names is actually in the bundle - a pointer to
		// nothing is worse than no pointer, because a reader follows it before falling back.
		const named = map.playerAssets.find((a: any) => a.id === map.coverAssetId);
		expect(named.dataUrl).toBe('assets/images/player/asset-sector-map.png');
		expect(Object.keys(members).some((n) => n.endsWith(named.dataUrl))).toBe(true);
	});

	it('exercise the sharing gate: one asset WITH provenance and one without, in each kind', async () => {
		for (const bytes of [await buildStarmapFixture(), await buildSystemFixture()]) {
			const members = readZipMembers(bytes, ['.md']);
			const md = strFromU8(members[Object.keys(members).find((n) => n.endsWith('ATTRIBUTIONS.md'))!]);
			expect(md).toContain('_No provenance recorded._');
			expect(md).toMatch(/- Credit: A (Painter|Cartographer|Modeller)/);
		}
	});

	it('credit a shared hull ONCE, listing both ships that fly it', async () => {
		const members = readZipMembers(await buildStarmapFixture(), ['.md']);
		const md = strFromU8(members[Object.keys(members).find((n) => n.endsWith('ATTRIBUTIONS.md'))!]);
		expect(md.split(`assets/models/${RUNNER_HULL_SHA256}.glb`).length - 1).toBe(1);
		expect(md).toContain('Contract Runner (Contract Reach), Second Runner (Contract Reach)');
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
