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
        // Fallback to geometric spacing if no T-B params
        // This ensures we reach the outer system (Ice Giants) even with few planets
        let lastApoapsisAU = Math.max(minOrbitAU, 0.2); 
        
        for (let i = 0; i < numBodies; i++) {
            // Geometric progression: r_next = r_current * multiplier
            // 1.4 to 2.2 gives nice spacing (like Mars 1.5 -> Asteroids 2.8 -> Jupiter 5.2)
            const multiplier = randomFromRange(rng, 1.4, 2.2);
            
            // Calculate new distance based on previous apoapsis
            const newA_AU = lastApoapsisAU * multiplier;
            
            if (newA_AU > systemLimitAu) break;
            
            orbitalSlotsAU.push(newA_AU);
            
            const ecc = randomFromRange(rng, 0.01, 0.15);
            lastApoapsisAU = newA_AU * (1 + ecc);
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
