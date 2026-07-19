import { describe, it, expect } from 'vitest';
import { deriveIrradiationDose } from './radiation';

// dose(teqK, magShield, surfaceAgeGyr) — relative space-weathering dose that drives tholin darkening.
describe('irradiation dose — space weathering', () => {
  it('Earth reads a very low dose: shielded AND a young resurfaced crust', () => {
    // Teq 255, strong field (~0.8 shield), surface age 0.2 Gyr.
    expect(deriveIrradiationDose(255, 0.8, 0.2)).toBeLessThan(0.05);
  });

  it('Pluto reads a real dose despite faint sunlight: cosmic-ray floor over an ancient unshielded surface', () => {
    // Teq ~44 (UV negligible), no field, ancient surface — GCR floor × age carries it.
    const d = deriveIrradiationDose(44, 0, 4.6);
    expect(d).toBeGreaterThan(0.1);
  });

  it('a magnetosphere cuts the dose', () => {
    const bare = deriveIrradiationDose(120, 0, 3);
    const shielded = deriveIrradiationDose(120, 0.9, 3);
    expect(shielded).toBeLessThan(bare);
  });

  it('a fresh surface takes less accumulated dose than an ancient one', () => {
    expect(deriveIrradiationDose(90, 0, 0.05)).toBeLessThan(deriveIrradiationDose(90, 0, 4.5));
  });

  it('dose rises with stellar flux (closer/hotter) when unshielded and old', () => {
    expect(deriveIrradiationDose(350, 0, 3)).toBeGreaterThan(deriveIrradiationDose(90, 0, 3));
  });
});
