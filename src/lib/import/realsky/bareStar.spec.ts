// A STAR WITH NO PLANETS IS NOW A LEGAL SYSTEM (D18), and nothing downstream may assume otherwise.
//
// This needs its own test precisely because the old census guaranteed the opposite BY CONSTRUCTION:
// every system came from the Exoplanet Archive, so every system had at least one planet, and any
// code assuming that would never have been exercised. 34 of the 56 systems in a 16.5 ly import are
// now bare.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { systemProcessor } from '$lib/core/SystemProcessor';
import { fixUpImportedSystem } from '$lib/system/importFixup';
import { convertRegion } from './convert.mjs';
import { SOL_CENTRE } from './query.mjs';
import { estimateCost } from './costModel.mjs';

const repo = resolve('.');
function deepMerge(t: any, s: any): any {
	const o = { ...t };
	for (const k of Object.keys(s ?? {})) {
		if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) && k in t) o[k] = deepMerge(t[k], s[k]); else o[k] = s[k];
	}
	return o;
}
function loadPack() {
	const base = join(repo, 'static', 'rulepacks', 'starter-sf');
	let p = JSON.parse(readFileSync(join(base, 'main.json'), 'utf-8'));
	for (const f of ['construct_templates.json', 'engine-definitions.json', 'fuel-definitions.json', 'liquids.json', 'classification.json', 'atmospheres.json', 'stars.json', 'planets.json']) {
		const q = join(base, f); if (existsSync(q)) p = deepMerge(p, JSON.parse(readFileSync(q, 'utf-8')));
	}
	return p;
}
const read = (p: string) => JSON.parse(readFileSync(join(repo, p), 'utf-8'));

const pack = loadPack();
const starRows = read('static/realsky/stars.json');
const planetRows = read('scripts/starmap-build/data/cache/archive-pscomppars.json');
const solPreset = read('static/examples/Sol_2030-System.json');
const statTemplates = pack.statTemplates;

const importAt = (radiusLy: number) =>
	convertRegion({ starRows, planetRows, solPreset, statTemplates }, { region: { centre: SOL_CENTRE, radiusLy }, generated: 'test' });

describe('a bare star is a legal system', () => {
	const out = importAt(16.5);
	const planets = (s: any) => s.system.nodes.filter((n: any) => n.roleHint === 'planet');
	const bare = out.systems.filter((s: any) => planets(s).length === 0);

	it('the local neighbourhood is now mostly bare stars', () => {
		expect(out.systems.length).toBeGreaterThan(50);
		expect(bare.length).toBeGreaterThan(25);
	});

	// The real test: run every bare system through the app's ACTUAL load path. A mean-radius over an
	// empty array, a "first planet" lookup or an empty-array divide surfaces here as NaN, undefined
	// or a throw — none of which the old census could ever have produced.
	it('every bare system survives the real load path with finite physics', () => {
		const failures: string[] = [];
		for (const entry of bare) {
			let processed: any;
			try {
				processed = systemProcessor.process(fixUpImportedSystem(structuredClone(entry.system), pack), pack);
			} catch (e: any) {
				failures.push(`${entry.name}: process threw — ${e.message}`);
				continue;
			}
			for (const n of processed.nodes) {
				if (n.kind !== 'body') continue;
				if (!Number.isFinite(n.massKg)) failures.push(`${entry.name}/${n.name}: massKg ${n.massKg}`);
				if (!Number.isFinite(n.radiusKm)) failures.push(`${entry.name}/${n.name}: radiusKm ${n.radiusKm}`);
				if (n.roleHint === 'star' && !(n.temperatureK > 0)) failures.push(`${entry.name}/${n.name}: temperatureK ${n.temperatureK}`);
				if (n.calculatedGravity_ms2 !== undefined && !Number.isFinite(n.calculatedGravity_ms2)) {
					failures.push(`${entry.name}/${n.name}: gravity ${n.calculatedGravity_ms2}`);
				}
			}
		}
		expect(failures).toEqual([]);
	});

	it('a bare system carries its star and nothing else', () => {
		const one = bare[0];
		expect(one.system.nodes.length).toBeGreaterThanOrEqual(1);
		expect(one.system.nodes.every((n: any) => n.roleHint === 'star')).toBe(true);
	});

	// The size/time guardrail is quoted to the GM before they commit, so it must survive a set that
	// is mostly one-node systems — the population it was NOT calibrated on.
	it('the cost model answers for a mostly-bare set', () => {
		const c = estimateCost(out.systems);
		expect(Number.isFinite(c.kb)).toBe(true);
		expect(c.kb).toBeGreaterThan(0);
		expect(c.size).toMatch(/KB|MB/);
		expect(estimateCost([])).toMatchObject({ systems: 0, kb: 0 });
	});
});

describe('the inverted import brings back what the old one could not', () => {
	const out = importAt(16.5);

	it('includes Sol, from the shipped preset rather than the generator', () => {
		const sol = out.systems.find((s: any) => s.id === 'sys-sol');
		expect(sol).toBeDefined();
		expect(sol.system.nodes.filter((n: any) => n.roleHint === 'planet').length).toBe(9);
		// The fictional demo ship never reaches a real-sky map.
		expect(sol.system.nodes.some((n: any) => n.id === 'construct-ssto-heavy')).toBe(false);
		expect(sol.system.nodes.some((n: any) => n.name === 'International Space Station')).toBe(true);
	});

	it('includes Alpha Centauri A and B, which have no confirmed planets', () => {
		// The names are the ones a person uses, not the catalogue's shorthand (D24): the system is
		// "Alpha Centauri" rather than "alf Cen", and its two stars carry the proper names SIMBAD
		// itself gives them. Every one of these resolves back through the Resolve box.
		const ac = out.systems.find((s: any) => /Alpha Centauri/i.test(s.name));
		expect(ac).toBeDefined();
		const names = ac.system.nodes.filter((n: any) => n.roleHint === 'star').map((n: any) => n.name);
		expect(names.join(' ')).toMatch(/Rigil Kentaurus/);
		expect(names.join(' ')).toMatch(/Toliman/);
		// …and Proxima's planets come with it, joined on by position across a 60 arcsec proper-motion
		// offset that a tight tolerance would have dropped.
		expect(ac.system.nodes.filter((n: any) => n.roleHint === 'planet').length).toBeGreaterThan(0);
	});

	// A COMPANION STAR AND A PLANET SHARED AN ID NAMESPACE, AND ALPHA CENTAURI IS WHERE IT BIT.
	// Stars were id'd by POSITION (`<slug>-b`) and planets by their catalogue LETTER (`<slug>-b`), so
	// Proxima Cen **b** collided with Alpha Cen **B**. Nothing errored: the processor's lookups are
	// keyed by id, so the planet's parent resolved to the wrong node and Proxima Cen b was re-homed
	// onto the PRIMARY — 10,400 AU from where it belongs, orbiting the wrong star.
	it('gives every node in every system a UNIQUE id', () => {
		let nodes = 0;
		for (const entry of out.systems) {
			const seen = new Map<string, string>();
			for (const n of entry.system.nodes) {
				nodes++;
				expect(seen.has(n.id), `${entry.id}: id "${n.id}" is both "${seen.get(n.id)}" and "${n.name}"`).toBe(false);
				seen.set(n.id, n.name);
			}
		}
		expect(nodes).toBeGreaterThan(50); // the check is worth nothing if nothing was walked
	});

	// ALPHA CENTAURI IS THE BEST STRESS CASE THE CATALOGUE HAS, and it earns a standing test of its
	// whole SHAPE rather than of one symptom (owner, 2026-08-14). In one system it carries: three
	// stars; a tight comparable-mass pair that the processor must promote into a real barycentre; a
	// third member four hundred times further out; planets belonging to that DISTANT member and not
	// to the primary; and a component letter that collides with a planet letter. Every fault this
	// area has produced would have been caught by asserting this profile.
	//
	// ASSERTED THROUGH THE FULL LOAD PATH, not on the converter's output, because that is where the
	// damage happened: the converter was right and `process()` re-homed the planet.
	it('ALPHA CENTAURI PROFILE: three stars, a barycentre, and planets on the right one', () => {
		const ac = out.systems.find((s: any) => /Alpha Centauri/i.test(s.name))!;
		const done: any = systemProcessor.process(fixUpImportedSystem(structuredClone(ac.system)) as any, pack as any);
		const byName = (re: RegExp) => done.nodes.find((n: any) => re.test(String(n.name)));

		// 1. All three stars survive. Toliman went missing entirely under the id collision.
		const primary = byName(/Rigil Kentaurus/);
		const toliman = byName(/Toliman/);
		const proxima = done.nodes.find((n: any) => /Proxima/.test(String(n.name)) && n.roleHint === 'star');
		for (const [label, n] of [['Rigil Kentaurus', primary], ['Toliman', toliman], ['Proxima', proxima]] as const) {
			expect(n, `${label} is missing from the processed system`).toBeTruthy();
		}

		// 2. The close pair is comparable in mass, so the processor promotes it to a BARYCENTRE and
		//    both stars hang off that rather than off each other.
		const bary = done.nodes.find((n: any) => n.kind === 'barycenter');
		expect(bary, 'the AB pair did not become a barycentre').toBeTruthy();
		expect(primary.parentId).toBe(bary.id);
		expect(toliman.parentId).toBe(bary.id);

		// 3. THE SCALE, checked against the CURATED figures rather than against itself. The bundled
		//    Local Neighbourhood carries measured values for this system (Akeson et al. 2021, and the
		//    WDS): the AB pair is 23.3 AU with e = 0.524 and a 79.76 yr period, and Proxima sits at
		//    8,700 AU with e = 0.5 and a period of 547,000 years. The importer derives `a` from a
		//    PROJECTED separation, so it will not match exactly — the assertion is that it lands in
		//    the same country, and that the 375x ratio between the two survives.
		const a = (n: any) => n?.orbit?.elements?.a_AU ?? 0;
		expect(a(toliman)).toBeGreaterThan(10);   // curated 23.3
		expect(a(toliman)).toBeLessThan(60);
		expect(a(proxima)).toBeGreaterThan(3000); // curated 8,700
		expect(a(proxima)).toBeLessThan(40000);
		expect(a(proxima) / Math.max(1, a(toliman))).toBeGreaterThan(50);

		// 4. AND THE ORBITS ARE NOT CIRCLES. Every companion used to be given e = 0, where the real
		//    pair is 0.524 and Proxima 0.5 — a wide binary is eccentric, and drawing zero states a
		//    fact nobody measured.
		for (const [label, n] of [['Toliman', toliman], ['Proxima', proxima]] as const) {
			expect(n.orbit.elements.e, `${label} is on a perfect circle`).toBeGreaterThan(0.04);
			expect(n.orbit.elements.e, `${label} eccentricity is implausible`).toBeLessThan(0.9);
		}

		// 5. The planets belong to PROXIMA and orbit it closely. Under the collision they came out
		//    parented to the primary, in a tight orbit around the wrong star.
		const planets = done.nodes.filter((n: any) => n.roleHint === 'planet');
		expect(planets.length).toBeGreaterThan(0);
		for (const p of planets) {
			expect(p.parentId, `${p.name} should orbit Proxima`).toBe(proxima.id);
			expect(a(p)).toBeLessThan(1);
		}
	});

	it("keeps Proxima's planets on PROXIMA, not on the primary", () => {
		const ac = out.systems.find((s: any) => /Alpha Centauri/i.test(s.name))!;
		const proxima = ac.system.nodes.find((n: any) => /Proxima/i.test(n.name) && n.roleHint === 'star');
		expect(proxima, 'Proxima is not in the group').toBeTruthy();
		const planets = ac.system.nodes.filter((n: any) => n.roleHint === 'planet');
		expect(planets.length).toBeGreaterThan(0);
		for (const p of planets) {
			expect(p.parentId, `${p.name} is parented to ${p.parentId}, not to Proxima`).toBe(proxima.id);
		}
		// And the star ids cannot be confused with a planet letter by construction.
		for (const n of ac.system.nodes.filter((x: any) => x.roleHint === 'star')) {
			if (n.parentId) expect(n.id).toMatch(/-star-[a-z]$/);
		}
	});

	it('is not forced to include Sol when the region does not reach it', () => {
		// A 2 ly sphere around a point 40 ly away contains no Sol, and must not be given one.
		const far = convertRegion(
			{ starRows, planetRows, solPreset, statTemplates },
			{ region: { centre: { raDeg: 101.287, decDeg: -16.716, distLy: 40 }, radiusLy: 2 }, generated: 'test' }
		);
		expect(far.systems.some((s: any) => s.id === 'sys-sol')).toBe(false);
	});

	it('names every row it drops', () => {
		for (const s of out.skipped) { expect(s.hostname).toBeTruthy(); expect(s.reason).toBeTruthy(); }
	});
});
