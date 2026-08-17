// src/lib/generation/placement.ts
import type { CelestialBody, Barycenter, RulePack, Orbit } from '../types';
import { calculateRocheLimit, calculateKillZone, calculateGoldilocksZone, equivalentFluxDistanceAU,
    stellarContextFor, calculateAllStellarZones } from '../physics/zones';

export function getValidClassifications(
    orbit: Orbit,
    host: CelestialBody | Barycenter,
    pack: RulePack,
    allNodes?: (CelestialBody | Barycenter)[]
): string[] {
    const validClasses: string[] = [];

    // Where a giant could have FORMED is a question about the star's disc, not about the immediate
    // host's mass — see GEN-4 for the two faults in the mass-based form this replaced.
    const stellar = stellarContextFor(host, orbit.elements.a_AU, allNodes);
    const frostLineAU = stellar.star
        ? calculateAllStellarZones(stellar.star, pack, allNodes).formationFrostLine
        : (pack.generation_parameters?.frost_line_base_au || 2.7);
    const distFromStarAU = stellar.distanceAU;
    const rocheLimitAU = host.kind === 'body' ? calculateRocheLimit(host) : 0;
    const killZoneAU = host.kind === 'body' ? calculateKillZone(host) : 0;
    const habitableZone = host.kind === 'body' ? calculateGoldilocksZone(host) : { inner: 0, outer: 0 };
    const effectiveDistanceAU = equivalentFluxDistanceAU(orbit.elements.a_AU, orbit.elements.e);

    if (orbit.elements.a_AU < rocheLimitAU) {
        validClasses.push('planet/disrupted');
    } else if (orbit.elements.a_AU < killZoneAU) {
        // In the kill zone, only planets without atmospheres are allowed.
        // We can represent this by adding a specific tag or by filtering the list of classifications.
        // For now, we'll just add terrestrial planets and assume they won't have an atmosphere.
        validClasses.push('planet/terrestrial');
    } else if (effectiveDistanceAU >= habitableZone.inner && effectiveDistanceAU <= habitableZone.outer) {
        validClasses.push('planet/terrestrial-habitable');
        validClasses.push('planet/terrestrial');
    } else if (distFromStarAU > frostLineAU) {
        validClasses.push('planet/gas-giant');
        validClasses.push('planet/ice-giant');
        validClasses.push('planet/terrestrial');
    } else {
        validClasses.push('planet/terrestrial');
    }

    // Add constructs
    validClasses.push('construct/rocky-asteroid');

    return validClasses;
}
