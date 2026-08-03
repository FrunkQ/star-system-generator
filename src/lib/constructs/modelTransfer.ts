// Export/import embedding for construct models (G3, design §4): a saved starmap .json must be
// self-contained, so the binaries the campaign's ModelRefs point at travel inside the file as
// base64, and load puts them back into the local hash store (verified against their own hash -
// a corrupted or tampered blob is dropped, never stored under a name it does not match).
//
// STATUS: READY BUT NOT YET WIRED. The two call sites live in src/routes/+page.svelte
// (handleDownloadStarmap ~:1306 adds `models: await collectModelsForExport(starmap)` to the
// export object; handleFileSelected ~:1334 calls `await importEmbeddedModels(data.models)`
// beside mergeStarmapPacks) - that file was another session's live working copy when this
// shipped, and staging it would have committed their half-done work. See the inbox finding.
import type { ModelRef } from '$lib/types';
import { getModel, putModel, hashModelBytes } from './modelStore';

export interface EmbeddedModels {
  [hash: string]: { b64: string; meta: Omit<ModelRef, 'hash'> };
}

/** Every model hash referenced by any construct in any of the starmap's systems. */
export function referencedModelHashes(starmap: { systems?: { system?: { nodes?: any[] } }[] }): string[] {
  const hashes = new Set<string>();
  for (const entry of starmap.systems ?? []) {
    for (const node of entry.system?.nodes ?? []) {
      const h = node?.model?.hash;
      if (typeof h === 'string' && h) hashes.add(h);
    }
  }
  return [...hashes];
}

/** Read every referenced binary out of the store for embedding. Missing entries are skipped -
 *  a ref whose binary this machine never had exports as ref-only, same as it displays. */
export async function collectModelsForExport(
  starmap: { systems?: { system?: { nodes?: any[] } }[] }
): Promise<EmbeddedModels | undefined> {
  const out: EmbeddedModels = {};
  let any = false;
  for (const hash of referencedModelHashes(starmap)) {
    const stored = await getModel(hash).catch(() => null);
    if (!stored) continue;
    const { hash: _h, ...meta } = stored.meta;
    out[hash] = { b64: bytesToBase64(stored.bytes), meta };
    any = true;
  }
  return any ? out : undefined;
}

/** Put embedded binaries back into the local store. Each is re-hashed and must match its key. */
export async function importEmbeddedModels(models: EmbeddedModels | undefined | null): Promise<number> {
  if (!models) return 0;
  let imported = 0;
  for (const [hash, entry] of Object.entries(models)) {
    try {
      const bytes = base64ToBytes(entry.b64);
      if ((await hashModelBytes(bytes)) !== hash) continue; // corrupted/tampered: drop, never mis-file
      await putModel(bytes, entry.meta);
      imported++;
    } catch { /* one bad entry must not sink the rest */ }
  }
  return imported;
}

// Chunked conversions - String.fromCharCode(...whole) overflows the arg limit on multi-MB models.
export function bytesToBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < view.length; i += CHUNK) {
    bin += String.fromCharCode(...view.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
