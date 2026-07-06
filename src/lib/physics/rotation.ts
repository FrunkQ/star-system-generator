// Rotational deformation. A spinning body bulges at its equator (oblate), and if it spins fast enough
// the equatorial centrifugal acceleration reaches surface gravity — it stops holding together and sheds
// mass / flies apart (the material would spread into a ring). For a self-gravitating body the BREAKUP
// spin depends only on bulk DENSITY: ω_breakup = sqrt((4/3)·π·G·ρ), so the minimum stable rotation
// PERIOD is T_min = sqrt(3π / (G·ρ)) — a denser world can spin faster before it lets go. Composition
// sets the density, so composition sets this limit; it's all derived dynamically from ρ + spin.
import { G } from '$lib/constants';

const SEC_PER_HOUR = 3600;

// Minimum stable rotation period (hours) for a bulk density (g/cc). Spin any faster than this and the
// body is beyond mass-shedding — it would break up into a ring rather than stay a body.
export function breakupPeriodHours(densityGcc: number): number {
  const rho = Math.max(1e-3, densityGcc) * 1000; // g/cc → kg/m³
  return Math.sqrt((3 * Math.PI) / (G * rho)) / SEC_PER_HOUR;
}

// Spin as a FRACTION of the breakup spin: 0 = not spinning, 1 = mass-shedding limit. = ω/ω_breakup =
// T_breakup / T. (Retrograde spin is just as deforming, so the sign of the period doesn't matter.)
export function spinFraction(rotationHours: number, densityGcc: number): number {
  const T = Math.abs(rotationHours);
  if (!(T > 0) || !Number.isFinite(T)) return 0;
  return breakupPeriodHours(densityGcc) / T;
}

// Equatorial oblateness (flattening) f = (a − c) / a, from the spin fraction. Maclaurin small-f proxy
// f ≈ (5/4)·(ω/ω_breakup)², clamped. (Real centrally-condensed worlds flatten a little less, but this
// tracks Jupiter/Saturn well enough for a shape cue.)
export function oblateness(rotationHours: number, densityGcc: number): number {
  const r = spinFraction(rotationHours, densityGcc);
  return Math.min(0.95, 1.25 * r * r);
}

export type RotationalShape = 'spherical' | 'oblate' | 'ellipsoid' | 'near-breakup' | 'unstable';

// Spin-fraction thresholds. Calibrated so real worlds stay sane: Earth r≈0.06 (spherical), Jupiter
// r≈0.29 and Saturn r≈0.37 (oblate — they ARE the flattened planets), and only a genuinely fast rotator
// deforms into an ellipsoid, then toward mass-shedding, then breaks up.
export const OBLATE_AT = 0.25;      // noticeably flattened (significant spheroid)
export const ELLIPSOID_AT = 0.5;    // triaxial (Jacobi-ellipsoid regime)
export const NEAR_BREAKUP_AT = 0.8; // strongly deformed, close to shedding mass (toroidal-tending)
export const BREAKUP_AT = 1.0;      // at/over the limit — would fly apart into a ring

export interface RotationalDeform {
  breakupPeriodHours: number; // the hard limit
  fraction: number;           // 0..1+ (≥1 ⇒ unstable)
  oblateness: number;         // f = (a−c)/a
  shape: RotationalShape;
}

// The full derived shape for a body — computed dynamically whenever composition (→ density) or the
// rotation period changes.
export function rotationalDeform(rotationHours: number, densityGcc: number): RotationalDeform {
  const fraction = spinFraction(rotationHours, densityGcc);
  const shape: RotationalShape =
    fraction >= BREAKUP_AT ? 'unstable'
    : fraction >= NEAR_BREAKUP_AT ? 'near-breakup'
    : fraction >= ELLIPSOID_AT ? 'ellipsoid'
    : fraction >= OBLATE_AT ? 'oblate'
    : 'spherical';
  return { breakupPeriodHours: breakupPeriodHours(densityGcc), fraction, oblateness: oblateness(rotationHours, densityGcc), shape };
}
