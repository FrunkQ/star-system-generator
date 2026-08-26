// Stage 3 core — a deterministic restricted-N-body integrator. A drifting/coasting construct is a massless
// TEST PARTICLE: it doesn't perturb anything, and the bodies it moves through (stars on the starmap, or a
// system's Keplerian bodies) have positions that are already closed-form in time. So we just integrate one
// point through a KNOWN, time-varying acceleration field. Fixed-step RK4 ⇒ pos(t) is a pure function of
// (anchor, field, t): fully reversible / time-slideable (re-deriving any T from the anchor gives the same
// point). Used by both the interstellar coast (wobble / star slingshot) and the in-system drift
// (fall-toward-star). Unit-agnostic — the caller supplies the field in whatever units its positions use.

// THREE-DIMENSIONAL, WITH THE THIRD DIMENSION OPTIONAL. `z`/`vz` and the third component of an
// `AccelField`'s answer may be omitted, and are then read as zero — so a caller written for the plane
// keeps working and gets exactly the answers it used to, while one that knows about inclination gets
// its height carried properly instead of dropped. Transit went 3D on 2026-08-26 and this is on its
// path: a journey cancelled mid-flight coasts from wherever it was, which is no longer necessarily
// on the reference plane.
export interface DriftAnchor { t0: number; x: number; y: number; z?: number; vx: number; vy: number; vz?: number; }
// Acceleration on the test particle at a position and time. (ax, ay, az) in position-units / time-unit².
export type AccelField = (x: number, y: number, t: number, z?: number) => [number, number] | [number, number, number];

// Integrate from the anchor to time t. Steps are capped (a runaway guard); the step is then sized to land
// exactly on t so the result is independent of how t divides dt.
export function driftAt(
  a: DriftAnchor, accel: AccelField, t: number, dt: number, maxSteps = 20000
): { x: number; y: number; z: number; vx: number; vy: number; vz: number } {
  const az0 = a.z ?? 0, avz0 = a.vz ?? 0;
  if (!(t > a.t0) || !(dt > 0)) return { x: a.x, y: a.y, z: az0, vx: a.vx, vy: a.vy, vz: avz0 };
  let x = a.x, y = a.y, z = az0, vx = a.vx, vy = a.vy, vz = avz0, tc = a.t0;
  const total = t - a.t0;
  const steps = Math.min(maxSteps, Math.max(1, Math.ceil(total / dt)));
  const h = total / steps;
  const f = (px: number, py: number, pz: number, pt: number): [number, number, number] => {
    const r = accel(px, py, pt, pz);
    return [r[0], r[1], r[2] ?? 0];
  };
  for (let i = 0; i < steps; i++) {
    // RK4 on the coupled (position, velocity) system: pos' = vel, vel' = accel(pos, t).
    const [a1x, a1y, a1z] = f(x, y, z, tc);
    const [a2x, a2y, a2z] = f(x + 0.5 * h * vx, y + 0.5 * h * vy, z + 0.5 * h * vz, tc + 0.5 * h);
    const v2x = vx + 0.5 * h * a1x, v2y = vy + 0.5 * h * a1y, v2z = vz + 0.5 * h * a1z;
    const [a3x, a3y, a3z] = f(x + 0.5 * h * v2x, y + 0.5 * h * v2y, z + 0.5 * h * v2z, tc + 0.5 * h);
    const v3x = vx + 0.5 * h * a2x, v3y = vy + 0.5 * h * a2y, v3z = vz + 0.5 * h * a2z;
    const [a4x, a4y, a4z] = f(x + h * v3x, y + h * v3y, z + h * v3z, tc + h);
    const v4x = vx + h * a3x, v4y = vy + h * a3y, v4z = vz + h * a3z;
    x += (h / 6) * (vx + 2 * v2x + 2 * v3x + v4x);
    y += (h / 6) * (vy + 2 * v2y + 2 * v3y + v4y);
    z += (h / 6) * (vz + 2 * v2z + 2 * v3z + v4z);
    vx += (h / 6) * (a1x + 2 * a2x + 2 * a3x + a4x);
    vy += (h / 6) * (a1y + 2 * a2y + 2 * a3y + a4y);
    vz += (h / 6) * (a1z + 2 * a2z + 2 * a3z + a4z);
    tc += h;
  }
  return { x, y, z, vx, vy, vz };
}

// Build an inverse-square acceleration field from a set of attractors (each a position + a "GM" gravita-
// tional parameter in the field's units). `posAt` lets attractors move in time (Keplerian in-system bodies);
// pass a constant for fixed stars. `soften` avoids a singularity at very small separations.
export interface Attractor { mu: number; posAt: (t: number) => [number, number] | [number, number, number]; }
export function inverseSquareField(attractors: Attractor[], soften = 1e-6): AccelField {
  return (x, y, t, z) => {
    const pz = z ?? 0;
    let ax = 0, ay = 0, az = 0;
    for (const at of attractors) {
      const p = at.posAt(t);
      const dx = p[0] - x, dy = p[1] - y, dz = (p[2] ?? 0) - pz;
      const r2 = dx * dx + dy * dy + dz * dz + soften;
      const inv = at.mu / (r2 * Math.sqrt(r2));   // mu/r² along the unit vector = mu*d / r³
      ax += inv * dx; ay += inv * dy; az += inv * dz;
    }
    return [ax, ay, az];
  };
}
