// Mean-motion resonance (MMR) detection for the orbital-stability model. Two bodies round the same
// host are "in resonance" when their orbital-period ratio sits near a small-integer j:k (periods go
// as a^1.5, so we work straight off semi-major axes). Resonances are the n-body part the simple
// Hill-spacing proxy misses: some are PROTECTIVE (Pluto's 3:2 with Neptune keeps them from ever
// meeting; the Galilean 1:2:4 Laplace chain) and some are CHAOTIC (overlapping resonances between
// comparable, tightly-packed bodies → ejection). Resonant eccentricity pumping is also what feeds
// the tidal heating that drives Europa/Io activity — we flag that so the geology read-out can say so.
import type { CelestialBody, Barycenter, System } from '../types';

export type ResonanceKind = 'protective' | 'neutral' | 'chaotic';

export interface ResonanceLink {
  j: number; k: number;              // outer:inner period ratio ≈ j/k (j > k)
  order: number;                     // j - k (1 = strongest first-order)
  ratioErr: number;                  // fractional distance from the exact ratio
  kind: ResonanceKind;
  partnerId: string;
  partnerName: string;
  note: string;
}

// Candidate small-integer ratios, lowest order first (lower order = stronger coupling).
const MMRS: Array<[number, number]> = [
  [2, 1], [3, 2], [4, 3], [5, 4], [3, 1], [5, 3], [5, 2], [7, 4], [4, 1], [7, 5],
];
// First-order resonances (2:1, 3:2…) are wide and strong → ±1.5%. Higher-order ones are narrow —
// a loose tolerance tags coincidental near-ratios (Rhea–Dione sit 0.96% off 5:3 and are NOT
// resonant), so order ≥ 2 must be within ±0.5%.
const TOL_FIRST_ORDER = 0.015;
const TOL_HIGH_ORDER = 0.005;
// Resonant eccentricity pumping only matters when the pumped e is meaningful: Enceladus (0.0047)
// is visibly heated, Ganymede (0.0013) and Dione (0.0022) are not.
const TIDAL_E_MIN = 0.004;

function massKg(n: CelestialBody | Barycenter | undefined): number {
  if (!n) return 0;
  return n.kind === 'barycenter' ? (n as Barycenter).effectiveMassKg || 0 : (n as CelestialBody).massKg || 0;
}
const periodRatio = (aIn: number, aOut: number) => Math.pow(aOut / aIn, 1.5);

function bestMMR(aIn: number, aOut: number): { j: number; k: number; order: number; ratioErr: number } | null {
  const ratio = periodRatio(aIn, aOut); // ≥ 1
  let best: { j: number; k: number; order: number; ratioErr: number } | null = null;
  for (const [j, k] of MMRS) {
    const err = Math.abs(ratio - j / k) / (j / k);
    const tol = (j - k) === 1 ? TOL_FIRST_ORDER : TOL_HIGH_ORDER;
    if (err < tol && (!best || (j - k) < best.order || ((j - k) === best.order && err < best.ratioErr))) {
      best = { j, k, order: j - k, ratioErr: err };
    }
  }
  return best;
}

/**
 * Tag every body with its dominant mean-motion resonance (sets orbit.resonance + a resonance/* tag
 * + a human note), classify it protective/neutral/chaotic, flag Laplace chains, and mark resonant
 * tidal forcing. Returns a per-node summary the stability pass consults. Run BEFORE stability.
 */
export function annotateResonances(system: System): Map<string, ResonanceLink[]> {
  const nodesById = new Map(system.nodes.map((n) => [n.id, n]));
  const result = new Map<string, ResonanceLink[]>();

  // Clear prior resonance annotations.
  for (const n of system.nodes) {
    if (n.kind !== 'body') continue;
    const b = n as CelestialBody;
    if (b.orbit) b.orbit.resonance = null;
    if (b.tags) b.tags = b.tags.filter((t) => !t.key.startsWith('resonance/'));
    delete (b as any).resonanceNote;
    delete (b as any).resonanceProtective;
    delete (b as any).resonanceTidal;
  }

  // A resonance participant is anything that orbits a host as a point mass — a body, OR a barycentre
  // (so the Pluto–Charon pair, which orbits the Sun as a unit, can resonate with Neptune). Belts and
  // rings are distributed mass and never participate. Annotations on a barycentre propagate to its
  // member bodies, which is what the UI shows.
  interface Participant {
    id: string; name: string; aAU: number; massKg: number;
    targets: CelestialBody[];        // who carries the tag/note (the barycentre's members, or the body)
    orbitOwner?: CelestialBody;      // body whose orbit.resonance gets the canonical ratio
  }
  const memberBodies = (b: Barycenter): CelestialBody[] =>
    (b.memberIds || []).map((id) => nodesById.get(id)).filter((n): n is CelestialBody => !!n && n.kind === 'body');

  const byHost = new Map<string, Participant[]>();
  const addP = (hostId: string, p: Participant) => {
    if (!hostId) return;
    if (!byHost.has(hostId)) byHost.set(hostId, []);
    byHost.get(hostId)!.push(p);
  };
  for (const n of system.nodes) {
    if (n.kind === 'body') {
      const b = n as CelestialBody;
      if (!b.orbit || b.roleHint === 'belt' || b.roleHint === 'ring') continue;
      addP(b.parentId || b.orbit.hostId || '', { id: b.id, name: b.name, aAU: b.orbit.elements.a_AU || 0, massKg: b.massKg || 0, targets: [b], orbitOwner: b });
    } else if (n.kind === 'barycenter') {
      const bc = n as Barycenter;
      if (!bc.orbit || !bc.parentId) continue;
      const members = memberBodies(bc);
      addP(bc.parentId, { id: bc.id, name: bc.name || members.map((m) => m.name).join('–'), aAU: bc.orbit.elements.a_AU || 0, massKg: bc.effectiveMassKg || 0, targets: members, orbitOwner: members.sort((a, b) => (a.orbit?.elements.a_AU || 0) - (b.orbit?.elements.a_AU || 0))[0] });
    }
  }

  const tagTargets = (p: Participant, tagKey: string, note: string, protective: boolean, tidal: boolean) => {
    for (const t of p.targets) {
      t.tags = t.tags || [];
      if (!t.tags.some((x) => x.key === tagKey)) t.tags.push({ key: tagKey });
      (t as any).resonanceNote = note;
      if (protective) (t as any).resonanceProtective = true;
      if (tidal && (t.orbit?.elements.e || 0) >= TIDAL_E_MIN) (t as any).resonanceTidal = true;
    }
  };

  for (const [hostId, group] of byHost.entries()) {
    if (group.length < 2) continue;
    // Resonant TIDAL heating needs a massive nearby host raising the tide — i.e. moons of a planet.
    // Heliocentric resonances (Pluto–Neptune around the Sun) shape orbits but heat nothing.
    const hostNode = nodesById.get(hostId);
    const hostIsPlanet = !!hostNode && hostNode.kind === 'body' && (hostNode as CelestialBody).roleHint !== 'star';
    group.sort((a, b) => a.aAU - b.aAU);

    // All pairs (groups are small) → strongest resonance per participant.
    for (let i = 0; i < group.length; i++) {
      for (let o = i + 1; o < group.length; o++) {
        const inner = group[i], outer = group[o];
        if (inner.aAU <= 0 || outer.aAU <= 0) continue;
        const mmr = bestMMR(inner.aAU, outer.aAU);
        if (!mmr) continue;

        const heavy = Math.max(inner.massKg, outer.massKg), light = Math.min(inner.massKg, outer.massKg);
        const massRatio = heavy > 0 ? light / heavy : 0;
        const spacing = (outer.aAU - inner.aAU) / (0.5 * (inner.aAU + outer.aAU));
        let kind: ResonanceKind = 'neutral';
        if (massRatio < 5e-3 && heavy > 0) kind = 'protective';     // tiny body shepherded by a giant
        else if (massRatio > 0.05 && spacing < 0.12) kind = 'chaotic'; // packed comparable masses
        const link: ResonanceLink = { j: mmr.j, k: mmr.k, order: mmr.order, ratioErr: mmr.ratioErr, kind, partnerId: '', partnerName: '', note: '' };
        const tag = `resonance/${mmr.j}-${mmr.k}`;
        const desc = kind === 'protective' ? 'protects against close approaches'
          : kind === 'chaotic' ? 'overlapping resonances → chaotic (ejection risk)' : 'pumps eccentricity';

        for (const [self, partner] of [[outer, inner], [inner, outer]] as const) {
          for (const t of self.targets) result.set(t.id, [...(result.get(t.id) || []), { ...link, partnerId: partner.id, partnerName: partner.name }]);
          tagTargets(self, tag, `${mmr.j}:${mmr.k} mean-motion resonance with ${partner.name} — ${desc}.`, kind === 'protective', hostIsPlanet);
        }
        if (outer.orbitOwner?.orbit) outer.orbitOwner.orbit.resonance = { numerator: mmr.j, denominator: mmr.k };
      }
    }

    // Laplace chain: three consecutive participants each ~2:1 (Io:Europa:Ganymede 1:2:4). Strongly
    // protective AND the archetypal tidal-heating driver.
    for (let i = 0; i + 2 < group.length; i++) {
      const [a, b, c] = [group[i], group[i + 1], group[i + 2]];
      const r1 = bestMMR(a.aAU, b.aAU), r2 = bestMMR(b.aAU, c.aAU);
      if (r1 && r2 && r1.j === 2 && r1.k === 1 && r2.j === 2 && r2.k === 1) {
        const note = `Laplace resonance chain (1:2:4) with ${a.name}/${b.name}/${c.name} — locked and tidally heated.`;
        for (const p of [a, b, c]) tagTargets(p, 'resonance/laplace', note, true, hostIsPlanet);
      }
    }
  }

  return result;
}
