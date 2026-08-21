// The shipped starter maps, as data (WS8). One place that knows what the bundled maps ARE, so the upgrade
// offer never has to hard-code a file name or guess at a system list.
//
// The manifest is a DATA file (`static/example-starmaps/manifest.json`) regenerated whenever the starter maps
// are rebuilt, so everything here treats it as untrusted input: a malformed or missing manifest disables the
// upgrade offer rather than throwing on load. A campaign that cannot be classified is left alone, which is
// the safe direction.

import type { Starmap } from '$lib/types';
import type { BaseMapManifestEntry } from './rebase';

export interface BaseMapManifest {
  baseMapVersion: number;
  appVersion?: string;
  generated?: string;
  maps: (BaseMapManifestEntry & { file: string; description?: string })[];
}

const MANIFEST_URL = '/example-starmaps/manifest.json';
const MAP_DIR = '/example-starmaps/';

// EDITION 1 — the ids the FIRST bundled Local Neighbourhood shipped, recorded here permanently.
//
// These are historical facts, not configuration: they are how we recognise a campaign built on the old map,
// and edition 1 predates the manifest so nothing else records them. The list must never be "tidied" to match
// a later edition — that would make old campaigns unrecognisable and silently un-upgradeable.
export const EDITION_1_SYSTEM_IDS = [
  'sys-sol', 'sys-alphacen', 'sys-barnard', 'sys-wolf359', 'sys-lalande', 'sys-sirius', 'sys-ross154',
  'sys-ross248', 'sys-epseri', 'sys-ross128', 'sys-teegarden', 'sys-luyten', 'sys-tauceti', 'sys-trappist',
  'sys-luyten726', 'sys-procyon', 'sys-61cygni', 'sys-struve2398', 'sys-luhman16', 'sys-lacaille9352'
];

let cached: BaseMapManifest | null | undefined; // undefined = not fetched, null = unavailable

function looksLikeManifest(v: any): v is BaseMapManifest {
  return !!v && typeof v.baseMapVersion === 'number' && Array.isArray(v.maps)
    && v.maps.every((m: any) => m && typeof m.id === 'string' && typeof m.file === 'string' && Array.isArray(m.systemIds));
}

/** Fetch the manifest once. Returns null when it is missing or malformed — never throws. */
export async function loadBaseMapManifest(fetchFn: typeof fetch = fetch): Promise<BaseMapManifest | null> {
  if (cached !== undefined) return cached;
  try {
    const res = await fetchFn(MANIFEST_URL);
    if (!res.ok) { cached = null; return cached; }
    const json = await res.json();
    cached = looksLikeManifest(json) ? json : null;
  } catch {
    cached = null;
  }
  return cached;
}

/** Fetch one bundled starter map by its manifest entry. Returns null on any failure. */
export async function loadBundledMap(file: string, fetchFn: typeof fetch = fetch): Promise<Starmap | null> {
  try {
    const res = await fetchFn(MAP_DIR + file);
    if (!res.ok) return null;
    const json = await res.json();
    return json && Array.isArray(json.systems) ? (json as Starmap) : null;
  } catch {
    return null;
  }
}

/**
 * Which bundled map a campaign descends from, decided by SYSTEM ID OVERLAP — never by name, which a GM is
 * free to change and frequently does.
 *
 * `minOverlap` guards against a coincidence: one shared id (a GM who happened to reuse `sys-sol`) is not a
 * descent. Three is enough to be certain while still recognising a campaign that has deleted most of the
 * base. When several bundled maps could match — the real and science-fiction Local Neighbourhoods share
 * every id — the one with the most matches wins, and ties go to the earliest entry so the choice is stable.
 */
export function matchBundledMap(
  campaign: Pick<Starmap, 'systems'>,
  manifest: BaseMapManifest,
  minOverlap = 3
): { entry: BaseMapManifestEntry & { file: string }; overlap: number } | null {
  const ids = new Set(campaign.systems.map((s) => s.id));
  let best: { entry: BaseMapManifestEntry & { file: string }; overlap: number } | null = null;
  for (const entry of manifest.maps) {
    const overlap = entry.systemIds.reduce((n, id) => n + (ids.has(id) ? 1 : 0), 0);
    if (overlap >= minOverlap && (!best || overlap > best.overlap)) best = { entry, overlap };
  }
  return best;
}

/**
 * True when the campaign holds enough EDITION-1 ids to be a descendant of the original bundled map. Used
 * for files with no `baseMapVersion` stamp at all, which is every campaign saved before 2.1.272-beta.
 */
export function looksLikeEdition1(campaign: Pick<Starmap, 'systems'>, minOverlap = 3): boolean {
  const ids = new Set(campaign.systems.map((s) => s.id));
  return EDITION_1_SYSTEM_IDS.reduce((n, id) => n + (ids.has(id) ? 1 : 0), 0) >= minOverlap;
}

// TESTING ONLY: drop the memoised manifest so a test can supply a different one.
export function __resetManifestCache() { cached = undefined; }
