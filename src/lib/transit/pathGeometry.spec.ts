// CAN THE SHIP ACTUALLY FLY THE LINE IT IS DRAWN ON?
//
// THE GAP THIS FILLS, stated plainly because it is the reason a visible absurdity shipped and stayed:
// every other transit spec pins Delta-v and TIMING. Not one of them looks at the drawn PATH. So when
// `calculateTransitPlan` handed a sub-hour burn two coast samples forty-eight hours apart, the suite
// stayed green while the map drew a 0.3 g freighter crossing 3,356,198 km in forty-one minutes —
// 1,366 km/s, for a ship that reaches about 10 km/s in an hour. A correct Delta-v total says nothing
// about whether the line beside it is possible.
//
// Two gates, over real plans from the real solver, both of them cheap:
//
//   SPEED. No consecutive pair of drawn points may imply a speed the ship could not reach. The
//   ceiling is derived per plan rather than fixed, because a torch doing 548 km/s on a Direct Burn is
//   telling the truth and a Hohmann freighter doing 1,366 km/s is not. See `speedCeiling_kms`.
//
//   SPACING. No single drawn step may swallow a large fraction of its own segment. A phase drawn with
//   two points passes the speed gate trivially and still looks like a stick, and two points is
//   exactly what the old fallback produced.
//
// The speed gate has been checked against the fault it exists for: reinstating the borrowed-sample
// fallback in `calculateLambertPlan` makes it fail on the Accel and Brake segments, by a factor of
// about seventy. That check is recorded in the G46 notes rather than run here, since it needs the
// production code temporarily broken.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { calculateTransitPlan } from './calculator.js';
import type { TransitPlan, TransitSegment } from './types';
import { pathSampleTimesMs } from './pathSampling';

const AU_KM = 1.495978707e8;
const AU_M = AU_KM * 1000;
const G_SI = 6.6743e-11;

const base = JSON.parse(fs.readFileSync(path.resolve('static/examples/Sol_Expanse-System.json'), 'utf-8'));

function withShip(): any {
	const system = JSON.parse(JSON.stringify(base));
	const i = system.nodes.findIndex((n: any) => n.name === 'Rocinante (Tachi)');
	system.nodes[i] = {
		id: 'ship', parentId: 'solar-system-sun', name: 'Ship', kind: 'construct', tags: [],
		orbit: {
			hostId: 'solar-system-sun', hostMu: 132751826999999990000, t0: 1763640079144,
			elements: { a_AU: 3.0, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 1.0 }
		}
	};
	return system;
}

function nodeByName(system: any, name: string) {
	const n = system.nodes.find((x: any) => x.name === name);
	if (!n) throw new Error(`fixture has no node named ${name}`);
	return n;
}

function plansFor(system: any, originId: string, targetId: string, maxG: number, placement: string): TransitPlan[] {
	return calculateTransitPlan(system, originId, targetId, 1767250575000, 'Economy', {
		maxG, accelRatio: 0.1, brakeRatio: 0.1, interceptSpeed_ms: 0, shipMass_kg: 1441575,
		shipIsp: 1100000, brakeAtArrival: true, arrivalPlacement: placement,
		aerobrake: { allowed: false, limit_kms: 0 }
	}).filter((p) => p.isValid);
}

/** Every massive body in the fixture, as mu in m^3/s^2, so a ceiling can account for a close pass. */
function bodyMus(system: any): { mu: number }[] {
	return system.nodes
		.filter((n: any) => n.kind === 'body' || n.kind === 'barycenter')
		.map((n: any) => ({ mu: (Number(n.massKg) || 0) * G_SI }))
		.filter((b: { mu: number }) => b.mu > 0);
}

/**
 * HOW FAST THIS SHIP COULD POSSIBLY BE GOING, on this plan, at this point in it.
 *
 * Three terms, each an over-estimate on purpose — the gate is here to catch an absurdity, not to
 * grade the solver:
 *
 *   1. What it started with. Orbital speed at the departure radius, taken as the ESCAPE speed there,
 *      which bounds any bound orbit.
 *   2. What gravity can add. Escape speed from the largest mu in the system at the path's closest
 *      approach to anything — a free fall from rest at infinity, which no transfer beats.
 *   3. What the engine can add. The whole plan's Delta-v, spent all at once and all in one direction.
 *
 * A Hohmann transfer's ceiling comes out around 90 km/s and a torch's around 4,000, which is exactly
 * the discrimination wanted: the torch's real 548 km/s passes and the freighter's drawn 1,366 does
 * not.
 */
function speedCeiling_kms(system: any, plan: TransitPlan): number {
	const muMax = Math.max(...bodyMus(system).map((b) => b.mu));
	let closest_m = Infinity;
	for (const seg of plan.segments) {
		for (const p of seg.pathPoints ?? []) {
			const r = Math.hypot(p.x, p.y) * AU_M;
			if (r > 0 && r < closest_m) closest_m = r;
		}
	}
	// Floor the closest approach at one solar radius: inside a star the escape speed diverges and the
	// bound stops meaning anything.
	const r_m = Math.max(6.96e8, closest_m);
	const vEscape_ms = Math.sqrt((2 * muMax) / r_m);
	return (2 * vEscape_ms + plan.totalDeltaV_ms) / 1000;
}

interface Step {
	seg: TransitSegment;
	speed_kms: number;
	gapFrac: number;
}

/** Every drawn step of a plan: how fast it implies the ship is moving, and how much of its own
 *  segment's clock it swallows. */
function steps(plan: TransitPlan): Step[] {
	const out: Step[] = [];
	for (const seg of plan.segments) {
		const pts = seg.pathPoints ?? [];
		if (pts.length < 2) continue;
		const times = pathSampleTimesMs(seg);
		const segMs = Math.max(1, seg.endTime - seg.startTime);
		for (let i = 1; i < pts.length; i++) {
			const dKm = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) * AU_KM;
			const dtMs = times[i] - times[i - 1];
			if (!(dtMs > 0)) continue;
			out.push({ seg, speed_kms: dKm / (dtMs / 1000), gapFrac: dtMs / segMs });
		}
	}
	return out;
}

/** The cases the gates run over. Deliberately spans an interplanetary transfer (where the burns are
 *  vanishingly short against the coast — the fault's home ground), a torch plan (genuinely fast, and
 *  the reason the ceiling cannot be a constant), a gravity assist, and a LOCAL transfer between two
 *  moons of one planet, which is the family this whole item is named after. */
function cases(): { label: string; system: any; plans: TransitPlan[] }[] {
	const out: { label: string; system: any; plans: TransitPlan[] }[] = [];

	for (const [target, placement, maxG] of [
		['Jupiter', 'lo', 0.3], ['Mars', 'lo', 0.3], ['Jupiter', 'l4', 0.3], ['Mars', 'lo', 1.5]
	] as const) {
		const system = withShip();
		out.push({
			label: `Ship -> ${target} (${placement}, ${maxG} g)`,
			system,
			plans: plansFor(system, 'ship', nodeByName(system, target).id, maxG, placement)
		});
	}

	// Local: moon to moon inside Jupiter's system, planned in Jupiter's frame.
	const local = withShip();
	const jupiter = nodeByName(local, 'Jupiter');
	const moons = local.nodes.filter((n: any) => n.parentId === jupiter.id && n.kind === 'body');
	if (moons.length >= 2) {
		out.push({
			label: `LOCAL ${moons[0].name} -> ${moons[moons.length - 1].name}`,
			system: local,
			plans: plansFor(local, moons[0].id, moons[moons.length - 1].id, 0.3, 'lo')
		});
	}

	return out;
}

const CASES = cases();

describe('a drawn path never implies a speed the ship could not reach', () => {
	for (const c of CASES) {
		it(`${c.label}: every drawn step is inside the ship's own speed ceiling`, () => {
			expect(c.plans.length).toBeGreaterThan(0);
			for (const plan of c.plans) {
				const ceiling = speedCeiling_kms(c.system, plan);
				const all = steps(plan);
				expect(all.length).toBeGreaterThan(0);
				const worst = all.reduce((a, b) => (b.speed_kms > a.speed_kms ? b : a));
				expect(
					worst.speed_kms,
					`${plan.name ?? plan.planType}: ${worst.seg.type} segment is drawn at ` +
					`${worst.speed_kms.toFixed(0)} km/s against a ceiling of ${ceiling.toFixed(0)} km/s`
				).toBeLessThanOrEqual(ceiling);
			}
		});
	}

	it('the ceiling is tight enough to have caught the fault it was written for', () => {
		// Guards the gate itself. A ceiling that merely sat above every plausible number would pass
		// forever and prove nothing, so this pins that the WORST measured pre-G46 drawn speed — 1,366
		// km/s on the Most Efficient accel — is genuinely above the ceiling for that same plan.
		const c = CASES[0];
		const plan = c.plans.find((p) => p.name === 'Most Efficient');
		expect(plan).toBeTruthy();
		expect(speedCeiling_kms(c.system, plan!)).toBeLessThan(1366);
	});
});

describe('no drawn step swallows its own segment', () => {
	for (const c of CASES) {
		it(`${c.label}: every segment is drawn as a line, not as a stick`, () => {
			for (const plan of c.plans) {
				for (const seg of plan.segments) {
					const pts = seg.pathPoints ?? [];
					// A phase that exists at all gets enough points to read as a path. Two points over
					// an hour-long burn is what the old fallback produced and what this forbids.
					expect(
						pts.length,
						`${plan.name ?? plan.planType} ${seg.type}: drawn with ${pts.length} points`
					).toBeGreaterThanOrEqual(3);
				}
				const worst = steps(plan).reduce((a, b) => (b.gapFrac > a.gapFrac ? b : a));
				expect(
					worst.gapFrac,
					`${plan.name ?? plan.planType} ${worst.seg.type}: one drawn step covers ` +
					`${(worst.gapFrac * 100).toFixed(1)}% of the segment`
				).toBeLessThan(0.2);
			}
		});
	}
});

describe('a stamped segment is read at the times it says, not at even spacing', () => {
	it('stamps are present, ordered, and span exactly the segment', () => {
		for (const c of CASES) {
			for (const plan of c.plans) {
				for (const seg of plan.segments) {
					const pts = seg.pathPoints ?? [];
					if (pts.length < 2) continue;
					expect(seg.pathTimes, `${plan.name} ${seg.type} has no stamps`).toBeTruthy();
					expect(seg.pathTimes!.length).toBe(pts.length);
					for (let i = 1; i < seg.pathTimes!.length; i++) {
						expect(seg.pathTimes![i]).toBeGreaterThan(seg.pathTimes![i - 1]);
					}
					// Within a millisecond of the segment's own bounds — the stamps ARE the segment's
					// clock, so a drift here would mean the drawn path and the flight disagree about
					// when the phase starts.
					expect(Math.abs(seg.pathTimes![0] - seg.startTime)).toBeLessThan(2);
					expect(Math.abs(seg.pathTimes![pts.length - 1] - seg.endTime)).toBeLessThan(2);
				}
			}
		}
	});
});
