import type { System, CelestialBody, Barycenter } from '../types';
import type { TransitPlan, TransitSegment, TransitMode, Vector2, StateVector } from './types';
import { solveLambert, distanceAU, subtract, magnitude, integrateBallisticPath, add } from './math';
import { getGlobalState, getLocalState, calculateFuelMass } from './physics';
import { calculateAssistPlan } from './assist';
import { AU_KM, G } from '../constants';

const AU_M = AU_KM * 1000;
const DAY_S = 86400;

function solveBestLambert(
  r1_m: Vector2,
  r2_m: Vector2,
  dt_sec: number,
  mu: number,
  startVel_au_s?: Vector2,
  targetVel_au_s?: Vector2
): { v1: Vector2; v2: Vector2 } | null {
  const candidates: { v1: Vector2; v2: Vector2 }[] = [];

  const short = solveLambert(r1_m, r2_m, dt_sec, mu, { longWay: false });
  if (short) candidates.push(short);
  const long = solveLambert(r1_m, r2_m, dt_sec, mu, { longWay: true });
  if (long) candidates.push(long);
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
      shipIsp?: number; 
      brakeAtArrival?: boolean; 
      brakingRatio?: number; 
      initialState?: StateVector; 
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

  // SANITIZATION: Check for "Impossible Orbit" (Sun Gravity around a Planet)
  let effectiveOrigin = origin;
  if (origin && origin.parentId && origin.orbit) {
      const parent = sys.nodes.find(n => n.id === origin.parentId);
      if (parent && (parent.kind === 'body' || parent.kind === 'barycenter')) {
          const parentMass = (parent as CelestialBody).massKg || (parent as Barycenter).effectiveMassKg || 0;
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
  
  if (params.arrivalPlacement) {
      const placementNode = sys.nodes.find(n => n.id === params.arrivalPlacement);
      if (placementNode) {
          // If the user selected a specific node (Moon/Station) as placement, 
          // we treat THAT as the true intercept target.
          effectiveTarget = placementNode;
      } else if (target.orbit) {
          // Virtual Offset (L4/L5)
          if (params.targetOffsetAnomaly) {
              effectiveTarget = {
                  ...target,
                  orbit: {
                      ...target.orbit,
                      elements: {
                          ...target.orbit.elements,
                          M0_rad: target.orbit.elements.M0_rad + params.targetOffsetAnomaly
                      }
                  }
              };
          }
      }
  }

  // 2. Determine Reference Frame (Global vs Local)
  let frameParentId: string | null = null;
  let frameMu = (root.kind === 'body' ? (root as CelestialBody).massKg : (root as Barycenter).effectiveMassKg || 0) * G;

  if (effectiveOrigin && effectiveOrigin.parentId && effectiveTarget.parentId === effectiveOrigin.parentId) {
      // Sibling Transfer (e.g. Moon -> Moon around Earth)
      frameParentId = effectiveOrigin.parentId;
  } else if (effectiveOrigin && effectiveTarget.id === effectiveOrigin.parentId) {
      // Child -> Parent (Moon -> Earth)
      frameParentId = effectiveTarget.id;
  } else if (effectiveOrigin && effectiveOrigin.id === effectiveTarget.parentId) {
      // Parent -> Child (Earth -> Moon)
      frameParentId = effectiveOrigin.id;
  }

  // Get Physics Data for Frame
  if (frameParentId) {
      const parentNode = sys.nodes.find(n => n.id === frameParentId);
      if (parentNode) {
          const m = (parentNode.kind === 'body' ? (parentNode as CelestialBody).massKg : (parentNode as Barycenter).effectiveMassKg) || 0;
          if (m > 0) frameMu = m * G;
          // console.log(`[TransitPlanner] Using Local Frame: ${parentNode.name}`);
      } else {
          frameParentId = null; // Fallback to Global
      }
  }

  // 3. Get Origin State (Local or Global)
  let startState: StateVector;
  if (params.initialState) {
      startState = params.initialState;
      // Note: If passed initialState is global but we want local, we'd need to convert it.
      // Assuming initialState provided by UI is already appropriate context OR Global.
      // Ideally UI should provide global, and we convert if needed.
      // For now, let's assume getGlobalState logic handles the conversion below.
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
  
  // 4. Baselines
  const r1 = magnitude(startPos);
  const r2 = (frameParentId && effectiveTarget.parentId === frameParentId && effectiveTarget.orbit) 
      ? effectiveTarget.orbit.elements.a_AU 
      : r1; // Approx
      
  const r1_m = r1 * AU_M;
  const r2_m = r2 * AU_M;
  const t_hohmann_sec = Math.PI * Math.sqrt(Math.pow(r1_m + r2_m, 3) / (8 * frameMu));
  
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
          if (frameParentId) {
              return getLocalState(sys, effectiveTarget, frameParentId, tAbs);
          }
          return getGlobalState(sys, effectiveTarget, tAbs);
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
          const r1_m = { x: variantStartState.r.x * AU_M, y: variantStartState.r.y * AU_M };
          const r2_m = { x: targetAtT.r.x * AU_M, y: targetAtT.r.y * AU_M };
          const result_m = solveBestLambert(r1_m, r2_m, t_curr, frameMu, variantStartState.v, targetAtT.v);
          if (!result_m) return null;

          const result = {
              v1: { x: result_m.v1.x / AU_M, y: result_m.v1.y / AU_M },
              v2: { x: result_m.v2.x / AU_M, y: result_m.v2.y / AU_M }
          };

          const dv1_req_ms = magnitude(subtract(result.v1, variantStartState.v)) * AU_M;
          const relArrivalMs = magnitude(subtract(result.v2, targetAtT.v)) * AU_M;
          const desiredArrivalRelMs = params.brakeAtArrival ? 0 : Math.max(0, params.interceptSpeed_ms || 0);
          const dv2_req_ms = Math.max(0, relArrivalMs - desiredArrivalRelMs);

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
          ...params, 
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
  const maxSearchDelayDays = 1000;
  const coarseStepDays = 10;
  const searchByFuel = !!(params.shipMass_kg && params.shipIsp && params.shipIsp > 0);

  const canSearchDelayed = !!effectiveOrigin && !params.initialState;
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
              fixedAccelRatio: 0.05,
              fixedBrakeRatio: 0.05
          });
          if (!candidate) continue;

          const score = searchByFuel ? candidate.totalFuel_kg : candidate.totalDeltaV_ms;
          if (score < bestScore) {
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
          fixedAccelRatio: 0.05,
          fixedBrakeRatio: 0.05
      });
  }
  if (mostEfficientPlan) plans.push(mostEfficientPlan);

  // 2. Balanced Alternative
  const balancedPlan = solveVariant('Balanced', 'Assist', {
      t_min: t_hohmann_sec * 0.5,
      t_max: t_hohmann_sec * 1.2,
      fixedAccelRatio: params.accelRatio,
      fixedBrakeRatio: params.brakeRatio
  });
  if (balancedPlan) {
      if (balancedPlan.tags && balancedPlan.tags.includes('SUNDIVER')) {
          balancedPlan.planType = 'Assist'; 
          balancedPlan.name = 'Sundiver';
      } else {
          balancedPlan.name = 'Efficient Alt'; 
      }
      plans.push(balancedPlan);
  }
  
  // 3. Direct Burn (Profile-first kinematic solver)
  const directStart = frameParentId ? getLocalState(sys, effectiveOrigin!, frameParentId, startTime) : getGlobalState(sys, effectiveOrigin!, startTime);
  const solverRoot = frameParentId ? sys.nodes.find(n => n.id === frameParentId)! : root;
  const directParams = { ...params, initialState: directStart };
  const directPlan = calculateFastPlan(sys, effectiveOrigin, effectiveTarget, solverRoot, startTime, directStart, directParams);
  if (directPlan) {
      directPlan.planType = 'Speed';
      directPlan.name = 'Direct Burn';
      plans.push(directPlan);
  }

  // 4. Gravity Assist (Deep Space) - V2 Feature
  const dist_start_au = distanceAU(getGlobalState(sys, effectiveOrigin!, startTime).r, getGlobalState(sys, effectiveTarget, startTime).r);
  if (dist_start_au > 0.5 && !frameParentId) { // Only for interplanetary
      const assistPlan = calculateAssistPlan(sys, effectiveOrigin, effectiveTarget, root, startTime, getGlobalState(sys, effectiveOrigin!, startTime), {
          maxG: params.maxG,
          shipMass_kg: params.shipMass_kg,
          shipIsp: params.shipIsp
      });
      if (assistPlan) {
          assistPlan.planType = 'Complex';
          plans.push(assistPlan);
      }
  }

  // Sort & Clean
  const baselinePlan = plans.find(p => p.name === 'Most Efficient') || plans.find(p => p.planType === 'Efficiency');
  const baselineTime = baselinePlan ? baselinePlan.totalTime_days : 0;

  plans.forEach(p => {
      if (p.planType !== 'Speed' && p.totalDeltaV_ms > 100000) {
          p.hiddenReason = "Impractical Delta-V (>100 km/s)";
      }
      else if (baselineTime > 0 && p.totalTime_days > baselineTime * 5) {
          p.hiddenReason = "Impractical Duration (>5x optimal)";
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

    // SOLVE IN METERS
    const r1_m = { x: startState.r.x * AU_M, y: startState.r.y * AU_M };
    const r2_m = { x: targetState.r.x * AU_M, y: targetState.r.y * AU_M };
    
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
    const rawArrivalRelSpeed_mps = magnitude(arrivalRelVec_au_s) * AU_M;
    const desiredArrivalRelSpeed_mps = params.brakeAtArrival ? 0 : Math.max(0, params.interceptSpeed_ms || 0);
    
    // Oberth / Arrival Logic
    if (params.parkingOrbitRadius_au && params.parkingOrbitRadius_au > 0) {
        const targetMassKg = (target.kind === 'body' ? (target as CelestialBody).massKg : (target as Barycenter).effectiveMassKg) || 0;
        if (targetMassKg > 0) {
            const mu_target = targetMassKg * G;
            const V_inf_mps = rawArrivalRelSpeed_mps;
            const Rp_m = params.parkingOrbitRadius_au * AU_M;
            const V_p = Math.sqrt(V_inf_mps * V_inf_mps + 2 * mu_target / Rp_m);
            const V_c = Math.sqrt(mu_target / Rp_m);
            let dv_capture_mps = Math.abs(V_p - V_c);

            const targetBody = target as CelestialBody;
            const hasAtmosphere = targetBody.atmosphere && targetBody.atmosphere.pressure_bar && targetBody.atmosphere.pressure_bar > 0.001;
            
            if (hasAtmosphere && params.brakeAtArrival && params.aerobrake && params.aerobrake.allowed) {
                const limit_mps = params.aerobrake.limit_kms * 1000;
                if (V_p <= limit_mps) {
                    aerobraking_dv_ms = dv_capture_mps;
                    dv_capture_mps = 0;
                    params.extraTags = params.extraTags || [];
                    params.extraTags.push('AEROCAPTURE');
                } else {
                    const reduction = V_p - limit_mps;
                    if (reduction < dv_capture_mps) {
                        aerobraking_dv_ms = dv_capture_mps - reduction;
                        dv_capture_mps = reduction;
                        params.extraTags = params.extraTags || [];
                        params.extraTags.push('PARTIAL-AERO');
                    }
                }
            }
            dv2_req_au_s = Math.max(0, (dv_capture_mps - desiredArrivalRelSpeed_mps) / AU_M);
        } else {
            dv2_req_au_s = Math.max(0, (rawArrivalRelSpeed_mps - desiredArrivalRelSpeed_mps) / AU_M);
        }
    } else {
        dv2_req_au_s = Math.max(0, (rawArrivalRelSpeed_mps - desiredArrivalRelSpeed_mps) / AU_M);
    }
    
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
    const localPath = integrateBallisticPath(startState.r, result.v1, durationSec, mu_au, totalPoints, targetState.r);
    
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
    const relArrivalBeforeBrake_mps = magnitude(relArrivalBeforeBrake_au_s) * AU_M;
    const relArrivalAfterBrake_mps = Math.max(
        desiredArrivalRelSpeed_mps,
        relArrivalBeforeBrake_mps - dv2_applied_mps
    );
    const relMag_au_s = magnitude(relArrivalBeforeBrake_au_s);
    const relUnit = relArrivalBeforeBrake_mps > 1e-6 && relMag_au_s > 0
        ? { x: relArrivalBeforeBrake_au_s.x / relMag_au_s, y: relArrivalBeforeBrake_au_s.y / relMag_au_s }
        : { x: 0, y: 0 };
    const relFinal_au_s = {
        x: relUnit.x * (relArrivalAfterBrake_mps / AU_M),
        y: relUnit.y * (relArrivalAfterBrake_mps / AU_M)
    };
    const finalState: StateVector = {
        r: globalTargetState.r,
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

    const arrivalVelocity_ms = relArrivalAfterBrake_mps;

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
    let massBrakeFactor = 1;
    if (params.brakeAtArrival && useRocketEq) {
        const dvProbe = accel * 1000;
        const fuelProbe = calculateFuelMass(params.shipMass_kg!, dvProbe, params.shipIsp!);
        const m1Probe = Math.max(1, params.shipMass_kg! - fuelProbe);
        massBrakeFactor = params.shipMass_kg! / m1Probe;
    }
    if (params.brakeAtArrival && massBrakeFactor > 1.0001) {
        br = ar / massBrakeFactor;
    }

    const K = ar - 0.5 * ar * ar - 0.5 * massBrakeFactor * br * br;
    if (K <= 0) return null;

    let t_est = Math.sqrt(initialDist_m / (accel * K));
    for (let loops = 0; loops < 10; loops++) {
        const targetPos = getLocalState(sys, target, frameNode.id, startTime + t_est * 1000).r;
        const dist_m = distanceAU(startState.r, targetPos) * AU_M;
        const next = Math.sqrt(Math.max(1, dist_m) / (accel * K));
        t_est = 0.5 * t_est + 0.5 * next;
    }

    const totalTime = t_est;
    let accelTime = totalTime * ar;
    let brakeTime = totalTime * br;
    let coastTime = Math.max(0, totalTime - accelTime - brakeTime);

    const endTime = startTime + totalTime * 1000;
    const targetEndState = getLocalState(sys, target, frameNode.id, endTime);
    const rStart = startState.r;
    const rEnd = targetEndState.r;

    const dv1 = accel * accelTime;
    let brakeAccel = accel;
    let fuel1 = 0;
    let m1 = params.shipMass_kg || 0;
    if (useRocketEq) {
        fuel1 = calculateFuelMass(params.shipMass_kg!, dv1, params.shipIsp!);
        m1 = Math.max(1, params.shipMass_kg! - fuel1);
        brakeAccel = accel * ((params.shipMass_kg || 1) / m1);
    }

    let dv2 = brakeAccel * brakeTime;
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
            brakeTime = dv2 / Math.max(1e-6, brakeAccel);
            coastTime = Math.max(0, totalTime - accelTime - brakeTime);
            br = brakeTime / totalTime;
        }
    }

    const dv_initial_cancel = 0;
    const totalDeltaV_ms = dv1 + dv2 + dv_initial_cancel;

    let fuel2 = 0;
    let fuelEst = 0;
    if (useRocketEq) {
        fuel2 = calculateFuelMass(m1, dv2, params.shipIsp!);
        fuelEst = fuel1 + fuel2;
    } else {
        fuelEst = totalDeltaV_ms * 0.01;
        fuel1 = fuelEst * ((dv1 + dv_initial_cancel) / Math.max(1, totalDeltaV_ms));
        fuel2 = fuelEst * (dv2 / Math.max(1, totalDeltaV_ms));
    }

    const arrivalVelocity_ms = params.brakeAtArrival ? 0 : Math.max(0, Math.abs(accel * accelTime - brakeAccel * brakeTime));

    const accelEndTime = startTime + accelTime * 1000;
    const brakeStartTime = startTime + (accelTime + coastTime) * 1000;

    const segments: TransitSegment[] = [];
    const makePoints = (t0: number, t1: number): Vector2[] => {
        const pts: Vector2[] = [];
        const count = 100;
        for (let i = 0; i <= count; i++) {
            const f = i / count;
            const tSeg = t0 + f * (t1 - t0);
            const fGlobal = (tSeg - startTime) / (totalTime * 1000);
            const xLocal = rStart.x + (rEnd.x - rStart.x) * fGlobal;
            const yLocal = rStart.y + (rEnd.y - rStart.y) * fGlobal;
            const frameGlobal = getGlobalState(sys, frameNode, tSeg);
            pts.push({ x: xLocal + frameGlobal.r.x, y: yLocal + frameGlobal.r.y });
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
    let finalVelocity = globalTarget.v;
    if (!params.brakeAtArrival) {
        const dx = rEnd.x - rStart.x;
        const dy = rEnd.y - rStart.y;
        const mag = Math.sqrt(dx * dx + dy * dy) || 1;
        const vResidual = Math.max(arrivalVelocity_ms, params.interceptSpeed_ms || 0) / AU_M;
        finalVelocity = {
            x: globalTarget.v.x + (dx / mag) * vResidual,
            y: globalTarget.v.y + (dy / mag) * vResidual
        };
    }

    if (brakeTime > 0) {
        segments.push({
            id: 'seg-brake',
            type: 'Brake',
            startTime: brakeStartTime,
            endTime,
            startState: { r: { x: 0, y: 0 }, v: { x: 0, y: 0 } },
            endState: { r: globalTarget.r, v: finalVelocity },
            hostId: frameNode.id,
            pathPoints: makePoints(brakeStartTime, endTime),
            warnings: params.maxG > 2 ? ['High G'] : [],
            fuelUsed_kg: fuel2
        });
    } else if (segments.length > 0) {
        segments[segments.length - 1].endState = { r: globalTarget.r, v: finalVelocity };
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
        distance_au: distanceAU(startState.r, targetEndState.r),
        arrivalPlacement: params.arrivalPlacement,
        aerobrakingDeltaV_ms: aerobraking_dv_ms,
        initialDelay_days: params.initialDelay_days
    };
}
