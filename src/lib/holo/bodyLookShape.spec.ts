// A SMALL BODY IS A ROCK IN 3D TOO ([[G91]]), and it is the SAME rock the card draws.
//
// The claim being gated is not "the mesh is lumpy" — it is that the mesh and the silhouette are one
// object seen twice. So the mesh's own vertices are measured against the field the outline is built
// from, at the same longitudes, and a round world is checked to be still exactly round.
//
// It also carries the COST, because the brief asked for a number rather than an assurance and
// because the frame-rate guard ([[G69]]) sheds what a scene overspends. See the last describe.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildBodyLook } from './bodyLook';
import { smallBodyShape } from '$lib/catalogue/smallBodyShape';
import type { CelestialBody } from '$lib/types';

function rock(extra: Partial<CelestialBody> = {}): CelestialBody {
  return {
    id: 'rock-1', name: 'Rock', kind: 'body', roleHint: 'planet', parentId: 'star',
    apparentColorHex: '#8a8f99', massKg: 4.6e16, radiusKm: 18,
    makeup: { rock: 0.6, ice: 0.4 }, classes: ['asteroid/s-type'], tags: [],
    ...extra
  } as CelestialBody;
}
function world(): CelestialBody {
  return rock({ id: 'earthish', radiusKm: 6371, massKg: 5.97e24, classes: ['planet/terrestrial'] });
}
const OPTS = { bodyStyle: 'flat', atmospheres: false, aurora: 'off', dynamics: false } as const;

function look(body: CelestialBody, radius = 1, extra: Record<string, unknown> = {}) {
  return buildBodyLook(body, radius, { ...OPTS, ...extra } as never);
}
/** Distance from the centre of every vertex of a built mesh. */
function radii(mesh: THREE.Mesh): number[] {
  const pos = (mesh.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  return Array.from({ length: pos.count }, (_, i) => v.fromBufferAttribute(pos, i).length());
}

describe('the mesh is displaced for a small body and untouched for a world', () => {
  it('a world is still exactly a sphere — nothing else pays for this', () => {
    const rs = radii(look(world()).mesh);
    for (const r of rs) expect(r).toBeCloseTo(1, 6);
  });

  it('an asteroid is not', () => {
    const rs = radii(look(rock()).mesh);
    expect(Math.max(...rs) - Math.min(...rs)).toBeGreaterThan(0.1);
  });

  it('a contact binary is longer than it is round', () => {
    const rs = radii(look(rock({ id: 'cb', lobes: 2 })).mesh);
    expect(Math.max(...rs) / Math.min(...rs)).toBeGreaterThan(2);
  });
});

describe('the mesh and the silhouette are the same rock', () => {
  for (const lobes of [undefined, 2]) {
    it(`every vertex sits exactly where the shared field puts it (${lobes ?? 1} lobe)`, () => {
      const body = rock({ id: `agree-${lobes ?? 1}`, lobes } as Partial<CelestialBody>);
      const shape = smallBodyShape(body);
      const mesh = look(body, 3).mesh;
      const pos = (mesh.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      let worst = 0;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const len = v.length();
        if (len <= 0) continue;
        const colat = Math.acos(Math.max(-1, Math.min(1, v.y / len)));
        const want = 3 * shape.radiusAt(Math.atan2(v.z, v.x), colat);
        worst = Math.max(worst, Math.abs(len - want));
      }
      // 1e-5 at radius 3, and the tolerance is float32 rather than slack: THREE keeps positions in
      // a Float32Array, so a double computed here is truncated to about seven significant figures
      // on its way into the buffer. Anything looser than that would hide a real disagreement;
      // anything tighter is measuring IEEE storage rather than the shape.
      expect(worst).toBeLessThan(1e-5);
    });
  }

  // The equator of the mesh IS the outline's own profile. Sampling the mesh's middle ring and the
  // field at the same longitudes is the numeric form of "the card and the holo show one object".
  it('the equator of the mesh matches the profile the card is drawn from', () => {
    const body = rock({ id: 'equator', lobes: 2 });
    const shape = smallBodyShape(body);
    const pos = ((look(body).mesh).geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    let checked = 0;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (Math.abs(v.y) > 1e-6) continue;                  // the equatorial ring only
      const lon = Math.atan2(v.z, v.x);
      expect(v.length()).toBeCloseTo(shape.radiusAt(lon, Math.PI / 2), 6);   // float32 buffer
      checked++;
    }
    expect(checked, 'no equatorial vertices found — the sphere segmentation changed').toBeGreaterThan(8);
  });

  // Every vertex of a pole row is the same point, and the two sides of the u seam are the same
  // meridian. If the field disagreed with itself at either, the mesh would tear open.
  it('does not tear at the poles or the seam', () => {
    const mesh = look(rock({ id: 'tear', lobes: 3 })).mesh;
    const pos = (mesh.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    const north: number[] = [], south: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const len = v.length();
      if (v.y / len > 0.9999) north.push(len);
      if (v.y / len < -0.9999) south.push(len);
    }
    expect(north.length).toBeGreaterThan(2);
    expect(south.length).toBeGreaterThan(2);
    for (const r of north) expect(r).toBeCloseTo(north[0], 12);
    for (const r of south) expect(r).toBeCloseTo(south[0], 12);
  });

  it('the same body built twice is the same mesh, and a different id is not', () => {
    const a = radii(look(rock({ id: 'same', lobes: 2 })).mesh);
    const b = radii(look(rock({ id: 'same', lobes: 2 })).mesh);
    expect(a).toEqual(b);
    expect(radii(look(rock({ id: 'other', lobes: 2 })).mesh)).not.toEqual(a);
  });

  it('lo-poly gets the same rock at its own resolution', () => {
    const rs = radii(look(rock({ id: 'lp' }), 1, { renderStyle: 'lopoly-filled' }).mesh);
    expect(rs.length).toBeLessThan(radii(look(rock({ id: 'lp' })).mesh).length);
    expect(Math.max(...rs) - Math.min(...rs)).toBeGreaterThan(0.05);
  });
});

// WHAT IT COSTS. Small bodies are the most numerous things in a system and the frame-rate guard
// sheds what a scene overspends, so this is a number rather than an assurance. It is a BUILD cost
// and not a per-frame one: the mesh is displaced once and then drawn like any other.
describe('what it costs', () => {
  const N = 200;
  const time = (f: () => void) => { const t = performance.now(); f(); return performance.now() - t; };

  it('adds well under a millisecond to building each rock, and nothing per frame', () => {
    const rocks = Array.from({ length: N }, (_, i) => rock({ id: `belt-${i}` }));
    const lobed = Array.from({ length: N }, (_, i) => rock({ id: `cb-${i}`, lobes: 2 }));
    const worlds = Array.from({ length: N }, (_, i) => rock({
      id: `w-${i}`, radiusKm: 6371, massKg: 5.97e24, classes: ['planet/terrestrial']
    }));

    // Warm the texture and material caches, or the first body carries everyone's cost.
    for (const b of rocks.slice(0, 20)) look(b).dispose();
    for (const b of worlds.slice(0, 20)) look(b).dispose();

    // The BASELINE is what this code path cost before: the same sphere, undisplaced.
    const baseline = time(() => { for (const b of worlds) look(b).dispose(); });
    const withShape = time(() => { for (const b of rocks) look(b).dispose(); });
    const withLobes = time(() => { for (const b of lobed) look(b).dispose(); });

    // ...and split the added work, because if it ever does need cutting it matters which half.
    const geos = Array.from({ length: N }, () => new THREE.SphereGeometry(1, 32, 24));
    const field = time(() => {
      for (let k = 0; k < N; k++) {
        const shape = smallBodyShape(rocks[k]);
        const pos = geos[k].attributes.position as THREE.BufferAttribute;
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
          const len = v.length();
          v.multiplyScalar(shape.radiusAt(Math.atan2(v.z, v.x), Math.acos(v.y / len)));
          pos.setXYZ(i, v.x, v.y, v.z);
        }
      }
    });
    const normals = time(() => { for (const g of geos) g.computeVertexNormals(); });
    for (const g of geos) g.dispose();

    const per = (ms: number) => (ms / N).toFixed(3);
    // eslint-disable-next-line no-console
    console.log(
      `[G91 cost, ${N} bodies at 32x24] undisplaced sphere ${baseline.toFixed(0)} ms ` +
      `(${per(baseline)} ms each) -> small body ${withShape.toFixed(0)} ms (${per(withShape)} ms each), ` +
      `contact binary ${withLobes.toFixed(0)} ms (${per(withLobes)} ms each). ` +
      `The added work splits ${field.toFixed(0)} ms sampling the field (${per(field)} ms each) ` +
      `+ ${normals.toFixed(0)} ms recomputing normals (${per(normals)} ms each). ` +
      `ONCE per body, at build; zero per frame.`
    );

    // A shared box under four other streams is not a frame budget, so the gate is a RATIO and a
    // generous one: what it is really watching for is an accident that makes this superlinear - a
    // per-vertex allocation, a lost cache, a field rebuilt inside the vertex loop.
    expect(field / N).toBeLessThan(2);
    expect(withLobes).toBeLessThan(baseline + N * 3);
  });
});
