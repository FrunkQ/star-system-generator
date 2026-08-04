// G13: the export/import round trip - a model put into the store on machine A, collected into a
// starmap .json, imported on machine B, must come back byte-identical with its attribution. The
// IDB store is mocked with an in-memory map (jsdom has no IndexedDB); hashing is the real
// crypto.subtle, so the import-side verification (drop anything whose hash does not match its
// key) is exercised for real.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mem = new Map<string, { bytes: ArrayBuffer; meta: any; savedAtMs: number }>();
vi.mock('./modelStore', async () => {
  const real = await vi.importActual<typeof import('./modelStore')>('./modelStore');
  return {
    hashModelBytes: real.hashModelBytes, // the real SHA-256 - verification must be genuine
    putModel: async (bytes: ArrayBuffer, meta: any) => {
      const hash = await real.hashModelBytes(bytes);
      mem.set(hash, { bytes, meta: { ...meta, hash }, savedAtMs: 1 });
      return hash;
    },
    getModel: async (hash: string) => mem.get(hash) ?? null,
  };
});

import { collectModelsForExport, importEmbeddedModels } from './modelTransfer';
import { putModel, getModel, hashModelBytes } from './modelStore';

function blob(n: number, fill: number): ArrayBuffer {
  const b = new Uint8Array(n);
  b.fill(fill);
  return b.buffer;
}

describe('G13 export/import round trip', () => {
  beforeEach(() => mem.clear());

  it('carries a stored binary through collect -> embed -> import, attribution intact', async () => {
    const bytes = blob(50_000, 7);
    const hash = await putModel(bytes, { name: 'Hull', credit: 'A Modeller', license: 'CC-BY' });
    const starmap = { systems: [{ system: { nodes: [{ id: 'ship', model: { hash } }] } }] };

    const embedded = await collectModelsForExport(starmap);
    expect(embedded).toBeTruthy();
    expect(Object.keys(embedded!)).toEqual([hash]);
    expect(embedded![hash].meta.credit).toBe('A Modeller');

    mem.clear(); // "machine B" has nothing
    const n = await importEmbeddedModels(embedded);
    expect(n).toBe(1);
    const back = await getModel(hash);
    expect(back).toBeTruthy();
    expect(back!.bytes.byteLength).toBe(50_000);
    expect(await hashModelBytes(back!.bytes)).toBe(hash);
    expect(back!.meta.license).toBe('CC-BY');
  });

  it('skips refs whose binary this machine never had, and drops tampered blobs on import', async () => {
    const bytes = blob(1000, 3);
    const hash = await putModel(bytes, { name: 'Hull' });
    const starmap = { systems: [{ system: { nodes: [
      { id: 'a', model: { hash } },
      { id: 'b', model: { hash: 'deadbeef'.repeat(8) } } // never stored here
    ] } }] };
    const embedded = await collectModelsForExport(starmap);
    expect(Object.keys(embedded!)).toEqual([hash]); // the missing one exports ref-only

    // Tamper: swap the payload under the same key - the import must refuse to mis-file it.
    embedded![hash].b64 = embedded![hash].b64.slice(0, -4) + 'AAAA';
    mem.clear();
    expect(await importEmbeddedModels(embedded)).toBe(0);
    expect(await getModel(hash)).toBeNull();
  });
});
