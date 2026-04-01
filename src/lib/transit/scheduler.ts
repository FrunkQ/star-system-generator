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
    if (targetNode.kind === 'construct' && !isExplicitDockToConstruct && finalPos) {
      // It's a Rendezvous/Brake Burn with a Construct, but not a hard Dock.
      // We should perfectly match its state (formation flying).
      const s = getGlobalState(system, targetNode as any, timeMs);
      return {
        journeyId: log.id,
        state: 'Deep Space', // Matches Construct Rendezvous behavior
        position_au: s.r,
        velocity_ms: { x: s.v.x * AU_M, y: s.v.y * AU_M }
      };
    }

    if (lastPlan.arrivalPlacement) {
      const isLagrange = ['l1', 'l2', 'l3', 'l4', 'l5'].includes(lastPlan.arrivalPlacement);
      if (isLagrange && (targetNode as any).orbit && targetNode.parentId) {
        // Lagrange points: mathematically rotate with the host planet.
        const parentNode = system.nodes.find(n => n.id === targetNode.parentId);
        if (parentNode && (parentNode as any).orbit) {
          let rotAngleDeg = 0;
          let scale = 1;
          
          if (lastPlan.arrivalPlacement === 'l1') scale = 0.99;
          if (lastPlan.arrivalPlacement === 'l2') scale = 1.01;
          if (lastPlan.arrivalPlacement === 'l3') rotAngleDeg = 180;
          if (lastPlan.arrivalPlacement === 'l4') rotAngleDeg = 60;
          if (lastPlan.arrivalPlacement === 'l5') rotAngleDeg = -60;

          // Create a synthetic node mathematically identical to the parent planet, 
          // but rotated around the sun to preserve perfectly eccentric Keplarian motion
          const synthOrbit = JSON.parse(JSON.stringify((parentNode as any).orbit));
          synthOrbit.elements.a_AU *= scale;
          synthOrbit.elements.omega_deg = (synthOrbit.elements.omega_deg || 0) + rotAngleDeg;
          
          const synthNode = {
            id: 'synth-lpoint',
            kind: 'body',
            parentId: parentNode.parentId,
            orbit: synthOrbit
          };

          const lPointGlobal = getGlobalState(system, synthNode as any, timeMs);

          return {
            journeyId: log.id,
            state: 'Orbiting',
            position_au: lPointGlobal.r,
            velocity_ms: { x: lPointGlobal.v.x * AU_M, y: lPointGlobal.v.y * AU_M }
          };
        }
      }
    }

    // Generic Orbit (lo/mo/ho) or Surface
    // The ship should orbit the planet, not just have a static offset.
    // However, without a true Keplarian propagator for the ship, the cleanest 
    // post-transit approximation for UI scrubbing is to lock it to the planet's center 
    // (with a tiny visual scatter if desired) or snap-to-zero.
    const s = getGlobalState(system, targetNode as any, timeMs);
    const state = lastPlan.arrivalPlacement === 'surface' ? 'Landed' : (targetNode.kind === 'construct' ? 'Docked' : 'Orbiting');
    
    // Snap to target center. The visualizer handles drawing "orbiting" ships as icons next to the planet.
    return {
      journeyId: log.id,
      state,
      position_au: s.r,
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
