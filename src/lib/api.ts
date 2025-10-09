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
function _generateStar(id: ID, parentId: ID | null, pack: RulePack, rng: SeededRNG, starTypeOverride?: string): CelestialBody {
    const starTypeTable = pack.distributions['star_types'];
    const starClass = starTypeOverride ?? (starTypeTable ? weightedChoice<string>(rng, starTypeTable) : 'star/G2V');
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

    const radiationOutput = starTemplate?.radiation_output ? randomFromRange(rng, starTemplate.radiation_output[0], starTemplate.radiation_output[1]) : 1;

    const starImage = pack.classifier?.starImages?.[starClass];

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
        radiationOutput: radiationOutput,
        image: starImage ? { url: starImage } : undefined,
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
    allNodes: (CelestialBody | Barycenter)[],
    age_Gyr: number,
    planetTypeOverride?: string,
    generateChildren: boolean = true
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

    const planetType = planetTypeOverride ?? ((planet.roleHint === 'moon') 
        ? 'planet/terrestrial' 
        : pack.distributions['planet_type'] ? weightedChoice<string>(rng, pack.distributions['planet_type']) : 'planet/terrestrial');

    const planetTemplate = pack.statTemplates?.[planetType];
    if (planetTemplate) {
        planet.massKg = randomFromRange(rng, planetTemplate.mass_earth[0], planetTemplate.mass_earth[1]) * EARTH_MASS_KG;
        planet.radiusKm = randomFromRange(rng, planetTemplate.radius_earth[0], planetTemplate.radius_earth[1]) * EARTH_RADIUS_KM;
        
        // Conditionally generate magnetic field for terrestrial planets
        if (planetType === 'planet/terrestrial' && planet.massKg > 0.5 * EARTH_MASS_KG && rng.nextFloat() > 0.2) {
             planet.magneticField = { strengthGauss: randomFromRange(rng, 0.1, 1.5) };
        } else if (planetTemplate.mag_gauss) {
            planet.magneticField = { strengthGauss: randomFromRange(rng, planetTemplate.mag_gauss[0], planetTemplate.mag_gauss[1]) };
        }

        if (planet.roleHint === 'moon' && host.kind === 'body') {
            const parentMass = (host as CelestialBody).massKg || 0;
            const parentRadius = (host as CelestialBody).radiusKm || 0;
            planet.massKg = Math.min(planet.massKg, parentMass * 0.05);
            planet.radiusKm = Math.min(planet.radiusKm, parentRadius * 0.5);
        }
    }

    // --- Feature Calculation & Property Assignment ---
    const features: Record<string, number | string> = { id: planetId };
    if (planet.massKg) features['mass_Me'] = planet.massKg / EARTH_MASS_KG;
    if (planet.radiusKm) features['radius_Re'] = planet.radiusKm / EARTH_RADIUS_KM;
    if (planet.orbit) features['a_AU'] = planet.orbit.elements.a_AU;

    // Find all stars in the system for radiation calculation
    const allStars = allNodes.filter(n => n.kind === 'body' && n.roleHint === 'star') as CelestialBody[];

    let totalStellarRadiation = 0;
    let equilibriumTempK = 0;

    if (allStars.length > 0) {
        const albedo = 0.3; // Placeholder albedo
        let totalLuminosityTimesArea = 0;

        for (const star of allStars) {
            const starTemp = star.temperatureK || 5778;
            const starRadius_m = (star.radiusKm || SOLAR_RADIUS_KM) * 1000;
            const starLuminosity = 4 * Math.PI * Math.pow(starRadius_m, 2) * 5.67e-8 * Math.pow(starTemp, 4);

            // Find distance from this star to the planet
            let currentBody: CelestialBody | Barycenter = planet;
            let distance_m = 0;
            let path = [];

            // This is a simplified distance calculation that does not account for the true 3D position of bodies in different orbital planes.
            // It sums semi-major axes up and down the tree.
            const findPath = (startNode: CelestialBody | Barycenter, targetId: ID): (CelestialBody | Barycenter)[] => {
                let p = [];
                let curr = startNode;
                while(curr) {
                    p.unshift(curr);
                    if (curr.id === targetId) return p;
                    curr = allNodes.find(n => n.id === curr.parentId)!;
                }
                return [];
            }

            const pathToStar = findPath(star, allNodes.find(n => n.parentId === null)!.id);
            const pathToPlanet = findPath(planet, allNodes.find(n => n.parentId === null)!.id);

            let lcaIndex = 0;
            while(lcaIndex < pathToStar.length && lcaIndex < pathToPlanet.length && pathToStar[lcaIndex].id === pathToPlanet[lcaIndex].id) {
                lcaIndex++;
            }
            lcaIndex--; // step back to the common ancestor

            let dist_au = 0;
            for (let i = lcaIndex + 1; i < pathToPlanet.length; i++) {
                dist_au += (pathToPlanet[i] as CelestialBody).orbit?.elements.a_AU || 0;
            }
            for (let i = lcaIndex + 1; i < pathToStar.length; i++) {
                dist_au += (pathToStar[i] as CelestialBody).orbit?.elements.a_AU || 0;
            }

            if (dist_au > 0) {
                const dist_m = dist_au * AU_KM * 1000;
                totalLuminosityTimesArea += starLuminosity / (4 * Math.PI * Math.pow(dist_m, 2));
                totalStellarRadiation += (star.radiationOutput || 1) / (dist_au * dist_au);
            }
        }

        if (totalLuminosityTimesArea > 0) {
            equilibriumTempK = Math.pow(totalLuminosityTimesArea * (1 - albedo) / (4 * 5.67e-8), 0.25);
        }
    }

    const magneticFieldStrength = planet.magneticField?.strengthGauss || 0;
    planet.surfaceRadiation = Math.max(0, totalStellarRadiation - magneticFieldStrength);
    features['radiation_flux'] = planet.surfaceRadiation;

    const escapeVelocity = Math.sqrt(2 * G * (planet.massKg || 0) / ((planet.radiusKm || 1) * 1000)) / 1000; // in km/s
    features['escapeVelocity_kms'] = escapeVelocity;

    if (planetType === 'planet/terrestrial') {
        let hasAtmosphere = true;
        if (escapeVelocity < 3.0) hasAtmosphere = false;
        if ((features['radiation_flux'] as number) > 100 && (features['a_AU'] as number) < 0.5) hasAtmosphere = false;

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

    planet.equilibriumTempK = equilibriumTempK;

    let greenhouseContributionK = 0;
    if (planet.atmosphere && planet.atmosphere.pressure_bar) {
        let greenhouseFactor = 0;
        if (planet.atmosphere.main === 'CO2') greenhouseFactor = 0.18; // Venus-like
        else if (planet.atmosphere.main === 'CH4') greenhouseFactor = 0.05;
        else if (planet.atmosphere.main === 'N2') greenhouseFactor = 0.01;

        // A non-linear model: T_greenhouse = T_eq * (1 + pressure * factor)^0.25 - T_eq
        const tempWithGreenhouse = equilibriumTempK * Math.pow(1 + (planet.atmosphere.pressure_bar * greenhouseFactor), 0.25);
        greenhouseContributionK = tempWithGreenhouse - equilibriumTempK;
    }
    planet.greenhouseTempK = greenhouseContributionK;

    // Add heat from internal sources
    let tidalHeatingK = 0;
    if (planet.roleHint === 'moon' && host.kind === 'body') {
        const parentMassKg = (host as CelestialBody).massKg || 0;
        const eccentricity = planet.orbit?.elements.e || 0;
        const moonRadiusKm = planet.radiusKm || 0;
        const semiMajorAxisKm = (planet.orbit?.elements.a_AU || 0) * AU_KM;

        if (parentMassKg > 0 && eccentricity > 0 && moonRadiusKm > 0 && semiMajorAxisKm > 0) {
            // This formula is derived from the tidal power equation, calibrated to a user-provided example.
            // The resulting temperature from tidal flux is proportional to (M_p^0.625 * R_m^0.75 * e^0.5 * a^-1.875)
            const C = 4.06e-6; // Calibration constant

            tidalHeatingK = C * 
                (Math.pow(parentMassKg, 0.625)) * 
                (Math.pow(moonRadiusKm, 0.75)) * 
                (Math.pow(eccentricity, 0.5)) * 
                (Math.pow(semiMajorAxisKm, -1.875));
        }
    }
    planet.tidalHeatK = tidalHeatingK;

    // A small, constant amount of heat from radioactive decay for rocky worlds
    const radiogenicHeatK = (planetType === 'planet/terrestrial') ? 10 : 0;
    planet.radiogenicHeatK = radiogenicHeatK;

    features['tidalHeating'] = tidalHeatingK;
    planet.temperatureK = equilibriumTempK + greenhouseContributionK + tidalHeatingK + radiogenicHeatK;
    features['Teq_K'] = planet.temperatureK;

    const hostMass = (host.kind === 'barycenter' ? host.effectiveMassKg : (host as CelestialBody).massKg) || 0;

    const orbital_period_days = planet.orbit ? Math.sqrt(4 * Math.PI**2 * (planet.orbit.elements.a_AU * AU_KM * 1000)**3 / (G * hostMass)) / (60 * 60 * 24) : 0;
    features['orbital_period_days'] = orbital_period_days;
    planet.orbital_period_days = orbital_period_days;

    features['age_Gyr'] = age_Gyr;

    const isTidallyLocked = (features['a_AU'] as number) < 0.1 * Math.pow(hostMass / SOLAR_MASS_KG, 1/3);
    features['tidallyLocked'] = isTidallyLocked ? 1 : 0;

    planet.axial_tilt_deg = Math.pow(rng.nextFloat(), 3) * 90;
    if (orbital_period_days < 10) {
        // Heavy tidal forces from the close orbit reduce axial tilt over time
        planet.axial_tilt_deg *= 0.1;
    }

    if (isTidallyLocked) {
        planet.rotation_period_hours = orbital_period_days * 24;
    } else {
        planet.rotation_period_hours = randomFromRange(rng, 8, 48);
    }
    features['rotation_period_hours'] = planet.rotation_period_hours;

    // Disrupted planet chance
    let isDisrupted = false;
    if (features['age_Gyr'] < 0.1 && rng.nextFloat() < 0.2) { // Higher chance for young systems
        isDisrupted = true;
    } else if (rng.nextFloat() < 0.01) { // Low base chance
        isDisrupted = true;
    }
    if (isDisrupted) {
        planet.classes.push('planet/disrupted');
    }

    // --- Habitability Scores ---
    let human_habitability_score = 0;
    let alien_habitability_score = 0;

    if (planetType === 'planet/terrestrial') {
        // Human-like habitability (strict)
        const tempOk = (planet.temperatureK > 273 && planet.temperatureK < 313); // 0-40C
        const waterOk = (planet.hydrosphere?.composition === 'water' && (planet.hydrosphere?.coverage || 0) > 0.1);
        const pressureOk = (planet.atmosphere?.pressure_bar && planet.atmosphere.pressure_bar > 0.5 && planet.atmosphere.pressure_bar < 1.5);
        const atmOk = (planet.atmosphere?.main === 'N2');
        const gravityOk = ((features['mass_Me'] as number) > 0.5 && (features['mass_Me'] as number) < 1.5);

        if (tempOk && waterOk && pressureOk && atmOk && gravityOk) {
            human_habitability_score = 100;
        }

        // Alien habitability (broad)
        const alienTempOk = (planet.temperatureK > 150 && planet.temperatureK < 400);
        const liquidOk = ((planet.hydrosphere?.coverage || 0) > 0);
        const alienPressureOk = (planet.atmosphere?.pressure_bar && planet.atmosphere.pressure_bar > 0.1);
        const lowRadiation = ((features['radiation_flux'] as number) < 10);

        if (alienTempOk && liquidOk && alienPressureOk && lowRadiation) {
            alien_habitability_score = 100;
        }
    }

    features['human_habitability_score'] = human_habitability_score;
    features['alien_habitability_score'] = alien_habitability_score;

    planet.classes = classifyBody(features, pack, allNodes);

    // --- Post-Generation Transformations (e.g., Atmospheric Stripping) ---
    if (age_Gyr > 4.0 && (features['a_AU'] as number) < 0.5 && planet.classes.includes('planet/gas-giant')) {
        // This hot gas giant has been stripped over billions of years
        planet.classes = ['planet/chthonian'];
        planet.radiusKm = (planet.radiusKm || 0) * 0.2; // Drastically reduce radius
        planet.atmosphere = undefined;
        planet.hydrosphere = undefined;
    } else if ((planet.surfaceRadiation || 0) > 100 && planetType === 'planet/terrestrial') {
        // Terrestrial planet is too close to the star and has had its atmosphere stripped
        planet.atmosphere = undefined;
        planet.hydrosphere = undefined;
    } else if (planet.temperatureK && planet.temperatureK > 1000 && planetType === 'planet/terrestrial') {
        // Terrestrial planet is too hot and has had its atmosphere and hydrosphere boiled off
        planet.atmosphere = undefined;
        planet.hydrosphere = undefined;
    }

    const primaryClass = planet.classes[0];
    if (primaryClass && pack.classifier?.planetImages?.[primaryClass]) {
        planet.image = { url: pack.classifier.planetImages[primaryClass] };
    }

    newNodes.push(planet);

    if (generateChildren && planet.roleHint === 'planet') {
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
        let numMoons = moonCountTable ? weightedChoice<number>(rng, moonCountTable) : 0;

        if (isGasGiant) {
            const massInEarths = (planet.massKg || 0) / EARTH_MASS_KG;
            const scalingFactor = Math.log10(Math.max(1, massInEarths)); // Use log10 for a gentler curve
            numMoons = Math.floor(numMoons * scalingFactor);
        }

        // Calculate Roche Limit for a rigid body (simplification)
        const parentDensity = ((host as CelestialBody).massKg || 0) / (4/3 * Math.PI * Math.pow(((host as CelestialBody).radiusKm || 1) * 1000, 3));
        const moonDensity = 3344; // Approximate density of Earth's moon in kg/m^3
        const rocheLimit_km = ((host as CelestialBody).radiusKm || 1) * Math.pow(2 * (parentDensity / moonDensity), 1/3);
        
        let lastMoonApoapsisAU = rocheLimit_km / AU_KM * 1.5; // Start just outside the Roche limit

        for (let j = 0; j < numMoons; j++) {
            const moonMinGap = rocheLimit_km / AU_KM * 0.5;
            const newMoonPeriapsis = lastMoonApoapsisAU + randomFromRange(rng, moonMinGap, moonMinGap * 3);            const newMoonEccentricity = randomFromRange(rng, 0, 0.05);
            const newMoonA_AU = newMoonPeriapsis / (1 - newMoonEccentricity);
            lastMoonApoapsisAU = newMoonA_AU * (1 + newMoonEccentricity);

            const moonOrbit: Orbit = {
                hostId: planet.id,
                hostMu: G * (planet.massKg || 0),
                t0: Date.now(),
                elements: { a_AU: newMoonA_AU, e: newMoonEccentricity, i_deg: Math.pow(rng.nextFloat(), 2) * 10, omega_deg: 0, Omega_deg: 0, M0_rad: randomFromRange(rng, 0, 2 * Math.PI) }
            };
            
            const moonNodes = _generatePlanetaryBody(rng, pack, `${planet.id}-moon`, j, planet, moonOrbit, `${planet.name} ${toRoman(j + 1)}`, [...allNodes, ...newNodes], age_Gyr, undefined, true);
            newNodes.push(...moonNodes);
        }
    }

    return newNodes;
}

export function generateSystem(seed: string, pack: RulePack, __opts: Partial<GenOptions> = {}, generationChoice?: string): System {
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

  let starTypeOverride: string | undefined = undefined;
  let forceBinary: boolean | undefined = undefined;

  if (generationChoice && generationChoice !== 'Random') {
    const isBinarySelection = generationChoice.endsWith(' Binary');
    const type = generationChoice.replace('Type ', 'star/').replace(' Binary', '');
    starTypeOverride = type;
    forceBinary = isBinarySelection;
  }

  const starA = _generateStar(`${seed}-star-a`, null, pack, rng, starTypeOverride);
  const starClass = starA.classes[0].split('/')[1]; // e.g., "G2V" -> "G"

  let isBinary = forceBinary ?? false;
  if (forceBinary === undefined) { // Only use random chance if user didn't specify
    if (['O', 'B'].includes(starClass)) {
        isBinary = weightedChoice<boolean>(rng, pack.distributions['is_binary_chance_massive']);
    } else if (['A', 'F', 'G', 'K'].includes(starClass)) {
        isBinary = weightedChoice<boolean>(rng, pack.distributions['is_binary_chance_sunlike']);
    } else { // M, WD, etc.
        isBinary = weightedChoice<boolean>(rng, pack.distributions['is_binary_chance_lowmass']);
    }
  }

  if (!isBinary) {
    starA.name = baseName;
    nodes.push(starA);
    systemRoot = starA;
    systemName = starA.name;
    totalMassKg = starA.massKg || 0;
    rootRadiusKm = starA.radiusKm || 0;

    if (starA.classes.includes('star/BH_active')) {
        const ring: CelestialBody = {
            id: `${starA.id}-accretion-disk`,
            parentId: starA.id,
            name: `${starA.name} Accretion Disk`,
            kind: 'body',
            roleHint: 'ring',
            classes: ['ring/accretion_disk'],
            radiusInnerKm: (starA.radiusKm || 0) * 1.1,
            radiusOuterKm: (starA.radiusKm || 0) * randomFromRange(rng, 5, 20),
            tags: [],
            areas: [],
        };
        nodes.push(ring);
    }
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

    const system_age_Gyr = randomFromRange(rng, 0.1, 10.0);
  
    if (!isBinary) {
      let lastApoapsisAU = (rootRadiusKm / AU_KM) + 0.1;
      for (let i = 0; i < numBodies; i++) {
          const minGap = 0.2;
          const newPeriapsis = lastApoapsisAU + randomFromRange(rng, minGap, minGap * 5);
          const maxEccentricity = (system_age_Gyr > 5) ? 0.1 : 0.15;
          const newEccentricity = randomFromRange(rng, 0.01, maxEccentricity);
                  const newA_AU = newPeriapsis / (1 - newEccentricity);
                  lastApoapsisAU = newA_AU * (1 + newEccentricity);
          
                  const orbit: Orbit = {
                      hostId: systemRoot.id,
                      hostMu: G * totalMassKg,
                      t0: Date.now(),
                      elements: { a_AU: newA_AU, e: newEccentricity, i_deg: Math.pow(rng.nextFloat(), 3) * 15, omega_deg: 0, Omega_deg: 0, M0_rad: randomFromRange(rng, 0, 2 * Math.PI) }
                  };
          const newNodes = _generatePlanetaryBody(rng, pack, seed, i, systemRoot, orbit, `${systemName} ${String.fromCharCode(98 + i)}`, nodes, system_age_Gyr, undefined, true);
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
  
          const maxEccentricity = (system_age_Gyr > 5) ? 0.1 : 0.15;
          const newEccentricity = randomFromRange(rng, 0.01, maxEccentricity);
                  const newA_AU = newPeriapsis / (1 - newEccentricity);
                  const newApoapsis = newA_AU * (1 + newEccentricity);
          
                  const orbit: Orbit = {
                      hostId: host.id,
                      hostMu: G * hostMassKg,
                      t0: Date.now(),
                      elements: { a_AU: newA_AU, e: newEccentricity, i_deg: Math.pow(rng.nextFloat(), 3) * 15, omega_deg: 0, Omega_deg: 0, M0_rad: randomFromRange(rng, 0, 2 * Math.PI) }
                  };  
          const newNodes = _generatePlanetaryBody(rng, pack, seed, i, host, orbit, `${planetNamePrefix}${toRoman(i + 1)}`, nodes, system_age_Gyr, undefined, true);
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
      age_Gyr: system_age_Gyr,
      nodes: nodes,
      rulePackId: pack.id,
      rulePackVersion: pack.version,
      tags: [],
    };
  return system;
}

export function deleteNode(sys: System, nodeId: ID): System {
    const nodesToDelete = new Set<ID>([nodeId]);
    let changed = true;
    while (changed) {
        changed = false;
        sys.nodes.forEach(node => {
            if (node.parentId && nodesToDelete.has(node.parentId) && !nodesToDelete.has(node.id)) {
                nodesToDelete.add(node.id);
                changed = true;
            }
        });
    }

    const newSystem = {
        ...sys,
        nodes: sys.nodes.filter(node => !nodesToDelete.has(node.id))
    };

    return newSystem;
}

export function getValidPlanetTypesForHost(host: CelestialBody | Barycenter, pack: RulePack): string[] {
    if (!pack.statTemplates) return [];

    const hostMass = (host.kind === 'barycenter' ? host.effectiveMassKg : (host as CelestialBody).massKg) || 0;
    
    // If host is a planet/moon, we can only add moons.
    if (host.kind === 'body' && ((host as CelestialBody).roleHint === 'planet' || (host as CelestialBody).roleHint === 'moon')) {
        return Object.keys(pack.statTemplates).filter(key => {
            if (!key.startsWith('planet/')) return false; // Only allow planet types
            
            const template = pack.statTemplates![key];
            // A moon's max mass should be significantly less than the parent's mass.
            // Let's use the template's max mass and check if it's less than, say, 10% of the host's mass.
            const maxMassEarths = template.mass_earth[1];
            const maxMassKg = maxMassEarths * EARTH_MASS_KG;

            return maxMassKg < hostMass * 0.1;
        });
    } 
    // If host is a star or barycenter, we can add any planet.
    else {
        return Object.keys(pack.statTemplates).filter(key => key.startsWith('planet/'));
    }
}

export function addPlanetaryBody(sys: System, hostId: ID, planetType: string, pack: RulePack): System {
    const rng = new SeededRNG(sys.seed + Date.now()); // Use a new RNG seed to avoid determinism issues
    const host = sys.nodes.find(n => n.id === hostId);
    if (!host) throw new Error(`Host with id ${hostId} not found.`);

    const hostMass = (host.kind === 'barycenter' ? host.effectiveMassKg : (host as CelestialBody).massKg) || 0;
    if (hostMass === 0) throw new Error(`Host ${hostId} has no mass.`);

    // 1. Find a valid orbit
    const children = sys.nodes.filter(n => n.parentId === hostId && n.kind === 'body') as CelestialBody[];
    let lastApoapsisAU = 0;

    if (children.length > 0) {
        children.forEach(child => {
            if (child.orbit) {
                const apoapsis = child.orbit.elements.a_AU * (1 + child.orbit.elements.e);
                if (apoapsis > lastApoapsisAU) {
                    lastApoapsisAU = apoapsis;
                }
            }
        });
    } else if (host.kind === 'body') {
        // If no children, start just outside the host's Roche limit
        const parentDensity = (host.massKg || 0) / (4/3 * Math.PI * Math.pow((host.radiusKm || 1) * 1000, 3));
        const moonDensity = 3344; // Approximate density of Earth's moon
        const rocheLimit_km = (host.radiusKm || 1) * Math.pow(2 * (parentDensity / moonDensity), 1/3);
        lastApoapsisAU = rocheLimit_km / AU_KM * 1.5;
    } else {
        // Fallback for barycenters or other non-body hosts
        lastApoapsisAU = ((host as CelestialBody).radiusKm || 0) / AU_KM;
    }

    const minGap = (lastApoapsisAU > 0) ? lastApoapsisAU * 0.2 : 0.1;
    const newPeriapsis = lastApoapsisAU + randomFromRange(rng, minGap, minGap * 5);
    const newEccentricity = randomFromRange(rng, 0.01, 0.15);
    const newA_AU = newPeriapsis / (1 - newEccentricity);

    const orbit: Orbit = {
        hostId: hostId,
        hostMu: G * hostMass,
        t0: Date.now(),
        elements: { 
            a_AU: newA_AU, 
            e: newEccentricity, 
            i_deg: Math.pow(rng.nextFloat(), 3) * 15, 
            omega_deg: 0, 
            Omega_deg: 0, 
            M0_rad: randomFromRange(rng, 0, 2 * Math.PI) 
        }
    };

    const siblings = sys.nodes.filter(n => n.parentId === hostId);
    const name = ((host as CelestialBody).roleHint === 'star' || host.kind === 'barycenter') 
        ? `${host.name} ${String.fromCharCode(98 + siblings.length)}`
        : `${host.name} ${toRoman(siblings.length + 1)}`;

    const newNodes = _generatePlanetaryBody(rng, pack, `${sys.seed}-custom`, siblings.length, host, orbit, name, sys.nodes, sys.age_Gyr, planetType, false);
    
    const newSystem = {
        ...sys,
        nodes: [...sys.nodes, ...newNodes]
    };

    return newSystem;
}

export function renameNode(sys: System, nodeId: ID, newName: string): System {
    const nodes = JSON.parse(JSON.stringify(sys.nodes));
    const targetNode = nodes.find((n: CelestialBody | Barycenter) => n.id === nodeId);

    if (!targetNode) return sys;

    const oldName = targetNode.name;
    targetNode.name = newName;
    targetNode.isNameUserDefined = true;

    const queue: { parentOldName: string, parentNewName: string, parentId: ID }[] = [{ parentOldName: oldName, parentNewName: newName, parentId: nodeId }];

    while (queue.length > 0) {
        const { parentOldName, parentNewName, parentId } = queue.shift()!;

        nodes.filter((n: CelestialBody | Barycenter) => n.parentId === parentId).forEach((child: CelestialBody | Barycenter) => {
            if ((child as CelestialBody).isNameUserDefined) {
                return; // Stop propagation
            }

            const oldChildName = child.name;
            // This replacement is based on the assumption that the child's auto-generated name contains the parent's name.
            const newChildName = oldChildName.replace(parentOldName, parentNewName);
            child.name = newChildName;

            queue.push({ parentOldName: oldChildName, parentNewName: newChildName, parentId: child.id });
        });
    }

    let systemName = sys.name;
    if (targetNode.parentId === null) {
        systemName = newName;
    }

    return { ...sys, name: systemName, nodes: nodes };
}

export function rerollNode(__sys: System, __nodeId: ID, __pack: RulePack): System {
  // TODO M0: respect lock flags (future), re-generate subtree deterministically
  throw new Error("TODO: implement rerollNode (M0)");
}

// Helper function to recursively evaluate classifier expressions
function evaluateExpr(features: Record<string, number | string>, expr: Expr): boolean {
    if (expr.all) return expr.all.every((e: Expr) => evaluateExpr(features, e));
    if (expr.any) return expr.any.some((e: Expr) => evaluateExpr(features, e));
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

export function classifyBody(features: Record<string, number | string>, pack: RulePack, allNodes: (CelestialBody | Barycenter)[]): string[] {
  if (!pack.classifier) return [];

    const planetId = features['id'] as string;
    const hasRing = allNodes.some(n => n.parentId === planetId && n.kind === 'body' && (n as CelestialBody).roleHint === 'ring');
    features['has_ring_child'] = hasRing ? 1 : 0;

    const scores: Record<string, number> = {};

    for (const rule of pack.classifier.rules) {
        if (evaluateExpr(features, rule.when)) {
            scores[rule.addClass] = (scores[rule.addClass] || 0) + rule.score;
        }
    }

    const sortedClasses = Object.entries(scores)
        .filter(([, score]) => score >= (pack.classifier?.minScore || 10))
        .sort((a, b) => b[1] - a[1]);

    // Start with the most likely class, but also add generic fallbacks.
    const primaryClass = sortedClasses.slice(0, pack.classifier?.maxClasses || 2).map(([className]) => className);
    if (primaryClass.length === 0) {
        if ((features['mass_Me'] as number) > 10) {
            primaryClass.push('planet/gas-giant');
        } else {
            primaryClass.push('planet/terrestrial');
        }
    }
    return primaryClass;
}

export function computePlayerSnapshot(sys: System, _scopeRootId?: ID): System {
  const playerSystem = JSON.parse(JSON.stringify(sys)); // Deep copy to avoid modifying the original

  // TODO: Implement scoping by scopeRootId

  playerSystem.nodes = playerSystem.nodes.map((node: CelestialBody | Barycenter) => {
      // Remove GM-only fields
      delete (node as any).gmNotes;

      // Field-level visibility (not yet implemented in generator)
      if ((node as any).visibility?.fields) {
          for (const [field, isVisible] of Object.entries((node as any).visibility.fields)) {
              if (!isVisible) {
                  delete (node as any)[field];
              }
          }
      }
      return node;
  }).filter((node: CelestialBody | Barycenter) => (node as any).visibility?.visibleToPlayers !== false);

  // Also filter from the top-level system object
  delete (playerSystem as any).gmNotes;

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

export function applyImpulsiveBurn(__body: CelestialBody, __burn: BurnPlan, __sys: System): CelestialBody {
  // TODO M6: apply Δv in perifocal frame; recompute elements via Gauss equations
  throw new Error("TODO: implement applyImpulsiveBurn (M6)");
}