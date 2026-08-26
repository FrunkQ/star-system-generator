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
//  THE OTHER HALF OF THE SAME PAPER LIVES HERE TOO (B91). Holman & Wiegert fitted TWO critical
//  radii, and an engine that has one and not the other gets pair members visibly wrong: a member's
//  drawn Hill sphere was computed from its WOBBLE about the barycentre, which made Pluto's bubble
//  four times SMALLER than Charon's despite Pluto being 8.2x the mass. The S-type (circumstellar)
//  fit is the right bound for "what can ONE member of a pair hold on to":
//
//    a_c / a_b = 0.464 - 0.380*mu - 0.631*e_b + 0.586*mu*e_b + 0.150*e_b^2 - 0.198*mu*e_b^2
//
//  with mu the COMPANION's mass fraction, so it is the OTHER body that shrinks your region — which
//  is why the heavier member correctly gets the bigger one. Sampled over 0.1 <= mu <= 0.9 and
//  0 <= e_b <= 0.8. Checked here 2026-08-26: Pluto (mu 0.108) holds satellites to ~8,200 km and
//  Charon (mu 0.892) to ~2,400 km, against a 19,448 km separation — the right way round, and both
//  comfortably outside either body.
//
//  (The file is named for the circumbinary half because that is what it was built for; it is the one
//  binary-stability convention and BOTH fits belong in it rather than drifting apart in two files.)
//
//  OUTER EDGE — the pair's combined-mass Hill radius within its PARENT's gravity. That radius is
//  NOT computed here: it is the stability pass's own quantity (`hillRadiusAU` in stability.ts, the
//  periapsis-based form) and is passed in, so the bubble the engine JUDGES against and the ring it
//  DRAWS can never be two different numbers.

import type { CelestialBody, Barycenter } from '../types';

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

/** A member's mass, whether it is a star/planet or a tighter pair standing in for one. */
function memberMassKg(node: CelestialBody | Barycenter): number {
  return node.kind === 'barycenter'
    ? (node as Barycenter).effectiveMassKg || 0
    : (node as CelestialBody).massKg || 0;
}

/** Holman & Wiegert (1999) S-type coefficients, in the order
 *  [const, mu, e_b, mu*e_b, e_b^2, mu*e_b^2]. Verified in-session 2026-08-26, same as the P-type set. */
export const HW99_S_TYPE_COEFFS = [0.464, -0.380, -0.631, 0.586, 0.150, -0.198] as const;

/** The mass-ratio range H&W sampled for the S-type grid. Wider than the P-type one, because which
 *  member you orbit matters here and mu is not symmetric. */
export const HW99_S_TYPE_MU_RANGE: readonly [number, number] = [0.1, 0.9];

/** a_c / a_b for an S-TYPE orbit: the OUTERMOST orbit that survives around ONE member of a pair.
 *  `muCompanion` is the OTHER body's mass fraction, because the companion is what limits you, so a
 *  heavier companion returns a smaller number. Floored at zero: as mu approaches 1 the polynomial
 *  goes negative, which means "no stable region at all", and 0 says that without the sign trap. */
export function sTypeCriticalRatio(muCompanion: number, eB: number): number {
  const [c0, c1, c2, c3, c4, c5] = HW99_S_TYPE_COEFFS;
  return Math.max(0,
    c0 + c1 * muCompanion + c2 * eB + c3 * muCompanion * eB + c4 * eB * eB + c5 * muCompanion * eB * eB);
}

/** The S-type critical semi-major axis in AU: how far out ONE member of a pair holds satellites. */
export function sTypeCriticalAU(sepAU: number, muCompanion: number, eB: number): number {
  if (!(sepAU > 0)) return 0;
  return sepAU * sTypeCriticalRatio(muCompanion, eB);
}

/** THE SATELLITE LIMIT FOR ONE MEMBER OF A PAIR, in AU, read straight off the two members (B91).
 *  This is what a pair member's drawn bubble should be: not its Hill radius about the barycentre,
 *  which is a function of its own wobble and inverts the pair, but the region its companion leaves
 *  it. Returns null when the two are not a real pair with masses and orbits. */
export function memberSatelliteLimitAU(
  member: CelestialBody | Barycenter | undefined,
  companion: CelestialBody | Barycenter | undefined
): number | null {
  if (!member || !companion) return null;
  const mSelf = memberMassKg(member);
  const mOther = memberMassKg(companion);
  if (!(mSelf > 0) || !(mOther > 0)) return null;
  const sepAU = (member.orbit?.elements.a_AU || 0) + (companion.orbit?.elements.a_AU || 0);
  if (!(sepAU > 0)) return null;
  const eB = Math.max(
    Math.max(0, Math.min(0.999, member.orbit?.elements.e || 0)),
    Math.max(0, Math.min(0.999, companion.orbit?.elements.e || 0)));
  const r = sTypeCriticalAU(sepAU, mOther / (mSelf + mOther), eB);
  return r > 0 ? r : null;
}

/** HOW HEAVY A CIRCUMBINARY BODY MAY BE BEFORE IT STOPS BEING A TEST PARTICLE, in kg.
 *
 *  THIS BAR IS OURS, NOT HOLMAN & WIEGERT'S, and the distinction matters: their grid is MASSLESS
 *  test particles, so the fit does not place a limit on a heavy third body - it simply stops
 *  applying to it. A body comparable to the pair makes this a genuine three-body problem, where the
 *  annulus is not a meaningful boundary and nothing in this engine models what happens instead.
 *
 *  A thousandth of the pair's mass is the bar: small enough that the back-reaction on the binary is
 *  negligible over the 10^4 orbits the fit was measured across, and it scales sensibly at both ends
 *  - roughly a 200 km icy moon for Pluto-Charon, whose real moons are far smaller, and about two
 *  Jupiters for a pair of sun-like stars, which is the right ceiling for a circumbinary planet.
 *
 *  IT IS A GUIDE, NOT A WALL. The GM may author straight past it and the stability pass will then
 *  say what it thinks, which is the arrangement this engine has everywhere. */
export const CIRCUMBINARY_TEST_PARTICLE_FRAC = 1e-3;
export function maxCircumbinaryMassKg(pairMassKg: number): number {
  return pairMassKg > 0 ? pairMassKg * CIRCUMBINARY_TEST_PARTICLE_FRAC : 0;
}

/** Build the annulus for a pair from its two members. Returns null when the pair is not a real
 *  two-member pair with masses and orbits — a partial barycentre publishes nothing rather than a
 *  plausible-looking zero.
 *
 *  A MEMBER MAY ITSELF BE A BARYCENTRE, which is how every hierarchical triple in the bundled maps
 *  is built (Alpha Centauri, Polaris and Algol all pair an inner binary with an outer star). Holman
 *  & Wiegert's fit is a two-point-mass result, so treating a tight inner pair as one point is an
 *  APPROXIMATION — and it is the same approximation the hierarchy itself is built on, since each
 *  level's separation widens by roughly 7x precisely so the level below acts as a point mass. It
 *  breaks down if a "hierarchy" is not actually hierarchical, which the pair-tightness test in
 *  stability.ts is the thing that catches. Excluding these instead was a point restriction that
 *  left three of the bundled triples publishing nothing at all.
 *
 *  `hillRadiusAU` is the pair's combined-mass Hill radius within its parent, computed by the
 *  stability pass and passed in; omit it for a root barycentre. */
export function circumbinaryAnnulus(
  memberA: CelestialBody | Barycenter | undefined,
  memberB: CelestialBody | Barycenter | undefined,
  hillRadiusAU?: number
): CircumbinaryAnnulus | null {
  if (!memberA || !memberB) return null;
  const mA = memberMassKg(memberA);
  const mB = memberMassKg(memberB);
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
