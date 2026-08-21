// Real-sky import — size-guardrail tests (design §5b).
//
// These deliberately drive counts the confirmed-planet catalogue cannot
// produce today (a 30 ly import is ~25 systems), because the guardrails exist
// for the Gaia population presets that come next. A synthetic count-vs-radius
// curve stands in for the conversion, which is exactly what the injected
// `countAt` parameter is for.
import { describe, expect, it, vi } from 'vitest';
import {
  AMBER_MAX, CEILING, GREEN_MAX, MIN_RADIUS_LY,
  costBand, estimateCost, suggestRadius
} from './costModel.mjs';

// Star counts grow with the cube of the radius; this is that, scaled so the
// bands are all reachable inside the dialogue's 4–41 ly slider.
const cubic = (k) => (r) => Math.round(k * r ** 3);

describe('costBand', () => {
  it('draws the three bands at the documented thresholds', () => {
    expect(costBand(0)).toBe('green');
    expect(costBand(GREEN_MAX)).toBe('green');
    expect(costBand(GREEN_MAX + 1)).toBe('amber');
    expect(costBand(AMBER_MAX)).toBe('amber');
    expect(costBand(AMBER_MAX + 1)).toBe('red');
  });
});

describe('estimateCost', () => {
  const fakeSystems = (n) =>
    Array.from({ length: n }, () => ({ id: 'sys-x', name: 'X', system: { nodes: [{ id: 'a' }, { id: 'b' }] } }));

  it('reports nothing for an empty set rather than dividing by zero', () => {
    const c = estimateCost([]);
    expect(c.kb).toBe(0);
    expect(c.reading).toBe('comfortable');
  });

  it('scales size with the count and switches to MB when it gets big', () => {
    expect(estimateCost(fakeSystems(10)).size).toMatch(/KB$/);
    const big = estimateCost(fakeSystems(200000));
    expect(big.size).toMatch(/MB$/);
  });

  it('gives the plain reading the design asks for, matching the band', () => {
    expect(estimateCost(fakeSystems(20)).reading).toBe('comfortable');
    expect(estimateCost(fakeSystems(300)).reading).toBe('large');
    expect(estimateCost(fakeSystems(900)).reading).toBe('very large');
  });

  it('quotes a load time that never rounds down to zero seconds', () => {
    expect(estimateCost(fakeSystems(1)).time).toBe('loads in ~1s');
    expect(estimateCost(fakeSystems(1000)).time).toBe('loads in ~32s');
  });
});

describe('suggestRadius — a real number, not advice', () => {
  it('finds the largest radius inside the green band', () => {
    // k chosen so 41 ly ~ 1400 systems (red) and the green edge sits ~19-20 ly.
    const countAt = cubic(0.0203);
    const s = suggestRadius(41, countAt);
    expect(s).not.toBeNull();
    expect(s.count).toBeLessThanOrEqual(GREEN_MAX);
    expect(s.radiusLy).toBeLessThan(41);
    // Genuinely the LARGEST such radius: one slider step further is over.
    expect(countAt(s.radiusLy + 0.5)).toBeGreaterThan(GREEN_MAX);
  });

  it('lands on a radius the slider can actually hold', () => {
    const s = suggestRadius(41, cubic(0.0203));
    expect((s.radiusLy * 2) % 1).toBe(0); // a whole number of 0.5 steps
    expect(s.radiusLy).toBeGreaterThanOrEqual(MIN_RADIUS_LY);
  });

  it('reports the count the chip will actually produce', () => {
    const countAt = cubic(0.0203);
    const s = suggestRadius(41, countAt);
    expect(s.count).toBe(countAt(s.radiusLy));
  });

  it('stays QUIET when even the slider floor is over budget', () => {
    // A dense region: 4 ly already yields more than the green band allows.
    const s = suggestRadius(41, () => GREEN_MAX + 1);
    expect(s).toBeNull();
  });

  it('stays quiet when the current radius is already the floor', () => {
    expect(suggestRadius(MIN_RADIUS_LY, cubic(0.0203))).toBeNull();
  });

  it('stays quiet rather than suggesting the radius already chosen', () => {
    // Everything is inside the green band, so there is nothing to shrink to.
    expect(suggestRadius(20, () => 10)).toBeNull();
  });

  it('is cheap: a bounded number of counts, whatever the range', () => {
    const spy = vi.fn(cubic(0.0203));
    suggestRadius(41, spy);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(16);
  });

  it('works from the red band too — the case the confirm gate exists for', () => {
    const countAt = cubic(0.05); // 41 ly ~ 3400 systems, past the ceiling
    expect(countAt(41)).toBeGreaterThan(CEILING);
    const s = suggestRadius(41, countAt);
    expect(s.count).toBeLessThanOrEqual(GREEN_MAX);
  });
});
