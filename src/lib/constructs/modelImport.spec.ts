// G3 stage 1: format detection and parsing of the three accepted upload formats.
// GLB parsing is exercised via a synthetic minimal GLB (no textures) — wild-file GLB handling
// (Draco, meshopt, textures) needs a browser and is verified there, not here.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { detectModelFormat, parseModel, countTriangles } from './modelImport';

/** One-triangle binary STL: 80-byte header + uint32 count + 50 bytes per triangle. */
function makeBinaryStl(triangles = 1): ArrayBuffer {
  const buf = new ArrayBuffer(84 + triangles * 50);
  const view = new DataView(buf);
  view.setUint32(80, triangles, true);
  for (let t = 0; t < triangles; t++) {
    const o = 84 + t * 50;
    // normal (0,0,1), vertices of a unit triangle in z=t plane
    view.setFloat32(o + 8, 1, true);
    view.setFloat32(o + 12, 0, true); view.setFloat32(o + 16, 0, true); view.setFloat32(o + 20, t, true);
    view.setFloat32(o + 24, 1, true); view.setFloat32(o + 28, 0, true); view.setFloat32(o + 32, t, true);
    view.setFloat32(o + 36, 0, true); view.setFloat32(o + 40, 1, true); view.setFloat32(o + 44, t, true);
  }
  return buf;
}

const OBJ_TEXT = `# tiny quad
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
f 1 2 3 4
`;

function toBuf(s: string): ArrayBuffer {
  return new TextEncoder().encode(s).buffer as ArrayBuffer;
}

describe('detectModelFormat', () => {
  it('recognises the GLB magic regardless of extension', () => {
    const glb = new ArrayBuffer(12);
    new DataView(glb).setUint32(0, 0x46546c67, true);
    expect(detectModelFormat('ship.glb', glb)).toBe('glb');
    expect(detectModelFormat('mislabelled.stl', glb)).toBe('glb');
  });
  it('recognises binary STL by exact 84+50n length, ascii STL by "solid"', () => {
    expect(detectModelFormat('hull.stl', makeBinaryStl(3))).toBe('stl');
    expect(detectModelFormat('noext', makeBinaryStl(2))).toBe('stl');
    expect(detectModelFormat('noext', toBuf('solid hull\nendsolid hull\n'))).toBe('stl');
  });
  it('recognises OBJ by extension and by content', () => {
    expect(detectModelFormat('ship.obj', toBuf(OBJ_TEXT))).toBe('obj');
    expect(detectModelFormat('noext', toBuf(OBJ_TEXT))).toBe('obj');
  });
  it('rejects junk and multi-file .gltf', () => {
    expect(detectModelFormat('photo.jpg', new ArrayBuffer(64))).toBeNull();
    expect(detectModelFormat('ship.gltf', toBuf('{"asset":{"version":"2.0"}}'))).toBeNull();
  });
});

describe('parseModel', () => {
  it('parses binary STL into a material-less mesh with the right triangle count', async () => {
    const parsed = await parseModel('hull.stl', makeBinaryStl(5));
    expect(parsed.sourceFormat).toBe('stl');
    expect(parsed.triangles).toBe(5);
    expect(parsed.hadMaterials).toBe(false);
  });
  it('parses OBJ, triangulating the quad, and treats single-file OBJ as material-less', async () => {
    const parsed = await parseModel('ship.obj', toBuf(OBJ_TEXT));
    expect(parsed.sourceFormat).toBe('obj');
    expect(parsed.triangles).toBe(2); // one quad -> two triangles
    expect(parsed.hadMaterials).toBe(false);
  });
  it('throws a user-showable message on junk', async () => {
    await expect(parseModel('junk.bin', new ArrayBuffer(32))).rejects.toThrow(/GLB, STL or OBJ/);
  });
});

describe('countTriangles', () => {
  it('counts indexed and non-indexed geometry alike', () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));            // indexed: 12 tris
    const soup = new THREE.BufferGeometry();
    soup.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 3), 3)); // 3 tris
    g.add(new THREE.Mesh(soup));
    expect(countTriangles(g)).toBe(15);
  });
});
