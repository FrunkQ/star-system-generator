// THE ONE CIRCUMBINARY-ANNULUS CONVENTION (G45). A P-type (circumbinary) body orbits BOTH members
// of a pair, and it does not live "outside the binary" — it lives in an ANNULUS with two edges. Every
// consumer that needs either edge — the stability pass, the generator's planet placer, the physics
// explainers, and the overlay that will draw the ring — must come HERE. Do not restate the fit or the
// bands anywhere else: before this module the inner edge existed as TWO disagreeing constants in the
// generator (`1.60 * separation` in planet-generation.ts and `P_TYPE_FRAC = 2.3` in
// generateFromConfig.ts, which are the mu=0 and mu=0.5 corners of the same polynomial), and the
// physics pass had no inner edge at all — so a planet could be authored, or generated, into a zone
// the engine could not judge.
//
// THE MATHS, reference-checked in-session 2026-08-26 against Holman & Wiegert (1999),
// "Long-Term Stability of Planets in Binary Systems", AJ 117, 621 (doi:10.1086/300695).
//
//  INNER EDGE — the CRITICAL SEMI-MAJOR AXIS for P-type orbits. H&W integrated massless test
//  particles on initially circular, prograde, coplanar orbits around a binary for 10^4 binary
//  periods and least-squares fitted the lowest surviving semi-major axis:
//
//    a_c / a_b = (1.60 +/- 0.04)
//              + (5.10 +/- 0.05) * e_b
//              + (-2.2 +/- 0.11) * e_b^2
//              + (4.12 +/- 0.09) * mu
//              + (-4.27 +/- 0.17) * e_b * mu
//              + (-5.09 +/- 0.11) * mu^2
//              + (4.61 +/- 0.36) * e_b^2 * mu^2
//
//    a_b = the pair's MUTUAL SEMI-MAJOR AXIS (a1 + a2), not its apoapsis separation.
//    mu  = m2 / (m1 + m2), the LIGHTER member's mass fraction, so 0 < mu <= 0.5.
//    e_b = the pair's mutual orbital eccentricity.
//
//  STATED VALIDITY RANGE: 0.1 <= mu <= 0.5 and 0.0 <= e_b <= 0.7 (the abstract says 0.7-0.8).
//  WHAT WE DO OUTSIDE IT, said out loud rather than extrapolated silently: we evaluate the same
//  polynomial and set `fitExtrapolated`, which the explainers print. Clamping mu or e_b instead
//  would hand back a confident-looking number for a pair the fit never saw, which is the worse lie.
//  The two directions are not symmetric and the difference is worth knowing:
//    - mu < 0.1 (a very unequal pair): the polynomial decays smoothly to 1.60*a_b at mu = 0, where
//      the true limit should collapse toward zero (a "pair" with no secondary forbids nothing). So
//      the extrapolation is CONSERVATIVE — it forbids more room than reality does.
//    - e_b > 0.7: the polynomial keeps growing, which is the right DIRECTION (a more eccentric pair
//      clears a wider hole), but the magnitude is untested. Treat it as an order of magnitude.
//
//  THE EDGE IS NOT A CLEAN LINE, and H&W say so themselves: instability islands sit BEYOND a_c at
//  mean-motion resonances with the pair, so a_c is a LOWER BOUND on the fully clear zone rather
//  than a wall. That is what CIRCUMBINARY_EDGE_FACTOR encodes.
//
//  SANITY CHECK against a real system, computed here 2026-08-26: Kepler-16 (AB) has
//  m1 = 0.6897 Msun, m2 = 0.20255 Msun (mu = 0.2270), a_b = 0.22431 AU, e_b = 0.15944, giving
//  a_c / a_b = 2.88 and a_c = 0.646 AU. Kepler-16b orbits at 0.7048 AU — 1.09x the critical radius,
//  which is the published result: it is the known circumbinary planet sitting closest to its own
//  stability limit. Second check, Pluto-Charon (mu = 0.1085, e_b ~ 0, a_b = 19,591 km): a_c / a_b =
//  1.99, a_c = 38,900 km — and Styx, the innermost small moon, orbits at 42,700 km. The real system
//  puts its circumbinary moons just outside the limit this fit draws.
//
//  OUTER EDGE — the pair's combined-mass Hill radius within its PARENT's gravity. That radius is
//  NOT computed here: it is the stability pass's own quantity (`hillRadiusAU` in stability.ts, the
//  periapsis-based form) and is passed in, so the bubble the engine JUDGES against and the ring it
//  DRAWS can never be two different numbers.

import type { CelestialBody } from '../types';

/** Holman & Wiegert (1999) P-type polynomial coefficients, in the order
 *  [const, e_b, e_b^2, mu, e_b*mu, mu^2, e_b^2*mu^2]. Quoted exactly as published; some
 *  restatements print the e_b^2 term as -2.22 rather than -2.2, a difference of about 0.02% on
 *  a_c at e_b = 0.16 and far inside the published +/-0.11 uncertainty on that coefficient. */
export const HW99_P_TYPE_COEFFS = [1.6, 5.1, -2.2, 4.12, -4.27, -5.09, 4.61] as const;

/** The mass-ratio range H&W actually sampled for the P-type grid. */
export const HW99_MU_RANGE: readonly [number, number] = [0.1, 0.5];
/** The binary-eccentricity range H&W actually sampled. */
export const HW99_E_RANGE: readonly [number, number] = [0.0, 0.7];

/** How far above the critical radius still counts as "on the edge" rather than clear. H&W publish
 *  only a_c and warn that mean-motion resonances leave unstable islands above it, so this factor is
 *  OURS, not theirs — it is the same 1.2x "right at the edge of the regime" band the co-orbital
 *  judgement in stability.ts already uses for the Gascheau margin, kept identical so the engine has
 *  one idea of "marginal" and not two. Kepler-16b, at 1.09x its own limit, lands inside it. */
export const CIRCUMBINARY_EDGE_FACTOR = 1.2;

/** The fraction of the combined Hill radius a circumbinary body can actually use. The stability
 *  pass calls apoapsis >= 0.5x the host's Hill radius "stolen by external tide"
 *  (assessHostBindingStability), so the annulus's outer edge is that same 0.5 — one number, so the
 *  verdict a body gets and the ring drawn around it agree by construction. */
export const CIRCUMBINARY_HILL_FRACTION = 0.5;

/** The stable annulus for P-type bodies around one barycentre. Every radius is in AU MEASURED FROM
 *  THE BARYCENTRE, and every radius is a SEMI-MAJOR AXIS, not an instantaneous distance. */
export interface CircumbinaryAnnulus {
  /** The pair's mutual semi-major axis, a1 + a2, in AU. Holman & Wiegert's a_b. NOT the apoapsis
   *  separation, which the pair-tightness test uses for a different question. */
  pairSeparationAU: number;
  /** The LIGHTER member's mass fraction, min(m1,m2)/(m1+m2), so 0 < mu <= 0.5. Taken from the
   *  lighter member deliberately: the annulus cannot depend on which star the data lists first. */
  massRatioMu: number;
  /** The pair's mutual orbital eccentricity (the larger of the two members' values, matching the
   *  convention the pair-tightness test already uses — one pair, one eccentricity). */
  eccentricity: number;
  /** a_c / a_b, dimensionless — the Holman & Wiegert ratio before it is scaled to AU. */
  criticalRatio: number;
  /** INNER EDGE, AU from the barycentre. The critical SEMI-MAJOR AXIS: a P-type orbit below this
   *  does not survive. Always present. */
  innerAU: number;
  /** The pair's combined-mass Hill radius within its PARENT's gravity, AU from the barycentre.
   *  ABSENT for a root barycentre, which has no parent to be tidally stripped by — such a pair has
   *  no in-system outer edge at all, and the annulus is open outward. */
  hillRadiusAU?: number;
  /** OUTER EDGE, AU from the barycentre: CIRCUMBINARY_HILL_FRACTION x hillRadiusAU. Absent exactly
   *  when hillRadiusAU is. */
  outerAU?: number;
  /** True when mu or e_b fell outside the grid H&W fitted, so innerAU is an extrapolation. The
   *  explainers print this; see the module header for which direction each one errs in. */
  fitExtrapolated: boolean;
}

/** a_c / a_b — the Holman & Wiegert (1999) critical ratio for a P-type orbit. Dimensionless.
 *  `mu` is the lighter member's mass fraction and `eB` the pair's eccentricity; both are used as
 *  given (see the header for why nothing is clamped). */
export function circumbinaryCriticalRatio(mu: number, eB: number): number {
  const [c0, c1, c2, c3, c4, c5, c6] = HW99_P_TYPE_COEFFS;
  return (
    c0 +
    c1 * eB +
    c2 * eB * eB +
    c3 * mu +
    c4 * eB * mu +
    c5 * mu * mu +
    c6 * eB * eB * mu * mu
  );
}

/** The critical semi-major axis in AU: the innermost stable P-type orbit around a pair of mutual
 *  semi-major axis `sepAU`. This is the ONE entry point for the inner edge — the generator's
 *  placer and the stability pass both call it. */
export function circumbinaryCriticalAU(sepAU: number, mu: number, eB: number): number {
  if (!(sepAU > 0)) return 0;
  return sepAU * circumbinaryCriticalRatio(mu, eB);
}

/** Is this pair inside the grid H&W fitted? */
export function circumbinaryFitExtrapolated(mu: number, eB: number): boolean {
  return mu < HW99_MU_RANGE[0] || mu > HW99_MU_RANGE[1] || eB < HW99_E_RANGE[0] || eB > HW99_E_RANGE[1];
}

/** Build the annulus for a pair from its two member bodies. Returns null when the pair is not a
 *  two-body pair with real masses and orbits — a partial barycentre publishes nothing rather than
 *  a plausible-looking zero.
 *
 *  `hillRadiusAU` is the pair's combined-mass Hill radius within its parent, computed by the
 *  stability pass and passed in; omit it for a root barycentre. */
export function circumbinaryAnnulus(
  memberA: CelestialBody | undefined,
  memberB: CelestialBody | undefined,
  hillRadiusAU?: number
): CircumbinaryAnnulus | null {
  if (!memberA || !memberB) return null;
  const mA = memberA.massKg || 0;
  const mB = memberB.massKg || 0;
  // BOTH masses, not their sum. A pair with one massless member is not a pair — mu comes out 0 and
  // the polynomial happily returns its mu=0 corner (1.60 x separation), which is a confident number
  // about a configuration that does not exist. Abstaining is the only honest answer.
  if (!(mA > 0) || !(mB > 0)) return null;
  const total = mA + mB;

  const aA = memberA.orbit?.elements.a_AU || 0;
  const aB = memberB.orbit?.elements.a_AU || 0;
  const sepAU = aA + aB;
  if (!(sepAU > 0)) return null;

  const eA = Math.max(0, Math.min(0.999, memberA.orbit?.elements.e || 0));
  const eB = Math.max(0, Math.min(0.999, memberB.orbit?.elements.e || 0));
  const eBin = Math.max(eA, eB);

  const mu = Math.min(mA, mB) / total;
  const criticalRatio = circumbinaryCriticalRatio(mu, eBin);

  const out: CircumbinaryAnnulus = {
    pairSeparationAU: sepAU,
    massRatioMu: mu,
    eccentricity: eBin,
    criticalRatio,
    innerAU: sepAU * criticalRatio,
    fitExtrapolated: circumbinaryFitExtrapolated(mu, eBin)
  };
  if (hillRadiusAU !== undefined && hillRadiusAU > 0) {
    out.hillRadiusAU = hillRadiusAU;
    out.outerAU = hillRadiusAU * CIRCUMBINARY_HILL_FRACTION;
  }
  return out;
}
