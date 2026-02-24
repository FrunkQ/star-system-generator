import type { CelestialBody, Barycenter, Orbit } from '../types';
import { AU_KM, G } from '../constants';
import type { StateVector, Vector2 } from './types';
import { propagateState as propagateStatePhysics } from '../physics/orbits';

const AU_M = AU_KM * 1000;

/**
 * Propagates an orbit to a specific time and returns the full State Vector (Position and Velocity).
 * @deprecated Use src/lib/physics/orbits.ts instead
 */
export function propagateState(node: CelestialBody | Barycenter | { orbit: Orbit }, tMs: number): StateVector {
    return propagateStatePhysics(node as any, tMs);
}

export function distanceAU(v1: Vector2, v2: Vector2): number {
    const dx = v1.x - v2.x;
    const dy = v1.y - v2.y;
    return Math.sqrt(dx*dx + dy*dy);
}

export function integrateBallisticPath(
    startPos: Vector2, 
    startVel: Vector2, 
    durationSec: number, 
    mu_au: number, 
    steps: number = 100,
    targetEndPos?: Vector2 // OPTIONAL: Force path to end here (Drift Correction)
): Vector2[] {
    const points: Vector2[] = [startPos];
    const dt = durationSec / steps;
    
    let r = startPos;
    let v = startVel;
    
    // RK4 Helper
    type State = { r: Vector2, v: Vector2 };
    
    const getDeriv = (s: State): State => {
        const rMag = Math.sqrt(s.r.x*s.r.x + s.r.y*s.r.y);
        const rMag3 = rMag*rMag*rMag;
        const ax = -mu_au * s.r.x / rMag3;
        const ay = -mu_au * s.r.y / rMag3;
        return { r: s.v, v: { x: ax, y: ay } };
    };

    for (let i = 0; i < steps; i++) {
        // RK4 Integration Step
        const k1 = getDeriv({ r, v });
        
        const s2 = {
            r: { x: r.x + k1.r.x * dt * 0.5, y: r.y + k1.r.y * dt * 0.5 },
            v: { x: v.x + k1.v.x * dt * 0.5, y: v.y + k1.v.y * dt * 0.5 }
        };
        const k2 = getDeriv(s2);
        
        const s3 = {
            r: { x: r.x + k2.r.x * dt * 0.5, y: r.y + k2.r.y * dt * 0.5 },
            v: { x: v.x + k2.v.x * dt * 0.5, y: v.y + k2.v.y * dt * 0.5 }
        };
        const k3 = getDeriv(s3);
        
        const s4 = {
            r: { x: r.x + k3.r.x * dt, y: r.y + k3.r.y * dt },
            v: { x: v.x + k3.v.x * dt, y: v.y + k3.v.y * dt }
        };
        const k4 = getDeriv(s4);
        
        r = {
            x: r.x + (dt/6) * (k1.r.x + 2*k2.r.x + 2*k3.r.x + k4.r.x),
            y: r.y + (dt/6) * (k1.r.y + 2*k2.r.y + 2*k3.r.y + k4.r.y)
        };
        v = {
            x: v.x + (dt/6) * (k1.v.x + 2*k2.v.x + 2*k3.v.x + k4.v.x),
            y: v.y + (dt/6) * (k1.v.y + 2*k2.v.y + 2*k3.v.y + k4.v.y)
        };
        
        points.push(r);
    }

    // Drift Correction (Linear Lerp)
    if (targetEndPos) {
        const finalPoint = points[points.length - 1];
        const driftX = targetEndPos.x - finalPoint.x;
        const driftY = targetEndPos.y - finalPoint.y;
        
        // Distribute error linearly over time (t/T)
        // i=0 (Start) gets 0 correction. i=steps (End) gets full correction.
        for (let i = 1; i < points.length; i++) {
            const progress = i / steps;
            points[i].x += driftX * progress;
            points[i].y += driftY * progress;
        }
    }

    return points;
}

export function subtract(v1: Vector2, v2: Vector2): Vector2 {
    return { x: v1.x - v2.x, y: v1.y - v2.y };
}

export function add(v1: Vector2, v2: Vector2): Vector2 {
    return { x: v1.x + v2.x, y: v1.y + v2.y };
}

export function magnitude(v: Vector2): number {
    return Math.sqrt(v.x*v.x + v.y*v.y);
}

export function dot(v1: Vector2, v2: Vector2): number {
    return v1.x * v2.x + v1.y * v2.y;
}

export function cross(v1: Vector2, v2: Vector2): number {
    return v1.x * v2.y - v1.y * v2.x;
}

/**
 * Solves Lambert's problem using a standard Universal Variable method.
 * Adapted from standard astrodynamics (e.g., Vallado).
 */
export function solveLambert(
    r1: Vector2,
    r2: Vector2,
    dt_sec: number,
    mu: number,
    options?: { longWay?: boolean }
): { v1: Vector2, v2: Vector2 } | null {
    const r1mag = magnitude(r1);
    const r2mag = magnitude(r2);
    
    const crossVal = cross(r1, r2);
    const dotVal = dot(r1, r2);
    
    // Calculate delta theta (nu)
    let dNu = Math.atan2(crossVal, dotVal); // This gives angle between vectors respecting direction
    // If prograde (which we assume for now), we want dNu > 0. 
    // But in 2D, the sign of cross tells us direction.
    // If we assume "Short Way", dNu should be between -PI and PI.
    // If we assume "Prograde", we might need to adjust.
    
    // Let's force "Short Way" (dNu < PI) for this implementation, or handle "Long Way".
    // Simple approach: assume counter-clockwise transfer.
    // Math.atan2(y,x) gives absolute angles.
    let theta1 = Math.atan2(r1.y, r1.x);
    let theta2 = Math.atan2(r2.y, r2.x);
    let dTheta = theta2 - theta1;
    
    // Normalize to -PI..PI first, then optionally request the long-way branch.
    while (dTheta > Math.PI) dTheta -= 2 * Math.PI;
    while (dTheta <= -Math.PI) dTheta += 2 * Math.PI;

    if (options?.longWay) {
        dTheta = dTheta > 0 ? dTheta - 2 * Math.PI : dTheta + 2 * Math.PI;
    }
    
    // console.log("Lambert dTheta:", dTheta * 180 / Math.PI, "dt:", dt_sec);

    // Universal Variable Setup
    const denom = 1 - Math.cos(dTheta);
    if (Math.abs(denom) < 1e-12) return null;
    const A = Math.sin(dTheta) * Math.sqrt(r1mag * r2mag / denom);
    if (!Number.isFinite(A) || Math.abs(A) < 1e-12) return null;
    
    // Stumpff functions
    const C = (z: number) => {
        if (z > 1e-6) return (1 - Math.cos(Math.sqrt(z))) / z;
        if (z < -1e-6) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
        return 0.5;
    };
    const S = (z: number) => {
        if (z > 1e-6) return (Math.sqrt(z) - Math.sin(Math.sqrt(z))) / Math.sqrt(z*z*z);
        if (z < -1e-6) return (Math.sinh(Math.sqrt(-z)) - Math.sqrt(-z)) / Math.sqrt(-z*-z*-z);
        return 1/6;
    };

    // Robust Bisection Method
    // Range of z:
    // Lower bound: Expanded to support high-energy hyperbolic transfers (Torchships)
    // Upper bound: 4*pi^2 (Elliptic limit for multi-rev checks usually, but single rev fits here)
    
    let lower = -10000.0;
    let upper = 4 * Math.PI * Math.PI;
    let z = 0;
    let loops = 0;
    
    while (loops < 200) {
        z = (lower + upper) / 2;
        const Sz = S(z);
        const Cz = C(z);
        if (Cz <= 0 || !Number.isFinite(Cz)) {
            lower = z;
            loops++;
            continue;
        }

        const y = r1mag + r2mag + A * (z * Sz - 1) / Math.sqrt(Cz);
        
        if (y < 0 || isNaN(y)) {
            // Physical impossibility or domain error -> adjust search
            // Usually y<0 means z is too low (too hyperbolic)
            lower = z;
            loops++;
            continue;
        }
        
        const x = Math.sqrt(y / Cz);
        const t_calc = (x*x*x*Sz + A*Math.sqrt(y)) / Math.sqrt(mu);
        
        if (Math.abs(dt_sec - t_calc) < 1e-4 * dt_sec) break; // Converged
        
        // Monotonicity check:
        // For Elliptic (z>0), higher z -> higher t?
        // Actually it's complex. But bisection works if monotonic.
        // Let's check direction.
        
        if (t_calc < dt_sec) {
            // Time too short -> need longer path -> higher z (closer to parabolic/elliptic high)
            lower = z;
        } else {
            upper = z;
        }
        loops++;
    }
    
    // Failed to converge? Fallback to a simpler approx?
    // Let's try assuming Hohmann-ish transfer to get "something".
    if (loops >= 200) {
        // console.warn("Lambert failed to converge");
        return null;
    }

    const Sz = S(z);
    const Cz = C(z);
    if (Cz <= 0 || !Number.isFinite(Cz)) return null;
    const y = r1mag + r2mag + A * (z * Sz - 1) / Math.sqrt(Cz); // Recalculate y for final z
    if (y <= 0 || !Number.isFinite(y)) return null;

    const f = 1 - y / r1mag;
    const g = A * Math.sqrt(y / mu);
    if (!Number.isFinite(g) || Math.abs(g) < 1e-12) return null;
    const g_dot = 1 - y / r2mag;
    
    const v1x = (r2.x - f * r1.x) / g;
    const v1y = (r2.y - f * r1.y) / g;
    
    // v2 = g_dot * r2 - r1 ?? No.
    // r2 = f r1 + g v1
    // v2 = f_dot r1 + g_dot v1
    
    const f_dot = (Math.sqrt(mu) / (r1mag * r2mag)) * Math.sqrt(y) * (z * Sz - 1);
    
    const v2x = f_dot * r1.x + g_dot * v1x;
    const v2y = f_dot * r1.y + g_dot * v1y;

    return {
        v1: { x: v1x, y: v1y },
        v2: { x: v2x, y: v2y }
    };
}
