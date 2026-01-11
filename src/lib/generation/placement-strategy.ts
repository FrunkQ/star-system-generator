import type { CelestialBody, RulePack } from '../types';
import { SeededRNG } from '../rng';
import { randomFromRange } from '../utils';
import { AU_KM, SOLAR_MASS_KG } from '../constants';
import { calculateAllStellarZones } from '../physics/zones';

export function calculateOrbitalSlots(
    star: CelestialBody, 
    pack: RulePack, 
    rng: SeededRNG, 
    numBodies: number
): number[] {
    const stellarZones = calculateAllStellarZones(star, pack);
    const systemLimitAu = stellarZones.systemLimitAu;

    const rocheLimitAU = (star.radiusKm * 2.44) / AU_KM;
    // Soot line approximation
    const sootLineAU = ((star.radiusKm / 2) * Math.pow(star.temperatureK / 1800, 2)) / AU_KM;
    const minOrbitAU = Math.max(rocheLimitAU, sootLineAU) * 1.2; // 20% buffer

    const tbParams = pack.distributions.titius_bode_law;
    let orbitalSlotsAU: number[] = [];

    if (tbParams) {
        // Use Titius-Bode Law if parameters exist
        orbitalSlotsAU = tbParams.sequence.map((n: number) => {
            const power = n === -999 ? 0 : Math.pow(tbParams.c, n);
            return tbParams.a + tbParams.b * power;
        });
        orbitalSlotsAU = orbitalSlotsAU.filter(au => au > minOrbitAU && au < systemLimitAu);
    } else {
        // Fallback to random gaps if no T-B params
        let lastApoapsisAU = minOrbitAU;
        for (let i = 0; i < numBodies; i++) {
            const minGap = 0.2;
            const newPeriapsis = lastApoapsisAU + randomFromRange(rng, minGap, minGap * 5);
            const newA_AU = newPeriapsis / (1 - randomFromRange(rng, 0.01, 0.15));
            if (newA_AU > systemLimitAu) break; // Stop if we go beyond the limit
            orbitalSlotsAU.push(newA_AU);
            lastApoapsisAU = newA_AU * (1 + randomFromRange(rng, 0.01, 0.15));
        }
    }

    // Shuffle the slots and take the first numBodies
    // This simulates empty slots in the T-B sequence
    rng.shuffle(orbitalSlotsAU);
    const selectedSlots = orbitalSlotsAU.slice(0, numBodies);
    
    // Sort them back for logical order? 
    // Actually, Titius-Bode usually implies order.
    // But the original code shuffled and took slice.
    // If we want random planets filling random slots, shuffle is correct.
    // But planet TYPES depend on distance (Frost Line).
    // So we should probably sort them *after* selection so the inner ones are terrestrial.
    selectedSlots.sort((a, b) => a - b);

    // Apply Jitter
    const jitter = tbParams ? tbParams.jitter : 0.1;
    return selectedSlots.map(slotAU => slotAU * (1 + randomFromRange(rng, -jitter, jitter)));
}
