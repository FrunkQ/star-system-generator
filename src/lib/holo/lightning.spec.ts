import { describe, it, expect } from 'vitest';
import { updateLightning, type LightningVisual } from './bodyFeatures';
import { lightningStrength } from '$lib/physics/cloudDecks';

// The flash curve is the one piece of real logic here, and the property that matters is one a
// shimmer would quietly fail: lightning is DARK almost all the time. Every other glow on a body
// breathes on a sine and is lit at least half the time; if this ever became one of those, a storm
// world would read as a permanently glowing ball rather than a flickering one.
const cell = (over: Partial<LightningVisual> = {}): LightningVisual =>
  ({ mat: { opacity: 0 } as any, peak: 0.8, period: 4, offset: 0, ...over });

const sample = (v: LightningVisual, steps = 400) => {
  const out: number[] = [];
  for (let i = 0; i < steps; i++) { updateLightning([v], (i / steps) * v.period); out.push(v.mat.opacity); }
  return out;
};

describe('lightning', () => {
  it('is dark for the great majority of its cycle', () => {
    const lit = sample(cell()).filter((o) => o > 0.01).length;
    expect(lit / 400).toBeLessThan(0.1);
  });

  it('actually fires — and never exceeds its peak', () => {
    const s = sample(cell());
    expect(Math.max(...s)).toBeGreaterThan(0.3);
    expect(Math.max(...s)).toBeLessThanOrEqual(0.8);
    expect(Math.min(...s)).toBeGreaterThanOrEqual(0);
  });

  it('flickers within the stroke rather than fading smoothly', () => {
    // A real stroke is several strokes down one channel. Count direction changes while lit: a clean
    // exponential decay has none.
    const s = sample(cell()).filter((o) => o > 0.01);
    let reversals = 0;
    for (let i = 2; i < s.length; i++) if ((s[i] - s[i - 1]) * (s[i - 1] - s[i - 2]) < 0) reversals++;
    expect(reversals).toBeGreaterThan(1);
  });

  it('handles a negative clock without going dark permanently', () => {
    const v = cell({ offset: 1 });
    updateLightning([v], -7.3);
    expect(v.mat.opacity).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(v.mat.opacity)).toBe(true);
  });

  it('reads its rate from the tag', () => {
    expect(lightningStrength([{ key: 'weather/lightning', value: 'constant' }] as any)).toBe(1);
    expect(lightningStrength([{ key: 'weather/lightning', value: 'occasional' }] as any)).toBe(0.35);
    expect(lightningStrength([])).toBe(0);
    expect(lightningStrength(undefined)).toBe(0);
  });
});
