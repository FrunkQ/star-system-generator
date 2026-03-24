import type { System, CelestialBody, Barycenter } from '../types';
import type { TransitPlan, TransitSegment, TransitMode, Vector2, StateVector } from './types';
import { solveLambert, distanceAU, subtract, magnitude, integrateBallisticPath, add } from './math';
import { getGlobalState, getLocalState, calculateFuelMass } from './physics';
import { calculateAssistPlan } from './assist';
import { AU_KM, G } from '../constants';

const AU_M = AU_KM * 1000;
const DAY_S = 86400;

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
  let d = Math.hypot(dx, dy);
  if (!Number.isFinite(d) || d < 1e-12) {
    // Fallback: aim "behind" target velocity direction
    dx = -targetVel.x;
    dy = -targetVel.y;
    d = Math.hypot(dx, dy);
  }
  if (!Number.isFinite(d) || d < 1e-12) {
    dx = 1;
    dy = 0;
    d = 1;
  }
  return {
    x: targetPos.x + (dx / d) * radiusAu,
    y: targetPos.y + (dy / d) * radiusAu
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
    if (desiredMs <= 0 || relMag <= 1e-12) return { desiredRelVec_au_s: { x: 0, y: 0 }, dv2Required_ms: relMag * AU_M };
    const desiredAuS = desiredMs / AU_M;
    const desired = {
      x: (arrivalRelVec_au_s.x / relMag) * desiredAuS,
      y: (arrivalRelVec_au_s.y / relMag) * desiredAuS
    };
    return { desiredRelVec_au_s: desired, dv2Required_ms: Math.max(0, (relMag - desiredAuS) * AU_M) };
  }

  if (!parkingOrbitRadius_au || parkingOrbitRadius_au <= 0 || targetMassKg <= 0) {
    return { desiredRelVec_au_s: { x: 0, y: 0 }, dv2Required_ms: relMag * AU_M };
  }

  const rVec = subtract(targetAimPos, targetPos);
  let rAu = magnitude(rVec);
  if (!Number.isFinite(rAu) || rAu <= 1e-12) rAu = parkingOrbitRadius_au;
  const rM = Math.max(1, rAu * AU_M);
  const vCirc_ms = Math.sqrt((targetMassKg * G) / rM);
  const vCirc_au_s = vCirc_ms / AU_M;

  const rx = rVec.x / Math.max(1e-12, rAu);
  const ry = rVec.y / Math.max(1e-12, rAu);
  const tA = { x: -ry * vCirc_au_s, y: rx * vCirc_au_s };
  const tB = { x: ry * vCirc_au_s, y: -rx * vCirc_au_s };

  const dA = magnitude(subtract(arrivalRelVec_au_s, tA));
  const dB = magnitude(subtract(arrivalRelVec_au_s, tB));
  const desired = dA <= dB ? tA : tB;
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
      targetOffsetAnomaly?: number; 
      arrivalPlacement?: string;
      aerobrake?: { allowed: boolean; limit_kms: number; }; // NEW
      initialDelay_days?: number;
  }
): TransitPlan[] {
  const plans: TransitPlan[] = [];

  // 1. Find Nodes
  const origin = sys.nodes.find(n => n.id === originId);
  const target = sys.nodes.find(n => n.id === targetId);
  const root = sys.nodes.find(n => n.parentId === null);
  
  if (!target || !root) return [];

  const getNodeMass = (node: any): number => {
      if (!node) return 0;
      
      // 1. Check for massKg
      if (node.massKg) return node.massKg;
      
      // 2. Check for massSol (Star template property)
      if (node.massSol) return node.massSol * SOLAR_MASS_KG;

      // 3. Barycenter logic
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
      
      // 4. Star role fallback
      if (node.roleHint === 'star') return SOLAR_MASS_KG;

      return 0;
  };

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
  let frameMu = getNodeMass(root) * G;

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
          const m = getNodeMass(parentNode);
          if (m > 0) frameMu = m * G;
      }
  }

  console.log(`[TransitPlanner] Debug: Root mass=${getNodeMass(root)}, Frame=${frameParentId || 'Global'}, FrameMu=${frameMu}`);

  // SANITIZATION: Check for "Impossible Orbit" (Sun Gravity around a Planet)
  let effectiveOrigin = origin;
  if (origin && origin.parentId && origin.orbit) {
      const parent = sys.nodes.find(n => n.id === origin.parentId);
      if (parent) {
          const parentMass = getNodeMass(parent);
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
      const isLagrange = ['l1', 'l2', 'l3', 'l4', 'l5'].includes(params.arrivalPlacement);

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
          
          // For Virtual Lagrange Points
          if (isLagrange && target.orbit) {
              const lagrangeId = params.arrivalPlacement;
              
              // Lagrange points are co-orbital with the 'target' (host planet) 
              // around its parent (usually the Star).
              effectiveTarget = {
                  ...target,
                  orbit: {
                      ...target.orbit,
                      elements: {
                          ...target.orbit.elements,
                          // L3-L5 use Anomaly offsets (180, +60, -60)
                          M0_rad: target.orbit.elements.M0_rad + (params.targetOffsetAnomaly || 0),
                          // L1-L2 use Radius offsets (Radial inner/outer)
                          a_AU: params.parkingOrbitRadius_au || target.orbit.elements.a_AU
                      }
                  },
                  // Since L-points have no mass, we force the solver into "Rendezvous" mode
                  kind: 'construct' as any, 
                  massKg: 0
              };
              // Clear parking radius from params so solver doesn't try to "orbit" the mass-less L-point.
              forcedParkingRadiusAu = undefined; 
          }
      }
  }

  // Update params with potentially forced radius
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
      if (frameParentId) {
          startState = getLocalState(sys, effectiveOrigin, frameParentId, startTime);
      } else {
          startState = getGlobalState(sys, effectiveOrigin, startTime);
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
  
  const isLagrange = ['l1', 'l2', 'l3', 'l4', 'l5'].includes(params.arrivalPlacement || '');
  if (isLagrange && effectiveTarget.orbit) {
      r2 = params.parkingOrbitRadius_au || effectiveTarget.orbit.elements.a_AU;
  } else if (effectiveTarget.orbit && effectiveTarget.orbit.elements) {
      r2 = effectiveTarget.orbit.elements.a_AU;
  } else {
      const globalTargetEnd = getGlobalState(sys, effectiveTarget, startTime + 1000000);
      r2 = magnitude(globalTargetEnd.r);
  }
      
  const r1_m = r1 * AU_M;
  const r2_m = r2 * AU_M;
  const t_hohmann_sec = Math.PI * Math.sqrt(Math.pow(r1_m + r2_m, 3) / (8 * frameMu));
  
  console.log(`[TransitPlanner] Debug: startPos=${startPos.x.toFixed(4)},${startPos.y.toFixed(4)} | r1=${r1.toFixed(2)} AU | r2=${r2.toFixed(2)} AU | t_hohmann=${(t_hohmann_sec/86400).toFixed(1)}d`);

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
      const r1_m = { x: variantStartState.r.x * AU_M, y: variantStartState.r.y * AU_M };
      const r2_m = { x: targetAimAtT.x * AU_M, y: targetAimAtT.y * AU_M };
      const result_m = solveBestLambert(r1_m, r2_m, t_curr, frameMu, variantStartState.v, targetAtT.v);
      if (!result_m) return null;

      const result = {
          v1: { x: result_m.v1.x / AU_M, y: result_m.v1.y / AU_M },
          v2: { x: result_m.v2.x / AU_M, y: result_m.v2.y / AU_M }
      };

      const dv1_req_ms = magnitude(subtract(result.v1, variantStartState.v)) * AU_M;
      const arrivalRelVec = subtract(result.v2, targetAtT.v);
      const targetMassKg = (effectiveTarget.kind === 'body'
          ? (effectiveTarget as CelestialBody).massKg
          : (effectiveTarget as Barycenter).effectiveMassKg) || 0;
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

  // 1. Most Efficient (Hohmann-like + delayed launch window search)
  let mostEfficientPlan: TransitPlan | null = null;
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
  const directParams = { ...finalParams, initialState: startState };
  const directPlan = calculateFastPlan(sys, effectiveOrigin, effectiveTarget, solverRoot, startTime, startState, directParams);
  if (directPlan) {
      directPlan.planType = 'Speed';
      directPlan.name = 'Direct Burn';
      plans.push(directPlan);
  }

  // 4. Gravity Assist (Deep Space) - V2 Feature
  const dist_start_au = distanceAU(getGlobalState(sys, effectiveOrigin!, startTime).r, getGlobalState(sys, effectiveTarget, startTime).r);
  if (dist_start_au > 0.5 && !frameParentId) { // Only for interplanetary
      const assistPlan = calculateAssistPlan(sys, effectiveOrigin, effectiveTarget, root, startTime, getGlobalState(sys, effectiveOrigin!, startTime), {
          maxG: finalParams.maxG,
          shipMass_kg: finalParams.shipMass_kg,
          shipIsp: finalParams.shipIsp
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
      
      if (p.hiddenReason) {
          console.log(`[TransitPlanner] Debug: Plan '${p.name}' hidden because: ${p.hiddenReason} (DV: ${p.totalDeltaV_ms.toFixed(0)}m/s, Time: ${p.totalTime_days.toFixed(1)}d)`);
      }
  });

  return plans.sort((a, b) => a.totalFuel_kg - b.totalFuel_kg);
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
        extraTags?: string[];
        aerobrake?: { allowed: boolean; limit_kms: number; }; 
    },
    frameParentId: string | null // NEW: Context for path reconstruction
): TransitPlan | null {
    const arrivalTime = startTime + durationSec * 1000;
    
    // Target State (Local or Global based on context)
    const targetState = frameParentId 
        ? getLocalState(sys, target, frameParentId, arrivalTime)
        : getGlobalState(sys, target, arrivalTime);

    // FIX: Only shift the aim position if we are targeting a generic orbit (lo/mo/ho).
    // If targeting a specific node (id), we MUST hit that node's actual position.
    const isGenericOrbit = params.arrivalPlacement === 'lo' || params.arrivalPlacement === 'mo' || params.arrivalPlacement === 'ho';
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
    const targetMassKg = (target.kind === 'body' ? (target as CelestialBody).massKg : (target as Barycenter).effectiveMassKg) || 0;
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
    if (params.brakeAtArrival && params.aerobrake && params.aerobrake.allowed) {
        const targetBody = target as CelestialBody;
        const hasAtmosphere = !!(targetBody.atmosphere && targetBody.atmosphere.pressure_bar && targetBody.atmosphere.pressure_bar > 0.001);
        if (hasAtmosphere) {
            const aeroMax = params.aerobrake.limit_kms * 1000;
            const aeroApplied = Math.min(dv2Req_ms, aeroMax);
            aerobraking_dv_ms = aeroApplied;
            dv2Req_ms = Math.max(0, dv2Req_ms - aeroApplied);
            if (aeroApplied > 0) {
                params.extraTags = params.extraTags || [];
                params.extraTags.push(dv2Req_ms <= 1 ? 'AEROCAPTURE' : 'PARTIAL-AERO');
            }
        }
    }
    dv2_req_au_s = dv2Req_ms / AU_M;
    
    // Physics & Fuel
    const g0 = 9.81;
    const accel_mps2 = (params.maxG || 0.1) * g0;
    const dv1_applied_mps = dv1_req_au_s * AU_M;
    
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
        fuel1 = dv1_applied_mps * 0.01;
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
        fuel2 = dv2_applied_mps * 0.01;
    }

    const totalBurnTime = accelTime_sec + brakeTime_sec;
    if (totalBurnTime > durationSec) {
        const remainingForBrake = Math.max(0, durationSec - accelTime_sec);
        const dv2_capped_mps = Math.min(dv2_applied_mps, remainingForBrake * brakeAccel_mps2);
        dv2_applied_au_s = dv2_capped_mps / AU_M;
        brakeTime_sec = dv2_capped_mps / brakeAccel_mps2;
        fuel2 = useRocketEq ? calculateFuelMass(m1, dv2_capped_mps, params.shipIsp!) : dv2_capped_mps * 0.01;
    }

    const totalDeltaV_ms = dv1_applied_mps + dv2_applied_mps;
    const tags: string[] = params.extraTags || []; 
    if (params.maxG > 2.0) tags.push('HIGH-G');

    // Visual Path Generation
    const displayAccelTimeSec = accelTime_sec;
    const displayBrakeTimeSec = brakeTime_sec;
    const accelEndTime = startTime + displayAccelTimeSec * 1000;
    const brakeStartTime = arrivalTime - displayBrakeTimeSec * 1000;
    const totalPoints = Math.min(5000, Math.max(300, Math.ceil(durationSec / (86400 * 2))));
    
    // Integrate in Local Frame
    const localPath = integrateBallisticPath(startState.r, result.v1, durationSec, mu_au, totalPoints, targetAimPos);
    
    // Reconstruct Global Path if Local Frame Used
    // We need to fetch parent position at each timestep and add it
    let fullPath = localPath;
    if (frameParentId) {
        const parentNode = sys.nodes.find(n => n.id === frameParentId);
        if (parentNode) {
            fullPath = localPath.map((pt, i) => {
                const dt_step = localPath.length > 1 ? durationSec / (localPath.length - 1) : durationSec;
                const tAbs = startTime + i * dt_step * 1000;
                const parentState = getGlobalState(sys, parentNode, tAbs); 
                return add(pt, parentState.r);
            });
        }
    }

    const dt_step = fullPath.length > 1 ? durationSec / (fullPath.length - 1) : durationSec;
    let accelPoints: Vector2[] = [];
    let coastPoints: Vector2[] = [];
    let brakePoints: Vector2[] = [];

    for(let i=0; i<fullPath.length; i++) {
         const absTime = startTime + i * dt_step * 1000;
         const pt = fullPath[i];
         if (absTime < accelEndTime) accelPoints.push(pt);
         else if (absTime < brakeStartTime) {
             if (coastPoints.length === 0 && accelPoints.length > 0) coastPoints.push(accelPoints[accelPoints.length-1]);
             coastPoints.push(pt);
         } else {
             if (brakePoints.length === 0) {
                 if (coastPoints.length > 0) brakePoints.push(coastPoints[coastPoints.length-1]);
                 else if (accelPoints.length > 0) brakePoints.push(accelPoints[accelPoints.length-1]);
             }
             brakePoints.push(pt);
         }
    }

    // If burn windows are shorter than path sampling cadence, ensure visible phase stubs.
    if (accelTime_sec > 0 && accelPoints.length < 2 && fullPath.length > 1) {
        accelPoints = [fullPath[0], fullPath[Math.min(1, fullPath.length - 1)]];
    }
    if (brakeTime_sec > 0 && brakePoints.length < 2 && fullPath.length > 1) {
        brakePoints = [fullPath[Math.max(0, fullPath.length - 2)], fullPath[fullPath.length - 1]];
    }

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
        y: relArrivalBeforeBrake_au_s.y + deltaNeeded_au_s.y * applyFrac
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
        hostId: root.id, pathPoints: accelPoints, warnings: [], fuelUsed_kg: fuel1
    });
    
    if (coastPoints.length > 1) segments.push({
        id: 'seg-coast', type: 'Coast', startTime: accelEndTime, endTime: brakeStartTime,
        startState: {r:coastPoints[0], v:{x:0,y:0}}, endState: {r:coastPoints[coastPoints.length-1], v:{x:0,y:0}},
        hostId: root.id, pathPoints: coastPoints, warnings: [], fuelUsed_kg: 0
    });

    if (brakePoints.length > 1) segments.push({
        id: 'seg-brake', type: 'Brake', startTime: brakeStartTime, endTime: arrivalTime,
        startState: {r:brakePoints[0], v:{x:0,y:0}}, endState: finalState,
        hostId: root.id, pathPoints: brakePoints, warnings: !params.brakeAtArrival ? ['Flyby'] : [], fuelUsed_kg: fuel2
    });

    // Ensure last segment has final state
    if (segments.length > 0) segments[segments.length-1].endState = finalState;

    const arrivalVelocity_ms = magnitude(relFinal_au_s) * AU_M;

    return {
        id: 'plan-' + Date.now(),
        originId: origin ? origin.id : 'unknown',
        targetId: target.id,
        startTime: startTime,
        mode: 'Economy',
        segments,
        burns: [], 
        totalDeltaV_ms: totalDeltaV_ms,
        totalTime_days: durationSec / DAY_S,
        totalFuel_kg: fuel1 + fuel2,
        distance_au: distance_au,
        isValid: true,
        maxG: params.maxG,
        accelRatio: displayAccelTimeSec / durationSec,
        brakeRatio: displayBrakeTimeSec / durationSec,
        interceptSpeed_ms: params.interceptSpeed_ms,
        arrivalVelocity_ms: arrivalVelocity_ms,
        arrivalPlacement: params.arrivalPlacement,
        tags: tags,
        aerobrakingDeltaV_ms: aerobraking_dv_ms,
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
        parkingOrbitRadius_au?: number;
        aerobrake?: { allowed: boolean; limit_kms: number; };
        initialDelay_days?: number;
    }
): TransitPlan | null {
    const accel = params.maxG * 9.81;
    if (accel <= 0) return null;

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

    const muLocal = (((frameNode.kind === 'body')
        ? (frameNode as CelestialBody).massKg
        : (frameNode as Barycenter).effectiveMassKg) || 0) * G;
    if (muLocal <= 0) return null;
    const muLocalAu = muLocal / Math.pow(AU_M, 3);

    const isGenericOrbit = params.arrivalPlacement === 'lo' || params.arrivalPlacement === 'mo' || params.arrivalPlacement === 'ho';
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
    const dMag = Math.hypot(dx, dy) || 1;
    const dvGuessAuS = (accel * totalTime * ar) / AU_M;
    
    // Initial Burn (v1) adds the required velocity boost in the direction of the target.
    let v1 = {
        x: startState.v.x + (dx / dMag) * dvGuessAuS,
        y: startState.v.y + (dy / dMag) * dvGuessAuS
    };
    
    // Arrival Velocity (v2) before braking. 
    // In a pure kinematic straight-line model, this is the same as v1.
    let v2 = {
        x: v1.x,
        y: v1.y
    };

    if (!Number.isFinite(v1.x) || !Number.isFinite(v1.y)) return null;
    
    // Speed of Light cap
    const v1_mag_ms = magnitude(v1) * AU_M;
    if (v1_mag_ms > 150000000) {
        const scale = 150000000 / v1_mag_ms;
        v1.x *= scale;
        v1.y *= scale;
    }

    if (!Number.isFinite(v2.x) || !Number.isFinite(v2.y)) v2 = { ...targetEndState.v };

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

    const targetMassKg = (target.kind === 'body'
        ? (target as CelestialBody).massKg
        : (target as Barycenter).effectiveMassKg) || 0;
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
    if (params.brakeAtArrival && params.aerobrake?.allowed) {
        const targetBody = target as CelestialBody;
        const hasAtmo = !!(targetBody.atmosphere && targetBody.atmosphere.pressure_bar && targetBody.atmosphere.pressure_bar > 0.001);
        if (hasAtmo) {
            const limit_mps = params.aerobrake.limit_kms * 1000;
            if (dv2 <= limit_mps) {
                aerobraking_dv_ms = dv2;
                dv2 = 0;
            } else {
                aerobraking_dv_ms = limit_mps;
                dv2 -= limit_mps;
            }
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
        y: arrivalRelBeforeBrakeAu.y + needVecAu.y * applyFrac
    };
    const arrivalVelocity_ms = magnitude(relFinalAu) * AU_M;

    const accelEndTime = startTime + accelTime * 1000;
    const brakeStartTime = startTime + (accelTime + coastTime) * 1000;

    const segments: TransitSegment[] = [];
    const sampleCount = Math.min(3000, Math.max(240, Math.ceil(totalTime / (3600 * 2))));
    const rawLocalPath = integrateBallisticPath(rStart, v1, totalTime, muLocalAu, sampleCount, rEnd);
    const localPath: Vector2[] = [];
    let lastFinite: Vector2 = { ...rStart };
    for (const pt of rawLocalPath) {
        if (Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
            lastFinite = pt;
            localPath.push(pt);
        } else {
            localPath.push({ ...lastFinite });
        }
    }
    const dtStep = localPath.length > 1 ? totalTime / (localPath.length - 1) : totalTime;
    const fullPath: Vector2[] = [];
    let lastGlobalFinite = add(rStart, getGlobalState(sys, frameNode, startTime).r);
    for (let i = 0; i < localPath.length; i++) {
        const pt = localPath[i];
        const tAbs = startTime + i * dtStep * 1000;
        const parentState = getGlobalState(sys, frameNode, tAbs);
        const g = add(pt, parentState.r);
        if (Number.isFinite(g.x) && Number.isFinite(g.y)) {
            lastGlobalFinite = g;
            fullPath.push(g);
        } else {
            fullPath.push({ ...lastGlobalFinite });
        }
    }
    const makePoints = (t0: number, t1: number): Vector2[] => {
        const pts: Vector2[] = [];
        for (let i = 0; i < fullPath.length; i++) {
            const tAbs = startTime + i * dtStep * 1000;
            if (tAbs >= t0 && tAbs <= t1) pts.push(fullPath[i]);
        }
        if (pts.length < 2) {
            const p0 = fullPath[Math.max(0, Math.floor((t0 - startTime) / 1000 / Math.max(1e-9, dtStep)))];
            const p1 = fullPath[Math.min(fullPath.length - 1, Math.ceil((t1 - startTime) / 1000 / Math.max(1e-9, dtStep)))];
            if (p0) pts.push(p0);
            if (p1 && p1 !== p0) pts.push(p1);
        }
        return pts;
    };

    if (accelTime > 0) {
        segments.push({
            id: 'seg-accel',
            type: 'Accel',
            startTime,
            endTime: accelEndTime,
            startState,
            endState: { r: { x: 0, y: 0 }, v: { x: 0, y: 0 } },
            hostId: frameNode.id,
            pathPoints: makePoints(startTime, accelEndTime),
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
            pathPoints: makePoints(accelEndTime, brakeStartTime),
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
        y: relArrivalBeforeBrake.y + needVecGlobal.y * applyFracGlobal
    };
    const finalVelocity = {
        x: globalTarget.v.x + relFinalGlobal.x,
        y: globalTarget.v.y + relFinalGlobal.y
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
            pathPoints: makePoints(brakeStartTime, endTime),
            warnings: params.maxG > 2 ? ['High G'] : [],
            fuelUsed_kg: fuel2
        });
    } else if (segments.length > 0) {
        segments[segments.length - 1].endState = { r: globalAim, v: finalVelocity };
    }

    return {
        id: 'plan-fast-' + Date.now(),
        originId: origin ? origin.id : 'unknown',
        targetId: target.id,
        startTime,
        mode: 'Fast',
        segments,
        burns: [],
        totalDeltaV_ms,
        totalTime_days: totalTime / DAY_S,
        totalFuel_kg: fuelEst,
        isValid: true,
        maxG: params.maxG,
        accelRatio: ar,
        brakeRatio: br,
        interceptSpeed_ms: params.interceptSpeed_ms,
        arrivalVelocity_ms,
        distance_au: distanceAU(fullPath[0], fullPath[fullPath.length - 1]),
        arrivalPlacement: params.arrivalPlacement,
        aerobrakingDeltaV_ms: aerobraking_dv_ms,
        initialDelay_days: params.initialDelay_days
    };
}
