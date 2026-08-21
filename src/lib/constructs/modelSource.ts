// Where a ship's hull BYTES come from. Two kinds of model, one lookup:
//
//   BUNDLED  { url: '/models/nasa/iss.glb' }  - ships with the app, so every browser already has
//            it. Nothing is stored, nothing is embedded in a save, nothing crosses the broadcast:
//            a preset or a bundled campaign can just point at it and every viewer resolves it
//            locally. This is why a starter hull costs nothing to share.
//   UPLOADED { hash: '<sha256>' }             - the GM's own file, in the hash-addressed store,
//            embedded into saves and fetched by hash over the broadcast.
//
// Callers should never branch on which they have; ask here.
import type { ModelRef } from '$lib/types';
import { getModel } from './modelStore';

/** Bundled models are fetched once per page - they are static files, so the browser cache does
 *  the real work, but this also collapses the concurrent requests of a fleet sharing one hull. */
const bundledCache = new Map<string, Promise<ArrayBuffer | null>>();

async function fetchBundled(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null; // offline or missing: the caller falls back to the glyph, as with any miss
  }
}

/** A stable key for caching a built hull: the url or the hash, whichever identifies it. */
export function modelKey(ref: Pick<ModelRef, 'url' | 'hash'> | null | undefined): string {
  return ref?.url ?? ref?.hash ?? '';
}

/** The GLB bytes for a ref, or null when this machine cannot get them (an uploaded model whose
 *  binary has not arrived yet - the caller then shows the glyph and may ask the transport). */
export async function loadModelBytes(ref: Pick<ModelRef, 'url' | 'hash'>): Promise<ArrayBuffer | null> {
  if (ref.url) {
    let p = bundledCache.get(ref.url);
    if (!p) { p = fetchBundled(ref.url); bundledCache.set(ref.url, p); }
    return p;
  }
  if (!ref.hash) return null;
  const stored = await getModel(ref.hash).catch(() => null);
  return stored?.bytes ?? null;
}

/** True when a miss is worth asking the broadcast for. A bundled model that failed to fetch is
 *  not - every viewer has the same files, so asking a peer would fail the same way. */
export function isFetchableFromPeer(ref: Pick<ModelRef, 'url' | 'hash'>): boolean {
  return !ref.url && !!ref.hash;
}
