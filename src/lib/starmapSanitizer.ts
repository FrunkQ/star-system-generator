import type { CelestialBody, Starmap } from '$lib/types';
import type { ScheduledJourneyLog, TransitPlan, TransitSegment, Vector2 } from '$lib/transit/types';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sanitizeVector2(value: unknown): Vector2 | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as { x?: unknown; y?: unknown };
  if (!isFiniteNumber(v.x) || !isFiniteNumber(v.y)) return null;
  return { x: v.x, y: v.y };
}

function sanitizeSegment(segment: unknown): TransitSegment | null {
  if (!segment || typeof segment !== 'object') return null;
  const s = segment as TransitSegment;
  if (!isFiniteNumber(s.startTime) || !isFiniteNumber(s.endTime)) return null;
  if (!s.id || typeof s.id !== 'string') return null;
  if (!s.hostId || typeof s.hostId !== 'string') return null;
  if (!s.startState || !s.endState) return null;
  if (!sanitizeVector2(s.startState.r) || !sanitizeVector2(s.startState.v)) return null;
  if (!sanitizeVector2(s.endState.r) || !sanitizeVector2(s.endState.v)) return null;

  const pathPoints = Array.isArray(s.pathPoints)
    ? s.pathPoints.map(sanitizeVector2).filter((p): p is Vector2 => !!p)
    : [];

  return {
    ...s,
    pathPoints,
    warnings: Array.isArray(s.warnings) ? s.warnings.filter((w) => typeof w === 'string') : [],
    fuelUsed_kg: isFiniteNumber(s.fuelUsed_kg) ? s.fuelUsed_kg : 0
  };
}

function sanitizePlan(plan: unknown): TransitPlan | null {
  if (!plan || typeof plan !== 'object') return null;
  const p = plan as TransitPlan;
  if (!p.id || typeof p.id !== 'string') return null;
  if (!p.originId || typeof p.originId !== 'string') return null;
  if (!p.targetId || typeof p.targetId !== 'string') return null;
  if (!isFiniteNumber(p.startTime) || !isFiniteNumber(p.totalTime_days) || p.totalTime_days < 0) return null;

  const segments = Array.isArray(p.segments)
    ? p.segments.map(sanitizeSegment).filter((s): s is TransitSegment => !!s)
    : [];

  return {
    ...p,
    segments,
    burns: Array.isArray(p.burns) ? p.burns : [],
    totalDeltaV_ms: isFiniteNumber(p.totalDeltaV_ms) ? p.totalDeltaV_ms : 0,
    totalFuel_kg: isFiniteNumber(p.totalFuel_kg) ? p.totalFuel_kg : 0,
    arrivalVelocity_ms: isFiniteNumber(p.arrivalVelocity_ms) ? p.arrivalVelocity_ms : 0,
    distance_au: isFiniteNumber(p.distance_au) ? p.distance_au : 0,
    maxG: isFiniteNumber(p.maxG) ? p.maxG : 0,
    accelRatio: isFiniteNumber(p.accelRatio) ? p.accelRatio : 0,
    brakeRatio: isFiniteNumber(p.brakeRatio) ? p.brakeRatio : 0,
    interceptSpeed_ms: isFiniteNumber(p.interceptSpeed_ms) ? p.interceptSpeed_ms : 0
  };
}

function safeBigIntString(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) return fallback;
  try {
    return BigInt(value).toString();
  } catch {
    return fallback;
  }
}

function sanitizeJourneyLog(log: unknown): ScheduledJourneyLog | null {
  if (!log || typeof log !== 'object') return null;
  const l = log as ScheduledJourneyLog;
  if (!l.id || typeof l.id !== 'string') return null;

  const plans = Array.isArray(l.plans) ? l.plans.map(sanitizePlan).filter((p): p is TransitPlan => !!p) : [];
  if (plans.length === 0) return null;

  const firstStartSec = BigInt(Math.floor(plans[0].startTime / 1000)).toString();
  const createdAtSec = safeBigIntString(l.createdAtSec, firstStartSec);
  const cancelledAtSec = l.cancelledAtSec ? safeBigIntString(l.cancelledAtSec, createdAtSec) : undefined;
  const status = l.status === 'scheduled' || l.status === 'active' || l.status === 'completed' || l.status === 'cancelled'
    ? l.status
    : 'scheduled';

  return {
    ...l,
    plans,
    status,
    createdAtSec,
    cancelledAtSec
  };
}

// A negative/NaN semi-major axis (sign slip during a manual orbit edit — seen in a user's Kerbol
// import where Laythe had a_AU = -0.0018) throws IndexSizeError in ctx.ellipse and froze the
// orrery. Self-heal it on load by taking the magnitude (the orbit size was right, just the sign).
function sanitizeOrbit(node: CelestialBody): { node: CelestialBody; changed: boolean } {
  const a = node.orbit?.elements?.a_AU;
  if (typeof a !== 'number' || (Number.isFinite(a) && a > 0)) return { node, changed: false };
  const fixed = Number.isFinite(a) ? Math.abs(a) : 0;
  if (fixed === a) return { node, changed: false };
  return {
    node: { ...node, orbit: { ...node.orbit!, elements: { ...node.orbit!.elements, a_AU: fixed } } },
    changed: true
  };
}

function sanitizeConstructJourneys(node: CelestialBody): { node: CelestialBody; changed: boolean } {
  if (node.kind !== 'construct') return { node, changed: false };
  const logs = Array.isArray(node.scheduled_journeys)
    ? node.scheduled_journeys.map(sanitizeJourneyLog).filter((l): l is ScheduledJourneyLog => !!l)
    : [];
  const existing = Array.isArray(node.scheduled_journeys) ? node.scheduled_journeys : [];
  const changed = existing.length !== logs.length || existing.some((log, i) => log !== logs[i]);
  return changed ? { node: { ...node, scheduled_journeys: logs }, changed } : { node, changed };
}

export function sanitizeStarmapForRuntime(starmap: Starmap): Starmap {
  if (!Array.isArray(starmap.systems)) return starmap;

  let starmapChanged = false;
  const systems = starmap.systems.map((sysNode) => {
    if (!Array.isArray(sysNode.system?.nodes)) return sysNode;
    let systemChanged = false;
    const nodes = sysNode.system.nodes.map((node) => {
      if (!(node && typeof node === 'object')) return node;
      let current = node as CelestialBody;
      // Self-heal a bad semi-major axis on any orbiting node (body or construct).
      const orbitFix = sanitizeOrbit(current);
      if (orbitFix.changed) { current = orbitFix.node; systemChanged = true; }
      if ((current as any).kind !== 'construct') return current;
      const sanitized = sanitizeConstructJourneys(current);
      if (sanitized.changed) systemChanged = true;
      return sanitized.node;
    });
    if (!systemChanged) return sysNode;
    starmapChanged = true;
    return {
      ...sysNode,
      system: {
        ...sysNode.system,
        nodes
      }
    };
  });

  return starmapChanged ? { ...starmap, systems } : starmap;
}
