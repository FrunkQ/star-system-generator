import { describe, it, expect } from 'vitest';
import { phaseAt, isLiquidAt, liquidsLiquidAt, biosolventScore, liquidDef } from './liquids';

describe('liquid phase (water is not special)', () => {
  it('water: ice / liquid / vapour by its own melt+boil points', () => {
    expect(phaseAt('water', 250)).toBe('solid');
    expect(phaseAt('water', 300)).toBe('liquid');
    expect(phaseAt('water', 400)).toBe('gas');
  });
  it('methane is liquid at Titan temps but frozen warmer than water', () => {
    expect(phaseAt('methane', 95)).toBe('liquid');   // ~90–112 K
    expect(isLiquidAt('water', 95)).toBe(false);      // water is ice at 95 K
  });
  it('nitrogen and CO₂ have their own ranges', () => {
    expect(phaseAt('nitrogen', 70)).toBe('liquid');
    expect(phaseAt('carbon-dioxide', 250)).toBe('liquid'); // 217–304 K (high pressure)
    expect(phaseAt('carbon-dioxide', 150)).toBe('solid');  // dry ice
  });
});

describe('liquidsLiquidAt — what the selector should offer', () => {
  it('at 90 K offers cryogens (nitrogen/methane), not water', () => {
    const names = liquidsLiquidAt(90).map((l) => l.name);
    expect(names).toContain('methane');
    expect(names).not.toContain('water');
  });
  it('at 290 K offers water but not nitrogen', () => {
    const names = liquidsLiquidAt(290).map((l) => l.name);
    expect(names).toContain('water');
    expect(names).not.toContain('nitrogen');
  });
});

describe('biosolvent quality', () => {
  it('water ideal, hydrocarbons/ammonia alternative, acids none', () => {
    expect(biosolventScore('water')).toBe(1);
    expect(biosolventScore('methane')).toBeCloseTo(0.6);
    expect(biosolventScore('ammonia')).toBeCloseTo(0.6);
    expect(biosolventScore('sulfuric-acid')).toBe(0);
  });
});

describe('enriched data', () => {
  it('liquids carry colour + family + conductivity', () => {
    expect(liquidDef('water')?.colorHex).toBeTruthy();
    expect(liquidDef('molten-iron')?.conductive).toBe(true);
    expect(liquidDef('methane')?.family).toBe('hydrocarbon');
  });
});
