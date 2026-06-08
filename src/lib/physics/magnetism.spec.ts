import { describe, it, expect } from 'vitest';
import { deriveMagnetism } from './magnetism';
import type { CelestialBody, FluidLayer } from '$lib/types';
import { EARTH_MASS_KG } from '$lib/constants';

function body(p: Partial<CelestialBody> & { layers?: FluidLayer[] }): CelestialBody {
  const { layers, ...rest } = p;
  return {
    id: 'x', kind: 'body', roleHint: 'planet',
    hydrosphere: layers ? { layers } : undefined,
    ...rest
  } as CelestialBody;
}
const Me = (n: number) => n * EARTH_MASS_KG;

describe('deriveMagnetism', () => {
  it('Earth: molten iron core + 24 h spin → intrinsic dipolar field ~0.1–0.7 G', () => {
    const m = deriveMagnetism(body({
      massKg: Me(1), rotation_period_hours: 24, makeup: { metal: 0.32, rock: 0.68 },
      layers: [{ liquid: 'liquid-iron', location: 'interior', conductive: true }]
    }));
    expect(m.source).toBe('iron-core');
    expect(m.geometry).toBe('dipolar');
    expect(m.intrinsic).toBe(true);
    expect(m.estimatedRangeGauss.max).toBeGreaterThan(0.2);
  });

  it('Venus: molten core but ~5832 h spin → suppressed, effectively unshielded', () => {
    const m = deriveMagnetism(body({
      massKg: Me(0.82), rotation_period_hours: 5832, makeup: { metal: 0.3, rock: 0.7 },
      layers: [{ liquid: 'liquid-iron', location: 'interior', conductive: true }]
    }));
    expect(m.source).toBe('suppressed');
    expect(m.intrinsic).toBe(false);
    expect(m.estimatedRangeGauss.max).toBeLessThan(0.01);
  });

  it('Jupiter: metallic-hydrogen envelope → strong dipolar field', () => {
    const m = deriveMagnetism(body({
      massKg: Me(318), rotation_period_hours: 10, makeup: { gas: 0.9, ice: 0.1 },
      layers: [{ liquid: 'metallic-hydrogen', location: 'interior', conductive: true }]
    }));
    expect(m.source).toBe('metallic-hydrogen');
    expect(m.geometry).toBe('dipolar');
    expect(m.estimatedRangeGauss.max).toBeGreaterThan(5);
  });

  it('Neptune: superionic-water mantle → tilted/off-centre field', () => {
    const m = deriveMagnetism(body({
      massKg: Me(17), rotation_period_hours: 16, makeup: { gas: 0.6, ice: 0.4 },
      layers: [{ liquid: 'superionic-water', location: 'interior', conductive: true }]
    }));
    expect(m.source).toBe('superionic-water');
    expect(m.geometry).toBe('off-centre');
    expect(m.intrinsic).toBe(true);
  });

  it('Europa: salty subsurface ocean inside Jupiter\'s magnetosphere → induced field', () => {
    const m = deriveMagnetism(body({
      massKg: Me(0.008), rotation_period_hours: 85, roleHint: 'moon',
      makeup: { rock: 0.5, ice: 0.5 },
      layers: [{ liquid: 'salty-water', location: 'subsurface', conductive: true }]
    }), { insideHostMagnetosphere: true });
    expect(m.source).toBe('salty-ocean-induced');
    expect(m.geometry).toBe('induced');
    expect(m.intrinsic).toBe(false);
  });

  it('the same icy moon WITHOUT a host magnetosphere has no field', () => {
    const m = deriveMagnetism(body({
      massKg: Me(0.008), rotation_period_hours: 85, makeup: { rock: 0.5, ice: 0.5 },
      layers: [{ liquid: 'salty-water', location: 'subsurface', conductive: true }]
    }), { insideHostMagnetosphere: false });
    expect(m.source).toBe('none');
  });

  it('a carbon-rich world damps its iron dynamo → suppressed/weak', () => {
    const m = deriveMagnetism(body({
      massKg: Me(1.5), rotation_period_hours: 24, makeup: { carbon: 0.5, metal: 0.2, rock: 0.3 },
      layers: [{ liquid: 'liquid-iron', location: 'interior', conductive: true }]
    }));
    expect(m.source).toBe('suppressed');
    expect(m.estimatedRangeGauss.max).toBeLessThan(0.1);
  });
});
