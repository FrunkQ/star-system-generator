import { describe, it, expect } from 'vitest';
import { deriveGeoActivity, geothermalVigor, type GeoInputs } from './geoActivity';

const ROCK = { metal: 0.3, rock: 0.7, carbon: 0, ice: 0, gas: 0 };
const base: GeoInputs = {
  makeup: ROCK, massMe: 1, radiusRe: 1, ageGyr: 4.5,
  hasSurfaceWater: false, hasSubsurfaceOcean: false, tidalHotspots: false, tidalLavaFlows: false
};
const w = (p: Partial<GeoInputs>) => deriveGeoActivity({ ...base, ...p, makeup: p.makeup ?? base.makeup });

describe('geothermalVigor', () => {
  it('Earth today is the ≈1 reference', () => {
    expect(geothermalVigor(base)).toBeCloseTo(1, 1);
  });
  it('a young Earth is more vigorous; an old Earth less', () => {
    expect(geothermalVigor({ ...base, ageGyr: 1 })).toBeGreaterThan(2);
    expect(geothermalVigor({ ...base, ageGyr: 10 })).toBeLessThan(0.4);
  });
});

describe('deriveGeoActivity — reference worlds', () => {
  it('Earth: vigorous + surface water → plate tectonics', () => {
    expect(w({ hasSurfaceWater: true }).regime).toBe('plate-tectonics');
  });

  it('Venus: vigorous but dry → episodic (heat-trapping lid overturns catastrophically)', () => {
    const v = w({ massMe: 0.815, radiusRe: 0.95, hasSurfaceWater: false });
    expect(v.regime).toBe('episodic');
    expect(v.volcanism).toBe('resurfacing');
  });

  it('a cooler dry world (below the episodic onset) sits on a quiet stagnant lid', () => {
    // Dry, active, but not vigorous enough to trap heat to catastrophic overturn: vigor in [0.6, 0.7).
    const s = w({ massMe: 0.65, radiusRe: 0.9, hasSurfaceWater: false });
    expect(s.vigor).toBeGreaterThanOrEqual(0.6);
    expect(s.vigor).toBeLessThan(0.7);
    expect(s.regime).toBe('stagnant-lid');
  });

  it('a waning mid world (vigor 0.35–0.6) → plutonic (intrusive-only, no surface volcanism)', () => {
    // An aging Earth-clone past its plate-tectonic prime: still warm at depth, but the heat no longer
    // reaches the surface or mobilises the lid.
    const p = w({ hasSurfaceWater: true, ageGyr: 7 });
    expect(p.vigor).toBeGreaterThanOrEqual(0.35);
    expect(p.vigor).toBeLessThan(0.6);
    expect(p.regime).toBe('plutonic');
    expect(p.volcanism).toBe('intrusive');
    expect(p.active).toBe(true);
  });

  it('Mars: small + old → inactive (radiogenics decayed below threshold)', () => {
    const m = w({ massMe: 0.107, radiusRe: 0.532, ageGyr: 4.6 });
    expect(m.regime).toBe('inactive');
    expect(m.active).toBe(false);
  });

  it('Io: tidal silicate volcanism (rocky moon)', () => {
    const io = w({ massMe: 0.015, radiusRe: 0.28, makeup: ROCK, tidalLavaFlows: true });
    expect(io.regime).toBe('tidal-volcanic');
    expect(io.volcanism).toBe('silicate-tidal');
  });

  it('Europa: tidal + icy/subsurface ocean → cryovolcanic', () => {
    const eu = w({
      massMe: 0.008, radiusRe: 0.245, makeup: { metal: 0, rock: 0.5, carbon: 0, ice: 0.5, gas: 0 },
      tidalHotspots: true, hasSubsurfaceOcean: true
    });
    expect(eu.regime).toBe('cryovolcanic');
    expect(eu.volcanism).toBe('cryo');
  });

  it('Europa with a rock-inferred makeup still reads cryo via the icyShell signal', () => {
    // Europa's 3.01 g/cc infers as rock, hiding its ice — the frozen water shell carries the signal.
    const eu = w({
      massMe: 0.008, radiusRe: 0.245, makeup: ROCK, tidalHotspots: true, icyShell: true
    });
    expect(eu.regime).toBe('cryovolcanic');
  });

  it('a tiny tidally-stressed icy lump (Phobos/Deimos-like) is shredded, not cryovolcanic → inactive', () => {
    // Below the ~200 km round limit (radiusRe 0.0017 ≈ 11 km) a body can't differentiate or hold a
    // melt layer — strong tidal forcing shatters it rather than driving cryovolcanism.
    const phobos = w({
      massMe: 1.8e-9, radiusRe: 0.0017, makeup: { metal: 0, rock: 0.7, carbon: 0, ice: 0.3, gas: 0 },
      tidalHotspots: true, hasSubsurfaceOcean: true, icyShell: true
    });
    expect(phobos.regime).toBe('inactive');
  });
});

describe('deriveGeoActivity — age turns Earth into Mars', () => {
  it('an Earth-clone goes geologically dead by ~9 Gyr', () => {
    expect(w({ hasSurfaceWater: true, ageGyr: 4.5 }).regime).toBe('plate-tectonics');
    expect(w({ hasSurfaceWater: true, ageGyr: 9.5 }).regime).toBe('inactive');
  });

  it('tags are mechanism-specific and unique per regime', () => {
    expect(w({ hasSurfaceWater: true }).tags).toEqual(['geology/plate-tectonics']);
    expect(w({}).tags).toEqual(['geology/episodic']); // dry Earth-mass, vigor ≈ 1 → heat-trapping lid
  });
});
