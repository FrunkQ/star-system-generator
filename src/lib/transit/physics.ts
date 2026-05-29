import type { System, CelestialBody, Barycenter } from '../types';
import type { StateVector } from './types';
import { subtract } from './math';
import { propagateState } from '../physics/orbits';
import { G } from '../constants';
import { AU_KM } from '../constants';

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
        
        // A. Explicit Kinematic Vector
        // Only use if actively in transit/deep space, OR if it has no orbit definition to fall back on.
        const isActivelyMoving = c.flight_state === 'Transit' || c.flight_state === 'Deep Space';
        const hasVector = c.vector_position_au && c.vector_velocity_ms;
        
        if (hasVector && (isActivelyMoving || !c.orbit)) {
            const epochMs = Number.isFinite(c.vector_epoch_ms) ? c.vector_epoch_ms : tMs;
            const dtSec = (tMs - epochMs) / 1000;
            const vxAuSec = c.vector_velocity_ms.x / AU_M;
            const vyAuSec = c.vector_velocity_ms.y / AU_M;
            
            return {
                r: {
                    x: c.vector_position_au.x + (vxAuSec * dtSec),
                    y: c.vector_position_au.y + (vyAuSec * dtSec)
                },
                v: { x: vxAuSec, y: vyAuSec }
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
                        r: { x: parentGlobal.r.x + radiusAu, y: parentGlobal.r.y }, // Simplified offset
                        v: parentGlobal.v
                    };
                }
                return parentGlobal;
            }
        }
    }

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
