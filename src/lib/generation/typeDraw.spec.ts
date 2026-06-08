import { describe, it, expect } from 'vitest';
import { rarityTier, rarityOf, weirdnessGate } from './typeDraw';

describe('rarity tiers', () => {
  it('map rarity to the loot-box tiers', () => {
    expect(rarityTier(0.05).key).toBe('common');
    expect(rarityTier(0.3).key).toBe('uncommon');
    expect(rarityTier(0.5).key).toBe('rare');
    expect(rarityTier(0.7).key).toBe('epic');
    expect(rarityTier(0.95).key).toBe('legendary');
  });
  it('basic worlds are common, exotic worlds legendary', () => {
    expect(rarityTier(rarityOf('planet/barren')).key).toBe('common');
    expect(rarityTier(rarityOf('planet/terrestrial')).key).toBe('common');
    expect(rarityTier(rarityOf('planet/chlorine')).key).toBe('legendary');
    expect(rarityTier(rarityOf('planet/fluorine')).key).toBe('legendary');
  });
  it('weirdness gate suppresses types rarer than the slider, full weight at/below', () => {
    expect(weirdnessGate(0.9, 0)).toBeLessThan(0.01);   // legendary gated out at weirdness 0
    expect(weirdnessGate(0.05, 0)).toBeGreaterThan(0.5); // common survives at weirdness 0
    expect(weirdnessGate(0.9, 1)).toBeGreaterThan(1);    // legendary boosted at weirdness 1
  });
});
