import type { System, CelestialBody, Barycenter } from '../types';
import type { TransitPlan, TransitSegment, StateVector, Vector2 } from './types';
import { solveLambert, magnitude, subtract, distanceAU, integrateBallisticPath, integrateBallisticPathAtTimes, dot, perihelionOf } from './math';
import { buildPathSchedule, slicePhase, DEFAULT_PATH_BUDGET } from './pathSampling';
import { getGlobalState, calculateFuelMass } from './physics';
import { calculateKillZone } from '../physics/zones';
import { AU_KM, G } from '../constants';

const AU_M = AU_KM * 1000;
const DEBUG_TRANSIT = false; // per-solve assist trace; off so it doesn't flood the console during playback

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
        
        // Filter out Rings and Belts (they are not point masses suitable for assist)
        if (node.kind === 'body') {
            const role = (node as CelestialBody).roleHint;
            if (role === 'ring' || role === 'belt') continue;
        }
        
        // PARENT FILTER: Candidate must orbit the Context Parent.
        // This prevents Ganymede (orbiting Jupiter) from being a candidate for Earth->Venus (Context Sun).
        if (node.parentId !== contextParentId) continue;
        
        // Skip low mass bodies
        // 3e23 filters small moons/asteroids but keeps Mercury (3.3e23) and Mars (6.4e23).
        const mass = (node.kind === 'body' ? (node as CelestialBody).massKg : (node as Barycenter).effectiveMassKg) || 0;
        if (mass < 3e23) continue; 

        // Heuristic: Is it accessible?
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
    if (result.length > 0 && DEBUG_TRANSIT) console.log(`[AssistDebug] Selected Candidates: ${result.map(c => c.body.name).join(', ')}`);
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
    params: { maxG: number; shipMass_kg?: number; shipIsp?: number; costOnly?: boolean; }
): TransitPlan | null {
    
    const candidates = findAssistCandidates(sys, origin, target);
    if (candidates.length === 0) return null;

    const mu = (root.kind === 'body' ? (root as CelestialBody).massKg : (root as Barycenter).effectiveMassKg || 0) * G;
    const mu_au = mu / Math.pow(AU_M, 3);
    // How close to the star a route may pass. The engine already derives this line and the generator
    // already refuses to place a body across it, so a ship's route reads the same number rather than a
    // fresh one. Zero for a root with no luminosity, which disables the check rather than inventing a
    // limit for a star we know nothing about. Sol's is 0.0899 AU.
    const starKillZoneAU = root.kind === 'body' ? (calculateKillZone(root as CelestialBody, null) || 0) : 0;
    
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

                // WHERE DOES THIS ROUTE ACTUALLY GO? ([[B93]])
                //
                // The check above asks whether the ship can survive the FLYBY. Nothing asked where the
                // two heliocentric legs went in between — and a Lambert solution is perfectly happy to
                // route a ship through the middle of a star. Measured on Sol 2030, Mars -> Main Belt:
                // the offered Jupiter-assist plan's second leg was a valid solution with a = 2.670 AU
                // and e = 0.9986, a perihelion of 0.0037 AU. That is 550,000 km from the Sun's centre,
                // inside the corona, presented as an ordinary route. It stayed unseen for as long as it
                // existed because the display integrator marched at a flat two-day step and fell off the
                // conic near perihelion, drawing a different and less alarming curve (G46).
                //
                // The limit is the star's own KILL ZONE — the line the generator already refuses to place
                // a body across — rather than a number invented here. Sol's is 0.0899 AU. A candidate
                // that dives inside it is dropped exactly as an unsurvivable flyby periapsis is; the
                // search simply goes on to the next one.
                const legPerihelionAU = (r0: Vector2, v0: Vector2) => perihelionOf(r0, v0, mu_au);
                const q1 = legPerihelionAU(startState.r, leg1.v1);
                const q2 = legPerihelionAU(flybyStateAtArrival.r, leg2.v1);
                const closest = Math.min(q1 ?? Infinity, q2 ?? Infinity);
                if (Number.isFinite(closest) && closest < starKillZoneAU) {
                    if (DEBUG_TRANSIT) console.log(`[AssistDebug] Reject: leg perihelion ${closest.toFixed(4)} AU inside kill zone ${starKillZoneAU.toFixed(4)} AU`);
                    continue;
                }

                if (DEBUG_TRANSIT) console.log(`[AssistDebug] FOUND PLAN! ${origin.name} -> ${flybyBody.name} -> ${target.name}`);
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
                    params, closest, starKillZoneAU
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
    params: { maxG: number; shipMass_kg?: number; shipIsp?: number; costOnly?: boolean; },
    closestApproachAU: number, starKillZoneAU: number
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
        fuelEst = Infinity; // No engine/Isp → can't perform the assist burn; infeasible, not a fake number.
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
    
    // Dynamic steps for long coasts (costOnly keeps the analytic cost but skips the dense display path).
    const costOnly = params.costOnly;
    // G46: the burn windows are known before the paths are drawn, so each leg's integration can put
    // points INSIDE them instead of the burn being carved afterwards out of a two-day grid. Carving
    // was what left the arrival brake with two points spanning a whole coast sample — measured at
    // 109.6 km/s over a 1.24 h burn for a 0.3 g ship, the same absurdity as the Lambert family's.
    const burnAccel = Math.max(0.01, (params.maxG || 0.1) * 9.81);
    const leg1Ms = Math.max(1, t1_end - t1);
    const accelMs = Math.min(leg1Ms * 0.9, (dv1 / burnAccel) * 1000);
    const leg2Ms = Math.max(1, t3 - t2_start);
    const brakeMs = Math.min(leg2Ms * 0.9, (dv3 / burnAccel) * 1000);
    const ASSIST_SPACING_SEC = 86400 * 2;

    // LEG 1 Path (Truncated) - WITH DRIFT CORRECTION
    // We generate the FULL path to T2 (Flyby Center), force it to hit the Planet, then slice it back.
    const flybyCenterState = getGlobalState(sys, flybyBody, t2);
    
    // Integrate fully to T2 with correction. The run continues past the drawn leg to the flyby
    // centre — that tail is what the drift correction aims at — but it is a separate PHASE, so it is
    // discarded by name rather than by an index computed from a length.
    const sched1 = buildPathSchedule([
        { key: 'accel', startSec: 0, endSec: accelMs / 1000, spacingSec: ASSIST_SPACING_SEC },
        { key: 'coast', startSec: accelMs / 1000, endSec: (t1_end - t1) / 1000, spacingSec: ASSIST_SPACING_SEC },
        { key: 'tail', startSec: (t1_end - t1) / 1000, endSec: (t2 - t1) / 1000, spacingSec: ASSIST_SPACING_SEC }
    ], costOnly ? 24 : DEFAULT_PATH_BUDGET);
    const integration1 = integrateBallisticPathAtTimes(
        s1.r, leg1.v1, sched1.timesSec, mu_au,
        { targetEndPos: flybyCenterState.r, maxStepSec: ASSIST_SPACING_SEC }
    );
    const leg1FullPoints = integration1.points;
    const leg1Accel = slicePhase(sched1, leg1FullPoints, 'accel', t1);
    const leg1Coast = slicePhase(sched1, leg1FullPoints, 'coast', t1);
    // The drawn leg is the accel plus the coast, sharing their boundary vertex exactly once.
    const leg1Points = [...leg1Accel.points, ...leg1Coast.points.slice(1)];
    const leg1Times = [...leg1Accel.timesMs, ...leg1Coast.timesMs.slice(1)];
    
    const p1 = leg1Points[leg1Points.length - 1];
    const v1 = leg1.v2; 

    // LEG 2 — DRAWN FROM THE STATE IT WAS SOLVED FROM.
    //
    // `leg2` is a Lambert solution from the FLYBY BODY'S POSITION AT t2 across the whole t2->t3 span.
    // The drawing used to start somewhere else entirely: at the Bezier's end point, produced by a
    // separate ten-step integration, and then run for a SHORTER span. A Lambert velocity applied at a
    // position it was not solved for is simply a different conic, and the end-point drift correction
    // then hauled the far end back onto the target while leaving the middle wherever it had gone. The
    // coarse two-day sampling hid how far that was; sampling the arrival brake at its own resolution
    // did not, and showed the ship drawn at 264 km/s on a plan whose entire Delta-v budget is 34 km/s.
    //
    // So the integration now starts at the flyby centre with the velocity that belongs there, and the
    // lead-in across the flyby window is a PHASE that is generated and then dropped — the same device
    // leg 1 uses to run on to the flyby centre for its own drift target.
    const finalTargetPos = getGlobalState(sys, target, t3).r;
    const leadSec = flybyDtSec;
    const sched2 = buildPathSchedule([
        { key: 'lead', startSec: 0, endSec: leadSec, spacingSec: ASSIST_SPACING_SEC },
        { key: 'coast', startSec: leadSec, endSec: leadSec + (leg2Ms - brakeMs) / 1000, spacingSec: ASSIST_SPACING_SEC },
        { key: 'brake', startSec: leadSec + (leg2Ms - brakeMs) / 1000, endSec: leadSec + leg2Ms / 1000, spacingSec: ASSIST_SPACING_SEC }
    ], costOnly ? 24 : DEFAULT_PATH_BUDGET);
    const integration2 = integrateBallisticPathAtTimes(
        flybyCenterState.r, leg2.v1, sched2.timesSec, mu_au,
        { targetEndPos: finalTargetPos, maxStepSec: ASSIST_SPACING_SEC }
    );
    const leg2FullPoints = integration2.points;
    const leg2Coast = slicePhase(sched2, leg2FullPoints, 'coast', t2);
    const leg2Brake = slicePhase(sched2, leg2FullPoints, 'brake', t2);
    const leg2Points = [...leg2Coast.points, ...leg2Brake.points.slice(1)];
    const leg2Times = [...leg2Coast.timesMs, ...leg2Brake.timesMs.slice(1)];

    // The flyby arc now joins two points that are both ON the solved trajectory: leg 1's last drawn
    // point and leg 2's first. It used to end at a point invented by an integration that nothing else
    // read, which is why that integration is gone.
    const p2 = leg2Coast.points[0];

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

    // --- CORRECTION LOGIC & FUEL ---
    const burns: BurnPoint[] = [];
    let correctionDV = 0;
    let correctionFuel = 0;
    const tags = ['GRAVITY-ASSIST'];
    // Survivable but unpleasant: inside three kill-zone radii the route is legal and worth saying so
    // out loud, which is this engine's habit with a hazard - tag and explain rather than refuse.
    if (Number.isFinite(closestApproachAU) && closestApproachAU < starKillZoneAU * 3) {
        tags.push(`SOLAR CLOSE PASS (${closestApproachAU.toFixed(3)} AU)`);
    }

    const checkDriftAndAddBurns = (driftAu: number, path: Vector2[], startT: number, durationMs: number, prefix: string) => {
        const driftM = driftAu * AU_M;
        if (driftM > 100000) {
            const tcmLabel = params.maxG > 2.0 ? 'HIGH-G TRAJECTORY CORRECTION MANEUVER (TCM)' : 'TRAJECTORY CORRECTION MANEUVER (TCM)';
            if (!tags.includes(tcmLabel)) tags.push(tcmLabel);
            const num = 2;
            for (let i = 1; i <= num; i++) {
                const frac = i / (num + 1);
                const idx = Math.floor(frac * (path.length - 1));
                const burnTime = startT + durationMs * frac;
                
                const dv_ms = 10;
                burns.push({
                    id: `correction-${prefix}-${Date.now()}-${i}`,
                    time: burnTime,
                    position: path[idx],
                    deltaV_ms: dv_ms,
                    type: 'Correction'
                });
                correctionDV += dv_ms;
                // Simple fuel approx for corrections
                correctionFuel += params.shipMass_kg ? calculateFuelMass(params.shipMass_kg * 0.8, dv_ms, params.shipIsp || 3000) : dv_ms * 0.01;
            }
        }
    };

    checkDriftAndAddBurns(integration1.drift_au, leg1Points, t1, t1_end - t1, 'leg1');
    checkDriftAndAddBurns(integration2.drift_au, leg2Points, t2_start, t3 - t2_start, 'leg2');
    
    const segments: TransitSegment[] = [];

    // B87: THE BURNS ARE PHASES, NOT JUST NUMBERS.
    //
    // This plan has always PAID for three burns — departure, the periapsis kick, and the arrival
    // brake — but emitted three `Coast` segments and nothing else, so `constructs/shipBurn.ts` (which
    // reads the segment LABEL to decide whether a ship is thrusting and which way it points) saw
    // nothing but coast and returned NONE. A multi-year gravity-assist flight therefore crossed the
    // system with a dead drive and never turned retrograde, on the GM map and on player devices alike.
    //
    // So the ends of the two coasts are carved into real `Accel` and `Brake` segments, each lasting
    // the time the ship's own thrust ceiling needs for that Delta-v (dv / (maxG*g0)). The trajectory
    // is UNCHANGED and so are the Delta-v and fuel totals: the Lambert legs are impulsive solutions
    // and re-solving them with finite burns is a different piece of work. This is the same
    // display-grade split the torch families already use — it makes the burn VISIBLE at the right
    // moment and for the right duration, which is what the plume and the flip read.
    /** Unit vector of a burn's Delta-v — the direction the drive actually points while it fires. */
    const unitOf = (v: Vector2): Vector2 | undefined => {
        const m = Math.hypot(v.x, v.y);
        return m > 1e-18 ? { x: v.x / m, y: v.y / m } : undefined;
    };

    // The burn phases now OWN their points — generated over their own window by the leg's own
    // integration — so nothing is carved out of anyone else's grid and nothing has to be interpolated
    // into existence at the boundary. What used to live here was `sliceAt`, which split a two-day
    // sampled leg at an arbitrary fraction and handed the burn whatever fell on its side: two points
    // for any burn shorter than the sampling cadence, which every short burn is.
    if (accelMs > 0 && leg1Accel.points.length > 1) {
        segments.push({
            id: 'leg-1-accel', type: 'Accel',
            startTime: t1, endTime: t1 + accelMs,
            startState: { r: s1.r, v: s1.v },
            endState: { r: leg1Accel.points[leg1Accel.points.length - 1], v: leg1.v1 },
            hostId: root.id, pathPoints: leg1Accel.points, pathTimes: leg1Accel.timesMs,
            deltaV_ms: dv1, thrustDir: unitOf(subtract(leg1.v1, s1.v)),
            warnings: [], fuelUsed_kg: 0
        });
        segments.push({
            id: 'leg-1-coast', type: 'Coast',
            startTime: t1 + accelMs, endTime: t1_end,
            startState: { r: leg1Coast.points[0], v: leg1.v1 },
            endState: { r: p1, v: leg1.v2 },
            hostId: root.id, pathPoints: leg1Coast.points, pathTimes: leg1Coast.timesMs,
            warnings: [], fuelUsed_kg: 0
        });
    } else {
        segments.push({
            id: 'leg-1-coast', type: 'Coast',
            startTime: t1, endTime: t1_end,
            startState: { r: s1.r, v: leg1.v1 },
            endState: { r: p1, v: leg1.v2 },
            hostId: root.id, pathPoints: leg1Points, pathTimes: leg1Times, warnings: [], fuelUsed_kg: 0
        });
    }
    
    // THE FLYBY ARC IS A COSMETIC BEZIER, NOT THE FLOWN HYPERBOLA. Its parameter is not time, so
    // these stamps are an even spread rather than a truth — good enough because the curve's implied
    // speed measures 2.9 km/s average against a 4.4 km/s peak, well inside what the ship can do, and
    // stamping it at least keeps every reader agreeing about where the ship is. Replacing the Bezier
    // with a real integrated pass in the flyby body's frame is a solver change, recorded for G47.
    const evenTimes = (pts: Vector2[], startMs: number, endMs: number) =>
        pts.map((_, i) => startMs + ((endMs - startMs) * i) / Math.max(1, pts.length - 1));

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
        pathTimes: evenTimes(flybyPoints, t1_end, t2_start),
        warnings: ['Gravity Assist'],
        fuelUsed_kg: 0
    });
    
    // LEG 2
    //
    // B86: THE TERMINAL STATE IS THE BRAKED ONE, because that is what this plan has already been
    // charged for. `v_arr` (the |target.v - leg2.v2| brake) is in `totalDV` and its fuel is in the
    // estimate, and the plan publishes `arrivalVelocity_ms: 0` — but the end state used to carry
    // `leg2.v2`, the transfer ellipse's arrival velocity, i.e. the ship BEFORE the burn it had
    // paid for. So a plan claiming a braked rendezvous ended several km/s fast: measured 4,788 m/s
    // on a plain Jupiter low orbit and 13-22 km/s on Lagrange arrivals. Two things read this and
    // were wrong because of it — leg CHAINING (SystemView takes the next leg's initial state from
    // here, so every following leg was planned from a velocity the ship would never have) and the
    // arrival telemetry. Same convention as the other plan families, which end their last segment
    // on the target-matched `finalState` (calculator.ts).
    const targetEndState = getGlobalState(sys, target, t3);
    // LEG 2 — the coast, then the arrival brake it has already been charged for (B86). Splitting it
    // makes the deceleration a real phase with a start time, so the ship flips retrograde and lights
    // its drive for exactly as long as the burn takes, instead of the whole change appearing as a
    // discontinuity in the final instant.
    if (brakeMs > 0 && leg2Brake.points.length > 1) {
        segments.push({
            id: 'leg-2-coast', type: 'Coast',
            startTime: t2_start, endTime: t3 - brakeMs,
            startState: { r: p2, v: leg2.v1 },
            endState: { r: leg2Coast.points[leg2Coast.points.length - 1], v: leg2.v2 },
            hostId: root.id, pathPoints: leg2Coast.points, pathTimes: leg2Coast.timesMs,
            warnings: [], fuelUsed_kg: 0
        });
        segments.push({
            id: 'leg-2-brake', type: 'Brake',
            startTime: t3 - brakeMs, endTime: t3,
            startState: { r: leg2Brake.points[0], v: leg2.v2 },
            endState: { r: targetEndState.r, v: targetEndState.v },
            hostId: root.id, pathPoints: leg2Brake.points, pathTimes: leg2Brake.timesMs,
            deltaV_ms: dv3, thrustDir: unitOf(subtract(targetEndState.v, leg2.v2)),
            warnings: [], fuelUsed_kg: 0
        });
    } else {
        segments.push({
            id: 'leg-2-coast', type: 'Coast',
            startTime: t2_start, endTime: t3,
            startState: { r: p2, v: leg2.v1 },
            endState: { r: targetEndState.r, v: targetEndState.v },
            hostId: root.id, pathPoints: leg2Points, pathTimes: leg2Times, warnings: [], fuelUsed_kg: 0
        });
    }

    // ...and the brake is now VISIBLE where it happens, rather than only inside the Δv total.
    if (dv3 > 0) {
        burns.push({
            id: `assist-arrival-brake-${t3}`,
            time: t3,
            position: targetEndState.r,
            deltaV_ms: dv3,
            type: 'Arrival'
        });
    }

    return {
        id: 'assist-' + Date.now(),
        originId: origin.id,
        targetId: target.id,
        startTime: t1,
        mode: 'Economy',
        planType: 'Complex',
        name: `Flyby Assist (${flybyBody.name})`,
        segments,
        burns,
        totalDeltaV_ms: totalDV + correctionDV,
        totalTime_days: totalTimeDays,
        totalFuel_kg: fuelEst + correctionFuel,
        isValid: true,
        maxG: params.maxG,
        accelRatio: 0.01,
        brakeRatio: 0.01,
        interceptSpeed_ms: 0,
        arrivalVelocity_ms: 0,
        distance_au: distanceAU(s1.r, getGlobalState(sys, target, t3).r), // Approx
        tags: tags
    };
}
