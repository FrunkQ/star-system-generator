// G3: buildDisplayModel is the ONE builder behind the modal preview, the info-block turntable and
// the holo scene's focused ship - this pins its contract: unit long axis, centred, tint finish
// with crease edges for material-less sources, and the orient bake honouring nose+Z/drive-Z.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildDisplayModel } from './modelViewer';

function stlLikeMesh(): THREE.Group {
  // An elongated box along X, off-centre - like a real hull parsed from an STL (no materials flag
  // is the caller's business; geometry is what matters here).
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 1), new THREE.MeshStandardMaterial());
  mesh.position.set(10, 5, -3);
  g.add(mesh);
  return g;
}

describe('buildDisplayModel', () => {
  it('normalises to a unit long axis, centred at the origin', () => {
    const built = buildDisplayModel(stlLikeMesh(), { hadMaterials: false, tintHex: '#ff0000' });
    built.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(built);
    const size = box.getSize(new THREE.Vector3());
    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(1, 3);
    const centre = box.getCenter(new THREE.Vector3());
    expect(centre.length()).toBeLessThan(1e-3);
  });

  it('applies the tint finish to a material-less source: flat shading + crease-edge lines', () => {
    const built = buildDisplayModel(stlLikeMesh(), { hadMaterials: false, tintHex: '#ff0000' });
    let flat = 0, edges = 0;
    built.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh && (m.material as THREE.MeshStandardMaterial).flatShading) flat++;
      if ((c as THREE.LineSegments).isLineSegments) edges++;
    });
    expect(flat).toBe(1);
    expect(edges).toBe(1);
    // A GLB keeps its authored materials untouched: no edges added, shading left alone.
    const authored = buildDisplayModel(stlLikeMesh(), { hadMaterials: true });
    let edges2 = 0;
    authored.traverse((c) => { if ((c as THREE.LineSegments).isLineSegments) edges2++; });
    expect(edges2).toBe(0);
  });

  it('bakes orient so the long axis lands where the GM put it (nose +Z convention)', () => {
    // The hull is long in X; a -90-degree yaw about Y maps +X onto +Z (nose forward).
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
    const built = buildDisplayModel(stlLikeMesh(), {
      hadMaterials: false, orient: [q.x, q.y, q.z, q.w]
    });
    built.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(built).getSize(new THREE.Vector3());
    expect(size.z).toBeCloseTo(1, 3);     // the long axis now runs along Z (the nose direction)
    expect(size.x).toBeCloseTo(1 / 8, 3); // the old depth swings onto X
    expect(size.y).toBeCloseTo(2 / 8, 3); // height untouched by a yaw
  });
});
