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
		const ac = out.systems.find((s: any) => /alf Cen/i.test(s.name));
		expect(ac).toBeDefined();
		const names = ac.system.nodes.filter((n: any) => n.roleHint === 'star').map((n: any) => n.name);
		expect(names.join(' ')).toMatch(/alf Cen A/);
		expect(names.join(' ')).toMatch(/alf Cen B/);
		// …and Proxima's planets come with it, joined on by position across a 60 arcsec proper-motion
		// offset that a tight tolerance would have dropped.
		expect(ac.system.nodes.filter((n: any) => n.roleHint === 'planet').length).toBeGreaterThan(0);
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
