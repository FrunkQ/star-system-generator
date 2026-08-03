// Model file parsing for construct 3D models (G3, docs/dev/ship-appearance-design.md §2).
//
// THE FRONT DOOR ACCEPTS THREE FORMATS AND STORES ONE: GLB, STL and OBJ parse here into a
// three.js object; conversion (modelConvert.ts) then normalises everything to GLB for the store.
// STL and OBJ are never stored — a printing STL is ~13x the bytes of the same geometry as
// compressed GLB and carries no materials, UVs or units (measured in the design doc).
//
// Every loader and decoder comes from the existing three dependency. The one asset addition is
// static/draco/ — the Draco decoder (Apache-2.0, vendored inside three's own distribution) copied
// where DRACOLoader can fetch it, because wild GLBs (Sketchfab, NASA) routinely arrive
// Draco-compressed and rejecting them would gut the primary use case.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export type ModelSourceFormat = 'glb' | 'stl' | 'obj';

export interface ParsedModel {
  object: THREE.Object3D;        // the scene as loaded, un-normalised
  sourceFormat: ModelSourceFormat;
  triangles: number;
  /** False when the source format cannot carry materials (STL) or arrived without them (bare OBJ):
   *  the icon_color tint applies by default downstream. GLB is authored with materials by definition. */
  hadMaterials: boolean;
}

/** Format from the file name, confirmed/overridden by magic bytes where the format has any.
 *  Returns null for anything we do not accept — the caller shows the honest "GLB, STL or OBJ" line. */
export function detectModelFormat(fileName: string, bytes: ArrayBuffer): ModelSourceFormat | null {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  // GLB magic: ASCII 'glTF' little-endian at offset 0. Trust it over the extension — a mislabelled
  // .stl that is really a GLB should parse as what it IS.
  if (bytes.byteLength >= 4 && new DataView(bytes).getUint32(0, true) === 0x46546c67) return 'glb';
  if (ext === 'glb' || ext === 'gltf') return ext === 'glb' ? 'glb' : null; // .gltf is multi-file; single-file uploads only
  if (ext === 'stl') return 'stl';
  if (ext === 'obj') return 'obj';
  // Extensionless fallbacks: binary STL is header + 4-byte count + 50 bytes/triangle exactly;
  // ASCII STL and OBJ declare themselves in the first line.
  if (bytes.byteLength > 84) {
    const count = new DataView(bytes).getUint32(80, true);
    if (84 + count * 50 === bytes.byteLength) return 'stl';
  }
  const head = new TextDecoder().decode(bytes.slice(0, 256)).trimStart().toLowerCase();
  if (head.startsWith('solid')) return 'stl';
  if (/^(#|v |vn |o |mtllib )/m.test(head)) return 'obj';
  return null;
}

export function countTriangles(object: THREE.Object3D): number {
  let tris = 0;
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const geo = mesh.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute('position');
    if (!pos) return;
    tris += Math.floor((geo.index ? geo.index.count : pos.count) / 3);
  });
  return tris;
}

let gltfLoader: GLTFLoader | null = null;
function getGltfLoader(): GLTFLoader {
  if (gltfLoader) return gltfLoader;
  gltfLoader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('/draco/');
  gltfLoader.setDRACOLoader(draco);
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  return gltfLoader;
}

/** Parse an uploaded model file. Throws with a user-showable message on anything unusable. */
export async function parseModel(fileName: string, bytes: ArrayBuffer): Promise<ParsedModel> {
  const format = detectModelFormat(fileName, bytes);
  if (!format) throw new Error('Not a model file we can read - GLB, STL or OBJ only. (.gltf is multi-file; export as .glb.)');

  if (format === 'glb') {
    const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) =>
      getGltfLoader().parse(bytes, '', resolve, (e) => reject(e instanceof Error ? e : new Error('Could not parse that GLB.')))
    );
    return { object: gltf.scene, sourceFormat: 'glb', triangles: countTriangles(gltf.scene), hadMaterials: true };
  }

  if (format === 'stl') {
    const geometry = new STLLoader().parse(bytes);
    // A printing mesh is a triangle soup with per-facet normals; smooth-vs-flat is decided by the
    // FINISH downstream, so hand over exactly what arrived. Placeholder material — tint replaces it.
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    const group = new THREE.Group();
    group.add(mesh);
    return { object: group, sourceFormat: 'stl', triangles: countTriangles(group), hadMaterials: false };
  }

  // OBJ: single-file uploads have no .mtl by definition, so treat materials as absent even though
  // OBJLoader fills in defaults - the authored look did not survive the trip, and pretending the
  // default grey is a choice would block the tint that makes the model readable.
  const text = new TextDecoder().decode(bytes);
  const object = new OBJLoader().parse(text);
  return { object, sourceFormat: 'obj', triangles: countTriangles(object), hadMaterials: false };
}
