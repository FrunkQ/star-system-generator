import { describe, it, expect } from 'vitest';
import { phaseAt, isLiquidAt, liquidsLiquidAt, biosolventScore, liquidDef, phaseSpread, liquidsLiquidInRange, phaseAtP, isLiquidAtP, boilKAt, phaseReason } from './liquids';

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
    // CO₂ has NO liquid phase at 1 atm (triple point 5.1 bar) — dry ice sublimes straight to gas.
    // Liquid CO₂ under real pressure is covered by the phaseAtP suite below.
    expect(phaseAt('carbon-dioxide', 250)).toBe('gas');
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

describe('phaseSpread — solid / liquid / gas across the temperature RANGE', () => {
  it('water on a temperate world with cold poles: liquid, but freezes somewhere', () => {
    const s = phaseSpread('water', 288, 242, 333);
    expect(s.atMean).toBe('liquid');
    expect(s.freezes).toBe(true);        // poles dip below 273
    expect(s.liquidSomewhere).toBe(true);
    expect(s.vaporizes).toBe(false);
  });
  it('water on a hot world: liquid mean but boils off at the hotspots', () => {
    const s = phaseSpread('water', 350, 320, 420);
    expect(s.vaporizes).toBe(true);      // hotspots exceed 373
    expect(s.liquidSomewhere).toBe(true);
  });
  it('liquidsLiquidInRange offers a solvent liquid only at the warm end', () => {
    const names = liquidsLiquidInRange(200, 290).map((l) => l.name);
    expect(names).toContain('water');    // liquid near 290
    expect(names).toContain('ammonia');  // liquid near 200–240
  });
});

// Pressure-aware phase (liquids overhaul L1 — docs/dev/liquids-phase-tags.md).
describe('phaseAtP — pressure changes what can be liquid', () => {
  it('Earth: water liquid at 288 K / 1 bar', () => {
    expect(phaseAtP('water', 288, 1)).toBe('liquid');
  });
  it('Mars-pressure: below the triple point water NEVER liquefies — ice sublimates', () => {
    expect(phaseAtP('water', 280, 0.005)).toBe('gas');    // warm but airless → vapour
    expect(phaseAtP('water', 250, 0.005)).toBe('solid');  // cold → ice (sublimating regime)
  });
  it('a 100-bar ocean world is honestly liquid at 450 K (the new capability)', () => {
    expect(phaseAtP('water', 450, 100)).toBe('liquid');
    expect(boilKAt(liquidDef('water')!, 100)).toBeGreaterThan(450);
  });
  it('Venus surface: 737 K / 92 bar — beyond critical temperature, below critical pressure → gas', () => {
    expect(phaseAtP('water', 737, 92)).toBe('gas');
  });
  it('supercritical: past 647 K AND 218 bar there is no sea and no sky', () => {
    expect(phaseAtP('water', 700, 300)).toBe('supercritical');
  });
  it('CO₂ stops lying: no liquid at 1 bar (sublimes), liquid at 20 bar / 250 K', () => {
    expect(phaseAtP('carbon-dioxide', 250, 1)).toBe('gas');
    expect(phaseAtP('carbon-dioxide', 200, 1)).toBe('solid');
    expect(phaseAtP('carbon-dioxide', 250, 20)).toBe('liquid');
  });
  it('Titan methane unchanged; Io sulfur is liquid at 450 K', () => {
    expect(phaseAtP('methane', 94, 1.5)).toBe('liquid');
    expect(phaseAtP('sulfur', 450, 0.5)).toBe('liquid');
  });
  it('no pressure supplied → legacy 1-atm behaviour (old call sites unaffected)', () => {
    expect(phaseAtP('water', 288, undefined)).toBe('liquid');
    expect(phaseAtP('water', 400, undefined)).toBe('gas');
  });
  it('the layer fluids are all DEFINED now — no assume-liquid fallback', () => {
    for (const n of ['salty-water', 'sulfur-dioxide', 'sodium', 'potassium', 'molten-glass', 'metallic-hydrogen', 'superionic-water']) {
      expect(liquidDef(n), n).toBeTruthy();
    }
    expect(phaseAtP('salty-water', 500, 1)).toBe('gas');   // brine boils like water — no more eternal liquid
    expect(isLiquidAtP('salty-water', 260, 1)).toBe(true); // freezing-point depression: liquid below 273
  });
  it('phaseReason explains the denial', () => {
    expect(phaseReason('water', 288, 1)).toBeNull();                       // it IS liquid
    expect(phaseReason('water', 280, 0.001)).toMatch(/triple point/);
    expect(phaseReason('water', 400, 1)).toMatch(/boils at/);
    expect(phaseReason('water', 700, 300)).toMatch(/supercritical/);
    expect(phaseReason('water', 200, 1)).toMatch(/frozen/i);
  });
});

describe('enriched data', () => {
  it('liquids carry colour + family + conductivity', () => {
    expect(liquidDef('water')?.colorHex).toBeTruthy();
    expect(liquidDef('molten-iron')?.conductive).toBe(true);
    expect(liquidDef('methane')?.family).toBe('hydrocarbon');
  });
});
