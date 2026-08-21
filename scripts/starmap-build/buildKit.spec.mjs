// The build kit must reproduce the maps it ships.
//
// It stopped doing so for a month and nobody noticed (D4): twelve fixes were
// applied to the JSON and never back-ported, so `node build-starmaps.mjs` would
// have silently reverted C3's ecliptic frame flags, Adrian's radius, both ships'
// Astrophage drives and a re-parenting -- while succeeding, printing its usual
// two lines, and leaving a diff too large to read. That is the failure mode this
// test exists for: not a broken build, a working build that quietly undoes work.
//
// So: rebuild into a temp directory and compare with what ships, byte for byte.
// Whichever side moves, this fails at the moment it moves.
//
// Two normalisations, both deliberate and both narrow:
//   - line endings, because core.autocrlf rewrites the working copy on checkout
//     while the generator always writes LF. A checkout artefact, not content.
//   - appVersion, because it is a stamp of WHICH BUILD generated the map, read
//     from package.json, and every release bumps it. Comparing it would mean
//     regenerating all three files on every patch release to keep a test green,
//     which is how a test gets deleted.
// Everything else -- every value, key order, and the indentation itself -- is
// compared exactly.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const builder = join(here, 'build-starmaps.mjs');
const shippedDir = join(repo, 'static', 'example-starmaps');

const FILES = [
	'Local_Neighbourhood-Starmap.json',
	'Local_Neighbourhood_SciFi-Starmap.json',
	'manifest.json'
];

const normalise = (text) =>
	text.replace(/\r\n/g, '\n').replace(/"appVersion": "[^"]*"/, '"appVersion": "<stamp>"');

// A 300 KB string mismatch is not a test failure anyone can act on, so when the
// bytes differ we say WHICH VALUES differ, keyed by node id rather than by array
// index so a re-ordering reads as a move instead of four hundred changes.
function valueDifferences(a, b, path, out) {
	if (a === b) return out;
	const ta = a === null ? 'null' : Array.isArray(a) ? 'array' : typeof a;
	const tb = b === null ? 'null' : Array.isArray(b) ? 'array' : typeof b;
	if (ta !== tb) {
		out.push(`${path}: ${ta} -> ${tb}`);
		return out;
	}
	if (ta === 'object') {
		for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
			if (!(k in a)) out.push(`${path}.${k}: added by the build`);
			else if (!(k in b)) out.push(`${path}.${k}: dropped by the build`);
			else valueDifferences(a[k], b[k], `${path}.${k}`, out);
		}
		return out;
	}
	if (ta === 'array') {
		if (a.length !== b.length) out.push(`${path}: ${a.length} entries -> ${b.length}`);
		for (let i = 0; i < Math.max(a.length, b.length); i++)
			valueDifferences(a[i], b[i], `${path}[${i}]`, out);
		return out;
	}
	out.push(`${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
	return out;
}

function byId(text) {
	const map = JSON.parse(text);
	for (const s of map.systems ?? []) {
		s.system.nodes = Object.fromEntries(s.system.nodes.map((n) => [n.id, n]));
	}
	if (map.systems) map.systems = Object.fromEntries(map.systems.map((s) => [s.id, s]));
	return map;
}

function report(file, shipped, rebuilt) {
	const diffs = valueDifferences(byId(shipped), byId(rebuilt), file, []);
	if (!diffs.length) {
		return `${file}: the two parse to the same values but the FILES differ -- key order or\nindentation has drifted. The generator writes JSON.stringify(obj, null, 1).`;
	}
	const shown = diffs.slice(0, 25);
	return [
		`${file}: ${diffs.length} value(s) differ between the shipped map and a fresh build.`,
		'Left = what ships, right = what the kit now produces. Decide which is right:',
		'a fix applied to the JSON belongs in scripts/starmap-build/ (see D4d), and a',
		'deliberate generator change belongs in the shipped file via a rebuild.',
		...shown.map((d) => '  ' + d),
		...(diffs.length > shown.length ? [`  ...and ${diffs.length - shown.length} more`] : [])
	].join('\n');
}

describe('starmap build kit', () => {
	let outDir;
	beforeAll(() => {
		outDir = mkdtempSync(join(tmpdir(), 'starmap-build-'));
		// Also the only coverage of the build itself: it throws on duplicate node
		// ids (D3), so a non-zero exit here is a real failure, not a harness fault.
		execFileSync(process.execPath, [builder, '--out', outDir], { stdio: 'pipe' });
	}, 120000);
	afterAll(() => {
		if (outDir) rmSync(outDir, { recursive: true, force: true });
	});

	for (const file of FILES) {
		it(`reproduces ${file}`, () => {
			const shipped = normalise(readFileSync(join(shippedDir, file), 'utf-8'));
			const rebuilt = normalise(readFileSync(join(outDir, file), 'utf-8'));
			if (shipped !== rebuilt) throw new Error(report(file, shipped, rebuilt));
			expect(rebuilt).toBe(shipped);
		});
	}
});
