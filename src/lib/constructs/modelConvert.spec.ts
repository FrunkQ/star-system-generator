// G3 stage 2: the convert path. A synthetic high-poly "printing STL" (a dense sphere soup) goes
// through simplify + export and must come back a parseable GLB under the caps; a compliant GLB
// must pass through byte-identical (that is what preserves upstream Draco compression).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { parseModel, countTriangles } from './modelImport';
import { convertParsedModel, TARGET_TRIANGLES, SIMPLIFY_WHEN_TRIANGLES, MODEL_HARD_BYTES } from './modelConvert';

/** Binary STL of a dense UV sphere - the shape of a real printing upload (soup, per-facet normals). */
function sphereStl(widthSegments: number, heightSegments: number): ArrayBuffer {
  const geo = new THREE.SphereGeometry(1, widthSegments, heightSegments).toNonIndexed();
  const pos = geo.getAttribute('position').array as Float32Array;
  const tris = pos.length / 9;
  const buf = new ArrayBuffer(84 + tris * 50);
  const view = new DataView(buf);
  view.setUint32(80, tris, true);
  for (let t = 0; t < tris; t++) {
    const o = 84 + t * 50;
    for (let v = 0; v < 9; v++) view.setFloat32(o + 12 + v * 4, pos[t * 9 + v], true);
  }
  return buf;
}

describe('convertParsedModel', () => {
  it('simplifies a high-poly STL under the target and exports a parseable GLB', async () => {
    const stl = sphereStl(200, 100); // ~40k triangles - over SIMPLIFY_WHEN_TRIANGLES
    const parsed = await parseModel('dense.stl', stl);
    expect(parsed.triangles).toBeGreaterThan(SIMPLIFY_WHEN_TRIANGLES);

    const res = await convertParsedModel(parsed, stl);
    expect(res.simplified).toBe(true);
    expect(res.passthrough).toBe(false);
    expect(res.triangles).toBeLessThanOrEqual(TARGET_TRIANGLES * 1.1); // simplifier may overshoot slightly
    expect(res.triangles).toBeGreaterThan(100);                        // did not collapse to nothing
    expect(res.glb.byteLength).toBeLessThanOrEqual(MODEL_HARD_BYTES);
    expect(res.originalTriangles).toBe(parsed.triangles);

    // Round-trip: the stored bytes must parse as a GLB with the same triangle count.
    const back = await parseModel('stored.glb', res.glb);
    expect(back.sourceFormat).toBe('glb');
    expect(back.triangles).toBe(res.triangles);
    // Simplification must not have destroyed the shape: unit sphere in, roughly unit bounds out.
    const box = new THREE.Box3().setFromObject(back.object);
    expect(box.max.length()).toBeGreaterThan(1.2); // corner of a unit-sphere box is ~sqrt(3)
    expect(box.max.length()).toBeLessThan(2.0);
  }, 60_000);

  it('passes a small compliant GLB through byte-identical', async () => {
    const small = sphereStl(24, 12); // few hundred triangles
    const parsed = await parseModel('small.stl', small);
    const asGlb = await convertParsedModel(parsed, small);
    // Now feed the converted GLB back in as if the GM had uploaded it directly.
    const reparsed = await parseModel('upload.glb', asGlb.glb);
    const res = await convertParsedModel(reparsed, asGlb.glb);
    expect(res.passthrough).toBe(true);
    expect(res.simplified).toBe(false);
    expect(res.glb).toBe(asGlb.glb); // the same buffer, not a re-encode
  }, 60_000);
});
