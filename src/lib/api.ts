// ===== api.ts =====
import type { System, RulePack, ID, CelestialBody, Barycenter, BurnPlan, Orbit, Expr } from "./types";
import { SeededRNG } from './rng';
import { weightedChoice, randomFromRange, toRoman } from './utils';

export interface GenOptions { maxBodies?: number; } // starCount is no longer an option

const SOLAR_MASS_KG = 1.989e30;
const SOLAR_RADIUS_KM = 696340;
const EARTH_MASS_KG = 5.972e24;
const EARTH_RADIUS_KM = 6371;
const G = 6.67430e-11; // Gravitational constant
const AU_KM = 149597870.7;

// Generates a star object, but not its name, which is determined by the system context.
function _generateStar(id: ID, parentId: ID | null, pack: RulePack, rng: SeededRNG): CelestialBody {
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

    return {
        id: id,
        parentId: parentId,
        name: "", // Name is set by the caller
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
}

function _generatePlanetaryBody(
    rng: SeededRNG,
    pack: RulePack,
    seed: string,
    i: number,
    host: CelestialBody | Barycenter,
    orbit: Orbit,
    name: string,
    allNodes: (CelestialBody | Barycenter)[]
): CelestialBody[] {
    const newNodes: CelestialBody[] = [];

    const beltChanceTable = pack.distributions['belt_chance'];
    const isBelt = beltChanceTable ? weightedChoice<boolean>(rng, beltChanceTable) : false;

    if (isBelt && host.kind !== 'body') { // Belts only form around stars/barycenters
        const belt: CelestialBody = {
            id: `${seed}-belt-${i + 1}`,
            parentId: host.id,
            name: name.replace(/\d+$/, (m) => `Belt ${String.fromCharCode(65 + parseInt(m, 10))}`),
            kind: 'body',
            roleHint: 'belt',
            classes: ['belt/asteroid'],
            orbit: orbit,
            tags: [],
            areas: [],
        };
        newNodes.push(belt);
        return newNodes;
    }

    const planetId = `${seed}-body-${i + 1}`;
    const planet: CelestialBody = {
        id: planetId,
        parentId: host.id,
        name: name,
        kind: 'body',
        roleHint: (host.kind === 'body' && (host.roleHint === 'planet' || host.roleHint === 'moon')) ? 'moon' : 'planet',
        classes: [],
        orbit: orbit,
        massKg: 0, // placeholder
        radiusKm: 0, // placeholder
        tags: [],
        areas: [],
    };

    const planetType = (planet.roleHint === 'moon') 
        ? 'planet/terrestrial' 
        : pack.distributions['planet_type'] ? weightedChoice<string>(rng, pack.distributions['planet_type']) : 'planet/terrestrial';

    const planetTemplate = pack.statTemplates?.[planetType];
    if (planetTemplate) {
        planet.massKg = randomFromRange(rng, planetTemplate.mass_earth[0], planetTemplate.mass_earth[1]) * EARTH_MASS_KG;
        planet.radiusKm = randomFromRange(rng, planetTemplate.radius_earth[0], planetTemplate.radius_earth[1]) * EARTH_RADIUS_KM;
    }

    // --- Feature Calculation & Property Assignment ---
    const features: Record<string, number | string> = {};
    if (planet.massKg) features['mass_Me'] = planet.massKg / EARTH_MASS_KG;
    if (planet.radiusKm) features['radius_Re'] = planet.radiusKm / EARTH_RADIUS_KM;
    if (planet.orbit) features['a_AU'] = planet.orbit.elements.a_AU;

    let ultimateHost = allNodes.find(n => n.id === orbit.hostId);
    while(ultimateHost && ultimateHost.parentId) {
        const nextHost = allNodes.find(n => n.id === ultimateHost!.parentId);
        if (nextHost) ultimateHost = nextHost; else break;
    }

    let primaryStar: CelestialBody | undefined;
    if (ultimateHost?.kind === 'body') primaryStar = ultimateHost as CelestialBody;
    if (ultimateHost?.kind === 'barycenter') primaryStar = allNodes.find(n => n.id === ultimateHost.memberIds[0]) as CelestialBody;

    let equilibriumTempK = 0;
    if (primaryStar && primaryStar.roleHint === 'star') {
        features['stellarType'] = primaryStar.classes[0].split('/')[1]?.[0] || 'G';
        const albedo = 0.3; // Placeholder albedo
        const starTemp = primaryStar.temperatureK || 5778;
        const starRadius_AU = (primaryStar.radiusKm || SOLAR_RADIUS_KM) / AU_KM;
        const planetDist_AU = planet.orbit?.elements.a_AU || 0;
        if (planetDist_AU > 0) {
            equilibriumTempK = starTemp * Math.sqrt(starRadius_AU / (2 * planetDist_AU)) * Math.pow(1 - albedo, 0.25);
            features['Teq_K'] = equilibriumTempK;
        }
        features['stellarIrradiation'] = primaryStar.magneticField?.strengthGauss || 1;
    }

    features['tidalHeating'] = 0;
    planet.temperatureK = equilibriumTempK;
    features['Teq_K'] = planet.temperatureK; // Update the feature for the classifier to use the total temperature

    const escapeVelocity = Math.sqrt(2 * G * (planet.massKg || 0) / ((planet.radiusKm || 1) * 1000)) / 1000; // in km/s
    features['escapeVelocity_kms'] = escapeVelocity;

    // Determine tidal locking
    const isTidallyLocked = (features['a_AU'] as number) < 0.1 * Math.pow(hostMass / SOLAR_MASS_KG, 1/3);
    planet.tidallyLocked = isTidallyLocked;
    features['tidallyLocked'] = isTidallyLocked ? 1 : 0;

    if (planetType === 'planet/terrestrial') {
        let hasAtmosphere = true;
        if (escapeVelocity < 3.0) hasAtmosphere = false;
        if ((features['stellarIrradiation'] as number) > 100 && (features['a_AU'] as number) < 0.5) hasAtmosphere = false;

        if (hasAtmosphere) {
            const pressureRange = weightedChoice<[number, number]>(rng, pack.distributions['atmosphere_pressure_bar']);
            const atmComp = weightedChoice<{main: string, secondary: string}>(rng, pack.distributions['atmosphere_composition']);
            planet.atmosphere = {
                pressure_bar: randomFromRange(rng, pressureRange[0], pressureRange[1]),
                main: atmComp.main,
                composition: { [atmComp.main]: 0.8, [atmComp.secondary]: 0.2 }
            };
            features['atm.main'] = planet.atmosphere.main;
            features['atm.pressure_bar'] = planet.atmosphere.pressure_bar;
        }

        const hydroCoverageRange = weightedChoice<[number, number]>(rng, pack.distributions['hydrosphere_coverage']);
        planet.hydrosphere = {
            coverage: randomFromRange(rng, hydroCoverageRange[0], hydroCoverageRange[1]),
            composition: weightedChoice<string>(rng, pack.distributions['hydrosphere_composition'])
        };
        features['hydrosphere.coverage'] = planet.hydrosphere.coverage;
    }

    planet.classes = classifyBody(features, pack);

    const primaryClass = planet.classes[0];
    if (primaryClass && pack.classifier?.planetImages?.[primaryClass]) {
        planet.image = pack.classifier.planetImages[primaryClass];
    }

    newNodes.push(planet);

    if (planet.roleHint === 'planet') {
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
                name: `${planet.name} Ring`,
                kind: 'body',
                roleHint: 'ring',
                classes: ['ring/planetary'],
                radiusInnerKm: ringInnerKm,
                radiusOuterKm: ringOuterKm,
                tags: [],
                areas: [],
            };
            newNodes.push(ring);
        }

        const moonCountTable = pack.distributions[isGasGiant ? 'gas_giant_moon_count' : 'terrestrial_moon_count'];
        const numMoons = moonCountTable ? weightedChoice<number>(rng, moonCountTable) : 0;
        let lastMoonApoapsisAU = (planet.radiusKm || 0) / AU_KM * 3;

        for (let j = 0; j < numMoons; j++) {
            const moonMinGap = (planet.radiusKm || 0) / AU_KM * 2;
            const newMoonPeriapsis = lastMoonApoapsisAU + randomFromRange(rng, moonMinGap, moonMinGap * 3);
            const newMoonEccentricity = randomFromRange(rng, 0, 0.05);
            const newMoonA_AU = newMoonPeriapsis / (1 - newMoonEccentricity);
            lastMoonApoapsisAU = newMoonA_AU * (1 + newMoonEccentricity);

            const moonOrbit: Orbit = {
                hostId: planet.id,
                hostMu: G * (planet.massKg || 0),
                t0: Date.now(),
                elements: { a_AU: newMoonA_AU, e: newMoonEccentricity, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: randomFromRange(rng, 0, 2 * Math.PI) }
            };
            
            const moonNodes = _generatePlanetaryBody(rng, pack, `${planet.id}-moon`, j, planet, moonOrbit, `${planet.name} ${toRoman(j + 1)}`, [...allNodes, ...newNodes]);
            newNodes.push(...moonNodes);
        }
    }

    return newNodes;
}

export function generateSystem(seed: string, pack: RulePack, opts: Partial<GenOptions> = {}): System {
  const rng = new SeededRNG(seed);
  const nodes: (CelestialBody | Barycenter)[] = [];

  let systemRoot: CelestialBody | Barycenter;
  let systemName: string;
  let totalMassKg = 0;
  let rootRadiusKm = 0;
  let baseName = `System ${seed}`;

  // --- Star Generation ---
  const baseNamePrefixTable = pack.distributions['star_name_prefix'];
  const baseNameDigitsTable = pack.distributions['star_name_number_digits'];
  if (baseNamePrefixTable && baseNameDigitsTable) {
      const prefix = weightedChoice<string>(rng, baseNamePrefixTable);
      const numDigits = weightedChoice<number>(rng, baseNameDigitsTable);
      baseName = `${prefix}${ ' '.padStart(numDigits, '0').replace(/0/g, () => rng.nextInt(0, 9).toString())}`;
  }

  const starA = _generateStar(`${seed}-star-a`, null, pack, rng);
  const starClass = starA.classes[0].split('/')[1]; // e.g., "G2V" -> "G"

  let isBinary = false;
  if (['O', 'B'].includes(starClass)) {
      isBinary = weightedChoice<boolean>(rng, pack.distributions['is_binary_chance_massive']);
  } else if (['A', 'F', 'G', 'K'].includes(starClass)) {
      isBinary = weightedChoice<boolean>(rng, pack.distributions['is_binary_chance_sunlike']);
  } else { // M, WD, etc.
      isBinary = weightedChoice<boolean>(rng, pack.distributions['is_binary_chance_lowmass']);
  }

  if (!isBinary) {
    starA.name = baseName;
    nodes.push(starA);
    systemRoot = starA;
    systemName = starA.name;
    totalMassKg = starA.massKg || 0;
    rootRadiusKm = starA.radiusKm || 0;
  } else {
    const barycenterId = `${seed}-barycenter-0`;
    const barycenter: Barycenter = {
        id: barycenterId,
        parentId: null,
        name: `${baseName} System Barycenter`,
        kind: "barycenter",
        memberIds: [starA.id],
        tags: [],
    };

    starA.parentId = barycenterId;
    starA.name = `${baseName} A`;

    const starB = _generateStar(`${seed}-star-b`, barycenterId, pack, rng);
    starB.name = `${baseName} B`;
    barycenter.memberIds.push(starB.id);

    totalMassKg = (starA.massKg || 0) + (starB.massKg || 0);
    barycenter.effectiveMassKg = totalMassKg;

    const separationRange = weightedChoice<[number, number]>(rng, pack.distributions['binary_star_separation_au']);
    const totalSeparationAU = randomFromRange(rng, separationRange[0], separationRange[1]);

    const m1 = starA.massKg || 0;
    const m2 = starB.massKg || 0;

    const n_rad_per_s = Math.sqrt(G * totalMassKg / Math.pow(totalSeparationAU * AU_KM * 1000, 3));

    starA.orbit = {
        hostId: barycenterId,
        hostMu: G * totalMassKg,
        t0: Date.now(),
        n_rad_per_s: n_rad_per_s,
        elements: { a_AU: totalSeparationAU * (m2 / (m1 + m2)), e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 }
    };
    starB.orbit = {
        hostId: barycenterId,
        hostMu: G * totalMassKg,
        t0: Date.now(),
        n_rad_per_s: n_rad_per_s,
        elements: { a_AU: totalSeparationAU * (m1 / (m1 + m2)), e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: Math.PI }
    };

    nodes.push(barycenter, starA, starB);
    systemRoot = barycenter;
    systemName = `${baseName} System`;
    rootRadiusKm = (starA.radiusKm || 0) + (starB.radiusKm || 0);
  }

  // --- Planet & Belt Generation ---
  const bodyCountTable = pack.distributions['planet_count'];
  const numBodies = bodyCountTable ? weightedChoice<number>(rng, bodyCountTable) : rng.nextInt(0, 8);

  if (!isBinary) {
    let lastApoapsisAU = (rootRadiusKm / AU_KM) + 0.5;
    for (let i = 0; i < numBodies; i++) {
        const minGap = 0.5;
        const newPeriapsis = lastApoapsisAU + randomFromRange(rng, minGap, minGap * 5);
        const newEccentricity = randomFromRange(rng, 0.01, 0.15);
        const newA_AU = newPeriapsis / (1 - newEccentricity);
        lastApoapsisAU = newA_AU * (1 + newEccentricity);

        const orbit: Orbit = {
            hostId: systemRoot.id,
            hostMu: G * totalMassKg,
            t0: Date.now(),
            elements: { a_AU: newA_AU, e: newEccentricity, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: randomFromRange(rng, 0, 2 * Math.PI) }
        };
        const newNodes = _generatePlanetaryBody(rng, pack, seed, i, systemRoot, orbit, `${systemName} ${String.fromCharCode(98 + i)}`, nodes);
        nodes.push(...newNodes);
    }
  } else {
    const starA = nodes.find(n => n.id.endsWith('-star-a')) as CelestialBody;
    const starB = nodes.find(n => n.id.endsWith('-star-b')) as CelestialBody;
    const barycenter = systemRoot as Barycenter;

    const m1 = starA.massKg || 0;
    const m2 = starB.massKg || 0;
    const mu = m2 / (m1 + m2);
    const starSeparationAU = (starA.orbit?.elements.a_AU || 0) + (starB.orbit?.elements.a_AU || 0);

    const pTypeCriticalAU = 1.60 * starSeparationAU;
    const sTypeACriticalAU = 0.464 * (1 - mu) * starSeparationAU;
    const sTypeBCriticalAU = 0.464 * mu * starSeparationAU;

    let lastApo_p = pTypeCriticalAU * 1.5;
    let lastApo_sA = (starA.radiusKm || 0) / AU_KM;
    let lastApo_sB = (starB.radiusKm || 0) / AU_KM;

    for (let i = 0; i < numBodies; i++) {
        const placement = weightedChoice<string>(rng, pack.distributions['binary_planet_placement']);

        let host: CelestialBody | Barycenter;
        let lastApo: number;
        let maxApo: number | null = null;
        let planetNamePrefix: string;
        let hostMassKg: number;

        if (placement === 'circumbinary') {
            host = barycenter;
            lastApo = lastApo_p;
            planetNamePrefix = `${baseName} P`;
            hostMassKg = totalMassKg;
        } else if (placement === 'around_primary') {
            host = starA;
            lastApo = lastApo_sA;
            maxApo = sTypeACriticalAU;
            planetNamePrefix = `${starA.name} `;
            hostMassKg = m1;
        } else { // around_secondary
            host = starB;
            lastApo = lastApo_sB;
            maxApo = sTypeBCriticalAU;
            planetNamePrefix = `${starB.name} `;
            hostMassKg = m2;
        }

        const minGap = 0.1 * (host.kind === 'barycenter' ? starSeparationAU : 1);
        const newPeriapsis = lastApo + randomFromRange(rng, minGap, minGap * 3);
        if (maxApo && newPeriapsis > maxApo) continue;

        const newEccentricity = randomFromRange(rng, 0.01, 0.15);
        const newA_AU = newPeriapsis / (1 - newEccentricity);
        const newApoapsis = newA_AU * (1 + newEccentricity);

        if (maxApo && newApoapsis > maxApo) continue;

        const orbit: Orbit = {
            hostId: host.id,
            hostMu: G * hostMassKg,
            t0: Date.now(),
            elements: { a_AU: newA_AU, e: newEccentricity, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: randomFromRange(rng, 0, 2 * Math.PI) }
        };

        const newNodes = _generatePlanetaryBody(rng, pack, seed, i, host, orbit, `${planetNamePrefix}${toRoman(i + 1)}`, nodes);
        nodes.push(...newNodes);

        if (placement === 'circumbinary') lastApo_p = newApoapsis;
        else if (placement === 'around_primary') lastApo_sA = newApoapsis;
        else lastApo_sB = newApoapsis;
    }
  }

  const system: System = {
    id: seed,
    name: systemName,
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

export function classifyBody(features: Record<string, number | string>, pack: RulePack): string[] {
  if (!pack.classifier) return [];

    const scores: Record<string, number> = {};

    for (const rule of pack.classifier.rules) {
        if (evaluateExpr(features, rule.when)) {
            scores[rule.addClass] = (scores[rule.addClass] || 0) + rule.score;
        }
    }

    const sortedClasses = Object.entries(scores)
        .filter(([, score]) => score >= pack.classifier.minScore)
        .sort((a, b) => b[1] - a[1]);

    // Start with the most likely class, but also add generic fallbacks.
    const primaryClass = sortedClasses.slice(0, pack.classifier.maxClasses).map(([className]) => className);
    if (primaryClass.length === 0) {
        if ((features['mass_Me'] as number) > 10) {
            primaryClass.push('planet/gas-giant');
        } else {
            primaryClass.push('planet/terrestrial');
        }
    }
    return primaryClass;
}

export function computePlayerSnapshot(sys: System, scopeRootId?: ID): System {
  const playerSystem = JSON.parse(JSON.stringify(sys)); // Deep copy to avoid modifying the original

  // TODO: Implement scoping by scopeRootId

  playerSystem.nodes = playerSystem.nodes.map((node: any) => {
      // Remove GM-only fields
      delete node.gmNotes;

      // Field-level visibility (not yet implemented in generator)
      if (node.visibility?.fields) {
          for (const [field, isVisible] of Object.entries(node.visibility.fields)) {
              if (!isVisible) {
                  delete node[field];
              }
          }
      }
      return node;
  }).filter((node: any) => node.visibility?.visibleToPlayers !== false);

  // Also filter from the top-level system object
  delete playerSystem.gmNotes;

  return playerSystem;
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
  // Use pre-calculated mean motion for binary stars, otherwise calculate it.
  const n = node.orbit.n_rad_per_s ?? Math.sqrt(hostMu / Math.pow(a_m, 3));

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