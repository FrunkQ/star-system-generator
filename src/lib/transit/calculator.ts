import type { System, CelestialBody, Barycenter } from '../types';
import type { TransitPlan, TransitSegment, TransitMode, Vector2, StateVector, BurnPoint } from './types';
import { propagateState, solveLambert, distanceAU, subtract, magnitude, cross, dot, integrateBallisticPath } from './math';
import { getGlobalState, calculateFuelMass, calculateDeltaV } from './physics';
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
  }
): TransitPlan[] {
  const plans: TransitPlan[] = [];

  // 1. Find Nodes
  const origin = sys.nodes.find(n => n.id === originId);
  const target = sys.nodes.find(n => n.id === targetId);
  const root = sys.nodes.find(n => n.parentId === null);
  
  if (!target || !root) return [];

  // SANITIZATION: Check for "Impossible Orbit" (Sun Gravity around a Planet)
  // This happens if a ship is dragged/parented to a planet but keeps the Star's hostMu/hostId
  let effectiveOrigin = origin;
  if (origin && origin.parentId && origin.orbit) {
      const parent = sys.nodes.find(n => n.id === origin.parentId);
      if (parent && (parent.kind === 'body' || parent.kind === 'barycenter')) {
          const parentMass = (parent as CelestialBody).massKg || (parent as Barycenter).effectiveMassKg || 0;
          const parentMu = parentMass * G;
          
          // If mismatched ID or Drastically mismatched Mu (factor of 100 difference)
          if (origin.orbit.hostId !== parent.id || (parentMu > 0 && Math.abs(origin.orbit.hostMu - parentMu) > parentMu * 100)) {
              console.warn(`[TransitPlanner] Detected corrupted orbit for ${origin.name}. Fixing locally.`);
              // Create a corrected copy for calculation
              effectiveOrigin = {
                  ...origin,
                  orbit: {
                      ...origin.orbit,
                      hostId: parent.id,
                      hostMu: parentMu,
                      // We must also clear 'n' (mean motion) so propagateState recalculates it correctly with the new Mu
                      n_rad_per_s: undefined 
                  }
              };
          }
      }
  }

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
  } else if (effectiveOrigin) {
      startState = getGlobalState(sys, effectiveOrigin, startTime);
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
      
      const directPlan = calculateFastPlan(sys, effectiveOrigin, effectiveTarget, root, startTime, startState, directParams);
      
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
              
              // DEBUG LOGGING
              if (loops === 0) {
                 console.log(`[TransitDebug] Variant: ${name}`);
                 console.log(`  t_curr (days): ${(t_curr/86400).toFixed(1)}`);
                 console.log(`  Hohmann (days): ${(t_hohmann_sec/86400).toFixed(1)}`);
                 console.log(`  dV1 Req (km/s): ${(dv1_req_ms/1000).toFixed(1)}`);
                 console.log(`  dV2 Req (km/s): ${(dv2_req_ms/1000).toFixed(1)}`);
                 console.log(`  dV Avail (km/s): ${(dV_avail_accel_ms/1000).toFixed(1)}`);
              }

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
      
      const plan = calculateLambertPlan(sys, effectiveOrigin, effectiveTarget, root, startTime, startState, bestT, mu, variantParams);
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
                balancedPlan.name = 'Efficient Alt'; // Renamed from Balanced
            }
            plans.push(balancedPlan);
        }
  
        // 3. Direct (Intercept) - Kinematic Solver  // Use pure constant acceleration physics (Brachistochrone) instead of Lambert.
  // This avoids "Sundiver" artifacts because it assumes a powered straight-line trajectory
  // which overpowers gravity.
  const directParams = { 
      ...params, 
      maxG: Math.max(0.1, params.maxG), // Ensure non-zero G
      initialState: startState
  };
  
  const directPlan = calculateFastPlan(sys, effectiveOrigin, effectiveTarget, root, startTime, startState, directParams);
  
            if (directPlan) {
  
                directPlan.planType = 'Speed';
  
                directPlan.name = 'Direct Burn';
  
                
  
                // Deduplicate if similar to Balanced
  
                const isDuplicate = balancedPlan && Math.abs(directPlan.totalTime_days - balancedPlan.totalTime_days) < 0.1;
  
                if (!isDuplicate) {
  
                    plans.push(directPlan);
  
                }
  
            }
  
        
  
        // 4. Gravity Assist (Deep Space) - V2 Feature
  
        // Only attempt if it's an interplanetary trip (not local)
  
        if (dist_start_au > 0.5) {
  
            const assistPlan = calculateAssistPlan(sys, effectiveOrigin, effectiveTarget, root, startTime, startState, {
  
                maxG: params.maxG,
  
                shipMass_kg: params.shipMass_kg,
  
                shipIsp: params.shipIsp
  
            });
  
            
  
            if (assistPlan) {
  
                assistPlan.planType = 'Complex';
  
                // Name is set inside calculateAssistPlan now
  
                plans.push(assistPlan);
  
            }
  
        }
  
      
  
    // Sort plans by Fuel Efficiency (Fuel Used ASC)
    plans.forEach(p => {
        // Mark "Efficiency" / "Assist" plans that require absurd dV (e.g. > 100 km/s) as hidden
        // because the impulsive approximation breaks down visually and practically.
        if (p.planType !== 'Speed' && p.totalDeltaV_ms > 100000) {
            p.hiddenReason = "Impractical Delta-V (>100 km/s)";
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
    }
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
    let aerobraking_dv_ms = 0;
    
    if (params.parkingOrbitRadius_au && params.parkingOrbitRadius_au > 0) {
        // Oberth Capture Logic
        const targetMassKg = (target.kind === 'body' ? (target as CelestialBody).massKg : (target as Barycenter).effectiveMassKg) || 0;
        if (targetMassKg > 0) {
            const mu_target = targetMassKg * G;
            const V_inf_mps = magnitude(subtract(targetState.v, result.v2)) * AU_M;
            const Rp_m = params.parkingOrbitRadius_au * AU_M;
            
            // Vis-Viva Equation at Periapsis of Hyperbola (Arrival Velocity at Interface)
            const V_p = Math.sqrt(V_inf_mps * V_inf_mps + 2 * mu_target / Rp_m);
            // Circular Orbit Velocity at Rp (Target Velocity)
            const V_c = Math.sqrt(mu_target / Rp_m);
            
            // Standard Propulsive Capture Burn (Stop at Rp)
            let dv_capture_mps = Math.abs(V_p - V_c);

            // --- AEROBRAKING LOGIC ---
            const targetBody = target as CelestialBody;
            const hasAtmosphere = targetBody.atmosphere && targetBody.atmosphere.pressure_bar && targetBody.atmosphere.pressure_bar > 0.001;
            
            if (hasAtmosphere && params.aerobrake && params.aerobrake.allowed) {
                const limit_mps = params.aerobrake.limit_kms * 1000;
                
                if (V_p <= limit_mps) {
                    // Safe for full aerocapture!
                    // Engine burn = 0 (Drag does all the work V_p -> V_c -> Stop)
                    // Technically we might need a small circularization burn at apoapsis, but ignore for V1.
                    aerobraking_dv_ms = dv_capture_mps;
                    dv_capture_mps = 0;
                    params.extraTags = params.extraTags || [];
                    params.extraTags.push('AEROCAPTURE');
                } else {
                    // Too fast! Must burn engines to slow down to Limit.
                    // Engine Burn = V_p - Limit
                    // Aerobraking = Limit - V_c (The rest)
                    const reduction = V_p - limit_mps;
                    
                    // We pay 'reduction' with engines.
                    // The original requirement was (V_p - V_c).
                    // New requirement is (reduction). 
                    // Wait, this assumes Limit > V_c. 
                    // If Limit < V_c (Limit is 3km/s, OrbVel is 8km/s), we can't even orbit safely? 
                    // That implies we burn to V_c, then burn to Limit? No, dragging slows us down.
                    // If V_p (Arrival) = 20, Limit = 12.
                    // We burn 8 km/s. Now V = 12.
                    // Atmos drags 12 -> 8 (Capture) -> 0.
                    // So engine cost is just (V_p - Limit).
                    
                    if (reduction < dv_capture_mps) {
                        aerobraking_dv_ms = dv_capture_mps - reduction;
                        dv_capture_mps = reduction;
                        params.extraTags = params.extraTags || [];
                        params.extraTags.push('PARTIAL-AERO');
                    } else {
                        // Limit is tighter than circular velocity? (Unlikely for planets, maybe asteroids)
                        // In this case, standard capture is cheaper/safer.
                        // Or maybe we still burn to V_c?
                    }
                }
            }

            dv2_req_au_s = dv_capture_mps / AU_M;

            // Debug Logging (Optional, disabled for brevity)
            /*
            console.log(`[TransitDebug] Capture Burn:`);
            console.log(`  Target: ${target.name}, V_p: ${(V_p/1000).toFixed(2)} km/s`);
            console.log(`  Aerobrake Allowed: ${params.aerobrake?.allowed}, Limit: ${params.aerobrake?.limit_kms}`);
            console.log(`  dV_Propulsive: ${(dv_capture_mps/1000).toFixed(2)} km/s`);
            console.log(`  dV_Aerobraked: ${(aerobraking_dv_ms/1000).toFixed(2)} km/s`);
            */

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
    const accel_mps2 = (params.maxG || 0.1) * g0;
    
    let m0 = 0; 
    let Ve = 0;
    let useRocketEq = false;

    if (params.shipMass_kg && params.shipIsp && params.shipIsp > 0) {
        useRocketEq = true;
        m0 = params.shipMass_kg;
        const isp = params.shipIsp;
        Ve = isp * g0;
    }

    // Departure Burn (Burn 1)
    let accelTime_sec = dv1_applied_mps / accel_mps2; // Constant Acceleration assumption
    
    let m1 = m0;
    let fuel1 = 0;

    if (useRocketEq) {
        fuel1 = calculateFuelMass(m0, dv1_applied_mps, params.shipIsp!);
        m1 = m0 - fuel1;
    } else {
        fuel1 = dv1_applied_mps * 0.01;
    }

    // Arrival Burn (Burn 2) - Determine Magnitude
    let dv2_applied_au_s = 0;
    
    if (params.brakeAtArrival) {
        dv2_applied_au_s = dv2_req_au_s;
    } else {
        // Manual Control: Determine dV from Time Allocation
        const brakeTimeTarget = durationSec * params.brakeRatio;
        dv2_applied_au_s = (accel_mps2 * brakeTimeTarget) / AU_M;
        if (dv2_applied_au_s > dv2_req_au_s) dv2_applied_au_s = dv2_req_au_s;
    }

    const dv2_applied_mps = dv2_applied_au_s * AU_M;
    let brakeTime_sec = dv2_applied_mps / accel_mps2;
    
    let m2 = m1;
    let fuel2 = 0;

    if (useRocketEq) {
        fuel2 = calculateFuelMass(m1, dv2_applied_mps, params.shipIsp!);
        m2 = m1 - fuel2;
    } else {
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
    
    // Dynamic Point Count: 1 point per 2 days, min 300, max 5000
    // This fixes jagged lines on long-duration transfers (e.g. Uranus/Neptune)
    const totalPoints = Math.min(5000, Math.max(300, Math.ceil(durationSec / (86400 * 2))));
    
    let accelPoints: Vector2[] = [];
    let coastPoints: Vector2[] = [];
    let brakePoints: Vector2[] = [];
    
    if (isTorchshipSundiver) {
        // Linear Interpolation for Visuals (unchanged for kinematic override cases)
        const rStart = startState.r;
        const rEnd = targetState.r;
        const dt_step = durationSec / totalPoints;
        
        let currR = rStart;
        
        for(let i=0; i<totalPoints; i++) {
             const f = (i + 1) / totalPoints;
             const absTime = startTime + (i + 1) * dt_step * 1000;
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
        // Standard Ballistic Integrator (Refactored to use shared math)
        // We integrate the full path, then split it by time
        // FIX: Add drift correction to ensure we hit the target exactly
        const fullPath = integrateBallisticPath(startState.r, result.v1, durationSec, mu_au, totalPoints, targetState.r);
        
        // Splitting Logic
        const dt_step = durationSec / fullPath.length;
        
        for(let i=0; i<fullPath.length; i++) {
             const absTime = startTime + i * dt_step * 1000;
             const pt = fullPath[i];
             
             if (absTime < accelEndTime) {
                 accelPoints.push(pt);
             } else if (absTime < brakeStartTime) {
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
    }
    
    // Calculate Distance (Arc Length)
    
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
        tags: tags,
        aerobrakingDeltaV_ms: aerobraking_dv_ms
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
    let accelTime = totalTime * ar;
    let brakeTime = totalTime * br;
    let coastTime = totalTime - accelTime - brakeTime;
    
    const accelEndTime = startTime + accelTime * 1000;
    // brakeStartTime is recalculated later if needed, but initial calc:
    // const brakeStartTime = ... (remove this const if we re-calc it later)
    // Actually, I re-calculate it as a const later in the code I inserted.
    // But the ORIGINAL const brakeStartTime is still there and might cause conflict?
    // Let's check the original code.
    // "const brakeStartTime = startTime + (accelTime + coastTime) * 1000;"
    // I need to change this to 'let' or remove it if I shadowed it.
    
    // Simplest: change them to 'let'.
    let brakeStartTime = startTime + (accelTime + coastTime) * 1000;
    const endTime = startTime + totalTime * 1000;
    
    const targetEndState = getGlobalState(sys, target, endTime);

    const segments: TransitSegment[] = [];
    const rStart = startState.r;
    const rEnd = targetEndState.r;
    
    // 5. Delta V & Fuel
    // Physical dV = a * (t_accel + t_brake)
    const dv1 = accel * accelTime;
    let dv2 = accel * brakeTime; // Theoretical braking dV based on input slider
    
    let aerobraking_dv_ms = 0;

    // Aerobraking for Direct Burn
    if (params.brakeAtArrival && params.aerobrake && params.aerobrake.allowed) {
        const targetBody = target as CelestialBody;
        if (targetBody.atmosphere && targetBody.atmosphere.pressure_bar && targetBody.atmosphere.pressure_bar > 0.001) {
            const limit_mps = params.aerobrake.limit_kms * 1000;
            const arrivalV = dv2; // Approx arrival velocity based on kinematic braking
            
            if (arrivalV <= limit_mps) {
                aerobraking_dv_ms = dv2;
                dv2 = 0; // Full Aerocapture
            } else {
                aerobraking_dv_ms = limit_mps;
                dv2 = arrivalV - limit_mps; // Partial
            }
            
            // CRITICAL FIX: Update brakeTime to reflect reduced engine usage
            // T = V / a
            const newBrakeTime = dv2 / accel;
            const timeSaved = brakeTime - newBrakeTime;
            
            brakeTime = newBrakeTime;
            coastTime += timeSaved; // Convert saved braking time to coasting
            
            // Update brake ratio for UI slider
            br = brakeTime / totalTime;
            
            // Recalculate visual timings
            // Note: accelEndTime is unchanged
            // brakeStartTime needs update
            // brakeStartTime was: startTime + (accelTime + OLD_coastTime) * 1000
            // now: startTime + (accelTime + NEW_coastTime) * 1000
            // Since coastTime increased, brakeStartTime moves later. Correct.
        }
    } else if (params.brakeAtArrival) {
        // Standard Propulsive Braking
        // We trust the slider input 'br' (brakeRatio). 
        // brakeTime is already set. dv2 is already set.
    } else {
        // Flyby (No braking)
        // dv2 was calculated as accel * brakeTime, but if brakeAtArrival is false, 
        // usually brakeRatio is passed as 0 or ignored?
        // In calculateFastPlan, we use 'br' which comes from params.brakeRatio OR 0 if not braking?
        // Wait, logic at top: 
        // let br = params.brakeAtArrival ? ar : params.brakeRatio;
        // If brakeAtArrival is false, br = params.brakeRatio.
        // If user set brakeRatio to 0 for flyby, then dv2 is 0. Correct.
    }
    
    // Re-calculate intermediate timestamps for visualizer
    // (We must update these local variables because they are used in makePoints calls below)
    brakeStartTime = startTime + (accelTime + coastTime) * 1000; 

    // Add cost to cancel initial velocity vector (Simplification: Assume we must kill initial V to start fresh)
    // This prevents underestimating fuel for U-turns (e.g. flyby Earth at 7000km/s -> return to Uranus)
    // Real physics would vector add, but "Stop then Go" is a safe conservative estimate for a "Direct" plan.
    const v_init_ms = magnitude(startState.v) * AU_M;
    // Only add if significant (> 100 m/s)
    const dv_initial_cancel = v_init_ms > 100 ? v_init_ms : 0;

    const totalDeltaV_ms = dv1 + dv2 + dv_initial_cancel;
    
    // Arrival Velocity Remainder
    const arrivalVelocity_ms = Math.abs(accel * (accelTime - brakeTime));

    let fuelEst = 0;
    let fuel1 = 0;
    let fuel2 = 0;
    
    if (params.shipMass_kg && params.shipIsp && params.shipIsp > 0) {
        const m0 = params.shipMass_kg;
        
        // Burn 0 (Cancel Initial V) - Conceptually part of Departure
        const f0 = calculateFuelMass(m0, dv_initial_cancel, params.shipIsp);
        let m_curr = m0 - f0;

        // Burn 1 (Accel)
        fuel1 = calculateFuelMass(m_curr, dv1, params.shipIsp);
        m_curr -= fuel1;
        
        // Burn 2 (Brake)
        fuel2 = calculateFuelMass(m_curr, dv2, params.shipIsp);
        
        fuelEst = f0 + fuel1 + fuel2;
        // Attribute cancellation fuel to fuel1 for display simplicity
        fuel1 += f0;
    } else {
        fuelEst = totalDeltaV_ms * 0.01;
        fuel1 = fuelEst * ((dv1 + dv_initial_cancel) / totalDeltaV_ms);
        fuel2 = fuelEst * (dv2 / totalDeltaV_ms);
    }

    // Calculate Final Velocity Vector for Chaining
    let finalVelocity = targetEndState.v; // Default to matching target (Brake)
    
    if (!params.brakeAtArrival) {
        // Flyby: Add residual velocity vector
        // Direction: From Start to End
        const dx = rEnd.x - rStart.x;
        const dy = rEnd.y - rStart.y;
        const mag = Math.sqrt(dx*dx + dy*dy);
        
        if (mag > 0) {
            const dirX = dx / mag;
            const dirY = dy / mag;
            
            // arrivalVelocity_ms is scalar. Convert to AU/s.
            const v_resid_au_s = arrivalVelocity_ms / AU_M;
            
            finalVelocity = {
                x: targetEndState.v.x + dirX * v_resid_au_s,
                y: targetEndState.v.y + dirY * v_resid_au_s
            };
        }
    }

    // Helper to generate points on the line (Linear Interpolation)
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
            endState: { r: targetEndState.r, v: finalVelocity }, // Use calculated final velocity
            hostId: root.id,
            pathPoints: makePoints(brakeStartTime, endTime),
            warnings: ['High G'],
            fuelUsed_kg: fuel2
        });
    } else if (segments.length > 0) {
        // If no brake segment, update the last segment (Coast or Accel)
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
        arrivalPlacement: (params as any).arrivalPlacement, // Pass through if available
        isKinematic: true, // Mark this plan as kinematic for visualizer
        aerobrakingDeltaV_ms: aerobraking_dv_ms
    };
}
