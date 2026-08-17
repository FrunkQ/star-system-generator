import { describe, it, expect } from 'vitest';
import { bulkDensityFromMakeup, compressedDensityFromMakeup, radiusReFromMassMakeup, compressionFactor, inferMakeupFromDensity, makeupFractions, gasThermalInflationFactor, isFluidGiant, rendersAsGiant, reconcileGiantMakeup, hasSolidSurface, makeupHasSolidSurface, SOLID_SURFACE_MAX_GAS } from './makeup';
import { EARTH_MASS_KG, EARTH_RADIUS_KM } from '$lib/constants';
import type { CelestialBody } from '$lib/types';

describe('makeup density + gravitational compression', () => {
  it('uncompressed grain density is composition-only (Earth mix ~3.7)', () => {
    expect(bulkDensityFromMakeup({ rock: 0.8, metal: 0.2 })).toBeCloseTo(3.73, 1);
  });

  it('an Earth-mass rocky world compresses to ~5.5 g/cc → ~1.0 R⊕', () => {
    const rho = compressedDensityFromMakeup(1, { rock: 0.8, metal: 0.2 });
    expect(rho).toBeGreaterThan(5.2);
    expect(rho).toBeLessThan(5.8);
    expect(radiusReFromMassMakeup(1, { rock: 0.8, metal: 0.2 })).toBeCloseTo(1.0, 1);
  });

  it('small bodies are barely compressed; super-Earths markedly more', () => {
    expect(compressionFactor(0.012, { rock: 1 })).toBeLessThan(1.05);  // Moon
    expect(compressionFactor(1, { rock: 1 })).toBeGreaterThan(1.4);     // Earth
    expect(compressionFactor(5, { rock: 1 })).toBeGreaterThan(compressionFactor(1, { rock: 1 }));
  });

  it('gas-dominated bodies are not rock-compressed', () => {
    expect(compressionFactor(50, { gas: 0.9, ice: 0.1 })).toBe(1);
  });

  it('inference inverts the grain blend: a dense uncompressed value is metal-rich', () => {
    const m = inferMakeupFromDensity(5.2);
    expect((m.metal ?? 0)).toBeGreaterThan(0.5);  // ~Mercury
    expect(inferMakeupFromDensity(3.4).rock ?? 0).toBeGreaterThan(0.8); // ~rock
  });

  it('mass-aware: a small dense body (Mercury-like) reads iron, not compressed rock', () => {
    const mercury = { id: 'm', kind: 'body', roleHint: 'planet', massKg: 0.055 * EARTH_MASS_KG, radiusKm: 0.383 * EARTH_RADIUS_KM } as CelestialBody;
    const f = makeupFractions(mercury);
    expect(f.metal).toBeGreaterThan(0.4);
  });

  it('gas giants use the giant mass–radius relation (Jupiter mass → ~11 R⊕, not huge)', () => {
    const r = radiusReFromMassMakeup(317.8, { gas: 0.95, ice: 0.05 });
    expect(r).toBeGreaterThan(9);
    expect(r).toBeLessThan(13);
  });
});

describe('gas-giant thermal inflation', () => {
  const jupiter = { gas: 0.95, ice: 0.05 };

  it('inflation factor: negligible when cold, grows with temperature', () => {
    expect(gasThermalInflationFactor(100)).toBeCloseTo(1, 3);   // cold Jupiter
    expect(gasThermalInflationFactor(1400)).toBeGreaterThan(1.2); // hot Jupiter puffs up
    expect(gasThermalInflationFactor(3000)).toBeCloseTo(1.7, 1);  // saturates near +70%
  });

  it('a hot gas giant is larger and less dense than a cold one at the same mass', () => {
    const cold = radiusReFromMassMakeup(317.8, jupiter, gasThermalInflationFactor(100));
    const hot = radiusReFromMassMakeup(317.8, jupiter, gasThermalInflationFactor(1800));
    expect(hot).toBeGreaterThan(cold * 1.2);
    // same mass in a bigger radius ⇒ lower density
    const rho = (r: number) => 5.513 * 317.8 / r ** 3;
    expect(rho(hot)).toBeLessThan(rho(cold));
  });

  it('inflation does NOT change a rocky body (no thermal expansion of rock/metal)', () => {
    const rocky = { rock: 0.8, metal: 0.2 };
    expect(radiusReFromMassMakeup(1, rocky, 1.7)).toBeCloseTo(radiusReFromMassMakeup(1, rocky, 1), 5);
  });
});

describe('fluid-giant detection (drives the giant render look)', () => {
  const b = (p: Partial<CelestialBody>): CelestialBody => ({ id: 'x', kind: 'body', roleHint: 'planet', ...p } as CelestialBody);

  it('an ice-dominated giant (massive, low density, low gas) is a fluid giant and renders as a giant', () => {
    const iceGiant = b({ makeup: { ice: 0.97, gas: 0.03 }, massKg: 2.92e27, radiusKm: 81549 }); // ~489 M⊕, ρ≈1.29
    expect(isFluidGiant(iceGiant)).toBe(true);
    expect(rendersAsGiant(iceGiant)).toBe(true);
  });

  it('a gas-dominated giant renders as a giant even below the mass threshold', () => {
    expect(rendersAsGiant(b({ makeup: { gas: 0.8, ice: 0.2 }, massKg: 3e25, radiusKm: 30000 }))).toBe(true);
  });

  it('a small icy moon and a rocky super-Earth are NOT giants', () => {
    expect(isFluidGiant(b({ makeup: { ice: 0.6, rock: 0.4 }, massKg: 4.8e22, radiusKm: 1560 }))).toBe(false); // Europa-ish
    expect(rendersAsGiant(b({ makeup: { ice: 0.6, rock: 0.4 }, massKg: 4.8e22, radiusKm: 1560 }))).toBe(false);
    expect(isFluidGiant(b({ makeup: { rock: 0.7, metal: 0.3 }, massKg: 6e25, radiusKm: 12000 }))).toBe(false); // ~10 M⊕, dense
  });

  // Round 2 seam fix: a body at giant mass + low density can't be gas-free, so physics corrects it.
  it('reconcileGiantMakeup gives a gas-free "giant" a volatile envelope (Alex\'s 536 M⊕ / ρ 2.47 case)', () => {
    // 536 M⊕ at ρ 2.47: R = cbrt(3M/4πρ). M=3.2e27 kg, ρ 2470 kg/m³ → R ≈ 6.76e7 m = 67,600 km.
    const contradiction = b({ makeup: { rock: 0.5, ice: 0.5 }, massKg: 3.2e27, radiusKm: 67600 });
    expect(isFluidGiant(contradiction)).toBe(true);           // giant by mass+density
    const fixed = reconcileGiantMakeup(contradiction);
    expect(fixed).not.toBeNull();
    expect(fixed!.gas).toBeGreaterThan(0.5);                   // now has a real gas envelope
    // and it therefore renders/classifies as a giant consistently
    expect(rendersAsGiant({ ...contradiction, makeup: fixed! } as any)).toBe(true);
  });

  it('reconcileGiantMakeup leaves consistent bodies alone', () => {
    expect(reconcileGiantMakeup(b({ makeup: { gas: 0.8, ice: 0.2 }, massKg: 3e27, radiusKm: 60000 }))).toBeNull(); // already gassy
    expect(reconcileGiantMakeup(b({ makeup: { rock: 0.7, metal: 0.3 }, massKg: 6e24, radiusKm: 6371 }))).toBeNull(); // Earth — not a giant
    expect(reconcileGiantMakeup(b({ massKg: 3.2e27, radiusKm: 46600 }))).toBeNull(); // no explicit makeup → inference handles it
  });
});

// B36 — the has-ground predicate's own pins, at its new home. It was previously in radiation.ts and
// tested there as a side-effect of the dose LABEL; it is a composition question and belongs here.
describe('hasSolidSurface — the has-ground question, and only that one', () => {
  const b = (p: Partial<CelestialBody>): CelestialBody => ({ id: 'x', kind: 'body', roleHint: 'planet', ...p } as CelestialBody);

  it('is the gas fraction against one named boundary', () => {
    expect(SOLID_SURFACE_MAX_GAS).toBe(0.5);
    expect(hasSolidSurface(b({ makeup: { gas: 0.49, rock: 0.51 } }))).toBe(true);
    expect(hasSolidSurface(b({ makeup: { gas: 0.51, rock: 0.49 } }))).toBe(false);
  });

  it('reads the INFERRED makeup, not the stored field — which is absent on most bundled bodies', () => {
    // DATA-R8: 107 of 226 non-star bundled bodies carry no `makeup`. Jupiter among them, so a test
    // that went through the stored field would call the largest planet in the system solid ground.
    const jupiterish = b({ massKg: 1.898e27, radiusKm: 69911 });   // no makeup authored
    expect(jupiterish.makeup).toBeUndefined();
    expect(hasSolidSurface(jupiterish)).toBe(false);
    const earthish = b({ massKg: 5.972e24, radiusKm: 6371 });      // no makeup authored
    expect(hasSolidSurface(earthish)).toBe(true);
  });

  it('excludes a star outright — a photosphere is not somewhere you stand', () => {
    // And it must not depend on a star's inferred makeup: a DENSE remnant infers as rocky, so
    // without the roleHint exclusion a white dwarf would report solid ground and be scored for
    // habitability. Sirius B: 1.02 solar masses inside an Earth-sized ball.
    const whiteDwarf = b({ roleHint: 'star', massKg: 2.03e30, radiusKm: 5850 });
    expect(makeupFractions(whiteDwarf).gas).toBeLessThanOrEqual(0.5);  // infers rocky from density
    expect(hasSolidSurface(whiteDwarf)).toBe(false);                   // ...and is excluded anyway
  });

  it('makeupHasSolidSurface answers the same question of a bare composition', () => {
    // The body editor holds a preset's makeup with no node to infer from. Same boundary, by
    // construction: hasSolidSurface is defined in terms of this.
    expect(makeupHasSolidSurface({ gas: 0.49, rock: 0.51 })).toBe(true);
    expect(makeupHasSolidSurface({ gas: 0.51, rock: 0.49 })).toBe(false);
    expect(makeupHasSolidSurface({ rock: 1 })).toBe(true);   // gas absent = no envelope
  });

  it('is NOT the negation of rendersAsGiant — engine-map M1/M2 keep them apart', () => {
    // An ice giant is the body the two could disagree about, and a GM-authored gas-poor makeup at
    // giant mass is exactly where they do: it draws as a giant while its composition says ground.
    const gasPoorGiant = b({ makeup: { rock: 0.5, ice: 0.5 }, massKg: 3.2e27, radiusKm: 67600 });
    expect(rendersAsGiant(gasPoorGiant)).toBe(true);
    expect(hasSolidSurface(gasPoorGiant)).toBe(true);
    // Not a contradiction to fix here: SystemProcessor.reconcileGiantMakeup repairs the makeup
    // before either helper is consulted (M1). This pins that they are separately defined.
  });
});
