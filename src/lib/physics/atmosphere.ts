import type { Atmosphere, RulePack, CelestialBody, Barycenter, Tag } from '../types';
import { evaluateTagTriggers } from '../utils';
import { G, UNIVERSAL_GAS_CONSTANT, EARTH_MASS_KG } from '../constants';

const BOLTZMANN = 1.380649e-23;     // J/K
const AVOGADRO = 6.02214076e23;     // /mol
const K_WIND = 1.5;                 // non-thermal (XUV/stellar-wind) erosion strength — calibrated to Sol

// Atmospheric escape over the system's age (proposal: "atmospheres burn off over time unless shielded").
// Two mechanisms, both age-integrated, applied to a body's atmosphere BEFORE greenhouse/radiation read
// it — so a thinned atmosphere correctly gives less greenhouse and less shielding:
//   • Thermal (Jeans): light gases (H2/He) escape any non-giant; heavy gases need a high escape
//     parameter λ = G·M·m / (R·k·T_exo). Older worlds need a higher λ to have held on.
//   • Non-thermal (XUV / stellar wind): strips small, hot, close-in, UNSHIELDED worlds — scaled by
//     stellar flux, age and (1 − magnetosphere), and gated OFF above ~9 km/s escape velocity so
//     Earth/Venus/super-Earths keep their air (and the Sol baseline is preserved).
// Only thins or strips, never invents. Giants (≥10 M⊕) are exempt.
export function applyAtmosphericEscape(
  body: CelestialBody, equilibriumTempK: number, ageGyr: number, stellarFluxRel: number, magShield: number, pack: RulePack
): void {
  const atm = body.atmosphere;
  if (!atm || atm.name === 'None' || !atm.composition || !body.massKg || !body.radiusKm) return;
  if (body.massKg / EARTH_MASS_KG > 10) return;            // giants hold everything

  const R = body.radiusKm * 1000;
  const vEscKms = Math.sqrt((2 * G * body.massKg) / R) / 1000;
  const Texo = Math.max(2 * (equilibriumTempK || 0), 800);  // XUV-heated thermosphere proxy
  const lamCrit = 18 + 6 * Math.log(1 + Math.max(0, ageGyr));

  // Non-thermal wind erosion: only bites below ~9 km/s (tapered), so high-gravity worlds are immune.
  const windGate = Math.max(0, Math.min(1, (9 - vEscKms) / 4));
  const windLoss = Math.min(1, K_WIND * Math.sqrt(Math.max(0, stellarFluxRel)) * (1 - magShield)
    * Math.max(0, ageGyr) / Math.max(1, vEscKms * vEscKms) * windGate);

  const molar = pack.gasMolarMassesKg || {};
  const kept: Record<string, number> = {};
  let totalKept = 0;
  for (const [gas, frac] of Object.entries(atm.composition)) {
    const m = (molar[gas] ?? 0.028) / AVOGADRO;           // per-molecule mass (kg)
    const lambda = (G * body.massKg * m) / (R * BOLTZMANN * Texo);   // Jeans escape parameter
    const thermal = Math.max(0, Math.min(1, (lambda - lamCrit * 0.6) / (lamCrit * 1.0)));
    const keptFrac = Math.max(0, Math.min(1, thermal * (1 - windLoss)));
    const a = frac * keptFrac;
    if (a > 1e-6) { kept[gas] = a; totalKept += a; }
  }

  const newPressure = (atm.pressure_bar || 0) * totalKept;  // column shrinks by the retained fraction
  if (totalKept <= 0 || newPressure < 0.001) {              // fully stripped → airless
    body.atmosphere = { name: 'None', composition: {}, pressure_bar: 0 };
    return;
  }
  for (const g in kept) kept[g] /= totalKept;               // renormalise the survivors
  atm.composition = kept;
  atm.pressure_bar = newPressure;
  atm.main = Object.keys(kept).reduce((x, y) => (kept[x] > kept[y] ? x : y));
  atm.molarMassKg = undefined;                              // force molar-mass recompute downstream
}

// Atmosphere tags that USED to exist (cosmetic flavour ditched for the RPG use case, duplicates,
// or superseded by the apparent-colour / fluid-layer / geology models). Stripped on every run so
// legacy/saved data from the old atmosphere-preset era self-heals.
const RETIRED_ATMOSPHERE_TAGS = [
    'voice-changer', 'almond-smell', 'rotten-egg-smell', 'pungent', 'nitrogen-narcosis', 'leak-prone',
    'abrasive-wind', 'steambath', 'buffer-gas', 'noble-gas', 'acidic-rain', 'visible-fumes', 'visible-gas',
    'reactive', 'cloud-former', 'condensible-metal', 'condensible-rock', 'condensible-fuel', 'glass-haze',
    'refractory', 'opaque', 'conductive-atmosphere', 'metal-embrittlement', 'volcanic',
    // haze is now carried by the atmosphere/apparent-colour model, not a standalone tag
    'haze-former',
    // legacy thickness / preset descriptors
    'thin', 'thick', 'exosphere', 'haze', 'hot'
];

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
        // NOTE: do NOT clear surfaceRadiation here. An airless body has NO atmospheric
        // shielding, so it receives the FULL unshielded dose — it's the most-irradiated
        // case, not zero. processEnvironment/calculateSurfaceRadiation already computed it
        // (e.g. Luna ≈ 500 mSv/yr); wiping it to undefined was the Phase-04 "airless moon
        // radiation" bug.
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
    
    // Merge tags: keep existing non-atmosphere tags, replace the atmosphere ones. We strip both
    // the CURRENT gasPhysics tags AND a RETIRED set — so removing a gas tag from the rulepack (or
    // loading legacy/saved data from the old atmosphere-preset era) never strands an orphan tag.
    const gasPhysicsTags = new Set<string>(RETIRED_ATMOSPHERE_TAGS);
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

    // Cloud / ocean coupling: a liquid water ocean evaporates, adding water-vapour greenhouse the
    // listed composition may omit. This is the warming counterpart to the cloud ALBEDO (cooling)
    // now derived elsewhere. Gated OFF when H2O is already in the atmosphere, so calibrated worlds
    // (Earth lists 0.4% H2O) are untouched — no double-count.
    const h2oFrac = atm.composition['H2O'] || 0;
    const hasWaterOcean = body.hydrosphere?.composition === 'water' && (body.hydrosphere?.coverage || 0) > 0.1;
    const surfTForVapour = body.temperatureK || body.equilibriumTempK || 0;
    if (hasWaterOcean && h2oFrac < 0.001 && surfTForVapour > 273 && surfTForVapour < 373) {
        // Near-surface water-vapour fraction is small even over a warm ocean (Earth ≈ 0.4%); it rises
        // gently with temperature. Kept Earth-realistic so it adds a few K, not a runaway.
        const impliedH2O = clamp(0.004 + (surfTForVapour - 273) / 2500, 0, 0.025);
        const pp = effectivePressure * impliedH2O;
        const h2oPhysics = rulePack.gasPhysics['H2O'];
        if (h2oPhysics && h2oPhysics.greenhouse > 0) {
            totalDeltaT += h2oPhysics.greenhouse * Math.log(1 + Math.sqrt(100 * pp)) * cryoOverlap;
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
 * Resource tags a body INHERITS from its atmosphere composition (docs/tag-inheritance.md). Each gas confers
 * its `resourceTags`, and the gas's fraction sums into the tag's abundance (the `value`, 0..1) — so a trace
 * gas extracts slowly and an abundant one fast (extraction_time = amount / (rate × abundance)). Pure: pass
 * the gasPhysics map. Tags are flagged `inherited` (derived from the air, not hand-set). Not yet wired into
 * the SystemProcessor pass — see docs/tag-inheritance.md build sequence.
 */
export function atmosphereResourceTags(body: CelestialBody, gasPhysics?: RulePack['gasPhysics']): Tag[] {
    const comp = body.atmosphere?.composition;
    if (!comp || !gasPhysics) return [];
    const abundance = new Map<string, number>();
    for (const [gas, fraction] of Object.entries(comp)) {
        if (!(fraction > 0)) continue;
        for (const key of (gasPhysics[gas]?.resourceTags ?? [])) {
            abundance.set(key, (abundance.get(key) ?? 0) + fraction);
        }
    }
    return [...abundance].map(([key, f]) => ({ key, value: f.toFixed(4), inherited: true, source: 'atmosphere' } as Tag));
}

/**
 * Apply the deterministic atmosphere-derived resource tags to a body. Runs AFTER the reasons-to-visit pass
 * (which owns + clears the resource/* namespace), so these survive. Atmosphere resources are DETERMINISTIC
 * (the gas is measurably present → the resource is certainly there), unlike the semi-random ground/makeup
 * resource rules. If a resource key is already present (e.g. water-ice also seeded from surface ice), it's
 * enriched with the atmosphere abundance + provenance rather than duplicated. Mutates body.tags in place.
 */
export function applyAtmosphereResources(body: CelestialBody, gasPhysics?: RulePack['gasPhysics']): void {
    if (body.kind !== 'body') return;
    const derived = atmosphereResourceTags(body, gasPhysics);
    if (!derived.length) return;
    body.tags = body.tags || [];
    for (const t of derived) {
        const existing = body.tags.find((x) => x.key === t.key);
        if (existing) {
            if (!existing.manual) { existing.value = t.value; existing.source = t.source; existing.inherited = true; }
        } else {
            body.tags.push(t);
        }
    }
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
