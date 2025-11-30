import type { CelestialBody, Barycenter, RulePack } from "$lib/types";
import { AU_KM, SOLAR_RADIUS_KM } from "$lib/constants";

export function calculateTotalStellarRadiation(
    body: CelestialBody,
    allNodes: (CelestialBody | Barycenter)[]
): number {
    let totalStellarRadiation = 0;

    // Find all stars in the system
    const allStars = allNodes.filter(n => n.kind === 'body' && n.roleHint === 'star') as CelestialBody[];

    if (allStars.length > 0) {
        for (const star of allStars) {
            // Find distance from this star to the planet
            // This is a simplified distance calculation that sums semi-major axes up and down the tree.
            
            const findPath = (startNode: CelestialBody | Barycenter, targetId: string): (CelestialBody | Barycenter)[] => {
                let p = [];
                let curr: CelestialBody | Barycenter | undefined = startNode;
                while(curr) {
                    p.unshift(curr);
                    if (curr.id === targetId) return p;
                    const parentId = curr.parentId;
                    if (!parentId) return []; // Reached root without finding target
                    curr = allNodes.find(n => n.id === parentId);
                }
                return [];
            }

            const rootNode = allNodes.find(n => n.parentId === null);
            if (!rootNode) continue;

            const pathToStar = findPath(star, rootNode.id);
            const pathToPlanet = findPath(body, rootNode.id);

            if (pathToStar.length === 0 || pathToPlanet.length === 0) continue;

            let lcaIndex = 0;
            while(lcaIndex < pathToStar.length && lcaIndex < pathToPlanet.length && pathToStar[lcaIndex].id === pathToPlanet[lcaIndex].id) {
                lcaIndex++;
            }
            lcaIndex--; // step back to the common ancestor

            let dist_au = 0;
            for (let i = lcaIndex + 1; i < pathToPlanet.length; i++) {
                const node = pathToPlanet[i] as (CelestialBody | Barycenter);
                if ('orbit' in node && node.orbit) {
                    dist_au += node.orbit.elements.a_AU;
                }
            }
            for (let i = lcaIndex + 1; i < pathToStar.length; i++) {
                const node = pathToStar[i] as (CelestialBody | Barycenter);
                if ('orbit' in node && node.orbit) {
                    dist_au += node.orbit.elements.a_AU;
                }
            }

            if (dist_au > 0) {
                totalStellarRadiation += (star.radiationOutput || 1) / (dist_au * dist_au);
            }
        }
    }
    return totalStellarRadiation;
}

export function checkAtmosphereRetention(
    body: CelestialBody,
    allNodes: (CelestialBody | Barycenter)[],
    rulePack: RulePack
): boolean {
    // Uses the same logic as planet.ts generation
    const totalStellarRadiation = calculateTotalStellarRadiation(body, allNodes);
    const magneticFieldStrength = body.magneticField?.strengthGauss || 0;
    // Default retention factor to 100 if missing (same as planet.ts default)
    const atmosphereRetentionFactor = 100; // rulePack.generation_parameters?.atmosphere_retention_factor might be missing in types if optional
    // We should check if it exists in rulePack.generation_parameters
    // Actually rulePack.generation_parameters is defined as Record<string, any> or similar?
    // Let's check types.ts later, but assuming it's safe to access or fallback.
    
    const packFactor = (rulePack as any).generation_parameters?.atmosphere_retention_factor;
    const factor = typeof packFactor === 'number' ? packFactor : 100;

    return magneticFieldStrength * factor > totalStellarRadiation;
}

export function calculateSurfaceRadiation(
    body: CelestialBody, 
    allNodes: (CelestialBody | Barycenter)[], 
    rulePack: RulePack
): number {
    const totalStellarRadiation = calculateTotalStellarRadiation(body, allNodes);
    let finalRadiation = totalStellarRadiation;

    // Atmosphere Blocking
    if (body.atmosphere && body.atmosphere.name !== 'None') {
        let blockingFactor = 0;
        let calculatedFromComposition = false;

        // 1. Try Composition-based Normalization (Better for dynamic pressure changes)
        // Shielding coefficients (Exponential Decay Constant 'k')
        // 1 bar of Earth air (N2/O2) should reduce radiation by ~99% (e^-4.6 ~ 0.01).
        const defaultGasShielding: Record<string, number> = {
            "N2": 4.5, "O2": 4.3, "CO2": 5.0, "H2O": 5.5,
            "CH4": 3.5, "H2": 0.5, "He": 0.5, "NH3": 3.5,
            "SO2": 6.0, "Ar": 4.5
        };
        const gasShielding = rulePack.gasShielding || defaultGasShielding;

        if (body.atmosphere.composition) {
            let totalShielding = 0;
            let totalGas = 0;
            for (const [gas, amount] of Object.entries(body.atmosphere.composition)) {
                const coeff = gasShielding[gas] !== undefined ? gasShielding[gas] : 0.5; // Default for unknown
                totalShielding += coeff * amount;
                totalGas += amount;
            }
            if (totalGas > 0) {
                const shieldingScore = totalShielding / totalGas;
                // Exponential Decay: Transmission = e^(-k * pressure)
                const transmission = Math.exp(-shieldingScore * body.atmosphere.pressure_bar);
                finalRadiation = totalStellarRadiation * transmission;
                calculatedFromComposition = true;
            }
        }

        // 2. Fallback to Rulepack Factor (Linear Model) if composition calc failed
        if (!calculatedFromComposition) {
            const atmEntries = rulePack.distributions.atmosphere_composition?.entries;
            if (atmEntries) {
                const atmDef = atmEntries.find(e => e.value.name === body.atmosphere?.name)?.value;
                if (atmDef && atmDef.radiation_blocking_factor) {
                    blockingFactor = Math.min(1.0, atmDef.radiation_blocking_factor * body.atmosphere.pressure_bar);
                }
            }
            finalRadiation = totalStellarRadiation * (1 - blockingFactor);
        }
    }
    
    // Magnetosphere Shielding (User Requested Addition)
    const magStrength = body.magneticField?.strengthGauss || 0;
    if (magStrength > 0) {
        // Simple model: 0.5G (Earth) = significant reduction.
        // 1 Gauss = 50% reduction.
        const magShielding = Math.min(0.5, magStrength * 0.5); 
        finalRadiation = finalRadiation * (1 - magShielding);
    }

    return Math.max(0, finalRadiation);
}
