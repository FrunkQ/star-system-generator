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
 *  placement guide. Radial half-width (8·mu/3)^(1/2)·a and the widest tadpole's longitude span
 *  (~24 deg from the secondary out to L3 at 180 deg) are the reference-anchored numbers
 *  (Murray & Dermott 1999); the lobe drawn between them is display-grade. */
export function tadpoleRegion(secondaryMassKg: number, hostMassKg: number): {
    radialHalfWidthFrac: number;      // fraction of the secondary's a
    longitudeSpanDeg: [number, number]; // from the secondary, along the orbit, at the separatrix
} {
    const mu = hostMassKg > 0 ? secondaryMassKg / (hostMassKg + secondaryMassKg) : 0;
    return {
        radialHalfWidthFrac: Math.sqrt((8 * Math.max(0, mu)) / 3),
        longitudeSpanDeg: [24, 180]
    };
}

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
export function deriveCoOrbitalOrbits(system: System): void {
    const nodesById = new Map(system.nodes.map((n) => [n.id, n]));
    const done = new Set<string>();

    const resolve = (node: CelestialBody, stack: Set<string>): void => {
        if (done.has(node.id)) return;
        if (stack.has(node.id)) { delete node.coOrbital; done.add(node.id); return; } // cycle: drop this link
        if (!node.coOrbital) { done.add(node.id); return; }
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
        if ((n.kind === 'body' || n.kind === 'construct') && (n as CelestialBody).coOrbital) {
            resolve(n as CelestialBody, new Set());
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
