// THE TWELVE STANDALONE EXAMPLES HAVE NO GUARD AT ALL, AND ONE OF THEM IS A BUILD INPUT (D9).
//
// `buildKit.spec.mjs` next door compares only `static/example-starmaps/` — the two bundled maps and
// the manifest. Nothing regenerated, compared or validated the files a GM loads from the examples
// list, and `Sol_2030-System.json` is read WHOLESALE by `build-starmaps.mjs`, so an edit there
// silently moves BOTH bundled maps. The pin test would catch the consequence and then point at the
// generator rather than at the example that actually changed. This file sits beside it deliberately:
// same directory, same job, opposite technique.
//
// THIS IS NOT D4d's PIN AND CANNOT BE. These files are hand-authored, not generated, so there is
// nothing to regenerate and diff against. What they can have is INVARIANTS: things that must hold of
// any system whatever its content. Every check below is either something the physics needs in order
// to answer at all, or the mechanical fingerprint of a fault that has already shipped once.
//
// Evidence that unguarded files drift exactly as D9 predicted — both found by this file's first run:
//   - `Sol_Expanse` still carried Pluto and Charon with their BARYCENTRE's heliocentric elements,
//     four months after C3 looked at that file and nine days after C7 swept it (D14). Fixed.
//   - `Uggi` carried a barycentre whose parent was not in the file. Repaired (D23); the list below
//     is empty again, and this test is what proves it.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = resolve(here, '..', '..', 'static', 'examples');
const FILES = readdirSync(examplesDir).filter((f) => f.endsWith('-System.json')).sort();
const load = (f) => JSON.parse(readFileSync(join(examplesDir, f), 'utf-8'));

// A body needs these to be given a temperature, a size on screen, or a place in a hierarchy. Belts
// and rings are annuli, and stations and constructs are hardware; none is a sphere with a density.
const NEEDS_MASS_AND_RADIUS = (n) =>
	n.kind === 'body' && !['belt', 'ring', 'station', 'construct'].includes(n.roleHint);

// EMPTY, AND IT MUST STAY THAT WAY. The assertion below is `toEqual(KNOWN_UNRESOLVED)`, not a
// filter, so this test goes red on a NEW break AND on a listed one being FIXED — which is what
// stops an allowlist quietly becoming permanent. It held exactly one entry, and holds none now.
//
// D23, REPAIRED v2.1.744-beta. Uggi's "Hades-Cerebus Alpha Barycenter" pointed `parentId` and
// `orbit.hostId` at `bary-auto-id-1771108225594-0gusavqhj`, which was not in the file, so
// `pathToRoot` DIED for Cerebus Alpha and nothing downstream of it — distance to star,
// temperature, eclipses — could be derived at all. The engine half was fixed at v2.1.538
// (`stripAutoBarycenters` no longer deletes a barycentre out from under a node that points at it);
// this is the data half. The orphan barycentre is GONE and Cerebus Alpha now orbits Hades
// directly, like its two siblings. Nothing was invented: the file names the host in Alpha's own
// description ("its extremely close orbit to Hades"), and the separation is the barycentre's own
// authored `a_AU` — 0.00029238 AU, which its `hostMu` and `n_rad_per_s` agree with, so it was a
// Hades-scale orbit written to the wrong node rather than a number anyone has to guess.
const KNOWN_UNRESOLVED = [];

describe('the standalone examples are structurally sound', () => {
	it('finds all twelve files', () => {
		expect(FILES.length).toBe(12);
	});

	// D3: `nodeById` is a `.find()`, so a second node under one id is simply unreachable — you cannot
	// select it, and anything pointing at that id resolves silently to the other one. Two such pairs
	// shipped for four months in the generated maps before anyone looked. The generator throws on
	// this now; nothing has ever checked these files.
	it('gives every node a unique id within its file', () => {
		const clashes = [];
		for (const f of FILES) {
			const seen = new Map();
			for (const n of load(f).nodes ?? []) {
				if (seen.has(n.id)) clashes.push(`${f}: "${n.id}" is both "${seen.get(n.id)}" and "${n.name}"`);
				else seen.set(n.id, n.name);
			}
		}
		expect(clashes).toEqual([]);
	});

	// Every reference must land somewhere in the same file. A dangling parent breaks `pathToRoot`,
	// which the distance-to-star walk, the temperature range and the eclipse search all rely on — so
	// the body does not merely look wrong, it cannot be answered for.
	it('resolves every parentId, orbit.hostId and barycentre memberId', () => {
		const unresolved = [];
		for (const f of FILES) {
			const nodes = load(f).nodes ?? [];
			const ids = new Set(nodes.map((n) => n.id));
			for (const n of nodes) {
				const label = `${f}: "${n.name}" (${n.id})`;
				if (n.parentId != null && !ids.has(n.parentId)) unresolved.push(`${label} parentId -> ${n.parentId}`);
				if (n.orbit?.hostId != null && !ids.has(n.orbit.hostId)) unresolved.push(`${label} orbit.hostId -> ${n.orbit.hostId}`);
				for (const m of n.memberIds ?? []) if (!ids.has(m)) unresolved.push(`${label} memberId -> ${m}`);
			}
		}
		expect(unresolved.sort()).toEqual(KNOWN_UNRESOLVED);
	});

	it('gives every file exactly one root', () => {
		const bad = [];
		for (const f of FILES) {
			const roots = (load(f).nodes ?? []).filter((n) => n.parentId == null);
			if (roots.length !== 1) bad.push(`${f}: ${roots.length} roots (${roots.map((r) => r.name).join(', ')})`);
		}
		expect(bad).toEqual([]);
	});

	it('gives every body the mass and radius the physics needs', () => {
		const missing = [];
		for (const f of FILES) {
			for (const n of load(f).nodes ?? []) {
				if (!NEEDS_MASS_AND_RADIUS(n)) continue;
				if (!(n.massKg > 0)) missing.push(`${f}: "${n.name}" has no massKg`);
				if (!(n.radiusKm > 0)) missing.push(`${f}: "${n.name}" has no radiusKm`);
			}
		}
		expect(missing).toEqual([]);
	});

	// D14's fingerprint, and it earns its place by being MECHANICAL. A barycentre member orbits the
	// BARYCENTRE, in the system plane; the barycentre orbits the star. Two different orbits, which do
	// not share an eccentricity or an inclination. When they do, someone copied one into the other —
	// which is exactly what had happened to Pluto and Charon in three files, leaving the pair
	// permanently lined up with the Sun and eclipsing every six days instead of twice in 248 years.
	it("never gives a barycentre member its own barycentre's orbital elements", () => {
		const copied = [];
		for (const f of FILES) {
			const nodes = load(f).nodes ?? [];
			const byId = new Map(nodes.map((n) => [n.id, n]));
			for (const n of nodes) {
				if (n.kind !== 'body') continue;
				const parent = byId.get(n.parentId);
				if (parent?.kind !== 'barycenter') continue;
				const a = n.orbit?.elements, b = parent.orbit?.elements;
				if (!a || !b) continue;
				if (a.e === b.e && a.i_deg === b.i_deg && (a.e !== 0 || a.i_deg !== 0)) {
					copied.push(`${f}: "${n.name}" has e=${a.e} i_deg=${a.i_deg}, identical to "${parent.name}"`);
				}
			}
		}
		expect(copied).toEqual([]);
	});
});
