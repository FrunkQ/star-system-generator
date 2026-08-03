// Real-sky import — cluster-gate tests. The two calibration cases are the
// ones the design was argued from: S2 around Sgr A* (16-year period at
// 970 AU — a system) and a bound red-dwarf pair 0.25 ly apart (a ~million-
// year period — a static starmap, the case pure density gets wrong).
import { describe, expect, it } from 'vitest';
import { SOLAR_MASS_KG } from './constants.mjs';
import {
  DENSITY_TRIPWIRE_LY, WATCHABLE_TDYN_YR, dynamicalTimeYr, enclosedMassKg,
  gateDecision, meanSeparationLy, periodTier, periodYr, tripwire
} from './clusterGate.mjs';

const SGR_A_MSUN = 4.3e6;

describe('periodYr — the calibration cases', () => {
  it('S2 around Sgr A*: ~970 AU, 4.3 million solar masses → ~16 years', () => {
    const p = periodYr(970, SGR_A_MSUN * SOLAR_MASS_KG);
    expect(p).toBeGreaterThan(13);
    expect(p).toBeLessThan(19);
  });

  it('a bound red-dwarf pair 0.25 ly apart → of order a million years', () => {
    const p = periodYr(0.25 * 63241, 0.3 * SOLAR_MASS_KG);
    expect(p).toBeGreaterThan(500_000);
    expect(p).toBeLessThan(5_000_000);
  });

  it('the Earth check: 1 AU around 1 solar mass is 1 year', () => {
    expect(periodYr(1, SOLAR_MASS_KG)).toBeCloseTo(1, 2);
  });
});

describe('periodTier', () => {
  it('assigns the three design tiers', () => {
    expect(periodTier(16)).toBe('watchable');
    expect(periodTier(WATCHABLE_TDYN_YR)).toBe('watchable');
    expect(periodTier(547_000)).toBe('author-orbit'); // Proxima around AB stays authored
    expect(periodTier(2_000_000)).toBe('static');
  });
});

describe('tripwire (stage 1 — decides to EVALUATE, never to offer)', () => {
  it('fires on identity regardless of density', () => {
    const t = tripwire({ nStars: 3, radiusLy: 10, centreOtype: 'GlC' });
    expect(t.fired).toBe(true);
    expect(t.reason).toBe('identity');
  });

  it('fires on density and reports the separation', () => {
    // 1000 stars in 1 ly → separation far below the tripwire.
    const t = tripwire({ nStars: 1000, radiusLy: 1 });
    expect(t.fired).toBe(true);
    expect(t.reason).toBe('density');
  });

  it('stays quiet for the solar neighbourhood', () => {
    // ~40 systems within 13 ly: mean separation ~4 ly.
    expect(meanSeparationLy(40, 13)).toBeGreaterThan(DENSITY_TRIPWIRE_LY);
    expect(tripwire({ nStars: 40, radiusLy: 13 }).fired).toBe(false);
  });
});

describe('gateDecision (stage 2 — mass decides)', () => {
  it('the S-star cluster imports as a system', () => {
    // ~40 bright S-stars inside ~0.02 ly of a 4.3e6 Msun black hole.
    const d = gateDecision({
      nStars: 40, radiusLy: 0.02,
      massKgEnclosed: enclosedMassKg({ nStars: 40, meanStellarMassMsun: 10, centralMassMsun: SGR_A_MSUN })
    });
    expect(d.tripwire.fired).toBe(true);
    expect(d.offer).toBe('system');
    expect(d.tDynYr).toBeLessThan(WATCHABLE_TDYN_YR);
  });

  it('a dense but stellar-mass-only knot is crowded scenery, not a system', () => {
    // 100 red dwarfs in a 0.5 ly ball: separation trips the wire, but the
    // dynamical time is glacial — the case density alone gets wrong.
    const d = gateDecision({
      nStars: 100, radiusLy: 0.5,
      massKgEnclosed: enclosedMassKg({ nStars: 100, meanStellarMassMsun: 0.3 })
    });
    expect(d.tripwire.fired).toBe(true);
    expect(d.offer).toBe('starmap-crowded');
    expect(d.tDynYr).toBeGreaterThan(WATCHABLE_TDYN_YR);
  });

  it('the ordinary neighbourhood takes the ordinary path', () => {
    const d = gateDecision({
      nStars: 40, radiusLy: 13,
      massKgEnclosed: enclosedMassKg({ nStars: 40 })
    });
    expect(d.offer).toBe('starmap');
  });

  it('dynamicalTimeYr and periodYr agree at the region scale', () => {
    const m = enclosedMassKg({ nStars: 10, meanStellarMassMsun: 1 });
    expect(dynamicalTimeYr(0.01, m)).toBeCloseTo(periodYr(0.01 * 63241.077, m), 6);
  });
});
