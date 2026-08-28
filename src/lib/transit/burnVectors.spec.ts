// WHAT THE DRIVE IS TOLD: how hard it pushes, and which way.
//
// Owner, 2026-08-26: orientation "is ONLY important when the engines are firing", and then the ship
// should be "pointing in direction of desired vector". Before the 3D models arrived nothing drew a
// ship's heading at all, so none of this was visible and none of it was checked.
//
// Two things are pinned here, both of which were measurably wrong and neither of which any existing
// spec looked at:
//
//   HOW HARD. The plume's thrust was inferred by differencing a segment's start and end state
//   velocities. Most builders leave `endState.v` as a literal zero placeholder, so that difference is
//   the ship's whole orbital velocity rather than the burn's Delta-v. Measured against a commanded
//   0.3 g: Hohmann departure 2.4x, its brake 2.8x, and a 57-hour torch burn 0.03x - a plume that was
//   effectively dark through the longest burn in the game.
//
//   WHICH WAY. A burn's Delta-v is what CHANGES the velocity, so it is not generally parallel to it.
//   Aiming the hull down the course line and flipping it for a brake is right only to within that
//   angle, which is measured below and is not small.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { calculateTransitPlan } from './calculator.js';
import { compactBurns, shipBurnAt } from '../constructs/shipBurn';
import type { TransitPlan } from './types';

const base = JSON.parse(fs.readFileSync(path.resolve('static/examples/Sol_Expanse-System.json'), 'utf-8'));

function plans(maxG: number): { system: any; plans: TransitPlan[] } {
	const system = JSON.parse(JSON.stringify(base));
	const i = system.nodes.findIndex((n: any) => n.name === 'Rocinante (Tachi)');
	system.nodes[i] = {
		id: 'ship', parentId: 'solar-system-sun', name: 'Ship', kind: 'construct', tags: [],
		orbit: {
			hostId: 'solar-system-sun', hostMu: 132751826999999990000, t0: 1763640079144,
			elements: { a_AU: 3.0, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 1.0 }
		}
	};
	const target = system.nodes.find((n: any) => n.name === 'Jupiter');
	return {
		system,
		plans: calculateTransitPlan(system, 'ship', target.id, 1767250575000, 'Economy', {
			maxG, accelRatio: 0.1, brakeRatio: 0.1, interceptSpeed_ms: 0, shipMass_kg: 1441575,
			shipIsp: 1100000, brakeAtArrival: true, arrivalPlacement: 'lo',
			aerobrake: { allowed: false, limit_kms: 0 }
		}).filter((p) => p.isValid)
	};
}

describe('the plume is told the thrust the ship was actually commanded', () => {
	for (const maxG of [0.3, 1.0, 3.0]) {
		it(`${maxG} g: every burn in every plan family reports it`, () => {
			const commanded = maxG * 9.81;
			const found: string[] = [];
			for (const plan of plans(maxG).plans) {
				const burns = compactBurns({
					scheduled_journeys: [{ id: 'j', status: 'active', createdAtSec: '0', plans: [plan] }]
				});
				expect(burns.length, `${plan.name}: no burns at all`).toBeGreaterThan(0);
				for (const b of burns) {
					found.push(`${plan.name}/${b.b ? 'brake' : 'accel'}`);
					// Within 2% of the commanded figure. The phases are SIZED by it (dv / (maxG*g0)),
					// so anything outside that is an inference creeping back in rather than rounding.
					expect(
						Math.abs(b.a - commanded) / commanded,
						`${plan.name} ${b.b ? 'brake' : 'accel'}: plume told ${b.a.toFixed(2)} m/s2 against a commanded ${commanded.toFixed(2)}`
					).toBeLessThan(0.02);
				}
			}
			expect(found.length).toBeGreaterThan(4);
		});
	}
});

describe('a burn publishes the direction it pushes', () => {
	it('every Accel and Brake segment carries a unit thrust vector', () => {
		for (const plan of plans(0.3).plans) {
			for (const seg of plan.segments) {
				if (seg.type !== 'Accel' && seg.type !== 'Brake') continue;
				expect(seg.thrustDir, `${plan.name} ${seg.type} has no thrust direction`).toBeTruthy();
				const m = Math.hypot(seg.thrustDir!.x, seg.thrustDir!.y);
				expect(Math.abs(m - 1)).toBeLessThan(1e-9);
				expect(seg.deltaV_ms, `${plan.name} ${seg.type} has no Delta-v`).toBeGreaterThan(0);
			}
		}
	});

	it('records how far the drive points from the course, per plan family', () => {
		// THE MEASUREMENT THAT JUSTIFIES PUBLISHING IT AT ALL, and it is not a small number.
		//
		// Aiming the hull down the course and flipping it for a brake — what the renderer did before —
		// is exactly right for a TORCH burn, where the drive is simply prograde or retrograde. Measured
		// on this fixture, Direct Burn: 0.1 degrees off course on the accel, 177.4 on the brake, so the
		// old flip was within 2.6 degrees. That is the burn everyone pictures, and it is why nobody saw
		// a fault.
		//
		// An EFFICIENT transfer is a different thing. Its Delta-v is a vector difference between two
		// velocities, not a push along one, so it sits well off the course: 61.7 degrees on the Most
		// Efficient departure, and its arrival burn is 72.7 off — which the label-flip would have drawn
		// 107.3 degrees wrong. The gravity assist's arrival burn is 153.2 degrees wrong under the flip,
		// very nearly backwards. An efficient arrival burn is frequently PROGRADE despite being called a
		// brake: arriving at the top of a transfer ellipse you are slower than the orbit you are joining
		// and have to speed up to stay there.
		const worst: Record<string, number> = {};
		for (const plan of plans(0.3).plans) {
			for (const seg of plan.segments) {
				if (!seg.thrustDir) continue;
				const pts = seg.pathPoints;
				if (pts.length < 2) continue;
				const cx = pts[pts.length - 1].x - pts[0].x;
				const cy = pts[pts.length - 1].y - pts[0].y;
				const cm = Math.hypot(cx, cy);
				if (!(cm > 0)) continue;
				const cos = Math.max(-1, Math.min(1, (seg.thrustDir.x * cx + seg.thrustDir.y * cy) / cm));
				const offCourse = (Math.acos(cos) * 180) / Math.PI;
				// What the OLD renderer would have got wrong: course for an accel, reversed for a brake.
				const flipError = seg.type === 'Brake' ? 180 - offCourse : offCourse;
				const key = `${plan.name}`;
				worst[key] = Math.max(worst[key] ?? 0, flipError);
			}
		}
		// The torch case stays tight: if this ever loosens, the thrust vectors have gone wrong, because
		// a torch burn IS prograde and anything else is a bug.
		expect(worst['Direct Burn'], 'a torch burn should be within a few degrees of prograde')
			.toBeLessThan(10);
		// And the efficient families stay loose, as the evidence that this was worth publishing.
		expect(worst['Most Efficient'], 'the efficient transfer no longer disagrees with its own course')
			.toBeGreaterThan(30);
	});

	it('the published direction is NOT simply the course, which is why it is published', () => {
		// The margin this buys. If this ever collapses to zero the publication is redundant and the
		// old course-tangent-plus-flip would have been fine after all — so it is worth knowing.
		let worstDeg = 0;
		for (const plan of plans(0.3).plans) {
			for (const seg of plan.segments) {
				if (!seg.thrustDir) continue;
				const v = seg.startState?.v;
				if (!v) continue;
				const vm = Math.hypot(v.x, v.y);
				if (!(vm > 0)) continue;
				const sign = seg.type === 'Brake' ? -1 : 1;
				const cos = Math.max(-1, Math.min(1,
					(seg.thrustDir.x * v.x * sign + seg.thrustDir.y * v.y * sign) / vm));
				worstDeg = Math.max(worstDeg, (Math.acos(cos) * 180) / Math.PI);
			}
		}
		// Measured at 21 degrees on this fixture. Pinned loosely, as evidence rather than a limit.
		expect(worstDeg).toBeGreaterThan(1);
		expect(worstDeg).toBeLessThan(180);
	});
});

describe('journeys planned before the drive published anything still fly', () => {
	it('falls back to the state difference rather than reporting no burn', () => {
		const { plans: ps } = plans(0.3);
		const plan = JSON.parse(JSON.stringify(ps.find((p) => p.name === 'Most Efficient')));
		for (const seg of plan.segments) {
			delete seg.deltaV_ms;
			delete seg.thrustDir;
		}
		const ship = { scheduled_journeys: [{ id: 'j', status: 'active', createdAtSec: '0', plans: [plan] }] };
		const accel = plan.segments.find((s: any) => s.type === 'Accel');
		const at = shipBurnAt(ship, accel.startTime + 1);
		expect(at.thrusting).toBe(true);
		expect(at.accelMs2).toBeGreaterThan(0);
		expect(at.thrustDir).toBeUndefined();
		const brake = plan.segments.find((s: any) => s.type === 'Brake');
		expect(shipBurnAt(ship, brake.startTime + 1).braking).toBe(true);
	});
});
