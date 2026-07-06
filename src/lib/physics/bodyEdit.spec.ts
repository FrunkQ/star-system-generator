import { describe, it, expect } from 'vitest';
import {
  densityGcc, editMass, editRadius, editDensity, editMakeup, setMakeupComponent,
  COMPOSITION_PRESETS, presetValidAt, type BodyEditState
} from './bodyEdit';
import { normalizeMakeup } from './makeup';

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
