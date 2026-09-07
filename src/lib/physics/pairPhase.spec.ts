// B111 - "BINARIES NOT BINARYING". Reported with a file and a video: *"they are not at the right
// point on their orbital paths to look and act like a barycentre... they rotate at the same time and
// not AROUND each other."*
//
// TWO SEPARATE FAULTS, both measured on the reporter's own campaign (a hierarchical triple: a heavy
// star, and a tight pair of two lighter ones 617 AU out). The file itself is never committed - the
// standing rule for `user-test-files` - so the shapes below are SYNTHESISED from it and carry the
// numbers that made each one visible.
//
// 1. THE PAIR'S PHASE. `M(t) = M0 + n*(t - t0)`. Every element of a pair's relative orbit had a
//    single owner in `SystemProcessor.processBarycenters` EXCEPT `t0`, so two members were given the
//    same mean anomaly at different epochs - which is not "opposite each other" but a FIXED `n*dt`
//    apart, constant rather than drifting because `n` is shared. That constancy is exactly what the
//    report describes. Measured on the real file: 240.7 degrees out, and the angle between the two
//    bodies seen from their own barycentre ran 49.9 / 30.6 / 132.1 / 121.9 across one period where
//    it must be 180 at every instant.
//
// 2. THE PAIR'S MEMBERSHIP. The outer barycentre still named the star that had since become half of
//    the inner pair. `promoteMassiveCompanion` moved that star's ORBIT, its HOST and (since B98) its
//    co-orbital MARKER up to the new pair, but not its MEMBERSHIP of the barycentre above. Nothing
//    repaired it either: the reconciler only ever asked whether a member still EXISTED. So the outer
//    pair's `effectiveMassKg` was short by a whole star (1.9957e30 against a true 2.1490e30) and it
//    was 1811x out of balance - the outer star sat 0.06 AU from the centre with a 223-day period
//    while its "partner" swung 617 AU out over fifteen thousand years. It did not orbit at all.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SystemProcessor } from '$lib/core/SystemProcessor';
import { reconcileBarycenters } from './barycenterReconcile';
import { propagateState3D, rephasedM0, orbitMeanMotion } from './orbits';
import { G } from '../constants';
import type { RulePack, Barycenter, System } from '$lib/types';

function loadPack(): any {
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
	return p;
}
const pack = loadPack() as RulePack;
const process = (s: any, times = 1) => {
	for (let i = 0; i < times; i++) s = new SystemProcessor().process(s, pack);
	return s;
};
const byId = (s: any, id: string) => (s.nodes as any[]).find((n) => n.id === id);

/** The angle between two nodes as seen from the point they both orbit. A pair must read 180. */
function separationAngleDeg(a: any, b: any, tMs: number): number {
	const ra = propagateState3D(a, tMs).r;
	const rb = propagateState3D(b, tMs).r;
	const dot = ra.x * rb.x + ra.y * rb.y + ra.z * rb.z;
	const mag = Math.hypot(ra.x, ra.y, ra.z) * Math.hypot(rb.x, rb.y, rb.z);
	if (!(mag > 0)) return NaN;
	return (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI;
}

/** Sampled right across one period, because a phase error at t0 alone can hide in a lucky sample. */
function anglesAcrossAPeriod(a: any, b: any, samples = 8): number[] {
	const n = Math.abs(orbitMeanMotion(a.orbit));
	const periodMs = ((2 * Math.PI) / n) * 1000;
	return Array.from({ length: samples }, (_, i) => separationAngleDeg(a, b, a.orbit.t0 + (periodMs * i) / samples));
}

// The reporter's shape, to scale: a heavy primary, and two lighter stars that pair up 617 AU out.
// The DIVERGENCE is the point - `Bb` was placed at a different moment on the campaign clock, so its
// orbit carries a different epoch, which is all it took.
const SUN = 1.989e30;
const T_A = 27_542_822_528_000;   // the campaign clock when the outer star was placed
const T_B = 27_879_204_427_000;   // ...and when the companion was, 3,893 days later
const kepler = (a_AU: number, e = 0.53, omega = 43.23, M0 = 4.7495) =>
	({ a_AU, e, i_deg: 3.5, omega_deg: omega, Omega_deg: 276.36, M0_rad: M0 });

/** Two comparable stars at ONE host, placed at different moments: the promotion path. */
function pairPlacedAtDifferentMoments(): System {
	return {
		id: 'ps', name: 'Pair', seed: 'ps', epochT0: T_A, age_Gyr: 5, rulePackId: '', rulePackVersion: '', tags: [],
		nodes: [
			{ id: 'A', kind: 'body', roleHint: 'star', name: 'A', parentId: null, massKg: 1.8324e30, radiusKm: 7e5, tags: [] },
			{
				id: 'Ba', kind: 'body', roleHint: 'star', name: 'Ba', parentId: 'A', massKg: 1.6329e29, radiusKm: 3e5, tags: [],
				orbit: { hostId: 'A', hostMu: G * 1.8324e30, t0: T_A, elements: kepler(617.236, 0.4724, 62.98, 6.2298) }
			},
			{
				id: 'Bb', kind: 'body', roleHint: 'star', name: 'Bb', parentId: 'Ba', massKg: 1.5330e29, radiusKm: 3e5, tags: [],
				orbit: { hostId: 'Ba', hostMu: G * 1.6329e29, t0: T_B, elements: kepler(1.3644) }
			}
		]
	} as unknown as System;
}

/** The file AS SAVED with the fault already in it: a pair whose members carry different epochs. */
function pairSavedOutOfPhase(): System {
	return {
		id: 'ps', name: 'Pair', seed: 'ps', epochT0: T_A, age_Gyr: 5, rulePackId: '', rulePackVersion: '', tags: [],
		nodes: [
			{
				id: 'bary', kind: 'barycenter', name: 'B Barycentre', parentId: null,
				memberIds: ['Ba', 'Bb'], effectiveMassKg: 3.1659e29, tags: [{ key: 'barycenter/auto' }]
			},
			{
				id: 'Ba', kind: 'body', roleHint: 'star', name: 'Ba', parentId: 'bary', massKg: 1.6329e29, radiusKm: 3e5, tags: [],
				orbit: { hostId: 'bary', hostMu: G * 3.1659e29, t0: T_A, n_rad_per_s: 4.98466646685888e-8, elements: kepler(0.6607, 0.5298, 223.23) }
			},
			{
				id: 'Bb', kind: 'body', roleHint: 'star', name: 'Bb', parentId: 'bary', massKg: 1.5330e29, radiusKm: 3e5, tags: [],
				orbit: { hostId: 'bary', hostMu: G * 3.1659e29, t0: T_B, n_rad_per_s: 4.98466646685888e-8, elements: kepler(0.7038, 0.5298, 43.23) }
			}
		]
	} as unknown as System;
}

/** The membership fault as saved: the outer pair still names a star that is now half of an inner one. */
function outerPairNamingAPromotedMember(): System {
	return {
		id: 'ps', name: 'Triple', seed: 'ps', epochT0: T_A, age_Gyr: 5, rulePackId: '', rulePackVersion: '', tags: [],
		nodes: [
			{
				id: 'root', kind: 'barycenter', name: 'Root', parentId: null,
				memberIds: ['A', 'Ba'], effectiveMassKg: 1.9957e30, tags: [{ key: 'barycenter/auto' }]   // <- 'Ba', not 'inner'
			},
			{
				id: 'A', kind: 'body', roleHint: 'star', name: 'A', parentId: 'root', massKg: 1.8324e30, radiusKm: 7e5, tags: [],
				orbit: { hostId: 'root', hostMu: G * 1.9957e30, t0: T_A, elements: kepler(0.0589, 0.5298, 43.23) }
			},
			{
				id: 'inner', kind: 'barycenter', name: 'B Barycentre', parentId: 'root',
				memberIds: ['Ba', 'Bb'], effectiveMassKg: 3.1659e29, tags: [{ key: 'barycenter/auto' }],
				orbit: { hostId: 'root', hostMu: G * 1.9957e30, t0: T_A, elements: kepler(617.236, 0.4724, 62.98, 6.2298) }
			},
			{
				id: 'Ba', kind: 'body', roleHint: 'star', name: 'Ba', parentId: 'inner', massKg: 1.6329e29, radiusKm: 3e5, tags: [],
				orbit: { hostId: 'inner', hostMu: G * 3.1659e29, t0: T_A, n_rad_per_s: 4.98466646685888e-8, elements: kepler(0.6607, 0.5298, 223.23) }
			},
			{
				id: 'Bb', kind: 'body', roleHint: 'star', name: 'Bb', parentId: 'inner', massKg: 1.5330e29, radiusKm: 3e5, tags: [],
				orbit: { hostId: 'inner', hostMu: G * 3.1659e29, t0: T_A, n_rad_per_s: 4.98466646685888e-8, elements: kepler(0.7038, 0.5298, 43.23) }
			}
		]
	} as unknown as System;
}

describe('B111 - a pair sits OPPOSITE, at every instant', () => {
	it('the epoch is what was wrong: same M0 at different t0 is a fixed phase error, not a pairing', () => {
		// The arithmetic on its own, so the diagnosis is readable without running the engine.
		// 3,893 days at this pair's mean motion is 240.7 degrees, and it never goes away.
		const n = 4.98466646685888e-8;                       // rad/s, the pair's own
		const offsetDeg = (((n * (T_B - T_A)) / 1000) * 180) / Math.PI;
		expect(((offsetDeg % 360) + 360) % 360).toBeCloseTo(240.7, 1);
	});

	it('a pair PROMOTED from bodies placed at different moments still comes out opposite', () => {
		const s = process(pairPlacedAtDifferentMoments());
		const bary = (s.nodes as any[]).find((n) => n.kind === 'barycenter') as Barycenter;
		expect(bary, 'the two comparable stars should have paired').toBeTruthy();
		for (const angle of anglesAcrossAPeriod(byId(s, 'Ba'), byId(s, 'Bb'))) expect(angle).toBeCloseTo(180, 4);
	});

	it('a pair SAVED out of phase is put back in phase on the next pass', () => {
		const before = pairSavedOutOfPhase();
		// The fault is real in the saved file: nowhere near opposite.
		expect(Math.abs(anglesAcrossAPeriod(byId(before, 'Ba'), byId(before, 'Bb'))[2] - 180)).toBeGreaterThan(20);

		const s = process(before);
		for (const angle of anglesAcrossAPeriod(byId(s, 'Ba'), byId(s, 'Bb'))) expect(angle).toBeCloseTo(180, 4);
		expect(byId(s, 'Bb').orbit.t0, 'one pair, one epoch').toBe(byId(s, 'Ba').orbit.t0);
	});

	// THE REGRESSION THAT MATTERS, and the one that was broken: the fault was INTERMITTENT because
	// it took an edit to create it. The reporter had to "mess around" to get one working.
	it('EDITING ONE MEMBER - a rename, a nudged element - leaves the pair paired', () => {
		let s = process(pairPlacedAtDifferentMoments());
		const bb = byId(s, 'Bb');
		bb.name = 'Bb, renamed';
		bb.orbit.elements.a_AU *= 1.05;
		bb.orbit.lastEditedT0 = 1_787_887_915_150;          // what BodyOrbitTab stamps on any edit
		s = process(s);
		for (const angle of anglesAcrossAPeriod(byId(s, 'Ba'), byId(s, 'Bb'))) expect(angle).toBeCloseTo(180, 4);

		// ...and again on the OTHER member, more recently, so the reference flips.
		const ba = byId(s, 'Ba');
		ba.orbit.elements.e = 0.4;
		ba.orbit.lastEditedT0 = 1_787_887_941_864;
		s = process(s);
		for (const angle of anglesAcrossAPeriod(byId(s, 'Ba'), byId(s, 'Bb'))) expect(angle).toBeCloseTo(180, 4);
	});

	// GATED THROUGH `reconcileBarycenters` ALONE, DELIBERATELY. Through `process()` this is invisible:
	// the coupling pass repairs the epoch a few hundred lines later in the same call, so a promotion
	// that hands out two epochs looks fine from outside. `reconcileBarycenters` is a public entry
	// point in its own right (this file's own suite calls it directly), and a pass that knowingly
	// emits a broken state for a later pass to guess at is how the second half of B111 happened.
	it('the PROMOTION itself hands out one epoch and one period, with nothing tidying up after it', () => {
		const sys = pairPlacedAtDifferentMoments();
		reconcileBarycenters(sys);
		const pair = (sys.nodes as any[]).find((n) => n.kind === 'barycenter' && n.memberIds.includes('Bb')) as Barycenter;
		const [m0, m1] = pair.memberIds.map((id) => byId(sys, id));
		expect(m0.orbit.t0, 'one pair, one epoch').toBe(m1.orbit.t0);
		expect(m0.orbit.n_rad_per_s, 'one pair, one period').toBe(m1.orbit.n_rad_per_s);
		// ...and the phase was re-expressed at that epoch rather than copied, so the member that had
		// the orbit has not been teleported by n*dt.
		const authored = pairPlacedAtDifferentMoments().nodes.find((n: any) => n.id === 'Bb') as any;
		expect(rephasedM0(authored.orbit, m0.orbit.t0)).toBeCloseTo(byId(sys, 'Bb').orbit.elements.M0_rad, 9);
	});

	it('EDITING ONE MEMBER of an ALREADY-DIVERGED pair pulls its partner onto its epoch', () => {
		// The reference is whichever member was edited last, so an edit is what CHOOSES the pair's
		// epoch - and the partner must follow it, whichever member that turns out to be.
		for (const edited of ['Ba', 'Bb']) {
			const sys = pairSavedOutOfPhase();
			const node = byId(sys, edited);
			node.name = `${edited}, renamed`;
			node.orbit.lastEditedT0 = 1_787_887_941_864;
			const s = process(sys);
			expect(byId(s, 'Ba').orbit.t0, `editing ${edited}`).toBe(byId(s, 'Bb').orbit.t0);
			for (const angle of anglesAcrossAPeriod(byId(s, 'Ba'), byId(s, 'Bb'))) expect(angle).toBeCloseTo(180, 4);
		}
	});

	it('and BOTH members share one period, so the two never walk apart', () => {
		const s = process(pairPlacedAtDifferentMoments(), 3);
		expect(byId(s, 'Bb').orbit.n_rad_per_s).toBe(byId(s, 'Ba').orbit.n_rad_per_s);
		expect(byId(s, 'Bb').orbital_period_days).toBeCloseTo(byId(s, 'Ba').orbital_period_days, 6);
	});
});

describe('B111 - a barycentre knows who its members are', () => {
	it('an outer pair naming a since-promoted member is re-pointed at the pair that replaced it', () => {
		const s = process(outerPairNamingAPromotedMember());
		const root = byId(s, 'root') as Barycenter;
		expect(root.memberIds.slice().sort()).toEqual(['A', 'inner']);
	});

	it('its mass is then the sum of everything under it, and the pair balances', () => {
		const s = process(outerPairNamingAPromotedMember());
		const root = byId(s, 'root') as Barycenter;
		const allBodies = (s.nodes as any[]).filter((n) => n.kind === 'body').reduce((t, n) => t + (n.massKg || 0), 0);
		expect(root.effectiveMassKg).toBeCloseTo(allBodies, -22);   // 2.1490e30, not 1.9957e30

		// m*a must match on both sides of a barycentre. It was 1811x out.
		const a = byId(s, 'A');
		const inner = byId(s, 'inner');
		const mA = a.massKg * a.orbit.elements.a_AU;
		const mI = inner.effectiveMassKg * inner.orbit.elements.a_AU;
		expect(mA / mI).toBeCloseTo(1, 6);
	});

	it('so the OUTER pair orbits too - opposite, one period, across a full revolution', () => {
		const s = process(outerPairNamingAPromotedMember());
		const a = byId(s, 'A');
		const inner = byId(s, 'inner');
		expect(inner.orbit.n_rad_per_s).toBe(a.orbit.n_rad_per_s);
		for (const angle of anglesAcrossAPeriod(a, inner)) expect(angle).toBeCloseTo(180, 4);
	});

	it('a promotion hands membership UP by itself, so a fresh file never acquires the fault', () => {
		// Reconcile ALONE, with no process pass to tidy up after it: A + Ba pair first (they are
		// comparable), then Bb pairs with Ba, and the outer pair must follow the change.
		const sys = pairPlacedAtDifferentMoments();
		reconcileBarycenters(sys);
		for (const b of (sys.nodes as any[]).filter((n) => n.kind === 'barycenter') as Barycenter[]) {
			for (const id of b.memberIds) {
				expect(byId(sys, id), `member ${id} of ${b.id} is missing`).toBeTruthy();
				expect(byId(sys, id).parentId, `${id} is listed by ${b.id} but does not orbit it`).toBe(b.id);
			}
		}
	});

	it('a member dragged clean out of the pair is dropped rather than counted for ever', () => {
		const sys = outerPairNamingAPromotedMember();
		// Send Bb off to orbit A instead: it is no longer anywhere under `inner`.
		byId(sys, 'Bb').parentId = 'A';
		byId(sys, 'Bb').orbit.hostId = 'A';
		reconcileBarycenters(sys);
		const inner = byId(sys, 'inner') as Barycenter | undefined;
		if (inner) expect(inner.memberIds).not.toContain('Bb');
	});
});

// THE SAME FAULT, A DIFFERENT PASS. `swapDominantChild` hands the demoted parent the CHILD's epoch
// while keeping the mean anomaly it had at its OWN - so the record claims a phase the body was never
// at, and the planet steps round its new host by `n*dt` the moment the swap happens. Nothing about
// this is visible in the elements afterwards, which is what makes it the B111 shape rather than a
// near miss: every field reads correctly and the body is in the wrong place.
describe('a hierarchy swap does not step the demoted body round its orbit', () => {
	const build = (): System => ({
		id: 'sw', name: 'Swap', seed: 'sw', epochT0: T_A, age_Gyr: 5, rulePackId: '', rulePackVersion: '', tags: [],
		nodes: [
			{ id: 'star', kind: 'body', roleHint: 'star', name: 'S', parentId: null, massKg: 2e30, radiusKm: 7e5, tags: [] },
			{
				id: 'planet', kind: 'body', roleHint: 'planet', name: 'P', parentId: 'star', massKg: 1e21, radiusKm: 2000, tags: [],
				orbit: { hostId: 'star', hostMu: G * 2e30, t0: T_A, elements: { a_AU: 3, e: 0.2, i_deg: 1, omega_deg: 30, Omega_deg: 10, M0_rad: 1.1 } }
			},
			{
				id: 'moon', kind: 'body', roleHint: 'moon', name: 'M', parentId: 'planet', massKg: 7e22, radiusKm: 1700, tags: [],
				orbit: { hostId: 'planet', hostMu: G * 1e21, t0: T_B, elements: { a_AU: 0.002, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 1 } }
			}
		]
	} as unknown as System);

	it('the planet points the same way round its new host as it did round its old one', () => {
		const before = build();
		const oldPlanetOrbit = JSON.parse(JSON.stringify(byId(before, 'planet')));
		reconcileBarycenters(before);
		const planet = byId(before, 'planet');
		expect(planet.parentId, 'the heavier moon should have taken over').toBe('moon');

		// Measured AT THE SWAP EPOCH, in each orbit's own frame: same i/Omega/omega and same e, so a
		// matching direction means a matching true anomaly - the body did not jump.
		const t = planet.orbit.t0;
		const a = propagateState3D(oldPlanetOrbit, t).r;
		const b = propagateState3D(planet, t).r;
		const cos = (a.x * b.x + a.y * b.y + a.z * b.z) / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z));
		expect((Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI).toBeLessThan(1e-6);
	});
});

// The helper that makes a re-stamp safe, pinned on its own so the rule survives a refactor of the
// callers. `rephasedM0` is the whole of "do not move the body"; `orbitMeanMotion` is the one place
// that decides n, which is why a stored value is respected rather than recomputed (LGR-1: an l1/l2
// point's hostMu is scaled ON PURPOSE, so sqrt(mu/a^3) is the wrong answer there).
describe('re-stamping an epoch does not move the body', () => {
	const orbit = (t0: number, M0: number) =>
		({ hostId: 'h', hostMu: G * 2e30, t0, elements: { a_AU: 1, e: 0.3, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: M0 } });

	it('the body is in the same place before and after', () => {
		const before: any = { orbit: orbit(0, 1.2) };
		const t0New = 5.5e9;
		const after: any = { orbit: { ...orbit(t0New, rephasedM0(before.orbit, t0New)) } };
		for (const t of [0, 1e9, 7.3e9, 4e10]) {
			const p = propagateState3D(before, t).r;
			const q = propagateState3D(after, t).r;
			expect(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)).toBeLessThan(1e-12);
		}
	});

	it('a stored mean motion is respected, never recomputed from mu and a', () => {
		// An l1/l2 co-orbital carries a deliberately scaled hostMu; recomputing would be wrong there.
		const o: any = { ...orbit(0, 0), n_rad_per_s: 1e-7 };
		expect(orbitMeanMotion(o)).toBe(1e-7);
		expect(orbitMeanMotion({ ...o, n_rad_per_s: undefined, isRetrogradeOrbit: true })).toBeLessThan(0);
	});

	it('an orbit with nothing to go on returns a phase unchanged rather than NaN', () => {
		expect(rephasedM0({ t0: 0, elements: { M0_rad: 2 } }, 1e9)).toBeCloseTo(2, 12);
	});
});
