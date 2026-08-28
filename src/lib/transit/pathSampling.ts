// A SEGMENT OWNS ITS OWN PATH, AT ITS OWN RESOLUTION, IN ITS OWN FRAME.
//
// That one sentence is the whole of G46. What came before it was a single uniform path — one sample
// per two days, spread over the entire journey — sliced into Accel / Coast / Brake by comparing each
// sample's timestamp against the phase boundaries. A burn lasting under an hour inside a three-year
// transfer therefore caught NO samples, and a fallback stuffed the last two COAST samples into it
// instead. The drawn burn then implied 1,366 km/s for a ship that does about 10 km/s in an hour
// (measured, Sol Expanse, Jupiter at 0.3 g) — a straight sprint across three million kilometres in
// forty minutes, at exactly the moment the eye is on the ship because the engine is lit.
//
// This module owns the two halves of the correction:
//
//   1. BUILDING THE SCHEDULE. Each phase asks for the number of points it needs over its own
//      duration, so a short burn is sampled finely in absolute terms and a long coast keeps the
//      two-day cadence it always had. Boundaries are shared exactly between neighbouring phases, so
//      the drawn strokes meet rather than merely coming close.
//
//   2. READING IT BACK. Samples carry their own times, so "where is the ship at t" is a search for
//      the two points that actually BRACKET t rather than an assumption that index maps linearly to
//      time. That assumption was made independently in four places (the flight sampler, the drawn
//      route line, the telemetry HUD and the planner preview) and all four now come here, because
//      four answers to one question is how they drift apart.
import type { Vector2 } from './types';

/** A window of a journey that owns a stretch of path. Times are seconds from the journey start. */
export interface PhaseWindow {
	key: string;
	startSec: number;
	endSec: number;
	/** Cadence this phase would like, in seconds. Defaults to PREFERRED_SPACING_SEC. A torch plan
	 *  crosses the system in weeks and has always drawn at a two-hour cadence; a Hohmann coast takes
	 *  years and has always drawn at two days. Both stay as they were. */
	spacingSec?: number;
}

/** Where each phase's points live inside the flat sample list. Indices are INCLUSIVE at both ends,
 *  and neighbouring phases deliberately share their boundary index. */
export interface PathSchedule {
	timesSec: number[];
	ranges: { key: string; from: number; to: number }[];
}

/** The cadence a coast has always drawn at. Keeping it means an ordinary interplanetary transfer is
 *  unchanged to the eye where it was already right — the fix adds points to the burns, it does not
 *  redraw the coast. */
export const PREFERRED_SPACING_SEC = 172800; // 2 days

/** Enough for a burn arc to read as an arc rather than as a chord. A sub-hour burn wants tens of
 *  points, not the two it used to borrow from its neighbours. */
export const MIN_PHASE_POINTS = 24;

/** No single phase runs away with the budget. */
export const MAX_PHASE_POINTS = 900;

/** Total points per plan. Journeys ride the player snapshot and get broadcast, and an unbounded
 *  per-phase count would grow that without a ceiling — the sister project has already been bitten
 *  once by a frame limit reached this way. */
export const DEFAULT_PATH_BUDGET = 1500;

/** What a phase would take if nothing else were competing for the budget. */
function wantedPoints(durationSec: number, spacingSec: number): number {
	if (!(durationSec > 0)) return 2;
	const natural = Math.ceil(durationSec / Math.max(1, spacingSec)) + 1;
	return Math.max(MIN_PHASE_POINTS, Math.min(MAX_PHASE_POINTS, natural));
}

/**
 * Plan where to sample a journey so that every phase is drawn at its own resolution.
 *
 * Phases must be given in flight order and must be contiguous; zero-length phases are dropped,
 * since a phase with no duration has no path to own.
 */
export function buildPathSchedule(
	phases: PhaseWindow[],
	budget: number = DEFAULT_PATH_BUDGET
): PathSchedule {
	const live = phases.filter((p) => p.endSec > p.startSec);
	if (live.length === 0) return { timesSec: [], ranges: [] };

	let counts = live.map((p) => wantedPoints(p.endSec - p.startSec, p.spacingSec ?? PREFERRED_SPACING_SEC));

	// Squeeze to the budget if the wants overrun it. Each phase keeps at least two points (a phase
	// drawn with one point draws no line at all), and the trim falls on the phases asking for most.
	const totalWanted = () => counts.reduce((a, b) => a + b, 0) - (counts.length - 1);
	if (totalWanted() > budget) {
		const floor = 2;
		const spare = counts.map((c) => Math.max(0, c - floor));
		const spareTotal = spare.reduce((a, b) => a + b, 0);
		const mustLose = totalWanted() - budget;
		if (spareTotal > 0) {
			counts = counts.map((c, i) =>
				Math.max(floor, c - Math.round((spare[i] / spareTotal) * mustLose))
			);
		}
	}

	const timesSec: number[] = [];
	const ranges: { key: string; from: number; to: number }[] = [];

	for (let p = 0; p < live.length; p++) {
		const phase = live[p];
		const n = Math.max(2, counts[p]);
		const span = phase.endSec - phase.startSec;
		// The first phase emits its opening point; later phases inherit their neighbour's closing
		// point as their own opening one, so the two strokes share a vertex exactly.
		const from = p === 0 ? timesSec.length : timesSec.length - 1;
		if (p === 0) timesSec.push(phase.startSec);
		for (let i = 1; i < n; i++) timesSec.push(phase.startSec + (span * i) / (n - 1));
		ranges.push({ key: phase.key, from, to: timesSec.length - 1 });
	}

	return { timesSec, ranges };
}

/** Pull one phase's points and their absolute times out of an integrated path. */
export function slicePhase(
	schedule: PathSchedule,
	points: Vector2[],
	key: string,
	startTimeMs: number
): { points: Vector2[]; timesMs: number[] } {
	const range = schedule.ranges.find((r) => r.key === key);
	if (!range) return { points: [], timesMs: [] };
	const out: Vector2[] = [];
	const timesMs: number[] = [];
	for (let i = range.from; i <= range.to && i < points.length; i++) {
		out.push(points[i]);
		timesMs.push(startTimeMs + schedule.timesSec[i] * 1000);
	}
	return { points: out, timesMs };
}

/**
 * THE TIME OF EACH DRAWN SAMPLE.
 *
 * Prefers the segment's own stamps. Falls back to assuming the samples are evenly spaced across the
 * segment, which is what every reader used to assume unconditionally — journeys saved before G46,
 * and segments from producers that do not stamp yet, still have to be drawn.
 */
export function pathSampleTimesMs(seg: {
	pathPoints?: Vector2[] | null;
	pathTimes?: number[] | null;
	startTime: number;
	endTime: number;
}): number[] {
	const pts = seg.pathPoints ?? [];
	const stamped = seg.pathTimes;
	if (stamped && stamped.length === pts.length && pts.length > 0) return stamped;
	if (pts.length === 0) return [];
	if (pts.length === 1) return [seg.startTime];
	const span = seg.endTime - seg.startTime;
	return pts.map((_, i) => seg.startTime + (span * i) / (pts.length - 1));
}

/**
 * WHERE THE SHIP IS AT `timeMs`, AND HOW FAST IT IS GOING THERE.
 *
 * The single implementation. Finds the two samples that bracket the query by TIME and interpolates
 * between them; the reported velocity is the chord speed of that bracket, which is what the drawn
 * line actually does between those two vertices.
 *
 * Returns null when the segment has nothing to read.
 */
export function samplePathAtTime(
	seg: {
		pathPoints?: Vector2[] | null;
		pathTimes?: number[] | null;
		startTime: number;
		endTime: number;
	},
	timeMs: number
): { position_au: Vector2; velocity_ms: { x: number; y: number; z: number } } | null {
	const points = seg.pathPoints ?? [];
	if (points.length === 0) return null;
	if (points.length === 1) return { position_au: points[0], velocity_ms: { x: 0, y: 0, z: 0 } };

	const times = pathSampleTimesMs(seg);
	const clamped = Math.max(times[0], Math.min(times[times.length - 1], timeMs));

	// Binary search for the bracket. Paths run to hundreds of points and this is called every frame
	// for every ship in flight, so a scan is not free.
	let lo = 0;
	let hi = times.length - 1;
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (times[mid] <= clamped) lo = mid;
		else hi = mid;
	}

	const p0 = points[lo];
	const p1 = points[hi];
	const dtMs = times[hi] - times[lo];
	const alpha = dtMs > 0 ? (clamped - times[lo]) / dtMs : 0;

	const z0 = p0.z ?? 0;
	const z1 = p1.z ?? 0;
	const position_au = {
		x: p0.x + (p1.x - p0.x) * alpha,
		y: p0.y + (p1.y - p0.y) * alpha,
		z: z0 + (z1 - z0) * alpha
	};

	const dtSec = Math.max(1e-6, dtMs / 1000);
	const AU_M = 1.495978707e11;
	const velocity_ms = {
		x: ((p1.x - p0.x) * AU_M) / dtSec,
		y: ((p1.y - p0.y) * AU_M) / dtSec,
		z: ((z1 - z0) * AU_M) / dtSec
	};

	return { position_au, velocity_ms };
}

/** How sharply a drawn path may bend at one vertex before it reads as a polygon rather than a curve.
 *  Four degrees draws a full circle with ninety sides. MEASURED on the Sol Expanse fixture: an
 *  interplanetary coast turns at most 2.24 degrees per sample at the two-day cadence, so it never
 *  triggers refinement — but a Jupiter-local transfer turned 56.8 degrees, because time-uniform
 *  sampling under-samples exactly where the arc bends hardest, near periapsis. */
export const MAX_TURN_DEG = 4;

/** Turn angle in degrees at each interior vertex of a polyline. */
function turnAngles(points: Vector2[]): number[] {
	const out: number[] = new Array(points.length).fill(0);
	for (let i = 2; i < points.length; i++) {
		const ax = points[i - 1].x - points[i - 2].x;
		const ay = points[i - 1].y - points[i - 2].y;
		const az = (points[i - 1].z ?? 0) - (points[i - 2].z ?? 0);
		const bx = points[i].x - points[i - 1].x;
		const by = points[i].y - points[i - 1].y;
		const bz = (points[i].z ?? 0) - (points[i - 1].z ?? 0);
		const na = Math.hypot(ax, ay, az);
		const nb = Math.hypot(bx, by, bz);
		if (!(na > 1e-15) || !(nb > 1e-15)) continue;
		const c = Math.max(-1, Math.min(1, (ax * bx + ay * by + az * bz) / (na * nb)));
		out[i - 1] = (Math.acos(c) * 180) / Math.PI;
	}
	return out;
}

/**
 * PUT THE POINTS WHERE THE PATH BENDS.
 *
 * The clock does not know where an orbit turns. A time-uniform schedule is right for a coast and
 * wrong for anything that swings past a body, because angular rate peaks at closest approach and a
 * fixed cadence walks straight past it — which is why a Jupiter-local transfer drew a 56.8 degree
 * corner. This looks at what was actually drawn and subdivides the intervals whose corners are too
 * sharp, keeping the phase boundaries exactly where they were.
 *
 * Returns null when nothing needs refining, so the common interplanetary case pays one comparison
 * and no second integration.
 */
export function refineScheduleByTurn(
	schedule: PathSchedule,
	drawnPoints: Vector2[],
	maxTurnDeg: number = MAX_TURN_DEG,
	budget: number = DEFAULT_PATH_BUDGET
): PathSchedule | null {
	const times = schedule.timesSec;
	if (times.length < 3 || drawnPoints.length !== times.length) return null;
	if (times.length >= budget) return null;

	const turns = turnAngles(drawnPoints);
	if (!turns.some((t) => t > maxTurnDeg)) return null;

	// How many pieces each existing interval should become: driven by the sharper of the two corners
	// it touches, since a kink is shared between the intervals either side of it.
	const splits: number[] = [];
	for (let i = 0; i < times.length - 1; i++) {
		const worst = Math.max(turns[i] ?? 0, turns[i + 1] ?? 0);
		splits.push(Math.max(1, Math.min(8, Math.ceil(worst / maxTurnDeg))));
	}

	// Respect the budget: scale the extra points back rather than blowing past the cap.
	let projected = 1 + splits.reduce((a, b) => a + b, 0);
	if (projected > budget) {
		const extra = projected - times.length;
		const allowed = Math.max(0, budget - times.length);
		const scale = extra > 0 ? allowed / extra : 0;
		for (let i = 0; i < splits.length; i++) {
			splits[i] = Math.max(1, 1 + Math.floor((splits[i] - 1) * scale));
		}
		projected = 1 + splits.reduce((a, b) => a + b, 0);
	}
	if (projected <= times.length) return null;

	const newTimes: number[] = [times[0]];
	// Old index -> new index, so the phase ranges can be carried across unchanged in meaning.
	const mapped: number[] = [0];
	for (let i = 0; i < times.length - 1; i++) {
		const t0 = times[i];
		const t1 = times[i + 1];
		const k = splits[i];
		for (let j = 1; j <= k; j++) newTimes.push(t0 + ((t1 - t0) * j) / k);
		mapped.push(newTimes.length - 1);
	}

	return {
		timesSec: newTimes,
		ranges: schedule.ranges.map((r) => ({ key: r.key, from: mapped[r.from], to: mapped[r.to] }))
	};
}
