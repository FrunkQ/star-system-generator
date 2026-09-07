// G53 phase 1: the NUMBERS out of derive() and shape(), pinned against external anchors. This file
// is why §5b.3 made them pure: the pane cannot verify a canvas at all (E7 — document.hidden, rAF
// never fires), so if this maths lived inside geometry construction no agent could ever gate a
// ringworld's dimensions. Here they are ordinary headless assertions.
//
// Anchors are OUTSIDE the code under test wherever one exists: Earth's tether requirement is the
// literature figure the owner quoted ("about 50 GPa·cm³/g — steel is 2, carbon nanotube is around
// 50"); the ringworld headline is Niven's (a 1 AU band 1.6 million km wide ≈ three million Earths
// of living area). Check against every anchor; fit to none of them.
import { describe, it, expect } from 'vitest';
import type { CelestialBody } from '$lib/types';
import { megaTypeDef, defaultMegaParams, type MegaTypeDef } from './megaTypes';
import { AU_KM, EARTH_GRAVITY, G } from '$lib/constants';

const earth = (over: Partial<CelestialBody> = {}): CelestialBody =>
  ({
    id: 'earth', name: 'Earth', parentId: 'sol', tags: [],
    kind: 'body', roleHint: 'planet',
    massKg: 5.972e24, radiusKm: 6371, rotation_period_hours: 23.934,
    orbitalBoundaries: {
      minLeoKm: 200, leoMoeBoundaryKm: 2000, meoHeoBoundaryKm: 50000,
      heoUpperBoundaryKm: 1.47e6, geoStationaryKm: 35786, isGeoFallback: false
    },
    ...over
  }) as CelestialBody;

const sol = (): CelestialBody =>
  ({
    id: 'sol', name: 'Sol', parentId: null, tags: [],
    kind: 'body', roleHint: 'star', massKg: 1.989e30, radiusKm: 696340
  }) as CelestialBody;

const def = (key: string): MegaTypeDef => {
  const d = megaTypeDef(key);
  if (!d) throw new Error(`registry has no '${key}'`);
  return d;
};

describe('space elevator — the taper sentence, anchored on Earth', () => {
  it('reads Earth geostationary from the ONE source and demands about 50 GPa·cm³/g of the ribbon', () => {
    const d = def('space-elevator');
    const out = d.derive(defaultMegaParams(d, earth()), earth());
    expect(out.geoAltitudeKm).toBe(35786); // the processor-stamped boundary, not a private recompute
    // The classic result: ΔV surface→geo for Earth ≈ 48.5 MJ/kg ≡ 48.5 GPa·cm³/g. The owner's
    // sentence rounds it to "about 50"; carbon nanotube ~50 makes the taper about e.
    expect(out.tetherSpecificStrengthGPa).toBeGreaterThan(47.5);
    expect(out.tetherSpecificStrengthGPa).toBeLessThan(49.5);
    // At the default material (50 GPa·cm³/g) the taper is exp(48.5/50) ≈ 2.6 — buildable, and the
    // row can honestly say so.
    expect(out.taperRatio).toBeGreaterThan(2.4);
    expect(out.taperRatio).toBeLessThan(2.9);
  });

  it('a host with only a FALLBACK geostationary gets null, never a substitute figure', () => {
    const d = def('space-elevator');
    const locked = earth({
      orbitalBoundaries: {
        minLeoKm: 200, leoMoeBoundaryKm: 2000, meoHeoBoundaryKm: 50000,
        heoUpperBoundaryKm: 1.47e6, geoStationaryKm: 42000, isGeoFallback: true
      }
    });
    const out = d.derive(defaultMegaParams(d, locked), locked);
    expect(out.geoAltitudeKm).toBeNull();
    expect(out.tetherSpecificStrengthGPa).toBeUndefined(); // no number where none has meaning (§3.4.1)
    const spec = d.shape(defaultMegaParams(d, locked), locked);
    expect(spec).toEqual({ family: 'tether', topAltitudeKm: null, counterweightAltitudeKm: null, anchorLatitudeDeg: 0 });
  });

  it('the tether spec tops out at the real geostationary', () => {
    const d = def('space-elevator');
    // The DOCK is at geostationary; the ribbon runs PAST it to the counterweight - by default a
    // 1.25x design margin above geo (the owner's own template authors 45,000 km on Earth, ~1.26x).
    // ...and it stands on the EQUATOR - the shape's own physics, read by the renderer (RENDER-S50).
    expect(d.shape(defaultMegaParams(d, earth()), earth())).toEqual({ family: 'tether', topAltitudeKm: 35786, counterweightAltitudeKm: 35786 * 1.25, anchorLatitudeDeg: 0 });
  });
});

describe('ringworld — the Niven anchors', () => {
  it('the defaults give about Earth gravity at 1 AU and about three million Earths of floor', () => {
    const d = def('ringworld');
    const host = sol();
    const params = defaultMegaParams(d, host);
    const out = d.derive(params, host);
    // The seed rotation is derived from the seed radius, so at defaults ω²r IS Earth gravity.
    expect(out.spinGravityMs2).toBeCloseTo(EARTH_GRAVITY, 3);
    // 2π × 1 AU × 1.6e6 km ≈ 1.50e15 km² ≈ 2.9 million Earth surface areas.
    expect(out.areaKm2).toBeCloseTo(2 * Math.PI * AU_KM * 1.6e6, -6);
    expect(out.areaEarths).toBeGreaterThan(2.8e6);
    expect(out.areaEarths).toBeLessThan(3.1e6);
    expect(out.ringUnstable).toBe(true); // no restoring force — a tag, never a refusal
    // Phase 4: a solid band is opaque to what aligns with it, and the WIDTH is what says how much
    // of the sky that is. The angle is the physics module's, taken at the instance's real orbit.
    expect(out.starOcclusion).toBe(1);
    expect(out.occlusionBandWidthKm).toBe(1.6e6);
  });

  it('the band is an unfinished sphere: full longitude, a latitude sliver centred on the equator', () => {
    const d = def('ringworld');
    const host = sol();
    const spec = d.shape(defaultMegaParams(d, host), host);
    if (spec.family !== 'sphere-section') throw new Error('ringworld must be a sphere-section');
    expect(spec.radiusKm).toBeCloseTo(AU_KM, 0);
    // 1.6e6 km on a 1 AU sphere subtends ~0.0107 rad — Niven's ribbon and a sphere band are the
    // same object at this scale (§5b.4).
    expect(spec.thetaLengthRad).toBeCloseTo(1.6e6 / AU_KM, 6);
    expect(spec.thetaStartRad).toBeCloseTo(Math.PI / 2 - spec.thetaLengthRad / 2, 9);
    expect(spec.phiLengthRad).toBeCloseTo(2 * Math.PI, 9);
    expect(spec.drawnAs).toBe('faces');
  });
});

describe('planetary torus — spin gravity around a world', () => {
  it('defaults cohere: about Earth gravity at twice the host radius', () => {
    const d = def('planetary-torus');
    const host = earth();
    const params = defaultMegaParams(d, host);
    expect(params.ringRadiusKm).toBe(2 * 6371);
    const out = d.derive(params, host);
    expect(out.spinGravityMs2).toBeCloseTo(EARTH_GRAVITY, 3);
    expect(out.areaKm2).toBeCloseTo(2 * Math.PI * 12742 * 100, 0);
    expect(out.ringUnstable).toBe(true);
  });

  it('spin gravity is ω²r, checked against a hand figure: 200 km radius at 2 h spin', () => {
    const d = def('planetary-torus');
    const host = earth();
    const out = d.derive({ ringRadiusKm: 200, widthKm: 1, rotationPeriodHours: 2 }, host);
    // ω = 2π/7200 s = 8.7266e-4; ω²r = 7.6154e-7 × 2e5 m = 0.1523 m/s².
    expect(out.spinGravityMs2).toBeCloseTo(0.1523, 3);
  });
});

describe('dyson sphere — coverage drives area, occlusion and the growing strip', () => {
  it('at 40% coverage: occlusion 0.4, area 40% of the full sphere, longitude strip 0.8π', () => {
    const d = def('dyson-sphere');
    const host = sol();
    const params = { ...defaultMegaParams(d, host), coveragePct: 40 };
    const out = d.derive(params, host);
    expect(out.starOcclusion).toBeCloseTo(0.4, 9);
    expect(out.areaKm2).toBeCloseTo(0.4 * 4 * Math.PI * AU_KM * AU_KM, -6);
    const spec = d.shape(params, host);
    if (spec.family !== 'sphere-section') throw new Error('sphere must be a sphere-section');
    expect(spec.thetaLengthRad).toBeCloseTo(Math.PI, 9);      // full latitude
    expect(spec.phiLengthRad).toBeCloseTo(0.8 * Math.PI, 9);  // growth eats longitude
    expect(spec.drawnAs).toBe('faces');
  });
});

describe('dyson swarm — one number, three consumers', () => {
  it('density drives occlusion, the harvest fraction and the points path together', () => {
    const d = def('dyson-swarm');
    const host = sol();
    const params = { radiusAU: 1, densityFrac: 0.3, efficiencyFrac: 0.25 };
    const out = d.derive(params, host);
    expect(out.starOcclusion).toBeCloseTo(0.3, 9);
    // A fraction of L*, NOT watts — the multiply waits for B110's single luminosity function.
    expect(out.powerHarvestedLstarFrac).toBeCloseTo(0.075, 9);
    const spec = d.shape(params, host);
    if (spec.family !== 'sphere-section') throw new Error('swarm must be a sphere-section');
    expect(spec.drawnAs).toBe('points'); // apexes only — one object, shaded appropriately
    expect(spec.pointDensityFrac).toBeCloseTo(0.3, 9);
  });
});

describe('death star — honest numbers from the knobs', () => {
  it('the canonical 160 km station at 1e18 kg: milligravity and a mostly-hollow density', () => {
    const d = def('death-star');
    const host = earth();
    const out = d.derive(defaultMegaParams(d, host), host);
    // g = G·m/r² = 6.6743e-11 × 1e18 / (8e4)² ≈ 0.0104 m/s².
    expect(out.surfaceGravityMs2).toBeCloseTo((G * 1e18) / (8e4 * 8e4), 6);
    expect(out.surfaceGravityMs2!).toBeGreaterThan(0.010);
    expect(out.surfaceGravityMs2!).toBeLessThan(0.011);
    // 1e18 kg in a 160 km sphere ≈ 0.47 g/cc — lighter than rock, as a station should be.
    expect(out.bulkDensityGcc).toBeGreaterThan(0.4);
    expect(out.bulkDensityGcc).toBeLessThan(0.55);
    const spec = d.shape(defaultMegaParams(d, host), host);
    expect(spec).toEqual({ family: 'spheroid', dimensionsM: [160000, 160000, 160000] });
  });
});
