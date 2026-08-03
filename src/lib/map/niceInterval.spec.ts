// The whole value of G10 is that a number a GM reads off a grid is one they could have chosen
// themselves, so these tests are about the SHAPE of the answers — every step on the 1/2/5 ladder,
// every ring a whole multiple of its step — rather than about particular values.
import { describe, it, expect } from 'vitest';
import {
  niceStepBelow, nextNiceStep, prevNiceStep, niceStep, niceSeries, gridLevels, formatNice
} from './niceInterval';

/** Is this a 1, 2 or 5 times a power of ten? The property every step here must have. */
function isNice(v: number): boolean {
  if (!(v > 0)) return false;
  const exp = Math.floor(Math.log10(v) + 1e-9);
  const m = v / Math.pow(10, exp);
  return [1, 2, 5].some((k) => Math.abs(m - k) < 1e-9);
}

describe('the ladder', () => {
  it('lands on 1, 2 or 5 times a power of ten for anything thrown at it', () => {
    for (let i = 0; i < 500; i++) {
      const raw = Math.pow(10, -4 + (i / 500) * 10); // 1e-4 .. 1e6, log-spread
      expect(isNice(niceStepBelow(raw)), `${raw} -> ${niceStepBelow(raw)}`).toBe(true);
    }
  });

  it('never overshoots — the step is at or below what was asked for', () => {
    for (let i = 1; i < 400; i++) {
      const raw = i * 0.37;
      expect(niceStepBelow(raw)).toBeLessThanOrEqual(raw + 1e-12);
    }
  });

  it('knows the exact rungs', () => {
    expect(niceStepBelow(1)).toBe(1);
    expect(niceStepBelow(1.9)).toBe(1);
    expect(niceStepBelow(2)).toBe(2);
    expect(niceStepBelow(4.9)).toBe(2);
    expect(niceStepBelow(5)).toBe(5);
    expect(niceStepBelow(9.9)).toBe(5);
    expect(niceStepBelow(10)).toBe(10);
    expect(niceStepBelow(0.07)).toBeCloseTo(0.05, 12);
  });

  it('steps up and down the ladder, and the two are inverses', () => {
    expect(nextNiceStep(1)).toBe(2);
    expect(nextNiceStep(2)).toBe(5);
    expect(nextNiceStep(5)).toBe(10);
    expect(prevNiceStep(10)).toBe(5);
    expect(prevNiceStep(5)).toBe(2);
    expect(prevNiceStep(2)).toBe(1);
    expect(prevNiceStep(1)).toBeCloseTo(0.5, 12);
    for (const v of [0.01, 0.02, 0.05, 0.1, 1, 2, 5, 10, 20, 50, 100]) {
      expect(prevNiceStep(nextNiceStep(v))).toBeCloseTo(v, 12);
    }
  });

  it('is unit-agnostic: scaling the extent scales the step and nothing else', () => {
    // The same extent expressed in ly and in pc must give the same GRID, only relabelled.
    const inLy = niceStep(40, 6);
    const inPc = niceStep(40 / 3.26156, 6);
    expect(isNice(inLy)).toBe(true);
    expect(isNice(inPc)).toBe(true);
    // Roughly the same physical spacing, within one rung of the ladder.
    expect(inPc * 3.26156).toBeGreaterThan(inLy / 3);
    expect(inPc * 3.26156).toBeLessThan(inLy * 3);
  });
});

describe('dividing an extent', () => {
  it('gets somewhere near the division count asked for', () => {
    for (const extent of [0.4, 1, 7, 12, 39.5, 100, 1508, 2182]) {
      const step = niceStep(extent, 6);
      const divisions = extent / step;
      expect(divisions, `extent ${extent} gave ${divisions} divisions`).toBeGreaterThanOrEqual(3);
      expect(divisions, `extent ${extent} gave ${divisions} divisions`).toBeLessThanOrEqual(20);
    }
  });

  it('gives rings that are whole multiples of the step — the point of the exercise', () => {
    const rings = niceSeries(39.5, 6);
    expect(rings.length).toBeGreaterThan(2);
    const step = rings[0];
    for (const r of rings) expect(Math.abs(r / step - Math.round(r / step))).toBeLessThan(1e-9);
    for (const r of rings) expect(r).toBeLessThanOrEqual(39.5 * 1.001);
  });

  it('thins by whole multiples, so a survivor is still round', () => {
    const rings = niceSeries(1000, 40, 5); // deliberately asks for far too many
    expect(rings.length).toBeLessThanOrEqual(5);
    for (const r of rings) expect(isNice(r) || r % rings[0] === 0).toBe(true);
  });

  it('handles a Kuiper-belt extent and a tight inner system alike', () => {
    expect(niceStep(50, 6)).toBe(5);      // out past Pluto: 5 AU squares
    expect(niceStep(0.5, 6)).toBeCloseTo(0.05, 12); // a compact system: 0.05 AU
  });
});

describe('the decade crossfade', () => {
  it('always offers two NESTED decades — exactly ten fine cells to a coarse one', () => {
    for (let i = 0; i < 300; i++) {
      const extent = Math.pow(10, -2 + (i / 300) * 6);
      const lv = gridLevels(extent, 6)!;
      // A power of ten, so every coarse line is also a fine line and the subdivision lands INSIDE
      // the cell. The 1/2/5 ladder cannot promise that (5 to 2 is a factor of 2.5).
      expect(Math.log10(lv.coarse) % 1).toBeCloseTo(0, 9);
      expect(lv.coarse / lv.fine).toBeCloseTo(10, 9);
      expect(lv.t).toBeGreaterThanOrEqual(0);
      expect(lv.t).toBeLessThanOrEqual(1);
    }
  });

  it('CROSSFADES rather than jumping — t sweeps the full range across one decade', () => {
    // Walk a zoom continuously and collect t. If it jumped, t would only ever sit near one value.
    const ts: number[] = [];
    for (let i = 0; i <= 300; i++) {
      const extent = 60 * Math.pow(0.98, i); // zooming in
      ts.push(gridLevels(extent, 6)!.t);
    }
    expect(Math.min(...ts)).toBeLessThan(0.15);
    expect(Math.max(...ts)).toBeGreaterThan(0.85);
  });

  it('hands over cleanly: as t reaches 1 the fine level becomes the next coarse one', () => {
    // Just above and just below a rung boundary, the dominant level must be the same grid.
    const above = gridLevels(6 * 1.0005, 6)!;   // raw just above 1
    const below = gridLevels(6 * 0.9995, 6)!;   // raw just below 1
    expect(above.coarse).toBeCloseTo(1, 12);
    expect(below.coarse).toBeCloseTo(0.1, 12);
    expect(above.fine).toBeCloseTo(below.coarse, 12); // the fine ghost becomes the new dominant
    expect(above.t).toBeGreaterThan(0.98);            // ...and it had fully faded in first
    expect(below.t).toBeLessThan(0.02);
  });

  it('refuses nonsense rather than inventing a grid', () => {
    expect(gridLevels(0, 6)).toBeNull();
    expect(gridLevels(-5, 6)).toBeNull();
    expect(niceStep(0)).toBe(0);
    expect(niceStepBelow(NaN)).toBe(0);
  });
});

describe('labels', () => {
  it('prints a step at the precision the step justifies', () => {
    expect(formatNice(5)).toBe('5');
    expect(formatNice(500)).toBe('500');
    expect(formatNice(0.5)).toBe('0.5');
    expect(formatNice(0.05)).toBe('0.05');
    expect(formatNice(0.002)).toBe('0.002');
    expect(formatNice(20)).toBe('20');
  });

  it('never prints a trailing-zero lie like "500.0"', () => {
    for (const v of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]) {
      expect(formatNice(v)).not.toContain('.');
    }
  });
});
