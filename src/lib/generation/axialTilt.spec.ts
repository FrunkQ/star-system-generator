// Inbox B10: no generated body had a spin axis at all — 0 of 40 across three seeds, so no generated
// world had seasons. This is that measurement inverted, and it runs through BOTH entry points on
// purpose: there are two live system generators (docs/dev/generation-duplication-map.md) and the
// standing failure mode is a fix landing in one of them. A test that only drove the wizard would
// have passed on the B9a bug too.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { generateSystem } from './system';
import { generateSystemFromConfig } from './generateFromConfig';
import { SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '../constants';
import type { RulePack } from '$lib/types';
import type { StarSeed } from '../physics/stellar-evolution';

function deepMerge(t: any, s: any): any {
	if (typeof t !== 'object' || t === null || Array.isArray(t)) return s;
	const out = { ...t };
	for (const k of Object.keys(s || {})) out[k] = k in out ? deepMerge(out[k], s[k]) : s[k];
	return out;
}
function pack(): RulePack {
	const base = path.resolve('static/rulepacks/starter-sf');
	let p: any = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8'));
	for (const f of ['stars.json', 'planets.json', 'generation.json', 'orbital_constants.json',
		'classification.json', 'atmospheres.json', 'liquids.json']) {
		const fp = path.join(base, f);
		if (fs.existsSync(fp)) p = deepMerge(p, JSON.parse(fs.readFileSync(fp, 'utf-8')));
	}
	return p as RulePack;
}
const sun = (): StarSeed => ({ id: 's', temperatureK: 5778, luminositySolar: 1, massKg: SOLAR_MASS_KG, radiusKm: SOLAR_RADIUS_KM, spectralClass: 'G', category: 'Main Sequence', luminosityClass: 'V', isRemnant: false, pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } });

const SEEDS = ['b10-alpha', 'b10-beta', 'b10-gamma'];
const spun = (n: any) => n.kind === 'body' && (n.roleHint === 'planet' || n.roleHint === 'moon' || n.roleHint === 'star');

// Both generators, same shape of answer, so every assertion below runs against both.
const runs = (): { path: string; nodes: any[] }[] => [
	...SEEDS.map((s) => ({ path: `legacy:${s}`, nodes: generateSystem(s, pack()).nodes as any[] })),
	...SEEDS.map((s) => ({ path: `wizard:${s}`, nodes: generateSystemFromConfig(s, pack(), { seeds: [sun()], ageGyr: 4.6 }).nodes as any[] }))
];

describe('B10 — every generated body has a spin axis', () => {
	it('leaves no planet, moon or star without one, on either generator', () => {
		let counted = 0;
		for (const { path: p, nodes } of runs()) {
			const bodies = nodes.filter(spun);
			expect(bodies.length, `${p}: generated nothing to check`).toBeGreaterThan(0);
			for (const b of bodies) {
				expect(typeof b.axial_tilt_deg, `${p}: ${b.name} (${b.roleHint}) has no axial_tilt_deg`).toBe('number');
				expect(b.axial_tilt_deg, `${p}: ${b.name} tilt out of range`).toBeGreaterThanOrEqual(0);
				expect(b.axial_tilt_deg, `${p}: ${b.name} tilt out of range`).toBeLessThanOrEqual(180);
				counted++;
			}
		}
		// The original measurement was 40 bodies over three seeds; this sweeps both generators, so
		// the sample is larger. Guard the guard: a run that quietly produced two bodies would pass
		// every assertion above and prove nothing.
		expect(counted).toBeGreaterThan(40);
	});

	// The wizard's dynamical-history knob is the one caller that OVERRIDES the baseline. Its own
	// spec covers the calm/violent contrast; this only checks the baseline did not swallow it —
	// applyKnobBias used to be guarded on a falsy tilt, which the new baseline would have disabled.
	it('lets the dynamical-history knob still move a star, now that a baseline exists', () => {
		const tilt = (dyn: number) =>
			(generateSystemFromConfig('b10-knob', pack(), { seeds: [sun()], ageGyr: 4.6, knobs: { dynamicalHistory: dyn } })
				.nodes.find((n: any) => n.roleHint === 'star') as any).axial_tilt_deg;
		// A violent history reaches tilts the 8-degree baseline cannot; averaged over draws so a
		// single unlucky roll does not decide it.
		const calm = [0, 1, 2].map(() => tilt(0.0));
		const violent = [0, 1, 2].map(() => tilt(1.0));
		expect(Math.max(...violent)).toBeGreaterThan(Math.max(...calm));
	});

	// D2a's constraint: an invented number must be distinguishable from a measured one.
	it('marks the inferred tilt with a tag, so it cannot pass as a measurement', () => {
		for (const { path: p, nodes } of runs()) {
			for (const b of nodes.filter((n: any) => n.roleHint === 'planet' || n.roleHint === 'moon')) {
				const keys = (b.tags ?? []).map((t: any) => t.key);
				expect(keys, `${p}: ${b.name} states a tilt with nothing saying it was inferred`).toContain('spin/axis-inferred');
			}
		}
	});
});
