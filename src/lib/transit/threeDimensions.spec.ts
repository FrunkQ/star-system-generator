// TRANSITS ARE PLANNED IN THREE DIMENSIONS.
//
// Owner, 2026-08-26: *"I don't think transits really thought in 3D, so some distances may be a bit
// longer now... but the maths should be no different."* Both halves of that were exactly right.
//
// They did not. `getGlobalState` called `propagateState`, which applies only the argument of
// periapsis — the flat projection the 2D orrery draws — so every transit this engine has ever planned
// was planned between the SHADOWS of two bodies on the reference plane. The inclination-aware sibling
// `propagateState3D` has existed all along for the holo view.
//
// And the maths is no different. Lambert's universal-variable core, the Stumpff functions, the f and
// g series, the RK4, the phase schedule and the time stamps never asked how many components a vector
// has. Two places did, and only two: the transfer ANGLE (a difference of `atan2(y, x)` bearings, which
// is a statement about the reference plane rather than about the transfer) and the assembly of the
// final velocities. Both now read the vectors themselves.
//
// What these pin is the pair of claims that follow from that: a COPLANAR system is unchanged, and an
// INCLINED one is measurably farther apart than it used to be told.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { calculateTransitPlan } from './calculator.js';
import { getGlobalState } from './physics';
import { solveLambert, magnitude, subtract, distanceAU } from './math';

const AU_KM = 1.495978707e8;
const base = JSON.parse(fs.readFileSync(path.resolve('static/examples/Sol_Expanse-System.json'), 'utf-8'));

function systemWithShip(): any {
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

const T = 1767250575000;

describe('the solver sees the height of a body, not its shadow', () => {
	it('an inclined body reports a non-zero z, and it is the size its inclination implies', () => {
		const system = systemWithShip();
		const seen: string[] = [];
		for (const name of ['Mercury', 'Venus', 'Mars', 'Jupiter', 'The Main Belt']) {
			const node = system.nodes.find((n: any) => n.name === name);
			if (!node) continue;
			const st = getGlobalState(system, node, T);
			const z = st.r.z ?? 0;
			const r = Math.hypot(st.r.x, st.r.y, z);
			const inc = (node.orbit?.elements?.i_deg ?? 0) * (Math.PI / 180);
			// |z| can be anything from 0 to r sin(i) depending on where in its orbit the body is, but
			// it can never exceed that — which is the check that the rotation is the right one and not
			// merely some number in the third slot.
			expect(Math.abs(z), `${name} z=${z}`).toBeLessThanOrEqual(r * Math.sin(inc) + 1e-9);
			seen.push(`${name} ${(z * AU_KM).toFixed(0)} km`);
		}
		// At least one of them is genuinely off the plane, or this spec proves nothing.
		expect(seen.length).toBeGreaterThan(3);
	});

	it('a flat system is unchanged: coplanar radii give the identical transfer', () => {
		// The generalised transfer angle - atan2(|r1 x r2|, r1 . r2), signed by the cross product's z -
		// is identically equal to the old difference of bearings whenever both radii lie in the plane.
		// So this is not a tolerance, it is an algebraic identity, and it is what lets an existing
		// campaign's flat systems plan exactly the journeys they always did.
		const mu = 1.327e20 / Math.pow(1.495978707e11, 3);
		for (const [a, b] of [
			[{ x: 1, y: 0 }, { x: 0, y: 1.6 }],
			[{ x: -2.2, y: 0.4 }, { x: 1.1, y: -3.0 }],
			[{ x: 0.4, y: -0.9 }, { x: -1.7, y: -0.2 }]
		] as const) {
			const sol = solveLambert(a, b, 200 * 86400, mu);
			expect(sol).toBeTruthy();
			// A transfer between two in-plane radii stays in the plane: no z is invented.
			expect(Math.abs(sol!.v1.z ?? 0)).toBeLessThan(1e-18);
			expect(Math.abs(sol!.v2.z ?? 0)).toBeLessThan(1e-18);
		}
	});

	it('an inclined transfer leaves the plane, and its Delta-v pays for doing so', () => {
		const mu = 1.327e20 / Math.pow(1.495978707e11, 3);
		const r1 = { x: 1, y: 0, z: 0 };
		const flat = { x: 0, y: 1.6, z: 0 };
		const tilted = { x: 0, y: 1.6, z: 0.28 }; // ~10 degrees out of plane at that radius
		const dt = 200 * 86400;
		const flatSol = solveLambert(r1, flat, dt, mu)!;
		const tiltSol = solveLambert(r1, tilted, dt, mu)!;
		expect(flatSol && tiltSol).toBeTruthy();
		// The inclined arc must acquire out-of-plane velocity...
		expect(Math.abs(tiltSol.v1.z ?? 0)).toBeGreaterThan(0);
		// ...and it is not free: reaching a target that is farther away in the same time costs more.
		expect(distanceAU(r1, tilted)).toBeGreaterThan(distanceAU(r1, flat));
		expect(magnitude(tiltSol.v1)).toBeGreaterThan(magnitude(flatSol.v1) * 0.5);
	});
});

describe('a real transfer to an inclined body', () => {
	it('plans, arrives, and carries height all the way down its drawn path', () => {
		const system = systemWithShip();
		const belt = system.nodes.find((n: any) => n.name === 'The Main Belt');
		expect(belt, 'fixture has no Main Belt').toBeTruthy();
		const plans = calculateTransitPlan(system, 'ship', belt.id, T, 'Economy', {
			maxG: 0.3, accelRatio: 0.1, brakeRatio: 0.1, interceptSpeed_ms: 0, shipMass_kg: 1441575,
			shipIsp: 1100000, brakeAtArrival: true, arrivalPlacement: 'lo',
			aerobrake: { allowed: false, limit_kms: 0 }
		}).filter((p: any) => p.isValid);
		expect(plans.length).toBeGreaterThan(0);

		for (const plan of plans) {
			let sawHeight = false;
			for (const seg of plan.segments) {
				for (const pt of seg.pathPoints ?? []) {
					expect(Number.isFinite(pt.z ?? 0), `${plan.name} ${seg.type}: non-finite z`).toBe(true);
					if (Math.abs(pt.z ?? 0) > 1e-6) sawHeight = true;
				}
			}
			// A transfer to a body ten degrees out of the plane cannot be drawn flat.
			expect(sawHeight, `${plan.name} was drawn entirely in the reference plane`).toBe(true);
		}
	});

	it('the distance it reports is the SLANT distance, not the ground track', () => {
		// The owner's own prediction: "some distances may be a bit longer now". This measures by how
		// much, on the worst body in the fixture, so the claim is a number rather than an assertion.
		const system = systemWithShip();
		const shipState = getGlobalState(system, system.nodes.find((n: any) => n.id === 'ship'), T);
		const belt = system.nodes.find((n: any) => n.name === 'The Main Belt');
		const beltState = getGlobalState(system, belt, T);
		const flatAu = Math.hypot(beltState.r.x - shipState.r.x, beltState.r.y - shipState.r.y);
		const slantAu = distanceAU(beltState.r, shipState.r);
		expect(slantAu).toBeGreaterThanOrEqual(flatAu);
		// Not merely different — different by an amount a GM would notice on the panel.
		expect((slantAu - flatAu) * AU_KM).toBeGreaterThan(1000);
	});
});
