// ⚠️ PRESERVE — do NOT delete in the Phase-A cleanup. The Accrete procedural disk-accretion engine
// (this adapter + src/lib/vendor/accrete-js) is being KEPT for v3 generation, even though its only
// current caller (EvolutionTimeline) is being removed. After the cleanup it stays as a standalone,
// caller-less module to harvest in v3.
import { StarSystem, Planetismal } from '../vendor/accrete-js/src/index.js';
import { type StarSeed, ageStar, getStarLifespanGyr } from './stellar-evolution';
import type { CelestialBody, Orbit, Node, ID } from '../types';
import { AU_KM, EARTH_MASS_KG, EARTH_RADIUS_KM, SOLAR_MASS_KG } from '../constants';

export interface AccreteSnapshot {
    year: number;
    stars: StarSeed[];
    planets: any[]; // Accrete Planetismals (POJOs)
    dustBands?: any[]; // Accrete DustCloud bands
}

/**
 * Executes the Accrete simulation and returns a series of snapshots.
 */
export function simulateAccretion(stars: StarSeed[], diskConfig?: any): AccreteSnapshot[] {
    const snapshots: AccreteSnapshot[] = [];
    
    const primary = stars.reduce((prev, current) => (prev.massKg > current.massKg) ? prev : current);
    const lifespanYears = getStarLifespanGyr(primary.massKg) * 1e9;
    
    // Accretion phase lasts 100 Myr, or 90% of the star's lifespan if very short-lived.
    const maxAccretionTime = Math.min(100000000, lifespanYears * 0.9);
    const timeStepPerIteration = maxAccretionTime / 100;
    
    const accreteSystem = new StarSystem({
        stellarMass: primary.massKg / SOLAR_MASS_KG,
        stellarLuminosity: primary.luminositySolar,
        stellarAge: 100000, 
        // Inject user disk config
        A: diskConfig?.A ?? 0.0015,
        K: diskConfig?.K ?? 50,
        W: diskConfig?.W ?? 0.2,
        B: diskConfig?.B ?? 1.2e-5
    });

    // Capture "Birth" snapshots (Iterative injection)
    let iterations = 0;
    while (accreteSystem.matter.hasDust && iterations < 100) {
        accreteSystem.injectNucleus();
        accreteSystem.planets = accreteSystem.checkCollisions(accreteSystem.planets);
        
        // Update system age for current snapshot
        accreteSystem.age = iterations * timeStepPerIteration;
        
        // Age the stars and apply to Accrete physics
        const agedStars = stars.map(s => ageStar(s, accreteSystem.age));
        const agedPrimary = agedStars.reduce((prev, curr) => (prev.massKg > curr.massKg) ? prev : curr);
        accreteSystem.stellarLuminosity = agedPrimary.luminositySolar;
        
        // Map to POJOs and apply engulfment
        const starRadiusAU = (agedPrimary.radiusKm || 696340) / AU_KM;
        const planetSnapshots = accreteSystem.planets.map(p => {
            const pojo = p.toJSON();
            if ((pojo.axis || pojo.a) < starRadiusAU * 1.2) {
                pojo.isEngulfed = true;
            }
            return pojo;
        });
        
        snapshots.push({
            year: accreteSystem.age,
            stars: JSON.parse(JSON.stringify(agedStars)),
            planets: planetSnapshots,
            dustBands: JSON.parse(JSON.stringify(accreteSystem.matter.bands))
        });
        
        iterations++;
    }

    // Final Stable Snapshot
    accreteSystem.age = maxAccretionTime;
    const finalAgedStars = stars.map(s => ageStar(s, accreteSystem.age));
    const finalPrimary = finalAgedStars.reduce((prev, curr) => (prev.massKg > curr.massKg) ? prev : curr);
    const starRadiusAU = (finalPrimary.radiusKm || 696340) / AU_KM;
    
    const finalPlanets = accreteSystem.planets.map(p => {
        const pojo = p.toJSON();
        if ((pojo.axis || pojo.a) < starRadiusAU * 1.2) {
            pojo.isEngulfed = true;
        }
        return pojo;
    });
    
    snapshots.push({
        year: accreteSystem.age,
        stars: JSON.parse(JSON.stringify(finalAgedStars)),
        planets: finalPlanets,
        dustBands: JSON.parse(JSON.stringify(accreteSystem.matter.bands))
    });

    return snapshots;
}

/**
 * Recalculates planetary state based on stellar evolution.
 */
export function recalculatePlanetAgedState(planet: any, stellarMassKg: number, stellarLuminosity: number, stellarAgeYears: number, diskConfig?: any): any {
    // Create a mock system for the planetismal that matches Accrete's expectations
    const mockSystem = {
        mass: stellarMassKg / SOLAR_MASS_KG,
        luminosity: stellarLuminosity,
        age: stellarAgeYears,
        config: {
            A: diskConfig?.A ?? 0.0015, 
            K: diskConfig?.K ?? 50, 
            W: diskConfig?.W ?? 0.2, 
            α: 5, N: 3, Q: 0.077, 
            B: diskConfig?.B ?? 1.2e-5, 
            ϴ: Math.PI / 2.01
        }
    };

    // Reconstruct the Planetismal instance from the POJO
    // Note: planet.earthMass / 332775.64 = solar mass
    const p = new Planetismal(
        mockSystem as any,
        planet.axis || planet.a,
        planet.eccentricity || planet.e,
        planet.earthMass / 332775.64,
        planet.isGasGiant
    );

    // Force re-calculation of all physics-driven properties
    p.calculateStarGenProperties();

    return p.toJSON();
}

/**
 * Transforms an Accrete Planetismal into our CelestialBody format.
 */
export function mapAccreteToBody(p: any, id: ID, parentId: ID): Node {
    const body: CelestialBody = {
        id,
        name: `Planet ${id.split('-')[1]}`,
        massKg: p.earthMass * EARTH_MASS_KG,
        radiusKm: p.radius || EARTH_RADIUS_KM, 
        classes: p.isGasGiant ? ['planet/gas-giant'] : ['planet/terrestrial'],
        tags: [],
        rotation_period_hours: p.dayLength || 24,
        axial_tilt_deg: p.axialTilt || 0,
        surface_temp_k: p.surfaceTemp,
        surface_pressure_bar: (p.surfacePressure || 0) / 1000, // Convert mb to bar
    };

    // Condition tags (orthogonal to the planet TYPE, which the classifier now owns — so the
    // old 'Ocean World' / 'Ice World' tags are dropped: planet/ocean & planet/ice cover them).
    if (p.greenhouseEffect) body.tags.push({ key: 'climate/runaway-greenhouse' });
    if (p.breathabilityCode === 1) body.tags.push({ key: 'atmosphere/breathable' });

    const orbit: Orbit = {
        parentId,
        elements: {
            a_AU: p.axis || p.a,
            e: p.eccentricity || p.e,
            i_deg: p.axialTilt || 0,
            lan_deg: Math.random() * 360,
            arg_p_deg: Math.random() * 360,
            ma_t0_deg: Math.random() * 360
        }
    };

    return {
        id,
        body,
        orbit,
        children: []
    };
}
