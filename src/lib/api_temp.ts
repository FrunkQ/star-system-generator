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
    let radiationOutput = 1;

    if (starTemplate) {
        starMassKg = randomFromRange(rng, starTemplate.mass_solar[0], starTemplate.mass_solar[1]) * SOLAR_MASS_KG;
        starRadiusKm = randomFromRange(rng, starTemplate.radius_solar[0], starTemplate.radius_solar[1]) * SOLAR_RADIUS_KM;
        starTemperatureK = randomFromRange(rng, starTemplate.temp_k[0], starTemplate.temp_k[1]);
        if (starTemplate.mag_gauss) {
            starMagneticField = { strengthGauss: randomFromRange(rng, starTemplate.mag_gauss[0], starTemplate.mag_gauss[1]) };
        }
        if (starTemplate.radiation_output) {
            radiationOutput = randomFromRange(rng, starTemplate.radiation_output[0], starTemplate.radiation_output[1]);
        }
    }

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
        radiationLevel: radiationOutput, // Star's own emission
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

        if (planet.roleHint === 'moon' && host.kind === 'body') {
            const parentMass = (host as CelestialBody).massKg || 0;
            const parentRadius = (host as CelestialBody).radiusKm || 0;
            planet.massKg = Math.min(planet.massKg, parentMass * 0.05);
            planet.radiusKm = Math.min(planet.radiusKm, parentRadius * 0.5);
        }

        if (planetType === 'planet/gas-giant' && planetTemplate.mag_gauss) {
            planet.magneticField = { strengthGauss: randomFromRange(rng, planetTemplate.mag_gauss[0], planetTemplate.mag_gauss[1]) };
        }
    }

    // --- Feature Calculation & Property Assignment ---
    const features: Record<string, number | string> = { id: planetId };
    if (planet.massKg) features['mass_Me'] = planet.massKg / EARTH_MASS_KG;
    if (planet.radiusKm) features['radius_Re'] = planet.radiusKm / EARTH_RADIUS_KM;
    if (planet.orbit) features['a_AU'] = planet.orbit.elements.a_AU;

    // --- Radiation & Magnetosphere ---
    let ultimateHost = allNodes.find(n => n.id === orbit.hostId);
    while(ultimateHost && ultimateHost.parentId) {
        const nextHost = allNodes.find(n => n.id === ultimateHost!.parentId);
        if (nextHost) ultimateHost = nextHost; else break;
    }

    let primaryStar: CelestialBody | undefined;
    if (ultimateHost?.kind === 'body') primaryStar = ultimateHost as CelestialBody;
    if (ultimateHost?.kind === 'barycenter') primaryStar = allNodes.find(n => n.id === ultimateHost.memberIds[0]) as CelestialBody;

    let radiationFromStar = 0;
    if (primaryStar && primaryStar.roleHint === 'star') {
        const starRadiation = primaryStar.radiationLevel || 1;
        const planetDist_AU = (planet.roleHint === 'moon' && (host as CelestialBody).orbit) ? (host as CelestialBody).orbit!.elements.a_AU : planet.orbit!.elements.a_AU;
        radiationFromStar = starRadiation / Math.pow(planetDist_AU, 2);
    }

    let radiationFromParent = 0;
    if (planet.roleHint === 'moon' && host.kind === 'body') {
        const parentMag = (host as CelestialBody).magneticField?.strengthGauss || 0;
        radiationFromParent = parentMag / Math.pow(planet.orbit!.elements.a_AU * 1000, 2); // Scale down for close orbits
    }
    planet.radiationLevel = radiationFromStar + radiationFromParent;

    if (planetType === 'planet/terrestrial' && !planet.magneticField) {
        if ((planet.massKg || 0) > 0.5 * EARTH_MASS_KG && (planet.rotation_period_hours || 100) < 30) {
            const strength = randomFromRange(rng, 0.1, 1.5);
            planet.magneticField = { strengthGauss: strength };
        }
    }

    // --- Atmosphere Generation & Stripping ---
    const escapeVelocity = Math.sqrt(2 * G * (planet.massKg || 0) / ((planet.radiusKm || 1) * 1000)) / 1000; // in km/s
    features['escapeVelocity_kms'] = escapeVelocity;

    if (planetType === 'planet/terrestrial') {
        let hasAtmosphere = true;
        if (escapeVelocity < 1.0) hasAtmosphere = false;

        if (hasAtmosphere) {
            const pressureRange = weightedChoice<[number, number]>(rng, pack.distributions['atmosphere_pressure_bar']);
            const atmComp = weightedChoice<{main: string, secondary: string}>(rng, pack.distributions['atmosphere_composition']);
            planet.atmosphere = {
                pressure_bar: randomFromRange(rng, pressureRange[0], pressureRange[1]),
                main: atmComp.main,
                composition: { [atmComp.main]: 0.8, [atmComp.secondary]: 0.2 },
                status: 'present'
            };
        }

        // Atmosphere stripping logic
        const magProtection = planet.magneticField?.strengthGauss || 0;
        if (planet.atmosphere && (planet.radiationLevel || 0) > 10 && magProtection < 0.5 && escapeVelocity < 5.0) {
            planet.atmosphere.status = 'stripped';
            planet.atmosphere.pressure_bar = 0;
        }

        const hydroCoverageRange = weightedChoice<[number, number]>(rng, pack.distributions['hydrosphere_coverage']);
        planet.hydrosphere = {
            coverage: randomFromRange(rng, hydroCoverageRange[0], hydroCoverageRange[1]),
            composition: weightedChoice<string>(rng, pack.distributions['hydrosphere_composition'])
        };
    }

    // --- Temperature Calculation ---
    let equilibriumTempK = 0;
    if (primaryStar && primaryStar.roleHint === 'star') {
        const albedo = 0.3; // Placeholder albedo
        const starTemp = primaryStar.temperatureK || 5778;
        const starRadius_AU = (primaryStar.radiusKm || SOLAR_RADIUS_KM) / AU_KM;
        const planetDist_AU = (planet.roleHint === 'moon' && (host as CelestialBody).orbit) ? (host as CelestialBody).orbit!.elements.a_AU : planet.orbit!.elements.a_AU;

        if (planetDist_AU > 0) {
            equilibriumTempK = starTemp * Math.sqrt(starRadius_AU / (2 * planetDist_AU)) * Math.pow(1 - albedo, 0.25);
        }
    }
    planet.equilibriumTempK = equilibriumTempK;

    let greenhouseContributionK = 0;
    if (planet.atmosphere && planet.atmosphere.status === 'present' && planet.atmosphere.pressure_bar) {
        let greenhouseFactor = 0;
        if (planet.atmosphere.main === 'CO2') greenhouseFactor = 0.18;
        else if (planet.atmosphere.main === 'CH4') greenhouseFactor = 0.05;
        else if (planet.atmosphere.main === 'N2') greenhouseFactor = 0.01;
        const tempWithGreenhouse = equilibriumTempK * Math.pow(1 + (planet.atmosphere.pressure_bar * greenhouseFactor), 0.25);
        greenhouseContributionK = tempWithGreenhouse - equilibriumTempK;
    }
    planet.greenhouseTempK = greenhouseContributionK;

    let tidalHeatingK = 0;
    if (planet.roleHint === 'moon' && host.kind === 'body') {
        const parentMassKg = (host as CelestialBody).massKg || 0;
        const eccentricity = planet.orbit?.elements.e || 0;
        const moonRadiusM = (planet.radiusKm || 0) * 1000;
        const semiMajorAxisM = (planet.orbit?.elements.a_AU || 0) * AU_KM * 1000;

        if (parentMassKg > 0 && eccentricity > 0 && moonRadiusM > 0 && semiMajorAxisM > 0) {
            const k2_Q = 1e-2;
            const n = Math.sqrt(G * parentMassKg / Math.pow(semiMajorAxisM, 3));
            const powerW = (21 / 2) * k2_Q * Math.pow(n, 5) * Math.pow(moonRadiusM, 5) * Math.pow(eccentricity, 2) / G;
            const SIGMA = 5.670374e-8;
            const surfaceArea = 4 * Math.PI * Math.pow(moonRadiusM, 2);
            const flux = powerW / surfaceArea;
            if (flux > 0) {
                const tempFromTides = Math.pow(flux / SIGMA, 0.25);
                tidalHeatingK = Math.min(tempFromTides, 2500);
            }
        }
    }
    planet.tidalHeatK = tidalHeatingK;

    const radiogenicHeatK = (planetType === 'planet/terrestrial') ? 10 : 0;
    planet.radiogenicHeatK = radiogenicHeatK;

    planet.temperatureK = equilibriumTempK + greenhouseContributionK + tidalHeatingK + radiogenicHeatK;
    
    // --- Final Properties ---
    features['Teq_K'] = planet.temperatureK;
    features['tidalHeating'] = tidalHeatingK;
    features['radiation'] = planet.radiationLevel;
    features['magnetosphere'] = planet.magneticField?.strengthGauss || 0;
    if (planet.atmosphere) {
        features['atm.main'] = planet.atmosphere.main || '';
        features['atm.pressure_bar'] = planet.atmosphere.pressure_bar || 0;
    }
    if (planet.hydrosphere) {
        features['hydrosphere.coverage'] = planet.hydrosphere.coverage || 0;
    }

    const hostMass = (host.kind === 'barycenter' ? host.effectiveMassKg : (host as CelestialBody).massKg) || 0;
    const orbital_period_days = planet.orbit ? Math.sqrt(4 * Math.PI**2 * (planet.orbit.elements.a_AU * AU_KM * 1000)**3 / (G * hostMass)) / (60 * 60 * 24) : 0;
    features['orbital_period_days'] = orbital_period_days;
    planet.orbital_period_days = orbital_period_days;

    features['age_Gyr'] = age_Gyr;

    const isTidallyLocked = (features['a_AU'] as number) < 0.1 * Math.pow(hostMass / SOLAR_MASS_KG, 1/3);
    features['tidallyLocked'] = isTidallyLocked ? 1 : 0;

    planet.axial_tilt_deg = Math.pow(rng.nextFloat(), 3) * 90;
    if (isTidallyLocked) {
        planet.rotation_period_hours = orbital_period_days * 24;
    } else {
        planet.rotation_period_hours = randomFromRange(rng, 8, 48);
    }
    features['rotation_period_hours'] = planet.rotation_period_hours;

    // --- Habitability Classification ---
    if (planetType === 'planet/terrestrial' && planet.atmosphere?.status !== 'stripped') {
        const tempK = planet.temperatureK || 0;
        const pressure = planet.atmosphere?.pressure_bar || 0;
        const hasWater = planet.hydrosphere?.composition === 'water' && (planet.hydrosphere?.coverage || 0) > 0;
        const gravity = (features['mass_Me'] as number) / Math.pow((features['radius_Re'] as number), 2) || 0;
        const radiation = planet.radiationLevel || 0;

        // 1. Earth-like (strictest)
        const tempEarth = (tempK > 283 && tempK < 303); // 10-30C
        const pressureEarth = (pressure > 0.8 && pressure < 1.2);
        const atmEarth = (planet.atmosphere?.main === 'N2');
        const gravityEarth = (gravity > 0.8 && gravity < 1.2);
        const radiationEarth = (radiation < 2);
        if (tempEarth && pressureEarth && hasWater && atmEarth && gravityEarth && radiationEarth) {
            planet.habitability = 'earth-like';
            planet.hasBiosphere = true;
        }
        // 2. Human Habitable (less strict)
        else {
            const tempHuman = (tempK > 263 && tempK < 313); // -10-40C
            const pressureHuman = (pressure > 0.5 && pressure < 1.5);
            const atmHuman = (planet.atmosphere?.main === 'N2');
            const gravityHuman = (gravity > 0.5 && gravity < 1.5);
            const radiationHuman = (radiation < 10);
            if (tempHuman && pressureHuman && hasWater && atmHuman && gravityHuman && radiationHuman) {
                planet.habitability = 'human-habitable';
                planet.hasBiosphere = true;
            }
            // 3. Alien Habitable (broadest)
            else {
                const liquidMethane = (planet.hydrosphere?.composition === 'methane' && (planet.hydrosphere?.coverage || 0) > 0 && tempK < 120);
                const liquidAmmonia = (planet.hydrosphere?.composition === 'ammonia' && (planet.hydrosphere?.coverage || 0) > 0 && tempK < 240);
                const radiationAlien = (radiation < 50);
                if (radiationAlien && (hasWater || liquidMethane || liquidAmmonia)) {
                    planet.habitability = 'alien-habitable';
                    planet.hasBiosphere = true;
                }
            }
        }
    }

    features['habitability'] = planet.habitability || 'none';

    // --- Classification ---
    planet.classes = classifyBody(features, pack, allNodes);
    const primaryClass = planet.classes[0];
    if (primaryClass && pack.classifier?.planetImages?.[primaryClass]) {
        planet.image = { url: pack.classifier.planetImages[primaryClass] };
    }

    newNodes.push(planet);

    // --- Child Object Generation ---
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
        const numMoons = moonCountTable ? weightedChoice<number>(rng, moonCountTable) : 0;
        let lastMoonApoapsisAU = (planet.radiusKm || 0) / AU_KM * 1.5;

        for (let j = 0; j < numMoons; j++) {
            const moonMinGap = (planet.radiusKm || 0) / AU_KM * 1.2;
            const newMoonPeriapsis = lastMoonApoapsisAU + randomFromRange(rng, moonMinGap, moonMinGap * 3);
            const newMoonEccentricity = randomFromRange(rng, 0, 0.05);
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

// ... (rest of file is the same)
  
