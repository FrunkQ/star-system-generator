import type { CelestialBody, Barycenter, System } from '../types';

type OrbitalNode = CelestialBody;

interface StabilityAssessment {
  severity: 0 | 1 | 2 | 3;
  reasons: string[];
}

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
  if (incoming.severity > target.severity) target.severity = incoming.severity as 0 | 1 | 2 | 3;
  for (const reason of incoming.reasons) {
    if (!target.reasons.includes(reason)) target.reasons.push(reason);
  }
}

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

    const adjustedSeverity = Math.max(1, Math.min(3, overlapSeverity + planePenalty)) as 1 | 2 | 3;
    if (adjustedSeverity > out.severity) out.severity = adjustedSeverity;

    if (massRatio < 1e-3) {
      out.reasons.push(`Minor-body crossing in pair ${inner.name}/${outer.name}`);
    } else {
      out.reasons.push(`Orbit overlap in pair ${inner.name}/${outer.name}`);
    }
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

export function annotateGravitationalStability(system: System): System {
  const nodesById = new Map(system.nodes.map((n) => [n.id, n]));

  // Clear existing stability tags/fields each pass.
  for (const node of system.nodes) {
    if (!('tags' in node)) continue;
    node.tags = (node.tags || []).filter((t) => !t.key.startsWith('stability/'));
    delete (node as any).orbitalStability;
    delete (node as any).orbitalStabilityDetails;
  }

  const orbitalNodes = system.nodes.filter(
    (n) => n.kind === 'body' && (n as CelestialBody).orbit
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
    if (siblings.length < 2) continue;
    const host = nodesById.get(hostId) as CelestialBody | Barycenter | undefined;
    const hostMassKg = getHostMassKg(host);

    siblings.sort((a, b) => (a.orbit?.elements.a_AU || 0) - (b.orbit?.elements.a_AU || 0));
    const assessments = new Map<string, StabilityAssessment>();
    for (const n of siblings) assessments.set(n.id, { severity: 0, reasons: [] });

    // Adjacent-pair scan is a pragmatic approximation for packed-system instability.
    for (let i = 0; i < siblings.length - 1; i++) {
      const inner = siblings[i];
      const outer = siblings[i + 1];
      const pairAssessment = assessPairStability(inner, outer, hostMassKg);
      if (pairAssessment.severity === 0) continue;

      mergeAssessment(assessments.get(inner.id)!, pairAssessment);
      mergeAssessment(assessments.get(outer.id)!, pairAssessment);
    }

    for (const node of siblings) {
      const assessment = assessments.get(node.id);
      if (!assessment || assessment.severity === 0) continue;
      const label = severityLabel(assessment.severity);
      const base = severityDescription(assessment.severity);
      if (!label || !base) continue;
      (node as any).orbitalStability = label;
      (node as any).orbitalStabilityDetails =
        assessment.reasons.length > 0
          ? `${base} Drivers: ${assessment.reasons.join('; ')}.`
          : base;

      // Keep a short machine-readable tag for filtering and quick visibility in Tags UI.
      if (!node.tags) node.tags = [];
      const slug = label.toLowerCase().replace(/\s+/g, '-');
      node.tags.push({ key: `stability/${slug}` });
    }
  }

  return system;
}
