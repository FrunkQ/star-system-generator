import type { CelestialBody, Barycenter, System, RulePack } from '../types';
import { SOLAR_RADIUS_KM, AU_KM } from '../constants';

const STEFAN_BOLTZMANN_CONSTANT = 5.670374419e-8;

type DistanceRangeAU = { mean: number; min: number; max: number };

function getNodeById(allNodes: (CelestialBody | Barycenter)[], id: string | null | undefined): (CelestialBody | Barycenter) | undefined {
    if (!id) return undefined;
    return allNodes.find((n) => n.id === id);
}

function pathToRoot(node: CelestialBody | Barycenter, allNodes: (CelestialBody | Barycenter)[]): (CelestialBody | Barycenter)[] {
    const path: (CelestialBody | Barycenter)[] = [];
    let current: (CelestialBody | Barycenter) | undefined = node;
    let guard = 0;
    while (current && guard < 64) {
        path.unshift(current);
        current = getNodeById(allNodes, current.parentId);
        guard++;
    }
    return path;
}

function edgeRangeFromChildToParent(child: CelestialBody | Barycenter): DistanceRangeAU {
    if (!child.orbit) return { mean: 0, min: 0, max: 0 };
    const a = child.orbit.elements.a_AU || 0;
    const e = Math.max(0, Math.min(0.999, child.orbit.elements.e || 0));
    const min = a * (1 - e);
    const max = a * (1 + e);
    return { mean: a, min, max };
}

function distanceRangeBetweenNodes(
    a: CelestialBody | Barycenter,
    b: CelestialBody | Barycenter,
    allNodes: (CelestialBody | Barycenter)[]
): DistanceRangeAU {
    if (a.id === b.id) return { mean: 0, min: 0, max: 0 };

    const pathA = pathToRoot(a, allNodes);
    const pathB = pathToRoot(b, allNodes);
    if (pathA.length === 0 || pathB.length === 0) return { mean: 0, min: 0, max: 0 };

    let lca = -1;
    const lim = Math.min(pathA.length, pathB.length);
    for (let i = 0; i < lim; i++) {
        if (pathA[i].id === pathB[i].id) lca = i;
        else break;
    }
    if (lca < 0) return { mean: 0, min: 0, max: 0 };

    let mean = 0;
    let min = 0;
    let max = 0;

    for (let i = lca + 1; i < pathA.length; i++) {
        const r = edgeRangeFromChildToParent(pathA[i]);
        mean += r.mean;
        min += r.min;
        max += r.max;
    }
    for (let i = lca + 1; i < pathB.length; i++) {
        const r = edgeRangeFromChildToParent(pathB[i]);
        mean += r.mean;
        min += r.min;
        max += r.max;
    }

    return { mean, min, max };
}

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
    const range = distanceRangeBetweenNodes(body, star, allNodes);
    return range.mean;
}

export function calculateDistanceRangeToStar(
    body: CelestialBody,
    star: CelestialBody,
    allNodes: (CelestialBody | Barycenter)[]
): DistanceRangeAU {
    return distanceRangeBetweenNodes(body, star, allNodes);
}

function getMainGasFraction(body: CelestialBody, gas: string): number {
    return body.atmosphere?.composition?.[gas] || 0;
}

export function estimateBondAlbedo(body: CelestialBody): number {
    if (typeof body.albedo === 'number' && body.albedo >= 0 && body.albedo <= 1) {
        return body.albedo;
    }

    const pressure = body.atmosphere?.pressure_bar || 0;
    const co2 = getMainGasFraction(body, 'CO2');
    const h2 = getMainGasFraction(body, 'H2');
    const he = getMainGasFraction(body, 'He');
    const ch4 = getMainGasFraction(body, 'CH4');
    const h2He = h2 + he;
    const massMe = (body.massKg || 0) / 5.972e24;

    // Thick reflective CO2 cloud decks (Venus-like)
    if (pressure > 20 && co2 > 0.7) return 0.75;
    // H2/He giants
    if (pressure > 10 && h2He > 0.6) {
        if (body.classes?.some((c) => c.includes('ice-giant'))) return 0.30;
        if (massMe > 30) return 0.34;
        if (ch4 > 0.01) return 0.29;
        return 0.32;
    }
    // Thin CO2 rocky worlds (Mars-like)
    if (co2 > 0.7 && pressure < 0.1) return 0.25;
    // Earth-like mixed atmospheres
    if (pressure >= 0.5 && pressure <= 2.0 && getMainGasFraction(body, 'O2') > 0.1) return 0.30;
    // Airless/trace rocky default (Mercury/Luna-like)
    if (pressure < 0.01) return 0.12;

    return 0.30;
}

export function composeSurfaceTemperatureFromDeltaComponents(
    equilibriumTempK: number,
    greenhouseDeltaK: number,
    tidalDeltaK: number,
    radiogenicDeltaK: number,
    internalDeltaK: number = 0
): number {
    const teq = Math.max(0, equilibriumTempK || 0);
    const baseFlux = STEFAN_BOLTZMANN_CONSTANT * Math.pow(teq, 4);

    const deltaToFlux = (deltaK: number): number => {
        const d = Math.max(0, deltaK || 0);
        if (d <= 0) return 0;
        return STEFAN_BOLTZMANN_CONSTANT * (Math.pow(teq + d, 4) - Math.pow(teq, 4));
    };

    const totalFlux = baseFlux
        + deltaToFlux(greenhouseDeltaK)
        + deltaToFlux(tidalDeltaK)
        + deltaToFlux(radiogenicDeltaK)
        + deltaToFlux(internalDeltaK);

    if (totalFlux <= 0) return 0;
    return Math.pow(totalFlux / STEFAN_BOLTZMANN_CONSTANT, 0.25);
}

export function estimateInternalHeatK(body: CelestialBody, rulePack?: RulePack): number {
    if (body.roleHint !== 'planet') return 0;
    const cfg = rulePack?.climateModel?.internalHeat;
    const pressure = body.atmosphere?.pressure_bar || 0;
    const h2 = getMainGasFraction(body, 'H2');
    const he = getMainGasFraction(body, 'He');
    const h2He = h2 + he;
    const minPressure = cfg?.minPressureBarForGiants ?? 10;
    const minH2He = cfg?.minHydrogenHeliumFraction ?? 0.6;
    if (pressure < minPressure || h2He < minH2He) return 0;

    const isIceGiant = body.classes?.some((c) => c.includes('ice-giant')) || false;
    const gasGiantHeatK = cfg?.gasGiantHeatK ?? 52;
    const iceGiantHeatK = cfg?.iceGiantHeatK ?? 24;
    return isIceGiant ? iceGiantHeatK : gasGiantHeatK;
}

export function calculateEquilibriumTemperature(
    body: CelestialBody, 
    allNodes: (CelestialBody | Barycenter)[],
    albedo: number = estimateBondAlbedo(body)
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

export function calculateEquilibriumTemperatureRange(
    body: CelestialBody,
    allNodes: (CelestialBody | Barycenter)[],
    albedo: number = estimateBondAlbedo(body)
): { minK: number; maxK: number } {
    const allStars = allNodes.filter(n => n.kind === 'body' && n.roleHint === 'star') as CelestialBody[];
    let fluxMin = 0;
    let fluxMax = 0;

    for (const star of allStars) {
        const starTemp = star.temperatureK || 5778;
        const starRadius_m = (star.radiusKm || SOLAR_RADIUS_KM) * 1000;
        const starLuminosity = 4 * Math.PI * Math.pow(starRadius_m, 2) * STEFAN_BOLTZMANN_CONSTANT * Math.pow(starTemp, 4);
        const d = calculateDistanceRangeToStar(body, star, allNodes);

        if (d.max > 0) {
            const maxDistM = d.max * AU_KM * 1000;
            fluxMin += starLuminosity / (4 * Math.PI * Math.pow(maxDistM, 2));
        }
        if (d.min > 0) {
            const minDistM = d.min * AU_KM * 1000;
            fluxMax += starLuminosity / (4 * Math.PI * Math.pow(minDistM, 2));
        }
    }

    if (fluxMax <= 0) return { minK: 0, maxK: 0 };

    const minK = fluxMin > 0
        ? Math.pow(fluxMin * (1 - albedo) / (4 * STEFAN_BOLTZMANN_CONSTANT), 0.25)
        : 0;
    const maxK = Math.pow(fluxMax * (1 - albedo) / (4 * STEFAN_BOLTZMANN_CONSTANT), 0.25);
    return { minK, maxK };
}
