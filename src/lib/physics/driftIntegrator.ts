// Stage 3 core — a deterministic restricted-N-body integrator. A drifting/coasting construct is a massless
// TEST PARTICLE: it doesn't perturb anything, and the bodies it moves through (stars on the starmap, or a
// system's Keplerian bodies) have positions that are already closed-form in time. So we just integrate one
// point through a KNOWN, time-varying acceleration field. Fixed-step RK4 ⇒ pos(t) is a pure function of
// (anchor, field, t): fully reversible / time-slideable (re-deriving any T from the anchor gives the same
// point). Used by both the interstellar coast (wobble / star slingshot) and the in-system drift
// (fall-toward-star). Unit-agnostic — the caller supplies the field in whatever units its positions use.

export interface DriftAnchor { t0: number; x: number; y: number; vx: number; vy: number; }
// Acceleration on the test particle at a position and time. (ax, ay) in position-units / time-unit².
export type AccelField = (x: number, y: number, t: number) => [number, number];

// Integrate from the anchor to time t. Steps are capped (a runaway guard); the step is then sized to land
// exactly on t so the result is independent of how t divides dt.
export function driftAt(
  a: DriftAnchor, accel: AccelField, t: number, dt: number, maxSteps = 20000
): { x: number; y: number; vx: number; vy: number } {
  if (!(t > a.t0) || !(dt > 0)) return { x: a.x, y: a.y, vx: a.vx, vy: a.vy };
  let x = a.x, y = a.y, vx = a.vx, vy = a.vy, tc = a.t0;
  const total = t - a.t0;
  const steps = Math.min(maxSteps, Math.max(1, Math.ceil(total / dt)));
  const h = total / steps;
  for (let i = 0; i < steps; i++) {
    // RK4 on the coupled (position, velocity) system: pos' = vel, vel' = accel(pos, t).
    const [a1x, a1y] = accel(x, y, tc);
    const [a2x, a2y] = accel(x + 0.5 * h * vx, y + 0.5 * h * vy, tc + 0.5 * h);
    const v2x = vx + 0.5 * h * a1x, v2y = vy + 0.5 * h * a1y;
    const [a3x, a3y] = accel(x + 0.5 * h * v2x, y + 0.5 * h * v2y, tc + 0.5 * h);
    const v3x = vx + 0.5 * h * a2x, v3y = vy + 0.5 * h * a2y;
    const [a4x, a4y] = accel(x + h * v3x, y + h * v3y, tc + h);
    const v4x = vx + h * a3x, v4y = vy + h * a3y;
    x += (h / 6) * (vx + 2 * v2x + 2 * v3x + v4x);
    y += (h / 6) * (vy + 2 * v2y + 2 * v3y + v4y);
    vx += (h / 6) * (a1x + 2 * a2x + 2 * a3x + a4x);
    vy += (h / 6) * (a1y + 2 * a2y + 2 * a3y + a4y);
    tc += h;
  }
  return { x, y, vx, vy };
}

// Build an inverse-square acceleration field from a set of attractors (each a position + a "GM" gravita-
// tional parameter in the field's units). `posAt` lets attractors move in time (Keplerian in-system bodies);
// pass a constant for fixed stars. `soften` avoids a singularity at very small separations.
export interface Attractor { mu: number; posAt: (t: number) => [number, number]; }
export function inverseSquareField(attractors: Attractor[], soften = 1e-6): AccelField {
  return (x, y, t) => {
    let ax = 0, ay = 0;
    for (const at of attractors) {
      const [px, py] = at.posAt(t);
      const dx = px - x, dy = py - y;
      const r2 = dx * dx + dy * dy + soften;
      const inv = at.mu / (r2 * Math.sqrt(r2));   // mu/r² along the unit vector = mu*d / r³
      ax += inv * dx; ay += inv * dy;
    }
    return [ax, ay];
  };
}
