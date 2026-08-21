// ONE AGE MODEL FOR EVERY IMPORTER — what age is reasonable for this system, given its star.
//
// Every importer used to answer this differently: Universe Sandbox took the stored age or half the
// primary's lifespan capped at 4.6; SpaceEngine took the stated age or a flat 4.6; the real-sky
// catalogue took a measured age or 4.6 with a flag; Traveller ROLLED ONE AT RANDOM between 1 and 10.
// A user importing a system round an A star hit the flat 4.6 and, quite reasonably, blamed it for
// everything else that went wrong (design note `docs/dev/import-refresh-design.md` §1 — it was
// downstream of a missing star, but the 4.6 was still the wrong guess for an A star).
//
// This is the one place the guess is made. Two rules, both the owner's:
//
//   1. ON IMPORT WE DETERMINE AN AGE SO THE SYSTEM ALIGNS WITH ITS STAR; WE DO NOT AGE THE IMPORTED
//      PLANETS. They are captured as current state — whatever they are, they already are that — and
//      they adopt the star's age. Only worlds GENERATED into the system afterwards are born into the
//      era. So this function returns a number and a band; it never touches a body.
//   2. THE BAND IS THE STAR'S LIFE, and the UI binds the age control to it: from the youngest the
//      star could plausibly be (with a flaring marker at the young end, because a young star flaring
//      IS an option a GM might want) to just before it swells, explodes or collapses. Past that the
//      star would not be the star the file describes.
//
// The guess itself, by what the star IS:
//   main sequence  → the middle of its main-sequence life (0.5 × t_MS), capped near the age of the
//                    galaxy. Sun-like stars mostly are middle-aged; it is the honest prior.
//   giant / supergiant → near the END of the main-sequence life, since that is when a star is a giant.
//   white dwarf    → its cooling age from temperature when stated (hotter = younger), else old.
//   neutron star / black hole → genuinely unknown; the galactic median, wide band.
//   brown dwarf    → genuinely unknown too — they cool forever and the observable state does not
//                    date them well — so the galactic median with a wide band, and `estimated: true`.
//   pre-main-sequence indicator (stated) → young.
// A STATED age (file / catalogue) always wins if it is inside the star's life; if it is beyond it,
// the star cannot be that old and the guess is used with a note.
import { getStarLifespanGyr, flareActivity } from './stellar-evolution';
import { starFamilyOf } from '$lib/generation/star';
import { SOLAR_MASS_KG } from '$lib/constants';

export interface AgeGuess {
  ageGyr: number;
  /** [lo, hi] — the range the primary's own life makes reasonable. The UI binds the control to it. */
  bandGyr: [number, number];
  /** How the number was arrived at, for the assumptions list and the UI marker. */
  source: 'stated' | 'stated-clamped' | 'main-sequence-midlife' | 'giant-late-life' | 'wd-cooling' | 'remnant-median' | 'brown-dwarf-median' | 'no-star';
  estimated: boolean;
  /** Below this age the star flares hard (young, fast-rotating dynamo). Shown as a marker, not a wall. */
  flaringBelowGyr?: number;
  note: string;
}

const GALAXY_AGE_GYR = 13.0;
const GALACTIC_MEDIAN_GYR = 5.0;
const MIN_AGE_GYR = 0.001;   // a million years — younger than this and there is no system to speak of

/** Youngest age at which `flareActivity` has fallen below the "still flaring hard" level. */
function flaringEdgeGyr(classKey: string | undefined): number | undefined {
  // Walk up in age until the dynamo has settled; the level is a display threshold, not physics.
  const HARD = 0.5;
  if (!classKey) return undefined;
  for (const t of [0.01, 0.03, 0.1, 0.3, 0.6, 1, 2, 3, 5]) {
    if (flareActivity(classKey, t) < HARD) return t;
  }
  return undefined;
}

export interface StarForAge {
  massKg?: number;
  temperatureK?: number;
  classes?: string[];
  /** A stated age from the source, Gyr, if it carries one. */
  statedAgeGyr?: number | null;
}

export function guessSystemAge(star: StarForAge | null | undefined): AgeGuess {
  if (!star || !(star.massKg && star.massKg > 0)) {
    return {
      ageGyr: GALACTIC_MEDIAN_GYR, bandGyr: [MIN_AGE_GYR, GALAXY_AGE_GYR], source: 'no-star', estimated: true,
      note: 'No star to date the system by; the galactic median is used and the whole range is open. Supply a star (or add one in the infill step) to narrow it.'
    };
  }
  const classKey = star.classes?.[0];
  const family = starFamilyOf(classKey);
  const mSolar = star.massKg / SOLAR_MASS_KG;
  const tMS = getStarLifespanGyr(star.massKg);
  const flaringBelowGyr = flaringEdgeGyr(classKey);
  const stated = typeof star.statedAgeGyr === 'number' && star.statedAgeGyr > 0 ? star.statedAgeGyr : null;

  // The band the star's own life allows, by family. Main-sequence life ends when it swells.
  let band: [number, number];
  let guess: number;
  let source: AgeGuess['source'];
  let note: string;

  switch (family) {
    case 'remnant': {
      const isWD = /WD/.test(classKey ?? '');
      if (isWD && star.temperatureK && star.temperatureK > 0) {
        // Mestel cooling: t ∝ T^(-7/5). Anchored so a 10,000 K WD reads ~0.6 Gyr and 5,000 K ~1.6 Gyr;
        // the progenitor's own life is added, since the system is as old as the star's whole history.
        const coolGyr = 0.6 * Math.pow(star.temperatureK / 10000, -1.4);
        const progenitorLife = tMS; // tMS from the REMNANT mass over-estimates the progenitor's, but it is the bound we have
        guess = Math.min(GALAXY_AGE_GYR, coolGyr + Math.min(progenitorLife, 1));
        band = [Math.max(MIN_AGE_GYR, guess * 0.5), GALAXY_AGE_GYR];
        source = 'wd-cooling';
        note = `White dwarf: cooling age from its ${Math.round(star.temperatureK)} K surface plus its progenitor's life — about ${guess.toFixed(1)} Gyr; older is possible.`;
      } else {
        guess = GALACTIC_MEDIAN_GYR;
        band = [0.01, GALAXY_AGE_GYR];
        source = 'remnant-median';
        note = 'A remnant does not date its system well; the galactic median is used and the range is open.';
      }
      break;
    }
    case 'brown_dwarf': {
      guess = GALACTIC_MEDIAN_GYR;
      band = [MIN_AGE_GYR, GALAXY_AGE_GYR];
      source = 'brown-dwarf-median';
      note = 'A brown dwarf cools forever and its state does not date it; the galactic median is used and the range is open.';
      break;
    }
    default: {
      const isEvolved = /-(I|III)\b|red-giant/.test(classKey ?? '');
      const msEnd = Math.min(tMS, GALAXY_AGE_GYR);
      if (isEvolved) {
        // A giant is a star at the end of its main-sequence life; the giant phase itself is short.
        guess = Math.min(GALAXY_AGE_GYR, tMS * 1.05);
        band = [Math.max(MIN_AGE_GYR, tMS * 0.95), Math.min(GALAXY_AGE_GYR, tMS * 1.3)];
        source = 'giant-late-life';
        note = `A giant of ${mSolar.toFixed(2)} solar masses has finished its ~${tMS.toFixed(2)} Gyr main sequence; the system is about that old.`;
      } else {
        guess = Math.min(GALAXY_AGE_GYR, 0.5 * tMS);
        band = [MIN_AGE_GYR, msEnd];
        source = 'main-sequence-midlife';
        note = `Guessed as middle-aged for a ${mSolar.toFixed(2)} solar-mass star (main-sequence life ~${tMS < 100 ? tMS.toFixed(2) : Math.round(tMS)} Gyr); the range runs to just before it leaves the main sequence.`;
      }
    }
  }

  if (stated !== null) {
    if (stated >= band[0] && stated <= band[1]) {
      return { ageGyr: +stated.toFixed(3), bandGyr: band, source: 'stated', estimated: false, flaringBelowGyr, note: `Age ${stated.toFixed(2)} Gyr as stated by the source.` };
    }
    return {
      ageGyr: +guess.toFixed(3), bandGyr: band, source: 'stated-clamped', estimated: true, flaringBelowGyr,
      note: `The source states ${stated.toFixed(2)} Gyr, but the primary cannot be that old and still be what it is (reasonable ${band[0].toFixed(2)}–${band[1].toFixed(2)} Gyr); ${guess.toFixed(2)} Gyr is used instead.`
    };
  }
  return { ageGyr: +guess.toFixed(3), bandGyr: [+band[0].toFixed(3), +band[1].toFixed(3)], source, estimated: true, flaringBelowGyr, note };
}
