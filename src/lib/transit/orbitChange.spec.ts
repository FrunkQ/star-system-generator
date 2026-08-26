// THE TWO MANOEUVRES THAT HAD NUMBERS BUT NO PICTURE.
//
// G46 pass 2. Both were real in the engine and absent from the map: an orbit change was drawn as a
// line to the planet followed by the ship appearing somewhere else, and an aerobrake pass — costed
// since v3.0.78, down to the altitude and the number of dips — had no geometry at all.
//
// The orbit change turned out not to be merely undrawn. The general solver could not FLY it either:
// its Lambert window sweep has nothing sensible to sweep between two points a few planetary radii
// apart, so a ship asking to raise its Jupiter orbit was offered the torch option and nothing else.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { calculateTransitPlan } from './calculator.js';
import { getGlobalState } from './physics';
import { solveHohmann, transferEllipsePath, orbitCirclePath, aerobrakeDipPath } from './orbitChange';

const AU_KM = 1.495978707e8;
const AU_M = AU_KM * 1000;
const base = JSON.parse(fs.readFileSync(path.resolve('static/examples/Sol_Expanse-System.json'), 'utf-8'));
const T = 1767250575000;

/** A ship already in orbit of `hostName`, at `radiusKm`. */
function shipInOrbit(hostName: string, radiusKm: number) {
	const system = JSON.parse(JSON.stringify(base));
	const host = system.nodes.find((n: any) => n.name === hostName);
	const i = system.nodes.findIndex((n: any) => n.name === 'Rocinante (Tachi)');
	system.nodes[i] = {
		id: 'ship', parentId: host.id, name: 'Ship', kind: 'construct', tags: [],
		orbit: {
			hostId: host.id, hostMu: host.massKg * 6.6743e-11, t0: 1763640079144,
			elements: { a_AU: radiusKm / AU_KM, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0.5 }
		}
	};
	return { system, host };
}

function orbitChangePlans(hostName: string, fromKm: number, placement: string) {
	const { system, host } = shipInOrbit(hostName, fromKm);
	const plans = calculateTransitPlan(system, 'ship', host.id, T, 'Economy', {
		maxG: 0.3, accelRatio: 0.1, brakeRatio: 0.1, interceptSpeed_ms: 0, shipMass_kg: 1441575,
		shipIsp: 1100000, brakeAtArrival: true, arrivalPlacement: placement,
		aerobrake: { allowed: false, limit_kms: 0 }
	}).filter((p) => p.isValid);
	return { system, host, plans };
}

/** Radius from the host at the moment the ship is at that point — the host moves. */
function radiiKm(system: any, host: any, seg: any): number[] {
	const out: number[] = [];
	const times = seg.pathTimes ?? [];
	for (let i = 0; i < seg.pathPoints.length; i++) {
		const h = getGlobalState(system, host, times[i] ?? seg.startTime);
		const p = seg.pathPoints[i];
		out.push(Math.hypot(p.x - h.r.x, p.y - h.r.y, (p.z ?? 0) - (h.r.z ?? 0)) * AU_KM);
	}
	return out;
}

describe('the closed form', () => {
	it('reproduces the textbook LEO-to-GEO transfer', () => {
		// The canonical worked example, so the arithmetic is checked against something outside this
		// codebase: 6,678 km to 42,164 km about Earth is 2.42 + 1.47 km/s and a little over five hours.
		const MU_EARTH = 3.986004418e14;
		const sol = solveHohmann(6678 / AU_KM, 42164 / AU_KM, MU_EARTH)!;
		expect(sol).toBeTruthy();
		expect(sol.deltaV1_ms / 1000).toBeCloseTo(2.42, 1);
		expect(sol.deltaV2_ms / 1000).toBeCloseTo(1.47, 1);
		expect(sol.transferTimeSec / 3600).toBeCloseTo(5.26, 1);
	});

	it('lowering an orbit costs the same as raising it, with the burns reversed', () => {
		const MU_EARTH = 3.986004418e14;
		const up = solveHohmann(6678 / AU_KM, 42164 / AU_KM, MU_EARTH)!;
		const down = solveHohmann(42164 / AU_KM, 6678 / AU_KM, MU_EARTH)!;
		expect(down.totalDeltaV_ms).toBeCloseTo(up.totalDeltaV_ms, 3);
		expect(down.transferTimeSec).toBeCloseTo(up.transferTimeSec, 3);
		// Going down, both burns push against the motion.
		expect(down.deltaV1_ms).toBeLessThan(0);
		expect(down.deltaV2_ms).toBeLessThan(0);
		expect(up.deltaV1_ms).toBeGreaterThan(0);
		expect(up.deltaV2_ms).toBeGreaterThan(0);
	});

	it('is not a manoeuvre when there is nowhere to go', () => {
		const MU_EARTH = 3.986004418e14;
		expect(solveHohmann(7000 / AU_KM, 7000 / AU_KM, MU_EARTH)).toBeNull();
		expect(solveHohmann(0, 42164 / AU_KM, MU_EARTH)).toBeNull();
	});

	it('the transfer ellipse joins the two radii and nothing between them leaves the ring', () => {
		const u = { x: 1, y: 0, z: 0 };
		const w = { x: 0, y: 1, z: 0 };
		const r1 = 6678 / AU_KM;
		const r2 = 42164 / AU_KM;
		const ell = transferEllipsePath(r1, r2, u, w, 1000, 18900);
		const first = Math.hypot(ell.points[0].x, ell.points[0].y) * AU_KM;
		const last = Math.hypot(ell.points[ell.points.length - 1].x, ell.points[ell.points.length - 1].y) * AU_KM;
		expect(first).toBeCloseTo(6678, 0);
		expect(last).toBeCloseTo(42164, 0);
		for (const p of ell.points) {
			const r = Math.hypot(p.x, p.y) * AU_KM;
			expect(r).toBeGreaterThanOrEqual(6678 - 1);
			expect(r).toBeLessThanOrEqual(42164 + 1);
		}
		// Stamps land exactly on the segment's own bounds, which every drawn segment must (G46).
		expect(ell.timesMs[0]).toBe(1000);
		expect(ell.timesMs[ell.timesMs.length - 1]).toBe(1000 + 18900 * 1000);
	});
});

describe('an orbit change is offered, and it is the cheap one', () => {
	for (const [placement, label] of [['mo', 'medium'], ['ho', 'high']] as const) {
		it(`Jupiter low orbit -> ${label} orbit: a Hohmann plan exists and beats the torch`, () => {
			const { plans } = orbitChangePlans('Jupiter', 70076.33, placement);
			const hohmann = plans.find((p) => p.orbitChange);
			expect(hohmann, 'no orbit-change plan was produced').toBeTruthy();
			const torch = plans.find((p) => p.planType === 'Speed');
			if (torch) {
				// The whole point: before this, the torch was the ONLY option offered for a manoeuvre
				// that a first-year textbook does in two burns. Measured at Jupiter low -> high:
				// 19.55 km/s against the torch's 45.44.
				expect(hohmann!.totalDeltaV_ms).toBeLessThan(torch.totalDeltaV_ms);
			}
			expect(hohmann!.tags).toContain('HOHMANN');
		});
	}

	it('burn, ellipse, burn — and each phase sits where it belongs', () => {
		const { system, host, plans } = orbitChangePlans('Jupiter', 70076.33, 'mo');
		const plan = plans.find((p) => p.orbitChange)!;
		const [burn1, transfer, burn2] = plan.segments;
		expect(burn1.type).toBe('Accel');
		expect(transfer.type).toBe('Coast');
		expect(burn2.type).toBe('Brake');

		const r1 = plan.orbitChange!.fromRadius_au * AU_KM;
		const r2 = plan.orbitChange!.toRadius_au * AU_KM;
		expect(r2).toBeGreaterThan(r1);

		// The first burn happens ON the orbit being left, and stays there.
		for (const r of radiiKm(system, host, burn1)) expect(Math.abs(r - r1)).toBeLessThan(r1 * 0.01);
		// The second happens ON the orbit being joined.
		for (const r of radiiKm(system, host, burn2)) expect(Math.abs(r - r2)).toBeLessThan(r2 * 0.01);
		// And the transfer climbs from one to the other without straying outside either.
		const tr = radiiKm(system, host, transfer);
		expect(Math.abs(tr[0] - r1)).toBeLessThan(r1 * 0.01);
		expect(Math.abs(tr[tr.length - 1] - r2)).toBeLessThan(r2 * 0.01);
		for (const r of tr) {
			expect(r).toBeGreaterThan(r1 * 0.99);
			expect(r).toBeLessThan(r2 * 1.01);
		}
	});

	it('carries the figure the picture is drawn from, and no baked point arrays', () => {
		const { plans } = orbitChangePlans('Jupiter', 70076.33, 'ho');
		const fig = plans.find((p) => p.orbitChange)!.orbitChange!;
		// Radii and a plane, not points: the host moves, and journeys ride the player snapshot.
		expect(fig.fromRadius_au).toBeGreaterThan(0);
		expect(fig.toRadius_au).toBeGreaterThan(fig.fromRadius_au);
		for (const v of [fig.u, fig.w]) {
			expect(Math.hypot(v.x, v.y, v.z ?? 0)).toBeCloseTo(1, 9);
		}
		// The basis is orthogonal, or the circles it generates are not circles.
		expect(Math.abs(fig.u.x * fig.w.x + fig.u.y * fig.w.y + (fig.u.z ?? 0) * (fig.w.z ?? 0))).toBeLessThan(1e-9);
		// The circle the renderer draws from it really has that radius.
		const circle = orbitCirclePath(fig.toRadius_au, fig.u, fig.w, 64);
		for (const p of circle) {
			expect(Math.hypot(p.x, p.y, p.z ?? 0)).toBeCloseTo(fig.toRadius_au, 12);
		}
	});
});

describe('the aerobrake dip has geometry now', () => {
	function aeroPlan(targetName: string) {
		const system = JSON.parse(JSON.stringify(base));
		const i = system.nodes.findIndex((n: any) => n.name === 'Rocinante (Tachi)');
		system.nodes[i] = {
			id: 'ship', parentId: 'solar-system-sun', name: 'Ship', kind: 'construct', tags: [],
			orbit: {
				hostId: 'solar-system-sun', hostMu: 132751826999999990000, t0: 1763640079144,
				elements: { a_AU: 3.0, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 1.0 }
			}
		};
		const target = system.nodes.find((n: any) => n.name === targetName);
		const plan = calculateTransitPlan(system, 'ship', target.id, T, 'Economy', {
			maxG: 0.3, accelRatio: 0.1, brakeRatio: 0.1, interceptSpeed_ms: 0, shipMass_kg: 1441575,
			shipIsp: 1100000, brakeAtArrival: true, arrivalPlacement: 'ho',
			aerobrake: { allowed: true, limit_kms: 12 }
		}).filter((p: any) => p.isValid).find((p: any) => p.name === 'Most Efficient');
		return { system, target, plan };
	}

	for (const name of ['Mars', 'Venus', 'Earth']) {
		it(`${name}: the dip is drawn, and it dips to the altitude it was costed at`, () => {
			const { system, target, plan } = aeroPlan(name);
			expect(plan, `${name}: no plan`).toBeTruthy();
			expect(plan!.aerobrakingDeltaV_ms, `${name}: no aerobraking happened`).toBeGreaterThan(0);
			const dip = plan!.segments.find((s) => s.type === 'Aerobrake');
			expect(dip, `${name}: aerobraking was costed but never drawn`).toBeTruthy();
			expect(dip!.pathPoints.length).toBeGreaterThan(10);

			const rs = radiiKm(system, target, dip!);
			const surface = (target as any).radiusKm;
			const lowest = Math.min(...rs) - surface;
			// It really goes down into the air, at the corridor altitude physics/aerobrake.ts costed.
			expect(lowest).toBeGreaterThan(0);
			expect(lowest).toBeLessThan(200);
			// ...and comes back out to the orbit it was aiming for.
			expect(Math.max(...rs)).toBeGreaterThan(surface * 2);
			// The pass count reaches the label rather than being lost.
			expect(dip!.warnings.join(' ')).toMatch(/pass/i);
		});
	}

	it('the dip costs the ship NOTHING in propellant, because the air is doing it', () => {
		const { plan } = aeroPlan('Mars');
		const dip = plan!.segments.find((s) => s.type === 'Aerobrake')!;
		expect(dip.fuelUsed_kg).toBe(0);
		expect(dip.deltaV_ms).toBeUndefined();
	});

	it('the journey now lasts as long as the plan always said it would', () => {
		// The passes were costed in `aeroTimeSec` and reported in the ship's log, but the plan's own
		// duration stopped at the moment the ship reached the planet — so a Mars arrival that spends
		// 615 days dipping was drawn as parked for all of them.
		const { plan } = aeroPlan('Mars');
		const aeroDays = (plan!.aeroTimeSec ?? 0) / 86400;
        expect(aeroDays).toBeGreaterThan(100);
		const flightEnd = plan!.segments.find((s) => s.type === 'Aerobrake')!.startTime;
		const flightDays = (flightEnd - plan!.startTime) / 86400000;
		expect(plan!.totalTime_days).toBeGreaterThan(flightDays + aeroDays * 0.9);
	});

	it('a dozen passes draw as one dip, not as a dozen arcs', () => {
		// The Q4 worry, answered by construction: the loops COINCIDE, so twelve of them are one shape
		// on the map while the ship genuinely goes round twelve times at the speed it was charged for.
		const u = { x: 1, y: 0, z: 0 };
		const w = { x: 0, y: 1, z: 0 };
		const one = aerobrakeDipPath({ apoapsis_au: 1e-3, periapsis_au: 1e-4, passes: 1, u, w, startTimeMs: 0, durationSec: 100 });
		const twelve = aerobrakeDipPath({ apoapsis_au: 1e-3, periapsis_au: 1e-4, passes: 12, u, w, startTimeMs: 0, durationSec: 1200 });
		expect(twelve.drawnPasses).toBe(12);
		// Every loop retraces the first: the shape is identical, only the clock advances.
		const per = (one.points.length - 1);
		for (let i = 0; i <= per; i++) {
			expect(twelve.points[i].x).toBeCloseTo(one.points[i].x, 12);
			expect(twelve.points[i + per].x).toBeCloseTo(one.points[i].x, 12);
		}
	});

	it('an absurd number of passes is CAPPED, and says so rather than silently truncating', () => {
		const u = { x: 1, y: 0, z: 0 };
		const w = { x: 0, y: 1, z: 0 };
		const many = aerobrakeDipPath({ apoapsis_au: 1e-3, periapsis_au: 1e-4, passes: 500, u, w, startTimeMs: 0, durationSec: 1000 });
		expect(many.drawnPasses).toBe(24);
		expect(many.drawnPasses).toBeLessThan(500);
	});
});
