import type { System, CelestialBody, Barycenter } from '../types';
import type { TransitPlan, TransitSegment, Vector2 } from './types';
import { calculateAllStellarZones, calculateRocheLimit } from '../physics/zones';
import { magnitude, distanceAU } from './math';
import { getGlobalState } from './physics';
import { AU_KM } from '../constants';

const G0 = 9.81;

export interface TelemetryPoint {
    time: number; // Unix timestamp
    gForce: number;
    hazards: HazardEvent[];
}

export interface HazardEvent {
    type: 'Radiation' | 'Debris' | 'Gravity' | 'Aerobrake' | 'G-Force';
    level: 'Info' | 'Warning' | 'Danger' | 'Critical';
    sourceName: string;
    message: string;
}

export function calculateFlightTelemetry(system: System, plans: TransitPlan[], rulePack: RulePack, samples: number = 200): TelemetryPoint[] {
    if (!system || plans.length === 0) return [];

    const points: TelemetryPoint[] = [];
    const startTime = plans[0].startTime;
    const lastPlan = plans[plans.length - 1];
    const endTime = lastPlan.startTime + lastPlan.totalTime_days * 86400 * 1000;
    const totalDuration = endTime - startTime;
    
    // 1. Pre-calculate Static Zones (Star & Belts)
    
    const root = system.nodes.find(n => n.parentId === null);
    const starZones = (root && root.roleHint === 'star') ? calculateAllStellarZones(root as CelestialBody, rulePack) : null; 
    
    const belts = system.nodes.filter(n => n.roleHint === 'belt');
    const rings = system.nodes.filter(n => n.roleHint === 'ring');
    const massiveBodies = system.nodes.filter(n => (n.kind === 'body' && (n as CelestialBody).massKg > 1e23) || n.kind === 'barycenter');

    // 2. Sample the Timeline (Smart Sampling)
    const timesToCheck = new Set<number>();
    
    // A. Regular intervals (for background zones)
    // Ensure at least 2 points if duration is 0 (shouldn't happen)
    const step = Math.max(1000, totalDuration / samples); 
    for (let i = 0; i <= samples; i++) {
        timesToCheck.add(startTime + i * step);
    }
    
    // B. Critical Events (Plan/Segment boundaries & Aerobrake windows)
    plans.forEach(p => {
        const pStart = p.startTime;
        const pEnd = p.startTime + p.totalTime_days * 86400 * 1000;
        
        timesToCheck.add(pStart);
        timesToCheck.add(pEnd);
        
        // Aerobrake window (last 10 mins)
        if (p.aerobrakingDeltaV_ms) {
            timesToCheck.add(pEnd - 600 * 1000);
        }
        
        p.segments.forEach(s => {
            timesToCheck.add(s.startTime);
            timesToCheck.add(s.endTime);
        });
    });
    
    const sortedTimes = Array.from(timesToCheck).sort((a, b) => a - b);
    
    for (const t of sortedTimes) {
        let gForce = 0;
        let shipPos: Vector2 = { x: 0, y: 0 };
        let posFound = false;
        let activePlan = plans.find(p => t >= p.startTime && t <= (p.startTime + p.totalTime_days * 86400 * 1000));
        let bodiesToCheck = new Set<string>(); // For rings/local hazards

        if (activePlan) {
            // --- IN TRANSIT ---
            bodiesToCheck.add(activePlan.originId);
            bodiesToCheck.add(activePlan.targetId);

            const relTime = t - activePlan.startTime;
            let activeSegment = activePlan.segments.find(s => {
                const start = s.startTime - activePlan.startTime;
                const end = s.endTime - activePlan.startTime;
                // Use relaxed check for floating point issues at boundaries
                return relTime >= (start - 1) && relTime <= (end + 1);
            });
            
            // G-Force
            if (activeSegment) {
                if (activeSegment.type === 'Accel' || activeSegment.type === 'Brake') {
                    gForce = activePlan.maxG;
                }
                if (activeSegment.hostId !== root?.id) bodiesToCheck.add(activeSegment.hostId);
            }
            
            // Aerobraking Spike
            const planEndTime = activePlan.startTime + activePlan.totalTime_days * 86400 * 1000;
            const timeUntilEnd = planEndTime - t;
            let isAerobraking = false;
            
            if (activePlan.aerobrakingDeltaV_ms && timeUntilEnd >= -1000 && timeUntilEnd < 600 * 1000) {
                const avgG = (activePlan.aerobrakingDeltaV_ms / 600) / 9.81;
                gForce = Math.max(gForce, avgG * 1.5);
                isAerobraking = true;
            }

            // Position
            if (activeSegment) {
                const segStart = activeSegment.startTime - activePlan.startTime;
                const segDuration = activeSegment.endTime - activeSegment.startTime;
                if (segDuration > 0) {
                    const segProgress = (relTime - segStart) / segDuration;
                    const idx = Math.min(
                        Math.floor(segProgress * (activeSegment.pathPoints.length - 1)), 
                        activeSegment.pathPoints.length - 1
                    );
                    // Clamp index
                    const safeIdx = Math.max(0, idx);
                    const p1 = activeSegment.pathPoints[safeIdx];
                    const p2 = activeSegment.pathPoints[Math.min(safeIdx + 1, activeSegment.pathPoints.length - 1)];
                    const subProgress = (segProgress * (activeSegment.pathPoints.length - 1)) % 1;
                    
                    shipPos.x = p1.x + (p2.x - p1.x) * subProgress;
                    shipPos.y = p1.y + (p2.y - p1.y) * subProgress;
                    posFound = true;
                }
            } 
            
            // Fallback for Transit Plan boundaries
            if (!posFound) {
                 if (relTime <= 0 && activePlan.segments.length > 0) {
                     shipPos = activePlan.segments[0].startState.r;
                     posFound = true;
                 } else if (activePlan.segments.length > 0) {
                     shipPos = activePlan.segments[activePlan.segments.length-1].endState.r;
                     posFound = true;
                 }
            }

        } else {
            // --- IN GAP (PARKING / DELAY) ---
            // Find the previous plan (where we are parked)
            // If t < plans[0].startTime, we are at Origin of Plan 0
            // If t > lastPlan.endTime, we are at Target of Last Plan
            // If between plans, we are at Target of Prev Plan
            
            let hostId = '';
            
            if (t < plans[0].startTime) {
                hostId = plans[0].originId;
            } else {
                // Find last completed plan
                const prevPlan = [...plans].reverse().find(p => (p.startTime + p.totalTime_days*86400*1000) <= t);
                if (prevPlan) hostId = prevPlan.targetId;
                else hostId = plans[0].originId; // Should not happen if logic is correct
            }
            
            if (hostId) {
                bodiesToCheck.add(hostId);
                const hostBody = system.nodes.find(n => n.id === hostId);
                if (hostBody && (hostBody.kind === 'body' || hostBody.kind === 'barycenter')) {
                    // We are parked at this body.
                    // Position = Body Position at time t
                    const state = getGlobalState(system, hostBody, t);
                    shipPos = state.r;
                    posFound = true;
                    // G-Force is 0
                }
            }
        }
        
        if (!posFound && shipPos.x === 0 && shipPos.y === 0) continue;

        // --- HAZARD DETECTION --- (Unchanged logic, just using local vars)
        const hazards: HazardEvent[] = [];
        
        // 1. G-Force Check
        if (gForce > 2.0) {
            // Check if aerobraking context
            let isAerobraking = activePlan?.aerobrakingDeltaV_ms && (activePlan.startTime + activePlan.totalTime_days*86400*1000 - t < 600000);
            
            if (gForce > 10.0) {
                hazards.push({ 
                    type: 'G-Force', 
                    level: 'Critical', 
                    sourceName: isAerobraking ? 'Atmosphere' : 'Engines', 
                    message: `Extreme G (${gForce.toFixed(1)}G)` 
                });
            } else {
                hazards.push({ 
                    type: 'G-Force', 
                    level: 'Warning', 
                    sourceName: isAerobraking ? 'Atmosphere' : 'Engines', 
                    message: `High G (${gForce.toFixed(1)}G)` 
                });
            }
        }

        // 2. Stellar Zones
        const distFromStarAU = magnitude(shipPos);
        if (starZones) {
            if (distFromStarAU < starZones.killZone) {
                hazards.push({ type: 'Radiation', level: 'Critical', sourceName: root?.name || 'Star', message: 'Inside Kill Zone' });
            } else if (distFromStarAU < starZones.dangerZone) {
                hazards.push({ type: 'Radiation', level: 'Danger', sourceName: root?.name || 'Star', message: 'Inside Danger Zone' });
            }
        }

        // 4. Belts
        for (const belt of belts) {
            if (!belt.radiusInnerKm || !belt.radiusOuterKm || !belt.parentId) continue;
            const d = distanceAU(shipPos, { x:0, y:0 }) * AU_KM; // Approx heliocentric
            if (d >= belt.radiusInnerKm && d <= belt.radiusOuterKm) {
                hazards.push({ type: 'Debris', level: 'Warning', sourceName: belt.name, message: 'Crossing Asteroid Belt' });
            }
        }

        // 5. Rings
        for (const ring of rings) {
            if (!ring.radiusInnerKm || !ring.radiusOuterKm || !ring.parentId) continue;
            const planet = system.nodes.find(n => n.id === ring.parentId);
            if (!planet) continue;
            
            if (bodiesToCheck.has(planet.id)) {
                const planetState = getGlobalState(system, planet, t);
                const d = distanceAU(shipPos, planetState.r) * AU_KM;
                if (d >= ring.radiusInnerKm && d <= ring.radiusOuterKm) {
                    hazards.push({ type: 'Debris', level: 'Danger', sourceName: ring.name, message: 'Crossing Planetary Ring' });
                }
            }
        }

        points.push({ time: t, gForce, hazards });
    }

    return points;
}
