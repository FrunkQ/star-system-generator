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

// --- What "locked" actually means for the SPIN (inbox B7) ---------------------------------------
// A locked body's sidereal rotation period IS its orbital period. That is the definition, and the
// surface-temperature model has always used it — but the stored rotation period was never
// reconciled, so a body could be shown as tidally locked beside a day length that contradicted it.
//
// Despinning does NOT always end at 1:1, though, and Mercury is the case that proves it: an
// eccentric orbit makes capture into a higher-order SPIN-ORBIT RESONANCE likely (Goldreich & Peale
// 1966), and Mercury sits in a 3:2 — 1407.6 h of spin against a 2110.9 h year, e = 0.206. Its day
// is measured and it is not synchronous. So a spin that lands on a half-integer ratio of the orbit,
// on an orbit eccentric enough to hold it there, is a resonance and keeps its period; anything else
// is a number that disagrees with the lock the same body's own orbit implies, and the lock wins.
//
// The thresholds sit here in code beside Q / K2 / PRIMORDIAL_SPIN_PERIOD_S rather than in the rule
// pack, because they are part of this model's shape and calibrated with it, exactly as those are.
const RESONANCE_MIN_E = 0.1;    // below this, tides circularise the spin all the way to 1:1
const RESONANCE_TOL = 0.02;     // 2% — how close to p:q the authored spin has to sit
const RESONANCE_MAX_ORDER = 8;  // 2·ratio, so up to 4:1; past that it is a day someone picked

export interface LockedSpin {
  // 'synchronous' — the spin should BE the orbital period (rotationHours says what it is).
  // 'resonant'    — a captured spin-orbit resonance; the authored period stands, `ratio` names it.
  kind: 'synchronous' | 'resonant';
  rotationHours: number;
  ratio?: string;
}

// Resolve a locked body's spin. `orbitalPeriodHours` must be > 0; `authoredRotationHours` may be
// absent (nothing has set one) — in which case the answer is simply synchronous.
export function lockedSpin(
  orbitalPeriodHours: number,
  authoredRotationHours: number | undefined,
  eccentricity: number
): LockedSpin {
  const orb = Math.abs(orbitalPeriodHours);
  const authored = Math.abs(authoredRotationHours ?? 0);
  // Sign follows the authored spin where there is one (a retrograde spin stays retrograde), so
  // reconciling a period never silently flips a body's direction of rotation.
  const sign = (authoredRotationHours ?? 0) < 0 ? -1 : 1;
  const sync: LockedSpin = { kind: 'synchronous', rotationHours: sign * orb };
  if (!(orb > 0) || !(authored > 0)) return sync;

  const ratio = orb / authored;                      // orbits per rotation, e.g. Mercury 1.5
  if (Math.abs(ratio - 1) <= RESONANCE_TOL) return sync; // already synchronous; nothing to reconcile
  if (eccentricity < RESONANCE_MIN_E) return sync;   // too circular to hold a higher-order resonance
  if (ratio < 1.5 - RESONANCE_TOL) return sync;      // sub-synchronous is not a tidal end state
  const doubled = ratio * 2;                         // p:2 and p:1 both land on an integer here
  const n = Math.round(doubled);
  if (n > RESONANCE_MAX_ORDER || Math.abs(doubled - n) > RESONANCE_TOL * 2) return sync;
  return {
    kind: 'resonant',
    rotationHours: authoredRotationHours as number,
    ratio: n % 2 === 0 ? `${n / 2}:1` : `${n}:2`
  };
}
