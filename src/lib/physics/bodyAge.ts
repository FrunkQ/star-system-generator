// EVERY BODY CARRIES ITS OWN AGE (G94) - and this file is the only place that says what that age is.
//
// The owner, 2026-09-08: "EVERY object should have an independent age anyway as V4 will track
// formation times, captured bodies and rebuilding planets smashed in system."
//
// THREE DECISIONS LIVE HERE, and docs/dev/deep-time-design.md is where they are argued:
//
//  1. AN AGE IS A PROPERTY, NOT AN OVERRIDE. It is not in `body.overrides`, it raises no anomaly, and
//     nothing here returns a warning. A body older than its system is a history, not a cheat.
//
//  2. WHAT IS STORED IS A FORMATION TIME, on the master clock's own axis (G62: t = 0 is the big bang),
//     and the age is DERIVED from it. A duration would have to be migrated the day V4 tracks formation
//     properly; a formation time is the thing V4 tracks. A planet rebuilt after a collision moves its
//     own formation time forward and nothing else has to know.
//
//  3. ABSENT MEANS INHERIT. A body with no formation time of its own is as old as its system, and the
//     system's age is never stamped onto a body. `ageOf` is that rule and nothing else may restate it.
//
// WHAT "NOW" IS, because an age needs one: the SYSTEM'S REFERENCE EPOCH (`System.epochT0`, the wall
// instant the system was created at, which nothing rewrites afterwards) placed on the master clock.
// IT IS NOT THE CAMPAIGN CLOCK'S SCRUB POSITION and must never become it - a brown dwarf that cooled
// while a GM dragged the time bar would be physics depending on the display clock, which the transit
// work deliberately separated. Sliding an age does not move the clock; scrubbing the clock does not
// change an age. Nothing in this file reads the clock a GM scrubs.
import type { CelestialBody, System } from '$lib/types';
import { JULIAN_YEAR_S } from '$lib/constants';
import { unixMsToMasterSeconds } from '$lib/temporal/utre';

const SECONDS_PER_GYR = JULIAN_YEAR_S * 1e9;

/** What `ageOf` needs of a system: its own age and the instant that age is measured at. */
export type AgeFrame = Pick<System, 'age_Gyr' | 'epochT0'>;

/** The age a system is taken to have when it states none. One default, so no caller holds its own. */
export const DEFAULT_SYSTEM_AGE_GYR = 4.6;

export function systemAgeGyr(system: Partial<AgeFrame> | null | undefined): number {
  const a = system?.age_Gyr;
  return typeof a === 'number' && Number.isFinite(a) ? a : DEFAULT_SYSTEM_AGE_GYR;
}

/**
 * The system's reference date on the absolute axis, in Gyr after the big bang - the right-hand end
 * of every age scale, and the bound on how old anything in this system can be. DERIVED from the
 * master clock's anchor (about 13.787 for a campaign set in our era), never typed: a campaign
 * anchored further along the axis simply has more room.
 */
export function cosmicNowGyr(system: Partial<AgeFrame> | null | undefined): number {
  const ms = system?.epochT0;
  return Number(unixMsToMasterSeconds(typeof ms === 'number' && Number.isFinite(ms) ? ms : 0)) / SECONDS_PER_GYR;
}

/** True when the body states its own formation time rather than inheriting the system's age. */
export function hasOwnAge(body: Pick<CelestialBody, 'formationTimeGyr'> | null | undefined): boolean {
  const t = body?.formationTimeGyr;
  return typeof t === 'number' && Number.isFinite(t);
}

/**
 * HOW OLD THIS BODY IS, in Gyr. The one answer.
 *
 * A body with a formation time of its own is `now - formation`, and the system's age does not enter
 * into it. A body without one is exactly as old as its system - the same number, not a copy of it,
 * so a GM who changes the system's age changes every body that has not been given its own.
 */
export function ageOf(
  body: Pick<CelestialBody, 'formationTimeGyr'> | null | undefined,
  system: Partial<AgeFrame> | null | undefined
): number {
  if (!hasOwnAge(body)) return systemAgeGyr(system);
  return Math.max(0, cosmicNowGyr(system) - (body!.formationTimeGyr as number));
}

/**
 * Give a body an age of its own. Stored as the formation time that age implies on the absolute
 * axis, so the body keeps its place in history if it is later moved to another system.
 */
export function setBodyAge(body: CelestialBody, ageGyr: number, system: Partial<AgeFrame> | null | undefined): void {
  if (!Number.isFinite(ageGyr)) return;
  body.formationTimeGyr = cosmicNowGyr(system) - Math.max(0, ageGyr);
}

/** Hand the body's age back to its system. Deletes the field: absent means inherit. */
export function clearBodyAge(body: CelestialBody): void {
  delete body.formationTimeGyr;
}
