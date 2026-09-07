// B111, THIRD PART - "not establishing a barycentre" at an L-point, ROOT-CAUSED BY THE OWNER:
// *"I created a second trojan and it dumped it at a default point on top of the other trojan - so
// it never sets up a barycentre. I WAS in L4 setting a second trojan in the Hill sphere of an
// existing one but that position was not honoured."*
//
// It was never a physics fault, which is why nobody could reproduce it as one. The trojan ADD flow
// always stamped a fresh `coOrbital` marker, and LGR-1's convention then derives every rider of one
// point onto the SAME ellipse at the SAME phase and epoch - the second trojan sits exactly on top
// of the first, invisibly. And both are children of the STAR, so `promoteMassiveCompanion` compares
// each against the star (ratio ~0) and never against the other: the pair the owner was trying to
// make could not form by any amount of fiddling. The clicked position could not have been honoured
// either - the click context carries only `{secondaryId, point}`, and a rider's own position is
// DERIVED (LGR-2), so there is nowhere for an offset to live on a rider.
//
// THE DECISION that fixes it lives beside the convention (`lagrange.placeBodyAtCoOrbitalPoint`):
// an empty point takes a rider; an occupied point takes a COMPANION OF THE RIDER - parented to it,
// orbiting inside its Hill sphere, no marker of its own. The machinery this hands off to already
// exists and is already gated: a comparable-mass companion promotes into a pair whose barycentre
// rides the point (B98/PHY-32, membership and marker handed up per v3.0.183), and a small one
// simply stays the trojan's moon.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SystemProcessor } from '$lib/core/SystemProcessor';
import { placeBodyAtCoOrbitalPoint, deriveCoOrbitalOrbit } from './lagrange';
import { hillRadiusAU } from './stability';
import { propagateState3D } from './orbits';
import { G } from '../constants';
import type { RulePack, System, Barycenter, CelestialBody } from '$lib/types';

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
const SUN = 1.989e30;
const byId = (s: any, id: string) => (s.nodes as any[]).find((n) => n.id === id);
const process = (s: any, times = 1) => {
	for (let i = 0; i < times; i++) s = new SystemProcessor().process(s, pack);
	return s;
};

/** Sol + Jupiter + one authored trojan riding L4. The owner's starting position. */
function solJupiterTrojan(trojanMassKg = 1.4e21): System {
	return {
		id: 's', name: 'T', seed: 's', epochT0: 0, age_Gyr: 4.6, rulePackId: '', rulePackVersion: '', tags: [],
		nodes: [
			{ id: 'sun', kind: 'body', roleHint: 'star', name: 'Sol', parentId: null, massKg: SUN, radiusKm: 696340,
				temperatureK: 5778, tags: [], classes: ['star/G2V'] },
			{ id: 'jup', kind: 'body', roleHint: 'planet', name: 'Jupiter', parentId: 'sun', massKg: 1.898e27, radiusKm: 69911, tags: [],
				orbit: { hostId: 'sun', hostMu: G * SUN, t0: 0, elements: { a_AU: 5.204, e: 0.0489, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } },
			{ id: 't1', kind: 'body', roleHint: 'moon', name: 'Pomona', parentId: 'sun', massKg: trojanMassKg, radiusKm: 400, tags: [],
				coOrbital: { hostId: 'jup', point: 'l4' },
				orbit: { hostId: 'sun', hostMu: G * SUN, t0: 0, elements: { a_AU: 5.204, e: 0.0489, i_deg: 0, omega_deg: 60, Omega_deg: 0, M0_rad: 0 } } }
		]
	} as unknown as System;
}

/** What the OLD add flow built for a second trojan: a second marker, a second derived rider. */
function secondRiderTheOldWay(sys: System): System {
	const sun = byId(sys, 'sun');
	const jup = byId(sys, 'jup');
	const t2 = {
		id: 't2', kind: 'body', roleHint: 'moon', name: 'Jupiter L4 Trojan', parentId: 'sun', massKg: 1.1e21, radiusKm: 370, tags: [],
		coOrbital: { hostId: 'jup', point: 'l4' },
		orbit: deriveCoOrbitalOrbit(jup, sun.massKg, 'l4') ?? undefined
	};
	return { ...sys, nodes: [...sys.nodes, t2 as any] } as System;
}

/** What the NEW flow builds when the decision says companion. */
function companionOf(rider: any, massKg: number, aAU: number) {
	return {
		id: 't2', kind: 'body', roleHint: 'moon', name: `${rider.name} Companion`, parentId: rider.id,
		massKg, radiusKm: 370, tags: [],
		orbit: {
			hostId: rider.id, hostMu: G * ((rider.kind === 'barycenter' ? rider.effectiveMassKg : rider.massKg) || 0),
			t0: 0, elements: { a_AU: aAU, e: 0.02, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 1 }
		}
	};
}

// --- THE FAULT, PINNED AS THE REASON THE DECISION EXISTS -------------------------------------
describe('what the old flow produced, kept as the record of why', () => {
	it('a second marker derives a second rider EXACTLY on top of the first, and no pair ever forms', () => {
		const s = process(secondRiderTheOldWay(solJupiterTrojan()));
		const t1 = byId(s, 't1');
		const t2 = byId(s, 't2');
		// Same derived ellipse, same phase, same epoch: zero separation at every instant.
		for (const frac of [0, 0.25, 0.5, 0.75]) {
			const periodMs = ((2 * Math.PI) / Math.abs(t1.orbit.n_rad_per_s)) * 1000;
			const a = propagateState3D(t1, frac * periodMs).r;
			const b = propagateState3D(t2, frac * periodMs).r;
			expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(1e-12);
		}
		// ...and no barycentre, because each is compared against the STAR, never the other.
		expect(s.nodes.some((n: any) => n.kind === 'barycenter')).toBe(false);
	});
});

// --- THE DECISION ----------------------------------------------------------------------------
describe('placeBodyAtCoOrbitalPoint', () => {
	it('an empty point takes a rider', () => {
		const sys = solJupiterTrojan();
		expect(placeBodyAtCoOrbitalPoint(sys, 'jup', 'l5', SUN).kind).toBe('point');
		// The other point is free even though l4 is taken.
		expect(placeBodyAtCoOrbitalPoint(sys, 'jup', 'l4', SUN).kind).toBe('companion');
	});

	it('an occupied point returns the rider and a separation inside its Hill sphere', () => {
		const sys = solJupiterTrojan();
		const p = placeBodyAtCoOrbitalPoint(sys, 'jup', 'l4', SUN);
		expect(p.kind).toBe('companion');
		expect(p.rider?.id).toBe('t1');
		const hill = hillRadiusAU(5.204, 0.0489, 1.4e21, SUN);
		expect(p.suggestedAAU).toBeGreaterThan(0);
		expect(p.suggestedAAU!).toBeLessThan(hill);
	});

	it('a construct parked at the point is NOT a rider - massless chrome binds nothing', () => {
		const sys = solJupiterTrojan();
		(sys.nodes as any[]).push({
			id: 'stn', kind: 'construct', name: 'L4 Station', parentId: 'sun', tags: [],
			coOrbital: { hostId: 'jup', point: 'l5' },
			orbit: { hostId: 'sun', hostMu: G * SUN, t0: 0, elements: { a_AU: 5.204, e: 0.0489, i_deg: 0, omega_deg: -60, Omega_deg: 0, M0_rad: 0 } }
		});
		expect(placeBodyAtCoOrbitalPoint(sys, 'jup', 'l5', SUN).kind).toBe('point');
	});

	it('a PAIR already riding the point is itself the rider, so a third body joins the pair', () => {
		// Promote first: comparable companion -> the barycentre takes the marker (PHY-32).
		const sys = solJupiterTrojan();
		const withCompanion = { ...sys, nodes: [...sys.nodes, companionOf(byId(sys, 't1'), 1.1e21, 4.5e-6) as any] } as System;
		const paired = process(withCompanion);
		const bary = (paired.nodes as any[]).find((n) => n.kind === 'barycenter') as Barycenter;
		expect(bary, 'the pair should have formed').toBeTruthy();
		expect((bary as any).coOrbital?.point).toBe('l4');

		const p = placeBodyAtCoOrbitalPoint(paired, 'jup', 'l4', SUN);
		expect(p.kind).toBe('companion');
		expect(p.rider?.id).toBe(bary.id);
	});
});

// --- END TO END: the thing the owner could not make happen ------------------------------------
describe('a comparable second trojan now BECOMES the binary the owner was building', () => {
	it('companion placement -> promotion -> a pair whose barycentre rides the point, members opposite', () => {
		const sys = solJupiterTrojan();
		const decision = placeBodyAtCoOrbitalPoint(sys, 'jup', 'l4', SUN);
		expect(decision.kind).toBe('companion');
		const s = process({ ...sys, nodes: [...sys.nodes, companionOf(decision.rider, 1.1e21, decision.suggestedAAU!) as any] } as System, 2);

		const bary = (s.nodes as any[]).find((n) => n.kind === 'barycenter') as any;
		expect(bary, 'the barycentre the owner was trying to establish').toBeTruthy();
		expect(bary.coOrbital?.hostId).toBe('jup');           // the PAIR rides the point (PHY-32)
		expect(bary.coOrbital?.point).toBe('l4');
		expect(bary.memberIds.slice().sort()).toEqual(['t1', 't2']);

		// Members carry no marker of their own, are parented to the pair, and sit opposite (PHY-33).
		const t1 = byId(s, 't1');
		const t2 = byId(s, 't2');
		expect(t1.coOrbital).toBeUndefined();
		expect(t2.coOrbital).toBeUndefined();
		expect(t1.parentId).toBe(bary.id);
		expect(t2.parentId).toBe(bary.id);
		expect(t1.orbit.t0).toBe(t2.orbit.t0);
		const periodMs = ((2 * Math.PI) / Math.abs(t1.orbit.n_rad_per_s)) * 1000;
		for (const frac of [0, 0.3, 0.6, 0.9]) {
			const a = propagateState3D(t1, t1.orbit.t0 + frac * periodMs).r;
			const b = propagateState3D(t2, t1.orbit.t0 + frac * periodMs).r;
			const cos = (a.x * b.x + a.y * b.y + a.z * b.z) / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z));
			expect((Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI).toBeCloseTo(180, 4);
		}

		// And the pair's separation stayed the authored one - NOT the 60-degree chord (PHY-32's trap:
		// the B98 companion climbed 2.5e-6 -> 6.5 AU when the reconciler misread the Lagrange offset).
		const sep = t1.orbit.elements.a_AU + t2.orbit.elements.a_AU;
		expect(sep).toBeLessThan(hillRadiusAU(5.204, 0.0489, 2.5e21, SUN));

		// Idempotent from here (the B98 drift would fail this).
		const again = process(s);
		const sep2 = byId(again, 't1').orbit.elements.a_AU + byId(again, 't2').orbit.elements.a_AU;
		expect(sep2).toBeCloseTo(sep, 12);
	});

	it('a SMALL second body simply becomes the trojan\'s moon - the other honest outcome', () => {
		const sys = solJupiterTrojan();
		const decision = placeBodyAtCoOrbitalPoint(sys, 'jup', 'l4', SUN);
		// 1% of the trojan's mass: far under the promote threshold.
		const s = process({ ...sys, nodes: [...sys.nodes, companionOf(decision.rider, 1.4e19, decision.suggestedAAU!) as any] } as System);
		expect(s.nodes.some((n: any) => n.kind === 'barycenter')).toBe(false);
		expect(byId(s, 't2').parentId).toBe('t1');            // a moon of the trojan
		expect(byId(s, 't1').coOrbital?.point).toBe('l4');    // which still rides the point, moon and all
	});
});
