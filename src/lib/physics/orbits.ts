// ======== FILE: orbits.ts ========
import { G, AU_KM } from '../constants';
import { getNodeColor } from '../rendering/colors';
import { hasSolidSurface } from './makeup';
import type { CelestialBody } from '../types';
import { satelliteTiltRad, toParentEquator } from '../system/satelliteFrame';

const TWO_PI = 2 * Math.PI;

function normalizeAngle(angle: number): number {
  const normalized = angle % TWO_PI;
  return normalized < 0 ? normalized + TWO_PI : normalized;
}

// --- 1. DEFINE UNIVERSAL CONSTANTS ---
const UNIVERSAL_GAS_CONSTANT = 8.314;       // J/(mol·K)

/**
 * Returns the body/barycenter whose sphere of influence (Hill sphere / SOI)
 * contains the given point — i.e. "whose Hill sphere am I in?". This is the
 * physically-correct answer for placement and selection (which host a click
 * belongs to). For force-direction queries ("which body's gravity dominates
 * here?") use `findGravitationalDominant` in gravity.ts instead.
 */
export function findContainingHost(
  x: number,
  y: number,
  nodes: (CelestialBody | Barycenter)[],
  worldPositions: Map<string, { x: number, y: number }>
): CelestialBody | Barycenter | null {
    let bestHost: CelestialBody | Barycenter | null = null;
    let bestSoiRadiusAU = Infinity;

    for (const node of nodes) {
        if (node.kind !== 'body' && node.kind !== 'barycenter') continue;
        const pos = worldPositions.get(node.id);
        if (!pos) continue;
        
        const dx = x - pos.x;
        const dy = y - pos.y;
        const distAU = Math.sqrt(dx*dx + dy*dy);
        
        // Calculate Hill Sphere (SOI) in AU
        // r_Hill = a * (m / 3M)^(1/3)
        // If node is star (parentId null), SOI is effectively infinite
        let soiAU = Infinity;
        
        if (node.parentId) {
             const parent = nodes.find(n => n.id === node.parentId);
             if (parent) {
                 const parentPos = worldPositions.get(parent.id);
                 const dParent = parentPos ? Math.sqrt(Math.pow(pos.x - parentPos.x, 2) + Math.pow(pos.y - parentPos.y, 2)) : 0;
                 
                 const mass = (node as CelestialBody).massKg || (node as Barycenter).effectiveMassKg || 0;
                 const parentMass = (parent as CelestialBody).massKg || (parent as Barycenter).effectiveMassKg || 1;
                 
                 if (parentMass > 0) {
                     soiAU = dParent * Math.pow(mass / (3 * parentMass), 1/3);
                 }
             }
        } else {
            // For root nodes (Stars), treat them as the default container.
            // Set to a very large number so it's only picked if no smaller SOI is found.
            soiAU = 1e9; 
        }
        
        if (distAU <= soiAU) {
            if (soiAU < bestSoiRadiusAU) {
                bestSoiRadiusAU = soiAU;
                bestHost = node;
            }
        }
    }
    
    return bestHost;
}

// --- Interfaces ---
export interface PlanetData {
  gravity: number;
  surfaceTempKelvin: number;
  molarMassKg: number;
  surfacePressurePa: number;
  massKg: number;
  rotationPeriodSeconds: number;
  distanceToHost_km: number;
  hostMass_kg: number;
  // Added radius to data structure as it is needed for altitude calc
  radiusKm?: number; 
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface StateVector {
  r: Vector2; // Position in AU
  v: Vector2; // Velocity in AU/s
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface StateVector3 {
  r: Vector3; // Position in AU (orbital reference plane = z 0)
  v: Vector3; // Velocity in AU/s
}

// One warning per session is enough — corrupt elements get hit every frame by the render loop.
let warnedHyperbolic = false;

interface PerifocalState {
  x_p_m: number;      // perifocal position (metres)
  y_p_m: number;
  vx_p_mps: number;   // perifocal velocity (m/s)
  vy_p_mps: number;
  omega_rad: number;  // argument of periapsis
  i_rad: number;      // inclination
  Omega_rad: number;  // longitude of ascending node
}

/**
 * THE MEAN MOTION OF A STORED ORBIT, and the only place that decides it. A stored `n_rad_per_s`
 * already CARRIES ITS SIGN (a binary member's is copied from the pair's relative orbit, an l1/l2
 * point's comes from a deliberately scaled hostMu - LGR-1), so the retrograde flag applies only when
 * there is no stored value to respect. `aMeters` lets a caller pass a semi-major axis it has already
 * sanitised; without one it is read from the elements.
 */
export function orbitMeanMotion(
  orbit: { n_rad_per_s?: number; hostMu?: number; isRetrogradeOrbit?: boolean; elements?: { a_AU?: number } },
  aMeters?: number
): number {
  if (orbit.n_rad_per_s !== undefined) return orbit.n_rad_per_s;
  const a_m = aMeters ?? (orbit.elements?.a_AU ?? 0) * AU_KM * 1000;
  const mu = orbit.hostMu ?? 0;
  if (!(a_m > 0) || !(mu > 0)) return 0;
  const n = Math.sqrt(mu / (a_m * a_m * a_m));
  return orbit.isRetrogradeOrbit ? -n : n;
}

/**
 * THE EPOCH AND THE PHASE ARE ONE FACT, NOT TWO - `M(t) = M0 + n*(t - t0)` - so moving `t0` without
 * moving `M0` TELEPORTS the body by `n * dt`, silently, because every element still reads correctly
 * afterwards. Returns the `M0_rad` that leaves the body exactly where it is once its epoch becomes
 * `t0New`. Anything that re-stamps an epoch on an EXISTING orbit must go through this; the one place
 * that may set both freely is a pair's single owner, which is choosing the phase rather than keeping
 * it (`SystemProcessor.processBarycenters`). B111.
 */
export function rephasedM0(
  orbit: { t0?: number; n_rad_per_s?: number; hostMu?: number; isRetrogradeOrbit?: boolean; elements?: { a_AU?: number; M0_rad?: number } },
  t0New: number
): number {
  const m0 = orbit.elements?.M0_rad ?? 0;
  const t0Old = orbit.t0 ?? 0;
  if (!Number.isFinite(t0New) || !Number.isFinite(t0Old) || t0New === t0Old) return normalizeAngle(m0);
  return normalizeAngle(m0 + orbitMeanMotion(orbit) * ((t0New - t0Old) / 1000));
}

/**
 * Shared elliptical Kepler solve. Returns the perifocal-frame position (m) and velocity (m/s)
 * plus the three orientation angles (ω, i, Ω). Both propagateState (the flat, ω-only projection
 * the 2D orrery uses) and propagateState3D (the full Rz(Ω)·Rx(i)·Rz(ω) rotation the holo view
 * uses) build on this, so the 2D and 3D views can never drift in their orbital maths. Returns
 * null for the trivial root / no-orbit cases (callers emit a zero vector).
 */
function solvePerifocal(node: CelestialBody | Barycenter | { orbit: any }, tMs: number): PerifocalState | null {
  if (!('orbit' in node) || !node.orbit) return null;

  const { elements, hostMu, t0 } = node.orbit;
  const { M0_rad } = elements;

  // GUARD: this solver is ELLIPTICAL-ONLY — sqrt(1-e), n = sqrt(mu/a^3) and the [0,2pi) mean-anomaly
  // normalisation all silently NaN (or worse, produce finite garbage) for e >= 1 or a <= 0. Stored orbits
  // are always bound (editor clamps + sanitizer self-heal), so unbound elements here are corrupt input:
  // clamp to a near-parabolic bound orbit instead of NaNing the whole position chain. Genuinely unbound
  // COAST states are handled by keplerUniversal (twoBodyCoast), never by element propagation.
  let { a_AU, e } = elements;
  if (!(e >= 0)) e = 0;
  if (e >= 1 || !(a_AU > 0)) {
    if (import.meta.env?.DEV && !warnedHyperbolic) {
      warnedHyperbolic = true;
      console.warn(`[orbits] propagateState got unbound/corrupt elements (a=${a_AU} AU, e=${e}) on '${(node as any).id ?? '?'}' — clamped to a bound orbit. Elliptical solver only; unbound motion belongs to keplerUniversal.`);
    }
    e = Math.min(e, 0.999);
    a_AU = Math.abs(a_AU) || 1e-6;
  }

  // Handle trivial case (Star/Root)
  if (hostMu === 0 || !a_AU) return null;

  const a_m = a_AU * AU_KM * 1000; // semi-major axis in meters

  // 1. Mean motion (n) - one authority, shared with anything that must re-express a phase.
  const n = orbitMeanMotion(node.orbit, a_m);

  // 2. Mean anomaly (M) at time t
  // tMs is current time in ms, t0 is epoch in ms
  const dt_sec = (tMs - t0) / 1000;
  const M = normalizeAngle(M0_rad + n * dt_sec);

  // 3. Solve Kepler's Equation for Eccentric Anomaly (E)
  let E: number;
  if (e < 1e-6) {
    E = M;
  } else {
    E = e > 0.8 ? Math.PI : M;
    let converged = false;

    for (let i = 0; i < 30; i++) {
      const fE = E - e * Math.sin(E) - M;
      const fPrime = 1 - e * Math.cos(E);
      if (Math.abs(fPrime) < 1e-12) break;
      const dE = fE / fPrime;
      E -= dE;
      if (Math.abs(dE) < 1e-12) {
        converged = true;
        break;
      }
    }

    // Fallback for extreme eccentricities near periapsis.
    if (!converged) {
      let lo = 0;
      let hi = TWO_PI;
      for (let i = 0; i < 50; i++) {
        const mid = 0.5 * (lo + hi);
        const fMid = mid - e * Math.sin(mid) - M;
        if (fMid > 0) hi = mid;
        else lo = mid;
      }
      E = 0.5 * (lo + hi);
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

  const vx_p_mps = -mu_h * Math.sin(f);
  const vy_p_mps = mu_h * (e + Math.cos(f));

  return {
    x_p_m, y_p_m, vx_p_mps, vy_p_mps,
    omega_rad: (elements.omega_deg || 0) * (Math.PI / 180),
    i_rad: (elements.i_deg || 0) * (Math.PI / 180),
    Omega_rad: (elements.Omega_deg || 0) * (Math.PI / 180)
  };
}

/**
 * Propagates an orbit to a specific time and returns the full State Vector (Position and Velocity).
 * Position is in AU, velocity in AU/s. This is the FLAT projection: it applies only the argument of
 * periapsis (ω), which is exactly what the 2D orrery draws. For the inclination-aware 3D vector the
 * holo view needs, use propagateState3D.
 */
export function propagateState(node: CelestialBody | Barycenter | { orbit: any }, tMs: number): StateVector {
  const pf = solvePerifocal(node, tMs);
  if (!pf) return { r: { x: 0, y: 0 }, v: { x: 0, y: 0 } };

  const { x_p_m, y_p_m, vx_p_mps, vy_p_mps, omega_rad } = pf;

  // Rotate to System Frame (Arg of Periapsis only — the flat 2D projection).
  const cos_o = Math.cos(omega_rad);
  const sin_o = Math.sin(omega_rad);
  const M = AU_KM * 1000;

  return {
    r: {
      x: (x_p_m * cos_o - y_p_m * sin_o) / M,
      y: (x_p_m * sin_o + y_p_m * cos_o) / M
    },
    v: {
      x: (vx_p_mps * cos_o - vy_p_mps * sin_o) / M,
      y: (vx_p_mps * sin_o + vy_p_mps * cos_o) / M
    } // Convert m/s to AU/s
  };
}

/**
 * Inclination-aware sibling of propagateState: applies the full 3-1-3 rotation Rz(Ω)·Rx(i)·Rz(ω)
 * to the perifocal state, so orbits tilt out of the reference plane (z=0). Used by the holo (3D)
 * view. For a flat orbit (i=0, Ω=0) the x/y are identical to propagateState and z is 0, so the
 * holo view lines up with the orrery wherever the data is coplanar.
 */
export function propagateState3D(node: CelestialBody | Barycenter | { orbit: any }, tMs: number): StateVector3 {
  const pf = solvePerifocal(node, tMs);
  if (!pf) return { r: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 } };

  const { x_p_m, y_p_m, vx_p_mps, vy_p_mps, omega_rad, i_rad, Omega_rad } = pf;
  const co = Math.cos(omega_rad), so = Math.sin(omega_rad);
  const ci = Math.cos(i_rad), si = Math.sin(i_rad);
  const cO = Math.cos(Omega_rad), sO = Math.sin(Omega_rad);

  // Perifocal (PQW) → inertial rotation matrix rows, applied to the in-plane (x_p, y_p, 0) vector.
  const r11 = cO * co - sO * so * ci, r12 = -cO * so - sO * co * ci;
  const r21 = sO * co + cO * so * ci, r22 = -sO * so + cO * co * ci;
  const r31 = so * si, r32 = co * si;
  const M = AU_KM * 1000;

  return {
    r: {
      x: (r11 * x_p_m + r12 * y_p_m) / M,
      y: (r21 * x_p_m + r22 * y_p_m) / M,
      z: (r31 * x_p_m + r32 * y_p_m) / M
    },
    v: {
      x: (r11 * vx_p_mps + r12 * vy_p_mps) / M,
      y: (r21 * vx_p_mps + r22 * vy_p_mps) / M,
      z: (r31 * vx_p_mps + r32 * vy_p_mps) / M
    } // Convert m/s to AU/s
  };
}

/**
 * Converts State Vector (Position r, Velocity v) to Keplerian Orbital Elements.
 * Used for recovering orbital parameters from kinematic/deep-space states.
 * r in AU, v in AU/s. hostMu in m^3/s^2.
 */
export function rv2coe(r_au: Vector2, v_au_s: Vector2, hostMu: number): any {
    const AU_M = AU_KM * 1000;
    const r_vec = { x: r_au.x * AU_M, y: r_au.y * AU_M, z: 0 };
    const v_vec = { x: v_au_s.x * AU_M, y: v_au_s.y * AU_M, z: 0 };
    
    const r = Math.sqrt(r_vec.x**2 + r_vec.y**2);
    const v = Math.sqrt(v_vec.x**2 + v_vec.y**2);
    
    // Angular Momentum h = r x v
    const h_vec = {
        x: 0, 
        y: 0, 
        z: r_vec.x * v_vec.y - r_vec.y * v_vec.x
    };
    const h = Math.abs(h_vec.z);
    
    // Eccentricity Vector e = ( (v^2 - mu/r)*r - (r.v)*v ) / mu
    const r_dot_v = r_vec.x * v_vec.x + r_vec.y * v_vec.y;
    const term1 = (v**2 - hostMu / r);
    
    const e_vec = {
        x: (term1 * r_vec.x - r_dot_v * v_vec.x) / hostMu,
        y: (term1 * r_vec.y - r_dot_v * v_vec.y) / hostMu,
        z: 0
    };
    
    const e = Math.sqrt(e_vec.x**2 + e_vec.y**2);
    
    // Semi-major Axis a
    // Mechanical Energy E = v^2/2 - mu/r = -mu / 2a
    const energy = (v**2) / 2 - hostMu / r;
    
    let a = -hostMu / (2 * energy);
    
    // Inclination (2D assumed 0)
    const i = 0;
    
    // Longitude of Ascending Node (2D assumed 0)
    const Omega = 0;
    
    // Argument of Periapsis (omega)
    // Angle of e_vec
    let omega = Math.atan2(e_vec.y, e_vec.x);
    if (omega < 0) omega += 2 * Math.PI;
    
    // True Anomaly f
    // Angle between e_vec and r_vec
    // cos(f) = (e . r) / (e * r)
    // BUT we need signed angle.
    // In 2D, true longitude = omega + f = atan2(r.y, r.x)
    const theta = Math.atan2(r_vec.y, r_vec.x);
    let f = theta - omega;
    if (f < 0) f += 2 * Math.PI;
    
    // Convert to Mean Anomaly M
    let M = 0;
    if (e < 1.0) {
        // Elliptical
        const E_anom = 2 * Math.atan(Math.sqrt((1 - e)/(1 + e)) * Math.tan(f/2));
        M = E_anom - e * Math.sin(E_anom);
    } else {
        // Hyperbolic
        const F = 2 * Math.atanh(Math.sqrt((e - 1)/(e + 1)) * Math.tan(f/2));
        M = e * Math.sinh(F) - F;
    }
    
    // Normalize M
    if (M < 0) M += 2 * Math.PI;
    M = M % (2 * Math.PI);

    return {
        a_AU: a / AU_M,
        e: e,
        i_deg: 0,
        Omega_deg: 0,
        omega_deg: omega * (180 / Math.PI),
        M0_rad: M // This is M at the current time t.
        // We usually store M0 (at epoch t0). If we set t0 = current time, then M0 = M.
    };
}

export interface OrbitalBoundaries {
  minLeoKm: number;
  leoMoeBoundaryKm: number;
  meoHeoBoundaryKm: number;
  heoUpperBoundaryKm: number;
  geoStationaryKm: number | null;
  isGeoFallback: boolean;
}

// --- Main Function ---
export function calculateOrbitalBoundaries(planet: PlanetData, pack: RulePack): OrbitalBoundaries {
  const constants = pack.orbitalConstants || {};
  
  // Extract constants from rulepack or use defaults
  const DEFAULT_NO_ATMOSPHERE_LEO_KM = constants.DEFAULT_NO_ATMOSPHERE_LEO_KM || 30.0;
  const DEFAULT_LEO_MEO_BOUNDARY_KM = constants.DEFAULT_LEO_MEO_BOUNDARY_KM || 2000.0;
  const DEFAULT_MEO_HEO_BOUNDARY_KM = constants.DEFAULT_MEO_HEO_BOUNDARY_KM || 50000.0;
  
  // Simulation Thresholds (Can now be overridden by RulePack)
  const TARGET_ORBITAL_PRESSURE_PA = constants.TARGET_ORBITAL_PRESSURE_PA || 0.0001;
  const NEGLIGIBLE_ATMOSPHERE_PA = constants.NEGLIGIBLE_ATMOSPHERE_PA || 1.0;
  const MICRO_SYSTEM_THRESHOLD_KM = constants.MICRO_SYSTEM_THRESHOLD_KM || 1000;

  // 0. PHYSICAL PROPERTIES
  // Use provided radius or derive it
  let planetRadiusKm = planet.radiusKm;
  if (!planetRadiusKm) {
     const r_meters = Math.sqrt((G * planet.massKg) / planet.gravity);
     planetRadiusKm = r_meters / 1000;
  }

  // --- 1. CALCULATE CEILING (SPHERE OF INFLUENCE) ---
  // We calculate this FIRST to know how much room we have.
  let soiRadiusKm: number;
  if (planet.hostMass_kg > 0) {
    // Hill Sphere: r = a * cbrt(m/3M)
    const massRatio = planet.massKg / (3.0 * planet.hostMass_kg);
    soiRadiusKm = planet.distanceToHost_km * Math.cbrt(massRatio);
  } else {
    soiRadiusKm = planet.distanceToHost_km * 0.01; // Rogue planet fallback
  }
  
  // Convert from "Distance from Center" to "Altitude above Surface"
  // Ensure we don't get negative numbers if SOI < Radius (physically impossible but safe to clamp)
  const heoUpperBoundaryKm = Math.max(0.1, soiRadiusKm - planetRadiusKm);

  // --- 2. CALCULATE FLOOR (MIN LEO) ---
  let minLeoKm: number;

  if (planet.surfacePressurePa < NEGLIGIBLE_ATMOSPHERE_PA) {
    // No Atmosphere
    // If the body is tiny (Phobos), 30km might be outside the SOI! 
    // So we take the smaller of: Default (30km) OR 20% of the available space.
    minLeoKm = Math.min(DEFAULT_NO_ATMOSPHERE_LEO_KM, heoUpperBoundaryKm * 0.2);
  } else {
    // Atmosphere present
    const scaleHeight_H = (UNIVERSAL_GAS_CONSTANT * planet.surfaceTempKelvin) / 
                          (planet.molarMassKg * planet.gravity);
    const pressureRatio = planet.surfacePressurePa / TARGET_ORBITAL_PRESSURE_PA;
    const altitudeMeters = (pressureRatio > 1) ? (scaleHeight_H * Math.log(pressureRatio)) : 0;
    minLeoKm = altitudeMeters / 1000;
  }

  // Safety Clamp: Floor cannot exceed Ceiling
  if (minLeoKm >= heoUpperBoundaryKm) {
      minLeoKm = heoUpperBoundaryKm * 0.9; // Force a 10% buffer if math fails
  }

  // --- 3. HANDLE MICRO-SYSTEMS (THE FIX) ---
  // If the entire SOI is smaller than 1000km, standard zones don't apply.
  // We collapse everything into one "Low Orbit" zone.
  
  if (heoUpperBoundaryKm < MICRO_SYSTEM_THRESHOLD_KM) {
      return {
          minLeoKm: minLeoKm,
          leoMoeBoundaryKm: heoUpperBoundaryKm, // LEO extends to the very edge
          meoHeoBoundaryKm: heoUpperBoundaryKm, // MEO has 0 width
          heoUpperBoundaryKm: heoUpperBoundaryKm, // HEO has 0 width
          geoStationaryKm: null,
          isGeoFallback: true
      };
  }

  // --- 4. STANDARD ZONES (Earth/Mars/Venus) ---
  
  // Calculate LEO/MEO Boundary
  let leoMoeBoundaryKm = (minLeoKm >= DEFAULT_LEO_MEO_BOUNDARY_KM) 
      ? minLeoKm + DEFAULT_LEO_MEO_BOUNDARY_KM 
      : DEFAULT_LEO_MEO_BOUNDARY_KM;

  // Clamp LEO/MEO to SOI
  leoMoeBoundaryKm = Math.min(leoMoeBoundaryKm, heoUpperBoundaryKm);

  // Calculate GEO
  let calculatedGeoKm: number | null = null;
  const T = Math.abs(planet.rotationPeriodSeconds);
  if (T > 0) {
    const numerator = G * planet.massKg * (T * T);
    const denominator = 4 * (Math.PI * Math.PI);
    const radiusFromCenterMeters = Math.cbrt(numerator / denominator);
    calculatedGeoKm = (radiusFromCenterMeters / 1000) - planetRadiusKm;
  }

  // Determine Final Boundaries
  let finalGeoStationaryKm: number | null = calculatedGeoKm;
  let meoHeoBoundaryKm: number;
  let isGeoFallback = false;

  // Validate GEO
  if (calculatedGeoKm === null || 
      calculatedGeoKm < minLeoKm || 
      calculatedGeoKm > heoUpperBoundaryKm) 
  {
    finalGeoStationaryKm = null;
    isGeoFallback = true;
    meoHeoBoundaryKm = DEFAULT_MEO_HEO_BOUNDARY_KM;
  } else {
    meoHeoBoundaryKm = calculatedGeoKm;
  }

  // Final Safety Clamping to ensure strictly increasing order
  // Min <= LEO_Ceiling <= MEO_Ceiling <= HEO_Ceiling
  leoMoeBoundaryKm = Math.max(minLeoKm, Math.min(leoMoeBoundaryKm, heoUpperBoundaryKm));
  meoHeoBoundaryKm = Math.max(leoMoeBoundaryKm, Math.min(meoHeoBoundaryKm, heoUpperBoundaryKm));

  return {
    minLeoKm,
    leoMoeBoundaryKm,
    meoHeoBoundaryKm,
    heoUpperBoundaryKm,
    geoStationaryKm: finalGeoStationaryKm,
    isGeoFallback
  };
}

// ... existing code ...

// ... existing code ...

/**
 * THE RADIUS OF A NAMED PARKING ORBIT, AND THE ONLY PLACE THAT DECIDES IT.
 *
 * `lo` / `mo` / `ho` / `geo` are DERIVED from the body — its atmosphere sets where drag stops, its
 * rotation sets geostationary, its mass and its host set how far its grip reaches. They are not
 * multiples of its radius.
 *
 * They used to be both. `transit/scheduler.ts` carried its own table of radius multipliers, twice over
 * (a `Record` and, ten lines from the sampler that needed it, the same four numbers as a ternary
 * chain), while the planner panel offered the derived figures from here. So the solver aimed at one
 * orbit and the ship parked in another. MEASURED across the Sol Expanse bodies, derived against
 * multiplier: Earth low orbit 6,536 km against 8,282, Jupiter low 70,076 against 90,884, and Jupiter
 * HIGH orbit 26,668,664 km against 279,644 — a factor of ninety-five. Luna, which is too small to have
 * a high orbit at all, was being offered one at four times its own radius.
 *
 * Returns null for a placement that is not an orbit (a surface landing, an L-point, a dock).
 */
/**
 * ELEMENTS FOR THE CIRCULAR ORBIT THAT PASSES THROUGH A GIVEN STATE, in the convention
 * `solvePerifocal` above reads: M = M0 + n(t - t0), oriented Rz(Omega)Rx(i)Rz(omega).
 *
 * WHY THIS EXISTS. A ship that has arrived somewhere is described TWICE - by the sampler, which
 * builds a parking circle on axes taken from the arrival itself so the flight and the orbit close
 * exactly ([[B92]]), and by the elements stored on the node, which is all a player has. Storing a
 * radius without a PHASE means the two disagree about where on that circle the ship is: right orbit,
 * wrong point, up to a diameter apart. Feed this the state the sampler reports AT THE ARRIVAL INSTANT
 * and the stored orbit reproduces the sampler at every later moment too.
 *
 * Circular by construction (e = 0), so the argument of periapsis is degenerate: omega is pinned to 0
 * and the whole angle rides in M0, which for e = 0 is also the true anomaly and the argument of
 * latitude. Inputs are RELATIVE to the host, in any consistent units - only directions are used.
 * Returns null for a degenerate state (no radius to point along).
 */
/**
 * THE ORBIT AS THE 3D WALK ACTUALLY WALKS IT, projected flat - parent-relative offsets in AU, one
 * full revolution, ready to be translated to the parent and stroked.
 *
 * WHY THE PLAN VIEW NEEDS THIS AND ONLY FOR SOME NODES. The 2D orrery draws an orbit as an ellipse
 * from `a`, `e` and OMEGA ALONE - the plan-view convention, and correct for anything the flat
 * propagator also places. But a construct with journeys is NOT placed by that propagator: the orrery
 * injects `sampleJourneyKinematicsAtTime`, which parks a ship on the plane it actually ARRIVED on and
 * is inclination-aware. So the ship was drawn on an inclined circle while its line was drawn as a
 * flat one, and the two only touch at two points. One of them has to give, and it cannot be the ship.
 *
 * Same rotation and the same satellite framing `computeWorldPositions3D` applies, so the line passes
 * through the ship by construction rather than by agreement between two derivations.
 */
export function orbitPathProjected(
  node: CelestialBody | Barycenter | { orbit: any },
  parent: any,
  samples = 128
): { x: number; y: number }[] {
  const orbit = (node as any)?.orbit;
  if (!orbit?.elements) return [];
  const a_AU = orbit.elements.a_AU;
  if (!(a_AU > 0)) return [];

  const aM = a_AU * AU_KM * 1000;
  const n = orbit.n_rad_per_s ?? (orbit.hostMu > 0 ? Math.sqrt(orbit.hostMu / (aM * aM * aM)) : 0);
  if (!(Math.abs(n) > 0)) return [];
  const periodMs = (2 * Math.PI) / Math.abs(n) * 1000;
  const t0 = orbit.t0 ?? 0;

  const tilt = satelliteTiltRad(node, parent);
  const out: { x: number; y: number }[] = [];
  const scratch = { x: 0, y: 0, z: 0 };
  for (let i = 0; i <= samples; i++) {
    const r = propagateState3D(node, t0 + (periodMs * i) / samples).r;
    const f = tilt ? toParentEquator(r.x, r.y, r.z, tilt, scratch) : r;
    out.push({ x: f.x, y: f.y });
  }
  return out;
}

export function circularElementsAtState(
  rRel: { x: number; y: number; z?: number },
  vRel: { x: number; y: number; z?: number }
): { i_deg: number; Omega_deg: number; omega_deg: number; M0_rad: number } | null {
  const norm = (v: { x: number; y: number; z: number }) => {
    const m = Math.hypot(v.x, v.y, v.z);
    return m > 1e-18 ? { x: v.x / m, y: v.y / m, z: v.z / m } : null;
  };
  const u = norm({ x: rRel.x, y: rRel.y, z: rRel.z ?? 0 });
  if (!u) return null;

  // The in-plane direction of travel: velocity with its radial part removed. A purely radial state
  // leaves nothing to follow, so take the in-plane perpendicular - the same fallback the sampler uses.
  const v = { x: vRel.x, y: vRel.y, z: vRel.z ?? 0 };
  const radial = v.x * u.x + v.y * u.y + v.z * u.z;
  const w = norm({ x: v.x - u.x * radial, y: v.y - u.y * radial, z: v.z - u.z * radial })
    ?? norm({ x: -u.y, y: u.x, z: 0 })
    ?? { x: 0, y: 0, z: 1 };

  const h = norm({ x: u.y * w.z - u.z * w.y, y: u.z * w.x - u.x * w.z, z: u.x * w.y - u.y * w.x });
  if (!h) return null;

  const i = Math.acos(Math.max(-1, Math.min(1, h.z)));
  // Ascending node, z x h. An equatorial orbit has none, and Omega is then arbitrary: take +x, which
  // is what the 3-1-3 rotation reduces to anyway once i = 0.
  const node = norm({ x: -h.y, y: h.x, z: 0 }) ?? { x: 1, y: 0, z: 0 };
  const q = {
    x: h.y * node.z - h.z * node.y,
    y: h.z * node.x - h.x * node.z,
    z: h.x * node.y - h.y * node.x
  };
  const M0 = Math.atan2(
    u.x * q.x + u.y * q.y + u.z * q.z,
    u.x * node.x + u.y * node.y + u.z * node.z
  );
  return {
    i_deg: (i * 180) / Math.PI,
    Omega_deg: (Math.atan2(node.y, node.x) * 180) / Math.PI,
    omega_deg: 0,
    M0_rad: M0
  };
}

export function parkingOrbitRadiusKm(
  body: CelestialBody,
  placement: string | undefined,
  rulePack?: RulePack,
  system?: System
): number | null {
  if (!placement) return null;
  if (placement !== 'lo' && placement !== 'mo' && placement !== 'ho' && placement !== 'geo') return null;
  const opt = getOrbitOptions(body, rulePack ?? ({} as RulePack), system).find((o) => o.id === placement);
  return opt && opt.radiusKm > 0 ? opt.radiusKm : null;
}

export function getOrbitOptions(body: CelestialBody, rulePack: RulePack, system?: System): { id: string, name: string, radiusKm: number, color: string, isLagrange?: boolean }[] {
    // Only for planets/moons/stars? 
    // Belts and Rings should NOT have simulated Lagrange points as they are distributed masses.
    const isDistributed = body.roleHint === 'belt' || body.roleHint === 'ring';
    
    // Determine physical properties
    const massKg = body.massKg || 0;
    const radiusKm = body.radiusKm || 1000;
    
    // Mock PlanetData for calculation
    const pData: PlanetData = {
        gravity: 9.81, 
        surfaceTempKelvin: body.surfaceTempKelvin || 273,
        molarMassKg: 0.029,
        surfacePressurePa: (body.atmosphere?.pressure_bar || 0) * 100000,
        massKg: massKg,
        rotationPeriodSeconds: (body.physical_parameters?.rotation_period_hours || 24) * 3600,
        distanceToHost_km: body.orbit?.elements.a_AU ? body.orbit.elements.a_AU * AU_KM : 1.5e8,
        hostMass_kg: 2e30, 
        radiusKm: radiusKm
    };
    
    const boundaries = calculateOrbitalBoundaries(pData, rulePack);
    
    const options: { id: string, name: string, radiusKm: number, sortOrder: number, color: string, isLagrange?: boolean }[] = [];
    
    // Standard Zones
    options.push({ id: 'lo', name: 'Low Orbit', radiusKm: radiusKm + boundaries.minLeoKm, sortOrder: 10, color: '#ffffff' });
    
    if (boundaries.geoStationaryKm) {
        options.push({ id: 'geo', name: 'Geostationary', radiusKm: radiusKm + boundaries.geoStationaryKm, sortOrder: 30, color: '#ffffff' });
    }
    
    const moAlt = (boundaries.leoMoeBoundaryKm + boundaries.meoHeoBoundaryKm) / 2;
    options.push({ id: 'mo', name: 'Medium Orbit', radiusKm: radiusKm + moAlt, sortOrder: 20, color: '#ffffff' });
    
    const hoAlt = (boundaries.meoHeoBoundaryKm + boundaries.heoUpperBoundaryKm) / 2;
    options.push({ id: 'ho', name: 'High Orbit', radiusKm: radiusKm + hoAlt, sortOrder: 40, color: '#ffffff' });

    // Lagrange Points - Forced to end (Sort Order 90+)
    // ONLY for point-mass bodies, not belts/rings
    if (!isDistributed) {
        const soiRadiusKm = boundaries.heoUpperBoundaryKm;
        
        options.push({ id: 'l1', name: 'L1 (Collinear Inner)', radiusKm: radiusKm + (boundaries.minLeoKm + soiRadiusKm * 0.8), sortOrder: 90, color: '#ffffff', isLagrange: true });
        options.push({ id: 'l2', name: 'L2 (Collinear Outer)', radiusKm: radiusKm + (soiRadiusKm * 1.2), sortOrder: 91, color: '#ffffff', isLagrange: true });
        options.push({ id: 'l3', name: 'L3 (Hidden Co-orbital)', radiusKm: pData.distanceToHost_km, sortOrder: 92, color: '#ffffff', isLagrange: true });
        options.push({ id: 'l4', name: 'L4 (Leading Trojan)', radiusKm: pData.distanceToHost_km, sortOrder: 93, color: '#ffffff', isLagrange: true }); 
        options.push({ id: 'l5', name: 'L5 (Trailing Trojan)', radiusKm: pData.distanceToHost_km, sortOrder: 94, color: '#ffffff', isLagrange: true });
    }
    
    // Children (Moons / Stations)
    if (system) {
        const findChildrenRecursive = (parentId: string, parentOffsetKm: number) => {
            const children = system.nodes.filter(n => n.parentId === parentId);
            for (const child of children) {
                // Skip Surface constructs
                if (child.placement === 'Surface') continue;

                if (child.orbit) {
                    const localDistKm = child.orbit.elements.a_AU * AU_KM;
                    const totalDistKm = parentOffsetKm + localDistKm;
                    
                    let name = child.name;
                    if (child.kind === 'construct') name += ' (Station)';
                    else if (child.roleHint === 'moon') name += ' (Moon)';
                    
                    // Add indentation for grandchildren
                    if (parentOffsetKm > 0) name = `  ↳ ${name}`;

                    options.push({
                        id: child.id,
                        name: name,
                        radiusKm: totalDistKm,
                        sortOrder: 50,
                        color: getNodeColor(child)
                    });
                    
                    // Recurse (e.g. Station orbiting Moon)
                    findChildrenRecursive(child.id, totalDistKm);
                }
            }
        };
        findChildrenRecursive(body.id, 0);
    }
    
    // Sort: Lagrange points last, then by actual orbital radius
    return options.sort((a, b) => {
        if (a.isLagrange && !b.isLagrange) return 1; // a is L-point, b is not -> a comes after b
        if (!a.isLagrange && b.isLagrange) return -1; // b is L-point, a is not -> a comes before b
        
        // If both are L-points or neither are, sort by sortOrder then radius
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.radiusKm - b.radiusKm;
    }).map(o => ({ id: o.id, name: o.name, radiusKm: o.radiusKm, color: o.color }));
}

/**
 * WHETHER A SURFACE FLIGHT BUDGET MEANS ANYTHING ON THIS BODY, and if not, what to say instead
 * (inbox B37, and B18's category error reaching a surface B18 did not).
 *
 * THE ONE ANSWER. `calculateDeltaVBudgets` writes -1 as a "not applicable" sentinel and four
 * consumers each decided for themselves what -1 meant: two published it through a truthiness test,
 * so every belt and ring in the app read **"Ascent Dv -0.0 km/s"**; one printed it as -1.0 m/s; and
 * the ascent TAG alone got it right, gating on planet-or-moon AND a solid surface. So the tag said
 * nothing about Jupiter while the info block beside it said 50.3 km/s.
 *
 * WHY A BELT IS WITHHELD RATHER THAN GIVEN A FRAGMENT'S FIGURE — B26 asks which reading applies and
 * the answer is the first. A belt's `massKg` is a DEBRIS-DENSITY PROXY, not a gravitational mass
 * (PHY-13), so an escape velocity computed from it is arithmetic on a number that was never a mass.
 * The alternative reading, "ascent from a typical fragment", is a different body's question: the
 * fragment has no radius, no mass and no gravity anywhere in the data, so answering it would mean
 * INVENTING a body and then reporting its figure as the belt's. A GM who wants that number can add
 * the asteroid — the app models it properly — and get a real one. What a belt actually costs to
 * work is station-keeping and rendezvous, which is a different quantity and not this field.
 *
 * The reasons are prose because they are PUBLISHED: the row stays visible and says why it is empty,
 * rather than vanishing and leaving a GM to wonder whether the engine forgot.
 */
export type AscentApplicability = { applies: true } | { applies: false; reason: string };

export function ascentBudgetApplies(body: CelestialBody): AscentApplicability {
  const role = body.roleHint;
  if (role === 'belt' || role === 'ring')
    return { applies: false, reason: 'debris spread round an orbit, with no surface to leave' };
  if (role === 'star')
    return { applies: false, reason: 'no surface' };
  if (role !== 'planet' && role !== 'moon')
    return { applies: false, reason: 'not a natural body' };
  if (!hasSolidSurface(body))
    return { applies: false, reason: 'no solid surface to lift from' };
  return { applies: true };
}

/**
 * Calculates the delta-v budgets for a celestial body.
 */
export function calculateDeltaVBudgets(body: CelestialBody) {
  // Only calculate surface budgets for planets and moons
  if (body.roleHint !== 'planet' && body.roleHint !== 'moon') {
    body.loDeltaVBudget_ms = -1;
    body.propulsiveLandBudget_ms = -1;
    body.aerobrakeLandBudget_ms = -1;
    return;
  }

  if (!body.calculatedGravity_ms2 || !body.radiusKm) return;

  const g = body.calculatedGravity_ms2;
  const r_meters = body.radiusKm * 1000;
  const pressure_bar = body.atmosphere?.pressure_bar || 0.0;

  // Base Orbital Velocity
  const v_orbit = Math.sqrt(g * r_meters);

  // --- FIXED ASCENT LOGIC ---
  
  // 1. Gravity Loss: 
  // On thick worlds (Venus), you spend more time fighting gravity because you can't speed up.
  // We add a multiplier based on pressure to simulate this efficiency loss.
  const pressure_penalty = pressure_bar > 1 ? Math.log10(pressure_bar) * 0.1 : 0;
  const v_grav_loss = v_orbit * (0.15 + pressure_penalty);

  // 2. Drag/Atmospheric Loss: 
  // detailed simulations show Venus ascent is ~27km/s total.
  // Using Math.pow(pressure, 0.6) curves the difficulty appropriately.
  // Earth (1 bar) ~= 1300 m/s
  // Venus (93 bar) ~= 19,700 m/s
  const v_drag_loss = pressure_bar > 0.001 
    ? 1300 * Math.pow(pressure_bar, 0.6) 
    : 0;

  body.loDeltaVBudget_ms = v_orbit + v_grav_loss + v_drag_loss;

  // --- LANDING LOGIC ---

  // Propulsive (Vacuum) Landing
  // Note: This assumes a vacuum-style retro burn. 
  body.propulsiveLandBudget_ms = v_orbit + v_grav_loss;

  // Aerobraking Landing
  if (pressure_bar < 0.001) {
    body.aerobrakeLandBudget_ms = -1;
  } else {
    const v_deorbit = 150;
    // This logic was actually fine! 
    // At 90 bar, exp is 0, so cost is just final touchdown burn.
    const v_final_burn = (1000 * Math.exp(-0.5 * pressure_bar)) + 50;
    body.aerobrakeLandBudget_ms = v_deorbit + v_final_burn;
  }
}
