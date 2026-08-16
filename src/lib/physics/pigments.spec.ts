import { describe, it, expect } from 'vitest';
import { scorePigments, drawDominant, allPigments, absorptance } from './pigments';
import { blackbodySpectrum, gridShare, GRID_NM } from './spectrum';

// A world at some distance from a star of temperature T, with NO atmosphere in the way — which is
// the reference chart's own model, and useful here precisely because it isolates the star. The
// atmosphere's half of the story is surfaceSpectrum.spec.
function bareSpectrum(tempK: number, lumSolar = 1, distAU = 1) {
  return blackbodySpectrum(tempK, (1361 * lumSolar * gridShare(tempK)) / (distAU * distAU));
}
const hue = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return { r, g, b };
};
const byKey = (ranks: ReturnType<typeof scorePigments>, k: string) => ranks.find((r) => r.key === k)!;

describe('pigment scoring — the anomaly Earth hands us', () => {
  it('does NOT put melanin on top around a G star — the single thing a naive maximiser gets wrong', () => {
    // This is the assertion the whole model exists to satisfy. Earth falsifies an argmax over
    // available energy directly: melanin absorbs by far the most and is nonetheless the WORST
    // answer around a Sun-like star, because at that flux the captured light is already past
    // saturation and the overload is what decides.
    const ranks = scorePigments(bareSpectrum(5778));
    expect(ranks[0].key).not.toBe('melanin');
    expect(ranks[ranks.length - 1].key).toBe('melanin');
    expect(byKey(ranks, 'melanin').captured).toBeGreaterThan(byKey(ranks, 'chlorophyll').captured);
  });

  it('keeps chlorophyll in the leading group around a G star, and reads it GREEN to human eyes', () => {
    // NOT "chlorophyll must rank first". Sol is a CALIBRATION ANCHOR, not a target — fitting the
    // constants until one world comes out exactly right is the move the standing rules forbid. The
    // anchor's job is to catch a wildly wrong answer, and "the leading group, and it is green" is
    // what the physics has to earn.
    const ranks = scorePigments(bareSpectrum(5778));
    const chl = byKey(ranks, 'chlorophyll');
    expect(chl.score).toBeGreaterThan(ranks[0].score * 0.75);
    expect(chl.viable).toBe(true);
    const { r, g, b } = hue(chl.reflectedHex);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('returns a RANKED SET with several viable members, not a single winner', () => {
    // The reference chart shows all seven usable around a G star and claims only which is most
    // WIDESPREAD. Shipping the set is what makes V4's "fungal takes one, flora another" nearly free.
    const ranks = scorePigments(bareSpectrum(5778));
    expect(ranks.length).toBe(allPigments().length);
    expect(ranks.filter((r) => r.viable).length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < ranks.length; i++) expect(ranks[i - 1].score).toBeGreaterThanOrEqual(ranks[i].score);
  });

  it('never selects melanin OUT by an absolute threshold — it absorbs everything, so it works anywhere', () => {
    for (const t of [2400, 3200, 5778, 7500, 10000]) {
      const mel = byKey(scorePigments(bareSpectrum(t)), 'melanin');
      expect(mel.score).toBeGreaterThan(0);
      expect(mel.captured).toBeGreaterThan(0.7);
    }
  });
});

describe('pigment scoring — selectivity scales with available energy', () => {
  it('hands a STARVED world to the broadband absorber, and its vegetation reads black', () => {
    // Under a sky too dim to saturate anything, capture still discriminates and the pigment that
    // takes everything wins. Nothing in the code says so — it falls out of the saturating capture
    // term, which is the owner's own starvation limb arrived at rather than hardcoded.
    const dim = bareSpectrum(2800, 0.0015, 1);
    const ranks = scorePigments(dim);
    expect(ranks[0].key).toBe('melanin');
    const { r, g, b } = hue(ranks[0].reflectedUnderStarHex);
    expect(Math.max(r, g, b)).toBeLessThan(40);
  });

  it('hands a GENEROUS world to a selective pigment, because everything there has enough', () => {
    const ranks = scorePigments(bareSpectrum(5778, 1, 1));
    expect(byKey(ranks, 'melanin').sufficiency).toBeGreaterThan(byKey(ranks, 'carotenes').sufficiency);
    expect(byKey(ranks, 'melanin').protection).toBeLessThan(byKey(ranks, 'carotenes').protection);
    expect(ranks[0].key).not.toBe('melanin');
  });

  it('punishes a broadband absorber harder as the star gets brighter and harder', () => {
    const g = byKey(scorePigments(bareSpectrum(5778)), 'melanin');
    const a = byKey(scorePigments(bareSpectrum(9500, 40, 4)), 'melanin');
    expect(a.protection).toBeLessThan(g.protection);
  });
});

describe('the two colours, and each says whose', () => {
  it('adapts one to the local star and leaves the cast in the other', () => {
    const m = byKey(scorePigments(bareSpectrum(3000, 0.02, 0.14)), 'chlorophyll');
    // Adapted: the pigment's own identity, still green. Under the star: shifted by that red light.
    expect(m.reflectedHex).not.toBe(m.reflectedUnderStarHex);
    const adapted = hue(m.reflectedHex), raw = hue(m.reflectedUnderStarHex);
    expect(adapted.g).toBeGreaterThan(adapted.b);
    expect(raw.b).toBeLessThan(adapted.b);
  });
});

describe('the weighted draw', () => {
  it('is weighted over the scored set, never uniform over a list', () => {
    const ranks = scorePigments(bareSpectrum(5778));
    const viable = ranks.filter((r) => r.viable);
    expect(viable[0].drawWeight).toBeGreaterThan(viable[viable.length - 1].drawWeight);
    expect(ranks.reduce((s, r) => s + r.drawWeight, 0)).toBeCloseTo(1, 6);
    for (const r of ranks) if (!r.viable) expect(r.drawWeight).toBe(0);
  });

  it('is deterministic in the roll it is handed, and reaches more than one answer', () => {
    const ranks = scorePigments(bareSpectrum(5778));
    expect(drawDominant(ranks, 0)!.key).toBe(ranks[0].key);
    expect(drawDominant(ranks, 0.5)!.key).toBe(drawDominant(ranks, 0.5)!.key);
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(drawDominant(ranks, i / 100)!.key);
    expect(seen.size).toBeGreaterThan(1);
    for (const k of seen) expect(byKey(ranks, k).viable).toBe(true);
  });
});

describe('absorptance', () => {
  it('puts the bands where the pack says and saturates at 1', () => {
    const chl = allPigments().find((p) => p.key === 'chlorophyll')!;
    const a = absorptance(chl);
    const at = (nm: number) => a[GRID_NM.indexOf(nm)];
    expect(at(430)).toBeGreaterThan(at(550));   // Soret band brackets the green…
    expect(at(660)).toBeGreaterThan(at(550));   // …and so does the Q band. That IS the green gap.
    expect(Math.max(...a)).toBeLessThanOrEqual(1);
  });

  it('keeps the TISSUE floor out of the pigment\'s own absorption', () => {
    const chl = allPigments().find((p) => p.key === 'chlorophyll')!;
    const bare = absorptance(chl, 0), withTissue = absorptance(chl, 0.25);
    expect(withTissue[0]).toBeGreaterThan(bare[0]);
    // What the photosystem captures is the pigment's; what you SEE includes the organism around it.
    expect(bare[GRID_NM.indexOf(550)]).toBeLessThan(0.2);
  });
});
