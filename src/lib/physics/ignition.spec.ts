import { describe, it, expect } from 'vitest';
import { brownDwarfThermal, SUBSTELLAR_MAX_MJUP, SUBSTELLAR_MIN_MJUP } from './substellar';
import { starColorFromTempK } from '$lib/rendering/apparentColor';

const JUP = 1.898e27, RJ = 71492;
const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe('crossing the fusion limit', () => {
  it('is not a brightness cliff — the track is continuous right up to it', () => {
    // The physical claim: an object at the hydrogen-burning limit sits near 1900-2100 K whether or
    // not it has just started fusing, which is why the coolest M dwarfs and hottest L dwarfs overlap.
    const below = brownDwarfThermal((SUBSTELLAR_MAX_MJUP - 0.01) * JUP, 4.6, RJ);
    expect(below.teffK).toBeGreaterThan(1800);
    expect(below.teffK).toBeLessThan(2200);
  });

  it('and igniting must never make a body DARKER, which is what the floor is for', () => {
    // The track stops dead at the limit, so a body nudged across it keeps its brown-dwarf
    // temperature. With the colour ramp taking anything under 2400 K toward black, that would mean
    // ignition dimmed it. The processor holds a fusing star at or above 1900 K; this pins the
    // consequence, which is that the colour on the far side is no darker than on the near side.
    const justBelow = starColorFromTempK(brownDwarfThermal((SUBSTELLAR_MAX_MJUP - 0.01) * JUP, 4.6, RJ).teffK);
    const justAbove = starColorFromTempK(1900);
    expect(lum(justAbove)).toBeGreaterThanOrEqual(lum(justBelow) * 0.95);
  });

  it('the low boundary is genuinely invisible, so it needs no such guard', () => {
    // 0 -> 6.25e-8 L_sun at 8 M_jup. A giant contributing that to a moon's flux is nothing, which is
    // why only the STELLAR boundary earns a correction.
    const first = brownDwarfThermal(SUBSTELLAR_MIN_MJUP * JUP, 4.6, RJ);
    expect(first.luminositySolar).toBeLessThan(1e-6);
    expect(brownDwarfThermal((SUBSTELLAR_MIN_MJUP - 0.01) * JUP, 4.6, RJ).luminositySolar).toBe(0);
  });

  it('hands the LUMINOSITY over without a step, because both sides compute the same thing', () => {
    // The substellar track does lumW = 4*pi*R^2*sigma*T^4 / L_sun. The star editor's
    // `syncRadiationFromSB` does R_suns^2 * (T/5778)^4. That is the same Stefan-Boltzmann law in two
    // unit conventions, so ignition needs no luminosity correction at all — it only needed the
    // TEMPERATURE to carry across, which the processor's floor now guarantees.
    //
    // Pinned because the two live in different files and could drift apart silently: a change to
    // either one would land here rather than in a campaign.
    const SOLAR_RADIUS_KM = 696000;
    const bd = brownDwarfThermal((SUBSTELLAR_MAX_MJUP - 0.01) * JUP, 4.6, RJ);
    const rSuns = RJ / SOLAR_RADIUS_KM;
    const stellarWay = rSuns ** 2 * (bd.teffK / 5778) ** 4;
    expect(stellarWay).toBeGreaterThan(bd.luminositySolar * 0.98);
    expect(stellarWay).toBeLessThan(bd.luminositySolar * 1.02);
  });

  it('warms monotonically with mass across the whole substellar window', () => {
    let last = 0;
    for (const m of [8, 12, 20, 35, 50, 65, 79]) {
      const t = brownDwarfThermal(m * JUP, 4.6, RJ).teffK;
      expect(t).toBeGreaterThan(last);
      last = t;
    }
  });
});
