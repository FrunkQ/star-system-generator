// THE ONE MEGA-CONSTRUCT GEOMETRY BUILDER — THREE.js at this edge and nowhere behind it.
// (G53 phase 3, docs/dev/mega-constructs-design.md §5b.4.)
//
// THE OWNER COLLAPSED SIX RENDER PATHS INTO THIS FILE, 2026-08-28: *"effectively a swarm would be a
// simple polygon (dyson sphere/part sphere/ring) but only the apexes are drawn. A ring is just an
// unfinished sphere - they can all use the same draw call."* He is right and THREE already has the
// primitive: `SphereGeometry` takes longitude AND latitude extents, so "an unfinished sphere" is two
// arguments rather than a metaphor. A shell is the full sphere; a growing shell is a longitude
// wedge; a ringworld is a narrow latitude band at the equator; a swarm is the SAME window drawn as
// points. One generator, one draw call, differences as arguments.
//
// WHAT IS PURE AND WHAT IS NOT. `megaTypes.shape()` decides the NUMBERS (radii, angular windows,
// density) with no THREE at all, and is gated as ordinary maths — that is E7's requirement, because
// a canvas cannot be verified by a worker session. This module turns a finished spec into a mesh and
// nothing more: no physics, no policy, no reading of nodes. It is still fully testable — THREE runs
// headlessly (the precedent is `modelViewer.spec.ts`), so vertex counts, bounds, UVs and the
// distribution below are all ordinary assertions. Only the LOOK needs an eye.
//
// SCENE UNITS IN, SCENE UNITS OUT. The caller passes the radius it wants in scene units — the scale
// law's answer, never a physical km — so this file cannot disagree with the scale law by
// construction. It never imports it either.
import * as THREE from 'three';
import type { MegaShapeSpec } from './megaTypes';

/** How a built mega wants to be drawn. The caller picks the material; this names the mode. */
export type MegaDrawMode = 'faces' | 'points' | 'ribbon';

export interface BuiltMegaGeometry {
  geometry: THREE.BufferGeometry;
  mode: MegaDrawMode;
  /** Scene-unit radius the geometry actually occupies — what framing and min-zoom should read. */
  radiusScene: number;
  /** True when the habitable face points INWARD (a ring or shell interior), so the caller knows to
   *  render `THREE.BackSide` and light from the centre outward (§5b.4b). */
  interior: boolean;
  /**
   * TETHER ONLY: where the captured-asteroid counterweight rides, and how big to draw it — both in
   * scene units from the host's centre, along the ribbon.
   *
   * `atScene` is PHYSICS (the real geostationary altitude in the host's own drawn currency).
   * `radiusScene` is READABILITY and says so: a counterweight is a captured rock a few km across on
   * a world thousands of km across, so at true scale it is invisible at every zoom that shows the
   * ribbon. It is drawn as a fraction of the HOST's drawn radius — the same honest device as the
   * screen-space pixel floors (RENDER-S43), and for the same reason: the alternative is a feature
   * nobody can see. The elevator's real counterweight MASS is a separate authored/referenced thing
   * (§5b.7's `counterweightId`) and is not what this number is.
   */
  counterweight?: { atScene: number; radiusScene: number };
}

/** Face-path resolution. A band needs plenty of longitude and almost no latitude; a full shell wants
 *  both. Kept here rather than in the spec because it is a RENDER quality choice, not physics. */
const PHI_SEGMENTS_FULL = 128;
const THETA_SEGMENTS_FULL = 64;
/** A swarm's apex count at density 1. Density scales it; §5b.4's "density IS the segment count". */
const SWARM_POINTS_MAX = 4000;
const SWARM_POINTS_MIN = 24;
/** The counterweight rock, as a fraction of the host's DRAWN radius — legibility, not scale. */
const COUNTERWEIGHT_HOST_FRAC = 0.07;

/** The ribbon's drawn WIDTH as a fraction of the host's drawn radius — the counterweight's own
 *  honest readability device, applied to the ribbon that carries it. A true-scale ribbon is
 *  metres wide and a 1px WebGL line stood in for it, which was invisible against a lit planet
 *  limb on every GPU (owner, 2026-08-30 and again 2026-09-01) — a drawn width that scales with
 *  the world stays a sliver of the planet at every zoom and never vanishes into a hairline. */
const TETHER_WIDTH_HOST_FRAC = 0.01;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * THE POINTS PATH USES A FIBONACCI DISTRIBUTION, AND THIS IS THE TRAP THE DESIGN NAMED.
 *
 * A UV sphere's vertices CLUSTER AT THE POLES — dense top and bottom, sparse at the equator. Drawn
 * as faces that never shows; drawn as POINTS a swarm would visibly bunch at its poles for no
 * physical reason, which is the renderer inventing a fact. The golden-angle spiral spaces points
 * evenly over the sphere with no library and no RNG, and it is deterministic, so the same swarm
 * draws the same way on every load (the §3.7 determinism rule, which exists because a value that
 * changes per load is one an earlier pass can read and a later pass rewrite).
 *
 * Points outside the spec's angular window are DROPPED rather than squeezed in, so a partial swarm
 * thins honestly instead of getting denser in a smaller space.
 */
function fibonacciPoints(
  count: number,
  radius: number,
  thetaStart: number,
  thetaLength: number,
  phiStart: number,
  phiLength: number
): Float32Array {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const out: number[] = [];
  const fullSphere = phiLength >= 2 * Math.PI - 1e-9 && thetaLength >= Math.PI - 1e-9;
  for (let i = 0; i < count; i++) {
    // Even in cos(theta) — that is what makes it even on the SPHERE rather than in latitude.
    const cosTheta = 1 - (2 * (i + 0.5)) / count;
    const theta = Math.acos(clamp(cosTheta, -1, 1));       // 0 at +Y pole, PI at -Y
    const phi = (i * golden) % (2 * Math.PI);
    if (!fullSphere) {
      if (theta < thetaStart || theta > thetaStart + thetaLength) continue;
      const rel = (phi - phiStart + 2 * Math.PI) % (2 * Math.PI);
      if (rel > phiLength) continue;
    }
    const sinTheta = Math.sin(theta);
    out.push(
      radius * sinTheta * Math.cos(phi),
      radius * Math.cos(theta),
      radius * sinTheta * Math.sin(phi)
    );
  }
  return new Float32Array(out);
}

/**
 * Build the geometry for a finished shape spec.
 *
 * `radiusScene` is the drawn radius the caller wants (the scale law's answer). For a tether the
 * caller passes the HOST's drawn radius instead, and `spec.topAltitudeKm` is turned into a
 * proportion of it — a ribbon is only meaningful relative to the world it hangs from.
 */
export function buildMegaGeometry(
  spec: MegaShapeSpec,
  radiusScene: number,
  opts: { hostRadiusScene?: number; hostRadiusKm?: number } = {}
): BuiltMegaGeometry | null {
  if (spec.family === 'tether') {
    // A LINE, not a mesh problem (§5b's whole point). Two points: the anchor on the host's surface
    // and the counterweight above geostationary. Drawn along +Y in local space; the caller orients
    // it to the anchor latitude and spins it with the world.
    if (spec.topAltitudeKm == null) return null;   // no real geostationary — nothing to draw, honestly
    const hostR = opts.hostRadiusScene ?? radiusScene;
    const hostKm = opts.hostRadiusKm ?? 0;
    // Scene units per km, from the host's own drawn size — so the ribbon's length is in the same
    // currency as the world it stands on rather than a second scale.
    const perKm = hostKm > 0 ? hostR / hostKm : 0;
    const topScene = hostR + spec.topAltitudeKm * perKm;
    // A slim BOX rather than a line primitive: WebGL lines are one pixel whatever you ask for,
    // and one pixel over a bright limb is no ribbon at all (see TETHER_WIDTH_HOST_FRAC).
    const w = Math.max(1e-9, hostR * TETHER_WIDTH_HOST_FRAC);
    const len = Math.max(1e-9, topScene - hostR);
    const geometry = new THREE.BoxGeometry(w, len, w);
    geometry.translate(0, hostR + len / 2, 0);
    return {
      geometry, mode: 'ribbon', radiusScene: topScene, interior: false,
      counterweight: { atScene: topScene, radiusScene: Math.max(1e-9, hostR * COUNTERWEIGHT_HOST_FRAC) }
    };
  }

  if (spec.family === 'spheroid') {
    // Already served by the scene's `attachHullVolume` ellipsoid (RENDER-S13) — this builder does
    // not duplicate it. Returning null is the honest answer: "not mine".
    return null;
  }

  const { thetaStartRad, thetaLengthRad, phiStartRad, phiLengthRad } = spec;
  const interior = true;   // every sphere-section mega is inhabited (or collected on) from inside

  if (spec.drawnAs === 'points') {
    const density = clamp(spec.pointDensityFrac ?? 0, 0, 1);
    // Density drives the apex count — ONE number driving the drawn collectors, the occlusion and the
    // harvest (§5b.4). Sampled over the WHOLE sphere then windowed, so a partial swarm keeps the
    // same spacing as a full one instead of concentrating.
    const total = Math.round(SWARM_POINTS_MIN + density * (SWARM_POINTS_MAX - SWARM_POINTS_MIN));
    const positions = fibonacciPoints(total, radiusScene, thetaStartRad, thetaLengthRad, phiStartRad, phiLengthRad);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeBoundingSphere();
    return { geometry, mode: 'points', radiusScene, interior };
  }

  // FACES. `SphereGeometry`'s own UVs run around longitude and along latitude, which is exactly what
  // the livery finishes need — a box projection would smear a texture across a 1 AU hoop
  // (`modelViewer.ts:340`'s caveat). So the faces path emits real UVs for free by using the
  // primitive rather than hand-rolling vertices.
  const phiFrac = clamp(phiLengthRad / (2 * Math.PI), 0, 1);
  const thetaFrac = clamp(thetaLengthRad / Math.PI, 0, 1);
  const widthSegments = Math.max(8, Math.round(PHI_SEGMENTS_FULL * phiFrac));
  // A ringworld's band is a few thousandths of a radian: never let it collapse to nothing, and never
  // spend 64 rings of vertices on it either.
  const heightSegments = Math.max(2, Math.round(THETA_SEGMENTS_FULL * thetaFrac));
  const geometry = new THREE.SphereGeometry(
    radiusScene,
    widthSegments,
    heightSegments,
    phiStartRad,
    phiLengthRad,
    thetaStartRad,
    thetaLengthRad
  );
  return { geometry, mode: 'faces', radiusScene, interior };
}
