import type { CelestialBody, RulePack, OrbitalSpacingRules } from '../types';
import { SeededRNG } from '../rng';
import { drawFromBand, randomFromRange } from '../utils';
import { EARTH_MASS_KG, SOLAR_MASS_KG } from '../constants';
import { calculateAllStellarZones, calculateRocheLimit } from '../physics/zones';

/**
 * WHERE PLANETS GO, IN UNITS OF THE STAR RATHER THAN UNITS OF THE SOLAR SYSTEM.
 *
 * This used to evaluate the Titius-Bode law with the pack's `a`, `b`, `c` in ABSOLUTE AU, which
 * meant every star in the catalogue — a red dwarf, a brown dwarf, a supergiant — was handed the
 * Solar System's own nine positions and then had the ones outside its zones filtered away. A user
 * reported the symptom exactly: planets never closer than about 0.5 AU whatever the star, and brown
 * dwarf systems sprawling far outside anything the star could warm (inbox B58). TRAPPIST-1's seven
 * real planets all sit between 0.011 and 0.062 AU, so we were placing M-dwarf worlds ten to forty
 * times too far out, and around an L dwarf about a hundredfold out.
 *
 * The replacement is the observed regularity rather than the numerological one. Adjacent planets in
 * real multi-planet systems are separated by a roughly constant number of MUTUAL HILL RADII,
 *
 *     R_H,mut = ((m1 + m2) / (3 M*))^(1/3) x (a1 + a2) / 2
 *
 * with Kepler's multis clustering near 20 (Weiss et al. 2018) and gigayear stability needing
 * roughly 10 or more (Pu & Wu 2015). Three properties earn it its place here:
 *
 *   - THE STELLAR MASS IS IN THE EXPRESSION, so spacing scales with the star for free. No per-class
 *     lookup table, and no chance of a Sol-shaped constant surviving in it.
 *   - THE PLANET MASSES ARE IN IT, so a giant clears more room than a terrestrial. That is the
 *     physical reason Jupiter's neighbourhood is empty, and it now falls out instead of being drawn.
 *   - IT PACKS OUTWARD from an inner edge instead of sampling a fixed list, so a compact seven-world
 *     system inside 0.06 AU is representable at all. Under Titius-Bode it was arithmetically
 *     impossible, and the shuffle-and-slice that followed threw away most of what did survive.
 *
 * Rearranged for packing: with k = N x h / 2, h = ((m1 + m2) / (3 M*))^(1/3) and N the separation
 * drawn in mutual Hill radii, a2 - a1 = N x R_H,mut solves to a2 = a1 (1 + k) / (1 - k).
 *
 * EVERY NUMBER IS PACK DATA (`generation_parameters.orbital_spacing`). Nothing about Sol appears
 * here, and Sol is a CHECK on the result, never a target: a Sun-like star should come out Sol-LIKE
 * in scale, not with Sol's orbits.
 */

/** The masses that set a gap are a PROXY, not the masses the caller will later assign — see GEN-2. */
function drawSpacingMassEarth(
    rng: SeededRNG, rules: OrbitalSpacingRules, aAU: number, formationFrostAU: number,
    starMassKg: number, previousMassEarth: number | null
): number {
    // Beyond the formation frost line the disc's solid surface density jumps and giants become
    // available; inside it, only rock and iron are condensed. Same criterion the body generators use.
    const band = aAU > formationFrostAU
        ? rules.spacing_mass_earth_outside_frost
        : rules.spacing_mass_earth_inside_frost;

    // A disc cannot build a planet out of proportion to the star that lit it: the most massive
    // companion scales with stellar mass, which is why M dwarfs so rarely carry a Jupiter. Clamping
    // the band by the star keeps the giant branch from handing a brown dwarf a super-Jupiter.
    const capEarth = (starMassKg / EARTH_MASS_KG) * rules.max_planet_mass_stellar_fraction;
    const lo = Math.min(band[0], capEarth);
    const hi = Math.min(band[1], capEarth);
    const fresh = drawFromBand(rng, [lo, Math.max(lo, hi)], 'log');

    // "Peas in a pod" (Weiss et al. 2018, the same paper as the spacing): adjacent planets in a
    // system tend to resemble each other in size far more than randomly drawn pairs would. Blend in
    // the log domain so the correlation is multiplicative, which is how the observation is stated.
    if (previousMassEarth === null || rules.peas_in_a_pod <= 0) return fresh;
    const w = Math.min(1, rules.peas_in_a_pod);
    return Math.exp(w * Math.log(previousMassEarth) + (1 - w) * Math.log(fresh));
}

export function calculateOrbitalSlots(
    star: CelestialBody,
    pack: RulePack,
    rng: SeededRNG,
    numBodies: number
): number[] {
    if (numBodies <= 0) return [];

    const stellarZones = calculateAllStellarZones(star, pack);
    const systemLimitAu = stellarZones.systemLimitAu;

    // THE INNER EDGE, FROM THE ENGINE'S OWN ZONES RATHER THAN TWO HAND-ROLLED COPIES.
    // This file used to compute its own Roche limit as `2.44 * R_star`, which drops the DENSITY
    // ratio the Roche limit is made of, and its own "soot line" at 1800 K while `zones.ts` calls the
    // 500 K line by that name. Both were wrong at the ends of the stellar range and only looked
    // right for main-sequence stars: measured against `calculateRocheLimit`, the 2.44R form is
    // 26,000x TOO SMALL for a neutron star and 26x too small for a white dwarf (so planets could be
    // placed inside the radius that would shred them), and ~900x TOO LARGE for an M supergiant.
    // The silicate line is already the engine's name for where dust can condense at all.
    const rocheLimitAU = calculateRocheLimit(star);
    const minOrbitAU = rocheLimitAU * 1.2; // 20% buffer

    const rules = pack.generation_parameters?.orbital_spacing;

    if (rules) {
        const starMassKg = star.massKg || SOLAR_MASS_KG;
        const formationFrostAU = stellarZones.formationFrostLine;

        // WHERE THE FIRST PLANET SITS. Not the inner edge — real innermost planets are spread over
        // more than a decade of orbits (Mercury at 0.39 AU, TRAPPIST-1b at 0.011, and Kepler's
        // innermost worlds routinely inside 0.02) — but drawn across the warm disc, log-uniformly
        // because the range spans decades and a linear draw would concentrate it at the top
        // (inbox B56). Both ends are anchored on zones the engine already derives from the star's
        // own luminosity, so the whole chain moves with the star.
        const dustEdgeAU = Math.max(minOrbitAU, stellarZones.silicateLine);
        const firstLo = Math.max(dustEdgeAU, formationFrostAU * rules.inner_edge_frost_fraction[0]);
        // A very cold dwarf has its formation frost line INSIDE its own Roche/dust floor: there is no
        // warm disc at all, and everything it can keep is icy. The chain then simply starts at the
        // floor rather than collapsing to an empty list, which is what produced silent zero-planet
        // Y-dwarf systems before (B58). Deliberate, and flagged to the owner rather than assumed.
        const firstHi = Math.max(firstLo, Math.min(formationFrostAU * rules.inner_edge_frost_fraction[1], systemLimitAu));
        let a = firstHi <= firstLo ? firstLo : drawFromBand(rng, [firstLo, firstHi], 'log');

        // ONE SEPARATION SCALE PER SYSTEM, not per gap — and this is the parameter that decides
        // whether a system comes out TRAPPIST-1-shaped or Sol-shaped. Weiss et al. find spacing far
        // more uniform WITHIN a system than BETWEEN systems, and the two anchors bear it out:
        // Kepler's compact multis sit at roughly 10 to 20 mutual Hill radii, while Sol's own inner
        // planets are at 27 (Venus-Earth), 40 (Earth-Mars) and 63 (Mercury-Venus). Drawing every gap
        // independently from one band averages those two populations into a single middling one that
        // is neither: it produced only compact systems, so a Sun-like star never reached its own
        // frost line and therefore never grew a giant beyond it (measured: 13% of Sol systems with a
        // giant, median 1.0 AU, i.e. inside the frost line at 4.97). Drawing the scale ONCE and
        // varying gaps modestly around it reproduces both populations.
        const sysSeparation = randomFromRange(rng, rules.separation_hill_radii[0], rules.separation_hill_radii[1]);

        const slots: number[] = [];
        let mPrev: number | null = null;
        while (slots.length < numBodies && a < systemLimitAu) {
            slots.push(a);
            const m1 = mPrev ?? drawSpacingMassEarth(rng, rules, a, formationFrostAU, starMassKg, null);
            const m2 = drawSpacingMassEarth(rng, rules, a, formationFrostAU, starMassKg, m1);

            const h = Math.cbrt(((m1 + m2) * EARTH_MASS_KG) / (3 * starMassKg));
            // Never below the pack's stability floor — a chain that packed tighter than that would
            // not survive the age the system is about to be told it has.
            const spread = rules.separation_gap_spread ?? 0;
            const sep = Math.max(rules.stability_floor_hill_radii,
                sysSeparation * randomFromRange(rng, 1 - spread, 1 + spread));
            const k = (sep * h) / 2;
            // k >= 1 means the required gap runs away to infinity: two bodies that massive cannot sit
            // that far apart around a star this light, so the disc simply has no next slot.
            if (!(k < 1)) break;

            a = a * (1 + k) / (1 - k);
            mPrev = m2;
        }
        // NO POST-HOC JITTER. The old code multiplied each slot by +/-10% after the fact, which can
        // push an adjacent pair back under the stability floor the spacing was just chosen to respect.
        // The randomness lives in the draws that have physical meaning instead: the first orbit, the
        // per-gap separation and the masses.
        return slots;
    }

    // Fallback for a pack that declares no spacing rules: geometric spacing off the star's own inner
    // edge. This branch was previously unreachable (every shipped pack carried a Titius-Bode block),
    // and its old `Math.max(minOrbitAU, 0.2)` floor was the same absolute-AU fault in miniature — a
    // 0.2 AU floor is most of a brown dwarf's entire system. Now that the branch can actually run,
    // the floor is the star's own.
    const orbitalSlotsAU: number[] = [];
    let lastApoapsisAU = minOrbitAU;

    for (let i = 0; i < numBodies; i++) {
        // Geometric progression: r_next = r_current * multiplier
        const multiplier = randomFromRange(rng, 1.4, 2.2);
        const newA_AU = lastApoapsisAU * multiplier;
        if (newA_AU > systemLimitAu) break;
        orbitalSlotsAU.push(newA_AU);
        const ecc = randomFromRange(rng, 0.01, 0.15);
        lastApoapsisAU = newA_AU * (1 + ecc);
    }
    return orbitalSlotsAU;
}
