// THE `age/` TAG FAMILY (G94 job 6; deep-time-design.md section 5).
//
// The owner, 2026-09-08: "We need a new set of AGE tags now to highlight young, old and ancient
// objects. young - is younger than host star, old is older and ancient is 2-3 stars ago - primordial
// is early universe stuff." And, of the mechanism: "It fires the tag engine rather than anomaly."
//
// `age/` ANSWERS WHEN A BODY FORMED. `origin/` ANSWERS WHERE IT CAME FROM. They are separate axes
// and nothing here reads `origin/` or writes it: a body tagged `origin/captured` and `age/primordial`
// is the primordial rock this system picked up, said in two facts derived apart. A merger or a
// collision is a new member of `origin/` and does not touch this file - if describing one ever
// needs this file reopened, the split is wrong (deep-time-design.md section 1).
//
// ONLY A BODY WITH AN AGE OF ITS OWN IS TAGGED. One that inherits its system's age formed with its
// system by definition - the ordinary case, which carries no tag - and that is also what keeps
// every existing save exactly as it was.
//
// ONE TAG, THE MOST SPECIFIC BAND. Three of the bands are RELATIVE to the system's own formation
// (young, old, ancient) and one is ABSOLUTE (primordial), and the absolute one is asked first so it
// keeps meaning something whatever the body orbits now.
//
// THE COMPARISON POINT IS THE SYSTEM'S FORMATION - the age the system's star was dated at - on the
// same absolute axis the body's formation time is stored on (PHY-43).
//
// EVERY NUMBER IS PACK DATA (`deepTime` in the rule pack), with the defaults below standing in for a
// pack that carries none. They are FIRST VALUES and want a human's eye; they are exactly the figures
// someone will want to tune, which is why none of them is a constant in a derivation.
//
// WHAT WAS MEASURED IS AGE, AND ONLY AGE. The engine has no metallicity, so `ancient` and
// `primordial` are not cross-checked against composition; the tag descriptions say so.
import type { CelestialBody, RulePack } from '$lib/types';
import { ageOf, cosmicNowGyr, hasOwnAge, systemAgeGyr, type AgeFrame } from './bodyAge';

export const AGE_TAG_NAMESPACE = 'age/';
export type AgeBand = 'young' | 'old' | 'ancient' | 'primordial';

export interface DeepTimeConfig {
  /** How long after its star a body may form and still count as having formed WITH its system. */
  accretionGyr: number;
  /** The length of one stellar generation. */
  generationGyr: number;
  /** How many generations older than its host a body must be to be called ancient. */
  ancientGenerations: number;
  /** A body formed earlier than this many Gyr after the big bang is primordial, whatever it orbits. */
  primordialBeforeGyr: number;
}

export const DEEP_TIME_DEFAULTS: Readonly<DeepTimeConfig> = {
  accretionGyr: 0.1,
  generationGyr: 0.5,
  ancientGenerations: 2,
  primordialBeforeGyr: 1
};

export function deepTimeConfig(pack: RulePack | null | undefined): DeepTimeConfig {
  const d = (pack as { deepTime?: Partial<DeepTimeConfig> } | null | undefined)?.deepTime ?? {};
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);
  return {
    accretionGyr: num(d.accretionGyr, DEEP_TIME_DEFAULTS.accretionGyr),
    generationGyr: num(d.generationGyr, DEEP_TIME_DEFAULTS.generationGyr),
    ancientGenerations: num(d.ancientGenerations, DEEP_TIME_DEFAULTS.ancientGenerations),
    primordialBeforeGyr: num(d.primordialBeforeGyr, DEEP_TIME_DEFAULTS.primordialBeforeGyr)
  };
}

/** Which band this body's formation falls in, or null when it formed with its system. */
export function ageBand(
  body: Pick<CelestialBody, 'formationTimeGyr'> | null | undefined,
  system: Partial<AgeFrame> | null | undefined,
  pack?: RulePack | null
): AgeBand | null {
  if (!hasOwnAge(body)) return null;
  const cfg = deepTimeConfig(pack);
  const now = cosmicNowGyr(system);
  const bodyFormed = now - ageOf(body, system);
  const systemFormed = now - systemAgeGyr(system);
  if (bodyFormed < cfg.primordialBeforeGyr) return 'primordial';
  const olderBy = systemFormed - bodyFormed;
  if (olderBy >= cfg.ancientGenerations * cfg.generationGyr) return 'ancient';
  if (olderBy > 0) return 'old';
  if (-olderBy > cfg.accretionGyr) return 'young';
  return null;
}
