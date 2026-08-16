// THE DIGIT IN G2V — the one derivation the full MK designation was missing (inbox B60).
//
// The engine already carries a structured `StellarType` (spectral / subclass / variant / luminosity)
// and already parses and formats a catalogue designation both ways (`import/realsky/stars.mjs`), so
// an IMPORTED star arrives with its subclass intact. A GENERATED or hand-edited one never had one,
// because nothing could work out which digit a temperature deserves. That was the whole gap.
//
// WHY THIS NEEDS NO PARAMETER BANDS OF ITS OWN, which is what keeps it small: the classifier works
// from HR POSITION and luminosity is COMPUTED from radius and temperature (B57), so the subclass has
// nothing left to decide except where in its letter the star sits. That is one number in, one number
// out. Adding a band per subclass would be the 700-cell grid B46(b) warned about, and it dissolves
// entirely once the parameters are computed rather than stored.
//
// THE SEQUENCE IS UNEVENLY SPACED, so the anchors are interpolated rather than a letter's band being
// divided into ten. G0 to G2 is 160 K; K5 to K7 is 340. A linear split gets Sol wrong.
//
// LIMIT WORTH STATING: the anchors are the MAIN-SEQUENCE branch. A supergiant of the same
// temperature carries a slightly different subclass in the published system, and this returns the
// dwarf answer for it. It lands close — Rigel at 12,100 K comes back B8, which is its published
// digit — but "close" is the claim, not "exact", and a giant branch would be its own anchor set.
import type { RulePack } from '../types';
import { LUMINOSITY_BAND } from '../import/realsky/stars.mjs';

export type SubclassAnchors = Record<string, Record<string, number>>;

export function subclassAnchors(pack?: RulePack | any): SubclassAnchors | undefined {
  const a = (pack as any)?.stellarClassification?.subclass_anchors;
  return a && typeof a === 'object' ? (a as SubclassAnchors) : undefined;
}

/**
 * The subclass digit for a temperature within a spectral letter, or undefined when the pack states
 * no anchors for it. Interpolated between the two nearest anchors and clamped to the letter's own
 * range: a star hotter than its letter's 0 anchor is a 0, not a negative.
 *
 * DERIVED ONLY FOR THE MAIN SEQUENCE, WHICH IS THE HONEST LIMIT AND IS OLDER THAN THIS FILE. The
 * relation between temperature and subclass depends on the LUMINOSITY CLASS — a K1.5 giant is cooler
 * than a K1.5 dwarf — so the ladder applied to a giant is wrong by a lot: Arcturus (K1.5III) derives
 * as K5.5 on it, four subclasses out. A giant gets its letter and its class with NO subclass, which
 * is both honest and how people speak of them ("a K giant"). DATA-R10: the letter alone determines
 * less than it appears to.
 *
 * Returns a number so a half-subclass (M1.5, the value SIMBAD really publishes for Betelgeuse)
 * survives the round trip; `formatStellarType` prints whatever it is given.
 */
export function spectralSubclass(spectral: string, tempK: number, pack?: RulePack | any, band?: string): number | undefined {
  if (band && band !== 'V') return undefined;   // giants and supergiants: see above
  const anchors = subclassAnchors(pack)?.[spectral];
  if (!anchors || !(tempK > 0)) return undefined;
  const points = Object.entries(anchors)
    .map(([sub, t]) => ({ sub: Number(sub), t: Number(t) }))
    .filter((p) => isFinite(p.sub) && p.t > 0)
    .sort((a, b) => a.sub - b.sub);          // ascending subclass = DESCENDING temperature
  if (!points.length) return undefined;
  if (tempK >= points[0].t) return points[0].sub;
  const last = points[points.length - 1];
  if (tempK <= last.t) return last.sub;
  for (let i = 0; i < points.length - 1; i++) {
    const hi = points[i], lo = points[i + 1];   // hi.t > lo.t
    if (tempK <= hi.t && tempK >= lo.t) {
      const f = (hi.t - tempK) / (hi.t - lo.t);
      return Math.round((hi.sub + f * (lo.sub - hi.sub)) * 10) / 10;
    }
  }
  return last.sub;
}

/**
 * A pack band key -> the structured classification it states, with the SUBCLASS filled in from the
 * star's temperature when one is known.
 *
 * `star/M-I` is an M supergiant; `star/K` is a K star with no luminosity class stated, which is what
 * a bare letter band means and must stay distinguishable from one stated as V. Remnants carry their
 * own key as the spectral value, because 'WD' and 'BH' are classifications with no letter behind them.
 *
 * SHARED because both star-creation doors need it and a value set in only one of them is the B9a bug
 * repeating: the editor's picker had this privately, and generation set no structured type at all —
 * so an imported star carried its subclass and a generated one never could (inbox B60).
 */
export function stellarTypeForBand(
  key: string,
  tempK?: number,
  pack?: RulePack | any
): { spectral: string; subclass?: number; luminosity?: string; band?: 'I' | 'III' | 'V' } | undefined {
  const name = key.split('/')[1];
  if (!name) return undefined;
  const m = /^([OBAFGKMLTY])(?:-(I|III|V))?$/.exec(name);
  if (!m) return { spectral: name };  // star/WD, star/NS, star/BH, ...
  const sub = tempK != null ? spectralSubclass(m[1], tempK, pack, m[2]) : undefined;
  return {
    spectral: m[1],
    ...(sub != null ? { subclass: Math.round(sub) } : {}),
    ...(m[2] ? { luminosity: m[2], band: m[2] as 'I' | 'III' | 'V' } : {})
  };
}

/**
 * A star's full designation from what the engine already knows about it: the letter from its
 * temperature, the digit from these anchors, and the luminosity class from whatever the caller has
 * derived (the HR-position classifier, or a pack band that states one).
 *
 * The luminosity class is passed IN rather than derived here on purpose — it is the classifier's
 * answer, and re-deriving it would be a second opinion on a question that already has one.
 */
export function designationFor(params: {
  spectral: string;
  tempK: number;
  luminosity?: string;
}, pack?: RulePack | any): { spectral: string; subclass?: number; luminosity?: string; band?: string } {
  const band = params.luminosity?.replace(/[ab]/g, '');
  const sub = spectralSubclass(params.spectral, params.tempK, pack, band);
  return {
    spectral: params.spectral,
    ...(sub != null ? { subclass: Math.round(sub) } : {}),
    ...(params.luminosity ? { luminosity: params.luminosity, band: params.luminosity.replace(/[ab]/g, '') } : {})
  };
}

/**
 * The full MK designation for a star's measured state: `G2V`, `K III`, `M Ia`-ish.
 *
 * COMPUTED FROM POSITION, never authored — which is what makes the full designation space affordable
 * at all. There is no 700-cell grid to fill in, because a designation is a place on the HR diagram
 * rather than a row in a table.
 */
export function fullDesignation(letter: string, tempK: number, band?: 'I' | 'III' | 'V', pack?: RulePack | any): string {
  const sub = spectralSubclass(letter, tempK, pack, band);
  const subText = sub == null ? '' : String(Math.round(sub));
  return `${letter}${subText}${band ?? ''}`;
}

// ── THE CLASS KEY ────────────────────────────────────────────────────────────────────────────────
// A star's `classes[0]`. Two shapes live here and the difference is the whole of the owner's ruling
// (2026-08-16): **a BAND is the range a draw comes from; a DESIGNATION is what a particular star IS.**
// `star/G` is a fine band and is not something a star can be — "O is dead, O1a is valid".
//
//   BAND        `star/G`, `star/K-III`   pack keys, what a pick draws from, never written to a body
//   DESIGNATION `star/G2V`, `star/L5`    what a body holds
//
// A GIANT KEEPS ITS BAND KEY AND THAT IS NOT AN EXCEPTION, IT IS THE SAME RULE: the subclass ladder
// is main-sequence, so `star/K-III` states everything we can honestly say about a K giant, and
// `K III` is exactly how the designation reads. Inventing `star/K1-III` would be stating a digit the
// engine refused to derive four lines up.
//
// ONE SPELLING, deliberately — a hyphenated `star/K-III` and a run-together `star/KIII` would be the
// A37 fault (one concept, two names, translated in one place), so the band key IS the giant's
// designation key rather than a second form of it.
const REMNANT_KEYS = /^star\/(WD|NS|BH|BH_active|magnetar|default)$/;

/** What a class key STATES: its letter, any subclass, and its luminosity class. */
export function starClassParts(key: string): { letter?: string; subclass?: number; band?: string; bare?: string } {
  const name = String(key ?? '').replace(/^star\//, '');
  if (!name) return {};
  if (REMNANT_KEYS.test(`star/${name}`)) return { bare: name };
  const m = /^([OBAFGKMLTY])(\d+(?:\.\d+)?)?-?(0|Ia|Iab|Ib|I{1,3}|IV|VI|V)?$/.exec(name);
  if (!m) return { bare: name };
  return {
    letter: m[1],
    ...(m[2] != null ? { subclass: Number(m[2]) } : {}),
    ...(m[3] ? { band: m[3] } : {})
  };
}

/**
 * Is this key a BAND — a range to draw from — rather than a designation a star can hold?
 *
 * THE TEST IS THE SUBCLASS, not the luminosity class. `star/K-III` states no digit and is a band;
 * so is `star/G`. `star/G2V` and `star/M1.5Iab` state one and are designations, whoever wrote them —
 * the second is a real catalogue type and must not be mistaken for a range.
 */
export function isBandKey(key: string): boolean {
  const p = starClassParts(key);
  if (p.bare || !p.letter) return false;          // remnants are identity, not position
  return p.subclass == null;
}

/**
 * THE CLASS KEY a star of this state should hold.
 *
 * Main sequence gets its full designation (`star/G2V`); a brown dwarf gets its digit with no
 * luminosity class, which is how L, T and Y dwarfs are actually written; a giant or supergiant keeps
 * its band key, because that states everything the main-sequence ladder lets us say.
 */
export function starClassKeyFor(
  params: { letter: string; tempK: number; band?: string },
  pack?: RulePack | any
): string {
  const { letter, tempK } = params;
  const band = params.band ?? 'V';
  if (band !== 'V') return `star/${letter}-${band}`;
  const sub = spectralSubclass(letter, tempK, pack, band);
  const digit = sub == null ? '' : String(Math.round(sub));
  // L, T and Y are not on the main sequence and carry no luminosity class in the catalogue.
  const cls = /^[LTY]$/.test(letter) ? '' : 'V';
  return `star/${letter}${digit}${digit ? cls : ''}`;
}

/**
 * The BAND a class key belongs to — the pack entry a lookup should fall back to.
 *
 * `star/G2V` -> `star/G`; `star/M1.5Iab` -> `star/M-I`; `star/K-III` -> itself; a remnant -> itself.
 *
 * ONE TRANSLATION POINT, because three lookups need it and A37 is what happens when a concept is
 * spelled twice: the stat template, the class portrait and the editor's dropdown all have to turn a
 * star's designation back into the range it came from, and a supergiant that resolves to its letter
 * alone gets a red DWARF's band and a red dwarf's picture.
 */
export function bandKeyOf(classKey: string): string {
  const p = starClassParts(classKey);
  if (p.bare || !p.letter) return classKey;
  // The SAME folding the importer uses: II is a bright giant and belongs to the supergiant band, IV is
  // a subgiant and belongs to the dwarf band. The pack states three positional bands per letter, not
  // seven, and this is the one table that says which is which.
  const band = p.band ? (LUMINOSITY_BAND as Record<string, string>)[p.band] : undefined;
  if (band && band !== 'V') return `star/${p.letter}-${band}`;
  return `star/${p.letter}`;
}
