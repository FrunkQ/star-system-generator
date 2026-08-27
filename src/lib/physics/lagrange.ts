// THE ONE LAGRANGE-POINT CONVENTION (G43). Five pieces of code used to answer "where is an
// L-point" five different ways (overlay ellipse-at-f±60, authoring M0-shift, transit-phantom
// M0-shift, scheduler omega-rotation, planner-dropdown SOI radii) and eccentric arrivals
// teleported up to ~0.5 AU between two of them. Every consumer — the overlay, the authoring
// tabs, the processor's derivation pass, the transit calculator and the scheduler — must come
// HERE. Do not restate any of these transforms elsewhere.
//
// THE MATHS, reference-checked 2026-08-25 (design note: docs/dev/lagrange-full-citizens-design.md):
//  - L3/L4/L5 have an EXACT Kepler representation: the secondary's ellipse rigidly rotated in
//    argument of periapsis by +180 / +60 / -60 degrees, with the SAME mean anomaly and epoch.
//    Same a, e, period; radius r(f) matches the secondary's at every instant, so the equilateral
//    triangle (L4/L5) and the antipode (L3) hold exactly, eccentric orbits included. Equivalently:
//    the point's position/velocity are the secondary's, rigidly rotated about the host.
//  - L1/L2 have NO Kepler representation (they co-rotate at the secondary's angular rate at a
//    different radius). But the collinear-scaled state (1∓k)·r(t), (1∓k)·v(t) with
//    k = (m2 / 3 m1)^(1/3) (the Hill cube-root distance, display-grade vs the exact quintic) IS
//    expressible through the standard propagator: scale a_AU by (1∓k) AND hostMu by (1∓k)^3.
//    Then n = sqrt(mu'/a'^3) equals the secondary's mean motion (same period) and the perifocal
//    velocity h-formula yields exactly (1∓k)·v. Position AND velocity correct, zero new code
//    paths in the propagator.
//  - Stability numbers (P2 consumes these; verified against the literature):
//    Routh/Gascheau 1843: triangular points are linearly stable while 27·mu·(1-mu) < 1,
//    mu = m2/(m1+m2), critical mu_R = (1 - sqrt(69)/9)/2 ≈ 0.0385208965. With a MASSIVE trojan
//    the general form is (m1+m2+m3)^2 >= 27·(m1·m2 + m2·m3 + m3·m1), collapsing to Routh as
//    m3 -> 0. Tadpole radial half-width: (8·mu/3)^(1/2)·a (Murray & Dermott 1999); the widest
//    tadpole spans mean longitudes ~24..180 degrees from the secondary (the separatrix through L3).
import type { CelestialBody, Barycenter, Orbit, LagrangePointId, System } from '../types';
import { G } from '../constants';

export const LAGRANGE_POINT_IDS: LagrangePointId[] = ['l1', 'l2', 'l3', 'l4', 'l5'];

/** The five points as PLACEMENT strings, in the order the editors offer them. The placement string
 *  is display-legacy (the `coOrbital` marker is the record), but it is what the construct editors
 *  bind their dropdowns to, so the vocabulary lives here with everything else about L-points. */
export const LAGRANGE_PLACEMENTS = ['L1', 'L2', 'L3', 'L4', 'L5'] as const;

/** Is this placement string one of the five points, and which? Returns null for 'Surface',
 *  'Low Orbit', an AU-distance band, or anything else. ONE predicate — before G43 P3 this question
 *  was asked as `p === 'L4' || p === 'L5'` in nine places, which is how L1-L3 came to be authorable
 *  by the transit planner and not by the editors. */
export function lagrangePlacementId(placement?: string | null): LagrangePointId | null {
    if (!placement) return null;
    const key = placement.trim().toLowerCase();
    return (LAGRANGE_POINT_IDS as string[]).includes(key) ? (key as LagrangePointId) : null;
}

/** The TRIANGULAR points are the two that can hold something for free (subject to Gascheau);
 *  L1/L2/L3 are unstable equilibria. Accepts either form ('L4' or 'l4'), because the renderers
 *  carry display names and the data model carries ids. */
export function isTriangularPoint(pointOrPlacement?: string | null): boolean {
    const id = lagrangePlacementId(pointOrPlacement);
    return id === 'l4' || id === 'l5';
}

/** What it COSTS to sit at a point — physics, published as a tag, never decided in the UI.
 *
 *  `coasting`        a triangular point whose trio passes Gascheau: a genuine free-fall orbit, so
 *                    holding station there costs nothing at all.
 *  `station-keeping` a collinear point (L1/L2/L3): a real equilibrium, but a saddle — periodic trim
 *                    burns hold a craft there indefinitely, which is exactly what real halo-orbit
 *                    missions do.
 *  `holding`         the triangular regime is BREACHED (Gascheau margin below 1): the point is no
 *                    longer an equilibrium at all, so a ship there is not station-keeping, it is
 *                    thrusting continuously to stay somewhere the physics does not hold it.
 *
 *  `margin` is the Gascheau margin for a triangular point and null for a collinear one (the bound
 *  does not speak about those). Stability reads the margin and this reads the bucket, so the trojan
 *  regime is judged in exactly ONE place. */
export type LagrangeFuelUse = 'coasting' | 'station-keeping' | 'holding';
export function coOrbitalHold(
    point: LagrangePointId,
    hostMassKg: number,
    secondaryMassKg: number,
    nodeMassKg: number
): { margin: number | null; fuelUse: LagrangeFuelUse } {
    if (point === 'l4' || point === 'l5') {
        const margin = gascheauMargin(hostMassKg, secondaryMassKg, nodeMassKg);
        return { margin, fuelUse: margin >= 1 ? 'coasting' : 'holding' };
    }
    return { margin: null, fuelUse: 'station-keeping' };
}

export interface LagrangePoint {
    name: string;
    x: number;
    y: number;
    isRotated: boolean;
}

function nodeMassKg(n: CelestialBody | Barycenter | undefined | null): number {
    if (!n) return 0;
    if (n.kind === 'barycenter') return (n as Barycenter).effectiveMassKg || 0;
    return (n as CelestialBody).massKg || 0;
}

/** Hill cube-root factor k: L1/L2 sit at (1∓k)·r along the host→secondary line. Display-grade
 *  (the exact collinear points solve a quintic; the cube root is the standard approximation).
 *  Clamped: for comparable masses the collinear geometry degenerates, so k is capped well below 1. */
export function hillFactor(secondaryMassKg: number, hostMassKg: number): number {
    if (!(secondaryMassKg > 0) || !(hostMassKg > 0)) return 0;
    const k = Math.cbrt(secondaryMassKg / (3 * hostMassKg));
    return Math.min(k, 0.5);
}

/** The in-plane rotation for a triangular/antipodal point, in radians. L4 LEADS the secondary and
 *  L5 trails — in the secondary's actual direction of motion, so a retrograde orbit flips the sign. */
export function coOrbitalAngleRad(point: LagrangePointId, retrograde?: boolean): number {
    const dir = retrograde ? -1 : 1;
    if (point === 'l3') return Math.PI;
    if (point === 'l4') return dir * (Math.PI / 3);
    if (point === 'l5') return -dir * (Math.PI / 3);
    return 0;
}

/** L1/L2 radial scale factor (1∓k); 1 for the rotational points. */
export function coOrbitalScale(point: LagrangePointId, secondaryMassKg: number, hostMassKg: number): number {
    if (point === 'l1') return 1 - hillFactor(secondaryMassKg, hostMassKg);
    if (point === 'l2') return 1 + hillFactor(secondaryMassKg, hostMassKg);
    return 1;
}

function rotate(p: { x: number; y: number }, angleRad: number): { x: number; y: number } {
    const c = Math.cos(angleRad);
    const s = Math.sin(angleRad);
    return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** Transform the SECONDARY's host-relative state into the L-point's: rotate for l3/l4/l5, scale
 *  for l1/l2. Works for position and velocity alike (both transforms are linear). */
export function coOrbitalRelState(
    secondaryRel: { x: number; y: number },
    point: LagrangePointId,
    secondaryMassKg: number,
    hostMassKg: number,
    retrograde?: boolean
): { x: number; y: number } {
    if (point === 'l1' || point === 'l2') {
        const f = coOrbitalScale(point, secondaryMassKg, hostMassKg);
        return { x: secondaryRel.x * f, y: secondaryRel.y * f };
    }
    return rotate(secondaryRel, coOrbitalAngleRad(point, retrograde));
}

/** Derive the L-point ORBIT from the secondary's — the exact representations documented above.
 *  Returns null when the secondary has no orbit or the masses are missing. The result is an
 *  ordinary stored orbit: every consumer (orrery, holo, transit, exports) propagates it with no
 *  special cases. NOTE the l1/l2 hostMu is deliberately (1∓k)^3 × the physical mu — that scaling
 *  IS the co-rotation (same period, velocity (1∓k)·v); "fixing" it back breaks both. */
export function deriveCoOrbitalOrbit(
    secondary: CelestialBody | Barycenter,
    hostMassKg: number,
    point: LagrangePointId
): Orbit | null {
    const src = (secondary as CelestialBody).orbit;
    const m2 = nodeMassKg(secondary);
    if (!src || !(hostMassKg > 0) || !(m2 > 0)) return null;
    const retro = !!src.isRetrogradeOrbit;
    const f = coOrbitalScale(point, m2, hostMassKg);
    const angleDeg = (coOrbitalAngleRad(point, retro) * 180) / Math.PI;
    const orbit: Orbit = {
        hostId: src.hostId,
        hostMu: (src.hostMu || hostMassKg * G) * f * f * f,
        t0: src.t0,
        elements: {
            a_AU: (src.elements.a_AU || 0) * f,
            e: src.elements.e || 0,
            i_deg: src.elements.i_deg || 0,
            Omega_deg: src.elements.Omega_deg || 0,
            omega_deg: (((src.elements.omega_deg || 0) + angleDeg) % 360 + 360) % 360,
            M0_rad: src.elements.M0_rad || 0
        }
    };
    // CARRY A PINNED MEAN MOTION, or the point silently walks away from its own body.
    //
    // An orbit may pin `n_rad_per_s` instead of letting Kepler set the rate, and the bundled maps DO:
    // Pluto and Charon, Alpha Centauri's Oceanus/Khione, Helline and Persephone, Uggi's Cerebus moons.
    // Every Lagrange point CO-ROTATES with its secondary by definition, so it must turn at the
    // secondary's actual rate — not at the rate its own elements would imply. Dropping the pin left
    // the derived orbit on Kepler's rate, and where a pin disagrees with Kepler it disagrees a lot:
    // measured 1.33x on Oceanus/Khione (33 deg of drift per year), 1.12x on Persephone (58 deg/yr),
    // 1.45x on Helline, and 28x on Pluto. A trojan would visibly leave its point over a campaign.
    // The sign is already correct in a pinned value (see propagateState), so it is copied verbatim,
    // and it applies to the collinear points too — co-rotation is exactly what they do.
    if (src.n_rad_per_s !== undefined) orbit.n_rad_per_s = src.n_rad_per_s;
    if (retro) orbit.isRetrogradeOrbit = true;
    if (src.frame) orbit.frame = src.frame;
    return orbit;
}

/** Gascheau's 1843 criterion for three massive bodies in the equilateral configuration:
 *  stable while (m1+m2+m3)^2 >= 27·(m1·m2 + m2·m3 + m3·m1). Collapses to the Routh bound
 *  27·mu·(1-mu) < 1 as m3 -> 0. Returns the stability MARGIN (>= 1 is stable). */
export function gascheauMargin(m1: number, m2: number, m3: number): number {
    const sum = m1 + m2 + m3;
    const cross = m1 * m2 + m2 * m3 + m3 * m1;
    if (!(cross > 0)) return Infinity;
    return (sum * sum) / (27 * cross);
}

export const ROUTH_CRITICAL_MU = 0.5 * (1 - Math.sqrt(69) / 9); // ≈ 0.0385208965

/** The heaviest trojan the triangular points can hold for this pair — the smaller root of
 *  Gascheau's quadratic in m3 (m3^2 - 25·(m1+m2)·m3 + ((m1+m2)^2 - 27·m1·m2) = 0). Anchors:
 *  m2 -> 0 recovers the Routh bound (m3 ≈ 0.0401·m1, mu = 0.0385); a pair already past Routh
 *  returns 0. */
export function maxTrojanMassKg(hostMassKg: number, secondaryMassKg: number): number {
    const s = hostMassKg + secondaryMassKg;
    const c = s * s - 27 * hostMassKg * secondaryMassKg;
    if (!(s > 0) || c <= 0) return 0;
    const disc = 625 * s * s - 4 * c;
    if (disc <= 0) return 0;
    return (25 * s - Math.sqrt(disc)) / 2;
}

/** Display geometry of the tadpole (libration) region around L4/L5, for the areas overlay and the
 *  placement guide.
 *
 *  THE DRAWN LOBE IS THE OCCUPIED SWARM, NOT THE SEPARATRIX, and the difference is the whole
 *  reason this returns what it does. The mathematical tadpole family reaches from ~24 deg off the
 *  secondary all the way round to L3 at 180 deg (Murray & Dermott 1999) — but that is the OUTER
 *  BOUND of the family, and drawing it says "half this orbit is the L4 zone", which is true of no
 *  real system. Jupiter's actual swarms librate about the point with a mean amplitude near 21 deg
 *  (20.85 deg at L5, 21.75 deg at L4), and stable libration runs out to roughly 80 deg. So the
 *  default lobe is the swarm: the point, plus the amplitude a trojan actually keeps.
 *
 *  `radialHalfWidthFrac` is the well-founded half-width of the co-orbital region,
 *  (8·mu/3)^(1/2)·a (Murray & Dermott 1999) — real physics, scaling with the mass ratio.
 *  `swarmHalfAngleDeg` is a DISPLAY choice anchored on the observed amplitude, and
 *  `stableHalfAngleDeg` / `separatrixDeg` record the wider bounds so nothing has to re-derive them. */
export function tadpoleRegion(secondaryMassKg: number, hostMassKg: number): {
    radialHalfWidthFrac: number;   // fraction of the secondary's a — the co-orbital region's width
    swarmHalfAngleDeg: number;     // drawn lobe: mean observed libration amplitude about the point
    stableHalfAngleDeg: number;    // the amplitude beyond which libration stops being stable
    separatrixDeg: number;         // where the tadpole family ends: L3, on the far side
} {
    const mu = hostMassKg > 0 ? secondaryMassKg / (hostMassKg + secondaryMassKg) : 0;
    return {
        radialHalfWidthFrac: Math.sqrt((8 * Math.max(0, mu)) / 3),
        swarmHalfAngleDeg: 21,
        stableHalfAngleDeg: 80,
        separatrixDeg: 180
    };
}

// ————— THE REAL SHAPE OF A LAGRANGE REGION ———————————————————————————————————————————————————————
//
// A tadpole is not an arc segment. It is a zero-velocity curve of the circular restricted three-body
// problem, and it really is tadpole-shaped: a fat head around the triangular point and a tail that
// narrows as it reaches toward the secondary. Drawing a constant-width band was a stylisation that
// got the WIDTH right (it came from the same mass ratio) and the SHAPE wrong.
//
// The maths is the Jacobi integral. In the barycentric co-rotating frame, normalised so the two
// bodies sit unit distance apart with total mass 1:
//     primary   (mass 1-mu) at (-mu, 0)
//     secondary (mass   mu) at (1-mu, 0)
//     2U(x,y) = (x^2 + y^2) + 2(1-mu)/r1 + 2mu/r2
// L4 and L5 are LOCAL MINIMA of U — check it: stepping off L4 either radially or along the orbit
// RAISES U, and U runs away to infinity at the secondary. (This is the easy thing to get backwards.
// The triangular points are stable despite sitting at a potential minimum in the rotating frame
// because the Coriolis term does the stabilising, which is also why stability depends on the mass
// ratio at all — that is Routh's bound.) So the closed curve around L4 at Jacobi constant C is the
// contour {2U = C} with C slightly ABOVE 2U(L4), and the region it bounds, {2U <= C}, is the
// tadpole. Raising C grows it until the two lobes merge through the L3 neck.
//
// ECCENTRICITY: the CR3BP is circular by construction. The standard first-order treatment of an
// eccentric pair is the PULSATING frame — the same normalised shape, scaled by the instantaneous
// separation — so the renderer scales this outline by the secondary's CURRENT distance rather than
// by its semi-major axis, and the region breathes over the orbit exactly as the geometry does.

/** 2U at a point in the barycentric co-rotating frame (normalised units). */
export function jacobiPotential2(mu: number, x: number, y: number): number {
    const r1 = Math.hypot(x + mu, y);
    const r2 = Math.hypot(x - 1 + mu, y);
    if (r1 <= 0 || r2 <= 0) return Infinity;
    return x * x + y * y + (2 * (1 - mu)) / r1 + (2 * mu) / r2;
}

/** A point on the co-orbital track: distance `r` from the PRIMARY, at longitude `phi` measured from
 *  the primary→secondary direction. Returned in barycentric coordinates. */
function trackPoint(mu: number, phi: number, r: number): { x: number; y: number } {
    return { x: -mu + r * Math.cos(phi), y: r * Math.sin(phi) };
}

/**
 * The outline of the tadpole region around L4 (or its mirror at L5), as a closed polygon in
 * PRIMARY-CENTRED normalised coordinates with the secondary along +x. The renderer rotates it to the
 * secondary's current bearing and scales it by the current separation.
 *
 * `swarmHalfAngleDeg` sets which member of the tadpole family to draw, by naming how far along the
 * orbit from the point the region should reach — the Jacobi constant is taken from that longitude,
 * so the shape that comes back is the true contour for it rather than a drawn approximation.
 */
export function tadpoleOutline(
    mu: number,
    point: 'l4' | 'l5',
    swarmHalfAngleDeg: number,
    steps = 96
): { x: number; y: number }[] {
    if (!(mu > 0) || mu >= 0.5) return [];
    const L4_PHI = Math.PI / 3;
    const half = (swarmHalfAngleDeg * Math.PI) / 180;
    // The contour that passes through the near edge of the requested swarm.
    const C = jacobiPotential2(mu, ...(Object.values(trackPoint(mu, L4_PHI - half, 1)) as [number, number]));

    // For each longitude, find how far in and out of the track the region reaches. `inside` widens
    // from the track itself, so a longitude the region does not reach simply yields nothing.
    const radialAt = (phi: number): { lo: number; hi: number } | null => {
        // Positive = INSIDE the tadpole ({2U <= C}).
        const at = (r: number) => {
            const p = trackPoint(mu, phi, r);
            return C - jacobiPotential2(mu, p.x, p.y);
        };
        if (at(1) < 0) return null;                     // the track itself is outside this contour
        const edge = (dir: 1 | -1): number => {
            let good = 1, bad = 1 + dir * 0.9;           // 0.9 covers even a very fat region
            if (at(bad) >= 0) return bad;
            for (let i = 0; i < 40; i++) {
                const mid = 0.5 * (good + bad);
                if (at(mid) >= 0) good = mid; else bad = mid;
            }
            return good;
        };
        return { lo: edge(-1), hi: edge(1) };
    };

    const outer: { x: number; y: number }[] = [];
    const inner: { x: number; y: number }[] = [];
    // Scan the LEADING half only. U is symmetric about the primary–secondary line, so {2U <= C}
    // always contains both lobes; sweeping the whole circle would weld L4's tadpole to L5's. Each
    // outline owns its own side and the contour closes itself wherever the region pinches out.
    for (let i = 1; i < steps; i++) {
        const phi = (i / steps) * Math.PI;
        const band = radialAt(phi);
        if (!band) continue;
        outer.push(trackPoint(mu, phi, band.hi));
        inner.push(trackPoint(mu, phi, band.lo));
    }
    if (outer.length < 3) return [];
    const ring = [...outer, ...inner.reverse()];
    // Barycentric → primary-centred, and mirror for the trailing point.
    const flip = point === 'l5' ? -1 : 1;
    return ring.map((p) => ({ x: p.x + mu, y: p.y * flip }));
}

/** The practical STATION-KEEPING ENVELOPE around a collinear point, as semi-axes in units of the
 *  secondary's Hill radius: along-orbit first, radial second.
 *
 *  This is a different KIND of region from a tadpole and the difference is the point: L1/L2/L3 are
 *  saddles, so nothing is trapped there and there is no stability contour to draw. What there IS, and
 *  what a GM actually wants, is the volume a station can practically hold station within — the halo
 *  and Lissajous orbits real missions fly. The anchor is JWST: its halo about Sun–Earth L2 spans
 *  roughly 800,000 km against Earth's ~1.5 million km Hill radius, so about half a Hill radius
 *  along-orbit, and it is flatter than it is long. Display convention, honestly labelled — NOT a
 *  claim that the physics confines anything here. */
export const COLLINEAR_ENVELOPE_HILL = { alongOrbit: 0.5, radial: 0.35 };

/** Resolve a co-orbital node's SECONDARY in a system, or null when the marker dangles. */
export function coOrbitalSecondary(system: System, node: CelestialBody): CelestialBody | Barycenter | null {
    if (!node.coOrbital) return null;
    return (system.nodes.find((n) => n.id === node.coOrbital!.hostId) as CelestialBody | Barycenter) ?? null;
}

/**
 * PASS 0c (G43): derive the ORBIT of every co-orbital node from its secondary's. Runs after the
 * barycentre passes (which may rewrite member orbits) and before physical basics (which reads
 * orbits). ORDERING: a co-orbital node depends on a SIBLING, which the parent-before-child rule
 * does not cover — chains (a trojan of a co-orbital body) resolve recursively here, cycle-guarded.
 * SELF-HEAL: a marker whose secondary is gone (or orbitless) is deleted and the node keeps its
 * last derived orbit as a plain authored one — the same refuse-to-produce-never-refuse-to-accept
 * shape as the other reconcile passes. Deterministic and idempotent: everything written derives
 * from the secondary's authored orbit.
 */
// WHO OWNS A CO-ORBITAL NODE'S ORBIT AND PARENTAGE (B98). This derivation does, and NOTHING ELSE may
// re-home a node that rides a point - but the converse matters just as much: a node that is a MEMBER
// of a barycentre never rides a point itself, because the PAIR does. Both halves are needed. With
// only the first, the reconciler rebuilt the pair every other pass; with only the second, a promoted
// trojan would lose its point altogether.
//
// The failure this prevents is worth stating because the number named it: a binary trojan's
// companion drifted 2.5e-6 -> 2.91 -> 4.55 -> ... -> 6.5 AU, one step per process, because the
// reconciler was measuring the 60-degree L4 OFFSET as if it were the pair's separation. The chord
// across 60 degrees is exactly the orbital radius, which is the value it climbed toward.
export function deriveCoOrbitalOrbits(system: System): void {
    const nodesById = new Map(system.nodes.map((n) => [n.id, n]));
    const done = new Set<string>();
    // Every id that is a MEMBER of some barycentre, and the barycentre it belongs to.
    const memberOf = new Map<string, Barycenter>();
    for (const n of system.nodes) {
        if (n.kind !== 'barycenter') continue;
        for (const id of (n as Barycenter).memberIds || []) memberOf.set(id, n as Barycenter);
    }

    const resolve = (node: CelestialBody | Barycenter, stack: Set<string>): void => {
        if (done.has(node.id)) return;
        if (stack.has(node.id)) { delete node.coOrbital; done.add(node.id); return; } // cycle: drop this link
        if (!node.coOrbital) { done.add(node.id); return; }
        // THE PAIR RIDES THE POINT, NOT ITS MEMBERS. A member's orbit belongs to the barycentre it
        // belongs to; re-homing it to the secondary's host below is precisely what tore the pair
        // apart. The marker moves up to the barycentre on promotion, so this only fires on data
        // authored or imported the old way - and dropping it here is the repair, not a loss.
        if (memberOf.has(node.id)) { delete node.coOrbital; done.add(node.id); return; }
        stack.add(node.id);

        const secondary = nodesById.get(node.coOrbital.hostId) as CelestialBody | Barycenter | undefined;
        if (secondary && (secondary as CelestialBody).coOrbital) {
            resolve(secondary as CelestialBody, stack);
        }
        const src = secondary ? (secondary as CelestialBody).orbit : undefined;
        const host = secondary?.parentId ? nodesById.get(secondary.parentId) : undefined;
        const hostMassKg = nodeMassKg(host as CelestialBody | Barycenter | undefined)
            || (src?.hostMu ? src.hostMu / G : 0);
        const derived = secondary ? deriveCoOrbitalOrbit(secondary, hostMassKg, node.coOrbital.point) : null;
        if (!derived) {
            delete node.coOrbital;  // dangling or underspecified — the node becomes a plain orbiter
        } else {
            node.orbit = derived;
            // A co-orbital node is a SIBLING of its secondary (it orbits the same host), and the
            // UI groups it under the secondary — the convention today's L4/L5 constructs already use.
            node.parentId = secondary!.parentId ?? node.parentId;
            node.ui_parentId = secondary!.id;
        }
        stack.delete(node.id);
        done.add(node.id);
    };

    for (const n of system.nodes) {
        // Barycentres included: a PAIR may ride a point (B98). Deriving the barycentre's orbit leaves
        // the members' own orbits ABOUT it untouched, which is the whole point - they keep the mutual
        // orbit the GM gave them and the pair as a whole sits at the Lagrange point.
        if ((n.kind === 'body' || n.kind === 'construct' || n.kind === 'barycenter') && n.coOrbital) {
            resolve(n as CelestialBody | Barycenter, new Set());
        }
    }
}

/**
 * Display positions of the 5 Lagrange points for a two-body pair, relative to the primary —
 * thin wrapper over the one convention above, driven by the secondary's CURRENT position (and
 * mass), so the overlay can never disagree with the derivation/transit/scheduler again.
 * All points return isRotated: true (they are already in the world-relative frame).
 */
export function calculateLagrangePoints(primary: CelestialBody, secondary: CelestialBody, secondaryPos: { x: number, y: number }): LagrangePoint[] {
    if (!primary.massKg || !secondary.massKg || !secondary.orbit) {
        return [];
    }
    const retro = !!secondary.orbit.isRetrogradeOrbit;
    return LAGRANGE_POINT_IDS.map((id) => {
        const p = coOrbitalRelState(secondaryPos, id, secondary.massKg!, primary.massKg!, retro);
        return { name: id.toUpperCase(), x: p.x, y: p.y, isRotated: true };
    });
}
