import type { CelestialBody, Barycenter, System } from '../types';

type OrbitalNode = CelestialBody;

type Fate = 'infall' | 'eject' | 'collision' | 'inversion';
interface StabilityAssessment {
  severity: 0 | 1 | 2 | 3;
  reasons: string[];
  fate?: Fate;
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

function mergeAssessment(target: StabilityAssessment, incoming: StabilityAssessment) {
  // The dominant (most-severe) driver owns the predicted fate.
  if (incoming.severity > target.severity) {
    target.severity = incoming.severity as 0 | 1 | 2 | 3;
    if (incoming.fate) target.fate = incoming.fate;
  } else if (!target.fate && incoming.fate) {
    target.fate = incoming.fate;
  }
  for (const reason of incoming.reasons) {
    if (!target.reasons.includes(reason)) target.reasons.push(reason);
  }
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

  const coOrbitalExempt =
    (inner.placement === 'L4' || inner.placement === 'L5' || outer.placement === 'L4' || outer.placement === 'L5');

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
      out.reasons.push(`Orbit crossing of ${inner.name}/${outer.name} shepherded by mean-motion resonance`);
    } else {
      if (massRatio < 1e-3) {
        out.reasons.push(`Minor-body crossing in pair ${inner.name}/${outer.name}`);
      } else {
        out.reasons.push(`Orbit overlap in pair ${inner.name}/${outer.name}`);
      }
      // Comparable masses collide; a lightweight crosser is scattered out.
      out.fate = massRatio >= 1e-2 ? 'collision' : 'eject';
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
      if (delta < 5.5 && !isResonanceProtected(inner) && !isResonanceProtected(outer)) out.fate = out.fate ?? 'eject';
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
      const aExt = bary.orbit.elements.a_AU || 0;
      const eExt = Math.max(0, Math.min(0.999, bary.orbit.elements.e || 0));
      const hillAU = aExt * (1 - eExt) * Math.cbrt(mBin / (3 * parentMassKg));
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
      const hostSiblings = system.nodes.filter((n) => {
        if (n.id === bary.id) return false;
        if (n.kind !== 'body') return false;
        if (!(n as CelestialBody).orbit) return false;
        return n.parentId === bary.parentId;
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
      const aHost = hostOrbit.elements.a_AU || 0;
      const eHost = Math.max(0, Math.min(0.999, hostOrbit.elements.e || 0));
      const periHost = aHost * (1 - eHost);
      
      const hillAU = periHost * Math.cbrt(hostMassKg / (3 * grandparentMass));
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
    node.tags = (node.tags || []).filter((t) => !t.key.startsWith('stability/') && !t.key.startsWith('fate/'));
    delete (node as any).orbitalStability;
    delete (node as any).orbitalStabilityDetails;
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

        mergeAssessment(assessments.get(inner.id)!, pairAssessment);
        mergeAssessment(assessments.get(outer.id)!, pairAssessment);
      }
    }

    for (const node of siblings) {
      const assessment = assessments.get(node.id);
      if (!assessment || assessment.severity === 0) continue;
      const label = severityLabel(assessment.severity);
      const base = severityDescription(assessment.severity);
      if (!label || !base) continue;
      const fateText = assessment.fate ? ` ${FATE_TEXT[assessment.fate]}` : '';
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
    }
  }

  return system;
}
