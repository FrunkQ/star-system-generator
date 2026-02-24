import type { CelestialBody, System } from '$lib/types';
import type { TransitPlan, Vector2 } from '$lib/transit/types';
import { AU_KM } from '$lib/constants';
import { getGlobalState } from '$lib/transit/physics';

const AU_M = AU_KM * 1000;

export interface JourneyBounds {
  startMs: number;
  endMs: number;
}

export interface JourneyKinematics {
  journeyId: string;
  position_au: Vector2;
  velocity_ms: { x: number; y: number };
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
      const dtSec = (timeMs - cancelledAtMs) / 1000;
      const vxAuSec = log.cancelState.velocity_ms.x / AU_M;
      const vyAuSec = log.cancelState.velocity_ms.y / AU_M;
      return {
        journeyId: log.id,
        state: 'Deep Space',
        position_au: {
          x: log.cancelState.position_au.x + vxAuSec * dtSec,
          y: log.cancelState.position_au.y + vyAuSec * dtSec
        },
        velocity_ms: { ...log.cancelState.velocity_ms }
      };
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
        velocity_ms: { x: s.v.x * AU_M, y: s.v.y * AU_M }
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

export function cancelActiveJourney(
  system: System,
  construct: CelestialBody,
  timeMs: number
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
            velocity_ms: { x: s.v.x * AU_M, y: s.v.y * AU_M }
          };
        })();

    changed = true;
    return {
      ...log,
      status: 'cancelled',
      cancelledAtSec: BigInt(Math.floor(timeMs / 1000)).toString(),
      cancelState
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
      const durationMs = Math.max(1, segment.endTime - segment.startTime);
      const t = (timeMs - segment.startTime) / durationMs;
      const points = segment.pathPoints || [];
      if (points.length === 0) continue;
      if (points.length === 1) {
        return { position_au: points[0], velocity_ms: { x: 0, y: 0 } };
      }
      const exact = t * (points.length - 1);
      const i0 = Math.max(0, Math.min(points.length - 2, Math.floor(exact)));
      const i1 = i0 + 1;
      const alpha = exact - i0;
      const p0 = points[i0];
      const p1 = points[i1];
      const position_au = {
        x: p0.x + ((p1.x - p0.x) * alpha),
        y: p0.y + ((p1.y - p0.y) * alpha)
      };

      const dtSampleSec = Math.max(1e-6, durationMs / 1000 / (points.length - 1));
      const velocity_ms = {
        x: ((p1.x - p0.x) * AU_M) / dtSampleSec,
        y: ((p1.y - p0.y) * AU_M) / dtSampleSec
      };
      return { position_au, velocity_ms };
    }
  }
  return null;
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
  const isFlybyIntent =
    (lastPlan.interceptSpeed_ms || 0) > 0 ||
    lastPlan.segments.some((s) => (s.warnings || []).includes('Flyby'));

  // If arrival is a flyby/deep-space pass, continue inertial drift from final path tangent.
  if (isFlybyIntent && finalPos) {
    let velMs = { x: 0, y: 0 };
    if (lastPts.length >= 2) {
      const p0 = lastPts[lastPts.length - 2];
      const p1 = lastPts[lastPts.length - 1];
      const segDurationSec = Math.max(1e-6, (lastSeg.endTime - lastSeg.startTime) / 1000);
      const sampleDt = segDurationSec / Math.max(1, lastPts.length - 1);
      velMs = {
        x: ((p1.x - p0.x) * AU_M) / sampleDt,
        y: ((p1.y - p0.y) * AU_M) / sampleDt
      };
    }
    const dtSec = Math.max(0, (timeMs - completedAtMs) / 1000);
    return {
      journeyId: log.id,
      state: 'Deep Space',
      position_au: {
        x: finalPos.x + ((velMs.x / AU_M) * dtSec),
        y: finalPos.y + ((velMs.y / AU_M) * dtSec)
      },
      velocity_ms: velMs
    };
  }

  // Captured arrivals: follow the destination body/construct global motion.
  const targetNode = system.nodes.find((n) => n.id === lastPlan.targetId);
  if (targetNode) {
    // Intercepting a construct should not implicitly "dock to its eventual destination".
    // Only explicit construct docking should bind to target frame after completion.
    if (targetNode.kind === 'construct' && !isExplicitDockToConstruct && finalPos) {
      let velMs = { x: 0, y: 0 };
      if (lastPts.length >= 2) {
        const p0 = lastPts[lastPts.length - 2];
        const p1 = lastPts[lastPts.length - 1];
        const segDurationSec = Math.max(1e-6, (lastSeg.endTime - lastSeg.startTime) / 1000);
        const sampleDt = segDurationSec / Math.max(1, lastPts.length - 1);
        velMs = {
          x: ((p1.x - p0.x) * AU_M) / sampleDt,
          y: ((p1.y - p0.y) * AU_M) / sampleDt
        };
      }
      const dtSec = Math.max(0, (timeMs - completedAtMs) / 1000);
      return {
        journeyId: log.id,
        state: 'Deep Space',
        position_au: {
          x: finalPos.x + ((velMs.x / AU_M) * dtSec),
          y: finalPos.y + ((velMs.y / AU_M) * dtSec)
        },
        velocity_ms: velMs
      };
    }

    const s = getGlobalState(system, targetNode as any, timeMs);
    const sComplete = getGlobalState(system, targetNode as any, completedAtMs);
    const relOffset = finalPos
      ? { x: finalPos.x - sComplete.r.x, y: finalPos.y - sComplete.r.y }
      : { x: 0, y: 0 };
    const state =
      lastPlan.arrivalPlacement === 'surface'
        ? 'Landed'
        : targetNode.kind === 'construct'
          ? 'Docked'
          : 'Orbiting';
    return {
      journeyId: log.id,
      state,
      position_au: { x: s.r.x + relOffset.x, y: s.r.y + relOffset.y },
      velocity_ms: { x: s.v.x * AU_M, y: s.v.y * AU_M }
    };
  }

  if (!finalPos) return null;
  return {
    journeyId: log.id,
    state: 'Orbiting',
    position_au: finalPos,
    velocity_ms: { x: 0, y: 0 }
  };
}
