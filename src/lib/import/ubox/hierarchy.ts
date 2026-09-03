// Universe Sandbox (.ubox) import — hierarchy inference (browser-safe). Design §6.
//
// US stores no parent references (Parent = -1 everywhere), so the whole hierarchy is inferred from
// the state vectors. Bodies are placed heaviest first, and each placement owns three decisions:
//
//   1. HOST - the SMALLEST Hill sphere that both contains the body and binds it (negative two-body
//      energy), the root's sphere being infinite. Hill spheres nest, so "smallest containing" is
//      the same as "deepest in the hierarchy"; a moon sits inside its planet's sphere AND its
//      star's, and the planet's is the answer. A pair is a host too: a body outside both members'
//      spheres but inside the pair's orbits the PAIR (circumbinary) - and may be bound to the pair
//      while unbound relative to either member alone, which is why pairs must exist by the time
//      lighter bodies are placed, not be discovered afterwards.
//   2. PAIRING - a body comparable in mass to its host (the pack's promote ratio, `pairThresholds`)
//      is not a satellite but half of a PAIR: the two become members of one pair node carrying their
//      mass-weighted state, the pair takes the host's place under ITS parent (in that parent's
//      membership too, when it is a pair - PHY-32's amendment), and the host's other satellites that
//      orbit outside the pair's separation move up to orbit the pair.
//   3. ELEMENTS - every orbit is derived once, at the end, from world states: a pair member's from
//      the pair's RELATIVE vector split by mass (the coupling convention `processBarycenters` owns,
//      so that pass reproduces the numbers rather than transforming them - B111), anything else
//      from its own state about its parent's.
//
// B114 is why. The single-root version chose ONE star, assigned every role from the parent's role
// (so a bound second star was a `planet` and its worlds `moon`s), scored binding as distance over
// Hill radius and let a NON-root star compete on that score - which hands every moon of that star's
// planets to the star, because 16 AU into a 1,700 AU sphere scores "deeper" than 0.04 AU into a
// 0.43 AU one - and computed every Hill radius against the ROOT's mass rather than the host's, which
// made a moon's sphere 30x too small and threw its own moon to the star as unbound. All measured, on
// two users' files (the B114 row).
import { G, AU_KM } from '$lib/constants';
import { hillRadiusAU } from '$lib/physics/stability';
import { pairThresholds } from '$lib/physics/barycenterReconcile';
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
  parentId: string | null;           // a body id, or a PairPlacement id
  roleHint: 'star' | 'planet' | 'moon';
  elements: Kepler | null;
  hostMu: number;
  /** A pair member's mean motion is the PAIR's (the relative orbit's), not anything derivable from
   *  its own semi-major axis - so it is emitted, as `processBarycenters` would compute it. */
  nRadPerS?: number;
  unbound: boolean;
  isRoot: boolean;
  blackHole: boolean;
}

/** A barycentre the importer inferred: two comparable-mass nodes bound to each other. */
export interface PairPlacement {
  id: string;
  parentId: string | null;           // a body id, an enclosing pair id, or null for the root pair
  memberIds: [string, string];       // heavier first
  mass: number;                      // everything beneath both members
  elements: Kepler | null;           // about parentId; null for the root pair
  hostMu: number;
}

export interface HierarchyResult {
  placements: Placement[];
  pairs: PairPlacement[];
  farField: string[];     // ids skipped as galactic-context objects
  rootId: string | null;  // a body id or a pair id
}

export interface HierarchyOptions {
  /** The mass ratio at which a satellite becomes half of a pair; default = the pack default (8%). */
  promoteRatio?: number;
}

interface TreeNode {
  id: string;
  kind: 'body' | 'pair';
  parentId: string | null;
  mass: number;           // body: its own; pair: both members' totals
  pos: V3;
  vel: V3;
  input?: BodyInput;
  memberIds?: [string, string];
  roleHint: 'star' | 'planet' | 'moon';
  unbound: boolean;
  /** Semi-major axis about the parent (AU) - what the "outside the pair's separation" test reads. */
  aAU: number;
  /** This node's Hill radius (m), as a HOST: infinite at the root, judged against what it orbits. */
  hillM: number;
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: V3): number => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
const weighted = (a: V3, ma: number, b: V3, mb: number): V3 => {
  const m = ma + mb;
  return [(a[0] * ma + b[0] * mb) / m, (a[1] * ma + b[1] * mb) / m, (a[2] * ma + b[2] * mb) / m];
};

/** The role a body takes under a host: a star is a star wherever it sits; anything else is a planet
 *  of a star and a moon of anything smaller. `system/reparent.ts` states the same rule for nodes. */
function roleUnder(hostRole: 'star' | 'planet' | 'moon', isStar: boolean): 'star' | 'planet' | 'moon' {
  if (isStar) return 'star';
  return hostRole === 'star' ? 'planet' : 'moon';
}

export function inferHierarchy(bodies: BodyInput[], options: HierarchyOptions = {}): HierarchyResult {
  const farField: string[] = [];
  if (!bodies.length) return { placements: [], pairs: [], farField, rootId: null };
  const promoteRatio = options.promoteRatio ?? pairThresholds(null).promote;

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

  if (!localCandidates.length) return { placements: [], pairs: [], farField, rootId: null };

  const root = localCandidates.reduce((best, b) => (b.mass > best.mass ? b : best));
  const farFieldSet = new Set(farField);
  const isStar = (b: BodyInput) => b.category === 'star' || b.category === 'blackhole';

  const tree = new Map<string, TreeNode>();
  const order: string[] = [];             // insertion order, so the output is deterministic
  const add = (n: TreeNode) => { tree.set(n.id, n); order.push(n.id); };
  const elementsAbout = (n: { pos: V3; vel: V3; mass: number }, host: { pos: V3; vel: V3; mass: number }) =>
    stateVectorsToElements(sub(n.pos, host.pos), sub(n.vel, host.vel), G * (host.mass + n.mass));
  const otherMember = (pair: TreeNode, id: string) => tree.get(pair.memberIds![0] === id ? pair.memberIds![1] : pair.memberIds![0])!;

  // A node's Hill radius as a HOST, judged at periapsis against the mass it ACTUALLY orbits - the
  // engine's one Hill formula (M7), not a local copy. Infinite for the root: nothing outside it. A
  // pair MEMBER's sphere is judged against its partner on their relative orbit, which is the only
  // orbit a pair has; the formula overshoots for the heavier member (it assumes a light satellite)
  // and that is harmless here, because a body near the lighter member sits in both spheres and the
  // smaller one wins.
  const refreshHill = (n: TreeNode): void => {
    if (n.parentId === null) { n.hillM = Infinity; n.aAU = 0; return; }
    const parent = tree.get(n.parentId)!;
    if (parent.kind === 'pair' && parent.memberIds!.includes(n.id)) {
      const other = otherMember(parent, n.id);
      const rel = elementsAbout(n, other);
      n.aAU = rel.elements?.a_AU ?? 0;
      n.hillM = rel.elements ? hillRadiusAU(rel.elements.a_AU, rel.elements.e, n.mass, other.mass) * AU_M : 0;
      return;
    }
    const own = elementsAbout(n, parent);
    n.aAU = own.elements?.a_AU ?? 0;
    n.hillM = own.elements ? hillRadiusAU(own.elements.a_AU, own.elements.e, n.mass, parent.mass) * AU_M : 0;
  };

  // --- 6.2 Placement: descending mass so a host exists before its satellites ---
  const placeable = bodies.filter((b) => !farFieldSet.has(b.id)).sort((a, b) => b.mass - a.mass);

  for (const b of placeable) {
    if (b.id === root.id) {
      add({ id: b.id, kind: 'body', parentId: null, mass: b.mass, pos: b.pos, vel: b.vel, input: b,
        roleHint: 'star', unbound: false, aAU: 0, hillM: Infinity });
      continue;
    }

    // The SMALLEST Hill sphere that contains and binds this body. Spheres nest, so a moon's planet
    // beats its star by SIZE - never by a depth score, which a large host wins by construction. The
    // root's infinite sphere is the fallback, so a body nothing else holds falls to it here without a
    // special case (an unbound one is rejected by the element conversion, as before).
    let bestParent: TreeNode | null = null;
    for (const id of order) {
      const cand = tree.get(id)!;
      if (cand.unbound || cand.mass <= b.mass) continue;
      if (!(cand.hillM > 0)) continue;
      const rRel = sub(b.pos, cand.pos);
      const vRel = sub(b.vel, cand.vel);
      const rMag = norm(rRel);
      if (!(rMag > 0)) continue;
      const eps = (vRel[0] * vRel[0] + vRel[1] * vRel[1] + vRel[2] * vRel[2]) / 2 - (G * (cand.mass + b.mass)) / rMag;
      if (eps < 0 && rMag < cand.hillM && (!bestParent || cand.hillM < bestParent.hillM)) bestParent = cand;
    }

    const host = bestParent ?? tree.get(root.id)!;
    const own = elementsAbout(b, host);
    const node: TreeNode = { id: b.id, kind: 'body', parentId: host.id, mass: b.mass, pos: b.pos, vel: b.vel, input: b,
      roleHint: roleUnder(host.roleHint, isStar(b)), unbound: own.unbound, aAU: own.elements?.a_AU ?? 0, hillM: 0 };
    add(node);
    if (node.unbound) continue;
    refreshHill(node);

    // --- 6.3 Pairing: a satellite comparable in mass to its host is half of a pair ---
    if (Math.min(node.mass, host.mass) / Math.max(node.mass, host.mass) < promoteRatio) continue;
    const pairMass = host.mass + node.mass;
    const pairPos = weighted(host.pos, host.mass, node.pos, node.mass);
    const pairVel = weighted(host.vel, host.mass, node.vel, node.mass);
    const grand = host.parentId ? tree.get(host.parentId)! : null;
    // Unless it is the root, the pair must itself be bound about the host's own parent.
    if (grand && elementsAbout({ pos: pairPos, vel: pairVel, mass: pairMass }, grand).unbound) continue;

    const heavy = host.mass >= node.mass ? host : node;
    const light = heavy === host ? node : host;
    const pair: TreeNode = {
      id: `pair-${heavy.id}-${light.id}`, kind: 'pair', parentId: host.parentId, mass: pairMass,
      pos: pairPos, vel: pairVel, memberIds: [heavy.id, light.id],
      roleHint: heavy.roleHint, unbound: false, aAU: 0, hillM: 0
    };
    // The pair takes the host's place - in its parent's membership too, when that parent is a pair.
    if (grand?.kind === 'pair') {
      grand.memberIds = grand.memberIds!.map((id) => (id === host.id ? pair.id : id)) as [string, string];
    }
    // A satellite of the host that orbits OUTSIDE the pair's separation encloses both members, so it
    // orbits the pair (circumbinary); one inside stays with its own member. The same test the
    // reconciler applies on a promotion. (Only heavier bodies exist yet; lighter ones will see the
    // pair as a host in their own right.)
    const sepAU = node.aAU;
    const movedUp: TreeNode[] = [];
    for (const id of order) {
      const other = tree.get(id)!;
      if (other.parentId === host.id && other.id !== node.id && other.aAU > sepAU) { other.parentId = pair.id; movedUp.push(other); }
    }
    host.parentId = pair.id;
    node.parentId = pair.id;
    add(pair);
    refreshHill(pair);
    refreshHill(host);
    refreshHill(node);
    for (const m of movedUp) refreshHill(m);
  }

  // --- 6.4 Elements: every orbit from world states, once ---
  const placements: Placement[] = [];
  const pairs: PairPlacement[] = [];
  let rootId: string | null = null;
  for (const id of order) {
    const n = tree.get(id)!;
    if (n.parentId === null) rootId = n.id;
    const parent = n.parentId ? tree.get(n.parentId)! : null;

    let elements: Kepler | null = null;
    let unbound = n.unbound;
    let hostMu = 0;
    let nRadPerS: number | undefined;
    if (parent && parent.kind === 'pair' && parent.memberIds!.includes(n.id)) {
      // ONE relative orbit, light about heavy, split by mass: each member orbits the barycentre on
      // the same ellipse shape, the same mean anomaly and the same epoch, at a * m_other / M, on
      // opposite sides - the heavier member's argument of periapsis opposed to the relative
      // orbit's, because the coupling pass keeps the HEAVIER member's angle as the reference when
      // nothing has been edited and hands the other the opposed one. Emitting it this way round is
      // what lets `processBarycenters` find every number already settled.
      const [heavyId, lightId] = parent.memberIds!;
      const heavy = tree.get(heavyId)!, light = tree.get(lightId)!;
      const rel = stateVectorsToElements(sub(light.pos, heavy.pos), sub(light.vel, heavy.vel), G * parent.mass);
      if (rel.elements) {
        const isHeavy = n.id === heavyId;
        const share = (isHeavy ? light.mass : heavy.mass) / parent.mass;
        elements = {
          ...rel.elements,
          a_AU: rel.elements.a_AU * share,
          omega_deg: isHeavy ? (rel.elements.omega_deg + 180) % 360 : rel.elements.omega_deg
        };
        const aM = rel.elements.a_AU * AU_M;
        nRadPerS = Math.sqrt((G * parent.mass) / (aM * aM * aM));
      }
      unbound = rel.unbound;
      hostMu = G * parent.mass;
    } else if (parent) {
      const own = elementsAbout(n, parent);
      elements = own.elements;
      unbound = own.unbound;
      hostMu = G * parent.mass;
    }

    if (n.kind === 'pair') {
      pairs.push({ id: n.id, parentId: n.parentId, memberIds: n.memberIds!, mass: n.mass, elements, hostMu });
    } else {
      placements.push({
        id: n.id, parentId: n.parentId, roleHint: n.roleHint, elements, hostMu, nRadPerS, unbound,
        isRoot: n.parentId === null, blackHole: n.input!.category === 'blackhole'
      });
    }
  }

  return { placements, pairs, farField, rootId };
}
