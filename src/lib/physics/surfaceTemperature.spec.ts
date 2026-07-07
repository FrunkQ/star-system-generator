import { describe, it, expect } from 'vitest';
import { surfaceTempProfile } from './surfaceTemperature';

const sources = (p: ReturnType<typeof surfaceTempProfile>['profile']) => p.components.map((c) => c.source);

describe('surfaceTempProfile — decomposition by cause', () => {
  it('a thick-atmosphere ocean world (Earth-like) has modest swings', () => {
    const { profile } = surfaceTempProfile({ meanK: 288, equilibriumK: 255, pressureBar: 1, rotationHours: 24, eccentricity: 0.017, hasLiquidOcean: true });
    expect(sources(profile)).toContain('latitude');
    expect(sources(profile)).toContain('diurnal');
    expect(profile.totalMaxK - profile.totalMinK).toBeLessThan(120); // well-mixed → narrow
  });

  it('an airless slow rotator (Mercury-like) has huge day/night swings', () => {
    const { profile } = surfaceTempProfile({ meanK: 440, equilibriumK: 440, pressureBar: 0, rotationHours: 1400 });
    const diurnal = profile.components.find((c) => c.source === 'diurnal')!;
    expect(diurnal.highK - diurnal.lowK).toBeGreaterThan(300); // airless + slow → enormous
  });

  it('a tidally-locked world has day/night FACES, not a cycle', () => {
    const { profile } = surfaceTempProfile({ meanK: 300, equilibriumK: 300, pressureBar: 0.1, tidallyLocked: true });
    expect(sources(profile)).toContain('locked-day');
    expect(sources(profile)).toContain('locked-night');
    expect(sources(profile)).not.toContain('diurnal');
  });

  it('an Io-like moon shows a cold surface AND a hot tidal hotspot component', () => {
    const { profile, tags } = surfaceTempProfile({ meanK: 120, equilibriumK: 118, pressureBar: 0, rotationHours: 42, tidalRawIndex: 4000, iceFrac: 0 });
    const tidal = profile.components.find((c) => c.source === 'tidal-hotspot')!;
    expect(tidal).toBeTruthy();
    expect(tidal.highK).toBeGreaterThan(900);     // lava-hot vents
    expect(profile.totalMinK).toBeLessThan(120);  // cold night-side surface
    expect(tags.some((t) => t === 'tidal/volcanism' || t === 'tidal/lava-flows')).toBe(true);
  });

  it('totals bound every component', () => {
    const { profile } = surfaceTempProfile({ meanK: 250, equilibriumK: 250, pressureBar: 0.5, eccentricity: 0.2, obliquityDeg: 40 });
    for (const c of profile.components) {
      expect(c.lowK).toBeGreaterThanOrEqual(profile.totalMinK);
      expect(c.highK).toBeLessThanOrEqual(profile.totalMaxK);
    }
  });
});
