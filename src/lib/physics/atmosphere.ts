import type { Atmosphere, RulePack, CelestialBody, Barycenter, Tag } from '../types';
import { evaluateTagTriggers } from '../utils';
import { G, UNIVERSAL_GAS_CONSTANT } from '../constants';

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

type GreenhouseModelConfig = {
    cryoNoPenaltyAboveK: number;
    cryoBaseK: number;
    cryoExponent: number;
    cryoMinFactor: number;
    responseScale: number;
    responseK: number;
    denseCo2BoostStartBar: number;
    denseCo2BoostDenominator: number;
    denseCo2BoostMax: number;
};

function getGreenhouseModelConfig(rulePack: RulePack): GreenhouseModelConfig {
    const cfg = rulePack.climateModel?.greenhouse || {};
    return {
        cryoNoPenaltyAboveK: cfg.cryoNoPenaltyAboveK ?? 200,
        cryoBaseK: cfg.cryoBaseK ?? 200,
        cryoExponent: cfg.cryoExponent ?? 3,
        cryoMinFactor: cfg.cryoMinFactor ?? 0.03,
        responseScale: cfg.responseScale ?? 205,
        responseK: cfg.responseK ?? 0.03,
        denseCo2BoostStartBar: cfg.denseCo2BoostStartBar ?? 1,
        denseCo2BoostDenominator: cfg.denseCo2BoostDenominator ?? 40,
        denseCo2BoostMax: cfg.denseCo2BoostMax ?? 1.0
    };
}

function getCryoOverlapFactor(emittingTempK: number, model: GreenhouseModelConfig): number {
    // Keep non-cryo worlds (e.g. Venus/Earth) in full-overlap regime.
    // Apply attenuation only in true cryogenic regimes.
    if (emittingTempK >= model.cryoNoPenaltyAboveK) return 1.0;
    return clamp(
        Math.pow(emittingTempK / model.cryoBaseK, model.cryoExponent),
        model.cryoMinFactor,
        1.0
    );
}

function getCiaStrength(pressureBar: number): number {
    // Collision-induced absorption proxy (strongest in dense atmospheres, especially with H2).
    return clamp(0.02 * pressureBar * pressureBar, 0, 1.5);
}

function getEffectiveGreenhousePressure(pressureBar: number): number {
    if (pressureBar > 1000) return 1;
    return Math.min(pressureBar, 200);
}

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
    const model = getGreenhouseModelConfig(rulePack);
    
    // Cap effective pressure for greenhouse calc to prevent runaway heating on Gas Giants
    // For Gas Giants (huge pressure), we care about the cloud-top (1-10 bar) temperature for "surface" stats.
    // Deep layers are adiabatically heated but don't count as the radiative surface.
    const effectivePressure = getEffectiveGreenhousePressure(pressure);
    
    let totalDeltaT = 0;

    // Cryogenic spectral-overlap attenuation and CIA support.
    const emittingTempK = body.equilibriumTempK || body.temperatureK || 288;
    const cryoOverlap = getCryoOverlapFactor(emittingTempK, model);
    const ciaStrength = getCiaStrength(effectivePressure);

    // Hybrid square-root-log greenhouse forcing with cryo + CIA modifiers.
    // Final forcing->temperature response is saturated to avoid runaway overestimation
    // in very dense atmospheres (e.g., Venus-like CO2 envelopes).
    const broadening = Math.min(1.0, Math.sqrt(effectivePressure));

    for (const [gas, fraction] of Object.entries(atm.composition)) {
        const physics = rulePack.gasPhysics[gas];
        if (physics && physics.greenhouse > 0) {
            const pp = effectivePressure * fraction;
            const baseContribution = physics.greenhouse * Math.log(1 + Math.sqrt(100 * pp));
            const ciaFactor = gas === 'H2'
                ? (1 + (2.0 * ciaStrength))
                : (1 + (0.5 * ciaStrength));
            const gasContribution = baseContribution * cryoOverlap * ciaFactor;
            totalDeltaT += gasContribution;
        }
    }

    const ppCo2 = effectivePressure * (atm.composition['CO2'] || 0);
    const denseCo2Boost = 1 + clamp(
        (ppCo2 - model.denseCo2BoostStartBar) / model.denseCo2BoostDenominator,
        0,
        model.denseCo2BoostMax
    );
    const forcing = totalDeltaT * broadening * denseCo2Boost;
    return Math.max(0, model.responseScale * Math.log(1 + (model.responseK * forcing)));
}

export function isCryoImpactedGreenhouseGas(body: CelestialBody, gas: string, rulePack: RulePack): boolean {
    if (!body.atmosphere || !rulePack.gasPhysics) return false;
    const fraction = body.atmosphere.composition?.[gas] || 0;
    if (fraction <= 0) return false;
    const physics = rulePack.gasPhysics[gas];
    if (!physics || physics.greenhouse <= 0) return false;
    const emittingTempK = body.equilibriumTempK || body.temperatureK || 288;
    const model = getGreenhouseModelConfig(rulePack);
    return getCryoOverlapFactor(emittingTempK, model) < 0.95;
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
