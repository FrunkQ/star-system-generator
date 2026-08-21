// Real-sky import — fill-out mode (design doc §5).
//
// The confirmed-planet catalogue is a floor, not a census: surveys are blind
// to most small, long-period worlds. Fill-out asks the EXISTING generator to
// complete each imported system, constrained by what is actually known:
//
// - The star is pinned: the generator receives a StarSeed built from the real
//   star's measured mass/radius/temperature/luminosity, so its habitable zone,
//   snow line and planet slots derive from the real star.
// - Confirmed planets are ANCHORS. They are never moved or removed, and any
//   generated planet landing within 3.5 mutual Hill radii of one is dropped
//   (the standard dynamical-packing limit).
// - DETERMINISM IS A FEATURE: the RNG seed is derived from the system's own
//   catalogue slug, so one person's Polaris is everyone's Polaris — a strange
//   world reported by one GM reproduces on every machine. Generated orbits'
//   t0 is pinned to the shared EPOCH for the same reason (the generator
//   stamps Date.now(), which would make phases differ run to run).
// - HONESTY IS TAGGED: every generated body carries `origin/generated`, so a
//   GM (and any future re-import) can always tell a measured world from a
//   plausible one. Confirmed planets carry no such tag.
//
// App-side only (TypeScript, $lib imports) — the plain-node build kit never
// fills out; the bundled REAL map is confirmed-only by policy.

import type { RulePack, System } from '$lib/types';

// ONE COPY, and it is not here any more. The infill that used to live in this file is now
// `generation/infill.ts infillSystem` — the same seed-from-star, anchor-respecting, letter-continuing,
// origin/generated-tagging routine, generalised to every importer, given the wizard's four dials, an
// age, more than one star, and a hard count for Traveller. This file keeps its name and its two
// exports so the real-sky callers and their tests do not move; both are thin.
export { GENERATED_TAG } from '$lib/generation/infill';
import { infillSystem, type InfillResult } from '$lib/generation/infill';
import type { GenerationKnobs } from '$lib/generation/generateFromConfig';

export type FillOutResult = Pick<InfillResult, 'addedPlanets' | 'addedMoons' | 'droppedNearAnchors'>;

// The GM's dials, and the age, come from the same `GenerationDials` panel the file importer and the
// wizard mount (inbox G33: whoever calls infillSystem from a UI mounts the dials and passes its
// knobs). Both optional — the specs and any non-UI caller keep the defaults they always had.
export interface FillOutOptions {
  knobs?: GenerationKnobs;
  /**
   * Age in Gyr for the GENERATED worlds. NOT applied per system on the catalogue path unless the GM
   * moved the slider, because a real-sky region holds many stars of wildly different ages and one
   * figure would be wrong for most of them — each system keeps its own guess by default.
   */
  ageGyr?: number;
}

// Fill out ONE imported single-star system in place. Returns what happened so the UI can report it.
// Deterministic per catalogue slug, exactly as before.
export function fillOutSystem(system: System, rulePack: RulePack, opts: FillOutOptions = {}): FillOutResult {
  const r = infillSystem(system, rulePack, {
    seed: `realsky-fill-${system.seed}`,
    knobs: opts.knobs,
    ageGyr: opts.ageGyr
  });
  return { addedPlanets: r.addedPlanets, addedMoons: r.addedMoons, droppedNearAnchors: r.droppedNearAnchors };
}

// Fill out every system of an imported batch (the converter's output). Mutates
// in place; returns per-system results keyed by system id for the UI report.
export function fillOutAll(
  entries: { id: string; system: System }[],
  rulePack: RulePack,
  opts: FillOutOptions = {}
): Record<string, FillOutResult> {
  const report: Record<string, FillOutResult> = {};
  for (const entry of entries) report[entry.id] = fillOutSystem(entry.system, rulePack, opts);
  return report;
}
