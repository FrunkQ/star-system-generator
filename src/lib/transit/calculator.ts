import type { System, CelestialBody, Barycenter } from '../types';
import type { TransitPlan, TransitSegment, TransitMode, Vector2, StateVector, BurnPoint } from './types';
import { solveLambert, distanceAU, subtract, magnitude, dot, zOf, integrateBallisticPath, integrateBallisticPathAtTimes, add } from './math';
import { buildPathSchedule, slicePhase, refineScheduleByTurn, PREFERRED_SPACING_SEC, DEFAULT_PATH_BUDGET } from './pathSampling';
import type { PathSchedule } from './pathSampling';
import { getGlobalState, getLocalState, calculateFuelMass } from './physics';
import { deriveCoOrbitalOrbit, LAGRANGE_POINT_IDS } from '../physics/lagrange';
import { aerobrakeSolution, brakingCorridorKm } from '../physics/aerobrake';
import type { LagrangePointId } from '../types';
import { calculateAssistPlan } from './assist';
import { sampleJourneyKinematicsAtTime } from './scheduler';
import { AU_KM, G } from '../constants';
import { parkingOrbitRadiusKm } from '../physics/orbits';
import { solveHohmann, transferEllipsePath, aerobrakeDipPath } from './orbitChange';

const AU_M = AU_KM * 1000;
const DAY_S = 86400;

// Per-solve trace logging. OFF by default: the solver runs many times per autopilot generation (the
// reorder/lookahead alone fires hundreds of quote calls), so logging on every call floods the console and
// drags playback. Flip to true only when debugging a specific transfer.
const DEBUG_TRANSIT = false;
const SOLAR_MASS_KG = 1.989e30;

function getNodeMass(sys: System, node: any): number {
    if (!node) return 0;
    if (node.massKg) return node.massKg;
    if (node.massSol) return node.massSol * SOLAR_MASS_KG;
    if (node.kind === 'barycenter') {
        if (node.effectiveMassKg) return node.effectiveMassKg;
        if (node.memberIds) {
            return node.memberIds.reduce((sum: number, id: string) => {
                const m = sys.nodes.find(n => n.id === id);
                const mMass = m ? ((m as any).massKg || (m as any).massSol * SOLAR_MASS_KG || 0) : 0;
                return sum + mMass;
            }, 0);
        }
    }
    if (node.roleHint === 'star') return SOLAR_MASS_KG;
    return 0;
}

/** Unit vector, or undefined when there is no direction to speak of. */
function unitOf(v: Vector2): Vector2 | undefined {
    const m = Math.hypot(v.x, v.y);
    if (!(m > 1e-18)) return undefined;
    return { x: v.x / m, y: v.y / m };
}

/** The sample nearest a given offset from the journey start. Sample times are no longer evenly
 *  spaced, so a fraction-of-count index is not the same thing as a fraction-of-time one. */
function indexAtTimeSec(timesSec: number[], tSec: number): number {
    if (timesSec.length === 0) return 0;
    let best = 0;
    let bestGap = Infinity;
    for (let i = 0; i < timesSec.length; i++) {
        const gap = Math.abs(timesSec[i] - tSec);
        if (gap < bestGap) { bestGap = gap; best = i; }
    }
    return best;
}

function estimateOrbitalPeriodDays(
  node: CelestialBody | Barycenter,
  parentMu: number
): number | null {
  if (!node.orbit || !node.orbit.elements) return null;
  const a_au = node.orbit.elements.a_AU;
  if (!Number.isFinite(a_au) || a_au <= 0) return null;
  if (!Number.isFinite(parentMu) || parentMu <= 0) return null;
  const a_m = a_au * AU_M;
  const periodSec = 2 * Math.PI * Math.sqrt((a_m * a_m * a_m) / parentMu);
  if (!Number.isFinite(periodSec) || periodSec <= 0) return null;
  return periodSec / DAY_S;
}

function resolveAimPositionAtRadius(
  startPos: Vector2,
  targetPos: Vector2,
  targetVel: Vector2,
  radiusAu?: number
): Vector2 {
  if (!radiusAu || radiusAu <= 0) return targetPos;
  let dx = startPos.x - targetPos.x;
  let dy = startPos.y - targetPos.y;
  let dz = zOf(startPos) - zOf(targetPos);
  let d = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(d) || d < 1e-12) {
    // Fallback: aim "behind" target velocity direction
    dx = -targetVel.x;
    dy = -targetVel.y;
    dz = -zOf(targetVel);
    d = Math.hypot(dx, dy, dz);
  }
  if (!Number.isFinite(d) || d < 1e-12) {
    dx = 1;
    dy = 0;
    dz = 0;
    d = 1;
  }
  return {
    x: targetPos.x + (dx / d) * radiusAu,
    y: targetPos.y + (dy / d) * radiusAu,
    z: zOf(targetPos) + (dz / d) * radiusAu
  };
}

function resolveDesiredArrivalRelative(
  arrivalRelVec_au_s: Vector2,
  targetPos: Vector2,
  targetVel: Vector2,
  targetAimPos: Vector2,
  targetMassKg: number,
  parkingOrbitRadius_au: number | undefined,
  brakeAtArrival: boolean | undefined,
  interceptSpeed_ms: number | undefined
): { desiredRelVec_au_s: Vector2; dv2Required_ms: number } {
  const relMag = magnitude(arrivalRelVec_au_s);
  const intercept = Math.max(0, interceptSpeed_ms || 0);

  if (!brakeAtArrival) {
    const desiredMs = intercept;
    // If desired intercept speed is 0 and we are NOT braking to rendezvous, 
    // it means a free flyby (no arrival burn).
    if (desiredMs <= 0) return { desiredRelVec_au_s: arrivalRelVec_au_s, dv2Required_ms: 0 };
    
    if (relMag <= 1e-12) return { desiredRelVec_au_s: { x: 0, y: 0, z: 0 }, dv2Required_ms: desiredMs };
    const desiredAuS = desiredMs / AU_M;
    // Same closing DIRECTION, the requested closing SPEED. The z term is not decoration: scaling only
    // x and y by a magnitude that included z left the pass 2 m/s off the 2,000 it was asked for.
    const desired = {
      x: (arrivalRelVec_au_s.x / relMag) * desiredAuS,
      y: (arrivalRelVec_au_s.y / relMag) * desiredAuS,
      z: (zOf(arrivalRelVec_au_s) / relMag) * desiredAuS
    };
    return { desiredRelVec_au_s: desired, dv2Required_ms: Math.abs(relMag - desiredAuS) * AU_M };
  }

  if (!parkingOrbitRadius_au || parkingOrbitRadius_au <= 0 || targetMassKg <= 0) {
    return { desiredRelVec_au_s: { x: 0, y: 0, z: 0 }, dv2Required_ms: relMag * AU_M };
  }

  const rVec = subtract(targetAimPos, targetPos);
  let rAu = magnitude(rVec);
  if (!Number.isFinite(rAu) || rAu <= 1e-12) rAu = parkingOrbitRadius_au;
  const rM = Math.max(1, rAu * AU_M);
  const vCirc_ms = Math.sqrt((targetMassKg * G) / rM);
  const vCirc_au_s = vCirc_ms / AU_M;

  // THE CHEAPEST CIRCULAR ORBIT THROUGH THE AIM POINT, which is the one whose velocity lies along the
  // part of the arrival velocity that is already perpendicular to the radius. Nothing about that is
  // two-dimensional, and it replaces a pair of candidate tangents built by rotating the radius a
  // quarter turn in x and y and then comparing which was nearer: in a plane those two ARE the only
  // perpendiculars and the nearer one is this projection, so a flat system gets the same answer it
  // always did — but out of plane they were two arbitrary vectors and neither was perpendicular to
  // anything the ship was actually doing.
  const rHat = { x: rVec.x / rAu, y: rVec.y / rAu, z: zOf(rVec) / rAu };
  const radialPart = dot(arrivalRelVec_au_s, rHat);
  let tangential = {
    x: arrivalRelVec_au_s.x - rHat.x * radialPart,
    y: arrivalRelVec_au_s.y - rHat.y * radialPart,
    z: zOf(arrivalRelVec_au_s) - rHat.z * radialPart
  };
  let tMag = magnitude(tangential);
  if (!(tMag > 1e-15)) {
    // A purely RADIAL approach has no perpendicular component to follow, so any perpendicular will
    // do; take the one in the reference plane, which is what the old pair would have picked.
    tangential = { x: -rHat.y, y: rHat.x, z: 0 };
    tMag = magnitude(tangential);
    if (!(tMag > 1e-15)) return { desiredRelVec_au_s: { x: 0, y: 0, z: 0 }, dv2Required_ms: relMag * AU_M };
  }
  const desired = {
    x: (tangential.x / tMag) * vCirc_au_s,
    y: (tangential.y / tMag) * vCirc_au_s,
    z: (zOf(tangential) / tMag) * vCirc_au_s
  };
  const dv2Req = magnitude(subtract(arrivalRelVec_au_s, desired)) * AU_M;
  return { desiredRelVec_au_s: desired, dv2Required_ms: dv2Req };
}

function solveBestLambert(
  r1_m: Vector2,
  r2_m: Vector2,
  dt_sec: number,
  mu: number,
  startVel_au_s?: Vector2,
  targetVel_au_s?: Vector2,
  options?: { shortWayOnly?: boolean }
): { v1: Vector2; v2: Vector2 } | null {
  const isFiniteSolution = (s: { v1: Vector2; v2: Vector2 } | null): s is { v1: Vector2; v2: Vector2 } => {
    if (!s) return false;
    return Number.isFinite(s.v1.x) && Number.isFinite(s.v1.y) && Number.isFinite(s.v2.x) && Number.isFinite(s.v2.y);
  };
  const candidates: { v1: Vector2; v2: Vector2 }[] = [];

  const short = solveLambert(r1_m, r2_m, dt_sec, mu, { longWay: false });
  if (isFiniteSolution(short)) candidates.push(short);
  
  if (!options?.shortWayOnly) {
      const long = solveLambert(r1_m, r2_m, dt_sec, mu, { longWay: true });
      if (isFiniteSolution(long)) candidates.push(long);
  }
  
  if (candidates.length === 0) return null;
  if (!startVel_au_s || !targetVel_au_s) return candidates[0];

  let best = candidates[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const v1_au_s = { x: c.v1.x / AU_M, y: c.v1.y / AU_M };
    const v2_au_s = { x: c.v2.x / AU_M, y: c.v2.y / AU_M };
    const score =
      magnitude(subtract(v1_au_s, startVel_au_s)) * AU_M +
      0.5 * magnitude(subtract(v2_au_s, targetVel_au_s)) * AU_M;
    if (score < bestScore) {
      best = c;
      bestScore = score;
    }
  }

  return best;
}

// Is this arrival an ORBIT AROUND THE TARGET, as opposed to a co-orbital point beside it? Only an
// orbital arrival has a periapsis that can be dropped into the air, which is what makes aerobraking
// possible at all — and it is the check the old flat model was missing, so an L-point arrival half an
// AU from the planet was collecting the same free braking as a low pass.
function isOrbitalArrivalPlacement(placement?: string): boolean {
  if (!placement) return true;                    // an unqualified arrival is an orbit by default
  return !LAGRANGE_POINT_IDS.includes(placement as LagrangePointId);
}

export function calculateTransitPlan(
  sys: System,
  originId: string,
  targetId: string,
  startTime: number, // ms
  mode: TransitMode,
  params: { 
      maxG: number; 
      accelRatio: number; 
      brakeRatio: number; 
      interceptSpeed_ms: number; 
      shipMass_kg?: number; 
      shipDryMass_kg?: number;
      shipIsp?: number; 
      brakeAtArrival?: boolean; 
      brakingRatio?: number; 
      initialState?: StateVector; 
      initialStateFrame?: 'auto' | 'global' | 'local';
      parkingOrbitRadius_au?: number; 
      // targetOffsetAnomaly RETIRED (G43 P4): the L-point geometry lives in physics/lagrange.ts,
      // so callers no longer pass an anomaly offset for it.
      arrivalPlacement?: string;
      arrivalDock?: { structureId: string; level?: 'anchor' | 'lo' | 'mo' | 'geo' | 'counterweight' }; // G53 phase 5, see transit/types.ts
      aerobrake?: { allowed: boolean; limit_kms: number; }; // NEW
      initialDelay_days?: number;
      directAccelRatio?: number; // NEW
      directBrakeRatio?: number; // NEW
      // Cost-only: keep the analytic time/Δv (computed before the integration) but skip generating the full
      // display trajectory — drops the path-point count to a minimum. For the autopilot reorder search, which
      // needs only time + Δv and runs the solver many times. Same core math; far cheaper. (Default: full path.)
      costOnly?: boolean;
      // Quote: the lightest tier, for the lookahead/reorder search that runs MANY times. Produces only the
      // two analytic-cost families the search ranks on — "Efficient Now" (Lambert/Hohmann, depart-now) and
      // "Direct Burn" (torch) — and skips the expensive Most-Efficient delayed-launch-window sweep (~100
      // Lambert solves) + the gravity-assist candidate search + the display path. Both returned plans are the
      // SAME real solver outputs the full call commits with, so a quoted leg cannot diverge from the flown one.
      // (Implies costOnly.)
      quote?: boolean;
  }
): TransitPlan[] {
  const plans: TransitPlan[] = [];
  // Quote tier always skips the display trajectory (it only ever reports time/Δv).
  if (params.quote) params.costOnly = true;
  const quote = !!params.quote;

  // 1. Find Nodes
  const origin = sys.nodes.find(n => n.id === originId);
  const target = sys.nodes.find(n => n.id === targetId);
  const root = sys.nodes.find(n => n.parentId === null);
  
  if (!target || !root) return [];

  // 2. Determine Reference Frame (Lowest Common Ancestor)
  function getAncestors(id: string): string[] {
      const list: string[] = [];
      let curr = sys.nodes.find(n => n.id === id);
      while (curr && curr.parentId) {
          list.push(curr.parentId);
          curr = sys.nodes.find(n => n.id === curr.parentId);
      }
      return list;
  }

  // originAncestors includes origin itself to support parent-child transfers
  const originAncestors = origin ? [origin.id, ...getAncestors(origin.id)] : [];
  const targetAncestors = [target.id, ...getAncestors(target.id)];
  
  let lcaId: string | null = null;
  for (const id of originAncestors) {
      if (targetAncestors.includes(id)) {
          const node = sys.nodes.find(n => n.id === id);
          // Frame must be a physical body or barycenter with mass
          if (node && (node.kind === 'body' || node.kind === 'barycenter')) {
              lcaId = id;
              break;
          }
      }
  }

  let frameParentId: string | null = null;
  let frameMu = getNodeMass(sys, root) * G;

  // Frame Logic:
  // 1. If LCA is a Planet/Moon (e.g. Earth for Earth->Moon or Moon->Moon), use it.
  // 2. If LCA is root (Sun), stay in global frame.
  // 3. Exception: If we are targeting a child of our current node (e.g. Earth -> Station), 
  //    use our current node as the frame.
  if (lcaId && lcaId !== root.id) {
      frameParentId = lcaId;
  } else if (origin && target.parentId === origin.id) {
      frameParentId = origin.id;
  }

  if (frameParentId) {
      const parentNode = sys.nodes.find(n => n.id === frameParentId);
      if (parentNode) {
          const m = getNodeMass(sys, parentNode);
          if (m > 0) frameMu = m * G;
      }
  }

  if (DEBUG_TRANSIT) console.log(`[TransitPlanner] Debug: Root mass=${getNodeMass(sys, root)}, Frame=${frameParentId || 'Global'}, FrameMu=${frameMu}`);

  // SANITIZATION: Check for "Impossible Orbit" (Sun Gravity around a Planet)
  let effectiveOrigin = origin;
  if (origin && origin.parentId && origin.orbit) {
      const parent = sys.nodes.find(n => n.id === origin.parentId);
      if (parent) {
          const parentMass = getNodeMass(sys, parent);
          const parentMu = parentMass * G;
          
          if (origin.orbit.hostId !== parent.id || (parentMu > 0 && Math.abs(origin.orbit.hostMu - parentMu) > parentMu * 100)) {
              console.warn(`[TransitPlanner] Detected corrupted orbit for ${origin.name}. Fixing locally.`);
              effectiveOrigin = {
                  ...origin,
                  orbit: {
                      ...origin.orbit,
                      hostId: parent.id,
                      hostMu: parentMu,
                      n_rad_per_s: undefined 
                  }
              };
          }
      }
  }

  // Handle Virtual Targets (L4/L5) or Explicit Node Targets (Moon/Station)
  let effectiveTarget = target;
  let forcedParkingRadiusAu: number | undefined = params.parkingOrbitRadius_au;
  
  if (params.arrivalPlacement) {
      const placementNode = sys.nodes.find(n => n.id === params.arrivalPlacement);
      const isLagrange = LAGRANGE_POINT_IDS.includes(params.arrivalPlacement as LagrangePointId);

      if (placementNode || isLagrange) {
          // For explicit nodes (Moons/Stations)
          if (placementNode) {
              const placementParent = placementNode.parentId ? sys.nodes.find(p => p.id === placementNode.parentId) : null;
              
              // SMART REDIRECT: Only redirect if the target's parent is NOT the current frame.
              // If we are already solving in the parent's frame (LCA == Parent), 
              // then the gravity well is already correct and we can target the node directly.
              const needsRedirect = placementParent && lcaId !== placementParent.id;
              
              if (needsRedirect && placementParent) {
                  effectiveTarget = placementParent as CelestialBody; 
                  forcedParkingRadiusAu = placementNode.orbit?.elements.a_AU || params.parkingOrbitRadius_au;
              } else {
                  effectiveTarget = placementNode;
              }
          } 
          
          // For Virtual Lagrange Points (G43 P4).
          //
          // THE PHANTOM IS NOW THE REAL POINT. This block used to build its own geometry — a
          // MEAN-ANOMALY shift for l3/l4/l5, and the panel's planet-centric parking distance
          // dropped in as a HELIOCENTRIC a_AU for l1/l2 — while the post-arrival sampler in
          // scheduler.ts used a rigid omega rotation. Two conventions for one point, so the solver
          // braked to zero relative velocity against a place the ship was then teleported away
          // from: measured at up to 0.48 AU and a 13 km/s step for an eccentric Jupiter L4, and a
          // Mars L1 plan terminated 0.007 AU from the SUN. Both sides now call the one convention,
          // so "rendezvous with the phantom" IS arriving at the point with its velocity matched —
          // the cancelling falls out of the shared geometry instead of being a second calculation
          // that has to agree with the first.
          if (isLagrange && target.orbit) {
              const lagrangePoint = params.arrivalPlacement as LagrangePointId;
              const lagrangeHost = sys.nodes.find(n => n.id === target.parentId);
              const lagrangeHostMassKg = lagrangeHost ? getNodeMass(sys, lagrangeHost) : 0;
              const pointOrbit = deriveCoOrbitalOrbit(target, lagrangeHostMassKg, lagrangePoint);
              if (pointOrbit) {
                  effectiveTarget = {
                      ...target,
                      orbit: pointOrbit,
                      // An L-point has no mass, so the solver runs in "Rendezvous" mode: it matches
                      // the point's velocity rather than trying to enter an orbit around it.
                      kind: 'construct' as any,
                      massKg: 0
                  };
              }
              // Never "orbit" a mass-less point — and never let a parking radius reach the elements.
              forcedParkingRadiusAu = undefined;
          }
      }
  }

  // BELT / RING DESTINATION (#13): a belt node's own anomaly is an arbitrary spot on the ring —
  // it can sit on the far side of the star, which made Mars→belt plans fly PAST the sun to
  // "rendezvous" with that phantom point. The intent of a belt/ring destination is "drop into a
  // circular orbit at that radius" (the closest stretch of ring is fine), so retarget a massless
  // phantom on a circular orbit at the annulus mid-radius, rotated to the ORIGIN's longitude.
  // Rendezvous mode then matches the phantom's velocity = a circular orbit inside the belt.
  if ((target.roleHint === 'belt' || target.roleHint === 'ring') && target.orbit) {
      const midAu = (target.radiusInnerKm && target.radiusOuterKm)
          ? ((target.radiusInnerKm + target.radiusOuterKm) / 2) / AU_KM
          : target.orbit.elements.a_AU;
      const phantom = {
          ...target,
          orbit: {
              ...target.orbit,
              elements: { ...target.orbit.elements, a_AU: midAu, e: 0 },
              n_rad_per_s: undefined as any   // force recompute for the new radius
          },
          kind: 'construct' as any,           // massless → rendezvous mode, nothing to "orbit"
          massKg: 0
      };
      if (effectiveOrigin) {
          // Rotate the phantom so that at departure it sits at the origin's longitude around the
          // belt's host (e=0 → adding Δangle to the anomaly rotates the position by exactly Δangle).
          const beltHost = sys.nodes.find(n => n.id === target.orbit!.hostId) ?? root;
          const hostR = getGlobalState(sys, beltHost as any, startTime).r;
          const phR = getGlobalState(sys, phantom as any, startTime).r;
          const origR = getGlobalState(sys, effectiveOrigin as any, startTime).r;
          const cur = Math.atan2(phR.y - hostR.y, phR.x - hostR.x);
          const want = Math.atan2(origR.y - hostR.y, origR.x - hostR.x);
          phantom.orbit.elements.M0_rad += (want - cur);
      }
      effectiveTarget = phantom as CelestialBody;
      forcedParkingRadiusAu = undefined;      // the ring itself IS the parking orbit
  }

  // Update params with potentially forced radius
  // THE AIM POINT IS THE PARKING ORBIT, NOT THE BODY'S CENTRE.
  //
  // When a caller does not name a parking radius the solver used to aim at the middle of the planet,
  // while the arrival sampler put the ship in an orbit around it — so the flight ended in one place and
  // the parking began in another, and the ship stepped between them at the completion instant. That is
  // [[B92]], measured at 90,884 km on a Jupiter low orbit. Both sides now read `parkingOrbitRadiusKm`,
  // the one derivation, so the seam closes by construction rather than by tolerance — the same shape of
  // fix G43 P4 used on the Lagrange arrivals.
  if (!(forcedParkingRadiusAu && forcedParkingRadiusAu > 0) && isOrbitalArrivalPlacement(params.arrivalPlacement)) {
      const km = parkingOrbitRadiusKm(effectiveTarget as CelestialBody, params.arrivalPlacement, undefined, sys);
      if (km && km > 0) forcedParkingRadiusAu = km / AU_KM;
  }
  const finalParams = { ...params, parkingOrbitRadius_au: forcedParkingRadiusAu };

  function normalizeInitialStateToFrame(
      initial: StateVector | undefined,
      frameMode: 'auto' | 'global' | 'local' | undefined,
      localFrameParentId: string | null
  ): StateVector | undefined {
      if (!initial || !effectiveOrigin) return initial;
      if (!localFrameParentId) return initial;

      const parentNode = sys.nodes.find(n => n.id === localFrameParentId);
      if (!parentNode) return initial;

      const parentGlobal = getGlobalState(sys, parentNode, startTime);
      const originGlobal = getGlobalState(sys, effectiveOrigin, startTime);
      const originLocal = getLocalState(sys, effectiveOrigin, localFrameParentId, startTime);

      const mode = frameMode || 'auto';
      if (mode === 'local') return initial;
      if (mode === 'global') {
          return {
              r: subtract(initial.r, parentGlobal.r),
              v: subtract(initial.v, parentGlobal.v)
          };
      }

      const errAsLocal = distanceAU(initial.r, originLocal.r);
      const errAsGlobal = distanceAU(initial.r, originGlobal.r);
      const looksLocal = errAsLocal <= errAsGlobal;
      if (looksLocal) return initial;

      return {
          r: subtract(initial.r, parentGlobal.r),
          v: subtract(initial.v, parentGlobal.v)
      };
  }

  // 3. Get Origin State (Local or Global)
  let startState: StateVector;
  if (params.initialState) {
      startState = normalizeInitialStateToFrame(params.initialState, params.initialStateFrame, frameParentId) || params.initialState;
  } else if (effectiveOrigin) {
      // If the origin construct is mid/post-journey, its cached kinematic vector
      // is a snapshot that getGlobalState/getLocalState would LINEARLY extrapolate
      // -- wrong for a ship that's actually following a target body's curved orbit
      // (the cause of "ship at its target but wrong in a future transit"). Re-sample
      // its journeys at startTime and feed that in as a fresh vector: epoch = startTime
      // means zero extrapolation, and dropping the (stale) orbit forces the fresh
      // vector to be used. Bodies and journey-less constructs are unaffected.
      let originForState: any = effectiveOrigin;
      const oc: any = effectiveOrigin;
      if (oc.kind === 'construct' && (oc.scheduled_journeys?.length || 0) > 0) {
          const sampled = sampleJourneyKinematicsAtTime(sys, oc, startTime);
          if (sampled) {
              originForState = {
                  ...oc,
                  vector_position_au: { x: sampled.position_au.x, y: sampled.position_au.y, z: sampled.position_au.z ?? 0 },
                  vector_velocity_ms: { x: sampled.velocity_ms.x, y: sampled.velocity_ms.y, z: sampled.velocity_ms.z ?? 0 },
                  vector_epoch_ms: startTime,
                  flight_state: sampled.state,
                  orbit: undefined
              };
          }
      }
      if (frameParentId) {
          startState = getLocalState(sys, originForState, frameParentId, startTime);
      } else {
          startState = getGlobalState(sys, originForState, startTime);
      }
  } else {
      return [];
  }
  
  const startPos = startState.r;

  // --- HELPER FOR TARGET RESOLUTION ---
  // We need to resolve the target's position/velocity at any time T.
  function resolveTargetState(tAbs: number): StateVector {
      return frameParentId 
          ? getLocalState(sys, effectiveTarget as any, frameParentId, tAbs)
          : getGlobalState(sys, effectiveTarget as any, tAbs);
  }
  
  // 4. Baselines
  const r1 = magnitude(startPos);
  let r2 = r1;
  
  const isLagrange = LAGRANGE_POINT_IDS.includes((params.arrivalPlacement || '') as LagrangePointId);
  if (isLagrange && effectiveTarget.orbit) {
      // The derived point orbit ALREADY carries the right radius (scaled by (1∓k) for the
      // collinear points). Reading a parking radius here is what sent a Mars L1 plan to 0.007 AU
      // from the Sun: the panel's figure is planet-centric and this baseline is heliocentric.
      r2 = effectiveTarget.orbit.elements.a_AU;
  } else if (effectiveTarget.orbit && effectiveTarget.orbit.elements) {
      r2 = effectiveTarget.orbit.elements.a_AU;
  } else {
      const globalTargetEnd = getGlobalState(sys, effectiveTarget, startTime + 1000000);
      r2 = magnitude(globalTargetEnd.r);
  }
      
  const r1_m = r1 * AU_M;
  const r2_m = r2 * AU_M;
  const t_hohmann_sec = Math.PI * Math.sqrt(Math.pow(r1_m + r2_m, 3) / (8 * frameMu));
  
  if (DEBUG_TRANSIT) console.log(`[TransitPlanner] Debug: startPos=${startPos.x.toFixed(4)},${startPos.y.toFixed(4)} | r1=${r1.toFixed(2)} AU | r2=${r2.toFixed(2)} AU | t_hohmann=${(t_hohmann_sec/86400).toFixed(1)}d`);

  const accel = (params.maxG || 0.1) * 9.81;

  // --- Helper Solver ---
  function solveVariantAt(
      variantStartTime: number,
      variantStartState: StateVector,
      name: string,
      type: 'Efficiency' | 'Speed',
      constraints: { t_min: number, t_max: number, fixedAccelRatio?: number, fixedBrakeRatio?: number }
  ): TransitPlan | null {
      // Helper for target state at T (Local or Global)
      function targetState(t: number) {
          const tAbs = variantStartTime + t * 1000;
          return resolveTargetState(tAbs);
      }

      let t_min = constraints.t_min;
      let t_max = constraints.t_max;
      
      const localAccelRatio = constraints.fixedAccelRatio !== undefined ? constraints.fixedAccelRatio : Math.max(0.01, params.accelRatio);
      const localBrakeRatio = constraints.fixedBrakeRatio !== undefined
          ? constraints.fixedBrakeRatio
          : Math.max(0.01, params.brakeRatio);
      
      let bestT = t_max; 
      let bestBrakeRatio = params.brakeRatio;
      let planTags: string[] = [];
      let found = false;

      const evaluateAt = (t_curr: number) => {
      const targetAtT = targetState(t_curr);
      const targetAimAtT = resolveAimPositionAtRadius(
          variantStartState.r,
          targetAtT.r,
          targetAtT.v,
          finalParams.parkingOrbitRadius_au
      );
      const r1_m = { x: variantStartState.r.x * AU_M, y: variantStartState.r.y * AU_M, z: zOf(variantStartState.r) * AU_M };
      const r2_m = { x: targetAimAtT.x * AU_M, y: targetAimAtT.y * AU_M, z: zOf(targetAimAtT) * AU_M };
      const result_m = solveBestLambert(r1_m, r2_m, t_curr, frameMu, variantStartState.v, targetAtT.v);
      if (!result_m) return null;

      const result = {
          v1: { x: result_m.v1.x / AU_M, y: result_m.v1.y / AU_M, z: zOf(result_m.v1) / AU_M },
          v2: { x: result_m.v2.x / AU_M, y: result_m.v2.y / AU_M, z: zOf(result_m.v2) / AU_M }
      };

      const dv1_req_ms = magnitude(subtract(result.v1, variantStartState.v)) * AU_M;
      const arrivalRelVec = subtract(result.v2, targetAtT.v);
      const targetMassKg = getNodeMass(sys, effectiveTarget);
      const desiredArrival = resolveDesiredArrivalRelative(
          arrivalRelVec,
          targetAtT.r,
          targetAtT.v,
          targetAimAtT,
          targetMassKg,
          finalParams.parkingOrbitRadius_au,
          params.brakeAtArrival,
          params.interceptSpeed_ms
      );

          const dv2_req_ms = desiredArrival.dv2Required_ms;

          const accelTimeReq = dv1_req_ms / accel;
          const accelBudgetSec = t_curr * localAccelRatio;
          const dV_avail_accel_ms = accel * accelBudgetSec;

          let brakeAccel = accel;
          if (params.shipMass_kg && params.shipIsp && params.shipIsp > 0) {
              const fuel1 = calculateFuelMass(params.shipMass_kg, dv1_req_ms, params.shipIsp);
              const m1 = Math.max(1, params.shipMass_kg - fuel1);
              brakeAccel = accel * (params.shipMass_kg / m1);
          }
          const brakeTimeReq = dv2_req_ms / brakeAccel;
          const brakeBudgetSec = t_curr * localBrakeRatio;

          const totalFeasible = (accelTimeReq + brakeTimeReq) <= t_curr;
          const profileFeasible = params.brakeAtArrival
              ? accelTimeReq <= accelBudgetSec
              : (accelTimeReq <= accelBudgetSec && brakeTimeReq <= brakeBudgetSec);
          const accelFrac = accelTimeReq / t_curr;
          const brakeFrac = brakeTimeReq / t_curr;

          return {
              dv1_req_ms, dv2_req_ms, accelTimeReq, brakeTimeReq, accelBudgetSec, brakeBudgetSec,
              dV_avail_accel_ms, totalFeasible, profileFeasible, accelFrac, brakeFrac
          };
      };

      let loops = 0;
      while (loops < 50) {
          const t_curr = (t_min + t_max) / 2;
          const e = evaluateAt(t_curr);
          if (!e) {
              t_min = t_curr;
              loops++;
              continue;
          }
          if (e.totalFeasible && e.profileFeasible && e.dV_avail_accel_ms >= e.dv1_req_ms) {
              bestT = t_curr;
              bestBrakeRatio = params.brakeAtArrival ? e.brakeFrac : localBrakeRatio;
              t_max = t_curr;
              found = true;
          } else {
              t_min = t_curr;
          }
          loops++;
      }
      
      if (!found) {
          // console.warn(`[TransitPlanner] Failed to solve variant: ${name} (t_min=${t_min.toFixed(0)}, t_max=${t_max.toFixed(0)})`);
          return null;
      }
      
      // Tagging
      
      if (Math.abs(bestT - t_hohmann_sec) < t_hohmann_sec * 0.15 && localAccelRatio < 0.2) {
          planTags.push('HOHMANN-OPTIMAL');
      }

      const variantParams = { 
          ...finalParams, 
          accelRatio: localAccelRatio, 
          brakeRatio: bestBrakeRatio, 
          extraTags: planTags
      };
      
      const plan = calculateLambertPlan(
          sys, effectiveOrigin, effectiveTarget, root, 
          variantStartTime, variantStartState, bestT, frameMu, variantParams, frameParentId
      );
      
      if (plan) {
          plan.planType = type;
          plan.name = name;
      }
      return plan;
  }

  function solveVariant(
      name: string,
      type: 'Efficiency' | 'Speed',
      constraints: { t_min: number, t_max: number, fixedAccelRatio?: number, fixedBrakeRatio?: number }
  ): TransitPlan | null {
      return solveVariantAt(startTime, startState, name, type, constraints);
  }

  // 1. Most Efficient (Hohmann-like + delayed launch window search) — skipped under quote (its delayed-launch
  // sweep is ~100 Lambert solves; the search ranks on "Efficient Now" + "Direct Burn" instead).
  let mostEfficientPlan: TransitPlan | null = null;
  if (!quote) {
  const localTargetPeriodDays = frameParentId ? estimateOrbitalPeriodDays(effectiveTarget, frameMu) : null;
  // For local-frame transfers (planet->moon, moon->moon), search within about one target orbit.
  const maxSearchDelayDays = frameParentId
      ? Math.max(1, Math.min(120, Math.ceil(localTargetPeriodDays || 30)))
      : 1000;
  const coarseStepDays = frameParentId
      ? Math.max(0.25, Math.min(1, (localTargetPeriodDays || 30) / 120))
      : 10;
  const searchByFuel = !!(params.shipMass_kg && params.shipIsp && params.shipIsp > 0);
  // Local transfers are short and often burn-dominated; tiny fixed burn windows can over-bias long coasts.
  const localMostEffAccelRatio = frameParentId ? 0.12 : 0.05;
  const localMostEffBrakeRatio = frameParentId ? 0.12 : 0.05;

  // Allow local launch-window search even on chained legs (initialState present).
  const canSearchDelayed = !!effectiveOrigin && (!params.initialState || !!frameParentId);
  if (canSearchDelayed) {
      let bestScore = Number.POSITIVE_INFINITY;
      let bestDelayDays = 0;
      for (let delayDays = 0; delayDays <= maxSearchDelayDays; delayDays += coarseStepDays) {
          const startAt = startTime + delayDays * DAY_S * 1000;
          const delayedState = frameParentId
              ? getLocalState(sys, effectiveOrigin!, frameParentId, startAt)
              : getGlobalState(sys, effectiveOrigin!, startAt);

          const candidate = solveVariantAt(startAt, delayedState, 'Most Efficient', 'Efficiency', {
              t_min: t_hohmann_sec * 0.8,
              t_max: t_hohmann_sec * 1.5,
              fixedAccelRatio: localMostEffAccelRatio,
              fixedBrakeRatio: localMostEffBrakeRatio
          });
          if (!candidate) continue;

          // For local transfers, strongly prefer near-term windows when fuel/dV is similar.
          const rawScore = searchByFuel ? candidate.totalFuel_kg : candidate.totalDeltaV_ms;
          const score = frameParentId ? (rawScore + delayDays * 0.001) : rawScore;
          if (score < bestScore - 1e-6 || (Math.abs(score - bestScore) <= 1e-6 && delayDays < bestDelayDays)) {
              bestScore = score;
              mostEfficientPlan = candidate;
              bestDelayDays = delayDays;
          }
      }

      if (mostEfficientPlan) {
          mostEfficientPlan.name = 'Most Efficient';
          mostEfficientPlan.initialDelay_days = bestDelayDays;
          mostEfficientPlan.tags = mostEfficientPlan.tags || [];
          if (bestDelayDays > 0 && !mostEfficientPlan.tags.includes('DELAYED-DEPARTURE')) {
              mostEfficientPlan.tags.push('DELAYED-DEPARTURE');
          }
      }
  } else {
      mostEfficientPlan = solveVariant('Most Efficient', 'Efficiency', {
          t_min: t_hohmann_sec * 0.8,
          t_max: t_hohmann_sec * 1.5,
          fixedAccelRatio: localMostEffAccelRatio,
          fixedBrakeRatio: localMostEffBrakeRatio
      });
  }
  if (!mostEfficientPlan) {
      mostEfficientPlan = solveVariant('Most Efficient', 'Efficiency', {
          t_min: t_hohmann_sec * 0.5,
          t_max: t_hohmann_sec * 2.0,
          fixedAccelRatio: localMostEffAccelRatio,
          fixedBrakeRatio: localMostEffBrakeRatio
      });
  }
  if (mostEfficientPlan) plans.push(mostEfficientPlan);
  } // end !quote (Most Efficient delayed-window search)

  // 2. Balanced Alternative (Efficient Now)
  const balancedPlan = solveVariant('Efficient Now', 'Efficiency', {
      t_min: t_hohmann_sec * 0.5,
      t_max: t_hohmann_sec * 1.5,
      fixedAccelRatio: finalParams.accelRatio,
      fixedBrakeRatio: finalParams.brakeRatio
  });
  if (balancedPlan) {
      if (balancedPlan.tags && balancedPlan.tags.includes('SUNDIVER')) {
          balancedPlan.planType = 'Assist'; 
          balancedPlan.name = 'Sundiver';
      }
      plans.push(balancedPlan);
  }
  
  // 3. Direct Burn (Profile-first kinematic solver)
  const solverRoot = frameParentId ? sys.nodes.find(n => n.id === frameParentId)! : root;
  const directParams = { 
      ...finalParams, 
      initialState: startState,
      accelRatio: params.directAccelRatio !== undefined ? params.directAccelRatio : finalParams.accelRatio,
      brakeRatio: params.directBrakeRatio !== undefined ? params.directBrakeRatio : finalParams.brakeRatio
  };
  const directPlan = calculateFastPlan(sys, effectiveOrigin, effectiveTarget, solverRoot, startTime, startState, directParams);
  if (directPlan) {
      directPlan.planType = 'Speed';
      directPlan.name = 'Direct Burn';
      plans.push(directPlan);
  }

  // 4. Gravity Assist (Deep Space) - V2 Feature — skipped under quote (its candidate search is heavy and the
  // assist plan is never the family the lookahead ranks on).
  const dist_start_au = distanceAU(getGlobalState(sys, effectiveOrigin!, startTime).r, getGlobalState(sys, effectiveTarget, startTime).r);
  if (!quote && dist_start_au > 0.5 && !frameParentId) { // Only for interplanetary
      const assistPlan = calculateAssistPlan(sys, effectiveOrigin, effectiveTarget, root, startTime, getGlobalState(sys, effectiveOrigin!, startTime), {
          maxG: finalParams.maxG,
          shipMass_kg: finalParams.shipMass_kg,
          shipIsp: finalParams.shipIsp,
          costOnly: finalParams.costOnly
      });
      if (assistPlan) {
          assistPlan.planType = 'Complex';
          plans.push(assistPlan);
      }
  }

  // Sort & Clean
  const baselinePlan = plans.find(p => p.name === 'Most Efficient') || plans.find(p => p.planType === 'Efficiency');
  const baselineTime = baselinePlan ? baselinePlan.totalTime_days : 0;
  const baselineDeltaV = baselinePlan ? baselinePlan.totalDeltaV_ms : 0;
  const isConstructTarget = effectiveTarget.kind === 'construct';

  plans.forEach(p => {
      // DYNAMIC FILTERING:
      // High-G ships can easily exceed 100km/s. 
      // We only hide plans that are clearly numerical artifacts or beyond ship physics.
      const hardDVCapMs = 10000000; // 10,000 km/s (Insanity check for divergent solutions)

      if (p.totalDeltaV_ms > hardDVCapMs && p.planType !== 'Speed') {
          p.hiddenReason = `Numerical Divergence (> 10,000 km/s)`;
      }
      else if (baselineTime > 0 && p.totalTime_days > baselineTime * 10 && p.planType !== 'Speed') {
          p.hiddenReason = "Impractical Duration (>10x optimal)";
      }
      
      if (p.hiddenReason && DEBUG_TRANSIT) {
          console.log(`[TransitPlanner] Debug: Plan '${p.name}' hidden because: ${p.hiddenReason} (DV: ${p.totalDeltaV_ms.toFixed(0)}m/s, Time: ${p.totalTime_days.toFixed(1)}d)`);
      }
  });

  // 5. ORBIT CHANGE - the Hohmann figure, when both ends are orbits of ONE body.
  //
  // The general families cannot express this well and one of them cannot express it at all: asked to
  // raise a ship from a low Jupiter orbit to a high one, the solver returned ONLY the torch option at
  // 45.44 km/s and no efficient plan whatsoever, because its Lambert window sweep has nothing sensible
  // to sweep between two points a few planetary radii apart. The Hohmann answer is closed-form and
  // costs a fraction of that. See `orbitChange.ts`.
  if (!quote && frameParentId && effectiveTarget.id === frameParentId && isOrbitalArrivalPlacement(params.arrivalPlacement)) {
      const hohmannPlan = buildOrbitChangePlan(
          sys, effectiveOrigin, effectiveTarget, frameParentId, frameMu,
          startState, startTime, finalParams
      );
      if (hohmannPlan) plans.push(hohmannPlan);
  }

  return plans.sort((a, b) => a.totalFuel_kg - b.totalFuel_kg);
}

/**
 * THE ORBIT-CHANGE PLAN: burn, half an ellipse, burn.
 *
 * Built rather than searched. The two radii determine the transfer completely - its shape, its cost
 * and its duration - so there is no window to sweep and no Lambert to solve. What this adds on top of
 * the closed form in `orbitChange.ts` is the engine's own conventions: burns sized by the ship's
 * thrust ceiling, each phase owning its own time-stamped path (G46), and the whole composed onto the
 * host's motion sample by sample so the figure rides the planet rather than sitting where it was.
 */
function buildOrbitChangePlan(
    sys: System,
    origin: CelestialBody | Barycenter | undefined,
    host: CelestialBody | Barycenter,
    frameParentId: string,
    frameMu_si: number,
    startState: StateVector,
    startTime: number,
    params: any
): TransitPlan | null {
    const r1_au = magnitude(startState.r);
    const r2_au = params.parkingOrbitRadius_au;
    if (!(r1_au > 0) || !(r2_au > 0)) return null;

    // `frameMu` is ALREADY SI (mass x G, m^3/s^2) — the Lambert sweep hands it metres. Converting it
    // again produced a Delta-v of 8.8e17 km/s, which is a good example of why the name matters.
    const mu_si = frameMu_si;
    const sol = solveHohmann(r1_au, r2_au, mu_si);
    if (!sol) return null;

    // THE MANOEUVRE PLANE, host-relative: `u` at the ship, `w` the way it is going. Taking `w` from
    // the ship's actual velocity rather than assuming the reference plane is what lets an inclined
    // orbit change stay inclined.
    const norm = (v: Vector2): Vector2 | null => {
        const m = magnitude(v);
        return m > 1e-18 ? { x: v.x / m, y: v.y / m, z: zOf(v) / m } : null;
    };
    const u = norm(startState.r);
    if (!u) return null;
    const radial = dot(startState.v, u);
    const wRaw = {
        x: startState.v.x - u.x * radial,
        y: startState.v.y - u.y * radial,
        z: zOf(startState.v) - (u.z ?? 0) * radial
    };
    const w = norm(wRaw) ?? norm({ x: -u.y, y: u.x, z: 0 });
    if (!w) return null;

    const g0 = 9.81;
    const accel = Math.max(0.01, (params.maxG || 0.1) * g0);
    const burn1Sec = Math.max(1, Math.abs(sol.deltaV1_ms) / accel);
    const burn2Sec = Math.max(1, Math.abs(sol.deltaV2_ms) / accel);
    const totalSec = burn1Sec + sol.transferTimeSec + burn2Sec;

    const hostNode = sys.nodes.find((n) => n.id === frameParentId);
    if (!hostNode) return null;
    /** Host-relative point -> global, at the moment the ship is there. */
    const toGlobal = (pt: Vector2, tMs: number): Vector2 => add(pt, getGlobalState(sys, hostNode as any, tMs).r);

    // An arc of a circular orbit of radius r, swept for as long as the burn lasts. A burn at this
    // scale covers a small arc, and drawing it on the circle it belongs to is both honest and what
    // puts the burn marker where the reference figure has it.
    const burnArc = (r_au: number, startMs: number, sweepSec: number, phase: number) => {
        const rM = r_au * AU_M;
        const n = Math.sqrt(mu_si / (rM * rM * rM)); // rad/s
        const count = 24;
        const points: Vector2[] = [];
        const timesMs: number[] = [];
        for (let i = 0; i < count; i++) {
            const f = i / (count - 1);
            const t = phase + n * sweepSec * f;
            const c = Math.cos(t), sn = Math.sin(t);
            const local = {
                x: (u.x * c + w.x * sn) * r_au,
                y: (u.y * c + w.y * sn) * r_au,
                z: ((u.z ?? 0) * c + (w.z ?? 0) * sn) * r_au
            };
            const tMs = startMs + sweepSec * f * 1000;
            points.push(toGlobal(local, tMs));
            timesMs.push(tMs);
        }
        return { points, timesMs };
    };

    const burn1EndMs = startTime + burn1Sec * 1000;
    const coastEndMs = burn1EndMs + sol.transferTimeSec * 1000;
    const endMs = coastEndMs + burn2Sec * 1000;

    const a1 = burnArc(r1_au, startTime, burn1Sec, 0);
    const ell = transferEllipsePath(r1_au, r2_au, u, w, burn1EndMs, sol.transferTimeSec);
    const coastPts = ell.points.map((pt, i) => toGlobal(pt, ell.timesMs[i]));
    // The second burn happens half a revolution round, which is where the ellipse put the ship.
    const a2 = burnArc(r2_au, coastEndMs, burn2Sec, Math.PI);

    const fuelFor = (dv: number, m: number) =>
        params.shipMass_kg && params.shipIsp
            ? calculateFuelMass(m, Math.abs(dv), params.shipIsp)
            : Math.abs(dv) * 0.01;
    const m0 = params.shipMass_kg || 0;
    const fuel1 = fuelFor(sol.deltaV1_ms, m0);
    const fuel2 = fuelFor(sol.deltaV2_ms, Math.max(1, m0 - fuel1));

    // A raising burn pushes along the motion; a lowering one pushes against it.
    const dirOf = (dv: number): Vector2 => (dv >= 0 ? w : { x: -w.x, y: -w.y, z: -(w.z ?? 0) });
    const hostAtEnd = getGlobalState(sys, hostNode as any, endMs);
    // The velocity the ship ends with: its new circular orbit, plus the host's own motion.
    const vCirc2_au = sol.speedEnd_ms / AU_M;
    const endVel = add(hostAtEnd.v, {
        x: -u.x * 0 + w.x * vCirc2_au,
        y: -u.y * 0 + w.y * vCirc2_au,
        z: (w.z ?? 0) * vCirc2_au
    });

    const segments: TransitSegment[] = [
        {
            id: 'seg-oc-burn1', type: 'Accel',
            startTime, endTime: burn1EndMs,
            startState,
            endState: { r: a1.points[a1.points.length - 1], v: startState.v },
            hostId: frameParentId, pathPoints: a1.points, pathTimes: a1.timesMs,
            deltaV_ms: Math.abs(sol.deltaV1_ms), thrustDir: dirOf(sol.deltaV1_ms),
            warnings: [], fuelUsed_kg: fuel1
        },
        {
            id: 'seg-oc-transfer', type: 'Coast',
            startTime: burn1EndMs, endTime: coastEndMs,
            startState: { r: coastPts[0], v: startState.v },
            endState: { r: coastPts[coastPts.length - 1], v: endVel },
            hostId: frameParentId, pathPoints: coastPts, pathTimes: ell.timesMs,
            warnings: [], fuelUsed_kg: 0
        },
        {
            id: 'seg-oc-burn2', type: 'Brake',
            startTime: coastEndMs, endTime: endMs,
            startState: { r: a2.points[0], v: endVel },
            endState: { r: a2.points[a2.points.length - 1], v: endVel },
            hostId: frameParentId, pathPoints: a2.points, pathTimes: a2.timesMs,
            deltaV_ms: Math.abs(sol.deltaV2_ms), thrustDir: dirOf(sol.deltaV2_ms),
            warnings: [], fuelUsed_kg: fuel2
        }
    ];

    const rising = r2_au > r1_au;
    return {
        id: 'plan-orbitchange-' + Date.now(),
        originId: origin ? origin.id : 'unknown',
        targetId: host.id,
        startTime,
        mode: 'Economy',
        segments,
        burns: [
            { id: 'oc-burn-1', time: startTime, position: a1.points[0], deltaV_ms: Math.abs(sol.deltaV1_ms), type: 'Departure' },
            { id: 'oc-burn-2', time: coastEndMs, position: a2.points[0], deltaV_ms: Math.abs(sol.deltaV2_ms), type: 'Arrival' }
        ],
        totalDeltaV_ms: sol.totalDeltaV_ms,
        totalTime_days: totalSec / DAY_S,
        totalFuel_kg: fuel1 + fuel2,
        arrivalVelocity_ms: sol.speedEnd_ms,
        distance_au: Math.abs(r2_au - r1_au),
        isValid: true,
        maxG: params.maxG,
        accelRatio: params.accelRatio,
        brakeRatio: params.brakeRatio,
        interceptSpeed_ms: 0,
        arrivalPlacement: params.arrivalPlacement,
        arrivalDock: params.arrivalDock,
        tags: ['ORBIT CHANGE', rising ? 'RAISING ORBIT' : 'LOWERING ORBIT', 'HOHMANN'],
        planType: 'Efficiency',
        name: rising ? 'Raise Orbit' : 'Lower Orbit',
        orbitChange: {
            hostId: frameParentId,
            fromRadius_au: r1_au,
            toRadius_au: r2_au,
            u, w,
            burn1Time: startTime,
            burn2Time: coastEndMs
        }
    };
}

/**
 * THE AEROBRAKE DIP, AS SEGMENTS — the manoeuvre made drawable.
 *
 * v3.0.78 made aerobraking real: how much speed the air takes, over how many passes, how deep, and
 * what climbing back out costs. All of that went into the ship's log and none of it into the picture,
 * because there were no path points for it. So a ship that spent 615 days dipping into Mars was drawn
 * arriving and parking, and the plan's own duration did not include those days either.
 *
 * Two segments are appended: the dip itself (`Aerobrake`, purple, the drive DARK because the air is
 * doing the braking), and the circularisation burn that lifts the ship out of the corridor into the
 * orbit it actually wanted. The plan's total time grows to include them, which is the honest reading
 * of a manoeuvre it was already charging for.
 */
function appendAerobrakeSegments(opts: {
    sys: System;
    hostNode: any;
    target: CelestialBody | Barycenter;
    segments: TransitSegment[];
    arrivalTimeMs: number;
    parkingRadius_au: number;
    aeroTimeSec: number;
    aeroCircularise_ms: number;
    passes: number;
    maxG: number;
}): { endMs: number; addedSec: number } {
    const { sys, hostNode, target, segments, arrivalTimeMs, parkingRadius_au, aeroTimeSec, aeroCircularise_ms, passes, maxG } = opts;
    const last = segments[segments.length - 1];
    const pts = last?.pathPoints ?? [];
    if (!last || pts.length < 2 || !(aeroTimeSec > 0) || !(parkingRadius_au > 0)) {
        return { endMs: arrivalTimeMs, addedSec: 0 };
    }

    // The dip's depth: the top of the sensible atmosphere, which is where drag stops mattering and
    // exactly the altitude `physics/aerobrake.ts` costed the passes at.
    const bodyRadiusKm = ((target as CelestialBody).radiusKm) || 0;
    const corridorKm = brakingCorridorKm(target as CelestialBody);
    const periapsis_au = (bodyRadiusKm + corridorKm) / AU_KM;
    if (!(periapsis_au > 0) || periapsis_au >= parkingRadius_au) return { endMs: arrivalTimeMs, addedSec: 0 };

    // The plane the ship arrived on, taken from the arrival itself — same convention the parking
    // orbit uses, so the dip starts exactly where the flight ended.
    const hostAtArrival = getGlobalState(sys, hostNode, arrivalTimeMs);
    const relFinal = subtract(pts[pts.length - 1], hostAtArrival.r);
    const uMag = magnitude(relFinal);
    if (!(uMag > 1e-18)) return { endMs: arrivalTimeMs, addedSec: 0 };
    const u = { x: relFinal.x / uMag, y: relFinal.y / uMag, z: zOf(relFinal) / uMag };
    const relV = subtract(last.endState?.v ?? { x: 0, y: 0, z: 0 }, hostAtArrival.v);
    const radial = dot(relV, u);
    let w = { x: relV.x - u.x * radial, y: relV.y - u.y * radial, z: zOf(relV) - u.z * radial };
    let wMag = magnitude(w);
    if (!(wMag > 1e-18)) { w = { x: -u.y, y: u.x, z: 0 }; wMag = magnitude(w); }
    if (!(wMag > 1e-18)) return { endMs: arrivalTimeMs, addedSec: 0 };
    const wHat = { x: w.x / wMag, y: w.y / wMag, z: zOf(w) / wMag };

    const dip = aerobrakeDipPath({
        apoapsis_au: parkingRadius_au,
        periapsis_au,
        passes,
        u, w: wHat,
        startTimeMs: arrivalTimeMs,
        durationSec: aeroTimeSec
    });
    if (dip.points.length < 2) return { endMs: arrivalTimeMs, addedSec: 0 };

    const dipEndMs = arrivalTimeMs + aeroTimeSec * 1000;
    const toGlobal = (pt: Vector2, tMs: number) => add(pt, getGlobalState(sys, hostNode, tMs).r);
    segments.push({
        id: 'seg-aerobrake', type: 'Aerobrake',
        startTime: arrivalTimeMs, endTime: dipEndMs,
        startState: { r: pts[pts.length - 1], v: last.endState?.v ?? { x: 0, y: 0, z: 0 } },
        endState: { r: toGlobal(dip.points[dip.points.length - 1], dipEndMs), v: last.endState?.v ?? { x: 0, y: 0, z: 0 } },
        hostId: target.id,
        pathPoints: dip.points.map((pt, i) => toGlobal(pt, dip.timesMs[i])),
        pathTimes: dip.timesMs,
        warnings: passes > dip.drawnPasses
            ? [`Aerobraking: ${passes} passes (${dip.drawnPasses} drawn)`]
            : [`Aerobraking: ${passes} pass${passes === 1 ? '' : 'es'}`],
        fuelUsed_kg: 0
    });

    let endMs = dipEndMs;
    if (aeroCircularise_ms > 1) {
        // Climbing out of the corridor into the orbit the ship actually wanted. A real burn, so it is
        // drawn as one and the drive lights for it.
        const g0 = 9.81;
        const burnSec = Math.max(1, aeroCircularise_ms / Math.max(0.01, maxG * g0));
        const circEndMs = dipEndMs + burnSec * 1000;
        const count = 24;
        const cp: Vector2[] = [];
        const ct: number[] = [];
        const rM = parkingRadius_au * AU_M;
        const muT = (getNodeMass(sys, target) || 0) * G;
        const n = muT > 0 ? Math.sqrt(muT / (rM * rM * rM)) : 0;
        for (let i = 0; i < count; i++) {
            const f = i / (count - 1);
            const th = n * burnSec * f;
            const c = Math.cos(th), sn2 = Math.sin(th);
            const tMs = dipEndMs + burnSec * f * 1000;
            cp.push(toGlobal({
                x: (u.x * c + wHat.x * sn2) * parkingRadius_au,
                y: (u.y * c + wHat.y * sn2) * parkingRadius_au,
                z: (u.z * c + wHat.z * sn2) * parkingRadius_au
            }, tMs));
            ct.push(tMs);
        }
        segments.push({
            id: 'seg-aero-circularise', type: 'Brake',
            startTime: dipEndMs, endTime: circEndMs,
            startState: { r: cp[0], v: last.endState?.v ?? { x: 0, y: 0, z: 0 } },
            endState: { r: cp[cp.length - 1], v: last.endState?.v ?? { x: 0, y: 0, z: 0 } },
            hostId: target.id, pathPoints: cp, pathTimes: ct,
            deltaV_ms: aeroCircularise_ms, thrustDir: wHat,
            warnings: ['Circularise'], fuelUsed_kg: 0
        });
        endMs = circEndMs;
    }
    return { endMs, addedSec: (endMs - arrivalTimeMs) / 1000 };
}

function calculateLambertPlan(
    sys: System,
    origin: CelestialBody | Barycenter | undefined,
    target: CelestialBody | Barycenter,
    root: CelestialBody | Barycenter,
    startTime: number,
    startState: StateVector,
    durationSec: number,
    mu: number,
    params: { 
        shipMass_kg?: number; 
        shipIsp?: number; 
        brakeAtArrival?: boolean; 
        interceptSpeed_ms: number; 
        accelRatio: number; 
        brakeRatio: number; 
        maxG: number; 
        initialState?: StateVector; 
        parkingOrbitRadius_au?: number; 
        arrivalPlacement?: string; 
        arrivalDock?: { structureId: string; level?: 'anchor' | 'lo' | 'mo' | 'geo' | 'counterweight' }; // G53 phase 5
        extraTags?: string[];
        aerobrake?: { allowed: boolean; limit_kms: number; }; 
    },
    frameParentId: string | null // NEW: Context for path reconstruction
): TransitPlan | null {
    const arrivalTime = startTime + durationSec * 1000;
    const tags: string[] = params.extraTags || []; 
    
    // Target State (Local or Global based on context)
    const targetState = frameParentId 
        ? getLocalState(sys, target, frameParentId, arrivalTime)
        : getGlobalState(sys, target, arrivalTime);

    // FIX: Only shift the aim position if we are targeting a generic orbit (lo/mo/ho).
    // If targeting a specific node (id), we MUST hit that node's actual position.
    // `geo` belongs here too. Leaving it out meant a geostationary arrival aimed at the planet's
    // CENTRE while the sampler parked the ship a full geostationary radius away — 42,241 km at Earth.
    const isGenericOrbit = params.arrivalPlacement === 'lo' || params.arrivalPlacement === 'mo'
        || params.arrivalPlacement === 'ho' || params.arrivalPlacement === 'geo';
    const targetAimPos = isGenericOrbit 
        ? resolveAimPositionAtRadius(
            startState.r,
            targetState.r,
            targetState.v,
            params.parkingOrbitRadius_au
          )
        : targetState.r;

    // SOLVE IN METERS
    const r1_m = { x: startState.r.x * AU_M, y: startState.r.y * AU_M };
    const r2_m = { x: targetAimPos.x * AU_M, y: targetAimPos.y * AU_M };
    
    const result_m = solveBestLambert(r1_m, r2_m, durationSec, mu, startState.v, targetState.v);
    
    if (!result_m) return null;

    // Convert back to AU/s for rest of logic
    const v1_au_s = { x: result_m.v1.x / AU_M, y: result_m.v1.y / AU_M };
    const v2_au_s = { x: result_m.v2.x / AU_M, y: result_m.v2.y / AU_M };
    const result = { v1: v1_au_s, v2: v2_au_s };
    
    const mu_au = mu / Math.pow(AU_M, 3); // Re-calculate for integrator
    
    const startVel = startState.v;
    const dv1_req_au_s = magnitude(subtract(result.v1, startVel));
    let dv2_req_au_s = 0;
    let aerobraking_dv_ms = 0;
    const arrivalRelVec_au_s = subtract(result.v2, targetState.v);
    const targetMassKg = getNodeMass(sys, target);
    const desiredArrival = resolveDesiredArrivalRelative(
        arrivalRelVec_au_s,
        targetState.r,
        targetState.v,
        targetAimPos,
        targetMassKg,
        params.parkingOrbitRadius_au,
        params.brakeAtArrival,
        params.interceptSpeed_ms
    );
    const desiredArrivalRelVec_au_s = desiredArrival.desiredRelVec_au_s;
    let dv2Req_ms = desiredArrival.dv2Required_ms;
    // AEROBRAKING — one shared judgement (physics/aerobrake.ts), not a flat subtraction. It knows
    // whether the ship is actually entering an orbit here, what this particular sky can deliver, and
    // what climbing back out to the wanted orbit costs. See that module for why each part exists.
    let aeroCircularise_ms = 0;
    let aeroTimeSec = 0;
    let aeroNote = '';
    let aeroPasses = 0;
    if (params.brakeAtArrival && params.aerobrake?.allowed) {
        const aero = aerobrakeSolution({
            target: target as CelestialBody,
            shipLimitKms: params.aerobrake.limit_kms,
            dv2Required_ms: dv2Req_ms,
            parkingRadiusAU: params.parkingOrbitRadius_au,
            isOrbitalArrival: isOrbitalArrivalPlacement(params.arrivalPlacement)
        });
        if (aero.applied_ms > 0) {
            aerobraking_dv_ms = aero.applied_ms;
            dv2Req_ms = aero.remaining_ms + aero.circularise_ms;
            aeroCircularise_ms = aero.circularise_ms;
            aeroTimeSec = aero.timeSec;
            aeroNote = aero.note;
            aeroPasses = aero.passes;
            tags.push(aero.circularise_ms <= 1 ? 'AEROCAPTURE' : 'AEROBRAKE+CIRCULARISE');
        }
    }
    dv2_req_au_s = dv2Req_ms / AU_M;
    
    // Physics & Fuel
    const g0 = 9.81;
    const accel_mps2 = (params.maxG || 0.1) * g0;
    const dv1_applied_mps = dv1_req_au_s * AU_M;
    // The direction the drive points during the departure burn (G46 / owner, 2026-08-26: "pointing
    // in direction of desired vector"). Same vector the magnitude above is taken from.
    const dv1_dir = unitOf(subtract(result.v1, startVel));
    
    let m0 = 0; 
    let useRocketEq = false;
    if (params.shipMass_kg && params.shipIsp && params.shipIsp > 0) {
        useRocketEq = true;
        m0 = params.shipMass_kg;
    }

    let accelTime_sec = dv1_applied_mps / accel_mps2;
    let m1 = m0;
    let fuel1 = 0;
    if (useRocketEq) {
        fuel1 = calculateFuelMass(m0, dv1_applied_mps, params.shipIsp!);
        m1 = m0 - fuel1;
    } else {
        fuel1 = Infinity; // No engine/Isp → can't move; the plan is infeasible, not "cheap".
    }

    let dv2_applied_au_s = 0;
    if (params.brakeAtArrival) {
        dv2_applied_au_s = dv2_req_au_s;
    } else {
        const brakeTimeTarget = durationSec * params.brakeRatio;
        let brakeAccel_mps2 = accel_mps2;
        if (useRocketEq && m1 > 1) {
            brakeAccel_mps2 = accel_mps2 * (m0 / m1);
        }
        dv2_applied_au_s = (brakeAccel_mps2 * brakeTimeTarget) / AU_M;
        if (dv2_applied_au_s > dv2_req_au_s) dv2_applied_au_s = dv2_req_au_s;
    }

    const dv2_applied_mps = dv2_applied_au_s * AU_M;
    let brakeAccel_mps2 = accel_mps2;
    if (useRocketEq && m1 > 1) {
        brakeAccel_mps2 = accel_mps2 * (m0 / m1);
    }
    let brakeTime_sec = dv2_applied_mps / brakeAccel_mps2;
    let fuel2 = 0;
    if (useRocketEq) {
        fuel2 = calculateFuelMass(m1, dv2_applied_mps, params.shipIsp!);
    } else {
        fuel2 = Infinity;
    }

    const totalBurnTime = accelTime_sec + brakeTime_sec;
    if (totalBurnTime > durationSec) {
        const remainingForBrake = Math.max(0, durationSec - accelTime_sec);
        const dv2_capped_mps = Math.min(dv2_applied_mps, remainingForBrake * brakeAccel_mps2);
        dv2_applied_au_s = dv2_capped_mps / AU_M;
        brakeTime_sec = dv2_capped_mps / brakeAccel_mps2;
        fuel2 = useRocketEq ? calculateFuelMass(m1, dv2_capped_mps, params.shipIsp!) : Infinity;
    }

    const totalDeltaV_ms = dv1_applied_mps + dv2_applied_mps;
    if (params.maxG > 2.0 && !tags.includes('HIGH-G')) tags.push('HIGH-G');

    // Visual Path Generation
    const displayAccelTimeSec = accelTime_sec;
    const displayBrakeTimeSec = brakeTime_sec;
    const accelEndTime = startTime + displayAccelTimeSec * 1000;
    const brakeStartTime = arrivalTime - displayBrakeTimeSec * 1000;
    // G46: THE PHASES OWN THE SAMPLING, not one uniform grid sliced afterwards. A sub-hour burn
    // inside a three-year transfer used to catch no samples at all and borrow two coast points 48
    // hours apart, which drew it at 1,366 km/s. Each phase now asks for the points it needs over
    // its own duration; the coast keeps the two-day cadence it always had.
    const coastStartSec = Math.min(displayAccelTimeSec, durationSec);
    const coastEndSec = Math.max(coastStartSec, durationSec - displayBrakeTimeSec);
    let schedule = params.costOnly
        ? buildPathSchedule([{ key: 'accel', startSec: 0, endSec: coastStartSec },
                             { key: 'coast', startSec: coastStartSec, endSec: coastEndSec },
                             { key: 'brake', startSec: coastEndSec, endSec: durationSec }], 24)
        : buildPathSchedule([{ key: 'accel', startSec: 0, endSec: coastStartSec },
                             { key: 'coast', startSec: coastStartSec, endSec: coastEndSec },
                             { key: 'brake', startSec: coastEndSec, endSec: durationSec }]);
    
    // 5. N-Body & Path Integration
    // Belts/rings are DISTRIBUTED mass — their `massKg` is a debris-density proxy, not gravitational
    // mass, with no single point to pull toward — so exclude them as point-mass perturbers (mirrors
    // gravity-assist). Otherwise a belt would inject a bogus point-gravity tug toward a ring location.
    // NOTE: the DISPLAYED path is integrated 2-body to match the (2-body) Lambert solution. Feeding the
    // full n-body perturber set here made the integrated path drift off the Lambert target, and the linear
    // drift-correction then flattened the conic into a near-straight chord (the "straight transit lines"
    // bug). Proper fix = solve Lambert against the n-body field; banked. Until then: draw what we solved.
    // The RK4 is still capped at the old two-day march across the coast, so the coast trajectory is
    // the one that always shipped; the burn windows simply ask for points inside it.
    const frameParentNode = frameParentId ? sys.nodes.find(n => n.id === frameParentId) : null;
    // Compose the local arc onto the frame parent's own motion, EACH SAMPLE AT ITS OWN TIME.
    const toGlobal = (pts: Vector2[], timesSec: number[]): Vector2[] => {
        if (!frameParentNode) return pts;
        return pts.map((pt, i) => {
            const tAbs = startTime + (timesSec[i] ?? durationSec) * 1000;
            return add(pt, getGlobalState(sys, frameParentNode, tAbs).r);
        });
    };
    const runIntegration = (sch: PathSchedule) => integrateBallisticPathAtTimes(
        startState.r, result.v1, sch.timesSec, mu_au,
        { targetEndPos: targetAimPos, maxStepSec: PREFERRED_SPACING_SEC }
    );

    let integration = runIntegration(schedule);
    let localPath = integration.points;
    let fullPath = toGlobal(localPath, schedule.timesSec);

    // PUT THE POINTS WHERE THE PATH BENDS. Time-uniform sampling is right for a coast and wrong for
    // anything that swings close to a body, because angular rate peaks at closest approach. Measured
    // before this loop existed: an interplanetary coast turned at most 2.24 degrees per sample and
    // needs no help, while a Jupiter-local transfer turned 56.8 degrees and drew a visible corner.
    // Refinement is measured on the GLOBAL path, because that is the line the eye follows.
    if (!params.costOnly) {
        for (let round = 0; round < 4; round++) {
            const refined = refineScheduleByTurn(schedule, fullPath);
            if (!refined) break;
            schedule = refined;
            integration = runIntegration(schedule);
            localPath = integration.points;
            fullPath = toGlobal(localPath, schedule.timesSec);
        }
    }
    const totalDriftM = integration.drift_au * AU_M;

    const burns: BurnPoint[] = [];
    let correctionFuel_kg = 0;
    let correctionDV_ms = 0;

    // Correction Logic: If drift > 100km, we show it as a series of correction burns.
    if (totalDriftM > 100000) {
        const tcmLabel = params.maxG > 2.0 ? 'HIGH-G TRAJECTORY CORRECTION MANEUVER (TCM)' : 'TRAJECTORY CORRECTION MANEUVER (TCM)';
        tags.push(tcmLabel);
        
        const numCorrections = 3;
        for (let i = 1; i <= numCorrections; i++) {
            const fraction = i / (numCorrections + 1);
            const tOffset = durationSec * fraction;
            const burnTime = startTime + tOffset * 1000;
            
            // Index BY TIME, not by fraction-of-count: the samples are deliberately uneven now.
            const idx = indexAtTimeSec(schedule.timesSec, tOffset);
            const localPos = localPath[idx];
            const parentNode = frameParentId ? sys.nodes.find(fn => fn.id === frameParentId) : null;
            const parentState = parentNode ? getGlobalState(sys, parentNode, burnTime) : null;
            const globalPos = parentState ? add(localPos, parentState.r) : localPos;

            const dv_ms = 10;
            burns.push({
                id: `correction-${Date.now()}-${i}`,
                time: burnTime,
                position: globalPos,
                deltaV_ms: dv_ms, 
                type: 'Correction'
            });

            correctionDV_ms += dv_ms;
            if (useRocketEq && m1 > 1) {
                // Approximate mass at this point as half-way between m1 and m_final
                const m_mid = (m1 + (m1 - fuel2)) / 2;
                correctionFuel_kg += calculateFuelMass(m_mid, dv_ms, params.shipIsp!);
            } else {
                correctionFuel_kg += dv_ms * 0.01;
            }
        }
    }
    

    // Each phase takes the points that were generated FOR IT, with the times they were generated at.
    // The stubs that used to live here — 'if the burn caught fewer than two samples, hand it the
    // first two of the whole path' — are gone with the cause: no phase can come up short now, because
    // no phase is sharing anyone else's grid. Reinstating them is what the speed gate in
    // pathGeometry.spec.ts exists to catch.
    const accelSlice = slicePhase(schedule, fullPath, 'accel', startTime);
    const coastSlice = slicePhase(schedule, fullPath, 'coast', startTime);
    const brakeSlice = slicePhase(schedule, fullPath, 'brake', startTime);
    const accelPoints = accelSlice.points;
    const coastPoints = coastSlice.points;
    const brakePoints = brakeSlice.points;

    let distance_au = 0; // Estimation
    if (fullPath.length > 1) distance_au = distanceAU(fullPath[0], fullPath[fullPath.length-1]); // Simplified

    const segments: TransitSegment[] = [];
    
    // Global Final State for chaining
    // If local, targetState is local. Need Global.
    const globalTargetState = getGlobalState(sys, target, arrivalTime);
    const parentNode = frameParentId ? sys.nodes.find(n => n.id === frameParentId) : null;
    const parentGlobalState = parentNode ? getGlobalState(sys, parentNode, arrivalTime) : null;
    const arrivalGlobalV = frameParentId && parentGlobalState ? add(result.v2, parentGlobalState.v) : result.v2;

    const relArrivalBeforeBrake_au_s = subtract(arrivalGlobalV, globalTargetState.v);
    const deltaNeeded_au_s = subtract(desiredArrivalRelVec_au_s, relArrivalBeforeBrake_au_s);
    const deltaNeeded_ms = magnitude(deltaNeeded_au_s) * AU_M;
    const applyFrac = deltaNeeded_ms > 1e-9 ? Math.max(0, Math.min(1, dv2_applied_mps / deltaNeeded_ms)) : 1;
    const relFinal_au_s = {
        x: relArrivalBeforeBrake_au_s.x + deltaNeeded_au_s.x * applyFrac,
        y: relArrivalBeforeBrake_au_s.y + deltaNeeded_au_s.y * applyFrac,
        z: zOf(relArrivalBeforeBrake_au_s) + zOf(deltaNeeded_au_s) * applyFrac
    };
    const globalAimPos = frameParentId && parentGlobalState
        ? add(targetAimPos, parentGlobalState.r)
        : targetAimPos;
    const finalState: StateVector = {
        r: globalAimPos,
        v: add(globalTargetState.v, relFinal_au_s)
    };

    if (accelPoints.length > 1) segments.push({
        id: 'seg-accel', type: 'Accel', startTime, endTime: accelEndTime,
        startState, endState: {r:accelPoints[accelPoints.length-1], v:{x:0,y:0}}, 
        hostId: root.id, pathPoints: accelPoints, pathTimes: accelSlice.timesMs, warnings: [], fuelUsed_kg: fuel1,
        deltaV_ms: dv1_applied_mps, thrustDir: dv1_dir
    });
    
    if (coastPoints.length > 1) segments.push({
        id: 'seg-coast', type: 'Coast', startTime: accelEndTime, endTime: brakeStartTime,
        startState: {r:coastPoints[0], v:{x:0,y:0}}, endState: {r:coastPoints[coastPoints.length-1], v:{x:0,y:0}},
        hostId: root.id, pathPoints: coastPoints, pathTimes: coastSlice.timesMs, warnings: [], fuelUsed_kg: 0
    });

    if (brakePoints.length > 1) segments.push({
        id: 'seg-brake', type: 'Brake', startTime: brakeStartTime, endTime: arrivalTime,
        startState: {r:brakePoints[0], v:{x:0,y:0}}, endState: finalState,
        hostId: root.id, pathPoints: brakePoints, pathTimes: brakeSlice.timesMs, warnings: !params.brakeAtArrival ? ['Flyby'] : [], fuelUsed_kg: fuel2,
        deltaV_ms: dv2_applied_mps, thrustDir: unitOf(deltaNeeded_au_s)
    });

    // Ensure last segment has final state
    if (segments.length > 0) segments[segments.length-1].endState = finalState;

    // The aerobrake dip and its circularisation, when the air did some of the work. These EXTEND the
    // journey: the plan was already charging for the passes and saying so in the ship's log, while
    // reporting a duration that stopped at the moment the ship reached the planet.
    let aeroExtraSec = 0;
    if (aeroTimeSec > 0 && frameParentId !== target.id) {
        const r = appendAerobrakeSegments({
            sys, hostNode: target, target, segments,
            arrivalTimeMs: arrivalTime,
            parkingRadius_au: params.parkingOrbitRadius_au || 0,
            aeroTimeSec, aeroCircularise_ms: aeroCircularise_ms, passes: aeroPasses,
            maxG: params.maxG
        });
        aeroExtraSec = r.addedSec;
    }

    const arrivalVelocity_ms = magnitude(relFinal_au_s) * AU_M;

    return {
        id: 'plan-' + Date.now(),
        originId: origin ? origin.id : 'unknown',
        targetId: target.id,
        startTime: startTime,
        mode: 'Economy',
        segments,
        burns, 
        totalDeltaV_ms: totalDeltaV_ms + correctionDV_ms,
        totalTime_days: (durationSec + aeroExtraSec) / DAY_S,
        totalFuel_kg: fuel1 + fuel2 + correctionFuel_kg,
        distance_au: distance_au,
        isValid: true,
        maxG: params.maxG,
        accelRatio: displayAccelTimeSec / durationSec,
        brakeRatio: displayBrakeTimeSec / durationSec,
        interceptSpeed_ms: params.interceptSpeed_ms,
        arrivalVelocity_ms: arrivalVelocity_ms,
        arrivalPlacement: params.arrivalPlacement,
        arrivalDock: params.arrivalDock,
        tags: tags,
        aerobrakingDeltaV_ms: aerobraking_dv_ms,
        aeroCirculariseDeltaV_ms: aeroCircularise_ms,
        aeroTimeSec: aeroTimeSec,
        aeroNote: aeroNote,
        initialDelay_days: (params as any).initialDelay_days
    };
}

function calculateFastPlan(
    sys: System,
    origin: CelestialBody | Barycenter | undefined,
    target: CelestialBody | Barycenter,
    frameNode: CelestialBody | Barycenter,
    startTime: number,
    startState: StateVector,
    params: {
        maxG: number;
        shipMass_kg?: number;
        shipIsp?: number;
        brakeAtArrival?: boolean;
        initialState?: StateVector;
        accelRatio: number;
        brakeRatio: number;
        interceptSpeed_ms: number;
        arrivalPlacement?: string;
        arrivalDock?: { structureId: string; level?: 'anchor' | 'lo' | 'mo' | 'geo' | 'counterweight' }; // G53 phase 5
        parkingOrbitRadius_au?: number;
        aerobrake?: { allowed: boolean; limit_kms: number; };
        initialDelay_days?: number;
        extraTags?: string[];
    }
): TransitPlan | null {
    const accel = params.maxG * 9.81;
    if (accel <= 0) return null;

    const tags: string[] = params.extraTags || [];
    if (params.maxG > 2.0) tags.push('HIGH-G');

    const targetStartPos = getLocalState(sys, target, frameNode.id, startTime).r;
    const initialDist_m = distanceAU(startState.r, targetStartPos) * AU_M;

    let ar = Math.max(0.001, params.accelRatio);
    let br = params.brakeAtArrival ? ar : Math.max(0.001, params.brakeRatio);
    if (ar + br > 0.98) {
        const s = 0.98 / (ar + br);
        ar *= s;
        br *= s;
    }

    const useRocketEq = !!(params.shipMass_kg && params.shipIsp && params.shipIsp > 0);
    
    // For pure kinematic geometry, we assume constant acceleration to establish the baseline time.
    // We will calculate the actual fuel penalty later. This ensures time smoothly tracks the sliders.
    const K = ar - 0.5 * ar * ar - 0.5 * br * br;
    if (K <= 0) return null;

    // Iteratively find intercept time based on moving target
    let t_est = Math.sqrt(initialDist_m / (accel * K));
    for (let loops = 0; loops < 15; loops++) {
        const targetPos = getLocalState(sys, target, frameNode.id, startTime + t_est * 1000).r;
        const dist_m = distanceAU(startState.r, targetPos) * AU_M;
        const next = Math.sqrt(Math.max(1, dist_m) / (accel * K));
        t_est = 0.5 * t_est + 0.5 * next;
    }

    const totalTime = t_est;
    const endTime = startTime + totalTime * 1000;
    const targetEndState = getLocalState(sys, target, frameNode.id, endTime);
    const rStart = startState.r;

    const muLocal = getNodeMass(sys, frameNode) * G;
    if (muLocal <= 0) return null;
    const muLocalAu = muLocal / Math.pow(AU_M, 3);

    // `geo` belongs here too. Leaving it out meant a geostationary arrival aimed at the planet's
    // CENTRE while the sampler parked the ship a full geostationary radius away — 42,241 km at Earth.
    const isGenericOrbit = params.arrivalPlacement === 'lo' || params.arrivalPlacement === 'mo'
        || params.arrivalPlacement === 'ho' || params.arrivalPlacement === 'geo';
    const rEnd = isGenericOrbit 
        ? resolveAimPositionAtRadius(
            startState.r,
            targetEndState.r,
            targetEndState.v,
            params.parkingOrbitRadius_au
          )
        : targetEndState.r;

    // For torch-ships, we assume a direct kinematic path.
    // We abandon the Lambert solver here as high-thrust transfers effectively ignore 
    // Keplerian orbits, and the solver can produce divergent artifacts (e.g. 2000c) 
    // when forced into a ballistic box.
    const dx = rEnd.x - rStart.x;
    const dy = rEnd.y - rStart.y;
    const dz = zOf(rEnd) - zOf(rStart);
    const dMag = Math.hypot(dx, dy, dz) || 1;
    const dvGuessAuS = (accel * totalTime * ar) / AU_M;
    
    // Initial Burn (v1) adds the required velocity boost in the direction of the target.
    let v1 = {
        x: startState.v.x + (dx / dMag) * dvGuessAuS,
        y: startState.v.y + (dy / dMag) * dvGuessAuS,
        z: zOf(startState.v) + (dz / dMag) * dvGuessAuS
    };
    
    // Arrival Velocity (v2) before braking. 
    // In a pure kinematic straight-line model, this is the same as v1.
    let v2 = {
        x: v1.x,
        y: v1.y,
        z: zOf(v1)
    };

    if (!Number.isFinite(v1.x) || !Number.isFinite(v1.y)) return null;
    
    // Speed of Light cap
    const v1_mag_ms = magnitude(v1) * AU_M;
    if (v1_mag_ms > 150000000) {
        const scale = 150000000 / v1_mag_ms;
        v1.x *= scale;
        v1.y *= scale;
    }

    if (!Number.isFinite(v2.x) || !Number.isFinite(v2.y)) v2 = { x: targetEndState.v.x, y: targetEndState.v.y, z: zOf(targetEndState.v) };

    let accelTime = totalTime * ar;
    let brakeTime = totalTime * br;
    let coastTime = Math.max(0, totalTime - accelTime - brakeTime);

    const dv1 = magnitude(subtract(v1, startState.v)) * AU_M;
    let fuel1 = 0;
    let m1 = params.shipMass_kg || 0;
    if (useRocketEq) {
        fuel1 = calculateFuelMass(params.shipMass_kg!, dv1, params.shipIsp!);
        m1 = Math.max(1, params.shipMass_kg! - fuel1);
    }

    const targetMassKg = getNodeMass(sys, target);
    const desiredArrival = resolveDesiredArrivalRelative(
        subtract(v2, targetEndState.v),
        targetEndState.r,
        targetEndState.v,
        rEnd,
        targetMassKg,
        params.parkingOrbitRadius_au,
        params.brakeAtArrival,
        params.interceptSpeed_ms
    );
    
    const desiredArrivalRelVec_au_s = desiredArrival.desiredRelVec_au_s;
    const dv2Required_mps = desiredArrival.dv2Required_ms;
    
    // We apply the FULL required braking DV so the UI accurately displays the cost of the trip,
    // even if it exceeds fuel constraints. Svelte handles the "Insufficient Fuel" warning natively.
    let dv2 = dv2Required_mps;
    
    let aerobraking_dv_ms = 0;
    let aeroCircularise_ms = 0;
    let aeroTimeSec = 0;
    let aeroNote = '';
    let aeroPasses = 0;
    if (params.brakeAtArrival && params.aerobrake?.allowed) {
        // Same judgement the efficiency families use — see physics/aerobrake.ts. It used to be a
        // second copy of a flat subtraction here, and the two could have drifted.
        const aero = aerobrakeSolution({
            target: target as CelestialBody,
            shipLimitKms: params.aerobrake.limit_kms,
            dv2Required_ms: dv2,
            parkingRadiusAU: params.parkingOrbitRadius_au,
            isOrbitalArrival: isOrbitalArrivalPlacement(params.arrivalPlacement)
        });
        if (aero.applied_ms > 0) {
            aerobraking_dv_ms = aero.applied_ms;
            dv2 = aero.remaining_ms + aero.circularise_ms;
            aeroCircularise_ms = aero.circularise_ms;
            aeroTimeSec = aero.timeSec;
            aeroNote = aero.note;
            aeroPasses = aero.passes;
            tags.push(aero.circularise_ms <= 1 ? 'AEROCAPTURE' : 'AEROBRAKE+CIRCULARISE');
        }
    }

    const totalDeltaV_ms = dv1 + dv2;
    
    let fuel2 = 0;
    let fuelEst = 0;
    if (useRocketEq) {
        fuel2 = calculateFuelMass(m1, dv2, params.shipIsp!);
        fuelEst = fuel1 + fuel2;
    } else {
        fuelEst = totalDeltaV_ms * 0.01;
        fuel1 = fuelEst * (dv1 / Math.max(1, totalDeltaV_ms));
        fuel2 = fuelEst * (dv2 / Math.max(1, totalDeltaV_ms));
    }

    const arrivalRelBeforeBrakeAu = subtract(v2, targetEndState.v);
    const needVecAu = subtract(desiredArrivalRelVec_au_s, arrivalRelBeforeBrakeAu);
    const needMs = magnitude(needVecAu) * AU_M;
    const applyFrac = needMs > 1e-9 ? Math.max(0, Math.min(1, dv2 / needMs)) : 1;
    const relFinalAu = {
        x: arrivalRelBeforeBrakeAu.x + needVecAu.x * applyFrac,
        y: arrivalRelBeforeBrakeAu.y + needVecAu.y * applyFrac,
        z: zOf(arrivalRelBeforeBrakeAu) + zOf(needVecAu) * applyFrac
    };
    const arrivalVelocity_ms = magnitude(relFinalAu) * AU_M;

    const accelEndTime = startTime + accelTime * 1000;
    const brakeStartTime = startTime + (accelTime + coastTime) * 1000;

    const segments: TransitSegment[] = [];
    // G46: the phases own the sampling here too. A torch plan has always drawn at a two-hour cadence,
    // so that is the spacing each phase asks for and an ordinary Direct Burn is unchanged; what
    // changes is that the burns get points generated FOR them, with their own times, instead of being
    // carved out of a shared grid by `makePoints` and its two-point fallback.
    const FAST_SPACING_SEC = 3600 * 2;
    const fastPhases = [
        { key: 'accel', startSec: 0, endSec: accelTime, spacingSec: FAST_SPACING_SEC },
        { key: 'coast', startSec: accelTime, endSec: accelTime + coastTime, spacingSec: FAST_SPACING_SEC },
        { key: 'brake', startSec: accelTime + coastTime, endSec: totalTime, spacingSec: FAST_SPACING_SEC }
    ];
    let schedule = buildPathSchedule(fastPhases, params.costOnly ? 24 : DEFAULT_PATH_BUDGET);

    // 2-body displayed path (matches the solved trajectory) — see the note in calculateLambertPlan: the
    // n-body perturbers here drove the straight-line bug via the drift-correction. Banked: n-body-aware solve.
    const runFastIntegration = (sch: PathSchedule) => integrateBallisticPathAtTimes(
        rStart, v1, sch.timesSec, muLocalAu, { targetEndPos: rEnd, maxStepSec: FAST_SPACING_SEC }
    );
    let integration = runFastIntegration(schedule);
    let rawLocalPath = integration.points;
    const totalDriftM = integration.drift_au * AU_M;

    const burns: BurnPoint[] = [];
    let correctionFuel_kg = 0;
    let correctionDV_ms = 0;

    if (totalDriftM > 100000) {
        tags.push('TRAJECTORY CORRECTION MANEUVER (TCM)');
        
        const numCorrections = 3;
        for (let i = 1; i <= numCorrections; i++) {
            const fraction = i / (numCorrections + 1);
            const tOffset = totalTime * fraction;
            const burnTime = startTime + tOffset * 1000;
            
            const idx = indexAtTimeSec(schedule.timesSec, tOffset);
            const localPos = rawLocalPath[idx];
            const parentState = getGlobalState(sys, frameNode, burnTime);
            const globalPos = add(localPos, parentState.r);

            const dv_ms = 10;
            burns.push({
                id: `correction-fast-${Date.now()}-${i}`,
                time: burnTime,
                position: globalPos,
                deltaV_ms: dv_ms, 
                type: 'Correction'
            });

            correctionDV_ms += dv_ms;
            if (useRocketEq && m1 > 1) {
                correctionFuel_kg += calculateFuelMass(m1, dv_ms, params.shipIsp!);
            } else {
                correctionFuel_kg += dv_ms * 0.01;
            }
        }
    }

    // Non-finite guards, then compose onto the frame parent AT EACH SAMPLE'S OWN TIME.
    const sanitiseLocal = (raw: Vector2[]): Vector2[] => {
        const out: Vector2[] = [];
        let lastFinite: Vector2 = { ...rStart };
        for (const pt of raw) {
            if (Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
                lastFinite = pt;
                out.push(pt);
            } else {
                out.push({ ...lastFinite });
            }
        }
        return out;
    };
    const toGlobalFast = (pts: Vector2[], timesSec: number[]): Vector2[] => {
        const out: Vector2[] = [];
        let lastGlobalFinite = add(rStart, getGlobalState(sys, frameNode, startTime).r);
        for (let i = 0; i < pts.length; i++) {
            const tAbs = startTime + (timesSec[i] ?? totalTime) * 1000;
            const g = add(pts[i], getGlobalState(sys, frameNode, tAbs).r);
            if (Number.isFinite(g.x) && Number.isFinite(g.y)) {
                lastGlobalFinite = g;
                out.push(g);
            } else {
                out.push({ ...lastGlobalFinite });
            }
        }
        return out;
    };

    let localPath = sanitiseLocal(rawLocalPath);
    let fullPath = toGlobalFast(localPath, schedule.timesSec);

    // Put the points where the path bends — see calculateLambertPlan for the measurement that made
    // this necessary. A torch plan crossing open space never triggers it; one swinging past a planet does.
    if (!params.costOnly) {
        for (let round = 0; round < 4; round++) {
            const refined = refineScheduleByTurn(schedule, fullPath);
            if (!refined) break;
            schedule = refined;
            integration = runFastIntegration(schedule);
            rawLocalPath = integration.points;
            localPath = sanitiseLocal(rawLocalPath);
            fullPath = toGlobalFast(localPath, schedule.timesSec);
        }
    }

    const accelSlice = slicePhase(schedule, fullPath, 'accel', startTime);
    const coastSlice = slicePhase(schedule, fullPath, 'coast', startTime);
    const brakeSlice = slicePhase(schedule, fullPath, 'brake', startTime);

    if (accelTime > 0) {
        segments.push({
            id: 'seg-accel',
            type: 'Accel',
            startTime,
            endTime: accelEndTime,
            startState,
            endState: { r: { x: 0, y: 0 }, v: { x: 0, y: 0 } },
            hostId: frameNode.id,
            pathPoints: accelSlice.points,
            pathTimes: accelSlice.timesMs,
            deltaV_ms: dv1,
            thrustDir: unitOf(subtract(v1, startState.v)),
            warnings: params.maxG > 2 ? ['High G'] : [],
            fuelUsed_kg: fuel1
        });
    }
    if (coastTime > 0) {
        segments.push({
            id: 'seg-coast',
            type: 'Coast',
            startTime: accelEndTime,
            endTime: brakeStartTime,
            startState: { r: { x: 0, y: 0 }, v: { x: 0, y: 0 } },
            endState: { r: { x: 0, y: 0 }, v: { x: 0, y: 0 } },
            hostId: frameNode.id,
            pathPoints: coastSlice.points,
            pathTimes: coastSlice.timesMs,
            warnings: [],
            fuelUsed_kg: 0
        });
    }

    const globalTarget = getGlobalState(sys, target, endTime);
    const parentAtEnd = getGlobalState(sys, frameNode, endTime);
    const arrivalGlobalPreBrake = add(v2, parentAtEnd.v);
    const relArrivalBeforeBrake = subtract(arrivalGlobalPreBrake, globalTarget.v);
    const needVecGlobal = subtract(desiredArrivalRelVec_au_s, relArrivalBeforeBrake);
    const needGlobalMs = magnitude(needVecGlobal) * AU_M;
    const applyFracGlobal = needGlobalMs > 1e-9 ? Math.max(0, Math.min(1, dv2 / needGlobalMs)) : 1;
    const relFinalGlobal = {
        x: relArrivalBeforeBrake.x + needVecGlobal.x * applyFracGlobal,
        y: relArrivalBeforeBrake.y + needVecGlobal.y * applyFracGlobal,
        z: zOf(relArrivalBeforeBrake) + zOf(needVecGlobal) * applyFracGlobal
    };
    const finalVelocity = {
        x: globalTarget.v.x + relFinalGlobal.x,
        y: globalTarget.v.y + relFinalGlobal.y,
        z: zOf(globalTarget.v) + zOf(relFinalGlobal)
    };
    const globalAim = add(rEnd, parentAtEnd.r);

    if (brakeTime > 0) {
        segments.push({
            id: 'seg-brake',
            type: 'Brake',
            startTime: brakeStartTime,
            endTime,
            startState: { r: { x: 0, y: 0 }, v: { x: 0, y: 0 } },
            endState: { r: globalAim, v: finalVelocity },
            hostId: frameNode.id,
            pathPoints: brakeSlice.points,
            pathTimes: brakeSlice.timesMs,
            deltaV_ms: dv2,
            thrustDir: unitOf(needVecGlobal),
            warnings: [
                ...(params.maxG > 2 ? ['High G'] : []),
                ...(!params.brakeAtArrival ? ['Flyby'] : [])
            ],
            fuelUsed_kg: fuel2
        });
    } else if (segments.length > 0) {
        const lastSeg = segments[segments.length - 1];
        lastSeg.endState = { r: globalAim, v: finalVelocity };
        if (!params.brakeAtArrival) {
            lastSeg.warnings = [...(lastSeg.warnings || []), 'Flyby'];
        }
    }

    // The aerobrake dip and its circularisation — see the note in calculateLambertPlan.
    let aeroExtraSecFast = 0;
    if (aeroTimeSec > 0 && frameNode.id !== target.id) {
        const r = appendAerobrakeSegments({
            sys, hostNode: target, target, segments,
            arrivalTimeMs: endTime,
            parkingRadius_au: params.parkingOrbitRadius_au || 0,
            aeroTimeSec, aeroCircularise_ms: aeroCircularise_ms, passes: aeroPasses,
            maxG: params.maxG
        });
        aeroExtraSecFast = r.addedSec;
    }

    return {
        id: 'plan-fast-' + Date.now(),
        originId: origin ? origin.id : 'unknown',
        targetId: target.id,
        startTime,
        mode: 'Fast',
        segments,
        burns,
        totalDeltaV_ms: totalDeltaV_ms + correctionDV_ms,
        totalTime_days: (totalTime + aeroExtraSecFast) / DAY_S,
        totalFuel_kg: fuelEst + correctionFuel_kg,
        isValid: true,
        maxG: params.maxG,
        accelRatio: ar,
        brakeRatio: br,
        interceptSpeed_ms: params.interceptSpeed_ms,
        arrivalVelocity_ms,
        distance_au: distanceAU(fullPath[0], fullPath[fullPath.length - 1]),
        arrivalPlacement: params.arrivalPlacement,
        arrivalDock: params.arrivalDock,
        tags: [...tags],
        aerobrakingDeltaV_ms: aerobraking_dv_ms,
        aeroCirculariseDeltaV_ms: aeroCircularise_ms,
        aeroTimeSec: aeroTimeSec,
        aeroNote: aeroNote,
        initialDelay_days: params.initialDelay_days
    };
}
