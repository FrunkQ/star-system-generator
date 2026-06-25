// Deterministic two-body coast — the conic an abandoned/adrift ship follows under a single dominant gravity
// source (the star). Replaces step-integration of the drift, which was sampling-dependent (scrubbing changed
// the step count → different results) and injected energy through perihelion (the unphysical "slingshot at
// 1500 km/s"). The universal-variable (Stumpff) formulation propagates a state vector by dt analytically and
// handles ellipse, parabola AND hyperbola uniformly — so it's exact, energy-conserving, and the SAME query
// time always yields the SAME state regardless of how you got there.
//
// References: Curtis, "Orbital Mechanics for Engineering Students", Algorithm 3.4 (universal Kepler) + 3.3
// (Lagrange f/g). Internals are SI (metres, m/s, mu in m^3/s^2).

import { AU_KM, G } from '../constants';
import type { System, Vector2 } from '../types';

const AU_M = AU_KM * 1000;

// Stumpff functions C(z), S(z) — the series that unify the conic cases (z>0 elliptic, z<0 hyperbolic, z≈0 parabolic).
function stumpffC(z: number): number {
  if (z > 1e-6) { const s = Math.sqrt(z); return (1 - Math.cos(s)) / z; }
  if (z < -1e-6) { const s = Math.sqrt(-z); return (Math.cosh(s) - 1) / -z; }
  return 0.5; // series limit at z→0
}
function stumpffS(z: number): number {
  if (z > 1e-6) { const s = Math.sqrt(z); return (s - Math.sin(s)) / (s * s * s); }
  if (z < -1e-6) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / (s * s * s); }
  return 1 / 6; // series limit at z→0
}

// Propagate a state vector (position r0 [m], velocity v0 [m/s]) by dt seconds under point mass `mu` [m^3/s^2].
// Returns the new position + velocity. Works for any conic; dt may be negative (propagate backwards).
export function keplerUniversal(
  r0: Vector2, v0: Vector2, mu: number, dt: number
): { r: Vector2; v: Vector2 } {
  if (dt === 0 || !(mu > 0)) return { r: { ...r0 }, v: { ...v0 } };
  const r0mag = Math.hypot(r0.x, r0.y);
  const v0mag = Math.hypot(v0.x, v0.y);
  if (r0mag === 0) return { r: { ...r0 }, v: { ...v0 } };
  const vr0 = (r0.x * v0.x + r0.y * v0.y) / r0mag;   // radial speed
  const alpha = 2 / r0mag - (v0mag * v0mag) / mu;    // = 1/a  (>0 ellipse, <0 hyperbola, ~0 parabola)
  const sqrtMu = Math.sqrt(mu);

  // Initial guess for the universal anomaly χ (Curtis 3.4).
  let chi = Math.abs(alpha) > 1e-12 ? sqrtMu * Math.abs(alpha) * dt : (sqrtMu * dt) / r0mag;

  for (let i = 0; i < 200; i++) {
    const z = alpha * chi * chi;
    const C = stumpffC(z), S = stumpffS(z);
    const chi2 = chi * chi, chi3 = chi2 * chi;
    const F = (r0mag * vr0 / sqrtMu) * chi2 * C + (1 - alpha * r0mag) * chi3 * S + r0mag * chi - sqrtMu * dt;
    const dF = (r0mag * vr0 / sqrtMu) * chi * (1 - alpha * chi2 * S) + (1 - alpha * r0mag) * chi2 * C + r0mag;
    if (Math.abs(dF) < 1e-30) break;
    const ratio = F / dF;
    chi -= ratio;
    if (Math.abs(ratio) < 1e-9) break;
  }

  // Lagrange f, g (position) and ḟ, ġ (velocity).
  const z = alpha * chi * chi;
  const C = stumpffC(z), S = stumpffS(z);
  const f = 1 - (chi * chi / r0mag) * C;
  const g = dt - (1 / sqrtMu) * chi * chi * chi * S;
  const r = { x: f * r0.x + g * v0.x, y: f * r0.y + g * v0.y };
  const rmag = Math.hypot(r.x, r.y) || 1;
  const fdot = (sqrtMu / (rmag * r0mag)) * (alpha * chi * chi * chi * S - chi);
  const gdot = 1 - (chi * chi / rmag) * C;
  const v = { x: fdot * r0.x + gdot * v0.x, y: fdot * r0.y + gdot * v0.y };
  return { r, v };
}

// Heliocentric coast: where an adrift ship is at `atMs`, given the heliocentric state (AU + m/s) it was cut
// loose at `cancelMs`. The star sits at the system origin, so the heliocentric vector IS the absolute one.
// Deterministic + exact through perihelion (no slingshot blow-up). Returns null if there's no star to fall to.
export function coastConicAt(
  system: System, position_au: Vector2, velocity_ms: Vector2, cancelMs: number, atMs: number
): { position_au: Vector2; velocity_ms: Vector2 } | null {
  const root: any = system.nodes.find((n: any) => n.parentId === null || n.parentId == null);
  const mass = root?.massKg ?? root?.effectiveMassKg ?? 0;
  if (!(mass > 0)) return null;
  const mu = G * mass; // m^3/s^2
  const r0 = { x: position_au.x * AU_M, y: position_au.y * AU_M };
  const out = keplerUniversal(r0, { x: velocity_ms.x, y: velocity_ms.y }, mu, (atMs - cancelMs) / 1000);
  return {
    position_au: { x: out.r.x / AU_M, y: out.r.y / AU_M },
    velocity_ms: { x: out.v.x, y: out.v.y }
  };
}
