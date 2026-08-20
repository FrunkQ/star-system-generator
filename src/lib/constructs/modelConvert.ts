// Conversion, simplification and caps for construct model uploads (G3, design §2-§4).
//
// EVERYTHING STORES AS GLB, BUT A COMPLIANT GLB STORES BYTE-IDENTICAL: re-encoding an already
// compressed upload through GLTFExporter would STRIP its Draco/meshopt compression and usually
// grow it several-fold, so pass-through is the fidelity-preserving fast path and re-encode only
// happens when something must actually change (format, triangle count, texture weight).
// Orientation is never a reason to re-encode - it rides on ModelRef.orient and applies at view time.
//
// CAPS (owner decision 3 REVISED 2026-08-19): TIERED, all POST-conversion. Under 5 MB is silent;
// 5-15 MB warns (network delay + a parse stutter); 15-25 MB is a SEVERE warning the GM must
// explicitly confirm (local/high-end only - can crash low-end and mobile browsers); over 25 MB
// is rejected outright. The old 2 MB cap guarded "the player broadcast", but models are LOCAL
// most of the time and travel at most once when they travel at all (a remote player does not
// receive binaries today - G14), so the binding constraint is browser memory, not the wire.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer';
import type { ParsedModel } from './modelImport';

export const MODEL_WARN_BYTES = 5_000_000;   // under this: silent
export const MODEL_SEVERE_BYTES = 15_000_000; // over this: explicit confirmation required
export const MODEL_HARD_BYTES = 25_000_000;  // over this: rejected
/** Simplify down to this when a mesh is over SIMPLIFY_WHEN_TRIANGLES - the printing-STL case. */
export const TARGET_TRIANGLES = 20_000;
export const SIMPLIFY_WHEN_TRIANGLES = 30_000;

export interface ConvertResult {
  glb: ArrayBuffer;
  triangles: number;          // stored count (post-simplify)
  originalTriangles: number;  // what arrived, so the GM is told what happened
  simplified: boolean;
  passthrough: boolean;       // original GLB bytes stored untouched
  overWarn: boolean;          // over the 5 MB advisory line
  overSevere: boolean;        // over the 15 MB line - the modal requires explicit confirmation
}

/** Convert a parsed upload into the bytes the store keeps. Throws (user-showable) over the hard cap. */
export async function convertParsedModel(parsed: ParsedModel, originalBytes: ArrayBuffer): Promise<ConvertResult> {
  const originalTriangles = parsed.triangles;

  // Fast path: an uploaded GLB that already fits every budget is stored exactly as it arrived.
  if (parsed.sourceFormat === 'glb'
    && originalBytes.byteLength <= MODEL_HARD_BYTES
    && parsed.triangles <= SIMPLIFY_WHEN_TRIANGLES) {
    return {
      glb: originalBytes, triangles: parsed.triangles, originalTriangles,
      simplified: false, passthrough: true, overWarn: originalBytes.byteLength > MODEL_WARN_BYTES,
      overSevere: originalBytes.byteLength > MODEL_SEVERE_BYTES
    };
  }

  // Re-encode path. Work on a clone so the caller's preview object is untouched.
  const object = parsed.object.clone(true);
  let simplified = false;
  if (parsed.triangles > SIMPLIFY_WHEN_TRIANGLES) {
    await simplifyInPlace(object, TARGET_TRIANGLES, !parsed.hadMaterials);
    simplified = true;
  }

  // Texture budget: GLTFExporter resamples anything larger on export. 1024 first; if the result
  // still busts the hard cap, textures are the likely weight - try 512 before giving up.
  let glb = await exportGlb(object, 1024);
  if (glb.byteLength > MODEL_HARD_BYTES) glb = await exportGlb(object, 512);
  if (glb.byteLength > MODEL_HARD_BYTES) {
    throw new Error(
      `Model exceeds the ${Math.round(MODEL_HARD_BYTES / 1048576)} MB maximum limit (still ${(glb.byteLength / 1048576).toFixed(1)} MB after simplifying) - the cap prevents browser memory exhaustion. ` +
      `Optimise textures and geometry and try again.`
    );
  }

  const triangles = countObjectTriangles(object);
  return { glb, triangles, originalTriangles, simplified, passthrough: false, overWarn: glb.byteLength > MODEL_WARN_BYTES, overSevere: glb.byteLength > MODEL_SEVERE_BYTES };
}

/** Meshopt simplification, per mesh, distributing the budget by share of the total count.
 *  The simplifier only rewrites the INDEX buffer, so UVs and materials survive untouched;
 *  unreferenced vertices are then compacted away so the exporter does not write dead data. */
async function simplifyInPlace(object: THREE.Object3D, targetTotal: number, stripForWeld: boolean): Promise<void> {
  await MeshoptSimplifier.ready;
  const meshes: THREE.Mesh[] = [];
  object.traverse((c) => { if ((c as THREE.Mesh).isMesh) meshes.push(c as THREE.Mesh); });
  const total = meshes.reduce((n, m) => n + triCount(m.geometry as THREE.BufferGeometry), 0);
  if (!total) return;

  for (const mesh of meshes) {
    let geo = (mesh.geometry as THREE.BufferGeometry).clone();
    // A triangle soup (every STL) only gains connectivity by welding - and welding only works
    // once the per-facet normals that make every vertex unique are gone. Recomputed after.
    if (stripForWeld) { geo.deleteAttribute('normal'); geo.deleteAttribute('uv'); }
    if (!geo.index) geo = mergeVertices(geo);
    const idx = geo.index;
    const pos = geo.getAttribute('position');
    if (!idx || !pos || (pos as THREE.BufferAttribute).array.constructor !== Float32Array) continue;

    const share = triCount(geo) / total;
    const targetIdx = Math.max(3, 3 * Math.floor(targetTotal * share));
    if (idx.count <= targetIdx) continue;

    const [newIdx] = MeshoptSimplifier.simplify(
      new Uint32Array(idx.array as ArrayLike<number>),
      pos.array as Float32Array, 3,
      targetIdx, 1e-2, []
    );
    geo.setIndex(new THREE.BufferAttribute(newIdx, 1));
    compactInPlace(geo);
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    mesh.geometry = geo;
  }
}

/** Drop vertices no triangle references any more, remapping every attribute + the index. */
function compactInPlace(geo: THREE.BufferGeometry): void {
  const idx = geo.index;
  if (!idx) return;
  const old = idx.array as ArrayLike<number>;
  const map = new Map<number, number>();
  const newIdx = new Uint32Array(idx.count);
  for (let i = 0; i < idx.count; i++) {
    const v = old[i];
    let next = map.get(v);
    if (next === undefined) { next = map.size; map.set(v, next); }
    newIdx[i] = next;
  }
  for (const name of Object.keys(geo.attributes)) {
    const attr = geo.getAttribute(name) as THREE.BufferAttribute;
    const size = attr.itemSize;
    const src = attr.array as ArrayLike<number>;
    const dst = new Float32Array(map.size * size);
    for (const [from, to] of map) for (let c = 0; c < size; c++) dst[to * size + c] = src[from * size + c];
    geo.setAttribute(name, new THREE.BufferAttribute(dst, size, attr.normalized));
  }
  geo.setIndex(new THREE.BufferAttribute(newIdx, 1));
}

function triCount(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute('position');
  return pos ? Math.floor((geo.index ? geo.index.count : pos.count) / 3) : 0;
}

function countObjectTriangles(object: THREE.Object3D): number {
  let n = 0;
  object.traverse((c) => { if ((c as THREE.Mesh).isMesh) n += triCount((c as THREE.Mesh).geometry as THREE.BufferGeometry); });
  return n;
}

function exportGlb(object: THREE.Object3D, maxTextureSize: number): Promise<ArrayBuffer> {
  return new GLTFExporter().parseAsync(object, { binary: true, maxTextureSize }) as Promise<ArrayBuffer>;
}
