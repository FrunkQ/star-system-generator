// src/lib/generation/planet.ts
import type { CelestialBody, Barycenter, RulePack, Orbit } from '../types';
import { SeededRNG } from '../rng';
import { weightedChoice, randomFromRange, toRoman } from '../utils';
import { G, AU_KM, EARTH_MASS_KG, EARTH_RADIUS_KM, SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '../constants';
import { classifyBody } from '../system/classification';

export function _generatePlanetaryBody(
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
    generateChildren: boolean = true,
    propertyOverrides?: Partial<CelestialBody>
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
        ...propertyOverrides,
    };

    const planetType = ((planet.roleHint === 'moon') 
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
    if (host.age_Gyr > 4.0 && (features['a_AU'] as number) < 0.5 && planet.classes.includes('planet/gas-giant')) {
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
