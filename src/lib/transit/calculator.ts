import type { System, CelestialBody, Barycenter } from '../types';
import type { TransitPlan, TransitSegment, TransitMode, Vector2, StateVector, BurnPoint } from './types';
import { propagateState, solveLambert, distanceAU, subtract, magnitude, cross, dot } from './math';
import { AU_KM, G } from '../constants';

const AU_M = AU_KM * 1000;
const DAY_S = 86400;

function getGlobalState(sys: System, node: CelestialBody | Barycenter | { id: string, parentId: string | null, orbit?: any }, tMs: number): StateVector {
    let current: any = node;
    let r = { x: 0, y: 0 };
    let v = { x: 0, y: 0 };
    
    // Iterate up the hierarchy
    let loops = 0;
    while (current && loops < 10) {
        // Calculate local state (relative to parent)
        const local = propagateState(current, tMs);
        
        r.x += local.r.x;
        r.y += local.r.y;
        v.x += local.v.x;
        v.y += local.v.y;
        
        // Move to parent
        if (current.parentId) {
            current = sys.nodes.find(n => n.id === current.parentId);
        } else {
            current = null;
        }
        loops++;
    }
    return { r, v };
}

export function calculateTransitPlan(
  sys: System,
  originId: string,
  targetId: string,
  startTime: number, // ms
  mode: TransitMode,
  params: { maxG: number; accelRatio: number; brakeRatio: number; interceptSpeed_ms: number; shipMass_kg?: number; shipIsp?: number; brakeAtArrival?: boolean; brakingRatio?: number; initialState?: StateVector; parkingOrbitRadius_au?: number; targetOffsetAnomaly?: number; arrivalPlacement?: string }
): TransitPlan[] {
  const plans: TransitPlan[] = [];

  // 1. Find Nodes
  const origin = sys.nodes.find(n => n.id === originId);
  const target = sys.nodes.find(n => n.id === targetId);
  const root = sys.nodes.find(n => n.parentId === null);
  
  if (!target || !root) return [];

  // Handle Virtual Targets (L4/L5)
  let effectiveTarget = target;
  if (params.targetOffsetAnomaly && target.orbit) {
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

  // 2. Get Origin State
  let startState: StateVector;
  if (params.initialState) {
      startState = params.initialState;
  } else if (origin) {
      startState = getGlobalState(sys, origin, startTime);
  } else {
      return [];
  }
  
  const startPos = startState.r;
  
  // 3. Baselines
  const mu = (root.kind === 'body' ? (root as CelestialBody).massKg : (root as Barycenter).effectiveMassKg || 0) * G;
  if (!mu || mu <= 0) return [];
  
  const r1 = magnitude(startPos);
  const r2 = effectiveTarget.orbit ? effectiveTarget.orbit.elements.a_AU : r1;
  const r1_m = r1 * AU_M;
  const r2_m = r2 * AU_M;
  const t_hohmann_sec = Math.PI * Math.sqrt(Math.pow(r1_m + r2_m, 3) / (8 * mu));
  
  const targetStartPos = getGlobalState(sys, effectiveTarget, startTime).r;
  const dist_m = distanceAU(startPos, targetStartPos) * AU_M;
  const accel = (params.maxG || 0.1) * 9.81;
  const t_fast_sec = Math.sqrt(2 * dist_m / accel);
  
  // Pre-Check: Local / Short Range Transfer
  // If the target is very close (< 0.1 AU, e.g. Earth->Moon), the Heliocentric Lambert solver
  // will likely fail or produce "Solar Spiral" artifacts because it tries to orbit the Sun.
  // For these local hops, we strictly use the Kinematic (Direct) solver.
  const dist_start_au = distanceAU(startState.r, targetStartPos);
  
  if (dist_start_au < 0.1) {
      // console.log(`Short Range Transfer (${dist_start_au.toFixed(4)} AU) - Using Kinematic Solver Only`);
      
      const directParams = { 
          ...params, 
          maxG: Math.max(0.1, params.maxG), 
          initialState: startState
      };
      
      const directPlan = calculateFastPlan(sys, origin, effectiveTarget, root, startTime, startState, directParams);
      
      if (directPlan) {
          directPlan.planType = 'Speed'; // Keep as Speed so sliders work standardly
          directPlan.name = 'Direct (Local)';
          return [directPlan];
      }
      return [];
  }

  // --- Helper Solver ---
  function solveVariant(name: string, type: 'Efficiency' | 'Speed', constraints: { t_min: number, t_max: number, fixedAccelRatio?: number }): TransitPlan | null {
      // Helper for target state at T
      function targetState(t: number) {
          return getGlobalState(sys, effectiveTarget, startTime + t * 1000);
      }

      let t_min = constraints.t_min;
      let t_max = constraints.t_max;
      
      // If "Speed" mode, use User Slider. If "Efficiency", use minimal burn.
      const localAccelRatio = constraints.fixedAccelRatio !== undefined ? constraints.fixedAccelRatio : Math.max(0.01, params.accelRatio);
      
      let loops = 0;
      let bestT = t_max; 
      let bestBrakeRatio = params.brakeRatio;
      let foundSolution = false;
      let planTags: string[] = [];
      
      while (loops < 50) {
          const t_curr = (t_min + t_max) / 2;
          const mu_au = mu / Math.pow(AU_M, 3);
          const result = solveLambert(startState.r, targetState(t_curr).r, t_curr, mu_au);
          
          if (!result) {
              // Lambert failed (too fast/geometry issue) -> Slow down
              t_min = t_curr; 
              loops++;
              continue;
          }
          
          const dv1_req_ms = magnitude(subtract(result.v1, startState.v)) * AU_M;
          // Available dV based on THIS variant's accel ratio
          const dV_avail_accel_ms = accel * (t_curr * localAccelRatio); 
          
          if (params.brakeAtArrival) {
              const dv2_req_ms = magnitude(subtract(targetState(t_curr).v, result.v2)) * AU_M;
              const brakeTimeReq = dv2_req_ms / accel;
              const accelTimeReq = dv1_req_ms / accel;
              
              if ((accelTimeReq + brakeTimeReq) > t_curr) {
                  // Impossible -> Slower
                  t_min = t_curr;
              } else if (dV_avail_accel_ms > dv1_req_ms) {
                  // Feasible -> Go Faster
                  bestT = t_curr;
                  bestBrakeRatio = brakeTimeReq / t_curr;
                  t_max = t_curr;
                  foundSolution = true;
              } else {
                   // Not enough power -> Slower
                   t_min = t_curr;
              }
          } else {
              // Flyby
              if (dV_avail_accel_ms >= dv1_req_ms) {
                  bestT = t_curr;
                  bestBrakeRatio = params.brakeRatio;
                  t_max = t_curr;
                  foundSolution = true;
              } else {
                  t_min = t_curr;
              }
          }
          loops++;
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
      
      const plan = calculateLambertPlan(sys, origin, effectiveTarget, root, startTime, startState, bestT, mu, variantParams);
      if (plan) {
          plan.planType = type;
          plan.name = name;
      }
      return plan;
  }

  // 1. Efficiency (Hohmann-like) - Ballistic Solver
  // Low Accel (5%), Search around Hohmann
  const driftPlan = solveVariant('Efficiency', 'Efficiency', {
      t_min: t_hohmann_sec * 0.8,
      t_max: t_hohmann_sec * 1.5,
      fixedAccelRatio: 0.05
  });
  if (driftPlan) plans.push(driftPlan);

  // 2. Balanced (Fast / Assist)
  // User Slider, but allow near-Hohmann times (catching resonant transfers)
  const balancedPlan = solveVariant('Balanced', 'Assist', {
      t_min: t_hohmann_sec * 0.5,
      t_max: t_hohmann_sec * 1.2,
      fixedAccelRatio: params.accelRatio
  });
  if (balancedPlan) {
      // Check if it's a Sundiver
      if (balancedPlan.tags && balancedPlan.tags.includes('SUNDIVER')) {
          balancedPlan.planType = 'Assist'; // Explicitly mark as Assist
          balancedPlan.name = 'Sundiver';
      } else {
          balancedPlan.name = 'Balanced';
      }
      plans.push(balancedPlan);
  }

  // 3. Direct (Intercept) - Kinematic Solver
  // Use pure constant acceleration physics (Brachistochrone) instead of Lambert.
  // This avoids "Sundiver" artifacts because it assumes a powered straight-line trajectory
  // which overpowers gravity.
  const directParams = { 
      ...params, 
      maxG: Math.max(0.1, params.maxG), // Ensure non-zero G
      initialState: startState
  };
  
  const directPlan = calculateFastPlan(sys, origin, effectiveTarget, root, startTime, startState, directParams);
  
  if (directPlan) {
      directPlan.planType = 'Speed';
      directPlan.name = 'Direct';
      
      // Deduplicate if similar to Balanced
      const isDuplicate = balancedPlan && Math.abs(directPlan.totalTime_days - balancedPlan.totalTime_days) < 0.1;
      if (!isDuplicate) {
          plans.push(directPlan);
      }
  }
  
  return plans;
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
    params: { shipMass_kg?: number; shipIsp?: number; brakeAtArrival?: boolean; interceptSpeed_ms: number; accelRatio: number; brakeRatio: number; maxG: number; initialState?: StateVector; parkingOrbitRadius_au?: number; arrivalPlacement?: string; extraTags?: string[] }
): TransitPlan | null {
    const arrivalTime = startTime + durationSec * 1000;
    const targetState = getGlobalState(sys, target, arrivalTime);
    // console.log("Target State @ Arrival:", targetState.r);
    const mu_au = mu / Math.pow(AU_M, 3);
    
    const result = solveLambert(startState.r, targetState.r, durationSec, mu_au);
    
    if (!result) {
        return null;
    }
    
    // Calculate Delta V requirements for departure and arrival
    const startVel = params.initialState ? params.initialState.v : startState.v;
    const dv1_req_au_s = magnitude(subtract(result.v1, startVel));
    
    // Arrival dV: Capture vs Match
    let dv2_req_au_s = 0;
    
    if (params.parkingOrbitRadius_au && params.parkingOrbitRadius_au > 0) {
        // Oberth Capture Logic
        const targetMassKg = (target.kind === 'body' ? (target as CelestialBody).massKg : (target as Barycenter).effectiveMassKg) || 0;
        if (targetMassKg > 0) {
            const mu_target = targetMassKg * G;
            const V_inf_mps = magnitude(subtract(targetState.v, result.v2)) * AU_M;
            const Rp_m = params.parkingOrbitRadius_au * AU_M;
            
            // Vis-Viva Equation at Periapsis of Hyperbola
            const V_p = Math.sqrt(V_inf_mps * V_inf_mps + 2 * mu_target / Rp_m);
            // Circular Orbit Velocity at Rp
            const V_c = Math.sqrt(mu_target / Rp_m);
            
            // Capture Burn
            const dv_capture_mps = Math.abs(V_p - V_c);
            dv2_req_au_s = dv_capture_mps / AU_M;
        } else {
            // Fallback if mass unknown
            dv2_req_au_s = magnitude(subtract(targetState.v, result.v2));
        }
    } else {
        // Standard Point-Mass Match (Center to Center)
        dv2_req_au_s = magnitude(subtract(targetState.v, result.v2));
    }
    
    // Determine Applied Delta V
    // 1. Departure: We must meet the trajectory requirement
    const dv1_applied = dv1_req_au_s;
    
    // 2. Arrival: Depends on braking preference
    let dv2_applied = 0;
    const accel_est = (params.maxG || 0.1) * 9.81;
    
    if (params.brakeAtArrival) {
        // Full stop required
        dv2_applied = dv2_req_au_s;
    } else {
        // User controlled braking duration (Flyby)
        // Estimate dV based on time allocation: dV = a * t
        // Note: This ignores mass loss advantage, so actual dV might be slightly higher for same time, 
        // or time slightly lower for same dV. 
        // For manual control, dV = a * t is a good "intent" mapping.
        const brakeTimeTarget = durationSec * params.brakeRatio;
        dv2_applied = (accel_est * brakeTimeTarget) / AU_M;
        // Clamp to max required (don't brake backwards/past 0 relative velocity)
        if (dv2_applied > dv2_req_au_s) dv2_applied = dv2_req_au_s;
    }

    // Determine Applied Delta V
    const dv1_applied_au_s = dv1_req_au_s;
    const dv1_applied_mps = dv1_applied_au_s * AU_M;
    
    // Physics Constants & Initial Mass
    const g0 = 9.81;
    const accel_mps2_start = (params.maxG || 0.1) * g0;
    
    let m0 = 0; 
    let Ve = 0;
    let m_dot = 0;
    let useRocketEq = false;

    if (params.shipMass_kg && params.shipIsp && params.shipIsp > 0) {
        useRocketEq = true;
        m0 = params.shipMass_kg;
        const isp = params.shipIsp;
        Ve = isp * g0;
        const thrust_N = m0 * accel_mps2_start;
        m_dot = thrust_N / Ve;
    }

    // Departure Burn (Burn 1)
    let accelTime_sec = 0;
    let m1 = m0;
    let fuel1 = 0;

    if (useRocketEq) {
        m1 = m0 / Math.exp(dv1_applied_mps / Ve);
        fuel1 = m0 - m1;
        accelTime_sec = fuel1 / m_dot;
    } else {
        accelTime_sec = dv1_applied_mps / accel_mps2_start;
        fuel1 = dv1_applied_mps * 0.01;
    }

    // Arrival Burn (Burn 2) - Determine Magnitude
    let dv2_applied_au_s = 0;
    
    if (params.brakeAtArrival) {
        dv2_applied_au_s = dv2_req_au_s;
    } else {
        // Manual Control: Determine dV from Time Allocation
        const brakeTimeTarget = durationSec * params.brakeRatio;
        
        if (useRocketEq) {
            // Inverse Rocket Eq: dv = Ve * ln(m_initial / m_final)
            // m_final = m_initial - m_dot * t
            const maxBurnTime = m1 / m_dot; 
            const actualTime = Math.min(brakeTimeTarget, maxBurnTime * 0.99); 
            const m2_target = m1 - m_dot * actualTime;
            const dv_possible_mps = Ve * Math.log(m1 / m2_target);
            dv2_applied_au_s = dv_possible_mps / AU_M;
        } else {
            dv2_applied_au_s = (accel_mps2_start * brakeTimeTarget) / AU_M;
        }
        
        if (dv2_applied_au_s > dv2_req_au_s) dv2_applied_au_s = dv2_req_au_s;
    }

    const dv2_applied_mps = dv2_applied_au_s * AU_M;
    
    let brakeTime_sec = 0;
    let m2 = m1;
    let fuel2 = 0;

    if (useRocketEq) {
        m2 = m1 / Math.exp(dv2_applied_mps / Ve);
        fuel2 = m1 - m2;
        brakeTime_sec = fuel2 / m_dot;
    } else {
        brakeTime_sec = dv2_applied_mps / accel_mps2_start;
        fuel2 = dv2_applied_mps * 0.01;
    }

    // Total Fuel
    const fuelEst = fuel1 + fuel2;
    const totalDeltaV_ms = dv1_applied_mps + dv2_applied_mps;

    // Validate times (cannot exceed duration)
    const totalBurnTime = accelTime_sec + brakeTime_sec;
    if (totalBurnTime > durationSec) {
        const scale = durationSec / totalBurnTime;
        accelTime_sec *= scale;
        brakeTime_sec *= scale;
    }

    const coastTime_sec = durationSec - accelTime_sec - brakeTime_sec;
    
    // Tagging Logic (Moved Up for rp usage)
    const tags: string[] = params.extraTags || []; 
    const r1_tag = startState.r;
    const v1_tag = result.v1;
    const h_val = Math.abs(cross(r1_tag, v1_tag)); 
    const p_param = (h_val * h_val) / mu_au;
    const v_sq = dot(v1_tag, v1_tag);
    const r_mag = magnitude(r1_tag);
    const rv_dot = dot(r1_tag, v1_tag);
    const e_x = ((v_sq - mu_au/r_mag)*r1_tag.x - rv_dot*v1_tag.x) / mu_au;
    const e_y = ((v_sq - mu_au/r_mag)*r1_tag.y - rv_dot*v1_tag.y) / mu_au;
    const ecc = Math.sqrt(e_x*e_x + e_y*e_y);
    const rp = p_param / (1 + ecc);
    
    if (rp < 0.05) tags.push('SUNDIVER');
    if (params.maxG > 2.0) tags.push('HIGH-G');

    // 7. Visualization Points & Segments
    const accelEndTime = startTime + accelTime_sec * 1000;
    const brakeStartTime = arrivalTime - brakeTime_sec * 1000;
    
    // Check for Torchship Sundiver artifact
    const isTorchshipSundiver = params.accelRatio > 0.1 && rp < 0.3;
    
    const totalPoints = 300;
    const dt_step = durationSec / totalPoints;
    
    const accelPoints: Vector2[] = [];
    const coastPoints: Vector2[] = [];
    const brakePoints: Vector2[] = [];
    
    let currR = startState.r;
    let currV = result.v1;
    
    accelPoints.push(currR);
    
    if (isTorchshipSundiver) {
        // Linear Interpolation for Visuals
        const rStart = startState.r;
        const rEnd = targetState.r;
        
        for(let i=0; i<totalPoints; i++) {
             const f = (i + 1) / totalPoints;
             const absTime = startTime + (i + 1) * dt_step * 1000;
             
             // Simple Lerp
             const x = rStart.x + (rEnd.x - rStart.x) * f;
             const y = rStart.y + (rEnd.y - rStart.y) * f;
             currR = { x, y };
             
             if (absTime < accelEndTime) {
                 accelPoints.push(currR);
             } else if (absTime < brakeStartTime) {
                 if (coastPoints.length === 0 && accelPoints.length > 0) coastPoints.push(accelPoints[accelPoints.length-1]);
                 coastPoints.push(currR);
             } else {
                 if (brakePoints.length === 0) {
                     if (coastPoints.length > 0) brakePoints.push(coastPoints[coastPoints.length-1]);
                     else if (accelPoints.length > 0) brakePoints.push(accelPoints[accelPoints.length-1]);
                 }
                 brakePoints.push(currR);
             }
        }
    } else {
        // Standard Ballistic Integrator
        for(let i=0; i<totalPoints; i++) {
             const t_start = i * dt_step;
             
             // Adaptive Integration for Periapsis Accuracy
             // If we are close to the star (< 0.2 AU), use finer steps to avoid numerical slingshot
             const rDist = Math.sqrt(currR.x*currR.x + currR.y*currR.y);
             const subSteps = rDist < 0.3 ? 100 : (rDist < 0.8 ? 10 : 1);
             const dt = dt_step / subSteps;
             
             for (let s=0; s<subSteps; s++) {
                 const rMag = Math.sqrt(currR.x*currR.x + currR.y*currR.y);
                 const rMag3 = rMag*rMag*rMag;
                 const ax = -mu_au * currR.x / rMag3;
                 const ay = -mu_au * currR.y / rMag3;
                 
                 const vx_new = currV.x + ax * dt;
                 const vy_new = currV.y + ay * dt;
                 const rx_new = currR.x + vx_new * dt;
                 const ry_new = currR.y + vy_new * dt;
                 
                 currR = { x: rx_new, y: ry_new };
                 currV = { x: vx_new, y: vy_new };
             }
             
             const absTime = startTime + (t_start + dt_step) * 1000;
             
             if (absTime < accelEndTime) {
                 accelPoints.push(currR);
             } else if (absTime < brakeStartTime) {
                 if (coastPoints.length === 0 && accelPoints.length > 0) coastPoints.push(accelPoints[accelPoints.length-1]);
                 coastPoints.push(currR);
             } else {
                 if (brakePoints.length === 0) {
                     if (coastPoints.length > 0) brakePoints.push(coastPoints[coastPoints.length-1]);
                     else if (accelPoints.length > 0) brakePoints.push(accelPoints[accelPoints.length-1]);
                 }
                 brakePoints.push(currR);
             }
        }
    }
    
    // Debug Path Accuracy
    /*
    const lastP = brakePoints.length > 0 ? brakePoints[brakePoints.length-1] : (coastPoints.length > 0 ? coastPoints[coastPoints.length-1] : accelPoints[accelPoints.length-1]);
    const err = distanceAU(lastP, targetState.r);
    console.log("Path Gen Error:", err);
    */
    
    // Calculate Distance (Arc Length)
    let distance_au = 0;
    for(let i=0; i<accelPoints.length-1; i++) distance_au += distanceAU(accelPoints[i], accelPoints[i+1]);
    if (coastPoints.length > 0) for(let i=0; i<coastPoints.length-1; i++) distance_au += distanceAU(coastPoints[i], coastPoints[i+1]);
    if (brakePoints.length > 0) for(let i=0; i<brakePoints.length-1; i++) distance_au += distanceAU(brakePoints[i], brakePoints[i+1]);
    
    const segments: TransitSegment[] = [];
    
    // Final State Logic
    let finalState: StateVector = { r: targetState.r, v: targetState.v };
    if (!params.brakeAtArrival) {
        const actualArrivalRelV_mps = magnitude(subtract(targetState.v, result.v2)) * AU_M;
        // Remaining V = Total Rel V - Brake V
        const remainingV = Math.max(0, actualArrivalRelV_mps - dv2_applied_mps);
        // Approx vector: Parked + (Transfer - Parked) * (remaining / total)
        // Or simpler: just use Transfer V if braking is small?
        // For simplicity/robustness: Use Transfer V (result.v2) if we didn't stop.
        finalState = { r: targetState.r, v: result.v2 }; 
    }

    if (accelPoints.length > 1) {
        segments.push({
            id: 'seg-accel',
            type: 'Accel',
            startTime: startTime,
            endTime: accelEndTime,
            startState: { r: startState.r, v: result.v1 },
            endState: { r: accelPoints[accelPoints.length-1], v: {x:0,y:0} }, // Approx
            hostId: root.id,
            pathPoints: accelPoints,
            warnings: [],
            fuelUsed_kg: fuel1
        });
    }
    
    if (coastPoints.length > 1) {
        segments.push({
            id: 'seg-coast',
            type: 'Coast',
            startTime: accelEndTime,
            endTime: brakeStartTime,
            startState: { r: coastPoints[0], v: {x:0,y:0} },
            endState: { r: coastPoints[coastPoints.length-1], v: {x:0,y:0} },
            hostId: root.id,
            pathPoints: coastPoints,
            warnings: [],
            fuelUsed_kg: 0
        });
    }

    if (brakePoints.length > 1) {
        // Only add brake segment if it exists visually
        // Note: If brakingRatio is 0, burnTime2 is 0, so brakePoints might be empty or tiny.
        // If brakePoints exist, it means we have a braking phase (full or partial).
        
        // If partial brake, type is still Brake (Red), but we warn Flyby?
        // Or maybe make it Yellow if 0 brake? No, Brake segment implies burning.
        // If brakingRatio == 0, burnTime2 == 0, so brakePoints should be empty.
        
        segments.push({
            id: 'seg-brake',
            type: 'Brake',
            startTime: brakeStartTime,
            endTime: arrivalTime,
            startState: { r: brakePoints[0], v: {x:0,y:0} },
            endState: finalState,
            hostId: root.id,
            pathPoints: brakePoints,
            warnings: !params.brakeAtArrival ? ['Flyby'] : [],
            fuelUsed_kg: fuel2
        });
    } 
    
    // Ensure last segment has correct end state for chaining
    if (segments.length > 0) segments[segments.length-1].endState = finalState;
    
    // Arrival Velocity for display
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
        totalFuel_kg: fuelEst,
        distance_au: distance_au,
        isValid: true,
        maxG: params.maxG,
        accelRatio: accelTime_sec / durationSec,
        brakeRatio: brakeTime_sec / durationSec,
        interceptSpeed_ms: params.interceptSpeed_ms,
        arrivalVelocity_ms: arrivalVelocity_ms,
        arrivalPlacement: params.arrivalPlacement,
        tags: tags
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
    
    const accel = params.maxG * 9.81; // m/s^2
    if (accel <= 0) return null;

    // 1. Initial Geometry
    const targetStartPos = getGlobalState(sys, target, startTime).r;
    const initialDist_m = distanceAU(startState.r, targetStartPos) * AU_M;
    
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
    
    if (K <= 0) return null; // Invalid geometry (no forward progress?)
    
    // Initial Estimate
    let t_est = Math.sqrt(initialDist_m / (accel * K));
    
    // Iterative refinement for moving target
    let loops = 0;
    while(loops < 10) {
        const targetPos = getGlobalState(sys, target, startTime + t_est * 1000).r;
        const dist_m = distanceAU(startState.r, targetPos) * AU_M;
        t_est = Math.sqrt(dist_m / (accel * K));
        loops++;
    }
    
    // 4. Calculate Timings & Velocities
    const totalTime = t_est;
    const accelTime = totalTime * ar;
    const brakeTime = totalTime * br;
    const coastTime = totalTime - accelTime - brakeTime;
    
    const accelEndTime = startTime + accelTime * 1000;
    const brakeStartTime = startTime + (accelTime + coastTime) * 1000;
    const endTime = startTime + totalTime * 1000;
    
    const targetEndState = getGlobalState(sys, target, endTime);
    
    // Debug Logging for Fast Plan endpoints
    /*
    console.log(`FAST PLAN: ${origin ? origin.name : 'Unknown'} to ${target.name}`);
    console.log(`  Start State R: (${startState.r.x.toFixed(3)}, ${startState.r.y.toFixed(3)}) AU`);
    console.log(`  Target End State R: (${targetEndState.r.x.toFixed(3)}, ${targetEndState.r.y.toFixed(3)}) AU`);
    console.log(`  Calculated Straight Line Distance: ${distanceAU(startState.r, targetEndState.r).toFixed(3)} AU`);
    */

    // 5. Delta V & Fuel
    // Physical dV = a * (t_accel + t_brake)
    const dv1 = accel * accelTime;
    const dv2 = accel * brakeTime;
    const totalDeltaV_ms = dv1 + dv2;
    
    // Arrival Velocity Remainder
    // If flyby, v_final = v_max - v_brake
    // v_max = a * accelTime
    // v_brake = a * brakeTime
    // v_net = a * (accelTime - brakeTime)
    // Plus the relative velocity of the bodies?
    // Kinematic solver moves from A to B. The "Speed" is relative to the frame.
    // If we stop (br=ar), v_net = 0 (relative to start frame?).
    // We should compare to Target Velocity?
    // This simple solver assumes Target is "Stationary" for the intercept calc approx?
    // Refinement: Add vector addition of target velocity?
    // For M0, let's assume v_arrival = v_net.
    const arrivalVelocity_ms = Math.abs(accel * (accelTime - brakeTime));

    let fuelEst = 0;
    let fuel1 = 0;
    let fuel2 = 0;
    
    if (params.shipMass_kg && params.shipIsp && params.shipIsp > 0) {
        const g0 = 9.81;
        const Ve = params.shipIsp * g0;
        const m0 = params.shipMass_kg;
        const thrust = m0 * accel; // Thrust based on initial mass? Or constant thrust?
        // If constant thrust, F = ma. m drops. a rises.
        // Tsiolkovsky assumes constant Ve.
        // To maintain constant 'accel' (G) as requested by UI slider, we must throttle down.
        // dV = a * t.
        // Fuel = m0 * (1 - exp(-dV/Ve)).
        // This is exact for constant G.
        
        // Burn 1
        const m1 = m0 / Math.exp(dv1 / Ve);
        fuel1 = m0 - m1;
        
        // Burn 2
        const m2 = m1 / Math.exp(dv2 / Ve);
        fuel2 = m1 - m2;
        
        fuelEst = fuel1 + fuel2;
    } else {
        fuelEst = totalDeltaV_ms * 0.01;
        fuel1 = fuelEst * (dv1 / (dv1+dv2));
        fuel2 = fuelEst * (dv2 / (dv1+dv2));
    }

    // 6. Generate Segments (Straight Line Interpolation)
    // Direct plan = Straight line visual
    const segments: TransitSegment[] = [];
    const rStart = startState.r;
    const rEnd = targetEndState.r;
    
    // Helper to generate points on the line
    function makePoints(t0: number, t1: number): Vector2[] {
        const pts: Vector2[] = [];
        const count = 50;
        for(let i=0; i<=count; i++) {
            const f_time = i/count; // fraction of segment
            const t_seg = t0 + f_time * (t1 - t0);
            const f_global = (t_seg - startTime) / (totalTime * 1000); // fraction of total trip (ms / ms)
            
            const x = rStart.x + (rEnd.x - rStart.x) * f_global;
            const y = rStart.y + (rEnd.y - rStart.y) * f_global;
            pts.push({x, y});
        }
        return pts;
    }
    
    if (accelTime > 0) {
        segments.push({
            id: 'seg-accel',
            type: 'Accel',
            startTime: startTime,
            endTime: accelEndTime,
            startState: startState,
            endState: { r: {x:0,y:0}, v: {x:0,y:0} }, // Placeholder
            hostId: root.id,
            pathPoints: makePoints(startTime, accelEndTime),
            warnings: ['High G'],
            fuelUsed_kg: fuel1
        });
    }
    
    if (coastTime > 0) {
        segments.push({
            id: 'seg-coast',
            type: 'Coast',
            startTime: accelEndTime,
            endTime: brakeStartTime,
            startState: { r: {x:0,y:0}, v: {x:0,y:0} },
            endState: { r: {x:0,y:0}, v: {x:0,y:0} },
            hostId: root.id,
            pathPoints: makePoints(accelEndTime, brakeStartTime),
            warnings: [],
            fuelUsed_kg: 0
        });
    }
    
    if (brakeTime > 0) {
        segments.push({
            id: 'seg-brake',
            type: 'Brake',
            startTime: brakeStartTime,
            endTime: endTime,
            startState: { r: {x:0,y:0}, v: {x:0,y:0} },
            endState: targetEndState,
            hostId: root.id,
            pathPoints: makePoints(brakeStartTime, endTime),
            warnings: ['High G'],
            fuelUsed_kg: fuel2
        });
    } else if (segments.length > 0) {
        segments[segments.length-1].endState = targetEndState;
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
        arrivalPlacement: (params as any).arrivalPlacement // Pass through if available
    };
}
