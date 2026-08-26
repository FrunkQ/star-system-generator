import { AU_KM, G } from '../constants';
import type { StateVector, Vector2 } from './types';

const AU_M = AU_KM * 1000;

/** Height above the reference plane, treating an absent z as flat. Every helper here goes through
 *  this, which is what makes a 2D literal and a 3D one interchangeable. */
export const zOf = (v: Vector2): number => v.z ?? 0;

export function distanceAU(v1: Vector2, v2: Vector2): number {
    const dx = v1.x - v2.x;
    const dy = v1.y - v2.y;
    const dz = zOf(v1) - zOf(v2);
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

/**
 * INTEGRATE A BALLISTIC ARC AND EMIT POINTS AT TIMES YOU CHOOSE.
 *
 * The output cadence and the integration cadence are separate concerns here, and keeping them
 * separate is the whole point (G46). `sampleTimesSec` says WHERE you want points — it may be as
 * uneven as you like, dense through a burn and sparse across a coast — while `maxStepSec` caps how
 * far the RK4 is allowed to march between them, so accuracy does not collapse when two requested
 * samples happen to be years apart.
 *
 * Drift correction is applied by TIME fraction rather than by index, because with uneven samples
 * those are no longer the same number; lerping by index would smear the correction toward whichever
 * end of the path happened to be sampled densely.
 */
export function integrateBallisticPathAtTimes(
    startPos: Vector2,
    startVel: Vector2,
    sampleTimesSec: number[],
    mu_au: number,
    opts?: {
        targetEndPos?: Vector2;                        // force the path to end here (drift correction)
        nBodyNodes?: { mu: number, pos: Vector2 }[];   // extra gravity sources
        maxStepSec?: number;                           // ceiling on the internal RK4 step
    }
): { points: Vector2[], drift_au: number } {
    const times = sampleTimesSec;
    if (times.length === 0) return { points: [], drift_au: 0 };

    const nBodyNodes = opts?.nBodyNodes;
    const targetEndPos = opts?.targetEndPos;

    type State = { r: Vector2, v: Vector2 };

    const getDeriv = (s: State): State => {
        // Primary Body. Gravity is a central force in whatever dimension you write it in, so this is
        // the same expression it always was with a third term added.
        const rz = zOf(s.r);
        const rMag = Math.sqrt(s.r.x*s.r.x + s.r.y*s.r.y + rz*rz);
        const rMag3 = Math.max(1e-18, rMag*rMag*rMag);
        let ax = -mu_au * s.r.x / rMag3;
        let ay = -mu_au * s.r.y / rMag3;
        let az = -mu_au * rz / rMag3;

        // N-Body summation
        if (nBodyNodes) {
            for (const node of nBodyNodes) {
                const dx = s.r.x - node.pos.x;
                const dy = s.r.y - node.pos.y;
                const dz = rz - zOf(node.pos);
                const dist2 = dx*dx + dy*dy + dz*dz;
                const dist = Math.sqrt(dist2);
                const dist3 = Math.max(1e-18, dist*dist2);
                ax -= node.mu * dx / dist3;
                ay -= node.mu * dy / dist3;
                az -= node.mu * dz / dist3;
            }
        }

        return { r: s.v, v: { x: ax, y: ay, z: az } };
    };

    const step = (r: Vector2, v: Vector2, dt: number): State => {
        const k1 = getDeriv({ r, v });

        const rz0 = zOf(r), vz0 = zOf(v);
        const s2 = {
            r: { x: r.x + k1.r.x * dt * 0.5, y: r.y + k1.r.y * dt * 0.5, z: rz0 + zOf(k1.r) * dt * 0.5 },
            v: { x: v.x + k1.v.x * dt * 0.5, y: v.y + k1.v.y * dt * 0.5, z: vz0 + zOf(k1.v) * dt * 0.5 }
        };
        const k2 = getDeriv(s2);

        const s3 = {
            r: { x: r.x + k2.r.x * dt * 0.5, y: r.y + k2.r.y * dt * 0.5, z: rz0 + zOf(k2.r) * dt * 0.5 },
            v: { x: v.x + k2.v.x * dt * 0.5, y: v.y + k2.v.y * dt * 0.5, z: vz0 + zOf(k2.v) * dt * 0.5 }
        };
        const k3 = getDeriv(s3);

        const s4 = {
            r: { x: r.x + k3.r.x * dt, y: r.y + k3.r.y * dt, z: rz0 + zOf(k3.r) * dt },
            v: { x: v.x + k3.v.x * dt, y: v.y + k3.v.y * dt, z: vz0 + zOf(k3.v) * dt }
        };
        const k4 = getDeriv(s4);

        return {
            r: {
                x: r.x + (dt/6) * (k1.r.x + 2*k2.r.x + 2*k3.r.x + k4.r.x),
                y: r.y + (dt/6) * (k1.r.y + 2*k2.r.y + 2*k3.r.y + k4.r.y),
                z: rz0 + (dt/6) * (zOf(k1.r) + 2*zOf(k2.r) + 2*zOf(k3.r) + zOf(k4.r))
            },
            v: {
                x: v.x + (dt/6) * (k1.v.x + 2*k2.v.x + 2*k3.v.x + k4.v.x),
                y: v.y + (dt/6) * (k1.v.y + 2*k2.v.y + 2*k3.v.y + k4.v.y),
                z: vz0 + (dt/6) * (zOf(k1.v) + 2*zOf(k2.v) + 2*zOf(k3.v) + zOf(k4.v))
            }
        };
    };

    const maxStepSec = opts?.maxStepSec && opts.maxStepSec > 0 ? opts.maxStepSec : Infinity;

    // HOW FAR THE INTEGRATOR MAY MARCH, SET BY THE GEOMETRY RATHER THAN THE CLOCK.
    //
    // A fixed step is fine on a near-circular arc and ruinous on an eccentric one, because angular
    // rate peaks at periapsis and a step that was modest out at aphelion is enormous coming through
    // the bottom. Measured on the Sol Expanse fixture: a Saturn-to-Jupiter gravity-assist leg is a
    // valid long-way-round Lambert arc with a 1.13 AU perihelion and an eccentricity near 0.96, and
    // marching it at a flat two-day step threw the integration off its own conic — the drawn path
    // reached 53 AU and 313 km/s on a plan whose entire Delta-v budget is 34 km/s.
    //
    // Capping the swept ANGLE per step fixes that and costs nothing elsewhere: out at aphelion the cap
    // is never the binding constraint and the step stays as long as the caller allowed it to be.
    const MAX_STEP_RAD = 0.01; // ~0.57 degrees of arc per RK4 step
    const MAX_SUBSTEPS_PER_INTERVAL = 2000; // guard, so a pathological state cannot hang a redraw
    const stepCap = (rr: Vector2, vv: Vector2): number => {
        const rz = zOf(rr);
        const r2 = rr.x * rr.x + rr.y * rr.y + rz * rz;
        if (!(r2 > 0)) return maxStepSec;
        const hv = cross3(rr, vv);
        const h = Math.sqrt(hv.x * hv.x + hv.y * hv.y + (hv.z ?? 0) * (hv.z ?? 0)); // specific angular momentum
        const omega = h / r2;                          // rad/s about the primary
        if (!(omega > 0)) return maxStepSec;
        return Math.min(maxStepSec, MAX_STEP_RAD / omega);
    };

    let r = startPos;
    let v = startVel;
    let tNow = times[0];
    const points: Vector2[] = [{ ...startPos }];

    for (let i = 1; i < times.length; i++) {
        let t = tNow;
        let guard = 0;
        while (t < times[i] && guard++ < MAX_SUBSTEPS_PER_INTERVAL) {
            const dt = Math.min(times[i] - t, stepCap(r, v));
            if (!(dt > 0)) break;
            const next = step(r, v, dt);
            r = next.r;
            v = next.v;
            t += dt;
        }
        tNow = times[i];
        points.push({ ...r });
    }

    let drift_au = 0;

    // Drift Correction (Linear Lerp, by time)
    if (targetEndPos && points.length > 1) {
        const last = points[points.length - 1];
        const dx = targetEndPos.x - last.x;
        const dy = targetEndPos.y - last.y;
        const dz = zOf(targetEndPos) - zOf(last);
        drift_au = Math.sqrt(dx*dx + dy*dy + dz*dz);

        const span = times[times.length - 1] - times[0];
        for (let i = 1; i < points.length; i++) {
            const progress = span > 0 ? (times[i] - times[0]) / span : 1;
            points[i].x += dx * progress;
            points[i].y += dy * progress;
            points[i].z = zOf(points[i]) + dz * progress;
        }
    }

    return { points, drift_au };
}

/**
 * The uniform-cadence form, kept because most callers want exactly that. It is a thin wrapper over
 * `integrateBallisticPathAtTimes` rather than a second RK4: two integrators would be two answers to
 * one question, and this codebase has been bitten by that repeatedly.
 */
export function integrateBallisticPath(
    startPos: Vector2, 
    startVel: Vector2, 
    durationSec: number, 
    mu_au: number, 
    steps: number = 100,
    targetEndPos?: Vector2, // OPTIONAL: Force path to end here (Drift Correction)
    nBodyNodes?: { mu: number, pos: Vector2 }[] // OPTIONAL: Extra gravity sources
): { points: Vector2[], drift_au: number } {
    const dt = durationSec / steps;
    const times: number[] = [];
    for (let i = 0; i <= steps; i++) times.push(i * dt);
    return integrateBallisticPathAtTimes(startPos, startVel, times, mu_au, {
        targetEndPos, nBodyNodes, maxStepSec: dt
    });
}

export function subtract(v1: Vector2, v2: Vector2): Vector2 {
    return { x: v1.x - v2.x, y: v1.y - v2.y, z: zOf(v1) - zOf(v2) };
}

export function add(v1: Vector2, v2: Vector2): Vector2 {
    return { x: v1.x + v2.x, y: v1.y + v2.y, z: zOf(v1) + zOf(v2) };
}

export function magnitude(v: Vector2): number {
    const z = zOf(v);
    return Math.sqrt(v.x*v.x + v.y*v.y + z*z);
}

export function dot(v1: Vector2, v2: Vector2): number {
    return v1.x * v2.x + v1.y * v2.y + zOf(v1) * zOf(v2);
}

/** The z-component of the cross product — the only part a flat transfer ever needed, and still the
 *  part that decides which way round the reference plane a transfer goes. */
export function cross(v1: Vector2, v2: Vector2): number {
    return v1.x * v2.y - v1.y * v2.x;
}

/** The full cross product. The transfer PLANE of an inclined Lambert arc is its direction. */
export function cross3(v1: Vector2, v2: Vector2): Vector2 {
    const a = zOf(v1), b = zOf(v2);
    return {
        x: v1.y * b - a * v2.y,
        y: a * v2.x - v1.x * b,
        z: v1.x * v2.y - v1.y * v2.x
    };
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
    
    // THE TRANSFER ANGLE, IN THE PLANE THE TWO RADII ACTUALLY SHARE.
    //
    // The universal-variable machinery below is dimension-agnostic — Stumpff, y, x and the f and g
    // series never ask how many components a vector has. This is the one place that did: it took the
    // difference of two `atan2(y, x)` bearings, which is a statement about the reference plane rather
    // than about the transfer.
    //
    // The angle now comes from the vectors themselves — `atan2(|r1 x r2|, r1 . r2)` — and its SIGN
    // from the z-component of that cross product, which is the same prograde-relative-to-the-reference-
    // plane convention the bearings encoded. For two coplanar radii the two expressions are identically
    // equal, so a flat system's transfers are unchanged to the last bit; for an inclined one the arc
    // now bends through the plane it really travels in, which is why the distances come out longer.
    const hVec = cross3(r1, r2);
    const crossMag = magnitude(hVec);
    const dotVal = dot(r1, r2);
    let dTheta = Math.atan2(crossMag, dotVal); // [0, PI] — unsigned angle between the radii
    if (zOf(hVec) < 0) dTheta = -dTheta;       // ...signed the way the old bearing difference signed it

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

    const Z_LO = -10000.0, Z_HI = 4 * Math.PI * Math.PI;
    let z = 0;
    let loops = 0;

    // 04.3 — Newton-Raphson pre-pass (fast; quadratic convergence). Uses a NUMERICAL derivative to
    // avoid the fragile analytic Stumpff derivatives. If it can't converge in-range it falls through
    // to the robust bisection below, so correctness can never regress — bisection is the guarantee.
    const tOfZ = (zz: number): number => {
        const Cz = C(zz);
        if (Cz <= 0 || !Number.isFinite(Cz)) return NaN;
        const Sz = S(zz);
        const yy = r1mag + r2mag + A * (zz * Sz - 1) / Math.sqrt(Cz);
        if (yy < 0 || !Number.isFinite(yy)) return NaN;
        const xx = Math.sqrt(yy / Cz);
        return (xx * xx * xx * Sz + A * Math.sqrt(yy)) / Math.sqrt(mu);
    };
    let converged = false;
    {
        let zn = 0;
        for (let it = 0; it < 40; it++) {
            const t = tOfZ(zn);
            if (!Number.isFinite(t)) break;
            if (Math.abs(t - dt_sec) < 1e-6 * dt_sec) { z = zn; converged = true; break; }
            const h = Math.max(1e-4, Math.abs(zn) * 1e-4);
            const tp = tOfZ(zn + h), tm = tOfZ(zn - h);
            if (!Number.isFinite(tp) || !Number.isFinite(tm)) break;
            const deriv = (tp - tm) / (2 * h);
            if (!Number.isFinite(deriv) || Math.abs(deriv) < 1e-30) break;
            const next = zn + (dt_sec - t) / deriv;
            if (!Number.isFinite(next) || next <= Z_LO || next >= Z_HI) break; // out of range → bisection
            zn = next;
        }
    }

    // Robust Bisection Method (fallback / guarantee). Range supports high-energy hyperbolic transfers.
    let lower = Z_LO;
    let upper = Z_HI;

    while (!converged && loops < 200) {
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
    const v1z = (zOf(r2) - f * zOf(r1)) / g;
    
    // v2 = g_dot * r2 - r1 ?? No.
    // r2 = f r1 + g v1
    // v2 = f_dot r1 + g_dot v1
    
    const f_dot = (Math.sqrt(mu) / (r1mag * r2mag)) * Math.sqrt(y) * (z * Sz - 1);
    
    const v2x = f_dot * r1.x + g_dot * v1x;
    const v2y = f_dot * r1.y + g_dot * v1y;
    const v2z = f_dot * zOf(r1) + g_dot * v1z;

    return {
        v1: { x: v1x, y: v1y, z: v1z },
        v2: { x: v2x, y: v2y, z: v2z }
    };
}
