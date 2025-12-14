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
    const totalDuration = plans.reduce((sum, p) => sum + p.totalTime_days, 0) * 86400 * 1000;
    const startTime = plans[0].startTime;
    
    // 1. Pre-calculate Static Zones (Star & Belts)
    
    const root = system.nodes.find(n => n.parentId === null);
    const starZones = (root && root.roleHint === 'star') ? calculateAllStellarZones(root as CelestialBody, rulePack) : null; 
    
    const belts = system.nodes.filter(n => n.roleHint === 'belt');
    const rings = system.nodes.filter(n => n.roleHint === 'ring');
    const massiveBodies = system.nodes.filter(n => (n.kind === 'body' && (n as CelestialBody).massKg > 1e23) || n.kind === 'barycenter');

    // 2. Sample the Timeline (Smart Sampling)
    const timesToCheck = new Set<number>();
    
    // A. Regular intervals (for background zones)
    const step = totalDuration / samples;
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
    
    // Track current plan index (Optimization possible, but simple find is robust enough for <1000 points)
    
    for (const t of sortedTimes) {
        
        // Find which plan covers this time
        let activePlan = plans.find(p => t >= p.startTime && t <= (p.startTime + p.totalTime_days * 86400 * 1000));
        if (!activePlan) {
            // Gap or End? Use closest valid plan state for position fallback
            if (t >= plans[plans.length-1].startTime) activePlan = plans[plans.length-1];
            else activePlan = plans[0];
        }

        // Find which segment covers this time
        const relTime = t - activePlan.startTime;
        let activeSegment = activePlan.segments.find(s => {
            const start = s.startTime - activePlan.startTime;
            const end = s.endTime - activePlan.startTime;
            return relTime >= start && relTime <= end;
        });
        
        // --- G-FORCE CALCULATION ---
        let gForce = 0;
        
        if (activeSegment) {
            if (activeSegment.type === 'Accel' || activeSegment.type === 'Brake') {
                gForce = activePlan.maxG;
            }
        }
        
        // Aerobraking Spike (at end of plan)
        // Heuristic: If we are within the last 10 minutes (600s) of a plan that has aerobraking
        const planEndTime = activePlan.startTime + activePlan.totalTime_days * 86400 * 1000;
        const timeUntilEnd = planEndTime - t;
        let isAerobraking = false;
        
        if (activePlan.aerobrakingDeltaV_ms && timeUntilEnd >= -1000 && timeUntilEnd < 600 * 1000) {
            // Linear ramp or block? Let's do a block average.
            // G = (dV / dt) / 9.81
            // We use a factor of 1.5 to represent peak G
            const avgG = (activePlan.aerobrakingDeltaV_ms / 600) / 9.81;
            gForce = Math.max(gForce, avgG * 1.5);
            isAerobraking = true;
        }

        // --- POSITION CALCULATION ---
        // We need the ship's position at 't'.
        // Interpolate from segment path points?
        // activeSegment.pathPoints is [ {x, y}, ... ]
        // We need to map 'relTime' to index.
        let shipPos: Vector2 = { x: 0, y: 0 };
        let posFound = false;
        
        if (activeSegment) {
            const segStart = activeSegment.startTime - activePlan.startTime;
            const segDuration = activeSegment.endTime - activeSegment.startTime;
            if (segDuration > 0) {
                const segProgress = (relTime - segStart) / segDuration;
                const idx = Math.min(
                    Math.floor(segProgress * (activeSegment.pathPoints.length - 1)), 
                    activeSegment.pathPoints.length - 1
                );
                // Linear interp for smoothness
                const p1 = activeSegment.pathPoints[idx];
                const p2 = activeSegment.pathPoints[Math.min(idx + 1, activeSegment.pathPoints.length - 1)];
                const subProgress = (segProgress * (activeSegment.pathPoints.length - 1)) % 1;
                
                shipPos.x = p1.x + (p2.x - p1.x) * subProgress;
                shipPos.y = p1.y + (p2.y - p1.y) * subProgress;
                posFound = true;
            }
        } 
        
        // Fallback if segment not found or interpolation failed (e.g. gap, start/end boundary)
        if (!posFound) {
             if (relTime <= 0) {
                 // Before plan start -> Use Start State
                 if (activePlan.segments.length > 0) {
                     shipPos = activePlan.segments[0].startState.r;
                     posFound = true;
                 }
             } else {
                 // After plan end -> Use End State
                 if (activePlan.segments.length > 0) {
                     shipPos = activePlan.segments[activePlan.segments.length-1].endState.r;
                     posFound = true;
                 }
             }
        }
        
        // If we still don't have a position (e.g. empty plan), skip hazard check to avoid false positives (Sun collision)
        if (!posFound && shipPos.x === 0 && shipPos.y === 0) continue;

        // --- HAZARD DETECTION ---
        const hazards: HazardEvent[] = [];
        
        // 1. G-Force Check (Generic)
        if (gForce > 2.0) {
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

        // 2. Stellar Zones (Assume Root is at 0,0 for now)
        const distFromStarAU = magnitude(shipPos);
        // Note: we need 'zones' object. If passed or calc'd.
        // For V1, we assume specific thresholds if object not avail.
        // Kill: 0.1 AU, Danger: 0.3 AU? 
        // Better: Use calculated Roche of Star
        if (starZones) {
            if (distFromStarAU < starZones.killZone) {
                hazards.push({ type: 'Radiation', level: 'Critical', sourceName: root?.name || 'Star', message: 'Inside Kill Zone' });
            } else if (distFromStarAU < starZones.dangerZone) {
                hazards.push({ type: 'Radiation', level: 'Danger', sourceName: root?.name || 'Star', message: 'Inside Danger Zone' });
            }
        }

        // 3. Roche Limits (REMOVED - Ships are rigid)

        // 4. Belts (Heliocentric)
        for (const belt of belts) {
            if (!belt.radiusInnerKm || !belt.radiusOuterKm || !belt.parentId) continue;
            
            // Check if belt orbits the same root/star as ship?
            // Assume heliocentric belts for now.
            const beltParentPos = { x:0, y:0 }; // Assume Sun
            const d = distanceAU(shipPos, beltParentPos) * AU_KM;
            
            if (d >= belt.radiusInnerKm && d <= belt.radiusOuterKm) {
                hazards.push({ type: 'Debris', level: 'Warning', sourceName: belt.name, message: 'Crossing Asteroid Belt' });
            }
        }

        // Optimization: Only check rings for bodies we are near (Origin, Target, Flyby)
        const bodiesToCheck = new Set<string>();
        bodiesToCheck.add(activePlan.originId);
        bodiesToCheck.add(activePlan.targetId);
        if (activeSegment && activeSegment.hostId !== root?.id) {
            bodiesToCheck.add(activeSegment.hostId);
        }

        // 5. Rings (Planetocentric)
        for (const ring of rings) {
            if (!ring.radiusInnerKm || !ring.radiusOuterKm || !ring.parentId) continue;
            
            // Get parent planet position
            const planet = system.nodes.find(n => n.id === ring.parentId);
            if (!planet) continue;
            
            // Only check if we are reasonably close to avoid calling getGlobalState too much?
            // Or assume we only hit rings if we are near the planet.
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
