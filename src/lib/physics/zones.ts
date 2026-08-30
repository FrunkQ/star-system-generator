import type { CelestialBody, Barycenter, RulePack } from '../types';
import { SOLAR_RADIUS_KM } from '../constants';
import { luminositySolarFromRT, SOLAR_TEFF_K } from './luminosity';
import { blackbodyFractionBelowNm } from './spectrum';
import { ionisingOutputSolar } from './ionisingOutput';
import { starOccluders } from './starlightOcclusion';

/**
 * ZONES FOLLOW THE DIMMING (G53 phase 4, the other half of B110's coherence warning): a star dimmed
 * for a planet's temperature and undimmed for the habitable zone is the exact "silent, physically
 * incoherent" split luminosity.ts's header names. Every zone line here is a flux threshold, so
 * every one of them moves when a megastructure stands inside it.
 *
 * THE ZONE CIRCLES LIVE IN THE SYSTEM PLANE, and the plane is the aligned direction for every BAND
 * occluder — a ringworld's shadow falls exactly where the zone rings are drawn — so for zones every
 * occluder applies its FULL fraction beyond its radius, bands included (the per-body directional
 * relief belongs to bodies, whose orbits can tilt out of the shadow; a drawn circle cannot).
 *
 * THE WALK: solve the line in clear sky; while the answer lands beyond an occluder, re-solve with
 * that occluder's light removed; if the re-solve falls back INSIDE the occluder, the flux
 * discontinuity at its radius stepped over the threshold and the edge IS the occluder's radius —
 * beyond a solid ringworld, in-plane, there is no more zone to have. `solveAt(f)` re-runs the
 * line's own solver with the host luminosity scaled by f, so companion flux stays undimmed (a
 * companion's light is not intercepted by this star's structures — the stated approximation in
 * starlightOcclusion.ts).
 */
function occludedZoneDistance(
    star: CelestialBody,
    allNodes: (CelestialBody | Barycenter)[] | undefined,
    solveAt: (lumFactor: number) => number
): number {
    let r = solveAt(1);
    if (!(r > 0) || !allNodes || allNodes.length === 0) return r;
    const occs = starOccluders(star, allNodes).sort((a, b) => a.radiusAu - b.radiusAu);
    let f = 1;
    for (const occ of occs) {
        if (r <= occ.radiusAu) return r;
        f *= 1 - occ.fraction;
        r = f > 0 ? solveAt(f) : 0;
        if (r <= occ.radiusAu) return occ.radiusAu;
    }
    return r;
}


/**
 * The biological UV damage edge, nm. Shortward of roughly this, photons break the bonds that hold
 * a genome together whatever it is made of — it is a photon-ENERGY threshold, not a claim about
 * DNA. Pack-overridable as `generation_parameters.uv_damage_edge_nm`.
 */
export const UV_DAMAGE_EDGE_NM = 280;

/** Sol's own kill-zone radius, the anchor everything else is expressed against. */
export const KILL_ZONE_SOL_AU = 0.1;

/** The quiet Sun's dynamo strength, for normalising the ionising half against it. */
const SOLAR_FLARE_ACTIVITY = 0.052;

/**
 * The star's luminosity relative to the Sun, COMPUTED from R^2 T^4 — never the stored
 * `radiationOutput`, which B57 records as drifted by up to 60,000x. This is the pattern every zone
 * in this file follows, and as of B81 that finally includes the kill zone.
 */
function getLuminosity(star: CelestialBody): number {
    if (!star.radiusKm || !star.temperatureK) return 1;
    // ONE Stefan-Boltzmann for the whole engine ([[B110]]). This used to build the star's output and
    // the Sun's in watts and divide - the same law, spelled a second way. A star can only be DIMMED
    // in one place if it is only computed in one place.
    return luminositySolarFromRT(star.radiusKm, star.temperatureK);
}

/**
 * THE KILL ZONE — how close a world can sit before the star's IONISING output sterilises it.
 *
 * DERIVED, not multiplied out of a stored dial (inbox B81, decided by the owner: "those zones need
 * to correlate to reality"). It used to be `0.1 * sqrt(uvFactor * star.radiationOutput * L)`, and
 * every part of that had a fault:
 *
 *  1. `star.radiationOutput` is a STORED luminosity, and B57 records it as drifted by up to
 *     60,000x. Measured: handing Sol `radiationOutput: 1000` moved its kill zone from 0.10 AU to
 *     3.16 AU. Worse, it multiplied the COMPUTED luminosity by the STORED one — the same quantity
 *     twice. Everything here now comes from `getLuminosity`, which is R^2 T^4 and cannot drift.
 *  2. The `uvFactor` switch tested `classes[0].split('/')[1]` against 'O', 'B', 'A'... — but a
 *     modern designation splits to "G2V", not "G", so it matched NOTHING and fell to 1.0 for every
 *     properly classified star. It fired only for a bare BAND key (DATA-R18). Measured: `star/M`
 *     got 0.0035 AU and `star/M4V` 0.0111 AU — the same star, 3.2x apart, on spelling alone.
 *  3. Its default of 1.0 gave L, T and Y dwarfs, white dwarfs, neutron stars and black holes a
 *     Sun-like UV factor, which is absurd in both directions at once.
 *
 * TWO HAZARDS, AND A STAR CAN BE DANGEROUS BY EITHER — which is the whole reason the old single
 * letter could not express it:
 *
 *  * PHOTOSPHERIC UV, from the star's own temperature. The share of a blackbody's output shortward
 *    of the biological damage edge, straight out of Planck's law. This is what makes hot stars
 *    lethal: an O5 V emits a million times the Sun's damaging UV and sterilises its own habitable
 *    zone. A cool dwarf's photosphere emits essentially none.
 *  * CORONAL / FLARE IONISING OUTPUT, from the star's dynamo — `ionisingOutputSolar`, the module
 *    written for exactly this. This is what makes cool ACTIVE dwarfs dangerous despite emitting no
 *    photospheric UV worth the name, and it is the well-known argument about M-dwarf habitability.
 *    It responds to the star's own age and class through `flareActivity`, so an old, quiet M dwarf
 *    is correctly safer than a young one.
 *
 * NOTE it reads `flareActivity` but NOT `bodyIonisingOutputSolar`, which would take the stored
 * luminosity back in through the side door. Computed beats stored, all the way down.
 *
 * Both halves are expressed RELATIVE TO SOL and averaged, so Sol lands on the anchor by
 * construction and the constant keeps meaning what it says.
 */
export function calculateKillZone(
    star: CelestialBody,
    pack?: RulePack | null,
    allNodes?: (CelestialBody | Barycenter)[]
): number {
    const luminosity = getLuminosity(star);
    if (!(luminosity > 0)) return 0;

    const cfg = pack?.generation_parameters ?? {};
    const edgeNm = (cfg as any).uv_damage_edge_nm ?? UV_DAMAGE_EDGE_NM;
    const solAU = (cfg as any).kill_zone_sol_au ?? KILL_ZONE_SOL_AU;

    const tempK = star.temperatureK ?? 0;
    const solarUvShare = blackbodyFractionBelowNm(edgeNm, SOLAR_TEFF_K);
    const uvRelative = solarUvShare > 0
        ? (luminosity * blackbodyFractionBelowNm(edgeNm, tempK)) / solarUvShare
        : 0;

    const solarIonising = ionisingOutputSolar(1, SOLAR_FLARE_ACTIVITY);
    const ionisingRelative = solarIonising > 0
        ? ionisingOutputSolar(luminosity, (star as any).flareActivity) / solarIonising
        : 0;

    // Mean of the two, so a star that is lethal by EITHER route is lethal, and Sol is exactly 1.
    // Both halves are LINEAR in luminosity, so a megastructure's grey cut scales the radius as
    // sqrt(f) — a swarm inside the kill zone is, honestly, a radiation shield.
    const hazardRelative = (uvRelative + ionisingRelative) / 2;
    return occludedZoneDistance(star, allNodes, (f) => solAU * Math.sqrt(Math.max(0, hazardRelative * f)));
}

/**
 * Calculates the Roche Limit for a celestial body.
 * This is the distance within which a celestial body held together only by its own gravity
 * will disintegrate due to a second celestial body's tidal forces.
 * @param primary The primary body (e.g., a planet).
 * @returns The Roche limit in AU.
 */

const AU_KM = 149597870.7;

/**
 * Calculates the distance from a star where a given equilibrium temperature would be found.
 * @param star The star to calculate the distance from.
 * @param tempK The equilibrium temperature in Kelvin.
 * @returns The distance in AU.
 */
/**
 * The distance at which a given equilibrium temperature is found — the inverse of the equilibrium
 * relation, `a = R_star (T_star / T_eq)^2 / 2`. Exported for `system/modifiers.ts`, which needs to
 * turn a TYPE's declared temperature band into an orbital band when it places a new body (B84).
 */
export function getDistanceForTemperature(star: CelestialBody, tempK: number): number {
    if (!star.temperatureK || !star.radiusKm) return 0;

    // Using the simplified equilibrium temperature formula: a = R_star * (T_star / T_eq)^2 / 2
    const a_km = star.radiusKm * Math.pow(star.temperatureK / tempK, 2) / 2;
    return a_km / AU_KM;
}

export function calculateRocheLimit(primary: CelestialBody): number {
    // Simplified Roche limit for a rigid satellite, D = R * (2 * rho_p / rho_s)^(1/3)
    // We assume the satellite has a density of rock (~3,000 kg/m^3) and the primary is a star.
    const primaryDensity = (primary.massKg || 0) / (4/3 * Math.PI * Math.pow((primary.radiusKm || 1) * 1000, 3));
    const satelliteDensity = 3000;
    const radius_km = (primary.radiusKm || SOLAR_RADIUS_KM);
    return (radius_km * Math.pow(2 * (primaryDensity / satelliteDensity), 1/3)) / AU_KM;
}

export function calculateSilicateLine(star: CelestialBody, allNodes?: (CelestialBody | Barycenter)[]): number {
    return getCompanionAdjustedTemperatureLineDistance(star, 1400, allNodes);
}

export function calculateSootLine(star: CelestialBody, allNodes?: (CelestialBody | Barycenter)[]): number {
    return getCompanionAdjustedTemperatureLineDistance(star, 500, allNodes);
}

export function calculateGoldilocksZone(
    star: CelestialBody,
    allNodes?: (CelestialBody | Barycenter)[]
): { inner: number; outer: number } {
    // Replace legacy blackbody 373K/273K band with a conservative
    // Kopparapu-style HZ: Runaway Greenhouse (inner) to Maximum Greenhouse (outer).
    // This keeps a single HZ band in the UI/generation while aligning to common literature.
    const teff = star.temperatureK || SOLAR_TEFF_K;
    const luminosity = getLuminosity(star);

    // Valid range in published fits; clamp for stability on exotic stars.
    const tStar = Math.max(2600, Math.min(7200, teff)) - 5780;

    const seff = (s: { seffSun: number; a: number; b: number; c: number; d: number }) =>
        s.seffSun + (s.a * tStar) + (s.b * tStar ** 2) + (s.c * tStar ** 3) + (s.d * tStar ** 4);

    // Kopparapu et al. parameterization (conservative HZ pair).
    const runawayGreenhouse = seff({
        seffSun: 1.107,
        a: 1.332e-4,
        b: 1.58e-8,
        c: -8.308e-12,
        d: -1.931e-15
    });
    const maximumGreenhouse = seff({
        seffSun: 0.356,
        a: 6.171e-5,
        b: 1.698e-9,
        c: -3.198e-12,
        d: -5.575e-16
    });

    const safeInnerSeff = Math.max(1e-6, runawayGreenhouse);
    const safeOuterSeff = Math.max(1e-6, maximumGreenhouse);
    const safeLuminosity = Math.max(1e-6, luminosity);

    // Close binary adjustment: include flux from sibling stars sharing the same barycenter.
    // The occlusion factor f scales only the HOST's light (see occludedZoneDistance's header).
    const context = getNearestCompanionFluxContext(star, allNodes);
    const solveEdge = (seff: number) => (f: number) =>
        context
            ? solveCompanionAdjustedDistanceAu(safeLuminosity * f, context.companionLuminosity, context.separationAu, seff)
            : Math.sqrt((safeLuminosity * f) / seff);
    const inner = occludedZoneDistance(star, allNodes, solveEdge(safeInnerSeff));
    const outer = occludedZoneDistance(star, allNodes, solveEdge(safeOuterSeff));

    return {
        inner: Math.min(inner, outer),
        outer: Math.max(inner, outer)
    };
}

function getNodeById(allNodes: (CelestialBody | Barycenter)[], id: string | null | undefined): CelestialBody | Barycenter | undefined {
    if (!id) return undefined;
    return allNodes.find((n) => n.id === id);
}

function getCompanionStars(host: CelestialBody, allNodes: (CelestialBody | Barycenter)[]): CelestialBody[] {
    const parent = getNodeById(allNodes, host.parentId);
    if (!parent || parent.kind !== 'barycenter') return [];
    return allNodes.filter((n) =>
        n.kind === 'body' &&
        n.roleHint === 'star' &&
        n.id !== host.id &&
        n.parentId === parent.id
    ) as CelestialBody[];
}

function estimateStarSeparationAu(host: CelestialBody, companion: CelestialBody): number {
    const hostA = host.orbit?.elements?.a_AU || 0;
    const companionA = companion.orbit?.elements?.a_AU || 0;
    const summed = hostA + companionA;
    if (summed > 0) return summed;
    return 1e6;
}

function getNearestCompanionFluxContext(
    star: CelestialBody,
    allNodes?: (CelestialBody | Barycenter)[]
): { companionLuminosity: number; separationAu: number } | null {
    if (!allNodes || allNodes.length === 0) return null;
    const companions = getCompanionStars(star, allNodes);
    if (companions.length === 0) return null;

    let nearestCompanion = companions[0];
    let nearestSeparationAu = estimateStarSeparationAu(star, nearestCompanion);
    for (let i = 1; i < companions.length; i++) {
        const sep = estimateStarSeparationAu(star, companions[i]);
        if (sep < nearestSeparationAu) {
            nearestSeparationAu = sep;
            nearestCompanion = companions[i];
        }
    }

    return {
        companionLuminosity: getLuminosity(nearestCompanion),
        separationAu: nearestSeparationAu
    };
}

function solveCompanionAdjustedDistanceAu(
    hostLuminosity: number,
    companionLuminosity: number,
    companionSeparationAu: number,
    targetSeff: number
): number {
    const s = Math.max(1e-6, companionSeparationAu);
    const seff = Math.max(1e-6, targetSeff);
    const l1 = Math.max(1e-9, hostLuminosity);
    const l2 = Math.max(0, companionLuminosity);

    // Solve for x = r^2 from:
    // seff = l1/x + l2/(x + s^2)
    // -> seff*x^2 + (seff*s^2 - l1 - l2)*x - l1*s^2 = 0
    const a = seff;
    const b = (seff * s * s) - l1 - l2;
    const c = -l1 * s * s;
    const disc = Math.max(0, (b * b) - (4 * a * c));
    const x = (-b + Math.sqrt(disc)) / (2 * a);
    if (x <= 0) return Math.sqrt(l1 / seff);
    return Math.sqrt(x);
}

export function equivalentFluxDistanceAU(a_AU: number, e: number): number {
    const a = Math.max(0, a_AU || 0);
    const ecc = Math.max(0, Math.min(0.99, e || 0));
    return a * Math.pow(1 - (ecc * ecc), 0.25);
}

function getCompanionAdjustedTemperatureLineDistance(
    star: CelestialBody,
    tempK: number,
    allNodes?: (CelestialBody | Barycenter)[]
): number {
    const baseDistance = getDistanceForTemperature(star, tempK);
    if (baseDistance <= 0) return 0;

    const context = getNearestCompanionFluxContext(star, allNodes);
    const hostLuminosity = Math.max(1e-9, getLuminosity(star));
    // The line is a flux threshold, so the clear-sky distance defines it and a distance under
    // dimmed light scales as sqrt(f) — through the companion solver when there is one, since the
    // companion's own light is not intercepted by this star's structures.
    const targetSeff = hostLuminosity / Math.max(1e-12, baseDistance * baseDistance);
    return occludedZoneDistance(star, allNodes, (f) =>
        context
            ? solveCompanionAdjustedDistanceAu(hostLuminosity * f, context.companionLuminosity, context.separationAu, targetSeff)
            : baseDistance * Math.sqrt(f)
    );
}

export function calculateFrostLine(star: CelestialBody, allNodes?: (CelestialBody | Barycenter)[]): number {
    return getCompanionAdjustedTemperatureLineDistance(star, 125, allNodes);
}

export function calculateFormationFrostLine(star: CelestialBody, allNodes?: (CelestialBody | Barycenter)[]): number {
    return getCompanionAdjustedTemperatureLineDistance(star, 170, allNodes);
}

export function calculateCO2IceLine(star: CelestialBody, allNodes?: (CelestialBody | Barycenter)[]): number {
    return getCompanionAdjustedTemperatureLineDistance(star, 70, allNodes);
}

export function calculateCOIceLine(star: CelestialBody, allNodes?: (CelestialBody | Barycenter)[]): number {
    return getCompanionAdjustedTemperatureLineDistance(star, 30, allNodes);
}

function getSpectralAlpha(star: CelestialBody): number {
    if (!star.classes || star.classes.length === 0) return 0.09; // Default G-like
    const spectralType = star.classes[0].split('/')[1]?.[0] || 'G';
    
    switch (spectralType) {
        case 'O': return 1.5;   // Extremely fast
        case 'B': return 0.8; 
        case 'A': return 0.3;
        case 'F': return 0.15;
        case 'G': return 0.09;  // Sun-like (~70% ZAMS luminosity vs current at 4.6 Gyr)
        case 'K': return 0.03;
        case 'M': return 0.005; // Nearly static
        default: return 0.09;
    }
}

/**
 * THE STAR A BODY ULTIMATELY ORBITS, AND HOW FAR FROM IT THE BODY SITS.
 *
 * A frost line is a property of the STAR's radiation field, so "is this body beyond the frost line"
 * has to be asked about the star and about the body's HELIOCENTRIC distance. For a moon both of
 * those come from its PLANET: the moon's frost line is its star's, evaluated at the planet's orbit,
 * because a moon sits essentially the same distance from the star as the world it circles.
 *
 * The generators used to get this wrong twice over (see GEN-4): they derived a frost line from
 * whatever the immediate host happened to be — which for a moon is the PLANET, giving a "frost line"
 * computed from Jupiter's mass — and then compared it against the moon's distance from that planet.
 */
export function stellarContextFor(
    host: CelestialBody | Barycenter,
    aAU: number,
    allNodes?: (CelestialBody | Barycenter)[],
    depth = 0
): { star: CelestialBody | null; distanceAU: number } {
    const nodes = allNodes ?? [];
    // A corrupt parent chain can be cyclic; a hierarchy this deep is not real either way.
    if (depth > 8) return { star: null, distanceAU: aAU };

    if (host.kind === 'body' && (host as CelestialBody).roleHint === 'star') {
        return { star: host as CelestialBody, distanceAU: aAU };
    }
    if (host.kind === 'barycenter') {
        // Circumbinary: the pair's brightest member is the one that sets the zones.
        const stars = nodes.filter(
            (n): n is CelestialBody => n.kind === 'body' && (n as CelestialBody).roleHint === 'star' && n.parentId === host.id
        );
        const primary = stars.sort((a, b) => (b.massKg || 0) - (a.massKg || 0))[0] ?? null;
        return { star: primary, distanceAU: aAU };
    }

    // The host is a planet or a moon, so the body being asked about is a satellite: step UP to the
    // host's own orbit and ask again. Guard against a malformed parent chain rather than recursing
    // forever on it.
    const parent = nodes.find((n) => n.id === host.parentId);
    const hostA = (host as CelestialBody).orbit?.elements?.a_AU;
    if (!parent || typeof hostA !== 'number') return { star: null, distanceAU: aAU };
    return stellarContextFor(parent, hostA, nodes, depth + 1);
}

export function calculateAllStellarZones(
    star: CelestialBody,
    pack?: RulePack,
    allNodes?: (CelestialBody | Barycenter)[],
    age_Gyr: number = 4.6
): Record<string, any> {
    const killZone = calculateKillZone(star, pack, allNodes);
    const dangerZoneMultiplier = pack?.generation_parameters?.danger_zone_multiplier || 5;
    const dangerZone = killZone * dangerZoneMultiplier;
    
    // Luminosity context for frost lines
    const alpha = getSpectralAlpha(star);
    const currentLuminosity = getLuminosity(star);
    
    // Back-calculate luminosity at age 0 (ZAMS)
    // L_now = L_zams * (1 + alpha * age)
    const zamsFactor = 1 / (1 + (alpha * age_Gyr));
    
    // Create a temporary proxy star for the formation calculation (Lower L)
    const formationStar = { ...star, temperatureK: (star.temperatureK || SOLAR_TEFF_K) * Math.pow(zamsFactor, 0.25) };
    
    // Current Frost Line: Vacuum ice stability today (~125K)
    const currentFrostLine = calculateFrostLine(star, allNodes);
    
    // Formation Frost Line: Disk ice stability during birth (~170K)
    const formationFrostLine = calculateFormationFrostLine(formationStar, allNodes);

    const coIceLine = calculateCOIceLine(star, allNodes);
    const systemLimitAu = coIceLine * 2;

    return {
        killZone: killZone,
        dangerZone: dangerZone,
        goldilocks: calculateGoldilocksZone(star, allNodes),
        silicateLine: calculateSilicateLine(star, allNodes),
        sootLine: calculateSootLine(star, allNodes),
        frostLine: currentFrostLine, // Backward compatibility
        currentFrostLine: currentFrostLine,
        formationFrostLine: formationFrostLine,
        co2IceLine: calculateCO2IceLine(star, allNodes),
        coIceLine: coIceLine,
        systemLimitAu: systemLimitAu,
    };
}
