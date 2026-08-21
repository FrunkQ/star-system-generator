// ONE ANSWER TO "WHAT CLASS IS THIS IMPORTED STAR" — for every importer.
//
// The owner's question, 2026-08-18: "before, G would just be G — so GI and GV would be 'the same' but
// no longer. Ideally we drive star type from a directly STATED type, or INFERRED from its
// mass/radius/luminosity data. If just G then default to main sequence, as that is likely to get us in
// less trouble." That is exactly the rule here, and every piece of it already existed in the engine —
// what did not exist was one door for the importers to come through. Each had its own ladder:
// ubox's `starClassFromTemp` (stops at M), SpaceEngine's `starClassFromSpectral` (unrecognised → G!),
// Traveller's token walk, real-sky's `starClasses`. Four copies, four drift paths.
//
// THE RULE, in order of trust:
//   1. A STATED designation with a luminosity class ("G2V", "K3III", "M1.5Iab", "F7 Ib") is taken as
//      written. `starClassParts` already parses every MK band and `bandKeyOf` folds them to the
//      pack's three (Ia/Iab/Ib/II → -I; III → -III; IV/V/VI → main sequence).
//   2. A stated LETTER without a band ("G", "K5", "M") gets its band INFERRED from physics if the
//      star carries temperature AND radius — `luminosityClassFromPosition` matches (T, R) against the
//      same bands the generator draws from, because that is what a luminosity class physically IS.
//      A K dwarf and a K giant share a temperature and differ ~40× in radius.
//   3. If it cannot be inferred, MAIN SEQUENCE. A bare "G" is a G V, per the owner: the galaxy is
//      mostly dwarfs and a wrong -III is worse than a missing one (D19: a red supergiant read as a red
//      dwarf, and the reverse).
//   4. No letter at all: derive it from temperature through the pack's anchors
//      (`determineSpectralClass(T, pack)` — L/T/Y aware since v2.1.785), then infer the band as in 2.
//   5. Nothing usable → `star/unknown`, never a guessed G. The real-sky importer already had that
//      honest fallback (B44); SpaceEngine's "→ G" is what this replaces.
//
// A DISAGREEMENT IS RECORDED, NOT RESOLVED SILENTLY. If a stated band contradicts the physics (the file
// says "G V" but the star is 20 R☉), the stated one wins — the author said so — and `physicsBand`
// carries what the numbers say, so the importer can put a line in its assumptions and the
// plausibility tags can say the rest. Hand authoring is hand authoring.
import type { RulePack } from '$lib/types';
import { starClassParts, starClassKeyFor, bandKeyOf } from './starDesignation';
import { luminosityClassFromPosition } from '$lib/system/starBandMatch';
import { determineSpectralClass } from './stellar-evolution';
import { UNKNOWN_STAR_CLASS } from '$lib/import/realsky/stars.mjs';
import { SOLAR_RADIUS_KM } from '$lib/constants';

export interface ImportedStarInput {
  /** A stated spectral designation, any of "G2V", "K3 III", "M1.5Iab", "G", "F7", "BD", "D", "WD". */
  stated?: string | null;
  temperatureK?: number | null;
  radiusKm?: number | null;
  massKg?: number | null;
  luminositySolar?: number | null;
}

export interface ImportedStarClass {
  /** The full designation the star should carry, e.g. `star/G2V`, `star/K-III`, `star/L`, `star/WD`. */
  classKey: string;
  /** Its band — the pack template key: `star/G`, `star/K-III`, `star/M-I`. */
  bandKey: string;
  letter?: string;
  band?: 'I' | 'III' | 'V';
  /** How the band was arrived at. */
  bandSource: 'stated' | 'inferred-from-physics' | 'default-main-sequence' | 'remnant' | 'brown-dwarf' | 'unknown';
  /** What (T, R) said the band is, when it could be asked — even if a stated band overrode it. */
  physicsBand?: 'I' | 'III' | 'V';
  /** Set when a stated band and the physics disagree; the importer should surface it. */
  disagreement?: string;
}

const REMNANT_TOKENS: Record<string, string> = { D: 'star/WD', WD: 'star/WD', NS: 'star/NS', PSR: 'star/NS', BH: 'star/BH', BD: 'star/L' };

/** Normalise a stated string like "K3 III" / "k3iii" / "M1.5 Iab" to what starClassParts reads. */
const MK_BAND_CANON: Record<string, string> = { ia: 'Ia', iab: 'Iab', ib: 'Ib', i: 'I', ii: 'II', iii: 'III', iv: 'IV', v: 'V', vi: 'VI' };
function normaliseStated(s: string): string {
  const t = s.trim().replace(/^star\//i, '').replace(/\s+/g, '');
  // Letter upper; the MK band to its canonical casing (Iab is not IAB); digits/decimal kept.
  return t
    .replace(/^([obafgkmlty])/i, (m) => m.toUpperCase())
    .replace(/(iab|ia|ib|iii|ii|iv|vi|v|i)$/i, (m) => MK_BAND_CANON[m.toLowerCase()] ?? m);
}

export function resolveImportedStarClass(input: ImportedStarInput, pack?: RulePack | any): ImportedStarClass {
  const T = typeof input.temperatureK === 'number' && input.temperatureK > 0 ? input.temperatureK : undefined;
  const R = typeof input.radiusKm === 'number' && input.radiusKm > 0 ? input.radiusKm : undefined;
  const radiusSolar = R ? R / SOLAR_RADIUS_KM : undefined;
  const physicsBand = (T && radiusSolar) ? luminosityClassFromPosition(pack, { temperatureK: T, radiusSolar }) : undefined;

  const statedRaw = (input.stated ?? '').trim();
  // --- remnants and the brown-dwarf token: identity, not position ---
  // Traveller writes a white dwarf as "D" alone OR as "<letter><digit> D" (its former spectral type
  // followed by D as the luminosity class, e.g. "A0 D"). Either way it is a WD now.
  const upper = statedRaw.toUpperCase().replace(/^STAR\//, '');
  if (/^[OBAFGKM]\d?(\.\d)?\s+D$/.test(upper)) {
    return { classKey: 'star/WD', bandKey: 'star/WD', bandSource: 'remnant', physicsBand };
  }
  if (upper && REMNANT_TOKENS[upper]) {
    const key = REMNANT_TOKENS[upper];
    return { classKey: key, bandKey: key, bandSource: key === 'star/L' ? 'brown-dwarf' : 'remnant', physicsBand };
  }

  // --- a stated designation ---
  if (statedRaw) {
    const parts = starClassParts(`star/${normaliseStated(statedRaw)}`);
    if (parts.letter) {
      const letter = parts.letter;
      // brown dwarfs carry no luminosity class
      if (/^[LTY]$/.test(letter)) {
        const key = starClassKeyFor({ letter, tempK: T ?? 0 }, pack);
        return { classKey: key, bandKey: `star/${letter}`, letter, bandSource: 'brown-dwarf', physicsBand };
      }
      if (parts.band) {
        // 1. stated band wins; fold to the pack's three
        const key = `star/${letter}${parts.subclass != null ? parts.subclass : ''}${parts.band}`;
        const bandKey = bandKeyOf(key);
        const band = bandKey.endsWith('-I') ? 'I' : bandKey.endsWith('-III') ? 'III' : 'V';
        const out: ImportedStarClass = { classKey: key, bandKey, letter, band, bandSource: 'stated', physicsBand };
        if (physicsBand && physicsBand !== band) {
          out.disagreement = `Stated ${letter}${parts.subclass ?? ''} ${parts.band} but the star's temperature and radius place it as a class ${physicsBand}; the stated class is kept.`;
        }
        return out;
      }
      // 2. letter only: infer from physics; 3. else main sequence
      if (physicsBand) {
        const key = starClassKeyFor({ letter, tempK: T ?? 0, band: physicsBand }, pack);
        return { classKey: key, bandKey: bandKeyOf(key), letter, band: physicsBand, bandSource: 'inferred-from-physics', physicsBand };
      }
      const key = starClassKeyFor({ letter, tempK: T ?? 0, band: 'V' }, pack);
      return { classKey: key, bandKey: `star/${letter}`, letter, band: 'V', bandSource: 'default-main-sequence' };
    }
    // stated but unparseable falls through to physics
  }

  // --- 4. no usable statement: from temperature ---
  if (T) {
    const letter = determineSpectralClass(T, pack);
    if (/^[LTY]$/.test(letter)) {
      const key = starClassKeyFor({ letter, tempK: T }, pack);
      return { classKey: key, bandKey: `star/${letter}`, letter, bandSource: 'brown-dwarf', physicsBand };
    }
    if (physicsBand) {
      const key = starClassKeyFor({ letter, tempK: T, band: physicsBand }, pack);
      return { classKey: key, bandKey: bandKeyOf(key), letter, band: physicsBand, bandSource: 'inferred-from-physics', physicsBand };
    }
    const key = starClassKeyFor({ letter, tempK: T, band: 'V' }, pack);
    return { classKey: key, bandKey: `star/${letter}`, letter, band: 'V', bandSource: 'default-main-sequence' };
  }

  // --- 5. nothing usable ---
  return { classKey: UNKNOWN_STAR_CLASS, bandKey: UNKNOWN_STAR_CLASS, bandSource: 'unknown' };
}
