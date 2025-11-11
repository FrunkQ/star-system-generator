// src/lib/generation/placement.ts
import type { CelestialBody, Barycenter, RulePack, Orbit } from '../types';
import { SOLAR_MASS_KG } from '../constants';
import { calculateRocheLimit, calculateKillZone, calculateGoldilocksZone } from '../physics/zones';

export function getValidClassifications(orbit: Orbit, host: CelestialBody | Barycenter, pack: RulePack): string[] {
    const validClasses: string[] = [];

    const frostLineAU = (pack.generation_parameters?.frost_line_base_au || 2.7) * Math.sqrt((host.massKg || SOLAR_MASS_KG) / SOLAR_MASS_KG);
    const rocheLimitAU = host.kind === 'body' ? calculateRocheLimit(host) : 0;
    const killZoneAU = host.kind === 'body' ? calculateKillZone(host) : 0;
    const habitableZone = host.kind === 'body' ? calculateGoldilocksZone(host) : { inner: 0, outer: 0 };

    if (orbit.elements.a_AU < rocheLimitAU) {
        validClasses.push('planet/disrupted');
    } else if (orbit.elements.a_AU < killZoneAU) {
        // In the kill zone, only planets without atmospheres are allowed.
        // We can represent this by adding a specific tag or by filtering the list of classifications.
        // For now, we'll just add terrestrial planets and assume they won't have an atmosphere.
        validClasses.push('planet/terrestrial');
    } else if (orbit.elements.a_AU >= habitableZone.inner && orbit.elements.a_AU <= habitableZone.outer) {
        validClasses.push('planet/terrestrial-habitable');
        validClasses.push('planet/terrestrial');
    } else if (orbit.elements.a_AU > frostLineAU) {
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
