// Inbox B10: no generated body had a spin axis at all — 0 of 40 across three seeds, so no generated
// world had seasons. This is that measurement inverted, and it runs through BOTH entry points on
// purpose: there are two live system generators (docs/dev/generation-duplication-map.md) and the
// standing failure mode is a fix landing in one of them. A test that only drove the wizard would
// have passed on the B9a bug too.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { generateSystem } from './system';
import { inferAxialTilt } from '../physics/axialTilt';
import { generateSystemFromConfig } from './generateFromConfig';
import { SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '../constants';
import type { RulePack } from '$lib/types';
import type { StarSeed } from '../physics/stellar-evolution';
import { spinProvenanceTags } from './spinProvenance';

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
		// Guard the guard: a run that quietly produced two bodies would pass every assertion above
		// and prove nothing.
		//
		// THE FLOOR MOVED FROM 40 TO 20 WHEN B57 LANDED, AND THE REASON IS A CORRECTION RATHER THAN A
		// REGRESSION. The legacy generator draws `star/M` for all three seeds. Its luminosity used to
		// come from a `radiation_output` band of 0.8..1500 solar - wrong by up to 60,000x for an M
		// dwarf - and is now COMPUTED from the band's own radius and temperature, giving 0.002..0.04,
		// which is what a real M dwarf emits. A dimmer star has a smaller disc and closer zones, so
		// these systems now produce 1-3 planets rather than a crowd: 34 bodies over the six runs
		// instead of 40-plus. Nothing lost its spin axis; there are simply fewer bodies, correctly.
		expect(counted).toBeGreaterThan(20);
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

	// The same rule for the rotation period, which is the other value nothing re-derives. A locked
	// body is exempt because SystemProcessor's lockedSpin replaces the roll before anyone sees it.
	it('marks an inferred rotation period too, except where the lock overrides it', () => {
		for (const { path: p, nodes } of runs()) {
			for (const b of nodes.filter((n: any) => (n.roleHint === 'planet' || n.roleHint === 'moon') && n.rotation_period_hours && !n.tidallyLocked)) {
				const keys = (b.tags ?? []).map((t: any) => t.key);
				expect(keys, `${p}: ${b.name} states a rotation period with nothing saying it was inferred`).toContain('spin/period-inferred');
			}
		}
	});

	// C3(c): a satellite's reference plane is a DECISION the generator makes, so check it was made
	// on the physics rather than left at the default. Both regimes must appear across these seeds --
	// all-equatorial would mean the switch never fires, all-ecliptic that it always does.
	// Its own, wider seed list: measured across eight seeds and both generators, 24% of moons land
	// beyond their host's Laplace radius, and on the legacy path it is nearer 8% — so three seeds can
	// legitimately contain none and the test would flap. Sized to the phenomenon, not trimmed to fit.
	it('frames distant moons to the system plane and close ones to the host equator', () => {
		const wide = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];
		const wideRuns = [
			...wide.map((s) => ({ path: `legacy:${s}`, nodes: generateSystem(s, pack()).nodes as any[] })),
			...wide.map((s) => ({ path: `wizard:${s}`, nodes: generateSystemFromConfig(s, pack(), { seeds: [sun()], ageGyr: 4.6 }).nodes as any[] }))
		];
		let ecliptic = 0, equatorial = 0;
		for (const { path: p, nodes } of wideRuns) {
			const byId = new Map(nodes.map((n: any) => [n.id, n]));
			for (const m of nodes.filter((n: any) => n.roleHint === 'moon')) {
				const host: any = byId.get(m.parentId);
				expect(host, `${p}: ${m.name} has no host`).toBeTruthy();
				if (m.orbit?.frame === 'ecliptic') ecliptic++;
				else equatorial++;
			}
		}
		expect(equatorial + ecliptic, 'no moons generated to check').toBeGreaterThan(20);
		expect(ecliptic, 'no moon was framed to the system plane — the Laplace switch never fired').toBeGreaterThan(0);
		expect(equatorial, 'every moon was framed to the system plane — the switch fires unconditionally').toBeGreaterThan(0);
	});
});

// The rule above is only enforced on the routes these tests can DRIVE. There is a third
// (docs/dev/generation-duplication-map.md §2): SystemView's inline literal, which builds its body by
// hand inside an event handler and touches neither BodyFactory nor _generatePlanetaryBody. It is not
// callable from a unit test until the V2.3 tidy-up folds it into the factory, and "not testable yet"
// is exactly the gap that let B9a ship — a rule enforced on two of three routes reads as enforced.
//
// So the DECISION was extracted into spinProvenance.ts and is tested directly, and the routes are
// checked structurally for calling it. The structural half is a weaker guarantee than behaviour and
// is not pretending otherwise: it cannot tell you the tag came out right, only that the site did not
// quietly grow its own copy of the rule again.
describe('B10/D2a — the provenance rule reaches every body-creation route', () => {
	it('decides on re-derivation, not on which field it is', () => {
		expect(spinProvenanceTags({ axial_tilt_deg: 23.4, rotation_period_hours: 24 }).map((t) => t.key))
			.toEqual(['spin/axis-inferred', 'spin/period-inferred']);
		// A locked body's period is replaced by SystemProcessor's lockedSpin, so the roll never
		// reaches the reader and claiming it was inferred would be noise.
		expect(spinProvenanceTags({ axial_tilt_deg: 5, rotation_period_hours: 0, tidallyLocked: true }).map((t) => t.key))
			.toEqual(['spin/axis-inferred']);
		// Nothing invented, nothing claimed.
		expect(spinProvenanceTags({})).toEqual([]);
		// A tilt of exactly zero is still a stated tilt — guard the null check, not a falsy one.
		expect(spinProvenanceTags({ axial_tilt_deg: 0 }).map((t) => t.key)).toEqual(['spin/axis-inferred']);
	});

	it('is called by every site that invents a spin value, including the one no test can drive', () => {
		const sites = [
			'src/lib/generation/planet.ts',            // both system generators reach this
			'src/lib/components/SystemView.svelte'     // the manual add-a-body route
		];
		for (const rel of sites) {
			const src = fs.readFileSync(path.resolve(rel), 'utf-8');
			expect(src, `${rel} invents a spin value without calling the shared provenance rule`).toContain('spinProvenanceTags');
			// And it must not have grown a private copy of the rule alongside the shared one.
			expect(src.includes("{ key: 'spin/axis-inferred' }"), `${rel} pushes the tag directly instead of using the helper`).toBe(false);
		}
	});
});

// A70: tides erode the roll. A body the caller knows has DESPUN — locked or in a spin-orbit
// resonance — draws a small Cassini-state obliquity, never the two-population formation roll, and
// never carries the tipped flag (the impact history is erased with the spin). The un-despun draw
// must be bit-identical to what it always was, or every saved seed re-rolls (the B9a rule).
describe('a despun body cannot keep a formation tilt (A70)', () => {
	it('despun draws are small, never tipped, and deterministic', () => {
		for (let i = 0; i < 200; i++) {
			const r = inferAxialTilt(`body-${i}`, null, true);
			expect(r.tiltDeg).toBeLessThanOrEqual(5);
			expect(r.tipped).toBe(false);
			expect(r).toEqual(inferAxialTilt(`body-${i}`, null, true));
		}
	});

	it('the un-despun draw is unchanged by the flag existing (saved seeds do not re-roll)', () => {
		// The catastrophe population must still appear (Uranus and Venus are real), and the same id
		// must give the same answer whether the third argument is omitted or explicitly false.
		let tipped = 0;
		for (let i = 0; i < 500; i++) {
			const a = inferAxialTilt(`seed-${i}`, null);
			const b = inferAxialTilt(`seed-${i}`, null, false);
			expect(a).toEqual(b);
			if (a.tipped) tipped++;
		}
		expect(tipped).toBeGreaterThan(20); // ~10% of 500
	});
});
