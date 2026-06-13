import { AU_KM, G } from '../constants';

// Tidal despinning (locking) timescale — the Gladman et al. 1996 / Peale form:
//   t_lock = (ω · a⁶ · I · Q) / (3 · G · M_host² · k₂ · R⁵),   with I ≈ 0.4 · m · R²
//          = (0.4 · ω · a⁶ · m · Q) / (3 · G · M_host² · k₂ · R³)
// where ω is the body's primordial spin rate, a the semi-major axis about its host, m/R the body's
// mass/radius, M_host the host (planet for a moon, star/barycentre for a planet), and Q/k₂ the tidal
// quality factor / degree-2 Love number. A body counts as tidally locked once t_lock < the system
// age — the a⁶ steepness means close-in bodies (every major moon, Mercury, hot Jupiters) lock fast
// while AU-distance planets (Earth, Venus, Mars) and the giants never do.
//
// Calibrated (primordial period 13.5 h, Q 100, k₂ 0.3) against the Solar System: it locks every
// regular moon + Mercury and leaves Earth/Venus/Mars and the gas giants free-spinning.
const PRIMORDIAL_SPIN_PERIOD_S = 13.5 * 3600; // a freshly-accreted body spins fast
const Q = 100;   // tidal quality factor (rocky/icy bodies)
const K2 = 0.3;  // degree-2 Love number
const GYR_S = 3.1557e16;

export function tidalLockTimescaleGyr(
  aAU: number, radiusKm: number, massKg: number, hostMassKg: number
): number {
  const a = aAU * AU_KM * 1000; // m
  const R = radiusKm * 1000;    // m
  if (!(a > 0 && R > 0 && massKg > 0 && hostMassKg > 0)) return Infinity;
  const omega0 = (2 * Math.PI) / PRIMORDIAL_SPIN_PERIOD_S;
  const tSec =
    (0.4 * omega0 * Math.pow(a, 6) * massKg * Q) /
    (3 * G * hostMassKg * hostMassKg * K2 * Math.pow(R, 3));
  return tSec / GYR_S;
}

// True when the body has had time to despin to synchronous rotation over the system's age.
export function predictTidalLock(
  aAU: number, radiusKm: number, massKg: number, hostMassKg: number, ageGyr: number
): boolean {
  return tidalLockTimescaleGyr(aAU, radiusKm, massKg, hostMassKg) < Math.max(ageGyr, 0);
}
