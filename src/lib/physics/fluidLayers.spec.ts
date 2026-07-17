import { describe, it, expect } from 'vitest';
import { deriveFluidLayers } from './fluidLayers';
import type { CelestialBody } from '$lib/types';

// Liquids L2: pressure-aware surface-liquid derivation. The layer is the honest signal the
// classifier and displays read, so these guard the "no ocean on a hot/airless world" fix.
const body = (over: Partial<CelestialBody>): CelestialBody => ({
  id: 'b', name: 'T', kind: 'body', roleHint: 'planet', parentId: 's',
  makeup: { rock: 0.7, metal: 0.3 }, ...over
} as CelestialBody);

const hasSurface = (b: CelestialBody) => deriveFluidLayers(b).some((l) => l.location === 'surface');

describe('deriveFluidLayers — surface liquid is pressure-aware', () => {
  it('Earth: water ocean at 288 K / 1 bar', () => {
    expect(hasSurface(body({
      temperatureK: 288, atmosphere: { pressure_bar: 1 } as any,
      hydrosphere: { coverage: 0.7, composition: 'water' }
    }))).toBe(true);
  });

  it('a HOT world with stale water coverage grows NO surface ocean (the reported bug)', () => {
    expect(hasSurface(body({
      temperatureK: 450, atmosphere: { pressure_bar: 1 } as any,
      hydrosphere: { coverage: 0.7, composition: 'water' }
    }))).toBe(false);
  });

  it('but a 100-bar atmosphere keeps that 450 K ocean liquid (boiling rises with pressure)', () => {
    expect(hasSurface(body({
      temperatureK: 450, atmosphere: { pressure_bar: 100 } as any,
      hydrosphere: { coverage: 0.7, composition: 'water' }
    }))).toBe(true);
  });

  it('an airless warm world below the triple point sublimates — no ocean', () => {
    expect(hasSurface(body({
      temperatureK: 280, atmosphere: { pressure_bar: 0.004 } as any,
      hydrosphere: { coverage: 0.5, composition: 'water' }
    }))).toBe(false);
  });
});
