// ===== api.ts (stubs for M0–M1) =====
import type { System, RulePack, ID, CelestialBody, Barycenter, BurnPlan, Orbit, Expr } from "./types";
import { SeededRNG } from './rng';
import { weightedChoice, randomFromRange, toRoman } from './utils';

export interface GenOptions { starCount?: number; maxBodies?: number; }

const SOLAR_MASS_KG = 1.989e30;
const SOLAR_RADIUS_KM = 696340;
const EARTH_MASS_KG = 5.972e24;
const EARTH_RADIUS_KM = 6371;
const G = 6.67430e-11; // Gravitational constant
const AU_KM = 149597870.7;

export function generateSystem(seed: string, pack: RulePack, opts: Partial<GenOptions> = {}): System {
  const rng = new SeededRNG(seed);
  const nodes: (CelestialBody | Barycenter)[] = [];

  // --- Star Generation ---
  const starNamePrefixTable = pack.distributions['star_name_prefix'];
  const starNameDigitsTable = pack.distributions['star_name_number_digits'];
  let starName = `Star ${seed}`;
  if (starNamePrefixTable && starNameDigitsTable) {
      const prefix = weightedChoice<string>(rng, starNamePrefixTable);
      const numDigits = weightedChoice<number>(rng, starNameDigitsTable);
      const number = ' '.padStart(numDigits, '0').replace(/0/g, () => rng.nextInt(0, 9).toString());
      starName = `${prefix}${number}`;
  }

  const starTypeTable = pack.distributions['star_types'];
  const starClass = starTypeTable ? weightedChoice<string>(rng, starTypeTable) : 'star/G2V';
  const starTemplate = pack.statTemplates?.[starClass] || pack.statTemplates?.['star/default'];

  let starMassKg = SOLAR_MASS_KG;
  let starRadiusKm = SOLAR_RADIUS_KM;
  let starTemperatureK = 5778;
  let starMagneticField;

  if (starTemplate) {
    starMassKg = randomFromRange(rng, starTemplate.mass_solar[0], starTemplate.mass_solar[1]) * SOLAR_MASS_KG;
    starRadiusKm = randomFromRange(rng, starTemplate.radius_solar[0], starTemplate.radius_solar[1]) * SOLAR_RADIUS_KM;
    starTemperatureK = randomFromRange(rng, starTemplate.temp_k[0], starTemplate.temp_k[1]);
    if (starTemplate.mag_gauss) {
        starMagneticField = { strengthGauss: randomFromRange(rng, starTemplate.mag_gauss[0], starTemplate.mag_gauss[1]) };
    }
  }

  const primaryStar: CelestialBody = {
    id: `${seed}-star-1`,
    parentId: null,
    name: starName,
    kind: 'body',
    roleHint: 'star',
    classes: [starClass],
    massKg: starMassKg,
    radiusKm: starRadiusKm,
    temperatureK: starTemperatureK,
    magneticField: starMagneticField,
    tags: [],
    areas: [],
  };
  nodes.push(primaryStar);

  // --- Planet & Belt Generation ---
  const bodyCountTable = pack.distributions['planet_count'];
  const numBodies = bodyCountTable ? weightedChoice<number>(rng, bodyCountTable) : rng.nextInt(0, 8);
  
  let lastApoapsisAU = 0.1; // Start first body at 0.1 AU

  for (let i = 0; i < numBodies; i++) {
    const minGap = 0.5; // Minimum AU gap between orbits
    const newPeriapsis = lastApoapsisAU + randomFromRange(rng, minGap, minGap * 5);
    const newEccentricity = randomFromRange(rng, 0.01, 0.15);
    const newA_AU = newPeriapsis / (1 - newEccentricity);
    lastApoapsisAU = newA_AU * (1 + newEccentricity);

    const beltChanceTable = pack.distributions['belt_chance'];
    const isBelt = beltChanceTable ? weightedChoice<boolean>(rng, beltChanceTable) : false;

    if (isBelt) {
        const belt: CelestialBody = {
            id: `${seed}-belt-${i + 1}`,
            parentId: primaryStar.id,
            name: `${starName} Belt ${String.fromCharCode(65 + i)}`,
            kind: 'body',
            roleHint: 'belt',
            classes: ['belt/asteroid'],
            orbit: {
                hostId: primaryStar.id,
                hostMu: G * primaryStar.massKg,
                t0: Date.now(),
                elements: { a_AU: newA_AU, e: newEccentricity, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: randomFromRange(rng, 0, 2 * Math.PI) }
            },
            tags: [],
            areas: [],
        };
        nodes.push(belt);
        continue; 
    }

    // --- Generate Planet ---
    const planetId = `${seed}-planet-${i + 1}`;
    const planetOrbit: Orbit = {
        hostId: primaryStar.id,
        hostMu: G * primaryStar.massKg,
        t0: Date.now(),
        elements: { a_AU: newA_AU, e: newEccentricity, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: randomFromRange(rng, 0, 2 * Math.PI) }
    };

    const planetType = pack.distributions['planet_type'] ? weightedChoice<string>(rng, pack.distributions['planet_type']) : 'planet/terrestrial';
    const planetTemplate = pack.statTemplates?.[planetType];
    let planetMassKg, planetRadiusKm;

    if (planetTemplate) {
        planetMassKg = randomFromRange(rng, planetTemplate.mass_earth[0], planetTemplate.mass_earth[1]) * EARTH_MASS_KG;
        planetRadiusKm = randomFromRange(rng, planetTemplate.radius_earth[0], planetTemplate.radius_earth[1]) * EARTH_RADIUS_KM;
    }

    const planetName = `${starName} ${String.fromCharCode(98 + i)}`;
    const planet: CelestialBody = {
        id: planetId,
        parentId: primaryStar.id,
        name: planetName,
        kind: 'body',
        roleHint: 'planet',
        classes: [],
        orbit: planetOrbit,
        massKg: planetMassKg,
        radiusKm: planetRadiusKm,
        tags: [],
        areas: [],
    };
    planet.classes = classifyBody(planet, primaryStar, pack);
    nodes.push(planet);

    // --- Ring Generation ---
    const isGasGiant = planet.classes.includes('planet/gas-giant');
    const ringChanceTable = pack.distributions[isGasGiant ? 'gas_giant_ring_chance' : 'terrestrial_ring_chance'];
    const hasRing = ringChanceTable ? weightedChoice<boolean>(rng, ringChanceTable) : false;

    if (hasRing) {
        const ringTemplate = pack.statTemplates?.['ring/planetary'];
        let ringInnerKm = (planet.radiusKm || 0) * 1.5;
        let ringOuterKm = (planet.radiusKm || 0) * 2.5;
        if (ringTemplate) {
            ringInnerKm = (planet.radiusKm || 0) * randomFromRange(rng, ringTemplate.radius_inner_multiple[0], ringTemplate.radius_inner_multiple[1]);
            ringOuterKm = (planet.radiusKm || 0) * randomFromRange(rng, ringTemplate.radius_outer_multiple[0], ringTemplate.radius_outer_multiple[1]);
        }
        const ring: CelestialBody = {
            id: `${planetId}-ring-1`,
            parentId: planet.id,
            name: `${planetName} Ring`,
            kind: 'body',
            roleHint: 'ring',
            classes: ['ring/planetary'],
            radiusInnerKm: ringInnerKm,
            radiusOuterKm: ringOuterKm,
            tags: [],
            areas: [],
        };
        nodes.push(ring);
    }

    // --- Moon Generation ---
    const moonCountTable = pack.distributions[isGasGiant ? 'gas_giant_moon_count' : 'terrestrial_moon_count'];
    const numMoons = moonCountTable ? weightedChoice<number>(rng, moonCountTable) : 0;
    let lastMoonRadiusAU = 0.001;

    for (let j = 0; j < numMoons; j++) {
        lastMoonRadiusAU += randomFromRange(rng, 0.0005, 0.002);
        const moonOrbit: Orbit = {
            hostId: planet.id,
            hostMu: G * (planet.massKg || 0),
            t0: Date.now(),
            elements: { a_AU: lastMoonRadiusAU, e: randomFromRange(rng, 0, 0.2), i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: randomFromRange(rng, 0, 2 * Math.PI) }
        };
        const moon: CelestialBody = {
            id: `${planet.id}-moon-${j + 1}`,
            parentId: planet.id,
            name: `${planetName} ${toRoman(j + 1)}`,
            kind: 'body',
            roleHint: 'moon',
            classes: [],
            orbit: moonOrbit,
            massKg: (planet.massKg || 0) * randomFromRange(rng, 0.0001, 0.01),
            radiusKm: (planet.radiusKm || 0) * randomFromRange(rng, 0.1, 0.25),
            tags: [],
            areas: [],
        };
        moon.classes = classifyBody(moon, planet, pack);
        nodes.push(moon);
    }
  }

  const system: System = {
    id: seed,
    name: starName,
    seed: seed,
    epochT0: Date.now(),
    nodes: nodes,
    rulePackId: pack.id,
    rulePackVersion: pack.version,
    tags: [],
  };

  return system;
}

export function rerollNode(sys: System, nodeId: ID, pack: RulePack): System {
  // TODO M0: respect lock flags (future), re-generate subtree deterministically
  throw new Error("TODO: implement rerollNode (M0)");
}

// Helper function to recursively evaluate classifier expressions
function evaluateExpr(features: Record<string, number | string>, expr: Expr): boolean {
    if (expr.all) return expr.all.every(e => evaluateExpr(features, e));
    if (expr.any) return expr.any.some(e => evaluateExpr(features, e));
    if (expr.not) return !evaluateExpr(features, expr.not);
    if (expr.gt) return (features[expr.gt[0]] ?? -Infinity) > expr.gt[1];
    if (expr.lt) return (features[expr.lt[0]] ?? Infinity) < expr.lt[1];
    if (expr.between) {
        const val = features[expr.between[0]];
        return val !== undefined && val >= expr.between[1] && val <= expr.between[2];
    }
    if (expr.eq) return features[expr.eq[0]] === expr.eq[1];
    // hasTag is not implemented yet as tags are not generated for planets
    return false;
}

export function classifyBody(body: CelestialBody, host: CelestialBody | Barycenter | undefined, pack: RulePack): string[] {
  if (!pack.classifier) return [];

    const features: Record<string, number | string> = {};
    
    // --- Compute Features ---
    if (body.massKg) features['mass_Me'] = body.massKg / EARTH_MASS_KG;
    if (body.radiusKm) features['radius_Re'] = body.radiusKm / EARTH_RADIUS_KM;
    // TODO: Add more feature calculations (Teq_K, period_days, etc.)

    const scores: Record<string, number> = {};

    for (const rule of pack.classifier.rules) {
        if (evaluateExpr(features, rule.when)) {
            scores[rule.addClass] = (scores[rule.addClass] || 0) + rule.score;
        }
    }

    const sortedClasses = Object.entries(scores)
        .filter(([, score]) => score >= pack.classifier.minScore)
        .sort((a, b) => b[1] - a[1]);

    return sortedClasses.slice(0, pack.classifier.maxClasses).map(([className]) => className);
}

export function computePlayerSnapshot(sys: System, scopeRootId?: ID): System {
  // TODO M3: prune nodes by visibility & scope; strip gmNotes/hidden fields per rules
  return sys; // placeholder for early UI
}

export function propagate(node: CelestialBody | Barycenter, tMs: number): {x: number, y: number} | null {
  if (node.kind !== 'body' || !node.orbit) {
    return { x: 0, y: 0 }; // Barycenters or root nodes are at the origin of their frame
  }

  const { elements, hostMu, t0 } = node.orbit;
  const { a_AU, e, M0_rad } = elements;

  if (hostMu === 0) return { x: 0, y: 0 };

  const a_m = a_AU * AU_KM * 1000; // semi-major axis in meters

  // 1. Mean motion (n)
  const n = Math.sqrt(hostMu / Math.pow(a_m, 3));

  // 2. Mean anomaly (M) at time t
  const M = M0_rad + n * ((tMs - t0) / 1000);

  // 3. Solve Kepler's Equation for Eccentric Anomaly (E) using Newton-Raphson
  let E = M; // Initial guess
  for (let i = 0; i < 10; i++) { // Iterate a few times for precision
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-6) break;
  }

  // 4. True Anomaly (f)
  const f = 2 * Math.atan2(
      Math.sqrt(1 + e) * Math.sin(E / 2),
      Math.sqrt(1 - e) * Math.cos(E / 2)
  );

  // 5. Distance to central body (r)
  const r = a_m * (1 - e * Math.cos(E));

  // 6. Position in orbital frame (z=0 for 2D projection)
  const x = r * Math.cos(f) / AU_KM / 1000; // convert back to AU for visualization scale
  const y = r * Math.sin(f) / AU_KM / 1000;

  // TODO: Apply argument of periapsis and longitude of ascending node rotations for inclined orbits

  return { x, y };
}

export function applyImpulsiveBurn(body: CelestialBody, burn: BurnPlan, sys: System): CelestialBody {
  // TODO M6: apply Δv in perifocal frame; recompute elements via Gauss equations
  throw new Error("TODO: implement applyImpulsiveBurn (M6)");
}