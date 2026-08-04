// Bundled vs uploaded models. A bundled hull ships WITH THE APP, so every browser already has it:
// referencing one costs no storage, nothing in a save file, and nothing over the broadcast. An
// uploaded hull is the GM's own file and needs all three. Callers must not have to know which.
import { describe, it, expect, vi } from 'vitest';
import { modelKey, isFetchableFromPeer } from './modelSource';
import { referencedModelHashes } from './modelTransfer';

describe('model source', () => {
  it('keys a model by whichever identifier it has', () => {
    expect(modelKey({ url: '/models/nasa/iss.glb' })).toBe('/models/nasa/iss.glb');
    expect(modelKey({ hash: 'abc' })).toBe('abc');
    expect(modelKey(null)).toBe('');
  });

  it('never asks a peer for a bundled model - their fetch would fail the same way', () => {
    expect(isFetchableFromPeer({ url: '/models/nasa/iss.glb' })).toBe(false);
    expect(isFetchableFromPeer({ url: '/models/nasa/iss.glb', hash: 'abc' })).toBe(false);
    expect(isFetchableFromPeer({ hash: 'abc' })).toBe(true);   // the GM's own upload
    expect(isFetchableFromPeer({})).toBe(false);
  });

  it('keeps bundled models OUT of a save file - an app asset does not belong in one', () => {
    const starmap = { systems: [{ system: { nodes: [
      { id: 'iss', model: { url: '/models/nasa/iss.glb' } },
      { id: 'roci', model: { hash: 'uploaded-hash' } }
    ] } }] };
    expect(referencedModelHashes(starmap)).toEqual(['uploaded-hash']);
  });

  it('fetches a bundled file once, however many ships share the hull', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
    vi.stubGlobal('fetch', fetchMock);
    const { loadModelBytes } = await import('./modelSource');
    const url = '/models/nasa/hubble.glb';
    const [a, b, c] = await Promise.all([
      loadModelBytes({ url }), loadModelBytes({ url }), loadModelBytes({ url })
    ]);
    expect(a).toBeTruthy();
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1); // a fleet on one hull costs one request
    vi.unstubAllGlobals();
  });
});
