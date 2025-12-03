import type { CelestialBody, Barycenter, Orbit } from '../types';
import { AU_KM, G } from '../constants';
import type { StateVector, Vector2 } from './types';

const AU_M = AU_KM * 1000;

/**
 * Propagates an orbit to a specific time and returns the full State Vector (Position and Velocity).
 * Position is in AU.
 * Velocity is in AU/s.
 */
export function propagateState(node: CelestialBody | Barycenter | { orbit: Orbit }, tMs: number): StateVector {
  if (!('orbit' in node) || !node.orbit) {
    return { r: { x: 0, y: 0 }, v: { x: 0, y: 0 } };
  }

  const { elements, hostMu, t0 } = node.orbit;
  const { a_AU, e, M0_rad } = elements;

  // Handle trivial case (Star/Root)
  if (hostMu === 0 || !a_AU) return { r: { x: 0, y: 0 }, v: { x: 0, y: 0 } };

  const a_m = a_AU * AU_M; // semi-major axis in meters

  // 1. Mean motion (n)
  let n = node.orbit.n_rad_per_s ?? Math.sqrt(hostMu / Math.pow(a_m, 3));
  const isRetrograde = !!node.orbit.isRetrogradeOrbit;
  if (isRetrograde) {
    n = -n;
  }

  // 2. Mean anomaly (M) at time t
  // tMs is current time in ms, t0 is epoch in ms
  const dt_sec = (tMs - t0) / 1000;
  const M = M0_rad + n * dt_sec;

  // 3. Solve Kepler's Equation for Eccentric Anomaly (E)
  let E: number;
  if (e < 1e-6) {
    E = M; 
  } else {
    E = M;
    for (let i = 0; i < 10; i++) {
      const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-7) break;
    }
  }

  // 4. True Anomaly (f)
  const sqrt1plusE = Math.sqrt(1 + e);
  const sqrt1minusE = Math.sqrt(1 - e);
  const f = 2 * Math.atan2(
      sqrt1plusE * Math.sin(E / 2),
      sqrt1minusE * Math.cos(E / 2)
  );

  // 5. Position in Perifocal Frame
  const r_dist_m = a_m * (1 - e * Math.cos(E));
  const x_p_m = r_dist_m * Math.cos(f);
  const y_p_m = r_dist_m * Math.sin(f);

  // 6. Velocity in Perifocal Frame
  
  const term = 1 - e * e;
  const p = a_m * (term > 1e-9 ? term : 1e-9); 
  const h = Math.sqrt(hostMu * p);
  const mu_h = hostMu / h;

  let vx_p_mps = -mu_h * Math.sin(f);
  let vy_p_mps = mu_h * (e + Math.cos(f));
  
  // 7. Rotate to System Frame (Arg of Periapsis)
  const omega_rad = (node.orbit.elements.omega_deg || 0) * (Math.PI / 180);
  const cos_o = Math.cos(omega_rad);
  const sin_o = Math.sin(omega_rad);

  const x_au = (x_p_m * cos_o - y_p_m * sin_o) / AU_M;
  const y_au = (x_p_m * sin_o + y_p_m * cos_o) / AU_M;

  const vx_mps = vx_p_mps * cos_o - vy_p_mps * sin_o;
  const vy_mps = vx_p_mps * sin_o + vy_p_mps * cos_o;

  return {
    r: { x: x_au, y: y_au },
    v: { x: vx_mps / AU_M, y: vy_mps / AU_M } // Convert m/s to AU/s
  };
}

export function distanceAU(v1: Vector2, v2: Vector2): number {
    const dx = v1.x - v2.x;
    const dy = v1.y - v2.y;
    return Math.sqrt(dx*dx + dy*dy);
}

export function subtract(v1: Vector2, v2: Vector2): Vector2 {
    return { x: v1.x - v2.x, y: v1.y - v2.y };
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
export function solveLambert(r1: Vector2, r2: Vector2, dt_sec: number, mu: number): { v1: Vector2, v2: Vector2 } | null {
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
    
    // Normalize to -PI..PI (Short Way)
    // This ensures we solve for the direct chord (transfer angle < 180), 
    // avoiding "Long Way" sundivers for co-orbital transfers (like L4 -> Earth).
    while (dTheta > Math.PI) dTheta -= 2 * Math.PI;
    while (dTheta <= -Math.PI) dTheta += 2 * Math.PI;
    
    // console.log("Lambert dTheta:", dTheta * 180 / Math.PI, "dt:", dt_sec);

    // Universal Variable Setup
    const A = Math.sin(dTheta) * Math.sqrt(r1mag * r2mag / (1 - Math.cos(dTheta)));
    
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
    if (loops >= 100) {
        // console.warn("Lambert failed to converge");
        return null;
    }

    const Sz = S(z);
    const Cz = C(z);
    const y = r1mag + r2mag + A * (z * Sz - 1) / Math.sqrt(Cz); // Recalculate y for final z

    const f = 1 - y / r1mag;
    const g = A * Math.sqrt(y / mu);
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