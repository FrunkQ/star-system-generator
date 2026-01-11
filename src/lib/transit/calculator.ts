import type { System, CelestialBody, Barycenter } from '../types';
import type { TransitPlan, TransitSegment, TransitMode, Vector2, StateVector, BurnPoint } from './types';
import { propagateState, solveLambert, distanceAU, subtract, magnitude, cross, dot, integrateBallisticPath, add } from './math';
import { getGlobalState, getLocalState, calculateFuelMass, calculateDeltaV } from './physics';
import { calculateAssistPlan } from './assist';
import { AU_KM, G } from '../constants';

const AU_M = AU_KM * 1000;
const DAY_S = 86400;

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
  function solveVariant(name: string, type: 'Efficiency' | 'Speed', constraints: { t_min: number, t_max: number, fixedAccelRatio?: number }): TransitPlan | null {
      // Helper for target state at T (Local or Global)
      function targetState(t: number) {
          const tAbs = startTime + t * 1000;
          if (frameParentId) {
              return getLocalState(sys, effectiveTarget, frameParentId, tAbs);
          }
          return getGlobalState(sys, effectiveTarget, tAbs);
      }

      let t_min = constraints.t_min;
      let t_max = constraints.t_max;
      
      const localAccelRatio = constraints.fixedAccelRatio !== undefined ? constraints.fixedAccelRatio : Math.max(0.01, params.accelRatio);
      
      let loops = 0;
      let bestT = t_max; 
      let bestBrakeRatio = params.brakeRatio;
      let planTags: string[] = [];
      let found = false;
      
      while (loops < 50) {
          const t_curr = (t_min + t_max) / 2;
          
          // SOLVE IN METERS (Higher Precision for Local Frames)
          const r1_m = { x: startState.r.x * AU_M, y: startState.r.y * AU_M };
          const r2_m = { x: targetState(t_curr).r.x * AU_M, y: targetState(t_curr).r.y * AU_M };
          
          // Use frameMu (kg * G) directly
          const result_m = solveLambert(r1_m, r2_m, t_curr, frameMu);
          
          if (!result_m) {
              t_min = t_curr; 
              loops++;
              continue;
          }
          
          // Convert Result back to AU/s
          const v1_au_s = { x: result_m.v1.x / AU_M, y: result_m.v1.y / AU_M };
          const v2_au_s = { x: result_m.v2.x / AU_M, y: result_m.v2.y / AU_M };
          const result = { v1: v1_au_s, v2: v2_au_s };
          
          const dv1_req_ms = magnitude(subtract(result.v1, startState.v)) * AU_M;
          const dV_avail_accel_ms = accel * (t_curr * localAccelRatio); 
          
          if (params.brakeAtArrival) {
              const dv2_req_ms = magnitude(subtract(targetState(t_curr).v, result.v2)) * AU_M;
              const brakeTimeReq = dv2_req_ms / accel;
              const accelTimeReq = dv1_req_ms / accel;
              
              if ((accelTimeReq + brakeTimeReq) > t_curr) {
                  t_min = t_curr;
              } else if (dV_avail_accel_ms > dv1_req_ms) {
                  bestT = t_curr;
                  bestBrakeRatio = brakeTimeReq / t_curr;
                  t_max = t_curr;
                  found = true;
              } else {
                   t_min = t_curr;
              }
          } else {
              if (dV_avail_accel_ms >= dv1_req_ms) {
                  bestT = t_curr;
                  bestBrakeRatio = params.brakeRatio;
                  t_max = t_curr;
                  found = true;
              } else {
                  t_min = t_curr;
              }
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
          startTime, startState, bestT, frameMu, variantParams, frameParentId
      );
      
      if (plan) {
          plan.planType = type;
          plan.name = name;
      }
      return plan;
  }

  // 1. Efficiency (Hohmann-like)
  const driftPlan = solveVariant('Efficiency', 'Efficiency', {
      t_min: t_hohmann_sec * 0.8,
      t_max: t_hohmann_sec * 1.5,
      fixedAccelRatio: 0.05
  });
  if (driftPlan) plans.push(driftPlan);

  // 2. Balanced (Fast / Assist)
  const balancedPlan = solveVariant('Balanced', 'Assist', {
      t_min: t_hohmann_sec * 0.5,
      t_max: t_hohmann_sec * 1.2,
      fixedAccelRatio: params.accelRatio
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
  
  // 3. Direct (Intercept) - Kinematic Solver
  const directStart = frameParentId ? getLocalState(sys, effectiveOrigin!, frameParentId, startTime) : getGlobalState(sys, effectiveOrigin!, startTime);
  
  const directParams = { 
      ...params, 
      maxG: Math.max(0.1, params.maxG),
      initialState: directStart
  };
  
  // NOTE: calculateFastPlan currently uses Global State internally if we don't pass a specific frame context?
  // Actually calculateFastPlan takes 'root'. If we pass 'root', it calculates target position relative to root?
  // We need to pass the Frame Parent as 'root' to calculateFastPlan if we want it to solve locally!
  
  const solverRoot = frameParentId ? sys.nodes.find(n => n.id === frameParentId)! : root;
  
  // console.log(`[TransitPlanner] Direct Solver Setup:`);
  // console.log(`  FrameParent: ${frameParentId}, SolverRoot: ${solverRoot.name}`);
  // console.log(`  Origin: ${effectiveOrigin?.name}, Target: ${effectiveTarget.name}`);
  
  const directPlan = calculateFastPlan(sys, effectiveOrigin, effectiveTarget, solverRoot, startTime, directStart, directParams);
  
  if (directPlan) {
      directPlan.planType = 'Speed';
      directPlan.name = 'Direct Burn';
      const isDuplicate = balancedPlan && Math.abs(directPlan.totalTime_days - balancedPlan.totalTime_days) < 0.1;
      if (!isDuplicate) plans.push(directPlan);
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
  const baselinePlan = plans.find(p => p.planType === 'Efficiency');
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
    
    const result_m = solveLambert(r1_m, r2_m, durationSec, mu);
    
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
    
    // Oberth / Arrival Logic
    if (params.parkingOrbitRadius_au && params.parkingOrbitRadius_au > 0) {
        const targetMassKg = (target.kind === 'body' ? (target as CelestialBody).massKg : (target as Barycenter).effectiveMassKg) || 0;
        if (targetMassKg > 0) {
            const mu_target = targetMassKg * G;
            const V_inf_mps = magnitude(subtract(targetState.v, result.v2)) * AU_M;
            const Rp_m = params.parkingOrbitRadius_au * AU_M;
            const V_p = Math.sqrt(V_inf_mps * V_inf_mps + 2 * mu_target / Rp_m);
            const V_c = Math.sqrt(mu_target / Rp_m);
            let dv_capture_mps = Math.abs(V_p - V_c);

            const targetBody = target as CelestialBody;
            const hasAtmosphere = targetBody.atmosphere && targetBody.atmosphere.pressure_bar && targetBody.atmosphere.pressure_bar > 0.001;
            
            if (hasAtmosphere && params.aerobrake && params.aerobrake.allowed) {
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
            dv2_req_au_s = dv_capture_mps / AU_M;
        } else {
            dv2_req_au_s = magnitude(subtract(targetState.v, result.v2));
        }
    } else {
        dv2_req_au_s = magnitude(subtract(targetState.v, result.v2));
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
        dv2_applied_au_s = (accel_mps2 * brakeTimeTarget) / AU_M;
        if (dv2_applied_au_s > dv2_req_au_s) dv2_applied_au_s = dv2_req_au_s;
    }

    const dv2_applied_mps = dv2_applied_au_s * AU_M;
    let brakeTime_sec = dv2_applied_mps / accel_mps2;
    let fuel2 = 0;
    if (useRocketEq) {
        fuel2 = calculateFuelMass(m1, dv2_applied_mps, params.shipIsp!);
    } else {
        fuel2 = dv2_applied_mps * 0.01;
    }

    const totalBurnTime = accelTime_sec + brakeTime_sec;
    if (totalBurnTime > durationSec) {
        const scale = durationSec / totalBurnTime;
        accelTime_sec *= scale;
        brakeTime_sec *= scale;
    }

    const totalDeltaV_ms = dv1_applied_mps + dv2_applied_mps;
    const tags: string[] = params.extraTags || []; 
    if (params.maxG > 2.0) tags.push('HIGH-G');

    // Visual Path Generation
    const accelEndTime = startTime + accelTime_sec * 1000;
    const brakeStartTime = arrivalTime - brakeTime_sec * 1000;
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
                const dt_step = durationSec / localPath.length;
                const tAbs = startTime + i * dt_step * 1000;
                const parentState = getGlobalState(sys, parentNode, tAbs); 
                return add(pt, parentState.r);
            });
        }
    }

    const dt_step = durationSec / fullPath.length;
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

    let distance_au = 0; // Estimation
    if (fullPath.length > 1) distance_au = distanceAU(fullPath[0], fullPath[fullPath.length-1]); // Simplified

    const segments: TransitSegment[] = [];
    
    // Global Final State for chaining
    // If local, targetState is local. Need Global.
    const globalTargetState = getGlobalState(sys, target, arrivalTime);
    let finalState: StateVector = { r: globalTargetState.r, v: globalTargetState.v };
    
    if (!params.brakeAtArrival) {
        // Flyby Velocity (Global)
        // result.v2 is Local Arrival Velocity.
        // We need Global Arrival Velocity.
        if (frameParentId) {
             const parentState = getGlobalState(sys, { id: frameParentId } as any, arrivalTime);
             finalState = { r: globalTargetState.r, v: add(result.v2, parentState.v) };
        } else {
             finalState = { r: globalTargetState.r, v: result.v2 };
        }
    }

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

    const actualArrivalRelV_mps = magnitude(subtract(targetState.v, result.v2)) * AU_M;
    const arrivalVelocity_ms = Math.max(0, actualArrivalRelV_mps - dv2_applied_mps);

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
        accelRatio: accelTime_sec / durationSec,
        brakeRatio: brakeTime_sec / durationSec,
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

    root: CelestialBody | Barycenter, 

    startTime: number,

    startState: StateVector,

    params: { maxG: number; shipMass_kg?: number; shipIsp?: number; brakeAtArrival?: boolean; initialState?: StateVector; accelRatio: number; brakeRatio: number }

): TransitPlan | null {

    // Kinematic Solver for Variable Coast (Direct/Torchship)

    

    const accel = params.maxG * 9.81; 

    if (accel <= 0) return null;



                // 1. Initial Geometry (Use Local State relative to 'root')



                const targetStartPos = getLocalState(sys, target, root.id, startTime).r;



                const initialDist_m = distanceAU(startState.r, targetStartPos) * AU_M;



                



                // console.log(`[FastPlan] Init:`);



                // console.log(`  StartPos (AU): ${startState.r.x.toFixed(5)}, ${startState.r.y.toFixed(5)}`);



                // console.log(`  TargetPos (AU): ${targetStartPos.x.toFixed(5)}, ${targetStartPos.y.toFixed(5)}`);



                // console.log(`  Dist (m): ${initialDist_m.toExponential(2)}`);



                



                // 2. Determine Ratios

    let ar = Math.max(0.001, params.accelRatio);

    let br = params.brakeAtArrival ? ar : params.brakeRatio;

    

    // Constraint: ar + br <= 1

    if (ar + br > 1.0) {

        const scale = 1.0 / (ar + br);

        ar *= scale;

        br *= scale;

    }

    

    // 3. Solve for Time T

    // D = a * T^2 * K

    // K = ar - 0.5*ar^2 - 0.5*br^2

    const K = ar - 0.5 * ar * ar - 0.5 * br * br;

    

    if (K <= 0) return null; 

    

    let t_est = Math.sqrt(initialDist_m / (accel * K));

    let loops = 0;

    while(loops < 10) {

        const targetPos = getLocalState(sys, target, root.id, startTime + t_est * 1000).r;

        const dist_m = distanceAU(startState.r, targetPos) * AU_M;

        t_est = Math.sqrt(dist_m / (accel * K));

        loops++;

    }

    

    const totalTime = t_est;

    let accelTime = totalTime * ar;

    let brakeTime = totalTime * br;

    let coastTime = totalTime - accelTime - brakeTime;

    

    const accelEndTime = startTime + accelTime * 1000;

    let brakeStartTime = startTime + (accelTime + coastTime) * 1000;

    const endTime = startTime + totalTime * 1000;

    

    const targetEndState = getLocalState(sys, target, root.id, endTime);

    const rStart = startState.r;

    const rEnd = targetEndState.r;
    
    const dv1 = accel * accelTime;
    let dv2 = accel * brakeTime; 
    let aerobraking_dv_ms = 0;

    if (params.brakeAtArrival && (params as any).aerobrake && (params as any).aerobrake.allowed) {
        const targetBody = target as CelestialBody;
        if (targetBody.atmosphere && targetBody.atmosphere.pressure_bar && targetBody.atmosphere.pressure_bar > 0.001) {
            const limit_mps = (params as any).aerobrake.limit_kms * 1000;
            const arrivalV = dv2; 
            
            if (arrivalV <= limit_mps) {
                aerobraking_dv_ms = dv2;
                dv2 = 0; 
            } else {
                aerobraking_dv_ms = limit_mps;
                dv2 = arrivalV - limit_mps; 
            }
            
            const newBrakeTime = dv2 / accel;
            const timeSaved = brakeTime - newBrakeTime;
            brakeTime = newBrakeTime;
            coastTime += timeSaved; 
            br = brakeTime / totalTime;
        }
    }

    brakeStartTime = startTime + (accelTime + coastTime) * 1000; 

    const v_init_ms = magnitude(startState.v) * AU_M;
    const dv_initial_cancel = v_init_ms > 100 ? v_init_ms : 0;
    const totalDeltaV_ms = dv1 + dv2 + dv_initial_cancel;
    const arrivalVelocity_ms = params.brakeAtArrival ? 0 : Math.abs(accel * (accelTime - brakeTime));

    let fuelEst = 0;
    let fuel1 = 0;
    let fuel2 = 0;
    
    if (params.shipMass_kg && params.shipIsp && params.shipIsp > 0) {
        const m0 = params.shipMass_kg;
        const f0 = calculateFuelMass(m0, dv_initial_cancel, params.shipIsp);
        let m_curr = m0 - f0;
        fuel1 = calculateFuelMass(m_curr, dv1, params.shipIsp);
        m_curr -= fuel1;
        fuel2 = calculateFuelMass(m_curr, dv2, params.shipIsp);
        fuelEst = f0 + fuel1 + fuel2;
        fuel1 += f0;
    } else {
        fuelEst = totalDeltaV_ms * 0.01;
        fuel1 = fuelEst * ((dv1 + dv_initial_cancel) / totalDeltaV_ms);
        fuel2 = fuelEst * (dv2 / totalDeltaV_ms);
    }

    let finalVelocity = targetEndState.v; 
    if (!params.brakeAtArrival) {
        const dx = rEnd.x - rStart.x;
        const dy = rEnd.y - rStart.y;
        const mag = Math.sqrt(dx*dx + dy*dy);
        if (mag > 0) {
            const dirX = dx / mag;
            const dirY = dy / mag;
            const v_resid_au_s = arrivalVelocity_ms / AU_M;
            finalVelocity = {
                x: targetEndState.v.x + dirX * v_resid_au_s,
                y: targetEndState.v.y + dirY * v_resid_au_s
            };
        }
    }

    const segments: TransitSegment[] = [];
    function makePoints(t0: number, t1: number): Vector2[] {
        const pts: Vector2[] = [];
        const count = 50;
                for(let i=0; i<=count; i++) {
                    const f_time = i/count; 
                    const t_seg = t0 + f_time * (t1 - t0);
                    const f_global = (t_seg - startTime) / (totalTime * 1000); 
                    
                    const x_local = rStart.x + (rEnd.x - rStart.x) * f_global;
                    const y_local = rStart.y + (rEnd.y - rStart.y) * f_global;
                    
                    const rootGlobal = getGlobalState(sys, root, t_seg);
                    
                    pts.push({
                        x: x_local + rootGlobal.r.x,
                        y: y_local + rootGlobal.r.y
                    });
                }
        return pts;
    }
    
    if (accelTime > 0) {
        segments.push({
            id: 'seg-accel', type: 'Accel', startTime, endTime: accelEndTime,
            startState, endState: { r: {x:0,y:0}, v: {x:0,y:0} }, hostId: root.id,
            pathPoints: makePoints(startTime, accelEndTime), warnings: ['High G'], fuelUsed_kg: fuel1
        });
    }
    if (coastTime > 0) {
        segments.push({
            id: 'seg-coast', type: 'Coast', startTime: accelEndTime, endTime: brakeStartTime,
            startState: { r: {x:0,y:0}, v: {x:0,y:0} }, endState: { r: {x:0,y:0}, v: {x:0,y:0} }, hostId: root.id,
            pathPoints: makePoints(accelEndTime, brakeStartTime), warnings: [], fuelUsed_kg: 0
        });
    }
    if (brakeTime > 0) {
        segments.push({
            id: 'seg-brake', type: 'Brake', startTime: brakeStartTime, endTime: endTime,
            startState: { r: {x:0,y:0}, v: {x:0,y:0} }, endState: { r: targetEndState.r, v: finalVelocity }, hostId: root.id,
            pathPoints: makePoints(brakeStartTime, endTime), warnings: ['High G'], fuelUsed_kg: fuel2
        });
    } else if (segments.length > 0) {
        segments[segments.length-1].endState = { r: targetEndState.r, v: finalVelocity };
    }

    return {
        id: 'plan-fast-' + Date.now(),
        originId: origin ? origin.id : 'unknown',
        targetId: target.id,
        startTime: startTime,
        mode: 'Fast',
        segments,
        burns: [],
        totalDeltaV_ms: totalDeltaV_ms,
        totalTime_days: totalTime / DAY_S,
        totalFuel_kg: fuelEst,
        isValid: true,
        maxG: params.maxG,
        accelRatio: ar,
        brakeRatio: br,
        interceptSpeed_ms: params.interceptSpeed_ms,
        arrivalVelocity_ms: arrivalVelocity_ms,
        distance_au: distanceAU(startState.r, targetEndState.r),
        arrivalPlacement: (params as any).arrivalPlacement, 
        isKinematic: true,
        aerobrakingDeltaV_ms: aerobraking_dv_ms,
        initialDelay_days: (params as any).initialDelay_days
    };
}
