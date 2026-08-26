// MOVING BETWEEN TWO ORBITS OF ONE BODY — the Hohmann transfer, and the figure everyone pictures.
//
// A ship raising or lowering its orbit is doing the most classical manoeuvre in astronautics: burn
// once to stretch the orbit into an ellipse that reaches the height you want, coast half way round it,
// burn again to circularise there. Initial orbit, transfer ellipse, final orbit, two burns.
//
// The app could not draw that, and it turned out it could not FLY it either. The general solver treats
// every journey as a Lambert problem between two points and sweeps departure windows looking for one
// that fits; asked to move a ship from a low Jupiter orbit to a high one it returned only the torch
// option, at 45.44 km/s. The Hohmann answer to the same manoeuvre is closed-form, exact, and costs a
// fraction of that. There is nothing to search for: the transfer ellipse is fully determined by the two
// radii, and its duration is half its own period.
//
// WHY THIS IS ITS OWN MODULE rather than another branch inside `calculateTransitPlan`. That function is
// already 617 lines and three plan families deep, and none of its machinery applies here — no launch
// window, no Lambert, no gravity assist, no arrival-relative velocity to resolve. What it needs is four
// lines of orbital mechanics and the geometry that follows from them.
import type { Vector2 } from './types';

const AU_KM = 1.495978707e8;
const AU_M = AU_KM * 1000;

export interface HohmannSolution {
	/** Speed change at each burn, m/s. Both are along the motion: positive raises, negative lowers. */
	deltaV1_ms: number;
	deltaV2_ms: number;
	/** Total, as the panel reports it: both burns cost fuel whichever way they point. */
	totalDeltaV_ms: number;
	/** Half the period of the transfer ellipse — the coast, and the whole journey. */
	transferTimeSec: number;
	/** Semi-major axis of the transfer ellipse, AU. */
	transferSemiMajor_au: number;
	/** Circular speeds either end, m/s — what the ship is doing before burn 1 and after burn 2. */
	speedStart_ms: number;
	speedEnd_ms: number;
}

/**
 * The two-burn transfer between circular orbits of radii `r1` and `r2` about a body of mass parameter
 * `mu` (m^3/s^2). Radii in AU. Returns null for a manoeuvre that is not one — same orbit, no host.
 *
 * Raising and lowering are the same solution: burn 1 is prograde going up and retrograde coming down,
 * and the sign falls out of the arithmetic rather than needing a branch.
 */
export function solveHohmann(r1_au: number, r2_au: number, mu: number): HohmannSolution | null {
	if (!(r1_au > 0) || !(r2_au > 0) || !(mu > 0)) return null;
	// A transfer to the orbit you are already in is not a manoeuvre. One part in ten thousand is well
	// inside what the derived orbit bands differ by, so this is a real "same orbit", not a rounding.
	if (Math.abs(r2_au - r1_au) / r1_au < 1e-4) return null;

	const r1 = r1_au * AU_M;
	const r2 = r2_au * AU_M;
	const a = (r1 + r2) / 2;

	const v1 = Math.sqrt(mu / r1); // circular speed where we start
	const v2 = Math.sqrt(mu / r2); // circular speed where we finish
	// Speed on the transfer ellipse at each end, from the vis-viva equation v^2 = mu(2/r - 1/a).
	const vTransferAtR1 = Math.sqrt(mu * (2 / r1 - 1 / a));
	const vTransferAtR2 = Math.sqrt(mu * (2 / r2 - 1 / a));

	const deltaV1_ms = vTransferAtR1 - v1;
	const deltaV2_ms = v2 - vTransferAtR2;
	const transferTimeSec = Math.PI * Math.sqrt((a * a * a) / mu);
	if (!Number.isFinite(transferTimeSec) || transferTimeSec <= 0) return null;

	return {
		deltaV1_ms,
		deltaV2_ms,
		totalDeltaV_ms: Math.abs(deltaV1_ms) + Math.abs(deltaV2_ms),
		transferTimeSec,
		transferSemiMajor_au: a / AU_M,
		speedStart_ms: v1,
		speedEnd_ms: v2
	};
}

/**
 * The transfer ellipse itself, host-relative, as points and their times.
 *
 * Half an ellipse with periapsis at `r1` and apoapsis at `r2` (or the other way for a descent), drawn
 * in the plane spanned by `u` (toward the first burn) and `w` (the direction of travel there). The ship
 * starts at `u * r1` and finishes half a revolution later at `-u * r2`.
 *
 * Sampled by TRUE ANOMALY rather than by time, then time-stamped from Kepler's equation. That is the
 * whole point: an ellipse crawls through apoapsis and races through periapsis, so time-uniform samples
 * bunch at the wrong end and leave a visible corner at the other — the same fault the coast paths had
 * before G46, and the reason `pathSampling` refines by turn.
 */
export function transferEllipsePath(
	r1_au: number,
	r2_au: number,
	u: Vector2,
	w: Vector2,
	startTimeMs: number,
	transferTimeSec: number,
	points = 96
): { points: Vector2[]; timesMs: number[] } {
	const n = Math.max(3, points);
	const a = (r1_au + r2_au) / 2;
	const e = Math.abs(r2_au - r1_au) / (r1_au + r2_au);
	// True anomaly runs 0 -> PI across the transfer. When the ship is climbing it starts at periapsis;
	// when it is descending it starts at apoapsis, which is nu = PI running to 2*PI.
	const climbing = r2_au > r1_au;
	const nu0 = climbing ? 0 : Math.PI;

	const out: Vector2[] = [];
	const timesMs: number[] = [];
	for (let i = 0; i < n; i++) {
		const frac = i / (n - 1);
		const nu = nu0 + Math.PI * frac;
		const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu));
		// Position in the manoeuvre plane. At nu = nu0 this is exactly u * r1, which is where the ship
		// is; at the far end it is exactly -u * r2, which is where the second burn happens.
		const ang = nu - nu0;
		const dir = climbing ? 1 : -1;
		const cx = Math.cos(ang) * (climbing ? 1 : 1);
		const sx = Math.sin(ang);
		out.push({
			x: (u.x * cx + w.x * sx * dir) * r,
			y: (u.y * cx + w.y * sx * dir) * r,
			z: ((u.z ?? 0) * cx + (w.z ?? 0) * sx * dir) * r
		});
		// Kepler: eccentric anomaly from true, then mean, then time. Gives each sample the moment the
		// ship is actually there, so the drawn ellipse and the flown one are the same object.
		const cosNu = Math.cos(nu);
		const E = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(nu), e + cosNu);
		const M = E - e * Math.sin(E);
		const M0 = climbing ? 0 : Math.PI;
		let dM = M - M0;
		while (dM < 0) dM += 2 * Math.PI;
		const tSec = (dM / Math.PI) * transferTimeSec;
		timesMs.push(startTimeMs + Math.min(transferTimeSec, Math.max(0, tSec)) * 1000);
	}
	// Kepler's equation is exact at both ends; force them anyway so the segment's stamps match its own
	// bounds to the millisecond, which `pathGeometry.spec.ts` requires of every segment.
	timesMs[0] = startTimeMs;
	timesMs[n - 1] = startTimeMs + transferTimeSec * 1000;
	return { points: out, timesMs };
}

/** A circle of radius `r` in the plane of `u` and `w`, host-relative — the initial or final orbit of
 *  the figure. Context, not a flown path, so it is generated at draw time from the plan's basis. */
export function orbitCirclePath(r_au: number, u: Vector2, w: Vector2, points = 128): Vector2[] {
	const out: Vector2[] = [];
	for (let i = 0; i <= points; i++) {
		const t = (i / points) * 2 * Math.PI;
		const c = Math.cos(t);
		const s = Math.sin(t);
		out.push({
			x: (u.x * c + w.x * s) * r_au,
			y: (u.y * c + w.y * s) * r_au,
			z: ((u.z ?? 0) * c + (w.z ?? 0) * s) * r_au
		});
	}
	return out;
}

/**
 * THE AEROBRAKE DIP: the other way to change orbit, paid for in heat instead of fuel.
 *
 * It belongs beside the Hohmann transfer because it IS one - a repeated lowering of the orbit, with
 * the atmosphere doing the second burn. `physics/aerobrake.ts` has said how deep the dip goes, how
 * many passes it takes and how long they take since v3.0.78; what it has never had is anywhere to be
 * DRAWN, so the manoeuvre was real in the numbers and absent from the picture.
 *
 * One loop per pass, between apoapsis at the orbit being aimed for and periapsis down in the air.
 * The loops coincide, so a dozen of them read as a single dip rather than as a dozen overlapping
 * arcs - which was the worry - while the ship genuinely goes round the number of times it is charged
 * for, at the speed it is charged for. Real aerobraking walks its apoapsis down over the passes; this
 * does not model that, because the plan does not model it either and inventing the intermediate
 * orbits here would be geometry with nothing behind it.
 *
 * Points are sampled by TRUE ANOMALY, so the pass is dense where it dips and sparse out at the top -
 * which is where the interest is and, since the ship moves fastest at periapsis, also where a
 * time-uniform sample would have left the worst corner (G46).
 */
export function aerobrakeDipPath(opts: {
	apoapsis_au: number;
	periapsis_au: number;
	passes: number;
	u: Vector2;
	w: Vector2;
	startTimeMs: number;
	durationSec: number;
}): { points: Vector2[]; timesMs: number[]; drawnPasses: number } {
	const { apoapsis_au, periapsis_au, u, w, startTimeMs, durationSec } = opts;
	if (!(apoapsis_au > 0) || !(periapsis_au > 0) || !(durationSec > 0)) {
		return { points: [], timesMs: [], drawnPasses: 0 };
	}
	const ra = Math.max(apoapsis_au, periapsis_au);
	const rp = Math.min(apoapsis_au, periapsis_au);
	const a = (ra + rp) / 2;
	const e = ra > rp ? (ra - rp) / (ra + rp) : 0;

	// A CAP, AND IT IS DECLARED RATHER THAN SILENT. Beyond this many passes the loops are drawing on
	// top of each other anyway; the caller reports the real count in the label.
	const MAX_DRAWN_PASSES = 24;
	const wanted = Math.max(1, Math.round(opts.passes || 1));
	const drawnPasses = Math.min(MAX_DRAWN_PASSES, wanted);
	const perLoop = 40;

	const points: Vector2[] = [];
	const timesMs: number[] = [];
	const total = drawnPasses * perLoop;
	for (let i = 0; i <= total; i++) {
		// Start at apoapsis (nu = PI), fall to periapsis, climb back - one revolution per pass.
		const nu = Math.PI + (i / perLoop) * 2 * Math.PI;
		const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu));
		const ang = nu - Math.PI;
		const c = Math.cos(ang);
		const sn = Math.sin(ang);
		points.push({
			x: (u.x * c + w.x * sn) * r,
			y: (u.y * c + w.y * sn) * r,
			z: ((u.z ?? 0) * c + (w.z ?? 0) * sn) * r
		});
		timesMs.push(startTimeMs + (i / total) * durationSec * 1000);
	}
	return { points, timesMs, drawnPasses };
}
