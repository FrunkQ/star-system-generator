import type { System, CelestialBody, Barycenter } from '../types';
import type { StateVector } from './types';
import { subtract } from './math';
import { propagateState3D } from '../physics/orbits';
import { G } from '../constants';
import { AU_KM } from '../constants';
import { effectiveAttachment, attachedOffsetAu } from '../constructs/docking';

const G0 = 9.81;
const AU_M = AU_KM * 1000;

/**
 * Recursively calculates the global (Heliocentric/System-Root) State Vector
 * for a given node at a specific time.
 */
export function getGlobalState(sys: System, node: CelestialBody | Barycenter | { id: string, parentId: string | null, orbit?: any }, tMs: number): StateVector {
    // 1. Kinematic / Construct Override
    if ((node as any).kind === 'construct') {
        const c = node as any;
        // G53 PHASE 5 - A DOCKED CONSTRUCT IS WHERE ITS STRUCTURE CARRIES IT (constructs/docking.ts),
        // moving as the structure moves: a ribbon level's co-rotation, a rim's turn. The origin of a
        // departure from a dock and the moving target of an arrival at one both read this, and a
        // stale `orbit` left on the node says nothing about where it is. A ladder structure is
        // attached to itself at the anchor, so it answers with its anchor too. The velocity is the
        // structure's own motion, taken as a one-second difference of the propagator's offset - the
        // same function every view reads, so the state cannot disagree with the drawing.
        const att = effectiveAttachment(c);
        if (att) {
            const structure = att.id === c.id ? c : (sys.nodes.find(n => n.id === att.id) as any);
            const host = structure?.parentId ? sys.nodes.find(n => n.id === structure.parentId) : undefined;
            if (structure && host) {
                const off0 = attachedOffsetAu(att, structure, host, tMs, sys);
                if (off0) {
                    const hostG = getGlobalState(sys, host, tMs);
                    // A CENTRAL difference: a forward one leaves half of omega^2 R dt pointing inward
                    // (0.11 m/s at geo), and a docked ship's velocity has no radial part.
                    const offP = attachedOffsetAu(att, structure, host, tMs + 1000, sys) ?? off0;
                    const offM = attachedOffsetAu(att, structure, host, tMs - 1000, sys) ?? off0;
                    return {
                        r: { x: hostG.r.x + off0.x, y: hostG.r.y + off0.y, z: (hostG.r.z ?? 0) + off0.z },
                        v: { x: hostG.v.x + (offP.x - offM.x) / 2, y: hostG.v.y + (offP.y - offM.y) / 2, z: (hostG.v.z ?? 0) + (offP.z - offM.z) / 2 }
                    };
                }
                if (structure !== c) return getGlobalState(sys, structure, tMs);   // point docking: the hull's own state
            }
        }
        
        // A. Explicit Kinematic Vector
        // Only use if actively in transit/deep space, OR if it has no orbit definition to fall back on.
        const isActivelyMoving = c.flight_state === 'Transit' || c.flight_state === 'Deep Space';
        const hasVector = c.vector_position_au && c.vector_velocity_ms;
        
        if (hasVector && (isActivelyMoving || !c.orbit)) {
            const epochMs = Number.isFinite(c.vector_epoch_ms) ? c.vector_epoch_ms : tMs;
            const dtSec = (tMs - epochMs) / 1000;
            const vxAuSec = c.vector_velocity_ms.x / AU_M;
            const vyAuSec = c.vector_velocity_ms.y / AU_M;
            const vzAuSec = (c.vector_velocity_ms.z ?? 0) / AU_M;
            
            return {
                r: {
                    x: c.vector_position_au.x + (vxAuSec * dtSec),
                    y: c.vector_position_au.y + (vyAuSec * dtSec),
                    z: (c.vector_position_au.z ?? 0) + (vzAuSec * dtSec)
                },
                v: { x: vxAuSec, y: vyAuSec, z: vzAuSec }
            };
        }

        // B. If it has an Orbit (Station / Parked Ship), we MUST use the standard propagator loop.
        if (c.orbit) {
            // fall through to loop below
        } 
        // C. Last Resort Fallback: Stationary / Docked without orbit or vector
        // Try to inherit from parent, but offset if possible
        else if (c.parentId) {
            const parent = sys.nodes.find(n => n.id === c.parentId);
            if (parent) {
                const parentGlobal = getGlobalState(sys, parent, tMs);
                // If it's a station, it might have a stored 'altitude' or radius we can use to avoid (0,0)
                const radiusAu = (c as any).parking_orbit_radius_au || (c as any).altitude_km / AU_KM || 0;
                if (radiusAu > 0) {
                    return {
                        r: { x: parentGlobal.r.x + radiusAu, y: parentGlobal.r.y, z: parentGlobal.r.z ?? 0 }, // Simplified offset
                        v: parentGlobal.v
                    };
                }
                return parentGlobal;
            }
        }
    }

    let current: any = node;
    let r = { x: 0, y: 0, z: 0 };
    let v = { x: 0, y: 0, z: 0 };
    
    // Iterate up the hierarchy.
    //
    // THE INCLINATION IS NO LONGER DROPPED HERE. `propagateState` applies only the argument of
    // periapsis — the flat projection the 2D orrery draws — so every transit this subsystem has ever
    // planned was planned between the SHADOWS of two bodies on the reference plane. Its 3D sibling
    // applies the whole 3-1-3 rotation and has existed all along for the holo view. Owner, 2026-08-26:
    // transit "didn't really think in 3D, so some distances may be a bit longer now". They are, and by
    // a real amount on the inclined bodies — the Sol Expanse fixture has 38 of them, the Main Belt at
    // 10 degrees sitting up to 0.4689 AU off the plane the solver used to flatten it onto.
    let loops = 0;
    while (current && loops < 10) {
        // Calculate local state (relative to parent)
        const local = propagateState3D(current, tMs);
        
        r.x += local.r.x;
        r.y += local.r.y;
        r.z += local.r.z;
        v.x += local.v.x;
        v.y += local.v.y;
        v.z += local.v.z;
        
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

/**
 * Calculates state vector relative to a specific parent body.
 * Useful for local maneuvers (Planet->Moon) to remove Solar motion.
 */
export function getLocalState(sys: System, node: CelestialBody | Barycenter, parentId: string, tMs: number): StateVector {
    const globalState = getGlobalState(sys, node, tMs);
    const parentNode = sys.nodes.find(n => n.id === parentId);
    
    if (!parentNode) return globalState; // Fallback
    
    const parentGlobal = getGlobalState(sys, parentNode, tMs);
    
    // Relative State = Object - Parent
    return {
        r: subtract(globalState.r, parentGlobal.r),
        v: subtract(globalState.v, parentGlobal.v)
    };
}

/**
 * Calculates the fuel mass required for a given Delta-V using the Rocket Equation.
 * m_initial = m_final * exp(dV / Ve)
 * fuel = m_initial - m_final
 * 
 * Or, if starting with m_initial:
 * m_final = m_initial / exp(dV / Ve)
 * fuel = m_initial - m_final
 */
export function calculateFuelMass(massInitial_kg: number, dV_mps: number, isp: number): number {
    if (isp <= 0 || massInitial_kg <= 0) return 0;
    const Ve = isp * G0;
    const massFinal_kg = massInitial_kg / Math.exp(dV_mps / Ve);
    return massInitial_kg - massFinal_kg;
}

/**
 * Calculates the Delta-V possible given a fuel mass.
 * dV = Ve * ln(m_initial / m_final)
 */
export function calculateDeltaV(massInitial_kg: number, fuelMass_kg: number, isp: number): number {
    if (isp <= 0 || massInitial_kg <= 0) return 0;
    const Ve = isp * G0;
    const massFinal_kg = massInitial_kg - fuelMass_kg;
    if (massFinal_kg <= 0) return 0; // Consumed all mass?
    return Ve * Math.log(massInitial_kg / massFinal_kg);
}

/**
 * Calculates burn time for a given amount of fuel and thrust (or mass flow rate).
 * If we have Isp and Thrust, m_dot = Thrust / Ve
 * t = fuel_mass / m_dot
 */
export function calculateBurnTime(fuelMass_kg: number, thrust_N: number, isp: number): number {
    if (thrust_N <= 0 || isp <= 0) return 0;
    const Ve = isp * G0;
    const m_dot = thrust_N / Ve;
    return fuelMass_kg / m_dot;
}
