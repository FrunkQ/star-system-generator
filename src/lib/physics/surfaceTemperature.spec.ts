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

  it('a STAR-locked world has permanent day/night FACES, not a cycle', () => {
    const { profile } = surfaceTempProfile({ meanK: 300, equilibriumK: 300, pressureBar: 0.1, tidallyLocked: true, starTidallyLocked: true });
    expect(sources(profile)).toContain('locked-day');
    expect(sources(profile)).toContain('locked-night');
    expect(sources(profile)).not.toContain('diurnal');
  });

  it('a MOON locked to its PLANET still has a (slow) day/night cycle, not permanent faces', () => {
    // Locked to a planet (not the star), so it turns relative to the sun once per orbit → a big but
    // NOT permanent swing. No locked-day/night faces.
    const { profile } = surfaceTempProfile({ meanK: 300, equilibriumK: 300, pressureBar: 0.1, tidallyLocked: true, starTidallyLocked: false, orbitalPeriodHours: 655 });
    expect(sources(profile)).toContain('diurnal');
    expect(sources(profile)).not.toContain('locked-day');
  });

  it('an Io-like moon shows a cold surface AND a hot tidal hotspot component', () => {
    const { profile, tags } = surfaceTempProfile({ meanK: 120, equilibriumK: 118, pressureBar: 0, rotationHours: 42, tidalRawIndex: 4000, iceFrac: 0 });
    const tidal = profile.components.find((c) => c.source === 'tidal-hotspot')!;
    expect(tidal).toBeTruthy();
    expect(tidal.highK).toBeGreaterThan(900);     // lava-hot vents
    expect(profile.totalMinK).toBeLessThan(120);  // cold night-side surface
    expect(tags.some((t) => t === 'tidal/volcanism' || t === 'tidal/lava-flows')).toBe(true);
  });

  it('a captured spin-orbit resonance is NOT a permanent face', () => {
    // Mercury is flagged star-locked, but `lockedSpin` keeps its measured 3:2 period rather than
    // claiming synchrony — so its sun still rises, every 176 days, and it gets a cycle not two faces.
    const { profile } = surfaceTempProfile({
      meanK: 440, equilibriumK: 440, equilibriumMaxK: 491, pressureBar: 0,
      rotationHours: 1407.6, orbitalPeriodHours: 2111, tidallyLocked: true, starTidallyLocked: true
    });
    expect(sources(profile)).toContain('diurnal');
    expect(sources(profile)).not.toContain('locked-day');
  });

  it('totals bound every component', () => {
    const { profile } = surfaceTempProfile({ meanK: 250, equilibriumK: 250, pressureBar: 0.5, eccentricity: 0.2, obliquityDeg: 40 });
    for (const c of profile.components) {
      expect(c.lowK).toBeGreaterThanOrEqual(profile.totalMinK);
      expect(c.highK).toBeLessThanOrEqual(profile.totalMaxK);
    }
  });
});

// The day/night pair is an ENERGY BALANCE and the mean falls out of it (inbox B63). These pin the
// three symptoms that were one fault: day unbounded, night unbounded, and an equilibrium figure
// published as a mean.
describe('surfaceTempProfile — day/night from energy balance', () => {
  // Luna: airless, 27-day solar day, bond albedo 0.11 at 1 AU.
  const luna = () => surfaceTempProfile({
    meanK: 270.3, equilibriumK: 270.3, equilibriumMaxK: 272.6, pressureBar: 0,
    rotationHours: 659, orbitalPeriodHours: 659, tidallyLocked: true, obliquityDeg: 6.68, eccentricity: 0.0167
  }).profile;

  it('the sunlit side cannot exceed its LOCAL equilibrium temperature', () => {
    const day = luna().components.find((c) => c.source === 'diurnal')!;
    // (S(1−A)/σ)^¼ = √2 · Teq at closest approach = 386 K. Measured lunar noon is about 393 K, which
    // the bound under-reads by design: it uses the BOND albedo and unit emissivity.
    expect(day.highK).toBeLessThanOrEqual(Math.round(272.6 * Math.SQRT2));
    expect(day.highK).toBeGreaterThan(360);
  });

  it('the night side asymptotes to a floor rather than falling through it', () => {
    const night = luna().components.find((c) => c.source === 'diurnal')!;
    expect(night.lowK).toBeGreaterThan(80);   // measured lunar equatorial night is about 100 K
    expect(night.lowK).toBeLessThan(130);
  });

  it('the MEAN falls out of the two sides, and sits well below the equilibrium temperature', () => {
    // Teq is a power balance, not a mean: radiated power goes as T⁴, so a body with a big swing
    // averages far below it. Diviner puts the lunar equatorial average near 215 K against Teq 270.
    expect(luna().meanK).toBeGreaterThan(195);
    expect(luna().meanK).toBeLessThan(235);
  });

  it('a well-mixed world keeps its equilibrium temperature as its mean, and barely swings', () => {
    // Venus: 92 bar. The mean must NOT move — the T⁴ penalty is zero when there is nothing to average
    // over — and the day/night term must vanish entirely.
    const { profile } = surfaceTempProfile({
      meanK: 753.6, equilibriumK: 230, equilibriumMaxK: 230.8, pressureBar: 92,
      rotationHours: -5832.5, orbitalPeriodHours: 5392, obliquityDeg: 177.36, eccentricity: 0.0068,
      composeSurfaceAt: (teq) => teq + 523.6
    });
    expect(profile.meanK).toBe(754);
    expect(sources(profile)).not.toContain('diurnal');
  });

  it('two slow rotators with different day lengths no longer land on the same answer', () => {
    // The old rotFactor clamped at 2.5, so Ganymede (172 h) and Callisto (400 h) came out identical
    // to the kelvin. Rotation now enters through the thermal parameter, which does not clamp.
    const at = (dayHours: number) => surfaceTempProfile({
      meanK: 95.9, equilibriumK: 95.9, equilibriumMaxK: 98.3, pressureBar: 0,
      rotationHours: dayHours, orbitalPeriodHours: dayHours, tidallyLocked: true
    }).profile.components.find((c) => c.source === 'diurnal')!;
    expect(at(400).lowK).toBeLessThan(at(172).lowK - 2);   // the longer night gets colder
  });
});
