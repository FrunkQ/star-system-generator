import type { CelestialBody, Barycenter, System } from '../types';
import { stripForReprocess } from '../tags/tagLifecycle';
import { coOrbitalHold, lagrangePlacementId } from './lagrange';
import {
  circumbinaryAnnulus,
  CIRCUMBINARY_EDGE_FACTOR,
  type CircumbinaryAnnulus
} from './circumbinary';

type OrbitalNode = CelestialBody;

type Fate = 'infall' | 'eject' | 'collision' | 'inversion';
interface StabilityAssessment {
  severity: 0 | 1 | 2 | 3;
  reasons: string[];
  fate?: Fate;
  // Which node the FATE belongs to, when it belongs to only one of a pair (inbox B19). An
  // ejection is asymmetric: the light body is scattered and the heavy one is what scatters it, so
  // "Mars is flung out by a 16 km asteroid" is the wrong half of a correct verdict. A COLLISION
  // between comparable masses is symmetric and leaves this unset, so both members keep it.
  // Severity and reasons are never directional -- both bodies really are in a risky pair.
  fateNodeId?: string;
  // WHICH DRIVER PRODUCED THE FATE (inbox B24). `reasons` is a flat list collected from every test
  // that looked at this body, and the most severe one owns the fate — so a body could read "...a
  // locked mean-motion resonance keeps their conjunctions away from the crossing point" and then
  // "Predicted outcome: flung out", with nothing saying those came from different mechanisms. The
  // orbit-crossing test had spared the pair; the host-binding test had failed it. Both were right.
  // Carrying the fate's own reason lets the verdict be printed next to its cause.
  fateReason?: string;
  // EXTRA TAG KEYS this criterion wants on the body, beyond the severity and fate keys every
  // assessment already produces (G45). A severity says HOW BAD and a fate says WHICH WAY, but
  // neither says BY WHAT MECHANISM — "very unstable, flung out" reads identically whether a
  // neighbour crossed the orbit or the body sat inside a pair's forbidden hole, and those are not
  // the same thing to a GM deciding where to put a colony. A criterion with a name worth filtering
  // on declares it here rather than reaching past the merge. The emitter strips `stability/` on
  // every pass, so anything named here clears with the severities.
  tags?: string[];
}

const FATE_TEXT: Record<Fate, string> = {
  infall: 'Predicted outcome: spirals in — consumed by or tidally shredded against the host.',
  eject: 'Predicted outcome: flung out — gravitationally scattered onto an escape trajectory.',
  collision: 'Predicted outcome: collision — crossing orbits with a comparable-mass neighbour.',
  inversion: 'Predicted outcome: hierarchy is unphysical — the orbiter outweighs its host.',
};

function getHostMassKg(host: CelestialBody | Barycenter | undefined): number {
  if (!host) return 0;
  if (host.kind === 'barycenter') return host.effectiveMassKg || 0;
  return (host as CelestialBody).massKg || 0;
}

function getNodeMassKg(node: CelestialBody): number {
  return node.massKg || 0;
}

function getOrbitSafetyBandAU(node: CelestialBody): { periAU: number; apoAU: number } | null {
  if (!node.orbit) return null;
  const a = node.orbit.elements.a_AU || 0;
  const e = node.orbit.elements.e || 0;
  if (a <= 0) return null;
  return {
    periAU: a * (1 - e),
    apoAU: a * (1 + e)
  };
}

function severityLabel(severity: number): string | null {
  if (severity === 3) {
    return 'Very Unstable';
  }
  if (severity === 2) {
    return 'Unstable';
  }
  if (severity === 1) {
    return 'Marginal';
  }
  return null;
}

function severityDescription(severity: number): string | null {
  if (severity === 3) return 'Likely <1 kyr before major orbital disruption (collision/ejection/infall risk).';
  if (severity === 2) return 'Likely 1-100 Myr before disruption under sustained perturbations.';
  if (severity === 1) return 'Metastable; generally long-lived (>100 Myr to Gyr), but dynamically packed and perturbation-sensitive.';
  return null;
}

function mergeAssessment(target: StabilityAssessment, incoming: StabilityAssessment, targetId?: string) {
  // A directional fate only lands on the node it names (B19).
  const fateApplies = incoming.fate && (!incoming.fateNodeId || !targetId || incoming.fateNodeId === targetId);
  // The dominant (most-severe) driver owns the predicted fate.
  // The fate travels with the reason that produced it (B24), so the verdict can be printed beside
  // its own cause instead of beside whichever other test happened to speak last.
  if (incoming.severity > target.severity) {
    target.severity = incoming.severity as 0 | 1 | 2 | 3;
    if (fateApplies) { target.fate = incoming.fate; target.fateReason = incoming.reasons[0]; }
  } else if (!target.fate && fateApplies) {
    target.fate = incoming.fate;
    target.fateReason = incoming.reasons[0];
  }
  for (const reason of incoming.reasons) {
    if (!target.reasons.includes(reason)) target.reasons.push(reason);
  }
  if (incoming.tags?.length) {
    if (!target.tags) target.tags = [];
    for (const key of incoming.tags) if (!target.tags.includes(key)) target.tags.push(key);
  }
}

// THE HILL RADIUS THIS FILE JUDGES AGAINST, in AU, and there is now one of it (G45). It was
// computed identically in two places — the pair-tightness test and the host-binding test — and a
// third reader was about to arrive when the circumbinary annulus needed the same number. Two copies
// of one quantity is the fault this codebase has most often; the annulus's outer edge and the
// verdict a body gets there must come from the same arithmetic or they will drift.
//
// PERIAPSIS-BASED, deliberately: the host's grip is weakest at closest approach to ITS host, so an
// eccentric orbit's Hill sphere is judged at periapsis. That is the conservative form and it is what
// both callers already used.
//
// NOT THE ONLY HILL RADIUS IN THE ENGINE, and the difference matters to whoever draws this: the
// overlay's sphere (`twoBodyCoast.ts`) uses the SEMI-MAJOR AXIS with no (1-e) factor, so on an
// eccentric orbit the drawn bubble is larger than the judged one. That is a real seam, not a
// rounding difference — recorded on the G45 row rather than changed here.
export function hillRadiusAU(aAU: number, e: number, massKg: number, hostMassKg: number): number {
  if (!(aAU > 0) || !(massKg > 0) || !(hostMassKg > 0)) return 0;
  const eClamped = Math.max(0, Math.min(0.999, e));
  return aAU * (1 - eClamped) * Math.cbrt(massKg / (3 * hostMassKg));
}

/** The combined-mass Hill radius of a PAIR within its parent's gravity, in AU. Returns 0 for a root
 *  barycentre — nothing outside it to be stripped by, so it has no outer bound in-system. Falls back
 *  to the members' summed mass when `effectiveMassKg` has not been reconciled yet, which is the
 *  behaviour the pair-tightness test already had. */
export function barycenterHillRadiusAU(
  bary: Barycenter,
  nodesById: Map<string, CelestialBody | Barycenter>,
  members: CelestialBody[]
): number {
  if (!bary.parentId || !bary.orbit) return 0;
  const parentMassKg = getHostMassKg(nodesById.get(bary.parentId));
  const mBin = (bary.effectiveMassKg || 0) || members.reduce((sum, m) => sum + getNodeMassKg(m), 0);
  return hillRadiusAU(bary.orbit.elements.a_AU || 0, bary.orbit.elements.e || 0, mBin, parentMassKg);
}

const isResonanceProtected = (n: CelestialBody) => !!(n as any).resonanceProtective;

function assessPairStability(
  inner: CelestialBody,
  outer: CelestialBody,
  hostMassKg: number
): StabilityAssessment {
  const out: StabilityAssessment = { severity: 0, reasons: [] };

  const innerBand = getOrbitSafetyBandAU(inner);
  const outerBand = getOrbitSafetyBandAU(outer);
  if (!innerBand || !outerBand) return out;

  // G43: a co-orbital pair "crosses" by construction — the crossing/spacing heuristics below do
  // not apply to it. The structured marker is authoritative; the placement strings are the legacy
  // form older saves still carry. P2 replaces this blanket escape with the real trojan criteria
  // (Routh/Gascheau + regime), which judge rather than exempt.
  const coOrbitalExempt =
    !!inner.coOrbital || !!outer.coOrbital ||
    !!lagrangePlacementId(inner.placement) || !!lagrangePlacementId(outer.placement);

  // 1) Orbit overlap / crossing check.
  // We attenuate by mutual inclination and mass ratio so giant planets are not
  // marked "very unstable" due to crossings with tiny, highly inclined bodies.
  const i1 = inner.orbit?.elements.i_deg || 0;
  const i2 = outer.orbit?.elements.i_deg || 0;
  const mutualInclinationDeg = Math.abs(i1 - i2);
  const overlap = innerBand.apoAU >= outerBand.periAU * 0.98;
  if (!coOrbitalExempt && overlap) {
    const m1 = getNodeMassKg(inner);
    const m2 = getNodeMassKg(outer);
    const smaller = Math.min(m1, m2);
    const larger = Math.max(m1, m2);
    const massRatio = larger > 0 ? smaller / larger : 0;

    // If crossings are strongly non-coplanar, treat as a weak risk.
    const planePenalty = mutualInclinationDeg >= 10 ? -1 : 0;

    // Base severity from perturbing mass significance.
    let overlapSeverity: 1 | 2 | 3 = 1;
    if (massRatio >= 1e-3) overlapSeverity = 2;
    if (massRatio >= 1e-2) overlapSeverity = 3;

    let adjustedSeverity = Math.max(1, Math.min(3, overlapSeverity + planePenalty)) as 1 | 2 | 3;

    // A protective mean-motion resonance (e.g. Pluto's 3:2 with Neptune) keeps conjunctions away
    // from the crossing point, so the crossing is metastable rather than doomed.
    const protectedPair = isResonanceProtected(inner) || isResonanceProtected(outer);
    if (protectedPair) {
      adjustedSeverity = 1;
      out.reasons.push(`${inner.name} and ${outer.name} cross orbits — which on its own would be unstable — but a locked mean-motion resonance keeps their conjunctions away from the crossing point, so this crossing on its own is survivable`);
    } else {
      if (massRatio < 1e-3) {
        out.reasons.push(`Minor-body crossing in pair ${inner.name}/${outer.name}`);
      } else {
        out.reasons.push(`Orbit overlap in pair ${inner.name}/${outer.name}`);
      }
      // Comparable masses collide; a lightweight crosser is scattered out. A collision is mutual,
      // an ejection is not -- name the body that actually gets thrown (B19).
      out.fate = massRatio >= 1e-2 ? 'collision' : 'eject';
      if (out.fate === 'eject') out.fateNodeId = (m1 <= m2 ? inner : outer).id;
    }
    if (adjustedSeverity > out.severity) out.severity = adjustedSeverity;
  }

  // 2) Mutual Hill spacing heuristic (N-body stability proxy)
  const a1 = inner.orbit?.elements.a_AU || 0;
  const a2 = outer.orbit?.elements.a_AU || 0;
  const m1 = getNodeMassKg(inner);
  const m2 = getNodeMassKg(outer);

  if (!coOrbitalExempt && hostMassKg > 0 && m1 > 0 && m2 > 0 && a2 > a1) {
    const aMean = 0.5 * (a1 + a2);
    const mutualHill =
      aMean * Math.cbrt((m1 + m2) / (3 * hostMassKg));

    if (mutualHill > 0) {
      const delta = (a2 - a1) / mutualHill;
      // Packed systems shed their lighter member by scattering it out (Hill-spacing instability →
      // ejection), unless a resonance is holding the pair.
      if (delta < 5.5 && !isResonanceProtected(inner) && !isResonanceProtected(outer)) {
        if (!out.fate) {
          out.fate = 'eject';
          out.fateNodeId = (m1 <= m2 ? inner : outer).id; // it is the lighter member that is shed
        }
      }
      if (delta < 3.5) {
        if (out.severity < 3) out.severity = 3;
        out.reasons.push(`Critical Hill spacing (Delta=${delta.toFixed(2)})`);
      } else if (delta < 5.5) {
        if (out.severity < 2) out.severity = 2;
        out.reasons.push(`Tight Hill spacing (Delta=${delta.toFixed(2)})`);
      } else if (delta < 8.5) {
        if (out.severity < 1) out.severity = 1;
        out.reasons.push(`Marginal Hill spacing (Delta=${delta.toFixed(2)})`);
      }
    }
  }

  return out;
}

// G43 P2: judge a co-orbital (Lagrange-pinned) BODY properly, instead of merely exempting the pair
// from the crossing tests. All criteria are reference-anchored (see physics/lagrange.ts header and
// docs/dev/lagrange-full-citizens-design.md):
//  - Triangular points (l4/l5): Gascheau's 1843 bound — (m1+m2+m3)^2 >= 27*(m1m2+m2m3+m3m1),
//    collapsing to Routh's 27*mu*(1-mu) < 1 as the trojan mass vanishes (critical mu ~ 0.0385;
//    Sun-Jupiter 0.00095 passes, Pluto-Charon 0.109 fails). A breach scatters the LIGHTER of
//    trojan/secondary (B19), and the margin is quoted in the reason (B24).
//  - Collinear points: saddle equilibria. A deviation at l1/l2 e-folds in roughly a SIXTEENTH of
//    the orbital period (the small-mu rate is ~2.5n: 23 days at an Earth-like orbit — the figure
//    every halo-orbit mission plans around); station-keeping holds a craft there, nothing holds a
//    moon. l3's hold is far weaker still, but its drift is slow (years to centuries) and ends in a
//    horseshoe passage rather than a scattering, so it reads Unstable rather than Very Unstable
//    and carries no fate.
function assessCoOrbitalStability(
  node: CelestialBody,
  secondary: CelestialBody | Barycenter | undefined,
  hostMassKg: number
): StabilityAssessment {
  const out: StabilityAssessment = { severity: 0, reasons: [] };
  const point = node.coOrbital?.point;
  if (!point || !secondary || !(hostMassKg > 0)) return out;
  const m2 = getHostMassKg(secondary);
  const m3 = getNodeMassKg(node);
  const secondaryName = (secondary as CelestialBody).name ?? 'its secondary';

  if (point === 'l4' || point === 'l5') {
    // ONE judgement of the trojan regime: `coOrbitalHold` also decides the construct fuel-use
    // bucket, so a verdict here and the tag a ship wears can never disagree.
    const margin = coOrbitalHold(point, hostMassKg, m2, m3).margin ?? Infinity;
    if (margin < 1) {
      out.severity = 3;
      out.fate = 'eject';
      out.fateNodeId = (m3 <= m2 ? node : (secondary as CelestialBody)).id;
      out.reasons.push(
        `${node.name} rides ${secondaryName}'s ${point.toUpperCase()} point, but the trio is too heavy for the triangular points to hold: ` +
        `Gascheau's bound needs (M+m₂+m₃)² at least 27× the pairwise mass products, and this trio reaches only ${margin.toFixed(2)}× of that requirement — ` +
        `the libration grows instead of damping, and the lighter member is scattered off the point`
      );
    } else if (margin < 1.2) {
      out.severity = 1;
      out.reasons.push(
        `${node.name} sits at ${secondaryName}'s ${point.toUpperCase()} point right at the edge of the trojan regime ` +
        `(Gascheau margin ${margin.toFixed(2)}×; below 1× the point stops holding) — stable on paper, but resonances at the boundary make real systems here chaos-prone`
      );
    }
    return out;
  }

  if (point === 'l1' || point === 'l2') {
    out.severity = 3;
    out.fate = 'eject';
    out.fateNodeId = node.id;
    out.reasons.push(
      `${point.toUpperCase()} is a saddle equilibrium: a deviation e-folds in about a sixteenth of the orbital period ` +
      `(23 days at an Earth-like orbit), so station-keeping holds a craft here but nothing holds a moon — ` +
      `${node.name} falls off the ${secondaryName} sun-line within a few orbits`
    );
    return out;
  }

  // l3
  out.severity = 2;
  out.reasons.push(
    `L3 is also an unstable equilibrium, but a weak one: ${node.name} drifts off ${secondaryName}'s antipode over years to centuries ` +
    `and slides into a horseshoe passage along the shared orbit rather than being thrown out`
  );
  return out;
}

function isPrimaryBarycenterMemberPair(
  host: CelestialBody | Barycenter | undefined,
  a: CelestialBody,
  b: CelestialBody
): boolean {
  if (!host || host.kind !== 'barycenter') return false;
  const memberIds = host.memberIds || [];
  return memberIds.includes(a.id) && memberIds.includes(b.id);
}

function assessBinaryPairStability(
  memberA: CelestialBody,
  memberB: CelestialBody,
  bary: Barycenter,
  system: System,
  nodesById: Map<string, CelestialBody | Barycenter>
): StabilityAssessment {
  const out: StabilityAssessment = { severity: 0, reasons: [] };

  const aA = memberA.orbit?.elements.a_AU || 0;
  const aB = memberB.orbit?.elements.a_AU || 0;
  const eA = Math.max(0, Math.min(0.999, memberA.orbit?.elements.e || 0));
  const eB = Math.max(0, Math.min(0.999, memberB.orbit?.elements.e || 0));
  const eBin = Math.max(eA, eB);

  const sepMeanAU = aA + aB;
  const sepMaxAU = sepMeanAU * (1 + eBin);
  const mA = getNodeMassKg(memberA);
  const mB = getNodeMassKg(memberB);
  const mBin = (bary.effectiveMassKg || 0) || (mA + mB);

  // 1) Internal binary tightness against external tide (Hill sphere around parent host).
  if (bary.parentId && bary.orbit && mBin > 0) {
    const parent = nodesById.get(bary.parentId);
    const parentMassKg = getHostMassKg(parent);
    if (parentMassKg > 0) {
      const hillAU = hillRadiusAU(
        bary.orbit.elements.a_AU || 0, bary.orbit.elements.e || 0, mBin, parentMassKg);
      if (hillAU > 0) {
        // A binary stays bound while its (apoapsis) separation is comfortably inside the Hill radius it
        // has within its parent. Empirically a pair is safe out to ~1/3 of the Hill radius, so only flag
        // as it approaches that — a pair at sep/Hill ~0.15 (e.g. Alpha Cen A/B inside the wider triple)
        // is rock-solid and must not read as unstable.
        const frac = sepMaxAU / hillAU;
        if (frac >= 0.5) {
          out.severity = 3;
          out.reasons.push(`Binary wide vs Hill sphere (sep/Hill=${frac.toFixed(2)})`);
        } else if (frac >= 0.4) {
          out.severity = Math.max(out.severity, 2) as 0 | 1 | 2 | 3;
          out.reasons.push(`Binary moderately wide vs Hill sphere (sep/Hill=${frac.toFixed(2)})`);
        } else if (frac >= 0.3) {
          out.severity = Math.max(out.severity, 1) as 0 | 1 | 2 | 3;
          out.reasons.push(`Binary perturbation-sensitive (sep/Hill=${frac.toFixed(2)})`);
        }
      }

      // 2) Neighboring sibling perturbations on the barycenter's parent orbit.
      // A protective mean-motion resonance is tagged on the binary's MEMBER bodies (e.g. Pluto's 3:2
      // with Neptune), so check them — a shepherded crossing is metastable, not doomed.
      const binaryProtected = isResonanceProtected(memberA) || isResonanceProtected(memberB);
      const hostSiblings = system.nodes.filter((n) => {
        if (n.id === bary.id) return false;
        if (n.kind !== 'body') return false;
        const b = n as CelestialBody;
        if (!b.orbit) return false;
        // Belts/rings are DISTRIBUTED debris, not a point-mass gravitational sibling — a barycentre
        // crossing the Kuiper Belt is normal, not a disruption (matches the main sibling loop's rule).
        if (b.roleHint === 'belt' || b.roleHint === 'ring') return false;
        return b.parentId === bary.parentId;
      }) as CelestialBody[];

      const aBary = bary.orbit.elements.a_AU || 0;
      const eBary = Math.max(0, Math.min(0.999, bary.orbit.elements.e || 0));
      const baryBand = aBary > 0
        ? { periAU: aBary * (1 - eBary), apoAU: aBary * (1 + eBary) }
        : null;
      for (const sib of hostSiblings) {
        const sibBand = getOrbitSafetyBandAU(sib);
        if (!baryBand || !sibBand) continue;

        const overlap = baryBand.apoAU >= sibBand.periAU * 0.98 && sibBand.apoAU >= baryBand.periAU * 0.98;
        const mSib = getNodeMassKg(sib);
        const massRatio = mBin > 0 ? (mSib / mBin) : 0;

        if (overlap) {
          // Pluto/Neptune style: the resonance holds conjunctions away from the crossing point, so the
          // crossing is metastable (marginal), not a collision/ejection sentence.
          if (binaryProtected || isResonanceProtected(sib)) {
            out.severity = Math.max(out.severity, 1) as 0 | 1 | 2 | 3;
            out.reasons.push(`its orbit crosses ${sib.name}'s — which on its own would be unstable — but a locked mean-motion resonance keeps their conjunctions away from the crossing point, so this crossing on its own is survivable`);
            continue;
          }
          if (massRatio >= 0.1) {
            out.severity = 3;
          } else if (massRatio >= 0.01) {
            out.severity = Math.max(out.severity, 2) as 0 | 1 | 2 | 3;
          } else {
            out.severity = Math.max(out.severity, 1) as 0 | 1 | 2 | 3;
          }
          out.reasons.push(`External orbit overlap with ${sib.name}`);
          continue;
        }

        const a1 = bary.orbit.elements.a_AU || 0;
        const a2 = sib.orbit?.elements.a_AU || 0;
        const innerA = Math.min(a1, a2);
        const outerA = Math.max(a1, a2);
        if (outerA <= innerA) continue;
        // Hierarchically separated orbits (one well outside the other, no band overlap above) are stable
        // by construction — the planar mutual-Hill spacing test only applies to comparably-sized,
        // near-adjacent orbits. Without this, a distant companion (Proxima ~14x the inner pair's SMA)
        // gets a misleadingly small Delta and the tight inner binary is wrongly flagged critical.
        if (outerA > innerA * 3) continue;
        const aMean = 0.5 * (innerA + outerA);
        const mutualHill = aMean * Math.cbrt((mBin + mSib) / (3 * parentMassKg));
        if (mutualHill <= 0) continue;
        const delta = (outerA - innerA) / mutualHill;

        if (delta < 3.5) {
          out.severity = 3;
          out.reasons.push(`External critical Hill spacing with ${sib.name} (Delta=${delta.toFixed(2)})`);
        } else if (delta < 5.5) {
          out.severity = Math.max(out.severity, 2) as 0 | 1 | 2 | 3;
          out.reasons.push(`External tight Hill spacing with ${sib.name} (Delta=${delta.toFixed(2)})`);
        } else if (delta < 8.5) {
          out.severity = Math.max(out.severity, 1) as 0 | 1 | 2 | 3;
          out.reasons.push(`External marginal Hill spacing with ${sib.name} (Delta=${delta.toFixed(2)})`);
        }
      }
    }
  }

  return out;
}

// G45: THE INNER EDGE OF THE CIRCUMBINARY ANNULUS — the half of the story this file could not tell.
// `assessBinaryPairStability` looks OUTWARD only (the pair against its own host's tide, the pair
// against its siblings), and `assessHostBindingStability` gives a barycentre's child its OUTER bound
// via the Hill check. Between them nothing spoke for the INNER bound, so a circumbinary planet
// authored a hair outside its two suns — the single most obviously doomed placement a GM can make,
// and one the map invites — collected no verdict at all. It does now.
//
// The criterion is Holman & Wiegert's critical semi-major axis; the fit, its stated validity range
// and the two real-system checks live in physics/circumbinary.ts, which is the only place any of it
// is written down. Three bands, and the middle one is the honest part:
//
//  a < a_c              Very Unstable + eject. The pair's potential is not static — it turns, twice
//                       per binary orbit — and inside a_c that forcing pumps the orbit faster than
//                       it can be damped until the body crosses the stars' own orbits. The close
//                       encounter that follows almost always throws it out; occasionally it hits a
//                       star. The body is thrown and the stars are what throw it, so the fate is
//                       directional (B19).
//  a_c <= a < 1.2 a_c   Marginal. H&W publish a_c as the LOWEST surviving orbit and say plainly that
//                       instability islands sit above it at mean-motion resonances with the pair, so
//                       a_c is a floor rather than a wall. No fate: "near the edge" is not a
//                       prediction, and claiming one would be inventing a result the fit does not
//                       contain.
//  periapsis < a_c      Marginal even when a clears. H&W's particles started on CIRCULAR orbits, so
//  (a >= a_c)           the fit strictly speaks only for those; an eccentric circumbinary orbit
//                       whose periapsis reaches inside the hole is outside what was measured, and
//                       saying so is better than either ignoring it or pretending a_c covers it.
function assessCircumbinaryStability(
  node: CelestialBody,
  bary: Barycenter,
  annulus: CircumbinaryAnnulus
): StabilityAssessment {
  const out: StabilityAssessment = { severity: 0, reasons: [] };

  const aNode = node.orbit?.elements.a_AU || 0;
  if (!(aNode > 0) || !(annulus.innerAU > 0)) return out;
  const eNode = Math.max(0, Math.min(0.999, node.orbit?.elements.e || 0));
  const periNode = aNode * (1 - eNode);

  const pairName = bary.name || 'the pair';
  // The fit's own caveat, printed wherever the number is: a pair outside the grid H&W sampled gets
  // an extrapolated limit, and the reader is told rather than left to assume it was measured.
  const fitNote = annulus.fitExtrapolated
    ? ` (the pair's mass ratio or eccentricity sits outside the range Holman & Wiegert fitted, so this limit is extrapolated)`
    : '';
  const limits =
    `${annulus.criticalRatio.toFixed(2)}x the pair's ${annulus.pairSeparationAU.toPrecision(3)} AU separation ` +
    `(Holman & Wiegert 1999, for mass ratio ${annulus.massRatioMu.toFixed(3)} and pair eccentricity ${annulus.eccentricity.toFixed(3)})`;

  if (aNode < annulus.innerAU) {
    out.severity = 3;
    out.fate = 'eject';
    out.fateNodeId = node.id;
    out.reasons.push(
      `${node.name} orbits inside ${pairName}'s circumbinary limit: a P-type orbit only survives beyond ${limits}, ` +
      `which puts the limit at ${annulus.innerAU.toPrecision(3)} AU, and ${node.name} sits at ${aNode.toPrecision(3)} AU — ` +
      `${(100 * aNode / annulus.innerAU).toFixed(0)}% of it. The pair's gravity field turns twice per binary orbit rather than ` +
      `standing still, and this close that forcing pumps the orbit until it crosses the stars themselves; ` +
      `the encounter that follows throws ${node.name} clear of the system${fitNote}`
    );
    out.tags = ['stability/inside-circumbinary-limit'];
    return out;
  }

  if (aNode < annulus.innerAU * CIRCUMBINARY_EDGE_FACTOR) {
    out.severity = 1;
    out.reasons.push(
      `${node.name} clears ${pairName}'s circumbinary limit by only ${(aNode / annulus.innerAU).toFixed(2)}x — ` +
      `beyond ${limits}, but that fit gives the LOWEST surviving orbit, not a clean wall: mean-motion resonances with the ` +
      `pair leave unstable islands above it, so a planet this close to the edge can still be cleared out${fitNote}`
    );
    return out;
  }

  if (periNode < annulus.innerAU) {
    out.severity = 1;
    out.reasons.push(
      `${node.name}'s orbit averages clear of ${pairName}'s circumbinary limit (${annulus.innerAU.toPrecision(3)} AU) but its ` +
      `periapsis reaches ${periNode.toPrecision(3)} AU, inside it. The Holman & Wiegert limit was measured for bodies on ` +
      `CIRCULAR orbits, so an eccentric one dipping into the hole is outside what the fit actually tested${fitNote}`
    );
  }

  return out;
}

function assessHostBindingStability(
  node: CelestialBody,
  host: CelestialBody | Barycenter,
  grandparent: CelestialBody | Barycenter | undefined,
  hostMassKg: number
): StabilityAssessment {
  const out: StabilityAssessment = { severity: 0, reasons: [] };
  
  if (host.kind === 'barycenter' && host.memberIds?.includes(node.id)) {
    return out; // Handled by assessBinaryPairStability
  }

  const nodeMass = getNodeMassKg(node);

  // 1. Mass Inversion Check
  if (nodeMass > hostMassKg * 1.05) {
    out.severity = 3;
    out.fate = 'inversion';
    out.reasons.push(`Massive inversion: orbiting body is heavier than its host. (Recommendation: Click "Rebuild Hierarchy" below)`);
  }

  const aNode = node.orbit?.elements.a_AU || 0;
  const eNode = Math.max(0, Math.min(0.999, node.orbit?.elements.e || 0));
  const periNodeAU = aNode * (1 - eNode);

  // 2. Collision & Roche Limit Checks
  if (host.kind === 'body') {
    const hostRadiusAU = ((host as CelestialBody).radiusKm || 0) / 149597870.7;
    if (periNodeAU > 0 && periNodeAU <= hostRadiusAU) {
      out.severity = 3;
      out.fate = 'infall';
      out.reasons.push(`Orbit intersects host radius (Consumed/Collided).`);
    } else if (periNodeAU > 0) {
      // Simplified rigid Roche limit: D = R * (2 * rho_p / rho_s)^(1/3)
      const hostRadiusKm = (host as CelestialBody).radiusKm || 1;
      const hostDensity = hostMassKg / ((4/3) * Math.PI * Math.pow(hostRadiusKm * 1000, 3));
      const satelliteDensity = 3000; // rough rock density
      const rocheLimitAU = (hostRadiusKm * Math.pow(2 * (hostDensity / satelliteDensity), 1/3)) / 149597870.7;
      
      if (periNodeAU <= rocheLimitAU) {
        out.severity = 3;
        out.fate = 'infall';
        out.reasons.push(`Orbit is within host's Roche Limit (Tidally disrupted/Ring formation).`);
      }
    }
  }

  // 3. Host Hill Sphere Violation
  const hostOrbit = (host as any).orbit;
  if (grandparent && hostOrbit) {
    const grandparentMass = getHostMassKg(grandparent);
    if (grandparentMass > 0) {
      const hillAU = hillRadiusAU(
        hostOrbit.elements.a_AU || 0, hostOrbit.elements.e || 0, hostMassKg, grandparentMass);
      const apoNode = aNode * (1 + eNode);

      if (hillAU > 0) {
        const frac = apoNode / hillAU;
        if (frac >= 0.5) {
          out.severity = 3;
          out.fate = 'eject';
          out.reasons.push(`Orbit exceeds host's stable Hill sphere (stolen by external tide).`);
        } else if (frac >= 0.33) {
          out.severity = Math.max(out.severity, 2) as 0 | 1 | 2 | 3;
          out.reasons.push(`Orbit loosely bound to host (vulnerable to external perturbation).`);
        }
      }
    }
  }

  return out;
}

export function annotateGravitationalStability(system: System): System {
  const nodesById = new Map(system.nodes.map((n) => [n.id, n]));

  // Clear existing stability tags/fields each pass.
  for (const node of system.nodes) {
    if (!('tags' in node)) continue;
    node.tags = stripForReprocess(node.tags, ['stability/', 'fate/']);
    delete (node as any).orbitalStability;
    delete (node as any).orbitalStabilityDetails;
  }

  // G45: PUBLISH THE CIRCUMBINARY ANNULUS ON EVERY PAIR, and do it here — before any child is
  // judged and before any surface reads it. Both edges are derived from the pair's own orbit and its
  // members' orbits, all of which are settled long before this pass and never rewritten by it, so
  // this is the earliest point at which either edge is knowable. It is also the PARENT half of
  // parent-before-child: the barycentre publishes, then its children are assessed against what it
  // published, never the other way round.
  //
  // This runs over every barycentre, not only the ones with children, for two reasons: a pair with
  // no circumbinary bodies still has an annulus a GM may want to place one in, and the per-host loop
  // below never visits a host that has no orbiting children at all.
  //
  // The delete is the idempotence guard (nothing may read what a later pass writes): process,
  // process again, and the field is rebuilt from the same inputs rather than accumulated.
  const annulusByBary = new Map<string, CircumbinaryAnnulus>();
  for (const node of system.nodes) {
    if (node.kind !== 'barycenter') continue;
    const bary = node as Barycenter;
    delete (bary as any).circumbinary;
    const memberIds = bary.memberIds || [];
    if (memberIds.length !== 2) continue;   // the annulus is a TWO-body result; anything else abstains
    const first = nodesById.get(memberIds[0]);
    const second = nodesById.get(memberIds[1]);
    if (!first || first.kind !== 'body' || !second || second.kind !== 'body') continue;
    const members = [first as CelestialBody, second as CelestialBody];
    const hill = barycenterHillRadiusAU(bary, nodesById, members);
    const annulus = circumbinaryAnnulus(members[0], members[1], hill > 0 ? hill : undefined);
    if (!annulus) continue;
    (bary as any).circumbinary = annulus;
    annulusByBary.set(bary.id, annulus);
  }

  // Belts/rings are DISTRIBUTED mass (their massKg is a debris-density proxy, not a point
  // mass), so they must not act as gravitational siblings — otherwise a belt's "mass" feeds
  // the mutual-Hill-spacing check and spuriously flags a neighbouring planet as unstable.
  // (Gravity-assist already skips them; orbits.ts flags them isDistributed.)
  const orbitalNodes = system.nodes.filter(
    (n) =>
      n.kind === 'body' &&
      (n as CelestialBody).orbit &&
      (n as CelestialBody).roleHint !== 'belt' &&
      (n as CelestialBody).roleHint !== 'ring'
  ) as OrbitalNode[];

  const byHost = new Map<string, OrbitalNode[]>();
  for (const node of orbitalNodes) {
    // Parent linkage is the authoritative hierarchy in the editor; orbit.hostId can drift.
    const hostId = node.parentId || node.orbit?.hostId;
    if (!hostId) continue;
    if (!byHost.has(hostId)) byHost.set(hostId, []);
    byHost.get(hostId)!.push(node);
  }

  for (const [hostId, siblings] of byHost.entries()) {
    const host = nodesById.get(hostId) as CelestialBody | Barycenter | undefined;
    const hostMassKg = getHostMassKg(host);
    const grandparent = host?.parentId ? (nodesById.get(host.parentId) as CelestialBody | Barycenter | undefined) : undefined;

    siblings.sort((a, b) => (a.orbit?.elements.a_AU || 0) - (b.orbit?.elements.a_AU || 0));
    const assessments = new Map<string, StabilityAssessment>();
    for (const n of siblings) assessments.set(n.id, { severity: 0, reasons: [] });

    if (host) {
      for (const node of siblings) {
        const bindingAssessment = assessHostBindingStability(node, host, grandparent, hostMassKg);
        if (bindingAssessment.severity > 0) {
          mergeAssessment(assessments.get(node.id)!, bindingAssessment);
        }
        // G45: a NON-MEMBER child of a barycentre is a circumbinary (P-type) body, and only its
        // outer bound has been judged so far (the Hill check inside assessHostBindingStability).
        // Members are excluded because they are the pair — they are judged as one by
        // assessBinaryPairStability, and a star is not in orbit around the hole it makes.
        if (host.kind === 'barycenter' && !(host.memberIds || []).includes(node.id)) {
          const annulus = annulusByBary.get(host.id);
          if (annulus) {
            const cb = assessCircumbinaryStability(node, host as Barycenter, annulus);
            if (cb.severity > 0) mergeAssessment(assessments.get(node.id)!, cb, node.id);
          }
        }
        // G43 P2: a Lagrange-pinned body gets the real co-orbital judgement (the pair heuristics
        // below exempt marked pairs, so this is the only test that speaks for them). A triangular
        // breach endangers BOTH members (the fate still lands only on the one B19 names); a
        // collinear placement dooms only the body sitting on the saddle.
        if (node.coOrbital) {
          const secondary = nodesById.get(node.coOrbital.hostId) as CelestialBody | Barycenter | undefined;
          const co = assessCoOrbitalStability(node, secondary, hostMassKg);
          if (co.severity > 0) {
            mergeAssessment(assessments.get(node.id)!, co, node.id);
            const point = node.coOrbital.point;
            if ((point === 'l4' || point === 'l5') && secondary && assessments.has(secondary.id)) {
              mergeAssessment(assessments.get(secondary.id)!, co, secondary.id);
            }
          }
        }
      }
    }

    if (siblings.length >= 2) {
      // A barycentre's member stars are the INNER binary — handled as a unit. Anything else under the
      // same barycentre (e.g. Proxima at 13000 AU around the Alpha Cen A/B pair) is a WIDE hierarchical
      // companion, not a co-planar neighbour of an individual member. The pair heuristics below model a
      // flat packed system, so applying them across that hierarchy gap is meaningless and would flag a
      // tight 80-yr binary partner as "flung out" because of a distant companion. Skip member↔non-member
      // pairs; members↔members go to the binary assessor, non-members↔non-members to the generic one.
      const memberIds = host && host.kind === 'barycenter' ? new Set(host.memberIds || []) : null;
      for (let i = 0; i < siblings.length - 1; i++) {
        const inner = siblings[i];
        const outer = siblings[i + 1];
        if (memberIds && memberIds.has(inner.id) !== memberIds.has(outer.id)) continue;
        let pairAssessment: StabilityAssessment;
        if (isPrimaryBarycenterMemberPair(host, inner, outer) && host && host.kind === 'barycenter') {
          pairAssessment = assessBinaryPairStability(inner, outer, host, system, nodesById);
        } else {
          pairAssessment = assessPairStability(inner, outer, hostMassKg);
        }
        if (pairAssessment.severity === 0) continue;

        mergeAssessment(assessments.get(inner.id)!, pairAssessment, inner.id);
        mergeAssessment(assessments.get(outer.id)!, pairAssessment, outer.id);
      }
    }

    for (const node of siblings) {
      const assessment = assessments.get(node.id);
      if (!assessment || assessment.severity === 0) continue;
      const label = severityLabel(assessment.severity);
      const base = severityDescription(assessment.severity);
      if (!label || !base) continue;
      // B24: name the driver that produced the outcome. `reasons` is everything every test found,
      // and the most severe test owns the fate — so without this the verdict could sit next to a
      // reason from a DIFFERENT mechanism and read as a contradiction ("...a locked resonance keeps
      // their conjunctions away from the crossing point" followed by "flung out", where the crossing
      // test had spared the pair and the host-binding test had failed it). Only attributed when
      // there is more than one driver; with a single reason the cause is already unambiguous.
      // Some reasons already end in a full stop and some do not, so trim before adding one.
      const cause = assessment.fateReason && assessment.reasons.length > 1
        ? ` Driven by: ${assessment.fateReason.replace(/\.\s*$/, '')}.`
        : '';
      const fateText = assessment.fate ? ` ${FATE_TEXT[assessment.fate]}${cause}` : '';
      (node as any).orbitalStability = label;
      (node as any).orbitalStabilityDetails =
        (assessment.reasons.length > 0
          ? `${base} Drivers: ${assessment.reasons.join('; ')}.`
          : base) + fateText;

      // Keep short machine-readable tags for filtering and quick visibility in Tags UI.
      if (!node.tags) node.tags = [];
      const slug = label.toLowerCase().replace(/\s+/g, '-');
      node.tags.push({ key: `stability/${slug}` });
      if (assessment.fate) node.tags.push({ key: `fate/${assessment.fate}` });
      // Mechanism tags a criterion asked for by name (G45). Severity says how bad and fate says
      // which way; this says WHICH PHYSICS, so a GM can filter for it and a rule can test it.
      for (const key of assessment.tags ?? []) node.tags.push({ key });
    }
  }

  return system;
}
