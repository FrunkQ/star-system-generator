// src/lib/generation/planet.ts
import type { CelestialBody, Barycenter, RulePack, Orbit } from '../types';
import { SeededRNG } from '../rng';
import { weightedChoice, randomFromRange, toRoman } from '../utils';
import { G, AU_KM, EARTH_MASS_KG, EARTH_RADIUS_KM, SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '../constants';
import { bodyFactory } from '../core/BodyFactory';
import { calculateEquilibriumTemperature, calculateDistanceToStar } from '../physics/temperature';

// Debris-density proxy for belts/rings: a massKg drawn so its log maps to a density fraction in
// [fracLo, fracHi] on the 1e-5..1.0 Earth-mass scale the orrery/telemetry read (see
// debrisDensityFrac / getBeltDensityDescription). NOT gravitational mass (excluded from perturbers).
function densityProxyMassKg(rng: SeededRNG, fracLo: number, fracHi: number): number {
    const frac = fracLo + rng.nextFloat() * (fracHi - fracLo);
    const lo = Math.log(1e-5), hi = Math.log(1.0);
    return EARTH_MASS_KG * Math.exp(lo + frac * (hi - lo));
}

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
    propertyOverrides?: Partial<CelestialBody>,
    allowBelt: boolean = true,
    skipRandomAtmosphere: boolean = false
): CelestialBody[] {
    const newNodes: CelestialBody[] = [];

    const beltChanceTable = pack.distributions['belt_chance'];
    let isBelt = allowBelt && beltChanceTable ? weightedChoice<boolean>(rng, beltChanceTable) : false;
    
    // Force Belt if override specifies it
    if (planetTypeOverride === 'belt/asteroid') {
        isBelt = true;
    }

    if (isBelt && !(host.kind === 'body' && host.roleHint === 'planet')) {
        // ... Belt Generation (Refactored in Phase 1) ...
        const beltWidthRange = pack.distributions['belt_width_au_range']?.entries[0]?.value || [0.5, 1.5];
        // Belts grind down with AGE: a young system still has its primordial debris (wide, massive
        // belt); an old one has had it swept up or collisionally ground away (narrow). Factor ~1.7×
        // at 0.1 Gyr → ~1× at 4.6 Gyr → ~0.45× past 10 Gyr.
        const ageBeltFactor = Math.max(0.45, Math.min(1.7, 1.65 - 0.12 * age_Gyr));
        const widthAU = randomFromRange(rng, beltWidthRange[0], beltWidthRange[1]) * ageBeltFactor;
        const centerAU = orbit.elements.a_AU;

        let radiusInnerKm = (centerAU - widthAU / 2) * AU_KM;
        let radiusOuterKm = (centerAU + widthAU / 2) * AU_KM;

        if (propertyOverrides?.radiusInnerKm) radiusInnerKm = propertyOverrides.radiusInnerKm;
        if (propertyOverrides?.radiusOuterKm) radiusOuterKm = propertyOverrides.radiusOuterKm;

        const beltName = name.replace(/\d+$/, (m) => `Belt ${String.fromCharCode(65 + parseInt(m, 10))}`);
        
        const belt = bodyFactory.createBody({
            name: beltName,
            roleHint: 'belt',
            parentId: host.id,
            seed: `${seed}-belt-${i + 1}`
        });

        belt.id = `${seed}-belt-${i + 1}`;
        belt.classes = ['belt/asteroid'];
        belt.orbit = orbit;
        belt.radiusInnerKm = radiusInnerKm;
        belt.radiusOuterKm = radiusOuterKm;
        // Debris density (massKg as the optical/hazard proxy) — randomised so belts vary from
        // sparse to dense; the orrery draws denser ones less transparent.
        belt.massKg = densityProxyMassKg(rng, 0.2, 0.7);

        newNodes.push(belt);
        return newNodes;
    }

    const planetId = `${seed}-body-${i + 1}`;
    const roleHint = (host.kind === 'body' && (host.roleHint === 'planet' || host.roleHint === 'moon')) ? 'moon' : 'planet';
    
    let planet = bodyFactory.createBody({
        name: name,
        roleHint: roleHint,
        parentId: host.id,
        seed: planetId
    });

    planet.id = planetId;
    planet.orbit = orbit;

    const frostLineAU = (pack.generation_parameters?.frost_line_base_au || 2.7) * Math.sqrt((host.massKg || SOLAR_MASS_KG) / SOLAR_MASS_KG);
    const migrationChance = pack.generation_parameters?.planet_migration_chance || 0.1;

    let planetType = planetTypeOverride;
    if (!planetType) {
        if (roleHint === 'moon') {
            const parentMassEarths = ((host as CelestialBody).massKg || 0) / EARTH_MASS_KG;
            
            if (parentMassEarths < 10) {
                // Terrestrial Parent: Only rocky moons
                planetType = 'planet/terrestrial';
            } else {
                // Giant Parent: Standard moons are rocky or icy
                if (orbit.elements.a_AU > frostLineAU) {
                    planetType = weightedChoice<string>(rng, { entries: [{ weight: 60, value: 'planet/ice-giant' }, { weight: 40, value: 'planet/terrestrial' }] });
                } else {
                    planetType = 'planet/terrestrial';
                }
                
                // Allow "Gas Giant" moons only for Brown Dwarfs (> 1000 Earths)
                if (parentMassEarths > 1000 && rng.nextFloat() < 0.1) {
                     planetType = 'planet/gas-giant'; 
                } else if (planetType === 'planet/ice-giant' && parentMassEarths < 200) {
                     planetType = 'planet/terrestrial'; // Force rocky if parent is too small for an ice giant moon
                }
            }
        } else {
            // Planet Logic
            if (orbit.elements.a_AU > frostLineAU) {
                planetType = weightedChoice<string>(rng, { entries: [{ weight: 40, value: 'planet/gas-giant' }, { weight: 30, value: 'planet/ice-giant' }, { weight: 30, value: 'planet/terrestrial' }] });
            } else {
                planetType = weightedChoice<string>(rng, { entries: [{ weight: 80, value: 'planet/terrestrial' }, { weight: 10, value: 'planet/gas-giant' }, { weight: 10, value: 'planet/ice-giant' }] });
            }
        }
    }

    // Temporary class assignment for atmosphere generation logic
    planet.classes = [planetType];

    const planetTemplate = pack.statTemplates?.[planetType];
    if (planetTemplate) {
        if (!propertyOverrides?.massKg) {
            if (planetType === 'planet/gas-giant') {
                // Weighted distribution for Gas Giants: 99% Standard, 1% Brown Dwarf
                if (rng.nextFloat() < 0.99) {
                    // Logarithmic distribution for standard giants (10 - 4000 Earths)
                    // This favors Jupiter-sized (300) over Super-Jupiters (3000)
                    const minMass = 10;
                    const maxMass = 4000;
                    const logMin = Math.log(minMass);
                    const logMax = Math.log(maxMass);
                    const scale = randomFromRange(rng, logMin, logMax);
                    planet.massKg = Math.exp(scale) * EARTH_MASS_KG;
                } else {
                    // Logarithmic distribution for Brown Dwarfs (4000 - 26000 Earths)
                    const minMass = 4000;
                    const maxMass = 26000;
                    const logMin = Math.log(minMass);
                    const logMax = Math.log(maxMass);
                    const scale = randomFromRange(rng, logMin, logMax);
                    planet.massKg = Math.exp(scale) * EARTH_MASS_KG;
                }
            } else {
                planet.massKg = randomFromRange(rng, planetTemplate.mass_earth[0], planetTemplate.mass_earth[1]) * EARTH_MASS_KG;
            }
        }
        if (!propertyOverrides?.radiusKm) {
            if (planetTemplate.radius_earth) {
                planet.radiusKm = randomFromRange(rng, planetTemplate.radius_earth[0], planetTemplate.radius_earth[1]) * EARTH_RADIUS_KM;
            } else if (planetTemplate.radius_km) {
                planet.radiusKm = randomFromRange(rng, planetTemplate.radius_km[0], planetTemplate.radius_km[1]);
            }
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
        planet.tags.push({ key: 'origin/migrated' });
    }

    if (propertyOverrides) {
        const existingTags = planet.tags || [];
        const overrideTags = propertyOverrides.tags || [];
        planet = { ...planet, ...propertyOverrides };
        planet.tags = [...existingTags, ...overrideTags];
    }

    // --- Rotation Generation ---
    if (!planet.rotation_period_hours) {
        if (planetType === 'planet/gas-giant' || planetType === 'planet/ice-giant' || planetType === 'planet/brown-dwarf' || planetType === 'planet/sub-brown-dwarf') {
            planet.rotation_period_hours = randomFromRange(rng, 8, 15);
        } else {
            planet.rotation_period_hours = randomFromRange(rng, 10, 30);
        }
    }

    if (planet.orbit?.isRetrogradeOrbit) {
        planet.tags.push({ key: 'origin/captured' });
        planet.tags.push({ key: 'orbit/retrograde' });
    }

    // --- Prepare Features for Atmosphere Generation ---
    // We calculate just enough to make a decision. The SystemProcessor will overwrite these with final values.
    
    // Quick Equillibrium Estimate
    const equilibriumTempK = calculateEquilibriumTemperature(planet, allNodes, 0.3);
    
    const hostMass = (host.kind === 'barycenter' ? host.effectiveMassKg : (host as CelestialBody).massKg) || 0;
    const isTidallyLocked = (planet.orbit.elements.a_AU) < 0.1 * Math.pow(hostMass / SOLAR_MASS_KG, 1/3);

    const features: Record<string, number | string> = { 
        id: planetId,
        mass_Me: planet.massKg / EARTH_MASS_KG,
        radius_Re: planet.radiusKm / EARTH_RADIUS_KM,
        a_AU: planet.orbit.elements.a_AU,
        Teq_K: equilibriumTempK, // Estimate
        tidallyLocked: isTidallyLocked ? 1 : 0
    };

    // --- Atmosphere Generation ---
    if (propertyOverrides?.atmosphere) {
        // Already set via spread (e.g. a typed draw built its own atmosphere to classify correctly).
    } else if (!skipRandomAtmosphere) {
        // Legacy random atmosphere. Skipped for typed draws so the rarity slider isn't bypassed by
        // a random exotic (SO2/He…) atmosphere being slapped onto a deliberately-basic world.
        _generateAtmosphere(rng, pack, planet, features, planetType);
    }

    // --- Disrupted Chance ---
    if (age_Gyr < 0.1 && rng.nextFloat() < 0.2) { 
        planet.classes.push('planet/disrupted');
    } else if (rng.nextFloat() < 0.01) {
        planet.classes.push('planet/disrupted');
    }

    // --- Image ---
    // Note: Final classification happens in Processor, but we set a default image here if possible?
    // Actually, we can defer image selection to the Processor too if we want, 
    // or just leave it here as a "draft".
    if (planetType && pack.classifier?.planetImages?.[planetType]) {
        planet.image = { url: pack.classifier.planetImages[planetType] };
    }

    newNodes.push(planet);

    if (generateChildren && planet.roleHint === 'planet') {
        const isGiant = planetType === 'planet/gas-giant' || planetType === 'planet/ice-giant';
        const ringChanceTable = pack.distributions[isGiant ? 'gas_giant_ring_chance' : 'terrestrial_ring_chance'];
        const hasRing = ringChanceTable ? weightedChoice<boolean>(rng, ringChanceTable) : false;

        if (hasRing) {
            // ... Ring Generation (Refactored in Phase 1) ...
            const ringTemplate = pack.statTemplates?.['ring/planetary'];
            let ringInnerKm = (planet.radiusKm || 0) * 1.5;
            let ringOuterKm = (planet.radiusKm || 0) * 2.5;
            if (ringTemplate) {
                ringInnerKm = (planet.radiusKm || 0) * randomFromRange(rng, ringTemplate.radius_inner_multiple[0], ringTemplate.radius_inner_multiple[1]);
                ringOuterKm = (planet.radiusKm || 0) * randomFromRange(rng, ringTemplate.radius_outer_multiple[0], ringTemplate.radius_outer_multiple[1]);
            }
            
            const ring = bodyFactory.createBody({
                name: `${planet.name} Ring`,
                roleHint: 'ring',
                parentId: planet.id,
                seed: `${planetId}-ring-1`
            });
            
            ring.id = `${planetId}-ring-1`;
            ring.classes = ['ring/planetary'];
            ring.radiusInnerKm = ringInnerKm;
            ring.radiusOuterKm = ringOuterKm;
            // Debris density (optical proxy) — most rings are faint, a Saturn-bright one is rarer.
            ring.massKg = densityProxyMassKg(rng, 0.1, 0.9);

            newNodes.push(ring);
        }

        const moonCountTable = pack.distributions[isGiant ? 'gas_giant_moon_count' : 'terrestrial_moon_count'];
        let numMoons = moonCountTable ? weightedChoice<number>(rng, moonCountTable) : 0;

        if (isGiant) {
            const massInEarths = (planet.massKg || 0) / EARTH_MASS_KG;
            const scalingFactor = Math.log10(Math.max(1, massInEarths)); 
            numMoons = Math.floor(numMoons * scalingFactor);
        }
        
        // Cap max moons to prevent performance/visual issues
        numMoons = Math.min(numMoons, 30);

        // --- SATELLITE MASS BUDGET MODEL ---
        let isDoublePlanet = false;
        let totalMoonBudgetKg = 0;
        
        if (numMoons > 0) {
            // 2% Chance for a "Double Planet" result (Giant Impact / High Mass Capture)
            if (rng.nextFloat() < 0.02 && !isGiant) { 
                isDoublePlanet = true;
                numMoons = 1;
                totalMoonBudgetKg = (planet.massKg || 0) * randomFromRange(rng, 0.01, 0.10);
                planet.tags.push({ key: 'orbit/double' });
            } else {
                // Realistic budget: 0.01% - 0.025% for Giants (Jovian model), 0.001% - 0.005% for Terrestrials
                const budgetFactor = isGiant ? randomFromRange(rng, 0.0001, 0.00025) : randomFromRange(rng, 0.00001, 0.00005);
                totalMoonBudgetKg = (planet.massKg || 0) * budgetFactor;
            }
        }

        // Distribute budget using a Power Law
        const moonMasses: number[] = [];
        let remainingBudget = totalMoonBudgetKg;
        for (let j = 0; j < numMoons; j++) {
            let m = 0;
            if (isDoublePlanet) {
                m = totalMoonBudgetKg;
            } else if (j === 0) {
                m = totalMoonBudgetKg * randomFromRange(rng, 0.5, 0.75);
            } else if (j === 1) {
                m = totalMoonBudgetKg * randomFromRange(rng, 0.15, 0.25);
            } else {
                // Zipf-like distribution for the rest
                const weight = Math.pow(j + 1, -1.5);
                m = totalMoonBudgetKg * 0.1 * weight;
            }
            m = Math.min(m, remainingBudget);
            moonMasses.push(m);
            remainingBudget -= m;
        }

        const parentDensity = (planet.massKg || 0) / (4/3 * Math.PI * Math.pow((planet.radiusKm || 1) * 1000, 3));
        const moonDensity = 3344;
        const rocheLimit_km = (planet.radiusKm || 1) * Math.pow(2 * (parentDensity / moonDensity), 1/3);
        
        // Calculate Hill Sphere (SOI) - Stable region is roughly 1/2 Hill Sphere
        let stableLimitAU = 0;
        if (orbit && (orbit.hostMu > 0 || host.kind === 'barycenter')) {
            let starMass = orbit.hostMu / G;
            if (starMass <= 0 && host.kind === 'barycenter') {
                starMass = (host as Barycenter).effectiveMassKg || 0;
            }

            const planetMass = planet.massKg || 0;
            const a_planet = orbit.elements.a_AU;
            const e_planet = orbit.elements.e;
            const perihelion = a_planet * (1 - e_planet);
            
            if (starMass > 0) {
                const rHill = perihelion * Math.pow(planetMass / (3 * starMass), 1/3);
                stableLimitAU = rHill * 0.5; // Conservative stability limit
            }
        }

        let lastMoonApoapsisAU = rocheLimit_km / AU_KM * 1.5; 

        for (let j = 0; j < numMoons; j++) {
            const moonMass = moonMasses[j];
            if (moonMass <= 0) continue;

            // --- DERIVED RADIUS FROM DENSITY ---
            // If beyond frost line, use Icy density (~1800), else Rocky (~3500)
            const isIcy = orbit.elements.a_AU > frostLineAU;
            const density = isIcy ? 1800 : 3500;
            const volumeM3 = moonMass / density;
            const radiusM = Math.pow((3 * volumeM3) / (4 * Math.PI), 1/3);
            const radiusKm = radiusM / 1000;

            const moonMinGap = rocheLimit_km / AU_KM * 0.5;
            const newMoonPeriapsis = lastMoonApoapsisAU + randomFromRange(rng, moonMinGap, moonMinGap * 3);
            
            // Stop if we exceed the stable region
            if (stableLimitAU > 0 && newMoonPeriapsis > stableLimitAU) break;
            
            const newMoonEccentricity = randomFromRange(rng, 0, 0.05);
            const newMoonA_AU = newMoonPeriapsis / (1 - newMoonEccentricity);
            
            // Double check apoapsis against stability
            if (stableLimitAU > 0 && (newMoonA_AU * (1 + newMoonEccentricity)) > stableLimitAU) break;

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
            
            const moonOverrides: Partial<CelestialBody> = {
                massKg: moonMass,
                radiusKm: radiusKm,
                tags: isDoublePlanet ? [{ key: 'orbit/double' }] : []
            };

            const moonNodes = _generatePlanetaryBody(rng, pack, `${planet.id}-moon`, j, planet, moonOrbit, `${planet.name} ${toRoman(j + 1)}`, [...allNodes, ...newNodes], age_Gyr, undefined, true, moonOverrides);
            newNodes.push(...moonNodes);
        }
    }

    return newNodes;
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

        // Calculate weighted average molar mass
        let totalMolarMass = 0;
        if (pack.gasMolarMassesKg) {
            for (const gas in finalComposition) {
                const percentage = finalComposition[gas];
                const molarMass = pack.gasMolarMassesKg[gas] || pack.gasMolarMassesKg['Other Trace'] || 0.028;
                totalMolarMass += percentage * molarMass;
            }
        }

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
            molarMassKg: totalMolarMass > 0 ? totalMolarMass : undefined,
        };

        if (atmChoice.tags) {
            planet.tags.push(...atmChoice.tags.map((t: string) => ({ key: t })));
        }

    } else if (isGasGiant || isIceGiant) {
        // Default to Jupiter-like
        planet.atmosphere = {
            name: 'Hydrogen–Helium (Jupiter-like)',
            composition: { H2: 0.86, He: 0.14 },
            main: 'H2',
            pressure_bar: 100,
        };
        planet.tags.push({ key: 'atmosphere/reducing' });
    } else {
        planet.atmosphere = undefined;
        planet.magneticField = undefined;
        
    }
}
