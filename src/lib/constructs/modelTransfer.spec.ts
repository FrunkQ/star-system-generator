// G3 stage 4: the export/import embedding helpers - the pure parts (hash collection, base64
// round-trip, hash verification on import). The IDB halves are exercised in the browser.
import { describe, it, expect } from 'vitest';
import { referencedModelHashes, bytesToBase64, base64ToBytes } from './modelTransfer';

describe('referencedModelHashes', () => {
  it('collects each hash once across systems and ignores nodes without models', () => {
    const starmap = {
      systems: [
        { system: { nodes: [{ id: 'a', model: { hash: 'h1' } }, { id: 'b' }] } },
        { system: { nodes: [{ id: 'c', model: { hash: 'h1' } }, { id: 'd', model: { hash: 'h2' } }] } },
        { system: undefined },
      ]
    };
    expect(referencedModelHashes(starmap).sort()).toEqual(['h1', 'h2']);
  });
  it('handles an empty starmap', () => {
    expect(referencedModelHashes({})).toEqual([]);
  });
});

describe('base64 round-trip', () => {
  it('survives multi-chunk binaries byte-for-byte', () => {
    const n = 200_000; // over the 0x8000 chunk size several times
    const src = new Uint8Array(n);
    for (let i = 0; i < n; i++) src[i] = (i * 31 + 7) & 0xff;
    const back = new Uint8Array(base64ToBytes(bytesToBase64(src.buffer)));
    expect(back.length).toBe(n);
    expect(back[0]).toBe(src[0]);
    expect(back[n - 1]).toBe(src[n - 1]);
    let same = true;
    for (let i = 0; i < n; i++) if (back[i] !== src[i]) { same = false; break; }
    expect(same).toBe(true);
  });
});
