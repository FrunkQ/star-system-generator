import type { CelestialBody, System } from '$lib/types';
import type { TransitPlan, Vector2 } from '$lib/transit/types';
import { AU_KM, G } from '$lib/constants';
import { getGlobalState } from '$lib/transit/physics';
import { parkingOrbitRadiusKm } from '$lib/physics/orbits';
import { samplePathAtTime } from '$lib/transit/pathSampling';
import { deriveCoOrbitalOrbit, LAGRANGE_POINT_IDS } from '$lib/physics/lagrange';
import type { LagrangePointId } from '$lib/types';
import { driftAt } from '$lib/physics/driftIntegrator';
import { coastConicAt } from '$lib/physics/twoBodyCoast';
import { systemGravityField, G_AU } from '$lib/physics/systemGravity';

const AU_M = AU_KM * 1000;

// Incremental coast cache: the ship's last resolved coast state, keyed by its anchor (cancel point). Lets
// us step FORWARD from the last frame's result by a tiny delta instead of re-integrating the whole span
// from the anchor every redraw (which was O(elapsed) → the orrery overload + clock-jumps). Scrubbing back
// past the cached time falls back to an exact recompute from the anchor.
type CoastState = { tEndMs: number; x: number; y: number; z: number; vx: number; vy: number; vz: number };
const coastIncrCache = new Map<string, CoastState>();

// Coast a cut-loose ship under the system's REAL gravity — full N-body: every massive body pulls (the
// same perturber set the transit integrator uses, calculator.ts), so the ship can be slung past a planet,
// not only fall round the sun. A residual velocity traces a real trajectory (bound ellipse, hyperbola
// above escape, bent by close encounters) instead of the old straight line. Belts/rings are distributed
// debris-density, not point masses — excluded (mirrors transits); barycenters are abstract points whose
// mass already lives on their child bodies — excluded to avoid double-counting. Falls back to a straight
// line if there's nothing massive. AU + sec, matching the orrery + G_AU; attractors move (orbiting
// planets, binary stars) via getGlobalState.
export function coastUnderGravity(
  system: System,
  startPos_au: Vector2,
  startVel_ms: { x: number; y: number; z?: number },
  t0Ms: number,
  tMs: number
): { position_au: Vector2; velocity_ms: { x: number; y: number; z?: number } } {
  const dtSecRaw = (tMs - t0Ms) / 1000;
  // Guard pathological gaps: a non-finite span, or a journey/abort timestamped in a different epoch than
  // the clock (e.g. flights at 2300 vs a 2323 calendar) yields an enormous dt. Integrating that EVERY frame
  // is the freeze; the runaway integral is the "teleport". Hold at the anchor for garbage, and CAP the span
  // so an old-but-valid adrift ship still resolves cheaply (~bounded step count) instead of grinding.
  if (!(dtSecRaw > 0) || !Number.isFinite(dtSecRaw)) {
    return { position_au: { ...startPos_au }, velocity_ms: { ...startVel_ms } };
  }
  const MAX_COAST_SEC = 3.15e10; // ~1000 years — beyond this we just hold the last coasted state
  const tEndMs = Math.min(tMs, t0Ms + MAX_COAST_SEC * 1000);
  const tEndSec = tEndMs / 1000;
  const t0Sec = t0Ms / 1000;
  const bodies = system.nodes
    .filter((n) => n.kind === 'body' && ((n as any).massKg || 0) > 0 && (n as any).roleHint !== 'belt' && (n as any).roleHint !== 'ring' && (n as any).roleHint !== 'moon')
    .map((n) => ({ id: n.id, massKg: (n as any).massKg as number }));
  if (!bodies.length) {
    const dt = (tEndMs - t0Ms) / 1000;
    return {
      position_au: {
        x: startPos_au.x + (startVel_ms.x / AU_M) * dt,
        y: startPos_au.y + (startVel_ms.y / AU_M) * dt,
        z: (startPos_au.z ?? 0) + ((startVel_ms.z ?? 0) / AU_M) * dt
      },
      velocity_ms: { ...startVel_ms }
    };
  }
  const field = systemGravityField(bodies, (id, t) => {
    const node = system.nodes.find((n) => n.id === id);
    if (!node) return [0, 0, 0];
    const s = getGlobalState(system, node as any, t * 1000); // field time is seconds; getGlobalState wants ms
    return [s.r.x, s.r.y, s.r.z ?? 0];
  });

  // Incremental: continue from the last cached state when stepping FORWARD (cheap delta); recompute from the
  // anchor only on a cache miss or a backward scrub. This is the perf fix — no more O(elapsed) per frame.
  const key = `${t0Ms}|${startPos_au.x},${startPos_au.y},${startPos_au.z ?? 0}|${startVel_ms.x},${startVel_ms.y},${startVel_ms.z ?? 0}`;
  const prev = coastIncrCache.get(key);
  const from = (prev && prev.tEndMs <= tEndMs && prev.tEndMs >= t0Ms)
    ? { t0: prev.tEndMs / 1000, x: prev.x, y: prev.y, z: prev.z, vx: prev.vx, vy: prev.vy, vz: prev.vz }
    : { t0: t0Sec, x: startPos_au.x, y: startPos_au.y, z: startPos_au.z ?? 0,
        vx: startVel_ms.x / AU_M, vy: startVel_ms.y / AU_M, vz: (startVel_ms.z ?? 0) / AU_M };
  const spanSec = tEndSec - from.t0;
  const r = spanSec <= 0
    ? { x: from.x, y: from.y, z: from.z, vx: from.vx, vy: from.vy, vz: from.vz }
    : driftAt(from, field, tEndSec, Math.max(600, spanSec / 2000)); // ≤~2000 steps for the (now small) span

  if (Number.isFinite(r.x) && Number.isFinite(r.y)) {
    if (coastIncrCache.size > 256) coastIncrCache.clear(); // cheap bound; entries are tiny
    coastIncrCache.set(key, { tEndMs, x: r.x, y: r.y, z: r.z, vx: r.vx, vy: r.vy, vz: r.vz });
  }
  const safe = (v: number, fb: number) => (Number.isFinite(v) ? v : fb);
  return {
    position_au: { x: safe(r.x, startPos_au.x), y: safe(r.y, startPos_au.y), z: safe(r.z, startPos_au.z ?? 0) },
    velocity_ms: {
      x: safe(r.vx * AU_M, startVel_ms.x),
      y: safe(r.vy * AU_M, startVel_ms.y),
      z: safe(r.vz * AU_M, startVel_ms.z ?? 0)
    }
  };
}

// Predict a coasting ship's FUTURE path — a polyline of `steps` points so the orrery can draw the trajectory
// it's about to follow (a slow fall to the star, an ellipse, a hyperbola escaping, or a bend at a planet).
// The forecast just SAMPLES the same deterministic coastConicAt the adrift ship actually follows — one model
// for the line AND the ship, so they can never disagree. Auto-sizes the horizon to ~a quarter orbital period
// at the ship's distance so the arc is visibly curved at any scale. Returns AU positions (oldest→newest),
// empty if there's no star to fall to.
export function coastPathUnderGravity(
  system: System,
  startPos_au: Vector2,
  startVel_ms: { x: number; y: number; z?: number },
  t0Ms: number,
  steps = 40
): Vector2[] {
  if (!Number.isFinite(startPos_au?.x) || !Number.isFinite(startPos_au?.y)) return [];
  if (!coastConicAt(system, startPos_au, startVel_ms, t0Ms, t0Ms)) return []; // no star — nothing to pull on
  // Horizon ≈ a couple of characteristic times at the ship's distance from the root mass — a good arc
  // ahead, short enough that a near-radial plunge doesn't whip clear through the star.
  const root: any = system.nodes.find((n: any) => n.parentId == null);
  const rootMass = root?.massKg ?? root?.effectiveMassKg ?? 0;
  const r = Math.max(1e-6, Math.hypot(startPos_au.x, startPos_au.y, startPos_au.z ?? 0));
  const mu = G_AU * rootMass;
  const charSec = mu > 0 ? Math.sqrt((r * r * r) / mu) : 3.15e7; // √(r³/μ) = T/2π (≈1 rad of arc)
  const horizonSec = Math.max(86400, charSec * 2);
  const stepSec = horizonSec / steps;
  const pts: Vector2[] = [];
  for (let k = 0; k <= steps; k++) {
    const c = coastConicAt(system, startPos_au, startVel_ms, t0Ms, t0Ms + k * stepSec * 1000);
    pts.push(c ? c.position_au : { x: startPos_au.x, y: startPos_au.y, z: startPos_au.z ?? 0 });
  }
  return pts;
}

// arrivalPlacement code -> human label and parking-altitude factor (radii above surface),
// matching samplePostJourneyState's visual parking orbit.
const PLACEMENT_LABELS: Record<string, string> = {
  lo: 'Low Orbit',
  mo: 'Medium Orbit',
  ho: 'High Orbit',
  geo: 'Geostationary Orbit',
  surface: 'Surface',
  l4: 'L4',
  l5: 'L5'
};
// THE PARKING RADIUS IS DERIVED, AND `physics/orbits.ts` DERIVES IT. What used to be here was a table
// of radius multipliers - and the same four numbers again as a ternary chain beside the sampler that
// wanted them - while the planner panel offered the DERIVED figures. Two answers to 'how high is a
// high orbit', and they disagreed by up to a factor of ninety-five (see `parkingOrbitRadiusKm`). That
// disagreement is what [[B92]] measured as an arrival snap: the solver aimed at one orbit, the sampler
// parked the ship in another, and the ship stepped between them at the completion instant.

export interface JourneyBounds {
  startMs: number;
  endMs: number;
}

export interface JourneyKinematics {
  journeyId: string;
  position_au: Vector2;
  velocity_ms: { x: number; y: number; z?: number };
  state: 'Transit' | 'Deep Space' | 'Orbiting' | 'Docked' | 'Landed';
}

export function getJourneyBounds(plans: TransitPlan[]): JourneyBounds | null {
  if (!plans || plans.length === 0) return null;
  const ordered = [...plans].sort((a, b) => a.startTime - b.startTime);
  const startMs = ordered[0].startTime;
  const last = ordered[ordered.length - 1];
  const endMs = last.startTime + (last.totalTime_days * 86400 * 1000);
  return { startMs, endMs };
}

/**
 * The host a construct is *currently* at, derived from its scheduled journeys at a
 * given display time - NOT its authored `parentId`. After a construct transits to and
 * is captured by a target body, its persistent parentId/orbit still describe its
 * authored placement (e.g. a heliocentric orbit around the star); the live location is
 * derived from the journey. Returns the id of the body it should be treated as
 * orbiting/landed at:
 *   - mid-journey (in transit): null (not captured by any host)
 *   - after a captured (non-flyby) arrival: that journey's target
 *   - before any journey, or only flyby arrivals: the authored parentId
 */
export function resolveConstructCurrentHostId(
  construct: CelestialBody,
  displayTimeMs: number
): string | null {
  const logs = Array.isArray(construct.scheduled_journeys) ? construct.scheduled_journeys : [];
  let captured: { endMs: number; targetId: string } | null = null;
  for (const log of logs) {
    if (log.status === 'cancelled') continue;
    const bounds = getJourneyBounds(log.plans);
    if (!bounds) continue;
    // Currently flying this journey -> in transit, not captured by any host.
    if (displayTimeMs >= bounds.startMs && displayTimeMs < bounds.endMs) return null;
    if (displayTimeMs >= bounds.endMs) {
      const lastPlan = log.plans[log.plans.length - 1];
      if (!lastPlan) continue;
      const isFlyby =
        (lastPlan.interceptSpeed_ms || 0) > 0 ||
        (lastPlan.segments || []).some((s) => (s.warnings || []).includes('Flyby'));
      // Keep the latest captured arrival (chained journeys end at the final target).
      if (!isFlyby && lastPlan.targetId && (!captured || bounds.endMs > captured.endMs)) {
        captured = { endMs: bounds.endMs, targetId: lastPlan.targetId };
      }
    }
  }
  if (captured) return captured.targetId;
  return construct.parentId ?? null;
}

/**
 * Self-heal a construct's stale persistent placement. After a ship transits to a body,
 * its parentId/orbit/placement can still describe its *authored* home (e.g. a heliocentric
 * orbit around the star) - which then blocks landing and corrupts future-transit origins.
 * Once the AUTHORITATIVE (master/actual) clock has passed a captured (non-flyby) arrival,
 * rewrite parentId + orbit (a circular parking orbit around the real host) + placement to
 * match. Keyed to actual time (NOT display time) so previewing/scrubbing never mutates
 * saved state, and idempotent so it's a no-op once healed. The journey log is left intact.
 *
 * Returns the same reference when there's nothing to heal (no captured arrival yet, or
 * already reconciled) so callers can cheaply detect a change.
 */
export function reconcileConstructArrival(
  system: System,
  construct: CelestialBody,
  actualTimeMs: number
): CelestialBody {
  if (construct.kind !== 'construct') return construct;
  const logs = Array.isArray(construct.scheduled_journeys) ? construct.scheduled_journeys : [];

  // Latest captured (non-flyby) arrival whose end has passed in actual time.
  let best: { endMs: number; plan: TransitPlan } | null = null;
  for (const log of logs) {
    if (log.status === 'cancelled') continue;
    const bounds = getJourneyBounds(log.plans);
    if (!bounds || actualTimeMs < bounds.endMs) continue;
    const lastPlan = log.plans[log.plans.length - 1];
    if (!lastPlan) continue;
    const isFlyby =
      (lastPlan.interceptSpeed_ms || 0) > 0 ||
      (lastPlan.segments || []).some((s) => (s.warnings || []).includes('Flyby'));
    if (isFlyby) continue;
    if (!best || bounds.endMs > best.endMs) best = { endMs: bounds.endMs, plan: lastPlan };
  }
  if (!best) return construct;

  const hostId = best.plan.targetId;
  const target = system.nodes.find((n) => n.id === hostId) as any;
  if (!target) return construct;

  // Already pointing at the right host -> nothing to do (idempotent).
  if (construct.parentId === hostId && construct.orbit?.hostId === hostId) return construct;

  const placementKey = best.plan.arrivalPlacement || 'lo';
  const label = PLACEMENT_LABELS[placementKey] || construct.placement || 'Orbit';
  const targetRadiusKm = target.radiusKm || 1000;
  const targetMassKg = target.massKg || target.effectiveMassKg || 0;
  const hostMu = G * targetMassKg;
  const a_AU =
    placementKey === 'surface'
      ? targetRadiusKm / AU_KM
      : (parkingOrbitRadiusKm(target as any, placementKey) ?? targetRadiusKm * 1.3) / AU_KM;
  const aM = a_AU * AU_M;
  const n_rad_per_s = hostMu > 0 && aM > 0 ? Math.sqrt(hostMu / (aM * aM * aM)) : undefined;

  return {
    ...construct,
    parentId: hostId,
    placement: label,
    orbit: {
      ...(construct.orbit || {}),
      hostId,
      hostMu: hostMu || construct.orbit?.hostMu,
      n_rad_per_s,
      t0: best.endMs,
      elements: { ...(construct.orbit?.elements || {}), a_AU, e: 0 }
    }
  } as CelestialBody;
}

export function countFutureJourneys(construct: CelestialBody, timeMs: number): number {
  const logs = construct.scheduled_journeys || [];
  let count = 0;
  for (const log of logs) {
    if (log.status === 'cancelled') continue;
    const bounds = getJourneyBounds(log.plans);
    if (!bounds) continue;
    if (bounds.startMs > timeMs) count += 1;
  }
  return count;
}

export function sampleJourneyKinematicsAtTime(
  system: System,
  construct: CelestialBody,
  timeMs: number
): JourneyKinematics | null {
  const logs = [...(construct.scheduled_journeys || [])].sort((a, b) => {
    const ab = getJourneyBounds(a.plans);
    const bb = getJourneyBounds(b.plans);
    return (ab?.startMs || 0) - (bb?.startMs || 0);
  });
  let candidateAfterCompletion: JourneyKinematics | null = null;

  for (const log of logs) {
    const bounds = getJourneyBounds(log.plans);
    if (!bounds) continue;

    const cancelledAtMs = log.cancelledAtSec ? Number(BigInt(log.cancelledAtSec) * 1000n) : null;
    const effectiveEndMs = cancelledAtMs === null ? bounds.endMs : Math.min(bounds.endMs, cancelledAtMs);

    if (timeMs < bounds.startMs) break;

    if (cancelledAtMs !== null && log.cancelState && timeMs >= cancelledAtMs) {
      // Adrift: coast under the star(s)' real gravity — a slow conic round the sun, not a straight line.
      // This drift only governs UNTIL a later journey begins. A ship that was stranded and then given a
      // NEW journey (logs are sorted by start, so the new one is processed later) must not stay pinned to
      // the old drift — otherwise the ship's log reads right but the orrery still shows "Adrift · coasting".
      // Stash the coast as the running candidate (like a completed journey) and keep scanning: a subsequent
      // journey that has already started overwrites it; if none has, this is what we return.
      // Deterministic conic (exact through perihelion, no step-integration drift); the old integrator is only a
      // fallback for a system with no star to fall toward.
      const coasted = coastConicAt(system, log.cancelState.position_au, log.cancelState.velocity_ms, cancelledAtMs, timeMs)
        ?? coastUnderGravity(system, log.cancelState.position_au, log.cancelState.velocity_ms, cancelledAtMs, timeMs);
      candidateAfterCompletion = {
        journeyId: log.id,
        state: 'Deep Space',
        position_au: coasted.position_au,
        velocity_ms: coasted.velocity_ms
      };
      continue;
    }

    if (timeMs > effectiveEndMs) {
      const post = samplePostJourneyState(system, log, timeMs, effectiveEndMs);
      if (post) candidateAfterCompletion = post;
      continue;
    }

    const sampled = samplePlanPathAtTime(log.plans, timeMs);
    if (sampled) {
      return {
        journeyId: log.id,
        state: 'Transit',
        position_au: sampled.position_au,
        velocity_ms: sampled.velocity_ms
      };
    }

    // Waiting between legs: hold at the origin host position.
    const firstPlan = log.plans[0];
    const originNode = system.nodes.find((n) => n.id === firstPlan.originId);
    if (originNode) {
      const s = getGlobalState(system, originNode as any, timeMs);
      return {
        journeyId: log.id,
        state: 'Transit',
        position_au: s.r,
        velocity_ms: { x: s.v.x * AU_M, y: s.v.y * AU_M, z: (s.v.z ?? 0) * AU_M }
      };
    }
  }
  return candidateAfterCompletion;
}

export function clearFutureJourneys(construct: CelestialBody, timeMs: number): CelestialBody {
  const logs = construct.scheduled_journeys || [];
  const filtered = logs.filter((log) => {
    const bounds = getJourneyBounds(log.plans);
    if (!bounds) return false;
    return bounds.startMs <= timeMs;
  });
  return { ...construct, scheduled_journeys: filtered };
}

// Trim the heavy FLOWN-past JOURNEY data of a repeat autopilot route so the committed chain (and the orrery
// it draws) stays bounded over a long run — a repeat ship tops up forever, so otherwise the past grows without
// bound (a huge journey list + a spider-web of stale paths). Keeps the last `keepFlown` autopilot legs that
// finished before ACTUAL time, plus all manual journeys, anything cancelled/adrift, and the active + future
// legs. The lightweight FLIGHT LOG is deliberately NOT trimmed — it's the permanent history (kept forever);
// only the regenerable path/journey data is dropped, and the forward advance-planning is never touched.
// Keyed off ACTUAL time so scrubbing the display never deletes. Returns the same object when nothing changed.
export function trimFlownAutopilotPast(construct: CelestialBody, actualMs: number, keepFlown = 2): CelestialBody {
  const logs = construct.scheduled_journeys || [];
  if (!logs.length) return construct;
  // Autopilot legs that have finished (relative to actual time), oldest → newest.
  const flown = logs
    .map((log) => ({ log, end: getJourneyBounds(log.plans)?.endMs ?? Infinity }))
    .filter((x) => (x.log as any).autopilot && x.log.status !== 'cancelled' && x.end < actualMs)
    .sort((a, b) => a.end - b.end);
  if (flown.length <= keepFlown) return construct;
  const drop = new Set(flown.slice(0, flown.length - keepFlown).map((x) => x.log.id));
  const kept = logs.filter((log) => !drop.has(log.id));
  if (kept.length === logs.length) return construct;
  return { ...construct, scheduled_journeys: kept }; // flight_log kept forever
}

export function cancelActiveJourney(
  system: System,
  construct: CelestialBody,
  timeMs: number,
  coast = true   // true = keep current velocity (drift on under gravity); false = stop dead (then falls)
): CelestialBody {
  const logs = construct.scheduled_journeys || [];
  let changed = false;
  const updated = logs.map((log) => {
    if (log.status === 'cancelled') return log;
    const bounds = getJourneyBounds(log.plans);
    if (!bounds) return log;
    if (timeMs < bounds.startMs || timeMs > bounds.endMs) return log;

    const sampled = samplePlanPathAtTime(log.plans, timeMs);
    const cancelState = sampled
      ? {
          position_au: sampled.position_au,
          velocity_ms: sampled.velocity_ms
        }
      : (() => {
          const first = log.plans[0];
          const originNode = system.nodes.find((n) => n.id === first.originId);
          if (!originNode) return undefined;
          const s = getGlobalState(system, originNode as any, timeMs);
          return {
            position_au: s.r,
            velocity_ms: { x: s.v.x * AU_M, y: s.v.y * AU_M, z: (s.v.z ?? 0) * AU_M }
          };
        })();

    changed = true;
    // "Stop dead" zeroes the velocity at the cut point; the gravity coast then takes over from rest
    // (it falls toward the star). "Drift" keeps the current velocity (coasts on along its arc).
    const finalCancelState = cancelState && !coast
      ? { ...cancelState, velocity_ms: { x: 0, y: 0 } }
      : cancelState;
    return {
      ...log,
      status: 'cancelled',
      cancelledAtSec: BigInt(Math.floor(timeMs / 1000)).toString(),
      cancelState: finalCancelState
    };
  });

  if (!changed) return construct;
  return { ...construct, scheduled_journeys: updated };
}

function samplePlanPathAtTime(
  plans: TransitPlan[],
  timeMs: number
): { position_au: Vector2; velocity_ms: { x: number; y: number } } | null {
  for (const plan of plans) {
    const planEndMs = plan.startTime + (plan.totalTime_days * 86400 * 1000);
    if (timeMs < plan.startTime || timeMs > planEndMs) continue;
    for (const segment of plan.segments) {
      if (timeMs < segment.startTime || timeMs > segment.endTime) continue;
      // ONE reader for 'where is the ship at t' (transit/pathSampling.ts). It brackets the query by
      // the samples' OWN times rather than assuming they are evenly spaced — the assumption that put
      // the ship at the wrong moment for the whole of a burn, and that three other call sites were
      // independently making with their own arithmetic.
      const hit = samplePathAtTime(segment, timeMs);
      if (!hit) continue;
      return hit;
    }
  }
  return null;
}

// First moment at/after `fromMs` at which `construct` is under thrust exceeding `accelCap_ms2`, scanning its
// committed journey segments (Accel/Brake Δv ÷ duration). Null if it never out-pulls the cap. Pure function
// of the journey data, so the formation-break moment is deterministic and scrub-safe.
function firstThrustAboveMs(construct: any, fromMs: number, accelCap_ms2: number): number | null {
  let earliest: number | null = null;
  for (const log of (construct?.scheduled_journeys ?? []) as any[]) {
    if (log.status === 'cancelled') continue;
    for (const plan of log.plans ?? []) {
      for (const seg of plan.segments ?? []) {
        if (seg.type !== 'Accel' && seg.type !== 'Brake') continue;
        if (!(seg.endTime > fromMs)) continue;
        const durSec = (seg.endTime - seg.startTime) / 1000;
        if (!(durSec > 0)) continue;
        const dvx = ((seg.endState?.v?.x ?? 0) - (seg.startState?.v?.x ?? 0)) * AU_M;
        const dvy = ((seg.endState?.v?.y ?? 0) - (seg.startState?.v?.y ?? 0)) * AU_M;
        const accel = Math.hypot(dvx, dvy) / durSec;
        if (accel > accelCap_ms2) {
          const at = Math.max(seg.startTime, fromMs);
          if (earliest === null || at < earliest) earliest = at;
        }
      }
    }
  }
  return earliest;
}

/** IS THIS PLAN A PASS-THROUGH RATHER THAN AN ARRIVAL? Exported because the MAP has to ask the same
 *  question the flight does: the sampler uses it to decide whether the ship coasts on past its
 *  destination or parks there, and `drawTransitPlan` uses it to decide whether the path ends in a
 *  stop marker or carries on past the target. Two answers to that would be a picture that lies about
 *  what the ship is going to do. A flyby still BRAKES — it sheds speed to reach its intercept
 *  velocity — so the brake segment is not the tell; the intercept speed is. */
export function isFlybyPlan(plan: { interceptSpeed_ms?: number; segments?: Array<{ warnings?: string[] }> }): boolean {
  return (plan.interceptSpeed_ms || 0) > 0 ||
    (plan.segments ?? []).some((s) => (s.warnings || []).includes('Flyby'));
}

function samplePostJourneyState(
  system: System,
  log: { id: string; plans: TransitPlan[] },
  timeMs: number,
  completedAtMs: number
): JourneyKinematics | null {
  if (!log.plans || log.plans.length === 0) return null;
  const lastPlan = log.plans[log.plans.length - 1];
  const lastSeg = lastPlan.segments[lastPlan.segments.length - 1];
  const lastPts = lastSeg?.pathPoints || [];
  const finalPos = lastPts.length > 0 ? lastPts[lastPts.length - 1] : null;
  const isExplicitDockToConstruct = !!(lastPlan.arrivalPlacement && lastPlan.arrivalPlacement === lastPlan.targetId);
  const isFlybyIntent = isFlybyPlan(lastPlan);

  // If arrival is a flyby/deep-space pass, continue inertial drift from final path tangent.
  if (isFlybyIntent && finalPos) {
    let velMs = { x: 0, y: 0, z: 0 };
    if (lastPts.length >= 2) {
      const p0 = lastPts[lastPts.length - 2];
      const p1 = lastPts[lastPts.length - 1];
      const segDurationSec = Math.max(1e-6, (lastSeg.endTime - lastSeg.startTime) / 1000);
      const sampleDt = segDurationSec / Math.max(1, lastPts.length - 1);
      velMs = {
        x: ((p1.x - p0.x) * AU_M) / sampleDt,
        y: ((p1.y - p0.y) * AU_M) / sampleDt,
        z: (((p1.z ?? 0) - (p0.z ?? 0)) * AU_M) / sampleDt
      };
    }
    const dtSec = Math.max(0, (timeMs - completedAtMs) / 1000);
    return {
      journeyId: log.id,
      state: 'Deep Space',
      position_au: {
        x: finalPos.x + ((velMs.x / AU_M) * dtSec),
        y: finalPos.y + ((velMs.y / AU_M) * dtSec),
        z: (finalPos.z ?? 0) + ((velMs.z / AU_M) * dtSec)
      },
      velocity_ms: velMs
    };
  }

  // Captured arrivals: follow the destination body/construct global motion.
  const targetNode = system.nodes.find((n) => n.id === lastPlan.targetId);
  if (targetNode) {
    if (targetNode.kind === 'construct' && !isExplicitDockToConstruct && finalPos) {
      // It's a Rendezvous/Brake Burn with a Construct, but not a hard Dock: formation flying — the escort
      // mirrors its charge, trailing along the velocity vector by the km standoff (0 = wingtip formation).
      // CAPABILITY CHECK: formation only holds while the charge doesn't out-accelerate the escort. The plan
      // carries the escort's own thrust ceiling (escortMaxAccel_ms2, +5% grace so identical ships never
      // flap); the first committed charge burn above it BREAKS formation at that moment — the escort keeps
      // the matched state it had right then and coasts (deterministic patched conic), visibly left behind,
      // until the autopilot top-up commits a fresh chase.
      const formationStandoff = (s: { r: Vector2; v: Vector2 }) => {
        let px = s.r.x, py = s.r.y, pz = s.r.z ?? 0;
        const standKm = (lastPlan as any).escortStandoffKm || 0;
        const vmag = Math.hypot(s.v.x, s.v.y, s.v.z ?? 0);
        if (standKm > 0 && vmag > 1e-18) {
          const offAu = standKm / AU_KM;
          px -= (s.v.x / vmag) * offAu;
          py -= (s.v.y / vmag) * offAu;
          pz -= ((s.v.z ?? 0) / vmag) * offAu;
        }
        return { x: px, y: py, z: pz };
      };
      const cap = (lastPlan as any).escortMaxAccel_ms2;
      const breakMs = cap && cap > 0 ? firstThrustAboveMs(targetNode, completedAtMs, cap) : null;
      if (breakMs !== null && timeMs >= breakMs) {
        // LEFT BEHIND — freeze the formation state at the break moment and coast from there.
        const sB = getGlobalState(system, targetNode as any, breakMs);
        const posB = formationStandoff(sB);
        const velB = { x: sB.v.x * AU_M, y: sB.v.y * AU_M, z: (sB.v.z ?? 0) * AU_M };
        const coasted = coastConicAt(system, posB, velB, breakMs, timeMs)
          ?? coastUnderGravity(system, posB, velB, breakMs, timeMs);
        return { journeyId: log.id, state: 'Deep Space', position_au: coasted.position_au, velocity_ms: coasted.velocity_ms };
      }
      const s = getGlobalState(system, targetNode as any, timeMs);
      return {
        journeyId: log.id,
        state: 'Deep Space', // Matches Construct Rendezvous behavior
        position_au: formationStandoff(s),
        velocity_ms: { x: s.v.x * AU_M, y: s.v.y * AU_M, z: (s.v.z ?? 0) * AU_M }
      };
    }

    if (lastPlan.arrivalPlacement) {
      const isLagrange = LAGRANGE_POINT_IDS.includes(lastPlan.arrivalPlacement as LagrangePointId);
      if (isLagrange && (targetNode as any).orbit && targetNode.parentId) {
        // G43 P4: the point the ship is parked at is the SAME point the solver flew to — both come
        // from deriveCoOrbitalOrbit. Before this, the sampler rotated the target's ellipse rigidly
        // while the solver shifted its mean anomaly, so an eccentric arrival jumped up to ~0.5 AU
        // (and gained a several-km/s velocity step) at the instant the journey completed.
        const lagrangeHost = system.nodes.find((n) => n.id === targetNode.parentId);
        const lagrangeHostMassKg = lagrangeHost
          ? (((lagrangeHost as any).kind === 'barycenter'
              ? (lagrangeHost as any).effectiveMassKg
              : (lagrangeHost as any).massKg) || 0)
          : 0;
        const pointOrbit = deriveCoOrbitalOrbit(
          targetNode as any,
          lagrangeHostMassKg,
          lastPlan.arrivalPlacement as LagrangePointId
        );
        if (pointOrbit) {
          const synthNode = {
            id: 'synth-lpoint',
            kind: 'body',
            parentId: targetNode.parentId,
            orbit: pointOrbit
          };
          const lPointGlobal = getGlobalState(system, synthNode as any, timeMs);
          return {
            journeyId: log.id,
            state: 'Orbiting',
            position_au: lPointGlobal.r,
            velocity_ms: { x: lPointGlobal.v.x * AU_M, y: lPointGlobal.v.y * AU_M, z: (lPointGlobal.v.z ?? 0) * AU_M }
          };
        }
      }
    }

    // Captured arrival. Surface/Dock snap to the target centre. For an orbital
    // arrival, give the ship a real circular PARKING ORBIT that actually revolves
    // over time (this sampler is re-evaluated every tick, so the ship goes round
    // the planet and future-transit origins read its true orbiting state) rather
    // than locking it to the planet's centre.
    const s = getGlobalState(system, targetNode as any, timeMs);
    const placement = lastPlan.arrivalPlacement;
    const t: any = targetNode;
    const state = placement === 'surface' ? 'Landed' : (targetNode.kind === 'construct' ? 'Docked' : 'Orbiting');

    if (state === 'Orbiting') {
      const targetRadiusKm = t.radiusKm || 1000;
      const targetMassKg = t.massKg || t.effectiveMassKg || 0;
      // Parking-orbit radius: the derived one, the same figure the planner offered and the solver
      // aimed at. The fallback is only for a placement this body cannot actually support.
      const parkingRadiusKm = parkingOrbitRadiusKm(t, placement, undefined, system) ?? targetRadiusKm * 1.3;
      const aAU = parkingRadiusKm / AU_KM;
      const aM = parkingRadiusKm * 1000;
      const G_CONST = 6.6743e-11;
      const mu = G_CONST * targetMassKg;
      const n = mu > 0 && aM > 0 ? Math.sqrt(mu / (aM * aM * aM)) : 0; // mean motion, rad/s
      // THE PARKING ORBIT STARTS WHERE THE FLIGHT ENDED, IN THE PLANE THE SHIP ARRIVED ON.
      //
      // It used to be a circle in the reference plane, phased by a HASH OF THE JOURNEY'S ID —
      // deterministic, so re-sampling never jumped the ship, but unrelated to where the ship actually
      // got to. The flight therefore ended at the approach bearing and the parking began at an
      // arbitrary one, and the ship stepped across the orbit at the completion instant: measured at
      // 90,884 km on a Jupiter low orbit ([[B92]]).
      //
      // The circle is now built on two axes taken from the arrival itself — `u` toward the point the
      // flight ended at, `w` along the velocity it ended with — so at theta = 0 the ship is exactly
      // where its path left it, moving exactly as its last burn left it moving. Both position and
      // velocity close, and by construction: `resolveDesiredArrivalRelative` aims the arrival burn at
      // the circular velocity PERPENDICULAR to the radius, which is this orbit's velocity at this
      // bearing. That is the same device G43 P4 used on the Lagrange arrivals — one convention read
      // from both sides — rather than two derivations that have to be kept in step by hand.
      //
      // It also means a ship that came in from out of the plane STAYS out of it, instead of being
      // flattened onto the reference plane the moment it arrived.
      const hostAtArrival = getGlobalState(system, targetNode as any, completedAtMs);
      const norm = (v: { x: number; y: number; z: number }) => {
        const m = Math.hypot(v.x, v.y, v.z);
        return m > 1e-18 ? { x: v.x / m, y: v.y / m, z: v.z / m } : null;
      };
      let u = finalPos
        ? norm({ x: finalPos.x - hostAtArrival.r.x, y: finalPos.y - hostAtArrival.r.y, z: (finalPos.z ?? 0) - (hostAtArrival.r.z ?? 0) })
        : null;
      if (!u) {
        // No path to read: fall back to the reference plane, which is what this always did.
        let h = 0;
        for (let i = 0; i < log.id.length; i++) h = (h + log.id.charCodeAt(i) * 0.137) % (2 * Math.PI);
        u = { x: Math.cos(h), y: Math.sin(h), z: 0 };
      }
      // `w` completes the plane: the arrival velocity with its radial part removed. A purely radial
      // arrival leaves nothing to follow, so take the in-plane perpendicular instead.
      const arrV = lastSeg?.endState?.v;
      let w: { x: number; y: number; z: number } | null = null;
      if (arrV) {
        const rel = {
          x: arrV.x - hostAtArrival.v.x,
          y: arrV.y - hostAtArrival.v.y,
          z: (arrV.z ?? 0) - (hostAtArrival.v.z ?? 0)
        };
        const radial = rel.x * u.x + rel.y * u.y + rel.z * u.z;
        w = norm({ x: rel.x - u.x * radial, y: rel.y - u.y * radial, z: rel.z - u.z * radial });
      }
      if (!w) w = norm({ x: -u.y, y: u.x, z: 0 }) ?? { x: 0, y: 0, z: 1 };
      const theta = n * ((timeMs - completedAtMs) / 1000);
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const vTanAuSec = n * aAU; // tangential orbital speed, AU/s
      return {
        journeyId: log.id,
        state: 'Orbiting',
        position_au: {
          x: s.r.x + aAU * (u.x * cos + w.x * sin),
          y: s.r.y + aAU * (u.y * cos + w.y * sin),
          z: (s.r.z ?? 0) + aAU * (u.z * cos + w.z * sin)
        },
        velocity_ms: {
          x: (s.v.x + vTanAuSec * (-u.x * sin + w.x * cos)) * AU_M,
          y: (s.v.y + vTanAuSec * (-u.y * sin + w.y * cos)) * AU_M,
          z: ((s.v.z ?? 0) + vTanAuSec * (-u.z * sin + w.z * cos)) * AU_M
        }
      };
    }

    // Landed / Docked: snap to the target centre.
    return {
      journeyId: log.id,
      state,
      position_au: s.r,
      velocity_ms: { x: s.v.x * AU_M, y: s.v.y * AU_M, z: (s.v.z ?? 0) * AU_M }
    };
  }

  if (!finalPos) return null;
  return {
    journeyId: log.id,
    state: 'Orbiting',
    position_au: finalPos,
    velocity_ms: { x: 0, y: 0, z: 0 }
  };
}
