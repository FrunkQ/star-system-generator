// PIGMENT SELECTION — score every candidate pigment against the light that actually reaches the
// ground, rank them, and draw a dominant.
//
// FOUR THINGS THIS DELIBERATELY IS NOT, each of which has already cost something:
//
// 1. IT IS NOT AN ARGMAX OVER AVAILABLE ENERGY. Earth falsifies that model outright: the Sun's
//    surface irradiance peaks in the green and chlorophyll REFLECTS green, absorbing either side of
//    it. A naive maximiser predicts black vegetation under a G star and gets wrong the one case
//    every reader knows. THREE EXPLANATIONS COMPETE and this module does not pick between them —
//    path dependence (the "purple Earth" argument, that retinal-based organisms took the green band
//    first and chlorophyll took what was left), photoprotection (absorbing at the peak overloads the
//    photosystem, so sitting off-peak is a safety margin), and optimising for STEADY rather than
//    maximum flow, which favours the steep flanks of a spectrum over its summit (Arp et al.,
//    Science, 2020). Instead it scores THREE PRESSURES AT ONCE, weighted by pack data, which is
//    both more honest and the reason a NEAR-optimum can dominate.
//
// 2. IT IS NOT A SINGLE WINNER. Around a G star every one of the seven common pigments is viable;
//    the strongest claim available is which is most WIDESPREAD. So the output is a RANKED SET.
//    That is also what makes the V4 feature nearly free — "fungal takes one, flora another" is just
//    assigning different members of a set that already exists.
//
// 3. IT NEVER READS AN RGB. Selection reads PHOTON COUNTS. Deriving a colour first and selecting on
//    it re-imports human retinal response into a claim about alien biology, which is the Rec. 709
//    luma bug one level up and much harder to see. The only colour computed here is the OUTPUT
//    colour, at the end, from the reflected spectrum.
//
// 4. THE RANDOM DRAW IS THE MODEL, NOT A PLACEHOLDER. Without an evolutionary history a real
//    biosphere's outcome genuinely is contingent — nature tries many things and the second best can
//    dominate. So the dominant is a WEIGHTED draw over the scored viable set (never a uniform pick
//    over a list), seeded on the body id per DATA-G1 so a written-down seed still reproduces. V4
//    replaces the draw with a history; the scored set is unchanged.
import type { PigmentDef, PigmentModelConfig, PigmentRank, RulePack } from '$lib/types';
import { GRID_NM, integrate, photonSpectrum, type Spectrum } from './spectrum';
import { spectrumToHex, reflectedHexUnderIlluminant } from './spectrum';
import { bandAbsorbance } from './surfaceSpectrum';
import PIGMENTS_JSON from '$lib/data/pigments.json';
import { PLANCK_H, C_MS } from '$lib/constants';

const BUILT_IN = PIGMENTS_JSON as unknown as { model: PigmentModelConfig; pigments: PigmentDef[] };

/** Built-in defaults, overridable by a rule pack — the same shape `allLiquids` already uses. */
export function allPigments(pack?: RulePack | null): PigmentDef[] {
  return pack?.pigments && pack.pigments.length ? pack.pigments : BUILT_IN.pigments;
}
export function pigmentModel(pack?: RulePack | null): PigmentModelConfig {
  return pack?.pigmentModel ?? BUILT_IN.model;
}
export function pigmentDef(key: string | undefined, pack?: RulePack | null): PigmentDef | undefined {
  return key ? allPigments(pack).find((p) => p.key === key) : undefined;
}

/**
 * Absorptance 0..1 per grid bin: the pigment's own bands, its own flat baseline, and the TISSUE the
 * pigment sits in. That last term is why a leaf is dark green rather than a bright paint chip — an
 * organism is water and structure as well as pigment, and neither is a mirror. It is one number in
 * the pack, applied uniformly, rather than a fudge per pigment.
 */
export function absorptance(def: PigmentDef, tissue = 0): number[] {
  const base = (def.baselineAbsorptance ?? 0) + tissue;
  return GRID_NM.map((nm) => Math.min(1, base + bandAbsorbance(nm, def.bands)));
}

/** Photon energy in eV at a wavelength — used only for the damage threshold. */
function photonEv(nm: number): number {
  return (PLANCK_H * C_MS) / (nm * 1e-9) / 1.602176634e-19;
}

/**
 * Score every pigment against a surface spectrum. Returns the full ranked set, best first.
 *
 * Every term below is computed from PHOTON flux, not radiant power: photosynthesis is quantum-driven
 * — one photon drives one charge separation regardless of what it carries — so counting joules
 * would over-rank the blue end for a reason biology does not care about.
 */
export function scorePigments(surface: Spectrum, pack?: RulePack | null): PigmentRank[] {
  const model = pigmentModel(pack);
  const defs = allPigments(pack);
  const photons = photonSpectrum(surface);
  const available = integrate(photons);
  if (!(available > 0) || !defs.length) return [];

  // THE DAMAGE WEIGHT — what a photon costs as well as what it delivers, and it is SPECTRAL rather
  // than a flat penalty on absorbing a lot. Two named terms:
  //
  //   THERMALISATION. A reaction centre converts one photon into one fixed quantum of chemistry
  //   whatever the photon's energy, so everything above the centre's own red limit is dumped as
  //   heat. A 450 nm photon absorbed by a system limited at 700 nm wastes over a third of itself
  //   that way. This is the term that distinguishes a blue absorber from a red one, and without it
  //   the protection score degenerates into "whichever pigment absorbs least".
  //
  //   BOND BREAKING. Above `damageThresholdNm` a photon carries enough to break the chemistry
  //   rather than power it, so that excess is counted again and harder.
  //
  // Both limits are pack data: a tougher biochemistry tolerates harder light, and a reaction centre
  // built on a different molecule has a different red limit.
  const evCentre = photonEv(model.reactionCentreNm);
  const evSafe = photonEv(model.damageThresholdNm);
  const damageWeight = GRID_NM.map((nm) => {
    const e = photonEv(nm);
    return Math.max(0, e / evCentre - 1) + 2 * Math.max(0, e / evSafe - 1);
  });

  // The flank weight: |d ln(photon flux)/dλ|, normalised. High where the spectrum is STEEP, low at
  // its summit and in its flat tails. This is the Arp steadiness argument made computable — a
  // photosystem straddling two steep flanks sees a supply that varies less than one sitting on the
  // peak. It is one of three competing explanations, not the settled one; the weight says so.
  const lnFlux = photons.map((v) => Math.log(Math.max(1e-30, v)));
  const slope = GRID_NM.map((_, i) => {
    const a = lnFlux[Math.max(0, i - 1)], b = lnFlux[Math.min(lnFlux.length - 1, i + 1)];
    const dx = GRID_NM[Math.min(GRID_NM.length - 1, i + 1)] - GRID_NM[Math.max(0, i - 1)];
    return Math.abs((b - a) / Math.max(1e-9, dx));
  });
  // Normalised against the PHOTON-WEIGHTED mean slope, not the maximum. The maximum sits in the far
  // tail where there is no light at all, so normalising on it made every pigment score near zero and
  // the term did nothing. Weighted-mean normalisation makes 1.0 mean "as steep as the average photon
  // sees", which is the comparison the term is actually about.
  const meanSlope = integrate(photons.map((p, i) => p * slope[i])) / available;
  const flank = slope.map((s) => s / Math.max(1e-12, meanSlope));

  const ranks: PigmentRank[] = defs.map((def) => {
    // TWO absorptances, and keeping them apart is load-bearing. The PIGMENT's own absorption is what
    // feeds the photosystem and is what every score below reads. The tissue around it — water, cell
    // walls, structure — absorbs too, but that light is lost as heat rather than captured, so it
    // belongs only in what the organism LOOKS like. Folding the tissue floor into the scoring
    // drowns every pigment-specific difference in a term they all share, and the ranking collapses
    // to "whichever absorbs least".
    const abs = absorptance(def, 0);
    const absColour = absorptance(def, model.tissueAbsorptance);
    const absorbed = photons.map((p, i) => p * abs[i]);
    const absorbedFlux = integrate(absorbed);
    const captured = absorbedFlux / available;

    // CAPTURE, AND IT SATURATES — this is the term that makes the whole model work, and leaving it
    // unsaturated is what produces the naive maximiser that gets Earth wrong.
    //
    // A photosystem has a finite turnover rate. Photons arriving past it are not captured at all,
    // they are simply spare, which is why real vegetation light-saturates at a fraction of full
    // sunlight. So the benefit of absorbing more is `min(1, absorbed/saturation)`, not `absorbed`.
    //
    // THAT ONE CHANGE REPRODUCES THE OWNER'S OWN PIGMENT LADDER AS A CONSEQUENCE RATHER THAN AS FOUR
    // THRESHOLDS: under a starved sky nothing reaches saturation, so capture still discriminates and
    // the broadband absorber wins — black vegetation under an M dwarf. Under a generous sky
    // everything worth considering saturates, capture stops discriminating at all, and the decision
    // falls to the other two pressures — which is how chlorophyll beats melanin around a G star
    // despite absorbing a quarter as many photons. Selectivity scales with available energy, and
    // nothing in the code says so.
    // A SOFT knee, not a hard cap: 1 − exp(−absorbed/saturation), the standard saturating
    // light-response curve. A hard cap says absorbing twice the saturating flux is worth exactly
    // nothing more, which throws away the real margin a pigment keeps for cloud, dusk and shade.
    const sufficiency = 1 - Math.exp(-absorbedFlux / Math.max(1e-9, model.saturationFlux));

    // PROTECTION — overload, and it is a claim about ABSOLUTE flux rather than a fraction: absorbing
    // 80% of everything is punishing at Earth's insolation and harmless at an M dwarf's. The hard
    // end of the spectrum makes it worse per photon, so the excess energy above the damage threshold
    // rides on top.
    const excessPerPhoton = absorbedFlux > 0
      ? integrate(absorbed.map((v, i) => v * damageWeight[i])) / absorbedFlux
      : 0;
    const overload = (absorbedFlux / Math.max(1e-9, model.saturationFlux)) * (1 + excessPerPhoton);
    const protection = 1 / (1 + overload * model.damageScale);

    // STEADINESS — does it take its photons off the STEEP FLANKS of the spectrum or off its summit?
    // Centred so that 0.5 is neutral: a pigment absorbing in exact proportion to what is available
    // scores 0.5, one straddling two flanks scores above, one sitting on the peak below.
    const flankRatio = absorbedFlux > 0
      ? integrate(absorbed.map((v, i) => v * flank[i])) / absorbedFlux
      : 1;
    const steadiness = flankRatio / (1 + flankRatio);

    // THE PRESSURES MULTIPLY, THEY DO NOT ADD, and that is not a cosmetic choice.
    //
    // A weighted SUM keeps every term discriminating even where it has stopped meaning anything: a
    // starving biosphere would still be scored on how gracefully it avoids a damage it is nowhere
    // near, and the three terms sit on incomparable scales so whichever varies most wins by
    // accident. A PRODUCT lets a pressure switch itself off — protection goes to 1 when there is no
    // overload, steadiness to 1 when absorption follows what is available — so the regime decides
    // which pressure is doing the work, which is the actual claim being made. The weights are
    // exponents: how sharply each pressure bites, not how much of the total it owns.
    const score = Math.pow(Math.max(1e-12, sufficiency), model.captureWeight)
      * Math.pow(Math.max(1e-12, protection), model.protectionWeight)
      * Math.pow(Math.max(1e-12, flankRatio), model.steadinessWeight);

    // THE COLOUR IS WHAT IS LEFT OVER, and it is the last step. Reflected = surface × (1 − absorbed),
    // through the tissue absorptance, because what you see is the whole organism and not the pigment
    // in a bottle.
    //
    // TWO COLOURS, BOTH HONEST, AND EACH SAYS WHOSE. `reflectedHex` is ADAPTED to this star's own
    // light — a perfect white reflector under the same sky comes out white — which is what a human
    // standing there sees once their eyes settle, and it is the one that shows the PIGMENT rather
    // than the star. `reflectedUnderStarHex` leaves the star's cast in, which is what the same eyes
    // see arriving from orbit alongside everything else lit by that star. The second is what a
    // renderer must use, or a world's vegetation would be white-balanced while its oceans and rocks
    // were not.
    const reflected = surface.map((v, i) => v * (1 - absColour[i]));
    return {
      key: def.key,
      label: def.label,
      captured,
      sufficiency,
      protection,
      steadiness,
      score,
      viable: false,
      drawWeight: 0,
      reflectedHex: spectrumToHex(reflected, surface),
      reflectedUnderStarHex: reflectedHexUnderIlluminant(reflected, surface)
    };
  });

  ranks.sort((a, b) => b.score - a.score);
  const best = ranks[0]?.score ?? 0;
  // VIABILITY IS RELATIVE, never an absolute threshold — melanin absorbs everything and therefore
  // works everywhere, so no floor may ever select it OUT.
  let weightSum = 0;
  for (const r of ranks) {
    r.viable = best > 0 && r.score >= best * model.viabilityFraction;
    r.drawWeight = r.viable ? Math.pow(r.score / best, model.drawSharpness) : 0;
    weightSum += r.drawWeight;
  }
  if (weightSum > 0) for (const r of ranks) r.drawWeight /= weightSum;
  return ranks;
}

/**
 * Draw the dominant pigment from a scored set. `roll` is a 0..1 number from the CALLER's own
 * id-seeded stream (DATA-G1: never the shared per-run rng — its stream position depends on how many
 * draws ran before it, so one insertion silently re-rolls every saved seed).
 */
export function drawDominant(ranks: PigmentRank[], roll: number): PigmentRank | undefined {
  let acc = 0;
  const r = Math.max(0, Math.min(0.999999, roll));
  for (const p of ranks) {
    acc += p.drawWeight;
    if (r < acc) return p;
  }
  return ranks.find((p) => p.viable) ?? ranks[0];
}
