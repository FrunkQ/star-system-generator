import { SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '../constants';
import type { RulePack } from '../types';
import { luminosityClassFromPosition } from '../system/starBandMatch';

// The reader-facing name for a band, keeping the vocabulary the old cuts used so nothing downstream
// has to learn a new word. Temperature only picks the adjective.
function categoryForBand(band: 'I' | 'III' | 'V', tempK: number): string {
    if (band === 'I') {
        if (tempK > 10000) return 'Blue Supergiant';
        if (tempK > 5000) return 'Yellow Supergiant';
        return 'Red Supergiant';
    }
    if (band === 'III') return 'Giant';
    return tempK < 3700 ? 'Red Dwarf (MS)' : 'Main Sequence';
}

export interface StarSeed {
    id: string;
    temperatureK: number;
    luminositySolar: number;
    massKg: number;
    radiusKm: number;
    spectralClass: string;
    category: string; 
    luminosityClass: string; 
    isRemnant: boolean;
    pos: { x: number, y: number, z: number }; 
    vel: { x: number, y: number, z: number }; 
    isEjected?: boolean;
    isUnbound?: boolean;
    isMerged?: boolean;
}

// Main-sequence lifetime ∝ M / L ∝ M^(-2.5). Sun ≈ 10 Gyr; 2 M☉ ≈ 1.8 Gyr; 10 M☉ ≈ 30 Myr;
// 0.5 M☉ ≈ 56 Gyr (longer than the universe — fine, it just never leaves the MS).
export function getStarLifespanGyr(massKg: number): number {
    const mSolar = massKg / SOLAR_MASS_KG;
    return 10 / Math.pow(mSolar, 2.5);
}

// Phase fractions beyond the main-sequence lifetime: the giant phase runs to ~1.3 t_MS.
const GIANT_PHASE_FRACTION = 0.3;
const AU_KM_LOCAL = 149597870.7;

export type StarPhase = 'pre-main-sequence' | 'main-sequence' | 'subgiant' | 'giant' | 'white-dwarf' | 'neutron-star' | 'black-hole';

// Evolve a star to an absolute age. Smooth MS brightening → red-giant swell (cool + luminous + huge)
// → collapse to a remnant by progenitor mass. Calibrated for a believable preview, not a stellar code.
export function ageStar(star: StarSeed, ageYears: number): StarSeed & { isDead?: boolean; phase?: StarPhase } {
    const ageGyr = ageYears / 1e9;
    const mSolar = star.massKg / SOLAR_MASS_KG;
    const tMS = getStarLifespanGyr(star.massKg);

    let L = star.luminositySolar;
    let T = star.temperatureK;
    let isDead = false;
    let phase: StarPhase = 'main-sequence';

    // Pre-main-sequence contraction: a newborn star is large, COOL and far more LUMINOUS, shrinking
    // onto the main sequence over a Kelvin-Helmholtz time that's LONGER for lower mass (~40 Myr for the
    // Sun, several hundred Myr for an M dwarf). So a young M dwarf's habitable zone starts far out and
    // migrates inward as it dims — the big age-dependence of low-mass-star zones.
    const tPreMS = 0.04 / Math.max(0.08, mSolar); // Gyr
    if (ageGyr <= tMS && ageGyr < tPreMS) {
        const f = 1 - ageGyr / tPreMS;            // 1 at birth → 0 on reaching the main sequence
        L = star.luminositySolar * (1 + 2.5 * f); // up to ~3.5× brighter at birth
        T = star.temperatureK * (1 - 0.15 * f);   // cooler (puffy) when young
        phase = 'pre-main-sequence';
    } else if (ageGyr <= tMS) {
        // Main sequence: a slow brightening + slight warming (the Sun ends ~1.7× brighter).
        const p = ageGyr / tMS;
        L = star.luminositySolar * (1 + 0.7 * p);
        T = star.temperatureK * (1 + 0.04 * p);
    } else {
        const post = (ageGyr - tMS) / (tMS * GIANT_PHASE_FRACTION); // 0..1 across the giant phase
        if (post < 1) {
            // Subgiant → red giant: ease into a cool, luminous, hugely-swollen star.
            const e = post * post;
            phase = post < 0.35 ? 'subgiant' : 'giant';
            const peakL = star.luminositySolar * (mSolar > 8 ? 1e5 : 2000); // super/red giant
            L = star.luminositySolar + (peakL - star.luminositySolar) * e;
            // THE HAYASHI LIMIT IS A FLOOR, AND THIS USED TO BE A RATIO (inbox B40). Cooling by a
            // multiplier of the star's OWN main-sequence temperature makes the endpoint proportional
            // to wherever it started — fine for a Sun-like progenitor, nonsense elsewhere. Measured
            // before changing: a 0.2 Msun progenitor was driven to 1,500 K, a 0.5 Msun to 2,019 K.
            // Neither is a star; 1,500 K is not even physics, it is the numerical guard below.
            // Bounded at BOTH ends, and the upper bound matters as much as the floor: a giant is
            // cooler than the star it grew from, so the floor must never push a temperature UP. They
            // only conflict for a star whose main-sequence temperature is already below the Hayashi
            // limit — a very low-mass M dwarf — and such a star cannot reach the giant branch inside
            // the age of the universe at all. It holds its own temperature there, which is the least
            // wrong answer available; whether the engine should refuse to age it this far is an
            // authoring question, raised and deliberately not settled here.
            T = Math.min(star.temperatureK, Math.max(hayashiLimitK(mSolar), star.temperatureK * (1 - 0.55 * e)));
        } else {
            // Remnant, by progenitor mass.
            isDead = true;
            if (mSolar > 25) { phase = 'black-hole'; L = 1e-9; T = 0; } // bare quiescent horizon (feeding is set in the editor)
            else if (mSolar > 8) { phase = 'neutron-star'; L = 1e-5; T = 600000; }
            else {
                phase = 'white-dwarf';
                const coolGyr = Math.max(0, ageGyr - tMS * (1 + GIANT_PHASE_FRACTION));
                T = Math.max(4000, 40000 * Math.exp(-coolGyr / 5)); // cools from ~40000 K
                L = 1e-2 * Math.pow(T / 40000, 4);                  // L ∝ T⁴ at fixed WD radius
            }
        }
    }

    // THE TEMPERATURE FLOOR WAS 1500 K, AND IT SILENTLY PROMOTED EVERY T AND Y DWARF TO L. It was
    // written as a guard for the radius/class maths when nothing colder than an M dwarf existed; the
    // pack now carries L (1300-2250 K), T (600-1250) and Y (250-450), and a 400 K Y-dwarf seed came
    // out of ageing at 1500 K and classified as star/L. The radius formula is sqrt(L)/(T/Tsun)^2 and
    // is fine at any POSITIVE temperature, so the guard only ever needed to exclude zero.
    const props = deriveStarFromHR(Math.max(1, T), Math.max(1e-9, L), isDead, star.massKg);
    // A quiescent black hole has no thermal surface — the HR clamp (>0, needed for the radius/class
    // math) must not leak into the displayed temperature. (Feeding raises it again via the editor.)
    if (phase === 'black-hole') { props.temperatureK = 0; props.luminositySolar = 1e-9; }
    return { ...star, ...props, isDead, phase };
}

// Magnetic flare activity 0..1. For a STAR this is a rotation-driven convective dynamo, so it is
// strongest on LOW-mass dwarfs (deep convection — M dwarfs flare ferociously) and on YOUNG stars
// (fast rotation), declining as the star spins down with age. This drives an episodic particle/UV dose
// on close-in planets (shielded by a magnetosphere + atmosphere). NOT the steady luminosity.
//
// For a REMNANT the mechanism is different and the age term does not apply — see below. `accretionEddington`
// is what a feeding compact object flares from, and it is optional because most bodies have none.
// A fed compact object, as a function of its Eddington fraction. At full Eddington this exceeds the
// most active M dwarf, which is the right ordering: an X-ray binary is among the most violently
// variable things in the sky and a flare star, however furious, is still a star.
function accretionFlare(eddington: number): number {
  return Math.max(0, Math.min(1, 0.35 + 0.6 * Math.max(0, Math.min(1.3, eddington))));
}

export function flareActivity(spectralClass: string | undefined, ageGyr: number, accretionEddington?: number): number {
  const name = (spectralClass || 'G').replace('star/', '');
  const sp = name[0];
  const base: Record<string, number> = { M: 0.85, K: 0.55, G: 0.35, F: 0.22, A: 0.16, B: 0.12, O: 0.12 };
  // A REMNANT IS NAMED, NOT INITIALLED. This tested the first LETTER against /[WNB]/ minus the
  // spectral letters — and 'B' is both the initial of "BH" and a real spectral class, so the
  // exclusion cancelled itself and `star/BH` fell through to the B-star row: a quiescent BLACK HOLE
  // with a B-star's flare rate. Latent until B44's otype classification made `star/BH` reachable.
  //
  // BUT A REMNANT IS NOT AUTOMATICALLY QUIET, and treating them all as zero was an over-correction
  // (owner, 2026-08-14). What changes is the MECHANISM, not the presence: a main-sequence star flares
  // from a rotation-driven convective dynamo, and a remnant has none — so the age term above is
  // meaningless for one. Two of them flare anyway, harder than any star does:
  //
  //   AN ACCRETING BLACK HOLE flares from its DISC, not its surface — magnetic reconnection in the
  //   disc and its corona. Sgr A* does it several times a day, and an X-ray binary is one of the most
  //   violently variable things in the sky. So the driver is the ACCRETION RATE, which the body
  //   already carries as `accretionEddington`, and a hole fed harder flares harder.
  //
  //   A MAGNETAR flares from the decay of an extreme field — starquakes cracking the crust. Giant
  //   flares from SGR 1806-20 are among the most energetic events recorded in the galaxy. Nothing
  //   about age or accretion enters it; the field is the whole story, and it is enormous by
  //   definition, so this is high and flat.
  //
  // A QUIESCENT hole, an isolated neutron star and an isolated white dwarf genuinely are quiet: no
  // photosphere, no dynamo, nothing falling in. (An ACCRETING white dwarf is a nova, which is a far
  // bigger event than a flare and is not modelled here at all.)
  if (name === 'magnetar') return 0.9;
  if (name === 'BH_active') return accretionFlare(accretionEddington ?? 0.5);
  // A hole or a neutron star the GM has set feeding is accreting whatever its class string says, so
  // the accretion decides rather than the label.
  if (/^(WD|NS|BH)$/.test(name)) return (accretionEddington ?? 0) > 0 ? accretionFlare(accretionEddington!) : 0;
  // A GIANT IS NOT A SCALED-UP DWARF, and this rule only ever saw the letter (inbox B44). Until the
  // luminosity class became a CLASS, `star/M-I` read as "M" and a red SUPERGIANT drew 0.85 — the
  // highest flare rate in the table, the one M dwarfs earn by being fully convective, rapidly
  // rotating and strongly magnetised. An evolved star is the opposite of all three: its angular
  // momentum is spread over a radius hundreds of times larger, so it turns slowly and its surface
  // field is weak and disorganised.
  //
  // THE PACK ALREADY SAYS SO and this simply reads it: `mag_gauss` is 100-1000 G for `star/M` and
  // 0.1-10 G for every giant and supergiant band. A single low value rather than a per-letter table,
  // because the REASON is the same across all of them — no strong surface dynamo — and inventing
  // seven more numbers would imply a model nobody has built.
  if (/-(I|III)$/.test(name) || name === 'red-giant') return 0.05;
  const b = base[sp] ?? 0.3;
  const ageFactor = Math.min(1, Math.pow(0.3 / Math.max(0.05, ageGyr), 0.7)); // young → ~1, old → small
  return Math.max(0, Math.min(1, b * ageFactor));
}

// THE HAYASHI LIMIT: the coolest a star can be and still hold itself up.
//
// A fully convective star in hydrostatic equilibrium has a MINIMUM effective temperature. Cooler
// than this there is no stable configuration at all — convection cannot carry the flux out, so the
// star is not on the diagram. It is why the red-giant branch is very nearly VERTICAL on an HR
// diagram: a giant swells and brightens enormously while its surface temperature barely moves, and
// real giants converge on 3,000-4,000 K whatever they started as.
//
// WEAKLY MASS-DEPENDENT, and rising with mass, which is why this is a function and not a constant —
// the standing rule is that a figure should come from the body's own properties. Anchored on
// observation at both ends rather than on the Sun: low-mass red-giant-branch tips sit near 3,000 K,
// and red SUPERGIANTS (10-25 Msun) near 3,500-4,100 K. The exponent is small because the dependence
// is weak; the clamp keeps a 0.1 Msun object and a 40 Msun one inside the observed band rather than
// letting a power law run off either end.
//
// NOT TO BE CONFUSED WITH THE 1,500 K GUARD in ageStar's HR call, which is a NUMERICAL floor for the
// radius/class maths and carries no physical claim. That guard is what a 0.2 Msun progenitor was
// actually hitting, which is the tell: a physical model should never reach its own safety net.
//
// What this does NOT model: an AGB star can sit a little below its Hayashi track while pulsating
// (Miras reach ~2,500 K), and the limit shifts with metallicity. Both are finer than this engine's
// giant branch, which is a single smooth swell rather than a track.
export function hayashiLimitK(massSolar: number): number {
    const m = Math.max(0.05, massSolar);
    return Math.min(4100, Math.max(3000, 3100 * Math.pow(m, 0.055)));
}

// The star's radius in AU (for engulfment + zone work).
export function stellarRadiusAU(star: { radiusKm: number }): number {
    return star.radiusKm / AU_KM_LOCAL;
}

// Would a planet orbiting at `distAU` be swallowed by the (evolved) star? A red giant reaches ~1 AU
// and engulfs the inner planets — exposing Chthonian cores and clearing the inner system.
export function isEngulfedAt(star: { radiusKm: number }, distAU: number): boolean {
    return distAU < stellarRadiusAU(star) * 1.2; // a little margin for tidal drag-in
}
export const SOLAR_TEMPERATURE_K = 5778;
const G = 6.67430e-11;
const SOLAR_LUM_WATT = 3.828e26;

/**
 * Advanced Stellar Classifier
 */
export function classifyStar(params: {
    tempK: number,
    lumSolar: number,
    /** The object's OWN mass. For a remnant that is the remnant's mass, not the star it came from. */
    massKg: number,
    ageGyr: number,
    isRemnant?: boolean,
    /**
     * The mass of the star this remnant came from, when it is known. Remnant identity is a fact
     * about the PROGENITOR, so this is the better discriminator whenever it survives — see below.
     */
    progenitorMassKg?: number
},
    /**
     * The rule pack, when the caller has one. WITH it, the luminosity class comes from the star's
     * POSITION against the pack's own bands, which is the only thing that gets the hot end right;
     * without it, the absolute cuts below are used and are known to call every O and B dwarf a
     * supergiant. Optional so existing callers keep working, but every caller that CAN pass it should.
     */
    pack?: RulePack | any
): { category: string, lumClass: string } {
    const { tempK, lumSolar, massKg, ageGyr, isRemnant, progenitorMassKg } = params;
    const mSolar = massKg / SOLAR_MASS_KG;
    const logL = Math.log10(lumSolar);
    const logT = Math.log10(tempK);

    if (isRemnant) {
        // TWO FRAMES LIVE HERE AND THE PARAMETER USED TO CARRY BOTH, WHICH IS THE WHOLE BUG.
        // A remnant's identity is a fact about its PROGENITOR — a white dwarf's position on the HR
        // diagram says hot and dim, and cannot say what made it (B55, owner: "that requires star
        // type + TIME"). So the thresholds below are PROGENITOR masses: above ~25 solar the core
        // collapses past the neutron-star limit, above ~8 it supernovas to a neutron star.
        //
        // But `massKg` means the object's OWN mass everywhere else in this function, and
        // `deriveStarFromHR` was the only caller setting `isRemnant` — it passes the PROGENITOR
        // mass, so the thresholds were right for it and wrong for the reading anyone else would
        // make. Measured: pass the pack's own `star/NS` band midpoint of 1.80 solar and it comes
        // back a WHITE DWARF, because a real neutron star can never satisfy `> 8`.
        //
        // The progenitor is now its OWN parameter, so neither frame can be mistaken for the other.
        const progSolar = progenitorMassKg == null ? null : progenitorMassKg / SOLAR_MASS_KG;
        if (progSolar != null) {
            if (progSolar > 25.0) return { category: 'Black Hole', lumClass: 'X' };
            if (progSolar > 8.0) return { category: 'Neutron Star', lumClass: 'X' };
            if (tempK < 1000) return { category: 'Black Dwarf', lumClass: 'VII' };
            return { category: 'White Dwarf', lumClass: 'VII' };
        }
        // NO PROGENITOR RECORDED — fall back to the remnant's own mass against the REMNANT limits,
        // which are real physics rather than fitted cuts: Chandrasekhar (~1.4 solar) is the most a
        // white dwarf's electron degeneracy can hold, and the Tolman-Oppenheimer-Volkoff limit
        // (~2.2-3) is the most a neutron star's can. The pack's own bands agree — WD 0.6..1.4,
        // NS 1.4..2.2, BH 3..100 — so this is the pack's shape read back, not a second opinion.
        if (mSolar > 2.5) return { category: 'Black Hole', lumClass: 'X' };
        if (mSolar > 1.4) return { category: 'Neutron Star', lumClass: 'X' };
        if (tempK < 1000) return { category: 'Black Dwarf', lumClass: 'VII' };
        return { category: 'White Dwarf', lumClass: 'VII' };
    }
    if (mSolar < 0.08) {
        if (mSolar < 0.013) return { category: 'Sub-Brown Dwarf / Planemo', lumClass: 'V' };
        return { category: 'Brown Dwarf', lumClass: 'V' };
    }

    // POSITION BEATS BRIGHTNESS, and this is the fix for the hot end. A luminosity class is a
    // statement about surface gravity - radius at a given temperature - so it is read off the star's
    // place among the pack's bands rather than from how bright it is. Radius comes from the pair we
    // already have: L = R^2 T^4 in solar units, so R = sqrt(L) / (T/Tsun)^2.
    // Measured: this takes the ten reference stars from five right to ten.
    if (pack) {
        const radiusSolar = Math.sqrt(Math.max(0, lumSolar)) / Math.pow(tempK / SOLAR_TEMPERATURE_K, 2);
        const band = luminosityClassFromPosition(pack, { temperatureK: tempK, radiusSolar });
        if (band) return { category: categoryForBand(band, tempK), lumClass: band };
    }
    if (mSolar > 1000 && tempK < 5000) return { category: 'Quasi-Star', lumClass: '0' };
    const eddingtonLum = 32000 * mSolar;
    if (lumSolar > eddingtonLum * 1.5) return { category: 'Invalid (Exceeds Eddington Limit)', lumClass: '?' };
    if (logL > 5.5) return { category: 'Hypergiant', lumClass: '0' };
    if (logL > 4.0) {
        if (logT > 4.0) return { category: 'Blue Supergiant', lumClass: 'I' };
        if (logT > 3.7) return { category: 'Yellow Supergiant', lumClass: 'I' };
        return { category: 'Red Supergiant', lumClass: 'I' };
    }
    if (logL > 1.5) {
        if (logL > 3.0) return { category: 'Bright Giant', lumClass: 'II' };
        return { category: 'Giant', lumClass: 'III' };
    }
    const msExpectedLogL = 6.5 * logT - 24.5;
    if (logL > msExpectedLogL + 0.5 && logL < msExpectedLogL + 1.5) return { category: 'Subgiant', lumClass: 'IV' };
    if (Math.abs(logL - msExpectedLogL) <= 0.8) {
        if (mSolar < 0.5) return { category: 'Red Dwarf (MS)', lumClass: 'V' };
        return { category: 'Main Sequence', lumClass: 'V' };
    }
    if (logL < msExpectedLogL - 0.8 && logL > -4) return { category: 'Subdwarf', lumClass: 'VI' };
    return { category: 'Invalid / Exotic Unknown', lumClass: '?' };
}

/**
 * A star's photosphere temperature, from the star's OWN data.
 *
 * Reads `temperatureK` when it has one. When it does not, it does NOT reach for the Sun: it inverts
 * Stefan-Boltzmann on this star's own luminosity and radius, T = T☉·(L/L☉)^¼/(R/R☉)^½, which is a
 * calibration anchor rather than an assumed baseline — the answer comes from this star.
 *
 * WHY THIS EXISTS: `temperatureK` is on the baseline test's DERIVED-and-stripped list and nothing in
 * `process()` puts it back, so in that fixture every star has none. Two existing readers quietly
 * substitute the Sun when that happens — `calculateEquilibriumTemperature` (`star.temperatureK ||
 * 5778`) and `apparentColor.starColorFromTempK`'s default — which is the never-assume-a-Sol-baseline
 * rule being broken silently in a derivation. Both should read this instead; that is a separate item
 * and is on the board.
 */
export function photosphereTempK(star: { temperatureK?: number; radiationOutput?: number; radiusKm?: number } | undefined): number | undefined {
    if (!star) return undefined;
    if (star.temperatureK && star.temperatureK > 0) return star.temperatureK;
    const lum = star.radiationOutput;
    const rSolar = (star.radiusKm ?? 0) / SOLAR_RADIUS_KM;
    if (!(lum && lum > 0) || !(rSolar > 0)) return undefined;
    return SOLAR_TEMPERATURE_K * Math.pow(lum, 0.25) / Math.sqrt(rSolar);
}

export function deriveStarFromHR(temperatureK: number, luminositySolar: number, isRemnant: boolean = false, progenitorMassKg?: number): StarSeed {
    const progenitorSolar = (progenitorMassKg ?? (Math.pow(luminositySolar, 0.28) * SOLAR_MASS_KG)) / SOLAR_MASS_KG;
    
    const { category, lumClass } = classifyStar({
        tempK: temperatureK,
        lumSolar: luminositySolar,
        massKg: progenitorSolar * SOLAR_MASS_KG,
        ageGyr: 0,
        isRemnant,
        // This caller has always passed the PROGENITOR mass as `massKg` and its thresholds were
        // written for that. Naming it explicitly keeps the behaviour byte-identical while removing
        // the ambiguity that made the same call wrong for everyone else.
        progenitorMassKg: progenitorSolar * SOLAR_MASS_KG
    });
    
    let finalMassSolar = Math.pow(luminositySolar, 0.28);
    let radiusKm: number;

    if (category === 'White Dwarf') {
        // Linear Initial-to-Final Mass Relation (IFMR)
        finalMassSolar = 0.45 + 0.1 * progenitorSolar;
        radiusKm = 6371 * Math.pow(0.6 / finalMassSolar, 1/3); // Mass-radius relation for WD
    } else if (category === 'Neutron Star') {
        finalMassSolar = 1.4 + (progenitorSolar - 8) * 0.05; // Heuristic scaling
        radiusKm = 12; 
    } else if (category === 'Black Hole') {
        finalMassSolar = progenitorSolar * 0.35; // Significant mass loss in SN
        radiusKm = finalMassSolar * 2.953; // Schwarzschild radius
    } else {
        const radiusSolar = Math.sqrt(luminositySolar) / Math.pow(temperatureK / SOLAR_TEMPERATURE_K, 2);
        radiusKm = radiusSolar * SOLAR_RADIUS_KM;
        finalMassSolar = progenitorSolar;
    }

    return {
        id: `star-${Math.random().toString(36).substr(2, 9)}`,
        temperatureK, luminositySolar,
        massKg: finalMassSolar * SOLAR_MASS_KG, radiusKm,
        spectralClass: determineSpectralClass(temperatureK), category, luminosityClass: lumClass,
        isRemnant: category.includes('Dwarf') || category.includes('Hole') || category.includes('Neutron'),
        pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }
    };
}

/**
 * THE SPECTRAL LETTER FROM TEMPERATURE — and it now knows about every letter the pack carries.
 *
 * This used to be a hardcoded ladder that stopped at M, written before the pack grew L, T and Y
 * dwarfs. So an L dwarf at 1600 K, a T at 900 K and a Y at 400 K all came out `star/M` — the
 * wizard could not generate a brown dwarf from a seed AT ALL, and every generation measurement
 * taken against an "L dwarf" anchor was in fact measuring an M dwarf (B58 and after; the results
 * still stand for M, they were simply mislabelled below it). The letter's PLANET-COUNT lookup was
 * wrong for the same reason in the other direction: L/T/Y fell through every branch to the
 * REMNANT table, mean 0.06 planets.
 *
 * The pack's `stellarClassification.subclass_anchors` already declares each letter's temperature
 * anchors, brown dwarfs included, so the letter is read from THAT when a pack is given: the
 * hottest letter whose coldest anchor is at or below the temperature — same rule as before, now
 * over the pack's letters rather than a fixed seven. Anchors are the MAIN-SEQUENCE branch, which is
 * fine here because the letter is about temperature and the luminosity class comes separately.
 * Without a pack the old ladder stands, extended so a brown-dwarf temperature at least gets the
 * right letter rather than M.
 */
const LETTER_ORDER = ['O', 'B', 'A', 'F', 'G', 'K', 'M', 'L', 'T', 'Y'];
const LADDER_FLOOR_K: Record<string, number> = { O: 30000, B: 10000, A: 7500, F: 6000, G: 5200, K: 3700, M: 2400, L: 1300, T: 600, Y: 0 };

export function determineSpectralClass(tempK: number, pack?: RulePack | any): string {
    const anchors = (pack as any)?.stellarClassification?.subclass_anchors as Record<string, Record<string, number>> | undefined;
    if (anchors && tempK > 0) {
        // The letter's FLOOR is its coldest anchor; walk hot to cold and take the first whose floor
        // the temperature clears. A temperature colder than every floor is the coldest letter known.
        let coldest = LETTER_ORDER[LETTER_ORDER.length - 1];
        for (const letter of LETTER_ORDER) {
            const a = anchors[letter];
            if (!a) continue;
            coldest = letter;
            const floor = Math.min(...Object.values(a).map(Number).filter((v) => Number.isFinite(v)));
            if (tempK >= floor) return letter;
        }
        return coldest;
    }
    for (const letter of LETTER_ORDER) if (tempK >= LADDER_FLOOR_K[letter]) return letter;
    return 'Y';
}

export function initializeStellarNursery(stars: StarSeed[], clusterRadiusAU: number = 50): StarSeed[] {
    const AU_TO_M = 149597870700;
    return stars.map(star => {
        const r = Math.random() * clusterRadiusAU * AU_TO_M;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        star.pos = { x: r * Math.sin(phi) * Math.cos(theta), y: r * Math.sin(phi) * Math.sin(theta), z: r * Math.cos(phi) };
        const vMag = Math.sqrt((G * SOLAR_MASS_KG) / (Math.max(r, 1 * AU_TO_M))) * (0.5 + Math.random() * 0.5);
        star.vel = { x: -vMag * Math.sin(theta), y: vMag * Math.cos(theta), z: (Math.random() - 0.5) * vMag * 0.2 };
        return star;
    });
}

export function stepNBody(stars: StarSeed[], dt: number): StarSeed[] {
    const activeStars = stars.filter(s => !s.isEjected && !s.isMerged);
    if (activeStars.length < 2) return stars;

    const getAccel = (positions: {x:number, y:number, z:number}[]) => {
        return activeStars.map((s1, i) => {
            let ax = 0, ay = 0, az = 0;
            activeStars.forEach((s2, j) => {
                if (i === j) return;
                const dx = positions[j].x - positions[i].x;
                const dy = positions[j].y - positions[i].y;
                const dz = positions[j].z - positions[i].z;
                const distSq = dx*dx + dy*dy + dz*dz + 1e14; 
                const dist = Math.sqrt(distSq);
                const force = (G * s2.massKg) / distSq;
                ax += force * (dx / dist); ay += force * (dy / dist); az += force * (dz / dist);
            });
            return { x: ax, y: ay, z: az };
        });
    };

    const p0 = activeStars.map(s => s.pos);
    const v0 = activeStars.map(s => s.vel);
    const k1v = getAccel(p0); const k1p = v0;
    const p1 = p0.map((p, i) => ({ x: p.x + k1p[i].x * dt/2, y: p.y + k1p[i].y * dt/2, z: p.z + k1p[i].z * dt/2 }));
    const v1 = v0.map((v, i) => ({ x: v.x + k1v[i].x * dt/2, y: v.y + k1v[i].y * dt/2, z: v.z + k1v[i].z * dt/2 }));
    const k2v = getAccel(p1); const k2p = v1;
    const p2 = p0.map((p, i) => ({ x: p.x + k2p[i].x * dt/2, y: p.y + k2p[i].y * dt/2, z: p.z + k2p[i].z * dt/2 }));
    const v2 = v0.map((v, i) => ({ x: v.x + k2v[i].x * dt/2, y: v.y + k2v[i].y * dt/2, z: v.z + k2v[i].z * dt/2 }));
    const k3v = getAccel(p2); const k3p = v2;
    const p3 = p0.map((p, i) => ({ x: p.x + k3p[i].x * dt, y: p.y + k3p[i].y * dt, z: p.z + k3p[i].z * dt }));
    const v3 = v0.map((v, i) => ({ x: v.x + k3v[i].x * dt, y: v.y + k3v[i].y * dt, z: v.z + k3v[i].z * dt }));
    const k4v = getAccel(p3); const k4p = v3;

    activeStars.forEach((s, i) => {
        s.pos.x += (dt/6) * (k1p[i].x + 2*k2p[i].x + 2*k3p[i].x + k4p[i].x);
        s.pos.y += (dt/6) * (k1p[i].y + 2*k2p[i].y + 2*k3p[i].y + k4p[i].y);
        s.pos.z += (dt/6) * (k1p[i].z + 2*k2p[i].z + 2*k3p[i].z + k4p[i].z);
        s.vel.x += (dt/6) * (k1v[i].x + 2*k2v[i].x + 2*k3v[i].x + k4v[i].x);
        s.vel.y += (dt/6) * (k1v[i].y + 2*k2v[i].y + 2*k3v[i].y + k4v[i].y);
        s.vel.z += (dt/6) * (k1v[i].z + 2*k2v[i].z + 2*k3v[i].z + k4v[i].z);
    });
    return stars;
}

export function shiftToBarycentricFrame(stars: StarSeed[]): StarSeed[] {
    let totalMass = 0; let baryX = 0, baryY = 0, baryZ = 0; let momX = 0, momY = 0, momZ = 0;
    stars.forEach(s => {
        totalMass += s.massKg; baryX += s.pos.x * s.massKg; baryY += s.pos.y * s.massKg; baryZ += s.pos.z * s.massKg;
        momX += s.vel.x * s.massKg; momY += s.vel.y * s.massKg; momZ += s.vel.z * s.massKg;
    });
    if (totalMass === 0) return stars;
    const vDriftX = momX / totalMass; const vDriftY = momY / totalMass; const vDriftZ = momZ / totalMass;
    const pShiftX = baryX / totalMass; const pShiftY = baryY / totalMass; const pShiftZ = baryZ / totalMass;
    stars.forEach(s => {
        s.pos.x -= pShiftX; s.pos.y -= pShiftY; s.pos.z -= pShiftZ;
        s.vel.x -= vDriftX; s.vel.y -= vDriftY; s.vel.z -= vDriftZ;
    });
    return stars;
}

export function checkEjections(stars: StarSeed[]): { stars: StarSeed[], ejectedAny: boolean } {
    let ejectedAny = false;
    const active = stars.filter(s => !s.isEjected && !s.isMerged);
    if (active.length < 2) return { stars, ejectedAny: false };

    let totalMass = 0; let baryX = 0, baryY = 0, baryZ = 0;
    active.forEach(s => {
        totalMass += s.massKg; baryX += s.pos.x * s.massKg; baryY += s.pos.y * s.massKg; baryZ += s.pos.z * s.massKg;
    });
    const cx = baryX / totalMass; const cy = baryY / totalMass; const cz = baryZ / totalMass;

    active.forEach(s => {
        const dx = s.pos.x - cx; const dy = s.pos.y - cy; const dz = s.pos.z - cz;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        
        // Trigger ejection at a closer distance (e.g. 150 AU) so it's still visible
        // We use an energy check to ensure it's actually unbound
        if (dist > 150 * 149597870700 && !s.isUnbound) {
            const vMagSq = s.vel.x**2 + s.vel.y**2 + s.vel.z**2;
            const kineticEnergyPerMass = 0.5 * vMagSq;
            const potentialEnergyPerMass = -(6.67430e-11 * (totalMass - s.massKg)) / dist;
            const totalEnergyPerMass = kineticEnergyPerMass + potentialEnergyPerMass;

            const vRad = (s.vel.x * dx + s.vel.y * dy + s.vel.z * dz) / dist;

            if (totalEnergyPerMass > 0 && vRad > 0) {
                s.isUnbound = true;
                ejectedAny = true;
            }
        }
    });
    return { stars, ejectedAny };
}

export function handleMergers(stars: StarSeed[], dt: number = 0): { stars: StarSeed[], mergedAny: boolean } {
    let mergedAny = false;
    const active = stars.filter(s => !s.isEjected && !s.isMerged);
    for (let i = 0; i < active.length; i++) {
        for (let j = i + 1; j < active.length; j++) {
            const s1 = active[i]; const s2 = active[j];
            const dx = s2.pos.x - s1.pos.x; const dy = s2.pos.y - s1.pos.y; const dz = s2.pos.z - s1.pos.z;
            const dvx = s2.vel.x - s1.vel.x; const dvy = s2.vel.y - s1.vel.y; const dvz = s2.vel.z - s1.vel.z;
            
            const distSq = dx*dx + dy*dy + dz*dz;
            const collisionDist = (s1.radiusKm + s2.radiusKm) * 1000;
            const collisionDistSq = collisionDist * collisionDist;

            let isCollision = distSq < collisionDistSq;

            // Swept-sphere collision detection to prevent high-speed tunneling
            if (!isCollision && dt > 0) {
                const a = dvx*dvx + dvy*dvy + dvz*dvz;
                const b = 2 * (dx*dvx + dy*dvy + dz*dvz);
                const c = distSq - collisionDistSq;
                
                if (a > 1e-6) {
                    const discriminant = b*b - 4*a*c;
                    if (discriminant >= 0) {
                        const t1 = (-b - Math.sqrt(discriminant)) / (2*a);
                        const t2 = (-b + Math.sqrt(discriminant)) / (2*a);
                        // Check if intersection occurred during the past dt timestep
                        if ((t1 <= 0 && t1 >= -dt) || (t2 <= 0 && t2 >= -dt)) {
                            isCollision = true;
                        }
                    }
                }
            }

            if (isCollision) {
                const totalMass = s1.massKg + s2.massKg;
                s1.vel.x = (s1.vel.x * s1.massKg + s2.vel.x * s2.massKg) / totalMass;
                s1.vel.y = (s1.vel.y * s1.massKg + s2.vel.y * s2.massKg) / totalMass;
                s1.vel.z = (s1.vel.z * s1.massKg + s2.vel.z * s2.massKg) / totalMass;
                s1.massKg = totalMass;
                s1.radiusKm = Math.pow(s1.massKg / 1.989e30, 0.8) * 696340;
                s2.isMerged = true; mergedAny = true;
            }
        }
    }
    return { stars, mergedAny };
}

