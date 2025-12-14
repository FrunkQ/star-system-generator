import type { System, CelestialBody, Barycenter } from '../types';
import type { TransitPlan, TransitSegment, StateVector, Vector2 } from './types';
import { solveLambert, propagateState, magnitude, subtract, distanceAU, integrateBallisticPath, dot } from './math';
import { getGlobalState, calculateFuelMass } from './physics';
import { AU_KM, G } from '../constants';

const AU_M = AU_KM * 1000;

interface AssistCandidate {
    body: CelestialBody | Barycenter;
    score: number; // Higher is better (mass, positioning)
}

/**
 * Identifies potential gravity assist bodies in the system.
 * Filters for massive bodies (Gas Giants) that are somewhat "between" orbit-wise or larger than origin.
 */
function findAssistCandidates(sys: System, origin: CelestialBody | Barycenter, target: CelestialBody | Barycenter): AssistCandidate[] {
    const candidates: AssistCandidate[] = [];
    
    // Determine Common Parent (Context)
    // If both orbit the same thing (e.g. Earth/Mars orbit Sun), that's the context.
    // If one is a moon (Moon) and one is a planet (Mars), context is Sun?
    // No, Moon -> Mars implies Escape Earth -> Heliocentric -> Mars.
    // The assist candidates should be Heliocentric bodies.
    // Heuristic: The "Transit Space" is defined by the highest-level common container?
    // Actually, usually we just want "Major Bodies in the System".
    // If we are doing Interplanetary, we want Planets.
    // If we are doing Jovian Tour, we want Moons.
    
    // Simple robust check:
    // If Origin and Target are both Moons of same planet -> Context is Planet.
    // Else -> Context is Star (Root).
    
    let contextParentId: string | null = null;
    if (origin.parentId === target.parentId && origin.parentId) {
        contextParentId = origin.parentId;
    } else {
        const root = sys.nodes.find(n => n.parentId === null);
        contextParentId = root ? root.id : null;
    }

    const originA = origin.orbit?.elements.a_AU || 1;
    const targetA = target.orbit?.elements.a_AU || 1;
    const minA = Math.min(originA, targetA);
    const maxA = Math.max(originA, targetA);

    for (const node of sys.nodes) {
        // Skip self, origin, target
        if (node.id === origin.id || node.id === target.id) continue;
        if (node.kind !== 'body' && node.kind !== 'barycenter') continue;
        if (!node.orbit) continue; 
        
        // PARENT FILTER: Candidate must orbit the Context Parent.
        // This prevents Ganymede (orbiting Jupiter) from being a candidate for Earth->Venus (Context Sun).
        if (node.parentId !== contextParentId) continue;
        
        // Skip low mass bodies
        // 3e23 filters small moons/asteroids but keeps Mercury (3.3e23) and Mars (6.4e23).
        const mass = (node.kind === 'body' ? (node as CelestialBody).massKg : (node as Barycenter).effectiveMassKg) || 0;
        if (mass < 3e23) continue; 

        // Heuristic: Is it accessible?
        // ... (rest of scoring logic)
        // For now, just grab the big ones.
        // Bonus if it's "between" the orbits (e.g. Earth -> Jupiter -> Saturn)
        // or if it's an Outer Planet for a Sundiver.
        
        let score = Math.log10(mass);
        
        // Penalize if it requires going WAY out of the way?
        // e.g. Earth (1 AU) -> Pluto (40 AU) -> Mars (1.5 AU) is dumb.
        const nodeA = node.orbit.elements.a_AU;
        if (nodeA > maxA * 1.5 || nodeA < minA * 0.5) {
            score -= 5;
        }

        candidates.push({ body: node, score });
        // console.log(`  Candidate: ${node.name}, Mass: ${mass.toExponential(1)}, Score: ${score.toFixed(1)}`);
    }

    const result = candidates.sort((a, b) => b.score - a.score).slice(0, 3); // Top 3 only
    if (result.length > 0) console.log(`[AssistDebug] Selected Candidates: ${result.map(c => c.body.name).join(', ')}`);
    return result;
}

/**
 * Tries to find a Gravity Assist trajectory: Origin -> Flyby -> Target
 */
export function calculateAssistPlan(
    sys: System,
    origin: CelestialBody | Barycenter,
    target: CelestialBody | Barycenter,
    root: CelestialBody | Barycenter,
    startTime: number,
    startState: StateVector,
    params: { maxG: number; shipMass_kg?: number; shipIsp?: number; }
): TransitPlan | null {
    
    const candidates = findAssistCandidates(sys, origin, target);
    if (candidates.length === 0) return null;

    const mu = (root.kind === 'body' ? (root as CelestialBody).massKg : (root as Barycenter).effectiveMassKg || 0) * G;
    const mu_au = mu / Math.pow(AU_M, 3);
    
    // Iterate through candidates (best first)
    for (const cand of candidates) {
        const flybyBody = cand.body;
        
        // --- Heuristic Timing ---
        // 1. Estimate Transfer Time T1 (Origin -> Flyby)
        // Using Hohmann approximation
        const r1 = magnitude(startState.r);
        const flybyStartState = getGlobalState(sys, flybyBody, startTime);
        const r2 = magnitude(flybyStartState.r);
        const t_hohmann1 = Math.PI * Math.sqrt(Math.pow((r1 + r2) * AU_M / 2, 3) / mu);
        
        // 2. Estimate Transfer Time T2 (Flyby -> Target)
        // We'll calculate this dynamically later based on T1
        
        // Search Window for Leg 1: 0.7x to 1.3x Hohmann
        const t1_min = t_hohmann1 * 0.7;
        const t1_max = t_hohmann1 * 1.3;
        const steps1 = 8; // Coarse search
        
        for (let i = 0; i < steps1; i++) {
            const dt1 = t1_min + (t1_max - t1_min) * (i / (steps1 - 1));
            const arrivalTime = startTime + dt1 * 1000;
            const flybyStateAtArrival = getGlobalState(sys, flybyBody, arrivalTime);
            
            // Solve Leg 1 (Origin -> Flyby)
            const leg1 = solveLambert(startState.r, flybyStateAtArrival.r, dt1, mu_au);
            if (!leg1) continue;
            
            // Calculate Arrival V_inf (Relative Velocity at Flyby)
            // V_inf_in = V_spacecraft - V_planet
            const v_inf_in = subtract(leg1.v2, flybyStateAtArrival.v);
            const v_inf_mag = magnitude(v_inf_in);
            
            // Now search for Leg 2 (Flyby -> Target)
            // We want V_inf_out such that |V_inf_out| ~= |V_inf_in|
            
            const r3 = (target.orbit?.elements.a_AU || 1.5); // Approximate
            const t_hohmann2 = Math.PI * Math.sqrt(Math.pow((r2 + r3) * AU_M / 2, 3) / mu);
            
            const t2_min = t_hohmann2 * 0.7;
            const t2_max = t_hohmann2 * 1.3;
            const steps2 = 8;
            
            for (let j = 0; j < steps2; j++) {
                const dt2 = t2_min + (t2_max - t2_min) * (j / (steps2 - 1));
                const targetTime = arrivalTime + dt2 * 1000;
                const targetStateAtEnd = getGlobalState(sys, target, targetTime);
                
                // Solve Leg 2 (Flyby -> Target)
                const leg2 = solveLambert(flybyStateAtArrival.r, targetStateAtEnd.r, dt2, mu_au);
                if (!leg2) continue;
                
                // Calculate Departure V_inf
                // V_inf_out = V_spacecraft - V_planet
                const v_inf_out = subtract(leg2.v1, flybyStateAtArrival.v);
                const v_inf_out_mag = magnitude(v_inf_out);
                
                // --- MATCHING LOGIC ---
                // 1. Magnitude Check (Energy Conservation)
                // In a powered assist, we can add dV, but efficient assists imply mostly passive turn.
                // Allow 10% mismatch or fixed dV budget at periapsis?
                // Let's assume we can burn at periapsis to fix mismatch, but we want to minimize it.
                // Or better: V_inf_in + dV_burn = V_inf_out.
                // Cost = | |V_out| - |V_in| | (Speed change) + Turn Cost.
                
                // Simplification: Check relative error
                const speedDiff = Math.abs(v_inf_mag - v_inf_out_mag);
                const avgSpeed = (v_inf_mag + v_inf_out_mag) / 2;
                
                // If speeds differ by more than 20%, it's probably not a good assist match
                if (speedDiff / avgSpeed > 0.2) {
                    // console.log(`[AssistDebug] Reject Speed Mismatch: V_in=${(v_inf_mag*AU_KM).toFixed(1)}, V_out=${(v_inf_out_mag*AU_KM).toFixed(1)} km/s`);
                    continue; 
                }
                
                // 2. Turn Angle Check
                // Max turn angle depends on V_inf and Planet Mass/Radius
                // delta = 2 * asin(1 / (1 + (r_p * v_inf^2 / mu_planet)))
                // We inverse this to find required r_p.
                // angle between v_inf_in and v_inf_out
                const dotProd = dot(v_inf_in, v_inf_out);
                const angle = Math.acos(dotProd / (v_inf_mag * v_inf_out_mag));
                
                const planetMass = (flybyBody.kind === 'body' ? (flybyBody as CelestialBody).massKg : 0) || 1e24;
                const planetMu = planetMass * G;
                const planetRadius = (flybyBody.kind === 'body' ? (flybyBody as CelestialBody).radiusKm : 6000) || 6000;
                const r_planet_m = planetRadius * 1000;
                
                // Calculate Required Periapsis (r_p) for this turn
                // turn_angle = 2 * asin(1 / e_hyp)
                // e_hyp = 1 + (r_p * v_inf^2 / mu)
                // sin(angle/2) = 1 / e_hyp
                // e_hyp = 1 / sin(angle/2)
                // r_p = (e_hyp - 1) * mu / v_inf^2
                
                const v_inf_mps = avgSpeed * AU_M;
                const e_hyp = 1 / Math.sin(angle / 2);
                const r_p_req = (e_hyp - 1) * planetMu / (v_inf_mps * v_inf_mps);
                
                // Is this periapsis safe? (Above surface/atmosphere)
                const safeAltitude = 200000; // 200km buffer
                if (r_p_req < r_planet_m + safeAltitude) {
                    // Turn is too sharp for this speed!
                    // console.log(`[AssistDebug] Reject Turn Angle: Req Rp ${(r_p_req/1000).toFixed(0)}km < Limit ${(r_planet_m/1000).toFixed(0)}km`);
                    continue; 
                }

                console.log(`[AssistDebug] FOUND PLAN! ${origin.name} -> ${flybyBody.name} -> ${target.name}`);
                // If we got here, this is a VALID Assist!
                // Calculate Costs
                // dV1 = Departure from Origin
                const v_dep = magnitude(subtract(leg1.v1, startState.v)) * AU_M;
                
                // dV_assist = 0 (Passive) + Speed Matching Burn?
                // Actually, if we burn at periapsis, it's very efficient (Oberth).
                // dV_burn = sqrt(V_inf_out^2 + 2mu/rp) - sqrt(V_inf_in^2 + 2mu/rp)
                // We pick r_p to match the ANGLE. 
                // Then the speed change cost is the difference in periapsis velocities.
                const v_p_in = Math.sqrt(v_inf_mag*v_inf_mag*AU_M*AU_M + 2*planetMu/r_p_req);
                const v_p_out = Math.sqrt(v_inf_out_mag*v_inf_out_mag*AU_M*AU_M + 2*planetMu/r_p_req);
                const dv_assist = Math.abs(v_p_out - v_p_in);
                
                // dV2 = Arrival at Target (Brake)
                const v_arr = magnitude(subtract(targetStateAtEnd.v, leg2.v2)) * AU_M;
                
                const totalDV = v_dep + dv_assist + v_arr;
                
                // Build Plan Object
                return buildAssistTransitPlan(
                    sys, origin, target, root, flybyBody, 
                    startTime, arrivalTime, targetTime,
                    startState, leg1, leg2, 
                    v_dep, dv_assist, v_arr,
                    params
                );
            }
        }
    }
    
    return null;
}

function buildAssistTransitPlan(
    sys: System,
    origin: CelestialBody | Barycenter,
    target: CelestialBody | Barycenter,
    root: CelestialBody | Barycenter,
    flybyBody: CelestialBody | Barycenter,
    t1: number, t2: number, t3: number,
    s1: StateVector, leg1: {v1: Vector2, v2: Vector2}, leg2: {v1: Vector2, v2: Vector2},
    dv1: number, dv_assist: number, dv3: number,
    params: { maxG: number; shipMass_kg?: number; shipIsp?: number; }
): TransitPlan {
    const totalTimeDays = (t3 - t1) / (1000 * 86400);
    const totalDV = dv1 + dv_assist + dv3;
    
    // Fuel Calculation
    let fuelEst = 0;
    if (params.shipMass_kg && params.shipIsp) {
        let m = params.shipMass_kg;
        const f1 = calculateFuelMass(m, dv1, params.shipIsp);
        m -= f1;
        const f2 = calculateFuelMass(m, dv_assist, params.shipIsp);
        m -= f2;
        const f3 = calculateFuelMass(m, dv3, params.shipIsp);
        fuelEst = f1 + f2 + f3;
    } else {
        fuelEst = totalDV * 0.05; // Fallback
    }
    
    // Generate Segments for Visualization
    const mu = (root.kind === 'body' ? (root as CelestialBody).massKg : (root as Barycenter).effectiveMassKg || 0) * G;
    const mu_au = mu / Math.pow(AU_M, 3);

    // Hyperbolic Flyby Segment Logic
    // We chop 2 days off the end of Leg 1 and start of Leg 2 to insert a detailed flyby
    const FLYBY_DURATION_DAYS = 2.0;
    const flybyDtSec = FLYBY_DURATION_DAYS * 86400;
    
    const t1_end = t2 - flybyDtSec * 1000;
    const t2_start = t2 + flybyDtSec * 1000;
    
    // Dynamic steps for long coasts
    const steps1 = Math.min(2000, Math.max(100, Math.ceil((t1_end - t1) / (1000 * 86400 * 2))));
    const steps2 = Math.min(2000, Math.max(100, Math.ceil((t3 - t2_start) / (1000 * 86400 * 2))));

    // LEG 1 Path (Truncated) - WITH DRIFT CORRECTION
    // We generate the FULL path to T2 (Flyby Center), force it to hit the Planet, then slice it back.
    const flybyCenterState = getGlobalState(sys, flybyBody, t2);
    
    // Integrate fully to T2 with correction
    const leg1FullPoints = integrateBallisticPath(
        s1.r, 
        leg1.v1, 
        (t2 - t1) / 1000, 
        mu_au, 
        steps1 + 10, // Add a few steps buffer
        flybyCenterState.r // Force hit Jupiter center
    );
    
    // Find the slice point for T1_end
    // t1_end is 'flybyDtSec' before t2
    const sliceIndex = Math.floor(leg1FullPoints.length * ((t1_end - t1) / (t2 - t1)));
    const leg1Points = leg1FullPoints.slice(0, sliceIndex + 1);
    
    const p1 = leg1Points[leg1Points.length - 1];
    const v1 = leg1.v2; 

    // Bezier Calculations...
    const gapPoints = integrateBallisticPath(getGlobalState(sys, flybyBody, t2).r, leg2.v1, flybyDtSec, mu_au, 10);
    const p2 = gapPoints[gapPoints.length - 1];
    
    // ... Bezier Loop ... (Unchanged)
    const flybyPoints: Vector2[] = [];
    const stepsFlyby = 20;
    const handleScale = (t2_start - t1_end) / 1000 / 3; 
    const cp1 = { x: p1.x + leg1.v2.x * handleScale, y: p1.y + leg1.v2.y * handleScale };
    const cp2 = { x: p2.x - leg2.v1.x * handleScale, y: p2.y - leg2.v1.y * handleScale };
    for (let i = 0; i <= stepsFlyby; i++) {
        const t = i / stepsFlyby;
        const mt = 1 - t;
        const x = mt*mt*mt*p1.x + 3*mt*mt*t*cp1.x + 3*mt*t*t*cp2.x + t*t*t*p2.x;
        const y = mt*mt*mt*p1.y + 3*mt*mt*t*cp1.y + 3*mt*t*t*cp2.y + t*t*t*p2.y;
        flybyPoints.push({x, y});
    }

    // LEG 2 Path (Truncated) - WITH DRIFT CORRECTION
    // Target: The actual position of the destination body at T3
    const finalTargetPos = getGlobalState(sys, target, t3).r;
    
    // Note: We integrate from P2 (Bezier End) to T3.
    // We enforce that it ends at finalTargetPos.
    const leg2Points = integrateBallisticPath(
        p2, 
        leg2.v1, 
        (t3 - t2_start) / 1000, 
        mu_au, 
        steps2, 
        finalTargetPos // <--- Drift Correction Enabled
    ); 
    
    const segments: TransitSegment[] = [];

    // LEG 1
    segments.push({
        id: 'leg-1-coast',
        type: 'Coast',
        startTime: t1,
        endTime: t1_end,
        startState: { r: s1.r, v: leg1.v1 },
        endState: { r: p1, v: leg1.v2 },
        hostId: root.id,
        pathPoints: leg1Points,
        warnings: [],
        fuelUsed_kg: 0
    });
    
    // FLYBY SEGMENT
    segments.push({
        id: 'leg-flyby',
        type: 'Coast', 
        startTime: t1_end,
        endTime: t2_start,
        startState: { r: flybyPoints[0], v: {x:0,y:0} },
        endState: { r: flybyPoints[flybyPoints.length-1], v: {x:0,y:0} },
        hostId: flybyBody.id,
        pathPoints: flybyPoints,
        warnings: ['Gravity Assist'],
        fuelUsed_kg: 0
    });
    
    // LEG 2
    segments.push({
        id: 'leg-2-coast',
        type: 'Coast',
        startTime: t2_start,
        endTime: t3,
        startState: { r: p2, v: leg2.v1 },
        endState: { r: getGlobalState(sys, target, t3).r, v: leg2.v2 },
        hostId: root.id,
        pathPoints: leg2Points,
        warnings: [],
        fuelUsed_kg: 0
    });

    return {
        id: 'assist-' + Date.now(),
        originId: origin.id,
        targetId: target.id,
        startTime: t1,
        mode: 'Economy',
        planType: 'Complex',
        name: `Flyby Assist (${flybyBody.name})`,
        segments,
        burns: [],
        totalDeltaV_ms: totalDV,
        totalTime_days: totalTimeDays,
        totalFuel_kg: fuelEst,
        isValid: true,
        maxG: params.maxG,
        accelRatio: 0.01,
        brakeRatio: 0.01,
        interceptSpeed_ms: 0,
        arrivalVelocity_ms: 0,
        distance_au: distanceAU(s1.r, getGlobalState(sys, target, t3).r), // Approx
        tags: ['GRAVITY-ASSIST']
    };
}
