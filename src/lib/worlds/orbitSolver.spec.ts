// FIT A WORLD TO A CONDITION - the gates (G87).
//
// Absolute, in AU and kelvin (PHY-34). The anchor is Earth, used the way the standing rules allow:
// as a CALIBRATION ANCHOR to prove the law, never as a target the model is tuned toward. Nothing in
// the module under test contains 288, 255 or 1 AU.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import {
  orbitForTemperature,
  temperatureAtOrbit,
  orbitBandForTemperatures,
  orbitBandForSolvent,
  fitOrbit,
  minimumOrbitAU,
  starFit,
  NOMINAL_BOND_ALBEDO
} from './orbitSolver';

const SUN = { temperatureK: 5778, radiusKm: 696340 };
const M_DWARF = { temperatureK: 3050, radiusKm: 0.2 * 696340 };
const liquids = JSON.parse(fs.readFileSync('src/lib/data/liquids.json', 'utf8')) as any[];
const solvent = (name: string) => liquids.find((l) => l.name === name);

describe('the law, against a body nobody tuned it to', () => {
  it("EARTH: 255 K around the Sun is 1.00 AU", () => {
    // Earth's equilibrium temperature is 255 K at a bond albedo of 0.3. If this drifts, the law has.
    expect(orbitForTemperature(SUN, 255)!).toBeCloseTo(1.0, 2);
  });

  it('and it round-trips: the temperature at that orbit is the temperature asked for', () => {
    for (const t of [90, 150, 255, 400, 900]) {
      const a = orbitForTemperature(SUN, t)!;
      expect(temperatureAtOrbit(SUN, a)!).toBeCloseTo(t, 6);
    }
  });

  it('MARS: 210 K is about 1.5 AU, which nothing here was fitted to either', () => {
    expect(orbitForTemperature(SUN, 210)!).toBeGreaterThan(1.4);
    expect(orbitForTemperature(SUN, 210)!).toBeLessThan(1.6);
  });

  it('refuses rather than guessing when the star cannot answer', () => {
    expect(orbitForTemperature({ temperatureK: 0, radiusKm: 696340 }, 255)).toBeNull();
    expect(orbitForTemperature({ temperatureK: 5778, radiusKm: 0 }, 255)).toBeNull();
    expect(orbitForTemperature(SUN, 0)).toBeNull();
    expect(starFit({ temperatureK: undefined, radiusKm: 1 } as any)).toBeNull();
  });
});

describe('a temperature RANGE inverts into an orbit band', () => {
  it('THE HOTTEST END GIVES THE INNERMOST ORBIT - the obvious mistake, gated', () => {
    const band = orbitBandForTemperatures(SUN, 250, 320)!;
    expect(band.innerAU).toBeLessThan(band.outerAU);
    // 320 K is the hot end, so it must be the INNER edge.
    expect(band.innerAU).toBeCloseTo(orbitForTemperature(SUN, 320)!, 9);
    expect(band.outerAU).toBeCloseTo(orbitForTemperature(SUN, 250)!, 9);
  });

  it('argument order does not matter', () => {
    const a = orbitBandForTemperatures(SUN, 250, 320)!;
    const b = orbitBandForTemperatures(SUN, 320, 250)!;
    expect(a).toEqual(b);
  });

  it('every orbit inside the band really does meet the condition', () => {
    const band = orbitBandForTemperatures(SUN, 250, 320)!;
    for (let f = 0; f <= 1; f += 0.1) {
      const a = band.innerAU + (band.outerAU - band.innerAU) * f;
      const t = temperatureAtOrbit(SUN, a)!;
      expect(t).toBeGreaterThanOrEqual(250 - 1e-6);
      expect(t).toBeLessThanOrEqual(320 + 1e-6);
    }
  });
});

describe('the alien-habitat door: a solvent, not an assumption', () => {
  it('WATER IS NOT PRIVILEGED - ammonia and methane are reached the same way', () => {
    const water = orbitBandForSolvent(SUN, solvent('water'))!;
    const ammonia = orbitBandForSolvent(SUN, solvent('ammonia'))!;
    const methane = orbitBandForSolvent(SUN, solvent('methane'))!;
    // Colder solvents live further out, in the order their melting points say.
    expect(ammonia.innerAU).toBeGreaterThan(water.innerAU);
    expect(methane.innerAU).toBeGreaterThan(ammonia.innerAU);
  });

  it("WATER'S BARE BAND DOES NOT REACH EARTH, and that is the model being honest", () => {
    // 0.47-0.87 AU around the Sun. Earth sits at 1.0 and is OUTSIDE it - because Earth's own
    // equilibrium temperature is 255 K, below water's 273 K melting point, and it is only wet at all
    // thanks to a 33 K greenhouse this solver deliberately does not add. So the band is TIGHTER and
    // CLOSER IN than the habitable zone anybody quotes, and a caller fitting a world to liquid water
    // is fitting it to water WITHOUT an atmosphere's help. The owner's own words the same day: "you
    // need an atmo before the goldilocks zone works."
    const band = orbitBandForSolvent(SUN, solvent('water'))!;
    expect(band.innerAU).toBeCloseTo(0.467, 2);
    expect(band.outerAU).toBeCloseTo(0.872, 2);
    expect(band.outerAU).toBeLessThan(1);
  });

  it('methane around the Sun lands out past Jupiter, not where Earth is', () => {
    // 5.2-7.9 AU: Titan territory, and nowhere near the inner system.
    const band = orbitBandForSolvent(SUN, solvent('methane'))!;
    expect(band.innerAU).toBeGreaterThan(5);
    expect(band.outerAU).toBeLessThan(9);
  });

  it('EVERY shipped solvent yields a band, so no biochemistry is a special case', () => {
    for (const l of liquids) {
      if (!(l.meltK > 0 && l.boilK > 0)) continue;
      const band = orbitBandForSolvent(SUN, l);
      expect(band, l.name).toBeTruthy();
      expect(band!.innerAU, l.name).toBeGreaterThan(0);
      expect(band!.outerAU, l.name).toBeGreaterThanOrEqual(band!.innerAU);
    }
  });

  it('a solvent with no melting or boiling point is refused, not guessed', () => {
    expect(orbitBandForSolvent(SUN, { meltK: 0, boilK: 373 } as any)).toBeNull();
  });
});

describe('the star matters, which is the whole point', () => {
  it('the same condition sits far closer to a dim star', () => {
    const sun = fitOrbit(SUN, { kind: 'solvent', liquid: solvent('water') })!;
    const dwarf = fitOrbit(M_DWARF, { kind: 'solvent', liquid: solvent('water') })!;
    expect(dwarf.orbitAU).toBeLessThan(sun.orbitAU / 10);
    // ...and both really do reach a water temperature, which a spectral-class table could not promise.
    for (const f of [sun, dwarf]) {
      expect(f.temperatureK).toBeGreaterThan(solvent('water').meltK);
      expect(f.temperatureK).toBeLessThan(solvent('water').boilK);
    }
  });
});

describe('fitOrbit - one call, and it says what it did', () => {
  it('a single temperature gives that temperature', () => {
    const fit = fitOrbit(SUN, { kind: 'temperature', targetK: 288 })!;
    expect(fit.temperatureK).toBeCloseTo(288, 6);
    expect(fit.reason).toMatch(/288 K/);
  });

  it('a range gives the GEOMETRIC middle, because the law is a power law', () => {
    const fit = fitOrbit(SUN, { kind: 'temperature-range', lowK: 250, highK: 320 })!;
    expect(fit.orbitAU).toBeCloseTo(Math.sqrt(fit.band.innerAU * fit.band.outerAU), 9);
    // The temperature at the geometric middle is the geometric middle of the temperatures.
    expect(fit.temperatureK).toBeCloseTo(Math.sqrt(250 * 320), 4);
  });

  it('NOTHING IS PLACED INSIDE THE STAR: a scorching target is held at the floor and SAYS so', () => {
    const fit = fitOrbit(SUN, { kind: 'temperature', targetK: 4000 })!;
    expect(fit.clampedToFloor).toBe(true);
    expect(fit.orbitAU).toBeCloseTo(minimumOrbitAU(SUN), 9);
    expect(fit.reason).toMatch(/closer to the star than anything survives/);
    // ...and the reported temperature is the one it ACTUALLY gets, not the one asked for.
    expect(fit.temperatureK).toBeLessThan(4000);
  });

  it('names the solvent in its reason, so a GM can read why the world is there', () => {
    const fit = fitOrbit(SUN, { kind: 'solvent', liquid: solvent('ammonia') })!;
    expect(fit.reason).toMatch(/liquid/i);
    expect(fit.reason).toMatch(/Ammonia/i);
  });

  it('a brighter albedo moves the fit outward, and the default is only a default', () => {
    const dark = fitOrbit(SUN, { kind: 'temperature', targetK: 255 }, 0.05)!;
    const bright = fitOrbit(SUN, { kind: 'temperature', targetK: 255 }, 0.6)!;
    expect(dark.orbitAU).toBeGreaterThan(bright.orbitAU);
    // HOW MUCH IT MATTERS, PINNED, because the module's own note once got this wrong by a factor of
    // three. The orbit goes as sqrt(1 - A): across the whole conceivable 0.05-0.6 span the answer
    // moves about 54 per cent, and across the 0.2-0.4 an ordinary rocky world spans, about 15.
    expect(dark.orbitAU / bright.orbitAU).toBeCloseTo(1.54, 1);
    const rocky = fitOrbit(SUN, { kind: 'temperature', targetK: 255 }, 0.2)!.orbitAU
      / fitOrbit(SUN, { kind: 'temperature', targetK: 255 }, 0.4)!.orbitAU;
    expect(rocky).toBeCloseTo(1.15, 1);
    expect(NOMINAL_BOND_ALBEDO).toBeGreaterThan(0);
  });
});

describe('no Earth baseline lives in this module', () => {
  it('the source contains no 288, no 255 and no hardcoded 1 AU', () => {
    const src = fs.readFileSync('src/lib/worlds/orbitSolver.ts', 'utf8');
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
    expect(code).not.toMatch(/\b288\b/);
    expect(code).not.toMatch(/\b255\b/);
    expect(code).not.toMatch(/habitable[ _]?zone/i);
  });
});
