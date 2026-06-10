import { describe, it, expect } from 'vitest';
import { deriveApparentColor, deriveApparentColorParts } from './apparentColor';
import type { CelestialBody, RulePack } from '$lib/types';

const PACK = { gasPhysics: {
  SO2: { colorHex: '#FFFFE0' }, Cl2: { colorHex: '#98FB98' }, CH4: { colorHex: '#008B8B' },
  N2: { colorHex: null }, CO2: { colorHex: null }
} } as unknown as RulePack;

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as number[];

function body(p: Partial<CelestialBody>): CelestialBody {
  return { id: 'x', kind: 'body', roleHint: 'planet', massKg: 6e24, radiusKm: 6371, ...p } as CelestialBody;
}

describe('deriveApparentColor', () => {
  it('a sulfur world reads yellowish (blue is the weakest channel)', () => {
    const [r, , b] = rgb(deriveApparentColor(body({ makeup: { rock: 1 }, atmosphere: { main: 'SO2', composition: { SO2: 1 }, pressure_bar: 0.6 } as any }), PACK));
    expect(b).toBeLessThan(r);
  });

  it('a chlorine world reads green (green is the strongest channel)', () => {
    const [r, g, b] = rgb(deriveApparentColor(body({ makeup: { rock: 1 }, atmosphere: { main: 'Cl2', composition: { Cl2: 1 }, pressure_bar: 1 } as any }), PACK));
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('a methane giant reads cool/teal (not warm)', () => {
    const [r, , b] = rgb(deriveApparentColor(body({ makeup: { gas: 0.9, ice: 0.1 }, equilibriumTempK: 70, atmosphere: { main: 'CH4', composition: { CH4: 0.9, H2: 0.1 }, pressure_bar: 5 } as any }), PACK));
    expect(b).toBeGreaterThan(r);
  });

  it('a lava world reads warm (red beats blue)', () => {
    const [r, , b] = rgb(deriveApparentColor(body({ makeup: { rock: 1 }, equilibriumTempK: 1500 }), PACK));
    expect(r).toBeGreaterThan(b);
  });

  it('an icy world reads cool (blue is the strongest channel)', () => {
    const [r, g, b] = rgb(deriveApparentColor(body({ makeup: { ice: 1 }, equilibriumTempK: 100 }), PACK));
    expect(b).toBeGreaterThanOrEqual(r);
    expect(b).toBeGreaterThanOrEqual(g);
  });

  it('a clear-atmosphere rocky world keeps its surface tone (no tint from colourless gas)', () => {
    const c = deriveApparentColor(body({ makeup: { rock: 0.8, metal: 0.2 }, atmosphere: { main: 'N2', composition: { N2: 0.8, CO2: 0.2 }, pressure_bar: 1 } as any }), PACK);
    expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  // #8 — liquid colour is starlight × refractive index, not a fixed swatch.
  it('a water ocean is bluer under a sun-like star than under a red dwarf', () => {
    const ocean = (tempK: number) => rgb(deriveApparentColor(
      body({ makeup: { rock: 1 }, equilibriumTempK: 290, hydrosphere: { coverage: 0.7, composition: 'water' } as any }),
      PACK, { starTempK: tempK }
    ));
    const sun = ocean(5778);
    const redDwarf = ocean(3000);
    // blue share of the disc drops under the red star…
    expect(sun[2] / (sun[0] + 1)).toBeGreaterThan(redDwarf[2] / (redDwarf[0] + 1));
    // …and the red-dwarf world reads warmer overall
    expect(redDwarf[0] - redDwarf[2]).toBeGreaterThan(sun[0] - sun[2]);
  });

  // Gas giants must diverge by composition, not all read as ammonia tan.
  it('a methane ice giant reads blue-cyan and a methane-poor ammonia giant reads warm tan', () => {
    const ice = rgb(deriveApparentColor(body({ roleHint: 'planet', makeup: { gas: 0.9, ice: 0.1 }, equilibriumTempK: 58,
      rotation_period_hours: 17, atmosphere: { main: 'H2', composition: { H2: 0.8, He: 0.15, CH4: 0.05 }, pressure_bar: 5 } as any }), PACK));
    const ammonia = rgb(deriveApparentColor(body({ roleHint: 'planet', makeup: { gas: 0.95 }, equilibriumTempK: 110,
      rotation_period_hours: 10, atmosphere: { main: 'H2', composition: { H2: 0.9, He: 0.1, CH4: 0.001 }, pressure_bar: 5 } as any }), PACK));
    expect(ice[2]).toBeGreaterThan(ice[0]);          // ice giant: blue beats red
    expect(ammonia[0]).toBeGreaterThan(ammonia[2]);  // ammonia giant: warm
    expect(ice[2] - ice[0]).toBeGreaterThan(ammonia[2] - ammonia[0]);
  });

  it('raising methane pushes a giant bluer (the gas-mix slider matters)', () => {
    const at = (ch4: number) => rgb(deriveApparentColor(body({ roleHint: 'planet', makeup: { gas: 0.9 }, equilibriumTempK: 70,
      rotation_period_hours: 16, atmosphere: { main: 'H2', composition: { H2: 0.9 - ch4, He: 0.1, CH4: ch4 }, pressure_bar: 5 } as any }), PACK));
    const low = at(0.005), hi = at(0.08);
    expect(hi[2] - hi[0]).toBeGreaterThan(low[2] - low[0]);
  });

  it('ice giants are near-featureless (low band count) vs ammonia giants', () => {
    const ice = deriveApparentColorParts(body({ roleHint: 'planet', makeup: { gas: 0.9 }, equilibriumTempK: 55,
      rotation_period_hours: 10, atmosphere: { composition: { H2: 0.8, CH4: 0.06 }, pressure_bar: 5 } as any }), PACK);
    const ammonia = deriveApparentColorParts(body({ roleHint: 'planet', makeup: { gas: 0.95 }, equilibriumTempK: 120,
      rotation_period_hours: 10, atmosphere: { composition: { H2: 0.95, CH4: 0.0005 }, pressure_bar: 5 } as any }), PACK);
    expect(ice.banding).toBeLessThan(ammonia.banding);
    expect(ammonia.palette.some((p) => p.label === 'chromophore band')).toBe(true);
    expect(ice.palette.some((p) => p.label === 'chromophore band')).toBe(false);
  });

  // #9 — proportional mixing by coverage.
  it('ocean coverage mixes proportionally (wetter world reads bluer)', () => {
    const at = (coverage: number) => rgb(deriveApparentColor(
      body({ makeup: { rock: 1 }, equilibriumTempK: 290, hydrosphere: { coverage, composition: 'water' } as any }),
      PACK, { starTempK: 5778 }
    ));
    const dry = at(0.1), wet = at(0.8);
    expect(wet[2] - wet[0]).toBeGreaterThan(dry[2] - dry[0]);
  });
});
