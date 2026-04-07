import { StarSystem } from '../vendor/accrete-js/src/index.js';
import type { StarSeed } from './stellar-evolution';
import type { CelestialBody, Orbit, Node, ID } from '../types';
import { AU_KM, EARTH_MASS_KG, EARTH_RADIUS_KM } from '../constants';

export interface AccreteSnapshot {
    year: number;
    stars: StarSeed[];
    planets: any[]; // Accrete Planetismals
}

/**
 * Executes the Accrete simulation and returns a series of snapshots.
 */
export function simulateAccretion(stars: StarSeed[]): AccreteSnapshot[] {
    const snapshots: AccreteSnapshot[] = [];
    
    // For now, treat multi-star systems by using the primary anchor's properties
    // In the future, we can run multiple disks or clip by stability.
    const primary = stars.reduce((prev, current) => (prev.massKg > current.massKg) ? prev : current);
    
    const accreteSystem = new StarSystem({
        stellarMass: primary.massKg / 1.989e30,
        stellarLuminosity: primary.luminositySolar,
    });

    // Capture "Birth" snapshots (Iterative injection)
    // We modify the internal loop logic conceptually to yield snapshots
    let iterations = 0;
    while (accreteSystem.matter.hasDust && iterations < 100) {
        accreteSystem.injectNucleus();
        accreteSystem.planets = accreteSystem.checkCollisions(accreteSystem.planets);
        
        if (iterations % 10 === 0) {
            snapshots.push({
                year: iterations * 100000, // Conceptually 100k years per major injection
                stars: JSON.parse(JSON.stringify(stars)),
                planets: JSON.parse(JSON.stringify(accreteSystem.planets))
            });
        }
        iterations++;
    }

    // Final Stable Snapshot
    snapshots.push({
        year: 100000000, // 100 Myr
        stars: JSON.parse(JSON.stringify(stars)),
        planets: JSON.parse(JSON.stringify(accreteSystem.planets))
    });

    return snapshots;
}

/**
 * Transforms an Accrete Planetismal into our CelestialBody format.
 */
export function mapAccreteToBody(p: any, id: ID, parentId: ID): Node {
    const body: CelestialBody = {
        id,
        name: `Planet ${id.split('-')[1]}`,
        massKg: p.mass * EARTH_MASS_KG,
        radiusKm: p.radius || EARTH_RADIUS_KM, // StarGen calculates this in Planetismal.js
        classes: p.isGasGiant ? ['planet/gas-giant'] : ['planet/terrestrial'],
        tags: [],
        rotation_period_hours: p.day || 24,
        axial_tilt_deg: p.axialTilt || 0,
    };

    const orbit: Orbit = {
        parentId,
        elements: {
            a_AU: p.a,
            e: p.e,
            i_deg: p.axialTilt || 0, // Simplified mapping
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
