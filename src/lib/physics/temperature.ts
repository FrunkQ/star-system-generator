import type { CelestialBody, Barycenter, System } from '../types';
import { SOLAR_RADIUS_KM, AU_KM } from '../constants';

const STEFAN_BOLTZMANN_CONSTANT = 5.670374419e-8;

/**
 * Calculates the equilibrium temperature of a body based on stellar flux.
 * Handles binary systems (P-Type and S-Type) and Moons correctly.
 */
/**
 * Calculates the effective distance (in AU) between a body and a star for flux calculations.
 * Handles binary configurations and moon hierarchies.
 */
export function calculateDistanceToStar(
    body: CelestialBody, 
    star: CelestialBody, 
    allNodes: (CelestialBody | Barycenter)[]
): number {
    const parent = allNodes.find(n => n.id === body.parentId);
    if (!parent) return 0;

    let dist_au = 0;

    // Case 1: Direct orbit around this star
    if (body.parentId === star.id) {
        dist_au = body.orbit?.elements.a_AU || 0;
    } 
    // Case 2: P-Type (Circumbinary) - Body orbits the Barycenter that the star also orbits
    else if (parent.kind === 'barycenter' && star.parentId === parent.id) {
        dist_au = body.orbit?.elements.a_AU || 0;
    } 
    // Case 3: S-Type (Circumstellar in Binary) - Body orbits Star A, calculating flux from Star B
    else if (parent.kind === 'body' && parent.roleHint === 'star' && parent.parentId) {
        const barycenter = allNodes.find(n => n.id === parent.parentId && n.kind === 'barycenter');
        if (barycenter && star.parentId === barycenter.id && star.id !== parent.id) {
            const hostDist = parent.orbit?.elements.a_AU || 0;
            const starDist = star.orbit?.elements.a_AU || 0;
            dist_au = hostDist + starDist;
        }
    } 
    // Case 4: Moon. Use parent's distance.
    else if (parent.kind === 'body' && (parent.roleHint === 'planet' || parent.roleHint === 'moon')) {
        const grandParent = allNodes.find(n => n.id === parent.parentId);
        if (grandParent) {
                if (grandParent.id === star.id) {
                    dist_au = parent.orbit?.elements.a_AU || 0;
                } else if (grandParent.kind === 'barycenter' && star.parentId === grandParent.id) {
                    dist_au = parent.orbit?.elements.a_AU || 0;
                } else if (grandParent.kind === 'body' && grandParent.roleHint === 'star' && grandParent.parentId) {
                    const barycenter = allNodes.find(n => n.id === grandParent.parentId && n.kind === 'barycenter');
                    if (barycenter && star.parentId === barycenter.id && star.id !== grandParent.id) {
                        const gpDist = grandParent.orbit?.elements.a_AU || 0;
                        const starDist = star.orbit?.elements.a_AU || 0;
                        dist_au = gpDist + starDist;
                    }
                }
        }
    }
    return dist_au;
}

export function calculateEquilibriumTemperature(
    body: CelestialBody, 
    allNodes: (CelestialBody | Barycenter)[],
    albedo: number = 0.3
): number {
    const allStars = allNodes.filter(n => n.kind === 'body' && n.roleHint === 'star') as CelestialBody[];
    
    let totalLuminosityTimesArea = 0;
    
    for (const star of allStars) {
        const starTemp = star.temperatureK || 5778;
        const starRadius_m = (star.radiusKm || SOLAR_RADIUS_KM) * 1000;
        const starLuminosity = 4 * Math.PI * Math.pow(starRadius_m, 2) * STEFAN_BOLTZMANN_CONSTANT * Math.pow(starTemp, 4);

        const dist_au = calculateDistanceToStar(body, star, allNodes);

        if (dist_au > 0) {
            const dist_m = dist_au * AU_KM * 1000;
            totalLuminosityTimesArea += starLuminosity / (4 * Math.PI * Math.pow(dist_m, 2));
        }
    }

    if (totalLuminosityTimesArea > 0) {
        return Math.pow(totalLuminosityTimesArea * (1 - albedo) / (4 * STEFAN_BOLTZMANN_CONSTANT), 0.25);
    }

    return 0;
}
