// The trace gases that give a gas giant its face.
//
// A giant is hydrogen and helium plus a handful of traces — and it is entirely the traces that you
// see. Ammonia and the hydrosulphide it makes with sulphur are Jupiter's gold and its belts; methane
// is the blue of the ice giants. Bulk H2/He condenses into nothing and shows nothing.
//
// This lives on its own because TWO callers need exactly the same answer and must not drift: the
// generator, building a new giant, and the one-way fix-up that repairs older saves whose giants were
// written before any of this existed.
//
// HOW MUCH: the real trend across our own four is that the SMALLER the giant, the more enriched in
// heavy elements it is — Jupiter carries roughly four times the Sun's share of carbon, Saturn about
// six, and the ice giants tens of times more. A small giant could not hold on to as much hydrogen,
// so what it did keep is concentrated. Fitted to those four planets and then left to run:
// enrichment ~ mass^-0.6, which reproduces Saturn at ~8x and Uranus at ~25x without being told to.
import { EARTH_MASS_KG } from '$lib/constants';

/** Solar-relative enrichment in heavy elements implied by a giant's mass. */
export function giantEnrichment(massKg: number | undefined): number {
  const massEarths = Math.max(1, (massKg || 0) / EARTH_MASS_KG);
  return Math.max(1, Math.min(120, 126 * Math.pow(massEarths, -0.6)));
}

/** Solar-abundance baselines, calibrated so Jupiter's enrichment reproduces Jupiter's real mix. */
const BASE = { CH4: 0.00075, NH3: 0.000065, H2S: 0.00002 };

/**
 * A full hydrogen/helium atmosphere with its traces, for a giant of this mass.
 * `vary` supplies 0..1 randomness (the generator passes its seeded RNG); omit it for a repeatable
 * mid-range mix, which is what repairing an existing save wants — a fix-up should not roll dice.
 */
export function giantComposition(massKg: number | undefined, vary?: () => number): Record<string, number> {
  const e = giantEnrichment(massKg);
  const jitter = () => (vary ? 0.65 + vary() * 0.7 : 1);
  const CH4 = BASE.CH4 * e * jitter();
  const NH3 = BASE.NH3 * e * jitter();
  const H2S = BASE.H2S * e * jitter();
  const trace = CH4 + NH3 + H2S;
  const He = (vary ? 0.13 + vary() * 0.06 : 0.14) * (1 - trace);
  return { H2: 1 - trace - He, He, CH4, NH3, H2S };
}

/**
 * The level a giant's atmosphere is quoted at. A giant has no surface, so its "pressure" is whatever
 * depth the author picked — and its temperature is, by this app's convention, the reading near 1 bar
 * (see /physics#fudges). The two have to agree or every derived cloud lands at the wrong depth.
 */
export const GIANT_ANCHOR_BAR = 1;
