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
        // Lagrange points: mathematically rotate the planet's orbit around the sun.
        let rotAngleDeg = 0;
        let scale = 1;
        
        if (lastPlan.arrivalPlacement === 'l1') scale = 0.99;
        if (lastPlan.arrivalPlacement === 'l2') scale = 1.01;
        if (lastPlan.arrivalPlacement === 'l3') rotAngleDeg = 180;
        if (lastPlan.arrivalPlacement === 'l4') rotAngleDeg = 60;
        if (lastPlan.arrivalPlacement === 'l5') rotAngleDeg = -60;

        // Create a synthetic node mathematically identical to the target planet, 
        // but rotated around the sun to preserve perfectly eccentric Keplarian motion
        const synthOrbit = JSON.parse(JSON.stringify((targetNode as any).orbit));
        synthOrbit.elements.a_AU *= scale;
        synthOrbit.elements.omega_deg = (synthOrbit.elements.omega_deg || 0) + rotAngleDeg;
        
        const synthNode = {
          id: 'synth-lpoint',
          kind: 'body',
          parentId: targetNode.parentId,
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
      // Parking-orbit radius above the target surface, by arrival placement.
      const altFactor = placement === 'ho' ? 3 : placement === 'geo' ? 5 : placement === 'mo' ? 1.2 : 0.3; // 'lo' default
      const parkingRadiusKm = targetRadiusKm * (1 + altFactor);
      const aAU = parkingRadiusKm / AU_KM;
      const aM = parkingRadiusKm * 1000;
      const G_CONST = 6.6743e-11;
      const mu = G_CONST * targetMassKg;
      const n = mu > 0 && aM > 0 ? Math.sqrt(mu / (aM * aM * aM)) : 0; // mean motion, rad/s
      // Deterministic starting phase per journey so re-samples don't jump the ship.
      let phase0 = 0;
      for (let i = 0; i < log.id.length; i++) phase0 = (phase0 + log.id.charCodeAt(i) * 0.137) % (2 * Math.PI);
      const theta = phase0 + n * ((timeMs - completedAtMs) / 1000);
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const vTanAuSec = n * aAU; // tangential orbital speed, AU/s
      return {
        journeyId: log.id,
        state: 'Orbiting',
        position_au: { x: s.r.x + aAU * cos, y: s.r.y + aAU * sin },
        velocity_ms: {
          x: (s.v.x + (-vTanAuSec * sin)) * AU_M,
          y: (s.v.y + (vTanAuSec * cos)) * AU_M
        }
      };
    }

    // Landed / Docked: snap to the target centre.
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
