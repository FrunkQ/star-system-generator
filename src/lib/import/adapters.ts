// Source adapters so ONE import modal serves every format. Each adapter normalises a format's module
// (Universe Sandbox, SpaceEngine, …) to the small surface the modal needs.
import type { System } from '$lib/types';
import { buildImportReview, type ImportReview, type ReviewableResult } from './shared/review';
import * as ubox from './ubox';
import * as se from './spaceengine';

export interface ImportResultLike extends ReviewableResult { system: System; }

export interface ImportAdapter {
  label: string;                                    // "Universe Sandbox" / "SpaceEngine"
  recommendedMinMass: number;
  /** version/build subtitle, or '' if none. */
  subtitle(bytes: Uint8Array): string;
  /** systems in the file (for a picker); length ≤ 1 → no picker. */
  systems(bytes: Uint8Array): { name: string }[];
  preview(bytes: Uint8Array, sysIndex: number): { bodies: { name: string; mass: number }[]; note?: string };
  convert(bytes: Uint8Array, sysIndex: number, minMass: number): ImportResultLike;
  buildReview(processed: System, result: ReviewableResult): ImportReview;
}

export const uboxAdapter: ImportAdapter = {
  label: 'Universe Sandbox',
  recommendedMinMass: ubox.RECOMMENDED_MIN_MASS_KG,
  subtitle: (b) => { try { return ubox.listUboxSimulations(b).buildName; } catch { return ''; } },
  systems: (b) => ubox.listUboxSimulations(b).simulations.map((s) => ({ name: s.name })),
  preview: (b, i) => {
    const p = ubox.previewUbox(b, i);
    return { bodies: p.bodies, note: p.particleCount ? `${p.particleCount.toLocaleString()} ring/fragment particles are summarised, not imported` : undefined };
  },
  convert: (b, i, m) => ubox.importUbox(b, { simulation: i, minBodyMassKg: m }),
  buildReview: buildImportReview
};

export const spaceengineAdapter: ImportAdapter = {
  label: 'SpaceEngine',
  recommendedMinMass: se.SE_RECOMMENDED_MIN_MASS_KG,
  subtitle: () => '',
  systems: (b) => { const p = se.previewSc(b); return [{ name: p.name }]; },
  preview: (b) => { const p = se.previewSc(b); return { bodies: p.bodies }; },
  convert: (b, _i, m) => se.importSc(b, { minBodyMassKg: m }),
  buildReview: buildImportReview
};

/** Pick the adapter for a filename, or null if the extension isn't an importable format. */
export function adapterForFile(name: string): ImportAdapter | null {
  const n = name.toLowerCase();
  if (n.endsWith('.ubox')) return uboxAdapter;
  if (n.endsWith('.sc') || n.endsWith('.pak')) return spaceengineAdapter;   // .pak (addon zip) handled for free; exports are .sc
  return null;
}
