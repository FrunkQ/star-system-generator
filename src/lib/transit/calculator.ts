import type { System, CelestialBody, Barycenter } from '../types';
import type { TransitPlan, TransitSegment, TransitMode, Vector2, StateVector, BurnPoint } from './types';
import { propagateState, solveLambert, distanceAU, subtract, magnitude } from './math';
import { AU_KM, G } from '../constants';

const AU_M = AU_KM * 1000;
const DAY_S = 86400;

export function calculateTransitPlan(
  sys: System,
  originId: string,
  targetId: string,
  startTime: number, // ms
  mode: TransitMode,
  params: { maxG: number; burnCoastRatio: number; interceptSpeed_ms: number; shipMass_kg?: number; shipIsp?: number; brakeAtArrival?: boolean }
): TransitPlan | null {
  // 1. Find Nodes
  const origin = sys.nodes.find(n => n.id === originId);
  const target = sys.nodes.find(n => n.id === targetId);
  const root = sys.nodes.find(n => n.parentId === null);
  
  if (!origin || !target || !root) return null;

  const startState = propagateState(origin, startTime);
  const startPos = startState.r;
  
  // 2. Calculate Baselines
  const mu = (root.kind === 'body' ? (root as CelestialBody).massKg : (root as Barycenter).effectiveMassKg || 0) * G;
  if (!mu || mu <= 0) return null;
  
  // Economy Baseline (Hohmann-ish)
  const r1 = magnitude(startPos);
  const r2 = target.orbit ? target.orbit.elements.a_AU : r1;
  const r1_m = r1 * AU_M;
  const r2_m = r2 * AU_M;
  const t_hohmann_sec = Math.PI * Math.sqrt(Math.pow(r1_m + r2_m, 3) / (8 * mu));
  
  // Fast Baseline (Brachistochrone) for lower limit
  const targetStartPos = propagateState(target, startTime).r;
  const dist_m = distanceAU(startPos, targetStartPos) * AU_M;
  const accel = (params.maxG || 0.1) * 9.81;
  
  let t_fast_sec = 0;
  if (params.brakeAtArrival) {
      // Flip and Burn: T = 2 * sqrt(D/a)
      t_fast_sec = 2 * Math.sqrt(dist_m / accel);
  } else {
      // Constant Accel (Flyby): D = 0.5 * a * T^2 -> T = sqrt(2D/a)
      t_fast_sec = Math.sqrt(2 * dist_m / accel);
  }

  // Iterative Solver for Variable Burn (Unified Model)
  // Goal: Find T such that DeltaV_Lambert(T) <= Available_dV(T)
  
  const ratio = Math.max(0.01, params.burnCoastRatio); // Min 1% burn
  
  // Bounds
  let t_min = t_fast_sec; 
  let t_max = t_hohmann_sec * 2.0; 
  
  let loops = 0;
  let bestT = t_hohmann_sec;
  let foundSolution = false;
  
  while (loops < 50) {
      const t_curr = (t_min + t_max) / 2;
      
      // 1. Available dV
      // Apply 0.5 efficiency factor because Lambert (Impulsive) is ~2x more efficient than Constant Thrust
      // for the same trajectory. This aligns the 100% slider to the Brachistochrone limit.
      const dV_avail_ms = accel * (t_curr * ratio) * 0.5;
      
      // 2. Required dV from Lambert
      const arrivalTime = startTime + t_curr * 1000;
      const targetState = propagateState(target, arrivalTime);
      const mu_au = mu / Math.pow(AU_M, 3);
      
      const result = solveLambert(startState.r, targetState.r, t_curr, mu_au);
      
      if (!result) {
          // Lambert failed (usually t_curr too small for geometry).
          t_min = t_curr; 
          loops++;
          continue;
      }
      
      const dv1 = magnitude(subtract(result.v1, startState.v));
      const dv2 = params.brakeAtArrival ? magnitude(subtract(targetState.v, result.v2)) : 0;
      const dV_req_ms = (dv1 + dv2) * AU_M;
      
      // 3. Compare
      if (dV_avail_ms >= dV_req_ms) {
          // Feasible! Try to go faster.
          bestT = t_curr;
          t_max = t_curr;
          foundSolution = true;
      } else {
          // Not enough power. Go slower.
          t_min = t_curr;
      }
      loops++;
  }
  
  // Fallback: If Lambert solver never worked (e.g. extreme distances or ratio=1.0 causing t_min to stick),
  // and ratio is high, use Fast Plan as kinematic fallback.
  if (!foundSolution && params.burnCoastRatio > 0.8) {
      return calculateFastPlan(origin, target, root, startTime, startState, params);
  }
  
  return calculateLambertPlan(origin, target, root, startTime, startState, bestT, mu, params);
}

function calculateLambertPlan(
    origin: CelestialBody | Barycenter,
    target: CelestialBody | Barycenter,
    root: CelestialBody | Barycenter,
    startTime: number,
    startState: StateVector,
    durationSec: number,
    mu: number,
    params: { shipMass_kg?: number; shipIsp?: number; brakeAtArrival?: boolean; interceptSpeed_ms: number; burnCoastRatio: number; maxG: number }
): TransitPlan | null {
    const arrivalTime = startTime + durationSec * 1000;
    const targetState = propagateState(target, arrivalTime);
    const mu_au = mu / Math.pow(AU_M, 3);
    
    const result = solveLambert(startState.r, targetState.r, durationSec, mu_au);
    
    if (!result) {
        console.warn("Lambert solver failed for t=" + durationSec);
        return null;
    }
    
    // Calculate Geometric Delta V (for trajectory solver)
    const dv1 = magnitude(subtract(result.v1, startState.v));
    const arrivalRelV = magnitude(subtract(result.v2, targetState.v));
    const dv2 = params.brakeAtArrival ? arrivalRelV : 0;
    // const geometricDeltaV_ms = (dv1 + dv2) * AU_M; 
    
    const arrivalVelocity_ms = params.brakeAtArrival ? 0 : arrivalRelV * AU_M;
    
    // Segment Generation & Physical Delta V Calculation
    const ratio = params.burnCoastRatio || 0.05;
    
    let accelTime = 0;
    let brakeTime = 0;
    
    if (params.brakeAtArrival) {
        accelTime = durationSec * ratio / 2;
        brakeTime = durationSec * ratio / 2;
    } else {
        accelTime = durationSec * ratio;
        brakeTime = 0;
    }
    
    const coastTime = durationSec - accelTime - brakeTime;
    
    // Calculate Physical Delta V based on burn time
    const accel = params.maxG * 9.81;
    const physicalDeltaV_ms = accel * (accelTime + brakeTime);
    
    // Fuel
    let fuelEst = 0;
    if (params.shipMass_kg && params.shipIsp && params.shipIsp > 0) {
        const g0 = 9.81;
        const m_final = params.shipMass_kg / Math.exp(physicalDeltaV_ms / (params.shipIsp * g0));
        fuelEst = params.shipMass_kg - m_final;
    } else {
        fuelEst = physicalDeltaV_ms * 0.01;
    }
    
    // We generate points for the whole arc, then slice them.
    const totalPoints = 100;
    const dt = durationSec / totalPoints;
    
    const accelPoints: Vector2[] = [];
    const coastPoints: Vector2[] = [];
    const brakePoints: Vector2[] = [];
    
    let currR = startState.r;
    let currV = result.v1;
    
    // Add start point
    accelPoints.push(currR);
    
    for(let i=0; i<totalPoints; i++) {
         // Current time relative to start
         const t = i * dt;
         
         // Integrate
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
         
         // Distribute to segments
         if (t < accelTime) {
             accelPoints.push(currR);
         } else if (t < (accelTime + coastTime)) {
             if (coastPoints.length === 0 && accelPoints.length > 0) coastPoints.push(accelPoints[accelPoints.length-1]);
             coastPoints.push(currR);
         } else {
             if (brakePoints.length === 0 && coastPoints.length > 0) brakePoints.push(coastPoints[coastPoints.length-1]);
             brakePoints.push(currR);
         }
    }
    
    // Calculate Distance (Arc Length)
    let distance_au = 0;
    for(let i=0; i<accelPoints.length-1; i++) distance_au += distanceAU(accelPoints[i], accelPoints[i+1]);
    if (coastPoints.length > 0) {
       for(let i=0; i<coastPoints.length-1; i++) distance_au += distanceAU(coastPoints[i], coastPoints[i+1]);
    }
    if (brakePoints.length > 0) {
       for(let i=0; i<brakePoints.length-1; i++) distance_au += distanceAU(brakePoints[i], brakePoints[i+1]);
    }
    
    const segments: TransitSegment[] = [];
    
    if (accelPoints.length > 1) {
        segments.push({
            id: 'seg-accel',
            type: 'Accel',
            startTime: startTime,
            endTime: startTime + accelTime * 1000,
            startState: { r: startState.r, v: result.v1 },
            endState: { r: {x:0,y:0}, v: {x:0,y:0} }, 
            hostId: root.id,
            pathPoints: accelPoints,
            warnings: [],
            fuelUsed_kg: fuelEst * 0.5
        });
    }
    
    if (coastPoints.length > 1) {
        segments.push({
            id: 'seg-coast',
            type: 'Coast',
            startTime: startTime + accelTime * 1000,
            endTime: startTime + (accelTime + coastTime) * 1000,
            startState: { r: {x:0,y:0}, v: {x:0,y:0} },
            endState: { r: {x:0,y:0}, v: {x:0,y:0} },
            hostId: root.id,
            pathPoints: coastPoints,
            warnings: [],
            fuelUsed_kg: 0
        });
    }
    
    if (brakePoints.length > 1 && params.brakeAtArrival) {
        segments.push({
            id: 'seg-brake',
            type: 'Brake',
            startTime: startTime + (accelTime + coastTime) * 1000,
            endTime: startTime + durationSec * 1000,
            startState: { r: {x:0,y:0}, v: {x:0,y:0} },
            endState: { r: {x:0,y:0}, v: {x:0,y:0} },
            hostId: root.id,
            pathPoints: brakePoints,
            warnings: [],
            fuelUsed_kg: fuelEst * 0.5
        });
    } else if (brakePoints.length > 1) {
        segments.push({
            id: 'seg-flyby',
            type: 'Coast', 
            startTime: startTime + (accelTime + coastTime) * 1000,
            endTime: startTime + durationSec * 1000,
            startState: { r: {x:0,y:0}, v: {x:0,y:0} },
            endState: { r: {x:0,y:0}, v: {x:0,y:0} },
            hostId: root.id,
            pathPoints: brakePoints,
            warnings: ['Flyby'],
            fuelUsed_kg: 0
        });
    }

    return {
        id: 'plan-' + Date.now(),
        originId: origin.id,
        targetId: target.id,
        startTime: startTime,
        mode: 'Economy',
        segments,
        burns: [], 
        totalDeltaV_ms: physicalDeltaV_ms,
        totalTime_days: durationSec / DAY_S,
        totalFuel_kg: fuelEst,
        distance_au: distance_au,
        isValid: true,
        maxG: 0,
        burnCoastRatio: params.burnCoastRatio,
        interceptSpeed_ms: params.interceptSpeed_ms,
        arrivalVelocity_ms: arrivalVelocity_ms
    };
}

function calculateFastPlan(
    origin: CelestialBody | Barycenter, 
    target: CelestialBody | Barycenter, 
    root: CelestialBody | Barycenter, 
    startTime: number,
    startState: StateVector,
    params: { maxG: number; shipMass_kg?: number; shipIsp?: number; brakeAtArrival?: boolean }
): TransitPlan | null {
    // Brachistochrone Approximation
    
    const accel = params.maxG * 9.81; // m/s^2
    if (accel <= 0) return null;

    let t_est = 0;
    let loops = 0;
    
    // Initial Distance
    const initialDist_m = distanceAU(startState.r, propagateState(target, startTime).r) * AU_M;
    t_est = 2 * Math.sqrt(initialDist_m / accel);

    // Iteratively refine T based on moving target
    while(loops < 5) {
        const targetPos = propagateState(target, startTime + t_est * 1000).r;
        const dist_m = distanceAU(startState.r, targetPos) * AU_M;
        t_est = 2 * Math.sqrt(dist_m / accel);
        loops++;
    }

    // If no brake, we just accelerate the whole way?
    // Or we accelerate to hit it? 
    // Fast Plan (Brachistochrone) assumes flip and burn at midpoint.
    // If No Brake (Flyby), we just Accelerate the whole way?
    // Yes, constant acceleration for t_est?
    // T = sqrt(2D/a).
    
    let totalDeltaV_ms = accel * t_est; // Normal: Accel + Decel = 2 * (accel * t/2) = accel * t
    let arrivalVelocity_ms = 0;
    
    if (!params.brakeAtArrival) {
        // Continuous Acceleration -> T = sqrt(2D/a)
        // But we calculated T based on 2*sqrt(D/a).
        // Let's recalulate T for flyby
        let t_flyby = Math.sqrt(2 * initialDist_m / accel);
        // Refine
        loops = 0;
        while(loops < 5) {
             const targetPos = propagateState(target, startTime + t_flyby * 1000).r;
             const dist_m = distanceAU(startState.r, targetPos) * AU_M;
             t_flyby = Math.sqrt(2 * dist_m / accel);
             loops++;
        }
        t_est = t_flyby;
        totalDeltaV_ms = accel * t_est;
        arrivalVelocity_ms = totalDeltaV_ms; // Rough approx: relative speed is accumulated accel
    }
    
    let fuelEst = 0;
    if (params.shipMass_kg && params.shipIsp && params.shipIsp > 0) {
        const g0 = 9.81;
        const m_final = params.shipMass_kg / Math.exp(totalDeltaV_ms / (params.shipIsp * g0));
        fuelEst = params.shipMass_kg - m_final;
    } else {
        fuelEst = totalDeltaV_ms * 0.1; // Placeholder
    }
    
    // Visualization Points
    const pathPoints1: Vector2[] = [];
    const pathPoints2: Vector2[] = [];
    const endTime = startTime + t_est*1000;
    const targetEndState = propagateState(target, endTime);
    
    if (params.brakeAtArrival) {
        const midTime = startTime + (t_est/2)*1000;
        const midPoint = { 
            x: (startState.r.x + targetEndState.r.x) / 2, 
            y: (startState.r.y + targetEndState.r.y) / 2 
        };
        // Segment 1: Start to Mid
        for(let i=0; i<=20; i++) {
            const f = i/20;
            pathPoints1.push({
                x: startState.r.x + (midPoint.x - startState.r.x) * f,
                y: startState.r.y + (midPoint.y - startState.r.y) * f
            });
        }
        // Segment 2: Mid to End
        for(let i=0; i<=20; i++) {
            const f = i/20;
            pathPoints2.push({
                x: midPoint.x + (targetEndState.r.x - midPoint.x) * f,
                y: midPoint.y + (targetEndState.r.y - midPoint.y) * f
            });
        }
        
        // Calc Distance
        let distance_au = 0;
        for(let i=0; i<pathPoints1.length-1; i++) distance_au += distanceAU(pathPoints1[i], pathPoints1[i+1]);
        for(let i=0; i<pathPoints2.length-1; i++) distance_au += distanceAU(pathPoints2[i], pathPoints2[i+1]);

        const segments: TransitSegment[] = [
            {
                 id: 'seg-burn-1',
                 type: 'Accel',
                 startTime: startTime,
                 endTime: midTime,
                 startState: startState,
                 endState: { r: midPoint, v: {x:0,y:0} }, 
                 hostId: root.id,
                 pathPoints: pathPoints1,
                 warnings: ['High G'],
                 fuelUsed_kg: fuelEst / 2
            },
            {
                 id: 'seg-burn-2',
                 type: 'Brake',
                 startTime: midTime,
                 endTime: endTime,
                 startState: { r: midPoint, v: {x:0,y:0} },
                 endState: { r: targetEndState.r, v: {x:0,y:0} },
                 hostId: root.id,
                 pathPoints: pathPoints2,
                 warnings: ['High G'],
                 fuelUsed_kg: fuelEst / 2
            }
        ];
        return {
                id: 'plan-fast-' + Date.now(),
                originId: origin.id,
                targetId: target.id,
                startTime: startTime,
                mode: 'Fast',
                segments,
                burns: [],
                totalDeltaV_ms: totalDeltaV_ms,
                totalTime_days: t_est / DAY_S,
                totalFuel_kg: fuelEst,
                isValid: true,
                maxG: params.maxG,
                burnCoastRatio: 1.0,
                interceptSpeed_ms: 0,
                arrivalVelocity_ms: 0,
                distance_au: distance_au
        };
    } else {
        // Continuous Burn Flyby (1 Segment)
        for(let i=0; i<=40; i++) {
            const f = i/40;
            pathPoints1.push({
                x: startState.r.x + (targetEndState.r.x - startState.r.x) * f,
                y: startState.r.y + (targetEndState.r.y - startState.r.y) * f
            });
        }
        
        let distance_au = 0;
        for(let i=0; i<pathPoints1.length-1; i++) distance_au += distanceAU(pathPoints1[i], pathPoints1[i+1]);

        const segments: TransitSegment[] = [
            {
                 id: 'seg-burn-flyby',
                 type: 'Accel',
                 startTime: startTime,
                 endTime: endTime,
                 startState: startState,
                 endState: targetEndState, 
                 hostId: root.id,
                 pathPoints: pathPoints1,
                 warnings: ['High G', 'Flyby'],
                 fuelUsed_kg: fuelEst
            }
        ];
        return {
                id: 'plan-fast-flyby-' + Date.now(),
                originId: origin.id,
                targetId: target.id,
                startTime: startTime,
                mode: 'Fast',
                segments,
                burns: [],
                totalDeltaV_ms: totalDeltaV_ms,
                totalTime_days: t_est / DAY_S,
                totalFuel_kg: fuelEst,
                isValid: true,
                maxG: params.maxG,
                burnCoastRatio: 1.0,
                interceptSpeed_ms: 0,
                arrivalVelocity_ms: arrivalVelocity_ms,
                distance_au: distance_au
        };
    }
}