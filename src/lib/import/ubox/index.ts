// Universe Sandbox (.ubox) import — public API. Design §3.
//   const result = importUbox(bytes, opts);
//   const processed = systemProcessor.process(fixUpImportedSystem(result.system, pack), pack);
//   const review = buildImportReview(processed, result);
import { listSimulations, parseUbox } from './parse';
import { convertUbox } from './convert';
import { UboxError } from './types';
import type { UboxImportOptions, UboxImportResult, UboxListing } from './types';

export { UboxError } from './types';
export { RECOMMENDED_MIN_MASS_KG } from './convert';
export { buildImportReview, reviewToText } from './review';
export type {
  UboxImportOptions, UboxImportResult, UboxListing, ImportReview, ReviewRow, ReviewBucket,
  SkippedEntity, SkipReason, UsReferenceSnapshot, UboxErrorCode
} from './types';

/** Enumerate the simulations inside a .ubox archive (for the multi-sim picker / CLI --list). */
export function listUboxSimulations(bytes: Uint8Array): UboxListing {
  const { simulations, buildName, buildRevision } = listSimulations(bytes);
  return { simulations, buildName, buildRevision };
}

export interface UboxBodyPreview { name: string; mass: number; category: string; }
export interface UboxPreview { simName: string; bodies: UboxBodyPreview[]; particleCount: number; }

/** Cheap pre-scan of a chosen simulation's bodies (name/mass/category, sorted heaviest-first) — powers
 *  the mass slider's live "N bodies included" count WITHOUT a full conversion. */
export function previewUbox(bytes: Uint8Array, selection?: number | string): UboxPreview {
  const parsed = parseUbox(bytes, selection);
  const bodies: UboxBodyPreview[] = [];
  let particleCount = 0;
  for (const e of parsed.sim.Entities) {
    const name = (e.Name ?? '').trim();
    if (name === 'dummy') continue;
    if (!e.Category) { particleCount++; continue; }
    if (typeof e.Mass !== 'number' || !(e.Mass > 0)) continue;
    bodies.push({ name, mass: e.Mass, category: e.Category });
  }
  bodies.sort((a, b) => b.mass - a.mass);
  return { simName: parsed.sim.Name ?? '', bodies, particleCount };
}

/** Convert a .ubox archive into an UNPROCESSED authored-inputs SSG system + audit snapshot. */
export function importUbox(bytes: Uint8Array, options: UboxImportOptions = {}): UboxImportResult {
  const parsed = parseUbox(bytes, options.simulation);
  const result = convertUbox(parsed, options);
  if (!result.system.nodes.length) {
    throw new UboxError('empty-system', 'That Universe Sandbox simulation produced no importable bodies (all were skipped — try lowering the mass threshold).');
  }
  return result;
}
