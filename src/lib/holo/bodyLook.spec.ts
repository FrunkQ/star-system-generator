import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildBodyLook, isFilledFamily, type BodyLookTextures } from './bodyLook';
import {
  makeGlowTexture, makeHotspotTexture, makePlumeTexture,
  isBlackHoleNode, isFeedingBlackHole, buildHorizonLook, BH_LENS_SHRINK
} from './bodyFeatures';
import derived from '../../../tests/output/solar-system-derived.json';

// WHY THIS SPEC EXISTS. Until Stream K the live holo and the 3D reference gallery each ran their own
// inline assembly over the same twelve `bodyFeatures` builders, and they had already drifted: the
// gallery's star corona was `R * (3.2 + activity * 3)` where the holo's was `radius * (5 + activity
// * 4)`, and the two ran different pulses. Nothing could see that, because no test ever built one
// node twice. This one does: the SAME node through BOTH callers' option sets, compared on the
// FEATURE INVENTORY. If a caller grows a feature the others do not have, this goes red.

const textures: BodyLookTextures = {
  glow: makeGlowTexture(), hotspot: makeHotspotTexture(), plume: makePlumeTexture()
};

const nodes = (derived as any).nodes as any[];
const node = (name: string) => {
  const n = nodes.find((b: any) => b.name === name);
  if (!n) throw new Error(`fixture has no ${name}`);
  return n;
};

/** The holo's options for a lit, textured body at its readable radius. */
const HOLO = { textures, renderStyle: 'filled' as const, bodyStyle: 'textured' as const, unlit: false, atmospheres: true, aurora: 'physics' as const };
/** The gallery's options: one tile size, the showcase posture, the aurora read from the tag. */
const GALLERY = { textures, aurora: 'model' as const, tilt: 'showcase' as const };
/** The size-comparison view's options: the same look, at a TRUE radius, lit by one fixed key. */
const COMPARISON = { textures, aurora: 'model' as const, tilt: 'axial' as const };

// A BLACK HOLE IS NOT A STAR, and every one in this app carries `roleHint: 'star'`. Until 2026-09-06
// the size-comparison strip therefore drew Sagittarius A* as a glowing orange ball with a
// granulation texture, because the assembly tested the roleHint and nothing tested the assembly.
describe('a black hole is a horizon, not a photosphere', () => {
  const bh = (classes: string[], extra: any = {}) => ({
    id: 'bh', name: 'A*', roleHint: 'star', kind: 'body', classes,
    radiusKm: 12e6, massKg: 8.5e36, tags: [], ...extra
  });

  it('knows one when it sees one, in every spelling the app and an import can produce', () => {
    expect(isBlackHoleNode(bh(['star/BH']))).toBe(true);
    expect(isBlackHoleNode(bh(['star/BH_active']))).toBe(true);
    expect(isBlackHoleNode(bh(['BH']))).toBe(true);
    expect(isBlackHoleNode(bh(['star/black-hole']))).toBe(true);
    expect(isBlackHoleNode(bh(['star/G']))).toBe(false);
    expect(isBlackHoleNode(bh([]))).toBe(false);
    expect(isBlackHoleNode(null)).toBe(false);
    expect(isFeedingBlackHole(bh(['star/BH_active']))).toBe(true);
    expect(isFeedingBlackHole(bh(['star/BH'], { accretionEddington: 0.4 }))).toBe(true);
    expect(isFeedingBlackHole(bh(['star/BH']))).toBe(false);
  });

  it('draws NO photosphere, NO corona and no star texture — the fault this branch fixes', () => {
    const look = buildBodyLook(bh(['star/BH']), 100, { ...COMPARISON, photonRing: true });
    expect(look.star).toBeUndefined();                       // no corona/flare rig at all
    const mat = look.mesh.material as THREE.MeshBasicMaterial;
    expect(mat.color.getHex()).toBe(0x000000);
    expect(mat.map).toBeFalsy();                             // no granulation texture
    // ...and a star of the same shape still gets all of it, or the branch proves nothing.
    const star = buildBodyLook(bh(['star/G']), 100, COMPARISON);
    expect(star.star).toBeDefined();
    expect((star.mesh.material as THREE.MeshBasicMaterial).map).toBeTruthy();
  });

  it('marks the horizon with a photon ring ONLY where nothing else will', () => {
    // The lensed surfaces get their ring from the shader; a painted one beside it is a second,
    // wrong answer. The size comparison has no lensing pass, so without this a black hole is a
    // labelled hole in the strip.
    const withRing = buildBodyLook(bh(['star/BH']), 100, { ...COMPARISON, photonRing: true });
    const without = buildBodyLook(bh(['star/BH']), 100, COMPARISON);
    expect(withRing.mesh.children.length).toBe(1);
    expect(without.mesh.children.length).toBe(0);
    // AND IT MARKS THE MEASUREMENT RATHER THAN INFLATING IT: the ring's INNER edge is the horizon.
    const ring = withRing.mesh.children[0] as THREE.Mesh;
    const geo = ring.geometry as THREE.RingGeometry;
    expect(geo.parameters.innerRadius).toBe(100);
    expect(geo.parameters.outerRadius).toBeLessThanOrEqual(103);
  });

  it('keeps the LENS SHRINK with the lens, and never applies it to a true-scale drawing', () => {
    // The 0.55 exists because a lensing pass magnifies the black it finds; a surface without one
    // that applied it would state that a black hole is 45% smaller than it is - on the one view
    // whose whole claim is true size. `buildHorizonLook` takes a radius and never scales it.
    expect(BH_LENS_SHRINK).toBeGreaterThan(0);
    expect(BH_LENS_SHRINK).toBeLessThan(1);
    const trueScale = buildHorizonLook(1000);
    expect((trueScale.mesh.geometry as THREE.SphereGeometry).parameters.radius).toBe(1000);
    const lensed = buildHorizonLook(1000 * BH_LENS_SHRINK);
    expect((lensed.mesh.geometry as THREE.SphereGeometry).parameters.radius).toBe(550);
    // The comparison view asks for the FULL radius, which is what this pins.
    const look = buildBodyLook(bh(['star/BH']), 1000, { ...COMPARISON, photonRing: true });
    expect((look.mesh.geometry as THREE.SphereGeometry).parameters.radius).toBe(1000);
  });
});

describe('the one body-look assembly', () => {
  it('builds the same FEATURE INVENTORY for one node through every caller', () => {
    // THREE bodies, not the whole system, and each one is here for a feature the others lack:
    // Earth has clouds and an aurora, Io has volcanic vents, Jupiter is a banded giant with a
    // deck stack. Every extra body costs two full procedural equirect textures PER CALLER, and
    // this file's cost is not free to the rest of the suite (see the note at the foot).
    for (const name of ['Earth', 'Io', 'Jupiter']) {
      const n = node(name);
      const holo = buildBodyLook(n, 1, HOLO);
      const gallery = buildBodyLook(n, 1, GALLERY);
      const comparison = buildBodyLook(n, 1, COMPARISON);
      // The aurora SOURCE is the one option that can legitimately change the count (inbox B117), so
      // compare the two callers that read the same source, and check the third against them minus
      // whatever aurora shells it drew.
      expect({ name, ...gallery.inventory() }).toEqual({ name, ...comparison.inventory() });
      const h = holo.inventory(), g = gallery.inventory();
      expect(h.children.filter((c) => c !== 'Mesh').sort()).toEqual(g.children.filter((c) => c !== 'Mesh').sort());
      holo.dispose(); gallery.dispose(); comparison.dispose();
    }
  });

  it('gives a star a corona through the SHARED star look, at one size, for every caller', () => {
    const sun = node('Sol');
    const a = buildBodyLook(sun, 2, HOLO);
    const b = buildBodyLook(sun, 2, GALLERY);
    expect(a.star).toBeTruthy();
    expect(b.star).toBeTruthy();
    // The number the gallery used to disagree about. `buildStarLook` is now the only place it lives.
    expect(a.star!.coronaScale).toBe(b.star!.coronaScale);
    expect(a.star!.coronaScale).toBeCloseTo(2 * (5 + a.star!.activity * 4), 9);
    expect(a.inventory()).toEqual(b.inventory());
    a.dispose(); b.dispose();
  });

  it('scales every feature with the radius it is given, and questions the radius never', () => {
    const earth = node('Earth');
    const small = buildBodyLook(earth, 0.01, HOLO);
    const big = buildBodyLook(earth, 100, HOLO);
    // Same inventory at both extremes: TRUE scale must not lose a feature that readable scale has.
    expect(small.inventory()).toEqual(big.inventory());
    const rSmall = (small.mesh.geometry as THREE.SphereGeometry).parameters.radius;
    const rBig = (big.mesh.geometry as THREE.SphereGeometry).parameters.radius;
    expect(rSmall).toBe(0.01);
    expect(rBig).toBe(100);
    small.dispose(); big.dispose();
  });

  it('drops every emissive feature in the unlit "2D map" look, and only there', () => {
    const io = node('Io');                  // volcanic: the one body that has vents to lose
    const lit = buildBodyLook(io, 1, HOLO);
    const flat = buildBodyLook(io, 1, { ...HOLO, unlit: true });
    expect(lit.magma.length).toBeGreaterThan(0);
    expect(flat.magma.length).toBe(0);
    expect(flat.inventory().children.length).toBeLessThan(lit.inventory().children.length);
    lit.dispose(); flat.dispose();
  });

  it('knows which render styles it owns — the wire family belongs to the scene', () => {
    expect(isFilledFamily('filled')).toBe(true);
    expect(isFilledFamily('lopoly-filled')).toBe(true);
    expect(isFilledFamily('lopoly-lines')).toBe(true);
    expect(isFilledFamily('wire-glow')).toBe(false);
    expect(isFilledFamily('wire-flat-occ')).toBe(false);
  });

  it('leaves the orientation to the caller unless a posture is asked for', () => {
    // Earth is tilted 23.44 degrees, so a body whose orientation this function DID stamp is easy to
    // tell from one it left alone — and the holo leaves it alone, because it composes that tilt with
    // sidereal spin every frame. Enceladus, whose tilt is zero, cannot tell the two apart at all.
    const earth = node('Earth');
    const owned = buildBodyLook(earth, 1, HOLO);                       // tilt 'none'
    expect(owned.mesh.quaternion.equals(new THREE.Quaternion())).toBe(true);
    const stamped = buildBodyLook(earth, 1, { ...HOLO, tilt: 'axial' as const });
    const expected = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (23.44 * Math.PI) / 180);
    expect(stamped.mesh.quaternion.angleTo(expected)).toBeLessThan(1e-9);
    owned.dispose(); stamped.dispose();
  });

  it('tips a pole-venting body toward the camera ONLY in the showcase posture', () => {
    // A cryovolcanic body vents from a pole, which is invisible on an upright globe — the gallery
    // tips it so the jets spray at the viewer. Enceladus is the fixture's cryovolcanic moon and its
    // axial tilt is zero, so any rotation at all here is the posture and nothing else.
    const enceladus = node('Enceladus');
    const showcase = buildBodyLook(enceladus, 1, GALLERY);
    const axial = buildBodyLook(enceladus, 1, { ...COMPARISON, tilt: 'axial' as const });
    const tipped = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.15);
    expect(showcase.mesh.quaternion.angleTo(tipped)).toBeLessThan(1e-9);
    expect(axial.mesh.quaternion.equals(new THREE.Quaternion())).toBe(true);
    showcase.dispose(); axial.dispose();
  });
});

// A NOTE ON THIS FILE'S COST, because it is the only test in the suite that builds real procedural
// planet textures. Each `buildBodyLook` on a textured body paints two full equirect canvases pixel
// by pixel, and vitest runs spec files in parallel workers, so the CPU that costs is taken from
// whatever else is running. Adding this file at six bodies pushed `broadcastContract.spec.ts` — a
// real-time BroadcastChannel handshake that takes about 4 seconds against vitest's 5-second default
// — over its timeout, on a suite that was otherwise green. Keep the body list short. The neighbour's
// fragility is recorded on the board ([[B118]]); this file's job is the inventory, not a sweep.
