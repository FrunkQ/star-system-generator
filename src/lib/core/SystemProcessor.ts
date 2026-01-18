import type { ISystemProcessor } from './interfaces';
import type { System, RulePack, CelestialBody, Barycenter } from '../types';
import { G, AU_KM, EARTH_MASS_KG, EARTH_RADIUS_KM, SOLAR_MASS_KG } from '../constants';
import { calculateEquilibriumTemperature, calculateDistanceToStar } from '../physics/temperature';
import { calculateSurfaceRadiation } from '../physics/radiation';
import { classifyBody } from '../system/classification';
import { calculateOrbitalBoundaries, type PlanetData, calculateDeltaVBudgets } from '../physics/orbits';
import { calculateMolarMass, recalculateAtmosphereDerivedProperties } from '../physics/atmosphere';
import { SeededRNG } from '../rng';

export class SystemProcessor implements ISystemProcessor {
    process(system: System, rulePack: RulePack): System {
        const processedSystem = { ...system }; // Shallow copy
        const allNodes = processedSystem.nodes;
        const rng = new SeededRNG(system.seed); // Deterministic RNG for procedural aspects of processing

        // 0. Pass 0: Orbital Dynamics & Barycenters (Ensure mass/orbits are correct first)
        this.processBarycenters(processedSystem);

        // 1. First Pass: Physical Basics (Orbital Period, Gravity, etc.)
        for (const node of allNodes) {
            if (node.kind === 'body') {
                this.processPhysicalBasics(node as CelestialBody, allNodes, rulePack);
            }
        }

        // 2. Second Pass: Environment (Radiation, Temperature, Atmosphere Retention)
        // Requires basics to be set (like distance)
        for (const node of allNodes) {
            if (node.kind === 'body') {
                this.processEnvironment(node as CelestialBody, allNodes, rulePack);
            }
        }

        // 3. Third Pass: Life & Classification (Habitability, Tags, Classes)
        // Requires environment to be set
        for (const node of allNodes) {
            if (node.kind === 'body') {
                this.processClassification(node as CelestialBody, allNodes, rulePack, rng);
            }
        }
        
        // 4. Fourth Pass: Flight Dynamics (Boundaries, Delta V)
        // Requires Temperature and Atmosphere from Pass 2
        for (const node of allNodes) {
            if (node.kind === 'body') {
                this.processFlightDynamics(node as CelestialBody, allNodes, rulePack);
            }
        }

        return processedSystem;
    }

    private processBarycenters(system: System) {
        const barycenters = system.nodes.filter(n => n.kind === 'barycenter') as Barycenter[];
        const nodesById = new Map(system.nodes.map(n => [n.id, n]));

        for (const bary of barycenters) {
            if (!bary.memberIds || bary.memberIds.length < 2) continue;

            const members = bary.memberIds.map(id => nodesById.get(id)).filter(n => n !== undefined) as (CelestialBody | Barycenter)[];
            if (members.length < 2) continue;

            // 1. Calculate New Total Mass
            let totalMass = 0;
            for (const member of members) {
                if (member.kind === 'body') {
                    totalMass += (member as CelestialBody).massKg || 0;
                } else if (member.kind === 'barycenter') {
                    totalMass += (member as Barycenter).effectiveMassKg || 0;
                }
            }
            bary.effectiveMassKg = totalMass;

            // 2. Calculate Current Separation (a_total)
            // We assume the user edited the mass but wants the physical distance to remain roughly similar,
            // OR we derive it from current 'a' values.
            let separationAU = 0;
            for (const member of members) {
                if (member.orbit) separationAU += member.orbit.elements.a_AU || 0;
            }

            // 3. Recalculate Orbits based on Mass Ratio
            // n (mean motion) is common for the system: sqrt( G * M_tot / a_sep^3 )
            const separationMeters = separationAU * AU_KM * 1000;
            let n_rad_per_s = 0;
            if (separationMeters > 0 && totalMass > 0) {
                n_rad_per_s = Math.sqrt((G * totalMass) / Math.pow(separationMeters, 3));
            }

            for (const member of members) {
                if (!member.orbit) continue;

                const memberMass = member.kind === 'body' ? (member as CelestialBody).massKg : (member as Barycenter).effectiveMassKg;
                if (memberMass === undefined) continue;

                // Distance from barycenter: r1 = a * (m2 / (m1+m2))
                // Generalized: r_i = a * ( (M_tot - m_i) / M_tot ) ?? No, specific for binary:
                // r1 = a * m2 / M_tot
                // For N-body it's complex, but for binary stored in memberIds:
                
                // If strictly binary:
                if (members.length === 2) {
                    const otherMember = members.find(m => m.id !== member.id)!;
                    const otherMass = otherMember.kind === 'body' ? (otherMember as CelestialBody).massKg : (otherMember as Barycenter).effectiveMassKg;
                    
                    if (totalMass > 0) {
                        member.orbit.elements.a_AU = separationAU * ((otherMass || 0) / totalMass);
                    }
                }

                // Update Physics
                member.orbit.hostMu = G * totalMass;
                member.orbit.n_rad_per_s = n_rad_per_s;
            }
        }
    }

    private processPhysicalBasics(body: CelestialBody, allNodes: (CelestialBody | Barycenter)[], rulePack: RulePack) {
        if (body.massKg && body.radiusKm) {
            body.calculatedGravity_ms2 = (G * body.massKg) / Math.pow(body.radiusKm * 1000, 2);
        }

        if (body.rotation_period_hours) {
            body.calculatedRotationPeriod_s = body.rotation_period_hours * 3600;
        }

        if (body.orbit && body.parentId) {
            const host = allNodes.find(n => n.id === body.parentId);
            const hostMass = (host?.kind === 'barycenter' ? host.effectiveMassKg : (host as CelestialBody)?.massKg) || 0;
            
            if (hostMass > 0) {
                body.orbital_period_days = Math.sqrt(4 * Math.PI**2 * (body.orbit.elements.a_AU * AU_KM * 1000)**3 / (G * hostMass)) / (60 * 60 * 24);
            }
        }
        
        if (body.atmosphere && body.atmosphere.molarMassKg === undefined) {
            body.atmosphere.molarMassKg = calculateMolarMass(body.atmosphere, rulePack);
        }
    }

    private processEnvironment(body: CelestialBody, allNodes: (CelestialBody | Barycenter)[], pack: RulePack) {
        // Skip Stars for environment processing as they generate their own physics (Temp, Radiation)
        if (body.roleHint === 'star') return;

        // Radiation
        body.surfaceRadiation = calculateSurfaceRadiation(body, allNodes, pack);

        // Escape Velocity
        const escapeVelocity = Math.sqrt(2 * G * (body.massKg || 0) / ((body.radiusKm || 1) * 1000)) / 1000; // in km/s
        
        // Temperature Components
        const allStars = allNodes.filter(n => n.kind === 'body' && n.roleHint === 'star') as CelestialBody[];
        let equilibriumTempK = 0;
        
        if (allStars.length > 0) {
            // Default albedo 0.3 if not specified? calculateEquilibriumTemperature handles it?
            // Actually, we should probably store albedo on the body if it matters.
            equilibriumTempK = calculateEquilibriumTemperature(body, allNodes, 0.3);
        }
        body.equilibriumTempK = equilibriumTempK;

        // Tidal Heating
        let tidalHeatingK = 0;
        if (body.roleHint === 'moon' && body.parentId) {
            const host = allNodes.find(n => n.id === body.parentId);
            if (host && host.kind === 'body') {
                tidalHeatingK = this.calculateTidalHeating(body, host as CelestialBody);
            }
        }
        body.tidalHeatK = tidalHeatingK;

        // Radiogenic Heating (Simplified)
        const radiogenicHeatK = (body.classes?.includes('planet/terrestrial') || body.roleHint === 'moon') ? 10 : 0;
        body.radiogenicHeatK = radiogenicHeatK;

        // V1.4.0 Unified Atmospheric Physics
        recalculateAtmosphereDerivedProperties(body, allNodes, pack);

        // Total Temperature (Derived from components)
        body.temperatureK = equilibriumTempK + (body.greenhouseTempK || 0) + tidalHeatingK + radiogenicHeatK;

        // Atmosphere Retention Check (Physics-based stripping)
        const totalStellarRadiation = this.calculateTotalStellarFlux(body, allStars, allNodes);
        const magneticFieldStrength = body.magneticField?.strengthGauss || 0;
        const atmosphereRetentionFactor = pack.generation_parameters?.atmosphere_retention_factor || 100;
        const retainsAtmosphere = (magneticFieldStrength * atmosphereRetentionFactor) > totalStellarRadiation;
    }

    private processClassification(body: CelestialBody, allNodes: (CelestialBody | Barycenter)[], pack: RulePack, rng: SeededRNG) {
        // Skip classification for Stars, Barycenters, etc. 
        // Only Planets and Moons need dynamic classification based on physics.
        if (body.roleHint !== 'planet' && body.roleHint !== 'moon') return;

        // Feature vector for classification
        const features: Record<string, number | string> = { 
            id: body.id,
            mass_Me: (body.massKg || 0) / EARTH_MASS_KG,
            radius_Re: (body.radiusKm || 0) / EARTH_RADIUS_KM,
            a_AU: body.orbit?.elements.a_AU || 0,
            radiation_flux: body.surfaceRadiation || 0,
            tidalHeating: body.tidalHeatK || 0,
            Teq_K: body.temperatureK || 0,
            orbital_period_days: body.orbital_period_days || 0,
            rotation_period_hours: body.rotation_period_hours || 0,
            tidallyLocked: body.tidallyLocked ? 1 : 0
        };

        if (body.atmosphere) {
            features['atm.main'] = body.atmosphere.main;
            features['atm.pressure_bar'] = body.atmosphere.pressure_bar;
            for (const gas in body.atmosphere.composition) {
                features[`atm.composition.${gas}`] = body.atmosphere.composition[gas];
            }
        }

        if (body.hydrosphere) {
            features['hydrosphere.coverage'] = body.hydrosphere.coverage;
            features['hydrosphere.composition'] = body.hydrosphere.composition;
        }

        // Re-run Classification
        // Note: This might override manual class changes if not careful.
        // We should probably only classify if classes are empty or if we want to force update.
        // For now, we update to ensure consistency with physics.
        const newClasses = classifyBody(body, features, pack, allNodes);
        // Preserve any "manual" or "special" classes that strictly aren't output by the classifier?
        // The classifier is usually comprehensive.
        body.classes = newClasses;

        // Habitability
        this.calculateHabitabilityAndBiosphere(body, rng);
    }
    
    private processFlightDynamics(body: CelestialBody, allNodes: (CelestialBody | Barycenter)[], rulePack: RulePack) {
        let immediateHost: CelestialBody | Barycenter | null = null;
        let distanceToHost_au = 0;
        
        if (body.parentId) {
            immediateHost = allNodes.find(n => n.id === body.parentId) || null;
            distanceToHost_au = body.orbit?.elements.a_AU || 0;
        }

        const hostMass = immediateHost ? (immediateHost.kind === 'barycenter' ? immediateHost.effectiveMassKg : (immediateHost as CelestialBody).massKg) : undefined;
        // Ensure required fields (temperatureK populated in Pass 2)
        const hasRequiredData = body.calculatedGravity_ms2 && body.temperatureK !== undefined && body.massKg && body.calculatedRotationPeriod_s !== undefined && immediateHost && hostMass !== undefined;
        
        if (hasRequiredData) {
            const planetData: PlanetData = {
                gravity: body.calculatedGravity_ms2!,
                surfaceTempKelvin: body.temperatureK!,
                massKg: body.massKg!,
                rotationPeriodSeconds: body.calculatedRotationPeriod_s!,
                molarMassKg: body.atmosphere?.molarMassKg ?? 0.028,
                surfacePressurePa: (body.atmosphere?.pressure_bar ?? 0) * 100000,
                distanceToHost_km: distanceToHost_au * AU_KM,
                hostMass_kg: hostMass!,
            };
            body.orbitalBoundaries = calculateOrbitalBoundaries(planetData, rulePack);
        }

        // Calculate Delta-V Budgets
        calculateDeltaVBudgets(body);
    }

    // ... existing private methods ...
    private calculateTidalHeating(planet: CelestialBody, host: CelestialBody): number {
        let tidalHeatingK = 0;
        const parentMassKg = host.massKg || 0;
        const eccentricity = planet.orbit?.elements.e || 0;
        const moonRadiusKm = planet.radiusKm || 0;
        const semiMajorAxisKm = (planet.orbit?.elements.a_AU || 0) * AU_KM;

        if (parentMassKg > 0 && eccentricity > 0 && moonRadiusKm > 0 && semiMajorAxisKm > 0) {
            const C = 4.06e-6; // Calibration constant
            tidalHeatingK = C * 
                (Math.pow(parentMassKg, 0.625)) * 
                (Math.pow(moonRadiusKm, 0.75)) * 
                (Math.pow(eccentricity, 0.5)) * 
                (Math.pow(semiMajorAxisKm, -1.875));
        }
        return tidalHeatingK;
    }

    private calculateTotalStellarFlux(planet: CelestialBody, stars: CelestialBody[], allNodes: (CelestialBody | Barycenter)[]): number {
        let total = 0;
        for (const star of stars) {
            const dist_au = calculateDistanceToStar(planet, star, allNodes);
            if (dist_au > 0) {
                total += (star.radiationOutput || 1) / (dist_au * dist_au);
            }
        }
        return total;
    }

    private calculateHabitabilityAndBiosphere(planet: CelestialBody, rng: SeededRNG) {
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
    
        // Clear old habitability tags before adding new ones
        planet.tags = planet.tags?.filter(t => !t.key.startsWith('habitability/')) || [];

        let tier: string;
        if (isEarthLike) tier = 'habitability/earth-like';
        else if (isHumanHabitable) tier = 'habitability/human';
        else if (isAlienHabitable) tier = 'habitability/alien';
        else tier = 'habitability/none';
        planet.tags.push({ key: tier });
    
        // --- Biosphere Generation ---
        if (planet.habitabilityScore > 10 && !planet.biosphere) {
             // Future logic: Conditional procedural spawning
        }
    }
}

export const systemProcessor = new SystemProcessor();
