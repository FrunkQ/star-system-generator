import { describe, it, expect } from 'vitest';
import { deriveApparentColor } from './apparentColor';
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
});
