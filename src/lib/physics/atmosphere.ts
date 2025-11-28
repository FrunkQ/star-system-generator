import type { Atmosphere, RulePack, CelestialBody } from '../types';

export function calculateMolarMass(atmosphere: Atmosphere, pack: RulePack): number {
  let totalMolarMass = 0;
  if (pack.gasMolarMassesKg) {
    for (const gas in atmosphere.composition) {
      const percentage = atmosphere.composition[gas];
      const molarMass = pack.gasMolarMassesKg[gas] || pack.gasMolarMassesKg['Other Trace'] || 0.028;
      totalMolarMass += percentage * molarMass;
    }
  }
  return totalMolarMass;
}

/**
 * Calculates the greenhouse effect based on atmospheric composition and pressure.
 * Tries to match with rulepack presets first, otherwise uses a heuristic.
 */
export function calculateGreenhouseEffect(body: CelestialBody, rulePack: RulePack) {
    if (!body.atmosphere) {
        body.greenhouseTempK = 0;
        return;
    }

    // 1. Try to match with a preset from the rulepack
    let atmDef: any = null;
    if (rulePack.distributions?.atmosphere_composition) {
        atmDef = rulePack.distributions.atmosphere_composition.entries.find(e => e.value.name === body.atmosphere!.name)?.value;
    }

    if (atmDef && atmDef.greenhouse_effect_K) {
        const nominalPressure = atmDef.pressure_range_bar ? (atmDef.pressure_range_bar[0] + atmDef.pressure_range_bar[1]) / 2 : 1;
        // Avoid division by zero
        const safeNominal = nominalPressure <= 0 ? 1 : nominalPressure;
        const pressureRatio = body.atmosphere.pressure_bar / safeNominal;
        
        // Logarithmic scaling for massive pressure differences (like Venus) to avoid 10000K temps linearly
        // If pressure ratio is huge, damp it.
        let scalingFactor = pressureRatio;
        if (pressureRatio > 10) {
            scalingFactor = 10 + Math.log10(pressureRatio / 10) * 10; 
        }
        
        body.greenhouseTempK = atmDef.greenhouse_effect_K * scalingFactor;
    } else {
        // 2. Fallback Heuristic
        // Base factors per bar (very simplified)
        const factors: Record<string, number> = {
            'CO2': 10,
            'CH4': 25,
            'H2O': 20,
            'NH3': 15,
            'SO2': 15,
            'CFC': 1000 // Just in case
        };

        let totalFactor = 0;
        for (const [gas, percent] of Object.entries(body.atmosphere.composition)) {
            const factor = factors[gas] || (factors[gas.toUpperCase()] || 0);
            totalFactor += factor * percent;
        }

        // Apply pressure scaling (logarithmic for high pressure)
        const pressure = body.atmosphere.pressure_bar;
        if (pressure < 0.01) {
            body.greenhouseTempK = totalFactor * pressure; // Linear at trace
        } else {
            // Approx: Earth 1 bar -> 30K. (N2/O2 has 0 factor, but CO2/H2O trace makes it 33K).
            // This fallback is mostly for "thick active atmospheres".
            // Let's use a power law: P^0.5
            body.greenhouseTempK = totalFactor * Math.pow(pressure, 0.7); 
        }
        
        // Ensure baseline for inert thick atmospheres (adiabatic heating / opacity)?
        // If totalFactor is 0 (Pure N2), greenhouse is 0? 
        // Realistically, pressure broadening and trace gases usually add something.
        // Add a small baseline based on pressure alone.
        if (pressure > 0.1) {
            body.greenhouseTempK += Math.log10(pressure) * 5; 
        }
    }
    
    // Safety clamp
    if (body.greenhouseTempK < 0) body.greenhouseTempK = 0;
}
