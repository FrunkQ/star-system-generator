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
    body.stellarRadiation = totalStellarRadiation;
    
    // Split baseline radiation into components (approximate physical split)
    // 90% is Photons (UV/Visible/IR), 10% is Particle (Solar Wind/Protons)
    let photonFlux = totalStellarRadiation * 0.9;
    let particleFlux = totalStellarRadiation * 0.1;

    body.radiationShieldingAtmo = 0;
    body.radiationShieldingMag = 0;

    // 1. Magnetosphere Shielding (Shields Particles - Pre-Atmosphere)
    const magStrength = body.magneticField?.strengthGauss || 0;
    let magDeflection = 0;
    if (magStrength > 0) {
        magDeflection = Math.min(0.99, (Math.log10(magStrength + 0.01) + 2) / 3); 
    }
    body.radiationShieldingMag = magDeflection;
    particleFlux = particleFlux * (1 - magDeflection);

    // 2. Atmosphere Blocking (Shields Photons & Surviving Particles)
    let atmoTransmission = 1.0;
    if (body.atmosphere && body.atmosphere.name !== 'None' && body.atmosphere.composition) {
        let totalShielding = 0;
        let totalGas = 0;
        for (const [gas, amount] of Object.entries(body.atmosphere.composition)) {
            let coeff = rulePack.gasPhysics?.[gas]?.shielding ?? rulePack.gasShielding?.[gas] ?? 0.5;
            totalShielding += coeff * amount;
            totalGas += amount;
        }
        if (totalGas > 0) {
            const shieldingScore = totalShielding / totalGas;
            // Boost N2/O2 shielding slightly to match Earth calibration (~7.0 score for 1 bar)
            // Or just leave as is and accept ~7 mSv result. 
            // Let's stick to the defined coefficients but apply them to particles too.
            atmoTransmission = Math.exp(-shieldingScore * (body.atmosphere.pressure_bar || 0));
            body.radiationShieldingAtmo = 1 - atmoTransmission;
        }
    }
    
    photonFlux = photonFlux * atmoTransmission;
    particleFlux = particleFlux * atmoTransmission;

    body.photonRadiation = photonFlux * 500;
    body.particleRadiation = particleFlux * 500;
    
    // Base terrestrial background radiation (Radon, rocks) ~2.0 mSv/yr
    // Only applies to rocky bodies (Planets/Moons), not Constructs/Stars
    let terrestrialBackground = 0;
    if (body.roleHint === 'planet' || body.roleHint === 'moon') {
        terrestrialBackground = 2.0; 
    }

    body.surfaceRadiation = (photonFlux + particleFlux) * 500 + terrestrialBackground;

    return Math.max(0, body.surfaceRadiation);
}
