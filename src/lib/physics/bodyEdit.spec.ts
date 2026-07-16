import { describe, it, expect } from 'vitest';
import {
  densityGcc, editMass, editRadius, editDensity, editMakeup, setMakeupComponent,
  COMPOSITION_PRESETS, presetValidAt, applyPresetAnchored,
  trimEnvelope, editRadiusAnchored, editDensityAnchored, editMassAnchored,
  MIN_M, MIN_R, type BodyEditState
} from './bodyEdit';
import { normalizeMakeup, maxPorosity, compressedDensityFromMakeup } from './makeup';

const earth: BodyEditState = { massMe: 1, radiusRe: 1, makeup: normalizeMakeup({ rock: 0.85, metal: 0.15 }) };
const gcc = (s: BodyEditState) => densityGcc(s.massMe, s.radiusRe);

describe('bodyEdit — the mass/radius/density preservation chain', () => {
  it('Earth calibration: 1 M⊕ / 1 R⊕ ≈ 5.51 g/cc', () => {
    expect(gcc(earth)).toBeCloseTo(5.513, 2);
  });

  it('drag MASS (default): composition held, radius follows', () => {
    const out = editMass(earth, 4, null);
    expect(out.massMe).toBe(4);
    expect(out.makeup).toEqual(earth.makeup);        // composition unchanged
    expect(out.radiusRe).toBeGreaterThan(1);         // bigger mass → bigger radius
  });

  it('drag MASS with radius LOCKED: radius held, density & composition shift', () => {
    const out = editMass(earth, 4, 'radius');
    expect(out.radiusRe).toBe(1);                    // held
    expect(gcc(out)).toBeGreaterThan(gcc(earth));    // 4× mass in the same radius → denser
    expect(out.makeup).not.toEqual(earth.makeup);    // recomposed toward the new density
  });

  it('drag RADIUS (default): mass held, density drops, composition shifts', () => {
    const out = editRadius(earth, 1.5, null);
    expect(out.massMe).toBe(1);                       // held
    expect(gcc(out)).toBeLessThan(gcc(earth));        // same mass, bigger → less dense
  });

  it('drag RADIUS with density LOCKED: composition held, mass follows', () => {
    const held = gcc(earth);
    const out = editRadius(earth, 1.5, 'density', held);
    expect(out.makeup).toEqual(earth.makeup);         // composition held
    expect(gcc(out)).toBeCloseTo(held, 3);            // density held
    expect(out.massMe).toBeGreaterThan(1);            // bigger at same density → more mass
  });

  it('drag DENSITY (default): radius held, mass follows, composition re-inferred', () => {
    const out = editDensity(earth, 8, null);          // crank density up
    expect(out.radiusRe).toBe(1);                     // held
    expect(gcc(out)).toBeCloseTo(8, 2);
    expect(out.massMe).toBeGreaterThan(1);            // denser at same radius → more mass
    expect(out.makeup.metal).toBeGreaterThan(earth.makeup.metal); // toward iron
  });

  it("makeup edit (Alex's case): radius locked + drive Metal up → density & mass rise", () => {
    const locked: EditLike = 'radius';
    const more = setMakeupComponent(earth.makeup, 'metal', 0.6);
    const out = editMakeup({ ...earth }, more, 'radius');
    expect(out.radiusRe).toBe(1);                     // radius held
    expect(gcc(out)).toBeGreaterThan(gcc(earth));     // more metal → denser
    expect(out.massMe).toBeGreaterThan(1);            // denser at same radius → more mass
  });

  it('presets gate by density — Gas giant valid at ~1, invalid at ~5.5', () => {
    const gas = COMPOSITION_PRESETS.find((p) => p.name === 'Gas giant')!;
    expect(presetValidAt(gas, 1.0)).toBe(true);
    expect(presetValidAt(gas, 5.5)).toBe(false);
  });

  it('terrestrial → gas giant: drop density, pick Gas giant, add mass → the radius balloons', () => {
    // 1) drop density toward the gas band
    let s = editDensity(earth, 1.2, null);
    const gas = COMPOSITION_PRESETS.find((p) => p.name === 'Gas giant')!;
    expect(presetValidAt(gas, gcc(s))).toBe(true);        // preset now available
    // 2) pick Gas giant → gas-dominated makeup → the gas-giant radius model
    s = editMakeup(s, normalizeMakeup(gas.makeup), null);
    // 3) crank the mass up to a real giant
    s = editMass(s, 320, null);
    expect(s.makeup.gas).toBeGreaterThan(0.5);
    expect(s.radiusRe).toBeGreaterThan(8);               // ballooned to ~Jupiter (impossible for a rocky world)
  });
});

type EditLike = 'mass' | 'radius' | 'density' | null;

// ——— anchored editing (composition-editor redesign) ———————————————————————————————————————————————

describe('maxPorosity — the void ceiling vs self-gravity', () => {
  it('km-scale comets/rubble hold the full ~65%', () => {
    expect(maxPorosity(1.7e-12)).toBeCloseTo(0.65, 2);   // 67P-ish
  });
  it('Phobos-mass ceiling comfortably covers its measured ~30%', () => {
    const p = maxPorosity(1.8e-9);
    expect(p).toBeGreaterThan(0.3);
    expect(p).toBeLessThan(0.55);
  });
  it('crushed out by Ceres mass and above', () => {
    expect(maxPorosity(1.6e-4)).toBe(0);
    expect(maxPorosity(1)).toBe(0);
  });
});

describe('trimEnvelope + anchored edits — composition is the anchor', () => {
  it('Earth: porosity ceiling is 0 but the ±8% tolerance keeps a usable band', () => {
    const env = trimEnvelope(1, earth.makeup);
    expect(env.kind).toBe('porosity');
    expect(env.r0).toBeCloseTo(1, 1);
    expect(env.radLo).toBeLessThan(env.r0);
    expect(env.radHi).toBeGreaterThan(env.r0);
    expect(env.denHi / env.denLo).toBeGreaterThan(1.1);  // ~×1.17 across the band
  });

  it('gas giant: envelope is the inflation range, not porosity', () => {
    const gas = normalizeMakeup({ gas: 0.95, ice: 0.05 });
    const env = trimEnvelope(320, gas);
    expect(env.kind).toBe('inflation');
    expect(env.radHi / env.radLo).toBeCloseTo(1.7 / 0.85, 1);
  });

  it('in-band radius drag: composition and type inputs hold', () => {
    const env = trimEnvelope(1, earth.makeup);
    const out = editRadiusAnchored(earth, (env.radLo + env.radHi) / 2);
    expect(out.outOfBand).toBe(false);
    expect(out.makeup).toEqual(earth.makeup);
    expect(out.massMe).toBe(1);
  });

  it('out-of-band radius drag flows through: makeup re-inferred, flagged', () => {
    const out = editRadiusAnchored(earth, 1.5);
    expect(out.outOfBand).toBe(true);
    expect(out.makeup).not.toEqual(earth.makeup);        // morphing toward an icier mix
  });

  it('in-band density drag: mass and composition held, radius absorbs it', () => {
    const env = trimEnvelope(1, earth.makeup);
    const target = (env.denLo + env.denHi) / 2;
    const out = editDensityAnchored(earth, target);
    expect(out.outOfBand).toBe(false);
    expect(out.massMe).toBe(1);
    expect(out.makeup).toEqual(earth.makeup);
    expect(densityGcc(out.massMe, out.radiusRe)).toBeCloseTo(target, 2);
  });

  it('mass drag preserves the relative trim, squeezed by the shrinking ceiling', () => {
    // a porous rubble pile at 1e-9 M⊕…
    const makeup = normalizeMakeup({ rock: 0.75, carbon: 0.15, metal: 0.1 });
    const envSmall = trimEnvelope(1e-9, makeup);
    const porous: BodyEditState = { massMe: 1e-9, radiusRe: envSmall.radHi, makeup };
    // …dragged up to planet mass loses its voids (trim collapses toward 1)
    const out = editMassAnchored(porous, 1);
    expect(out.outOfBand).toBe(false);
    const envBig = trimEnvelope(1, makeup);
    expect(out.radiusRe / envBig.r0).toBeLessThan(1.05);
    // and the same drag back down re-opens the envelope without touching makeup
    const back = editMassAnchored(out, 1e-9);
    expect(back.makeup).toEqual(makeup);
  });

  it('floors admit asteroid/comet masses now', () => {
    expect(MIN_M).toBeLessThanOrEqual(1e-12);
    expect(MIN_R).toBeLessThanOrEqual(5e-5);
    const out = editMass(earth, 1e-10, null);
    expect(out.massMe).toBeCloseTo(1e-10, 12);           // not clamped up to the old 1e-4 floor
  });
});

describe('small-body presets', () => {
  const rubble = COMPOSITION_PRESETS.find((p) => p.name === 'Rubble pile')!;
  const comet = COMPOSITION_PRESETS.find((p) => p.name === 'Comet')!;

  it('gate on mass as well as density — no rubble-pile Earths', () => {
    expect(presetValidAt(rubble, 2.0, 1)).toBe(false);       // Earth mass: out
    expect(presetValidAt(rubble, 2.0, 1e-9)).toBe(true);     // asteroid mass: in
    expect(presetValidAt(comet, 0.6, 1e-12)).toBe(true);
    // and the mass gate is ignored when no mass is supplied (legacy call shape)
    expect(presetValidAt(rubble, 2.0)).toBe(true);
  });

  it('applyPresetAnchored lands a comet porous, not compacted', () => {
    const small: BodyEditState = { massMe: 1e-12, radiusRe: 1e-4, makeup: normalizeMakeup({ rock: 1 }) };
    const out = applyPresetAnchored(small, comet);
    const solid = compressedDensityFromMakeup(out.massMe, out.makeup);
    const geom = densityGcc(out.massMe, out.radiusRe);
    expect(out.makeup.ice).toBeGreaterThan(0.5);
    expect(geom).toBeLessThan(solid * 0.75);               // ≥25% voids present
  });
});
