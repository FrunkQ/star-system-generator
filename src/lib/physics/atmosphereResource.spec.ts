import { describe, it, expect } from 'vitest';
import { atmosphereResourceTags } from './atmosphere';
import type { CelestialBody, GasPhysics } from '../types';

// Minimal gasPhysics with resourceTags (the real shape lives in atmospheres.json).
const gp = (resourceTags?: string[]): GasPhysics => ({
  molarMass: 0.03, shielding: 1, greenhouse: 0, specificHeat: 1, radiativeCooling: 0, colorHex: null,
  meltK: 0, boilK: 0, ...(resourceTags ? { resourceTags } : {})
}) as GasPhysics;

const PHYS: Record<string, GasPhysics> = {
  N2: gp(['resource/volatiles']),
  O2: gp(['resource/oxidizer']),
  Ar: gp(['resource/noble-gases']),
  Kr: gp(['resource/noble-gases']),
  CO2: gp(['resource/volatiles'])
};
const body = (composition: Record<string, number>): CelestialBody =>
  ({ id: 'b', name: 'B', kind: 'body', parentId: null, atmosphere: { name: 'a', composition } } as any);

describe('atmosphereResourceTags (gas → resource, with abundance)', () => {
  it('an Earth-like air confers oxidizer + noble-gases, with the gas fraction as abundance', () => {
    const tags = atmosphereResourceTags(body({ N2: 0.78, O2: 0.21, Ar: 0.009 }), PHYS);
    const byKey = Object.fromEntries(tags.map((t) => [t.key, t.value]));
    expect(byKey['resource/oxidizer']).toBe('0.2100');     // O2 21%
    expect(byKey['resource/noble-gases']).toBe('0.0090');  // trace argon → small abundance → slow extraction
    expect(byKey['resource/volatiles']).toBe('0.7800');    // N2
    expect(tags.every((t) => t.inherited)).toBe(true);
  });
  it('sums fractions of gases that map to the same resource', () => {
    const tags = atmosphereResourceTags(body({ Ar: 0.01, Kr: 0.02 }), PHYS);
    expect(tags.find((t) => t.key === 'resource/noble-gases')?.value).toBe('0.0300'); // 1% + 2%
  });
  it('no atmosphere / no gasPhysics → no tags', () => {
    expect(atmosphereResourceTags({ id: 'x', name: 'X', kind: 'body', parentId: null } as any, PHYS)).toEqual([]);
    expect(atmosphereResourceTags(body({ O2: 0.2 }), undefined)).toEqual([]);
  });
});
