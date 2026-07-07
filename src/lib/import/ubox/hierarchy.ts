// Universe Sandbox (.ubox) import — hierarchy inference (browser-safe). Design §6.
// US stores no parent references (Parent = -1 everywhere), so parenting is inferred from the state
// vectors: a local root (guarding against far-field galactic objects like Sagittarius A*), then a
// descending-mass Hill-sphere binding pass. NO multi-star barycentre emission (gated on a sample).
import { G, AU_KM } from '$lib/constants';
import { stateVectorsToElements, type V3 } from './kepler';
import type { Kepler } from '$lib/types';

const AU_M = AU_KM * 1000;
const LOCAL_RADIUS_M = 1e15; // ≈ 6,700 AU — a candidate beyond this from the local cluster is far-field.

export interface BodyInput {
  id: string;
  name: string;
  category: string;       // 'star' | 'planet' | 'moon' | 'sso' | 'blackhole'
  mass: number;
  pos: V3;
  vel: V3;
}

export interface Placement {
  id: string;
  parentId: string | null;
  roleHint: 'star' | 'planet' | 'moon';
  elements: Kepler | null;
  hostMu: number;
  unbound: boolean;
  isRoot: boolean;
  blackHole: boolean;
}

export interface HierarchyResult {
  placements: Placement[];
  farField: string[];     // ids skipped as galactic-context objects
  rootId: string | null;
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: V3): number => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);

export function inferHierarchy(bodies: BodyInput[]): HierarchyResult {
  const farField: string[] = [];
  if (!bodies.length) return { placements: [], farField, rootId: null };

  // --- 6.1 Local root selection ---
  const rootCandidates = bodies.filter((b) => b.category === 'star' || b.category === 'planet' || b.category === 'blackhole');
  // mass-weighted centroid of star + planet positions only
  const cluster = bodies.filter((b) => b.category === 'star' || b.category === 'planet');
  let centroid: V3 = [0, 0, 0];
  const clusterMass = cluster.reduce((s, b) => s + b.mass, 0);
  if (clusterMass > 0) {
    for (const b of cluster) { centroid = [centroid[0] + b.pos[0] * b.mass, centroid[1] + b.pos[1] * b.mass, centroid[2] + b.pos[2] * b.mass]; }
    centroid = [centroid[0] / clusterMass, centroid[1] / clusterMass, centroid[2] / clusterMass];
  } else if (rootCandidates.length) {
    centroid = rootCandidates[0].pos;
  }

  const localCandidates = rootCandidates.filter((b) => norm(sub(b.pos, centroid)) <= LOCAL_RADIUS_M);
  for (const b of rootCandidates) {
    if (!localCandidates.includes(b)) farField.push(b.id);
  }

  if (!localCandidates.length) return { placements: [], farField, rootId: null };

  const root = localCandidates.reduce((best, b) => (b.mass > best.mass ? b : best));
  const rootMass = root.mass;
  const farFieldSet = new Set(farField);

  // --- 6.2 Parent inference: descending mass so a parent's orbit exists before its children ---
  const placeable = bodies.filter((b) => !farFieldSet.has(b.id)).sort((a, b) => b.mass - a.mass);
  const placements: Placement[] = [];
  const byId = new Map<string, Placement>();
  const inputById = new Map(bodies.map((b) => [b.id, b]));

  const hillRadius = (c: Placement, cInput: BodyInput): number => {
    if (c.isRoot || !c.elements) return Infinity;
    const aM = c.elements.a_AU * AU_M;
    const e = c.elements.e;
    return aM * (1 - e) * Math.cbrt(cInput.mass / (3 * rootMass));
  };

  for (const b of placeable) {
    if (b.id === root.id) {
      const p: Placement = { id: b.id, parentId: null, roleHint: b.category === 'blackhole' ? 'star' : 'star', elements: null, hostMu: 0, unbound: false, isRoot: true, blackHole: b.category === 'blackhole' };
      placements.push(p); byId.set(b.id, p);
      continue;
    }

    // Bound-candidate search among already-placed, more-massive, non-unbound bodies. The ROOT is
    // excluded here — it is the FALLBACK, not a competitor (everything is "bound" to the root, so if
    // it competed on score every moon would bind to the star instead of its planet). A body with no
    // other bound host (a true planet) falls through to the root below.
    let bestParent: Placement | null = null;
    let bestScore = Infinity; // |rRel| / hillRadius — smaller = deeper binding
    for (const cand of placements) {
      if (cand.unbound || cand.isRoot) continue;
      const cInput = inputById.get(cand.id)!;
      if (cInput.mass <= b.mass) continue;
      const hr = hillRadius(cand, cInput);
      if (!Number.isFinite(hr)) continue;
      const rRel = sub(b.pos, cInput.pos);
      const vRel = sub(b.vel, cInput.vel);
      const rMag = norm(rRel);
      if (!(rMag > 0)) continue;
      const eps = (vRel[0] * vRel[0] + vRel[1] * vRel[1] + vRel[2] * vRel[2]) / 2 - (G * (cInput.mass + b.mass)) / rMag;
      if (eps < 0 && rMag < hr) {
        const score = rMag / hr;
        if (score < bestScore) { bestScore = score; bestParent = cand; }
      }
    }

    const parent = bestParent ?? byId.get(root.id)!;
    const parentInput = inputById.get(parent.id)!;
    const mu = G * (parentInput.mass + b.mass);
    const { elements, unbound } = stateVectorsToElements(sub(b.pos, parentInput.pos), sub(b.vel, parentInput.vel), mu);
    const roleHint: Placement['roleHint'] = parent.roleHint === 'star' ? 'planet' : 'moon';

    const p: Placement = {
      id: b.id,
      parentId: parent.id,
      roleHint,
      elements,
      hostMu: G * parentInput.mass,
      unbound,
      isRoot: false,
      blackHole: b.category === 'blackhole'
    };
    placements.push(p); byId.set(b.id, p);
  }

  return { placements, farField, rootId: root.id };
}
