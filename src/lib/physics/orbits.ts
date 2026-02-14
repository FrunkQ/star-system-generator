// ======== FILE: orbits.ts ========
import type { RulePack, CelestialBody, Barycenter } from '../types';
import { G, AU_KM } from '../constants';
import { getNodeColor } from '../rendering/colors';

const TWO_PI = 2 * Math.PI;

function normalizeAngle(angle: number): number {
  const normalized = angle % TWO_PI;
  return normalized < 0 ? normalized + TWO_PI : normalized;
}

// --- 1. DEFINE UNIVERSAL CONSTANTS ---
const UNIVERSAL_GAS_CONSTANT = 8.314;       // J/(mol·K)

// --- Helper Function: Find Dominant Gravity ---
export function findDominantGravitationalBody(
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

/**
 * Propagates an orbit to a specific time and returns the full State Vector (Position and Velocity).
 * Position is in AU.
 * Velocity is in AU/s.
 */
export function propagateState(node: CelestialBody | Barycenter | { orbit: any }, tMs: number): StateVector {
  if (!('orbit' in node) || !node.orbit) {
    return { r: { x: 0, y: 0 }, v: { x: 0, y: 0 } };
  }

  const { elements, hostMu, t0 } = node.orbit;
  const { a_AU, e, M0_rad } = elements;

  // Handle trivial case (Star/Root)
  if (hostMu === 0 || !a_AU) return { r: { x: 0, y: 0 }, v: { x: 0, y: 0 } };

  const a_m = a_AU * AU_KM * 1000; // semi-major axis in meters

  // 1. Mean motion (n)
  let n = node.orbit.n_rad_per_s ?? Math.sqrt(hostMu / Math.pow(a_m, 3));
  const isRetrograde = !!node.orbit.isRetrogradeOrbit;
  if (isRetrograde) {
    n = -n;
  }

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

  let vx_p_mps = -mu_h * Math.sin(f);
  let vy_p_mps = mu_h * (e + Math.cos(f));
  
  // 7. Rotate to System Frame (Arg of Periapsis)
  const omega_rad = (node.orbit.elements.omega_deg || 0) * (Math.PI / 180);
  const cos_o = Math.cos(omega_rad);
  const sin_o = Math.sin(omega_rad);

  const x_au = (x_p_m * cos_o - y_p_m * sin_o) / (AU_KM * 1000);
  const y_au = (x_p_m * sin_o + y_p_m * cos_o) / (AU_KM * 1000);

  const vx_mps = vx_p_mps * cos_o - vy_p_mps * sin_o;
  const vy_mps = vx_p_mps * sin_o + vy_p_mps * cos_o;

  return {
    r: { x: x_au, y: y_au },
    v: { x: vx_mps / (AU_KM * 1000), y: vy_mps / (AU_KM * 1000) } // Convert m/s to AU/s
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

export function getOrbitOptions(body: CelestialBody, rulePack: RulePack, system?: System): { id: string, name: string, radiusKm: number, color: string, isLagrange?: boolean }[] {
    // Only for planets/moons/stars?
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
    options.push({ id: 'l4', name: 'L4 (Leading Trojan)', radiusKm: radiusKm + 100000, sortOrder: 90, color: '#ffffff', isLagrange: true }); 
    options.push({ id: 'l5', name: 'L5 (Trailing Trojan)', radiusKm: radiusKm + 100000, sortOrder: 91, color: '#ffffff', isLagrange: true });
    
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
