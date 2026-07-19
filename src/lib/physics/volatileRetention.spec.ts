import { describe, it, expect } from 'vitest';
import { deriveVolatileRetention, type VolatileRetentionInputs } from './volatileRetention';

// Real solar-system bodies (mass kg, radius km, mean surface T, equilibrium T) + availability: icy
// moons/KBOs are ice-bearing; Io is a desiccated volcanic world (SO2 source, no water); Luna is dry
// rock; Earth has a hydrosphere. The model must reproduce which volatile ices each actually keeps.
const bodies: Record<string, VolatileRetentionInputs> = {
  Pluto:    { massKg: 1.303e22, radiusKm: 1188, surfaceTempK: 40, equilibriumTempK: 44, iceBearing: true, volcanic: false },
  Triton:   { massKg: 2.139e22, radiusKm: 1353, surfaceTempK: 38, equilibriumTempK: 38, iceBearing: true, volcanic: false },
  Callisto: { massKg: 1.076e23, radiusKm: 2410, surfaceTempK: 134, equilibriumTempK: 134, iceBearing: true, volcanic: false },
  Io:       { massKg: 8.932e22, radiusKm: 1821, surfaceTempK: 110, equilibriumTempK: 110, iceBearing: false, volcanic: true },
  Luna:     { massKg: 7.342e22, radiusKm: 1737, surfaceTempK: 270, equilibriumTempK: 270, iceBearing: false, volcanic: false },
  Earth:    { massKg: 5.972e24, radiusKm: 6371, surfaceTempK: 288, equilibriumTempK: 255, iceBearing: true, volcanic: false }
};
const R = (n: string) => deriveVolatileRetention(bodies[n]);

describe('volatile-ice retention — solar-system anchors', () => {
  it('Pluto keeps nitrogen and methane ice (cold + heavy enough to hold the vapour)', () => {
    const r = R('Pluto').retained;
    expect(r).toContain('nitrogen');
    expect(r).toContain('methane');
  });

  it('Triton keeps nitrogen and methane too', () => {
    const r = R('Triton').retained;
    expect(r).toContain('nitrogen');
    expect(r).toContain('methane');
  });

  it('Callisto keeps water ice but NOT the light volatiles (too warm for N2/CH4)', () => {
    const r = R('Callisto').retained;
    expect(r).toContain('water');
    expect(r).not.toContain('nitrogen');
    expect(r).not.toContain('methane');
  });

  it('Io keeps SO2 frost but NO water — it is a desiccated volcanic world (availability gate)', () => {
    const r = R('Io').retained;
    expect(r).toContain('sulfur-dioxide');
    expect(r).not.toContain('water');
    expect(r).not.toContain('carbon-dioxide');
  });

  it('Luna keeps nothing at the resolution we model (globally too warm / too light to hold vapour)', () => {
    expect(R('Luna').retained).toEqual([]);
  });

  it('Earth keeps no exotic ices — warm surface; its water is liquid, handled by the hydrosphere', () => {
    const r = R('Earth').retained;
    expect(r).not.toContain('nitrogen');
    expect(r).not.toContain('carbon-dioxide');
    expect(r).not.toContain('water'); // mean surface 288 K > 273 K melt → not a solid-ice world
  });

  it('the retained list is ordered most-secure (highest λ) first', () => {
    const p = R('Pluto');
    for (let k = 1; k < p.retained.length; k++) {
      expect(p.lambda[p.retained[k - 1]]).toBeGreaterThanOrEqual(p.lambda[p.retained[k]]);
    }
  });
});
