// ONE answer to "which portrait does this star class get?" (G21).
//
// It used to be answered by THREE functions that agreed on the exact hit and disagreed everywhere
// else — the editor (`BodyStarTab.updateImage`), the generator (`generation/star.ts`) and the
// config-driven generator (`generateFromConfig.ts`). That is UI-C3's lesson on a different table:
// the branch that diverges first is the one no author ever selects, so the drift sat in the
// FALLBACK, which every test walked straight past.
import type { RulePack } from '$lib/types';
import { bandKeyOf } from '$lib/physics/starDesignation';

// DATA-R13: when the question is "does this class have a spectral letter", ask THAT, never keep a
// list of the classes that do not. This is the shape that entry names, verbatim, and it is
// deliberately the same regex `generation/star.ts` already used to derive a body's base class — one
// spelling serving both questions rather than two that can drift apart.
//
// 'B' IS THE TRAP, AND A NAIVE FIX HERE WOULD HAVE BEEN ITS FOURTH APPEARANCE. 'B' begins "BH" and
// is also a real spectral class, so a plain "first character is in OBAFGKMLTY" test maps `star/BH`
// and `star/BH_active` onto `star/B` — a BLACK HOLE illustrated with a hot blue star, which is the
// "wrong picture is worse than no picture" fault (A28/A30) arriving through the back door. The shape
// test is what refuses it: the letter must be followed by something that CONTINUES a spectral type —
// a subtype digit, a luminosity class, or the end of the string — and 'H' is none of those.
const SPECTRAL_BAND = /^star\/([OBAFGKMLTY])(?:\d|-(?:I|III)$|$)/;

/** The base spectral letter of a class key, or undefined if the class has none. */
export function spectralLetterOf(starClass: string | undefined | null): string | undefined {
  if (!starClass) return undefined;
  return SPECTRAL_BAND.exec(starClass)?.[1];
}

/**
 * The portrait url for a star class, or undefined if the pack has none for it.
 *
 * MOST SPECIFIC FIRST, then the letter. `star/M-I`, `star/M-III` and `star/K-III` have their own
 * portraits; every other giant and supergiant deliberately falls through to its letter, which is
 * honest — a blue supergiant does look broadly like a hot blue star, and it was the red ones that
 * lied by showing a dwarf.
 *
 * Returning undefined is a real answer, not a failure: a remnant with no portrait of its own gets
 * NO picture rather than a misleading one.
 */
export function resolveStarImage(
  pack: RulePack | any,
  starClass: string | undefined | null
): string | undefined {
  // The editor read `rulePack.starImages` as well as `rulePack.classifier.starImages`; the typed
  // shape only ever carries the latter (`ClassifierSpec`), but an untyped or hand-made pack may not,
  // so both are honoured here rather than in three call sites.
  const images: Record<string, string> | undefined =
    pack?.classifier?.starImages ?? pack?.starImages;
  if (!images || !starClass) return undefined;
  if (images[starClass]) return images[starClass];
  // EXACT, THEN THE BAND, THEN THE LETTER. The band step is what keeps a supergiant's own art: an
  // imported Betelgeuse holds `star/M1.5Iab`, and resolving straight to its letter would hand it the
  // red DWARF picture — a wrong claim, drawn (inbox B60, and DATA-R12's fault reappearing). The band
  // is worked out by the same helper the stat template uses, so a class cannot resolve to one band
  // for its numbers and another for its picture.
  const band = bandKeyOf(starClass);
  if (band !== starClass && images[band]) return images[band];
  const letter = spectralLetterOf(starClass);
  return letter ? images[`star/${letter}`] : undefined;
}
