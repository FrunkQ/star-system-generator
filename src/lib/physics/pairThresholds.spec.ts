// WHEN A LARGE MOON BECOMES A DOUBLE PLANET, as DATA. Owner, via [[B111]]: the 8% and 5% ratios
// were hardcoded at the top of `barycenterReconcile.ts`, and the standing rule's test for what
// belongs in a file rather than a closure is "will a human want to change this after using the
// product?". Obviously yes - there is no physical discontinuity at any mass ratio, Pluto-Charon is
// called a double at 0.12 and the Earth-Moon system is not at 0.0123, and where the line falls
// between them is a matter of what a GM wants on their map.
//
// TWO THINGS ARE PINNED HERE AND THEY PULL IN OPPOSITE DIRECTIONS, which is the whole point of a
// move-it-without-changing-it commit:
//   1. the DEFAULTS still behave exactly as the hardcoded numbers did - a companion crossing 8% of
//      its host still promotes, and crossing back below 5% still demotes;
//   2. a pack can genuinely move them, or the extraction achieved nothing.
//
// AND ONE HAZARD THAT ONLY EXISTS BECAUSE A HUMAN CAN NOW EDIT THEM: the demote threshold must sit
// BELOW the promote threshold. The failure without that guard was MEASURED rather than assumed, and
// it is worse than the obvious guess. It does not oscillate visibly: promotion and demotion both
// fire on the same pair in the same pass, the reconciler burns its whole eight-iteration budget
// flipping it, and because that budget is EVEN the state that survives is always the demoted one.
// So an inverted pack silently makes the promote threshold do NOTHING - no pair ever forms, however
// massive the companion - and every other assertion in this file would still pass.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	reconcileBarycenters, pairThresholds, DEFAULT_PROMOTE_RATIO, DEFAULT_DEMOTE_RATIO
} from './barycenterReconcile';
import { SystemProcessor } from '$lib/core/SystemProcessor';
import type { RulePack, System } from '../types';

const pack = (over: Record<string, unknown>): RulePack =>
	({ generation_parameters: over }) as unknown as RulePack;

/** A star and one companion, at a mass ratio the caller chooses. */
function hostAndCompanion(ratio: number): System {
	const host = 2e30;
	return {
		id: 't', name: 'T', seed: 't', epochT0: 0, age_Gyr: 5, rulePackId: '', rulePackVersion: '', tags: [],
		nodes: [
			{ id: 'star', kind: 'body', roleHint: 'star', name: 'Sun', parentId: null, massKg: host, radiusKm: 7e5, tags: [] },
			{
				id: 'comp', kind: 'body', roleHint: 'planet', name: 'Companion', parentId: 'star', massKg: host * ratio,
				radiusKm: 7e4, tags: [],
				orbit: { hostId: 'star', hostMu: 1.33e20, t0: 0, elements: { a_AU: 5, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }
			}
		]
	} as unknown as System;
}

const paired = (sys: System) => sys.nodes.some((n) => n.kind === 'barycenter');

/** Promote at `ratio`, then re-run at `then` - the round trip a GM makes with a mass slider. */
function promoteThenSet(ratio: number, then: number, p?: RulePack): System {
	const sys = hostAndCompanion(ratio);
	reconcileBarycenters(sys, p);
	const comp = sys.nodes.find((n) => n.id === 'comp') as any;
	comp.massKg = 2e30 * then;
	reconcileBarycenters(sys, p);
	return sys;
}

describe('the pair thresholds are DATA, and the defaults are the numbers that were hardcoded', () => {
	it('reads 0.08 and 0.05 when no pack says otherwise', () => {
		expect(DEFAULT_PROMOTE_RATIO).toBe(0.08);
		expect(DEFAULT_DEMOTE_RATIO).toBe(0.05);
		for (const p of [undefined, null, pack({}), {} as RulePack]) {
			expect(pairThresholds(p)).toEqual({ promote: 0.08, demote: 0.05 });
		}
	});

	it('a companion crossing 8% of its host still promotes, and one just under still does not', () => {
		expect(paired(promoteThenSet(0.081, 0.081)), '8.1% should pair').toBe(true);
		const below = hostAndCompanion(0.079);
		reconcileBarycenters(below);
		expect(paired(below), '7.9% should not pair').toBe(false);
	});

	it('and crossing back below 5% still demotes, while 5.1% keeps the pair', () => {
		expect(paired(promoteThenSet(0.12, 0.049)), 'shrunk to 4.9% should dissolve').toBe(false);
		expect(paired(promoteThenSet(0.12, 0.051)), 'shrunk to 5.1% should hold').toBe(true);
	});

	it('the hysteresis band is real: between the two, a pair holds and a single stays single', () => {
		// 6% - above demote, below promote. Whichever state you are in, you stay in it.
		expect(paired(promoteThenSet(0.12, 0.06)), 'an existing pair at 6% holds').toBe(true);
		const fresh = hostAndCompanion(0.06);
		reconcileBarycenters(fresh);
		expect(paired(fresh), 'a fresh 6% companion does not pair').toBe(false);
	});

	it('the bundled pack carries the same two numbers, so nothing changed by being moved', () => {
		const gen = JSON.parse(readFileSync('static/rulepacks/starter-sf/generation.json', 'utf8'));
		expect(gen.generation_parameters.barycentre_promote_ratio).toBe(DEFAULT_PROMOTE_RATIO);
		expect(gen.generation_parameters.barycentre_demote_ratio).toBe(DEFAULT_DEMOTE_RATIO);
	});
});

describe('a pack can actually move them, or the extraction achieved nothing', () => {
	it('raising the bar leaves a 12% companion an ordinary planet', () => {
		const strict = pack({ barycentre_promote_ratio: 0.2, barycentre_demote_ratio: 0.15 });
		const sys = hostAndCompanion(0.12);
		reconcileBarycenters(sys, strict);
		expect(paired(sys)).toBe(false);
		// ...and the same system pairs on the defaults, so the difference IS the setting.
		const asShipped = hostAndCompanion(0.12);
		reconcileBarycenters(asShipped);
		expect(paired(asShipped)).toBe(true);
	});

	it('lowering it makes a 3% companion a double planet', () => {
		const loose = pack({ barycentre_promote_ratio: 0.02, barycentre_demote_ratio: 0.01 });
		const sys = hostAndCompanion(0.03);
		reconcileBarycenters(sys, loose);
		expect(paired(sys)).toBe(true);
		const asShipped = hostAndCompanion(0.03);
		reconcileBarycenters(asShipped);
		expect(paired(asShipped)).toBe(false);
	});

	it('and the demote figure moves with it', () => {
		const loose = pack({ barycentre_promote_ratio: 0.02, barycentre_demote_ratio: 0.01 });
		expect(paired(promoteThenSet(0.03, 0.015, loose)), '1.5% is above the pack demote').toBe(true);
		expect(paired(promoteThenSet(0.03, 0.009, loose)), '0.9% is below it').toBe(false);
	});
});

describe('a pack cannot ask for a system that never settles', () => {
	it('demote is pulled strictly under promote when a pack inverts them', () => {
		const t = pairThresholds(pack({ barycentre_promote_ratio: 0.08, barycentre_demote_ratio: 0.3 }));
		expect(t.promote).toBe(0.08);              // the promote figure is honoured as asked
		expect(t.demote).toBeLessThan(t.promote);  // ...and the hysteresis is guaranteed
		expect(t.demote).toBeCloseTo(0.08, 12);    // pulled just under, not thrown away
	});

	it('equal thresholds are separated too, so no ratio can satisfy both tests at once', () => {
		const t = pairThresholds(pack({ barycentre_promote_ratio: 0.1, barycentre_demote_ratio: 0.1 }));
		expect(t.demote).toBeLessThan(t.promote);
	});

	it('and an inverted pack STILL FORMS PAIRS - which is the whole reason the guard exists', () => {
		// Without the clamp this is what actually breaks, and it breaks quietly: the promote figure is
		// obeyed and then immediately undone, so a companion at ANY ratio ends up an ordinary planet.
		const inverted = pack({ barycentre_promote_ratio: 0.08, barycentre_demote_ratio: 0.5 });
		for (const ratio of [0.09, 0.12, 0.4, 0.9]) {
			const sys = hostAndCompanion(ratio);
			reconcileBarycenters(sys, inverted);
			expect(paired(sys), `${ratio} under an inverted pack`).toBe(true);
		}
		// ...and it settles, rather than spending the reconciler's whole budget flipping.
		const sys = hostAndCompanion(pairThresholds(inverted).promote);
		reconcileBarycenters(sys, inverted);
		const after = JSON.stringify(sys);
		reconcileBarycenters(sys, inverted);
		expect(JSON.stringify(sys), 'reconciling again changed the system').toBe(after);
	});

	it('nonsense falls back to the defaults rather than to a system that cannot settle', () => {
		for (const bad of [NaN, 0, -1, 2, Infinity, '0.2', null, undefined, {}]) {
			expect(pairThresholds(pack({ barycentre_promote_ratio: bad, barycentre_demote_ratio: bad })), String(bad))
				.toEqual({ promote: DEFAULT_PROMOTE_RATIO, demote: DEFAULT_DEMOTE_RATIO });
		}
	});
});

// The reconciler runs inside `process()`, which is where the pack actually arrives. If the pack were
// not threaded through, every gate above would pass and the setting would still do nothing on a real
// map - the same shape of hole as a gate that passes with its bug present.
describe('the setting reaches the engine, not just the reconciler', () => {
	function loadStarterPack(): RulePack {
		const base = 'static/rulepacks/starter-sf';
		const merge = (a: any, b: any): any => {
			const o: any = { ...a };
			for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && a?.[k] ? merge(a[k], v) : v;
			return o;
		};
		let p: any = JSON.parse(readFileSync(`${base}/main.json`, 'utf8'));
		for (const f of ['stars.json', 'planets.json', 'generation.json', 'orbital_constants.json', 'classification.json', 'atmospheres.json', 'liquids.json']) {
			try { p = merge(p, JSON.parse(readFileSync(`${base}/${f}`, 'utf8'))); } catch { /* optional */ }
		}
		return p as RulePack;
	}

	it('a full process() pass honours the pack figure, not the default', () => {
		const shipped = loadStarterPack();
		const strict = JSON.parse(JSON.stringify(shipped));
		strict.generation_parameters.barycentre_promote_ratio = 0.2;
		strict.generation_parameters.barycentre_demote_ratio = 0.15;

		expect(paired(new SystemProcessor().process(hostAndCompanion(0.12), shipped)), 'shipped pack pairs at 12%').toBe(true);
		expect(paired(new SystemProcessor().process(hostAndCompanion(0.12), strict)), 'strict pack does not').toBe(false);
	});
});
