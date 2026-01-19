import type { Atmosphere, RulePack, CelestialBody, Barycenter, Tag } from '../types';
import { evaluateTagTriggers } from '../utils';
import { G, UNIVERSAL_GAS_CONSTANT } from '../constants';

export function calculateMolarMass(atmosphere: Atmosphere, pack: RulePack): number {
  let totalMolarMass = 0;
  
  if (pack.gasPhysics) {
    for (const [gas, percentage] of Object.entries(atmosphere.composition)) {
      const physics = pack.gasPhysics[gas];
      const molarMass = physics?.molarMass || 0.028; // Fallback to N2
      totalMolarMass += percentage * molarMass;
    }
  } else if (pack.gasMolarMassesKg) {
    // Legacy support
    for (const [gas, percentage] of Object.entries(atmosphere.composition)) {
      const molarMass = pack.gasMolarMassesKg[gas] || pack.gasMolarMassesKg['Other Trace'] || 0.028;
      totalMolarMass += percentage * molarMass;
    }
  }
  
  return totalMolarMass || 0.028;
}

/**
 * Calculates all derived atmospheric properties based on composition and pressure.
 * This is the central entry point for V1.4.0 physics.
 */
export function recalculateAtmosphereDerivedProperties(body: CelestialBody, allNodes: (CelestialBody | Barycenter)[], rulePack: RulePack) {
    if (!body.atmosphere || body.atmosphere.name === 'None') {
        body.greenhouseTempK = 0;
        body.surfaceRadiation = undefined;
        return;
    }

    const atm = body.atmosphere;
    const pack = rulePack;

    // 1. Base Physics
    atm.molarMassKg = calculateMolarMass(atm, pack);
    
    // 2. Greenhouse Effect
    body.greenhouseTempK = calculateGreenhouseEffect(body, pack);
    
    // 3. Radiation Shielding
    // (Total Stellar Radiation calculation is handled in SystemProcessor/radiation.ts, 
    // but we update the blocking here)
    // Actually, calculateSurfaceRadiation in radiation.ts already reads from RulePack.
    // We should ensure it supports gasPhysics too. (Handled in next step)

    // 4. Scale Height (H)
    atm.scaleHeightKm = calculateScaleHeight(body);

    // 5. Dynamic Tags
    const dynamicTags = calculateAtmosphereTags(body, pack);
    
    // Merge tags: Keep existing non-atmosphere tags, replace atmosphere ones
    // Atmosphere tags are those defined in gasPhysics.
    const gasPhysicsTags = new Set<string>();
    if (pack.gasPhysics) {
        Object.values(pack.gasPhysics).forEach(g => g.tags?.forEach(t => gasPhysicsTags.add(t.name)));
    }

    const otherTags = body.tags.filter(t => !gasPhysicsTags.has(t.key));
    body.tags = [...otherTags, ...dynamicTags.map(name => ({ key: name } as Tag))];
}

export function calculateScaleHeight(body: CelestialBody): number {
    if (!body.atmosphere || !body.atmosphere.molarMassKg || !body.calculatedGravity_ms2) return 0;
    
    // Use the best available temperature estimate
    const T = body.temperatureK || body.equilibriumTempK || 288;

    // H = (R * T) / (g * M)
    const H_meters = (UNIVERSAL_GAS_CONSTANT * T) / 
                     (body.calculatedGravity_ms2 * body.atmosphere.molarMassKg);
    
    return H_meters / 1000; // Return in km
}

/**
 * Calculates the greenhouse effect based on atmospheric composition and pressure.
 * Purely derived from gasPhysics coefficients in V1.4.0.
 */
export function calculateGreenhouseEffect(body: CelestialBody, rulePack: RulePack): number {
    if (!body.atmosphere || !rulePack.gasPhysics) return body.greenhouseTempK || 0;

    const atm = body.atmosphere;
    const pressure = atm.pressure_bar || 0;
    
    // Cap effective pressure for greenhouse calc to prevent runaway heating on Gas Giants
    // For Gas Giants (huge pressure), we care about the cloud-top (1-10 bar) temperature for "surface" stats.
    // Deep layers are adiabatically heated but don't count as the radiative surface.
    let effectivePressure = pressure;
    if (pressure > 1000) {
        effectivePressure = 1; // Use 1-bar level as the "Surface" for radiative balance
    } else {
        effectivePressure = Math.min(pressure, 200); // Allow Venus (90 bar) but cap runaways
    }
    
    let totalDeltaT = 0;

    // V1.4.0 Hybrid Square-Root-Log Greenhouse Model
    // DeltaT = Multiplier * Sum( GasPot * ln(1 + sqrt(100 * partialPressure)) )
    // We also apply "Pressure Broadening" (sqrt(P_total)) to account for line narrowing in thin atmospheres.
    const multiplier = 5.0; 
    const broadening = Math.min(1.0, Math.sqrt(effectivePressure));

    for (const [gas, fraction] of Object.entries(atm.composition)) {
        const physics = rulePack.gasPhysics[gas];
        if (physics && physics.greenhouse > 0) {
            const pp = effectivePressure * fraction;
            const gasContribution = physics.greenhouse * Math.log(1 + Math.sqrt(100 * pp));
            totalDeltaT += gasContribution;
        }
    }

    return Math.max(0, totalDeltaT * multiplier * broadening);
}

/**
 * Dynamically determines tags for the atmosphere based on gas triggers.
 */
export function calculateAtmosphereTags(body: CelestialBody, rulePack: RulePack): string[] {
    if (!body.atmosphere || !rulePack.gasPhysics) return [];

    const atm = body.atmosphere;
    const pressure = atm.pressure_bar || 0;
    const tags = new Set<string>();

    // Build Global Context
    const context: Record<string, number | boolean> = {
        pressure_bar: pressure,
        gravity: (body.calculatedGravity_ms2 || 0) / 9.81, // in Gs
        temp: body.temperatureK || 0,
    };

    // Add "gas_present" flags for all gases in the atmosphere
    for (const gas in atm.composition) {
        context[`${gas}_gas_present`] = true;
    }

    // Evaluate triggers for each gas in the composition
    for (const [gas, fraction] of Object.entries(atm.composition)) {
        const physics = rulePack.gasPhysics[gas];
        if (!physics || !physics.tags) continue;

        // Add gas-specific context
        const gasContext = {
            ...context,
            pp: pressure * fraction,
            percent: fraction
        };

        for (const tagDef of physics.tags) {
            if (evaluateTagTriggers(tagDef.trigger, gasContext)) {
                tags.add(tagDef.name);
            }
        }
    }

    return Array.from(tags);
}

/**
 * Checks if a specific gas can be retained by a planet's gravity.
 * Uses the Jeans Escape simplified model.
 */
export function checkGasRetention(molarMassKg: number, body: CelestialBody): 'stable' | 'unstable' | 'escaping' {
    if (!body.massKg || !body.radiusKm) return 'escaping';

    const T = body.temperatureK || body.equilibriumTempK || 288;
    
    // 1. Escape Velocity (v_e = sqrt(2GM/r))
    const v_e = Math.sqrt((2 * G * body.massKg) / (body.radiusKm * 1000));

    // 2. Root Mean Square Thermal Velocity (v_th = sqrt(3RT/M))
    const v_th = Math.sqrt((3 * UNIVERSAL_GAS_CONSTANT * T) / molarMassKg);

    const ratio = v_e / v_th;

    // Rule of thumb for geological timescales:
    // Ratio > 6: Stable for billions of years
    // Ratio > 4: Unstable (escapes over millions of years)
    // Ratio < 4: Escapes quickly
    
    if (ratio >= 6) return 'stable';
    if (ratio >= 4) return 'unstable';
    return 'escaping';
}
