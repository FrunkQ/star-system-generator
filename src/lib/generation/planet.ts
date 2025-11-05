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
    let planet: CelestialBody = {
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

    const frostLineAU = (pack.generation_parameters?.frost_line_base_au || 2.7) * Math.sqrt((host.massKg || SOLAR_MASS_KG) / SOLAR_MASS_KG);
    const migrationChance = pack.generation_parameters?.planet_migration_chance || 0.1;

    let planetType = planetTypeOverride;
    if (!planetType) {
        if (orbit.elements.a_AU > frostLineAU) {
            planetType = weightedChoice<string>(rng, { entries: [{ weight: 40, value: 'planet/gas-giant' }, { weight: 30, value: 'planet/ice-giant' }, { weight: 30, value: 'planet/terrestrial' }] });
        } else {
            planetType = weightedChoice<string>(rng, { entries: [{ weight: 80, value: 'planet/terrestrial' }, { weight: 10, value: 'planet/gas-giant' }, { weight: 10, value: 'planet/ice-giant' }] });
        }
    }

    if (planet.roleHint === 'moon') {
        planetType = 'planet/terrestrial';
    }

    const planetTemplate = pack.statTemplates?.[planetType];
    if (planetTemplate) {
        if (!propertyOverrides?.massKg) {
            planet.massKg = randomFromRange(rng, planetTemplate.mass_earth[0], planetTemplate.mass_earth[1]) * EARTH_MASS_KG;
        }
        if (!propertyOverrides?.radiusKm) {
            planet.radiusKm = randomFromRange(rng, planetTemplate.radius_earth[0], planetTemplate.radius_earth[1]) * EARTH_RADIUS_KM;
        }
        
        if (!propertyOverrides?.magneticField) {
            const magneticFieldChance = pack.generation_parameters?.terrestrial_magnetic_field_chance || 0.8;
            if (planetType === 'planet/terrestrial' && planet.massKg > 0.1 * EARTH_MASS_KG && rng.nextFloat() < magneticFieldChance) {
                 planet.magneticField = { strengthGauss: randomFromRange(rng, 0.1, 1.5) };
            } else if (planetTemplate.mag_gauss) {
                planet.magneticField = { strengthGauss: randomFromRange(rng, planetTemplate.mag_gauss[0], planetTemplate.mag_gauss[1]) };
            }
        }

        if (planet.roleHint === 'moon' && host.kind === 'body') {
            const parentMass = (host as CelestialBody).massKg || 0;
            const parentRadius = (host as CelestialBody).radiusKm || 0;
            planet.massKg = Math.min(planet.massKg, parentMass * 0.05);
            planet.radiusKm = Math.min(planet.radiusKm, parentRadius * 0.5);
        }
    }

    if (rng.nextFloat() < migrationChance && planetType === 'planet/gas-giant') {
        const newA_AU = randomFromRange(rng, 0.1, 0.5);
        planet.orbit.elements.a_AU = newA_AU;
        planet.tags.push({ key: 'Migrated Planet' });
    }

    if (propertyOverrides) {
        planet = { ...planet, ...propertyOverrides };
    }

    if (planet.orbit?.isRetrogradeOrbit) {
        planet.tags.push({ key: 'Captured Body' });
        planet.tags.push({ key: 'Retrograde Orbit' });
    }

    // --- Feature Calculation & Property Assignment ---
    const features: Record<string, number | string> = { id: planetId };
    if (planet.massKg) features['mass_Me'] = planet.massKg / EARTH_MASS_KG;
    if (planet.radiusKm) features['radius_Re'] = planet.radiusKm / EARTH_RADIUS_KM;
    if (planet.orbit) features['a_AU'] = planet.orbit.elements.a_AU;

    // Find all stars in the system for radiation calculation
    const allStars = allNodes.filter(n => n.kind === 'body' && n.roleHint === 'star') as CelestialBody[];

    let totalStellarRadiation = 0;
    let equilibriumTempK = propertyOverrides?.equilibriumTempK || 0;
    if (!propertyOverrides?.equilibriumTempK) {

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
    }
    const magneticFieldStrength = planet.magneticField?.strengthGauss || 0;
    planet.surfaceRadiation = Math.max(0, totalStellarRadiation - magneticFieldStrength);
    features['radiation_flux'] = planet.surfaceRadiation;

    const escapeVelocity = Math.sqrt(2 * G * (planet.massKg || 0) / ((planet.radiusKm || 1) * 1000)) / 1000; // in km/s
    features['escapeVelocity_kms'] = escapeVelocity;



    if (planet.hydrosphere) {
        features['hydrosphere.coverage'] = planet.hydrosphere.coverage;
        features['hydrosphere.composition'] = planet.hydrosphere.composition;
    }

    planet.equilibriumTempK = equilibriumTempK;

    let greenhouseContributionK = propertyOverrides?.greenhouseTempK || 0;
    if (!propertyOverrides?.greenhouseTempK && planet.atmosphere) {
        const atmDef = pack.distributions.atmosphere_composition.entries.find(e => e.value.name === planet.atmosphere.name)?.value;
        if (atmDef && atmDef.greenhouse_effect_K) {
            const nominalPressure = atmDef.pressure_range_bar ? (atmDef.pressure_range_bar[0] + atmDef.pressure_range_bar[1]) / 2 : 1;
            const pressureRatio = planet.atmosphere.pressure_bar / nominalPressure;
            greenhouseContributionK = atmDef.greenhouse_effect_K * pressureRatio;
        }
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



    if (propertyOverrides?.atmosphere) {
        features['atm.main'] = propertyOverrides.atmosphere.main;
        features['atm.pressure_bar'] = propertyOverrides.atmosphere.pressure_bar;
        for (const gas in propertyOverrides.atmosphere.composition) {
            features[`atm.composition.${gas}`] = propertyOverrides.atmosphere.composition[gas];
        }
    } else {
        _generateAtmosphere(rng, pack, planet, features, planetType);
    }

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

    // --- Habitability & Biosphere ---
    calculateHabitabilityAndBiosphere(planet, rng);


    planet.classes = classifyBody(planet, features, pack, allNodes);

    const primaryClass = planet.classes[0];
    if (primaryClass && pack.classifier?.planetImages?.[primaryClass]) {
        planet.image = { url: pack.classifier.planetImages[primaryClass] };
    }

    newNodes.push(planet);

    if (generateChildren && planet.roleHint === 'planet') {
        const isGiant = planet.classes.includes('planet/gas-giant') || planet.classes.includes('planet/ice-giant');
        const ringChanceTable = pack.distributions[isGiant ? 'gas_giant_ring_chance' : 'terrestrial_ring_chance'];
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

        const moonCountTable = pack.distributions[isGiant ? 'gas_giant_moon_count' : 'terrestrial_moon_count'];
        let numMoons = moonCountTable ? weightedChoice<number>(rng, moonCountTable) : 0;

        if (isGiant) {
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

            if (weightedChoice<boolean>(rng, pack.distributions['retrograde_orbit_chance_moon'])) {
                moonOrbit.isRetrogradeOrbit = true;
            }
            
            const moonNodes = _generatePlanetaryBody(rng, pack, `${planet.id}-moon`, j, planet, moonOrbit, `${planet.name} ${toRoman(j + 1)}`, [...allNodes, ...newNodes], age_Gyr, undefined, true);
            newNodes.push(...moonNodes);
        }
    }

    return newNodes;
}

function calculateHabitabilityAndBiosphere(planet: CelestialBody, rng: SeededRNG) {
    if (planet.roleHint !== 'planet' && planet.roleHint !== 'moon') return;

    const scoreFromRange = (value: number, optimal: number, range: number) => {
        const diff = Math.abs(value - optimal);
        return Math.max(0, 1 - (diff / range));
    };

    let score = 0;
    let factors = {
        temp: 0,
        pressure: 0,
        solvent: 0,
        radiation: 0,
        gravity: 0
    };

    // Temperature Score (Max 30 points)
    if (planet.temperatureK) {
        if (planet.hydrosphere?.composition === 'water' || !planet.hydrosphere) {
            factors.temp = scoreFromRange(planet.temperatureK, 288, 50); // Optimal 15C, range +/- 50C
        } else if (planet.hydrosphere?.composition === 'methane') {
            factors.temp = scoreFromRange(planet.temperatureK, 111, 30); // Optimal -162C, range +/- 30C
        } else if (planet.hydrosphere?.composition === 'ammonia') {
            factors.temp = scoreFromRange(planet.temperatureK, 218, 30); // Optimal -55C, range +/- 30C
        }
    }
    score += factors.temp * 30;

    // Pressure Score (Max 20 points)
    if (planet.atmosphere?.pressure_bar) {
        factors.pressure = scoreFromRange(planet.atmosphere.pressure_bar, 1, 2);
    }
    score += factors.pressure * 20;

    // Solvent Score (Max 20 points)
    if ((planet.hydrosphere?.coverage || 0) > 0.1) {
        factors.solvent = 1;
        if (planet.hydrosphere?.composition === 'water') {
            score += 5; // Bonus for water
        }
    }
    score += factors.solvent * 15;

    // Radiation Score (Max 15 points)
    factors.radiation = scoreFromRange(planet.surfaceRadiation || 0, 0, 10);
    score += factors.radiation * 15;

    // Gravity Score (Max 15 points)
    const surfaceGravityG = (planet.massKg && planet.radiusKm) ? (G * planet.massKg / ((planet.radiusKm*1000) * (planet.radiusKm*1000))) / 9.81 : 0;
    if (surfaceGravityG > 0) {
        factors.gravity = scoreFromRange(surfaceGravityG, 1, 1.5);
    }
    score += factors.gravity * 15;
    
    planet.habitabilityScore = Math.max(0, Math.min(100, score));

    // Determine Tier and add Tag
    const isEarthLike = factors.temp > 0.9 && factors.pressure > 0.8 && factors.solvent === 1 && planet.hydrosphere?.composition === 'water' && factors.radiation > 0.9 && factors.gravity > 0.8 && planet.atmosphere?.composition?.['O2'] > 0.1;
    const isHumanHabitable = factors.temp > 0.7 && factors.pressure > 0.6 && factors.solvent === 1 && planet.hydrosphere?.composition === 'water' && factors.radiation > 0.7 && factors.gravity > 0.6;
    const isAlienHabitable = score > 40;

    let tier: string;
    if (isEarthLike) tier = 'habitability/earth-like';
    else if (isHumanHabitable) tier = 'habitability/human';
    else if (isAlienHabitable) tier = 'habitability/alien';
    else tier = 'habitability/none';
    planet.tags.push({ key: tier });

    // --- Biosphere Generation ---
    if (rng.nextFloat() < (planet.habitabilityScore / 100)) {
        const morphologies: ('microbial' | 'fungal' | 'flora' | 'fauna')[] = ['microbial'];
        
        if (planet.habitabilityScore > 60) {
            morphologies.push('flora');
            if (rng.nextFloat() < 0.5) {
                morphologies.push('fungal');
            }
        }
        if (planet.habitabilityScore > 85 && morphologies.includes('flora')) {
            morphologies.push('fauna');
        }

        let biochemistry: 'water-carbon' | 'ammonia-silicon' | 'methane-carbon' = 'water-carbon';
        if (planet.hydrosphere?.composition === 'methane') biochemistry = 'methane-carbon';
        else if (planet.hydrosphere?.composition === 'ammonia') biochemistry = 'ammonia-silicon';

        let energy_source: 'photosynthesis' | 'chemosynthesis' | 'thermosynthesis' = 'photosynthesis';
        if ((planet.surfaceRadiation || 0) < 0.1) { // Very low light
            energy_source = (planet.tidalHeatK || 0) > 50 ? 'thermosynthesis' : 'chemosynthesis';
        }

        planet.biosphere = {
            complexity: (morphologies.includes('flora') || morphologies.includes('fauna')) ? 'complex' : 'simple',
            coverage: rng.nextFloat() * (planet.hydrosphere?.coverage || 0.1),
            biochemistry: biochemistry,
            energy_source: energy_source,
            morphologies: morphologies
        };
    }
}

function _generateAtmosphere(rng: SeededRNG, pack: RulePack, planet: CelestialBody, features: Record<string, number | string>, planetType: string) {
    const isTerrestrial = planetType === 'planet/terrestrial';
    const isGasGiant = planetType === 'planet/gas-giant';
    const isIceGiant = planetType === 'planet/ice-giant';

    if (isTerrestrial) {
        const massEarths = (planet.massKg || 0) / EARTH_MASS_KG;
        const minMass = pack.generation_parameters?.terrestrial_min_mass_for_atmosphere_earth || 0.1;
        const hasAtmosphereChance = pack.distributions['terrestrial_atmosphere_chance'];
        const hasAtmosphere = hasAtmosphereChance ? weightedChoice<boolean>(rng, hasAtmosphereChance) : true;

        if (massEarths < minMass || !hasAtmosphere) {
            planet.atmosphere = undefined;
            planet.tags.push({ key: 'Airless Rock' });
            return;
        }
    }

    const atmDistribution = pack.distributions['atmosphere_composition'];
    const validAtmospheres = atmDistribution.entries.filter((entry: any) => {
        const atm = entry.value;
        const occursOn = atm.occurs_on;
        const massRange = atm.mass_range_earths;
        const tempRange = atm.temp_range_K;
        const pressureRange = atm.pressure_range_bar;
        const tidallyLocked = atm.tidally_locked;

        if ((isGasGiant || isIceGiant) && occursOn !== 'gas giants' && occursOn !== 'both') return false;
        if (isTerrestrial && occursOn !== 'terrestrial' && occursOn !== 'both') return false;

        if (massRange && (features['mass_Me'] < massRange[0] || features['mass_Me'] > massRange[1])) return false;
        if (tempRange && (features['Teq_K'] < tempRange[0] || features['Teq_K'] > tempRange[1])) return false;
        // Pressure check is tricky, as we don't have a pressure yet. We will select an atmosphere and then set the pressure.

        if (tidallyLocked && tidallyLocked.includes('true') && !features['tidallyLocked']) return false;
        if (tidallyLocked && tidallyLocked.includes('false') && features['tidallyLocked']) return false;

        return true;
    });

    if (validAtmospheres.length > 0) {
        const atmChoice = weightedChoice(rng, { ...atmDistribution, entries: validAtmospheres });

        // Generate composition from ranges and normalize
        const rawComposition: Record<string, number> = {};
        let total = 0;
        for (const gas in atmChoice.composition) {
            const value = atmChoice.composition[gas];
            const amount = Array.isArray(value) ? randomFromRange(rng, value[0], value[1]) : value;
            rawComposition[gas] = amount;
            total += amount;
        }

        const finalComposition: Record<string, number> = {};
        if (total > 0) {
            for (const gas in rawComposition) {
                finalComposition[gas] = rawComposition[gas] / total;
            }
        }

        const mainGas = Object.keys(finalComposition).reduce((a, b) => finalComposition[a] > finalComposition[b] ? a : b);

        // Determine pressure
        let pressure_bar: number;
        if (atmChoice.pressure_range_bar) {
            pressure_bar = randomFromRange(rng, atmChoice.pressure_range_bar[0], atmChoice.pressure_range_bar[1]);
        } else {
            const pressureRange = weightedChoice<[number, number]>(rng, pack.distributions['atmosphere_pressure_bar']);
            pressure_bar = randomFromRange(rng, pressureRange[0], pressureRange[1]);
        }

        planet.atmosphere = {
            name: atmChoice.name,
            composition: finalComposition,
            main: mainGas,
            pressure_bar: pressure_bar,
        };

        if (atmChoice.tags) {
            planet.tags.push(...atmChoice.tags.map((t: string) => ({ key: t })));
        }

        features['atm.main'] = planet.atmosphere.main;
        features['atm.pressure_bar'] = planet.atmosphere.pressure_bar;
        for (const gas in planet.atmosphere.composition) {
            features[`atm.composition.${gas}`] = planet.atmosphere.composition[gas];
        }

    } else if (isGasGiant || isIceGiant) {
        // Default to Jupiter-like
        planet.atmosphere = {
            name: 'Hydrogen–Helium (Jupiter-like)',
            composition: { H2: 0.86, He: 0.14 },
            main: 'H2',
            pressure_bar: 100,
        };
        planet.tags.push({ key: 'reducing' });
        features['atm.main'] = 'H2';
        features['atm.pressure_bar'] = 100;
    } else {
        planet.atmosphere = undefined;
        planet.magneticField = undefined;
        planet.tags.push({ key: 'Airless Rock' });
    }
}
