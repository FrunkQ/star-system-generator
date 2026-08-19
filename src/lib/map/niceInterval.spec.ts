// The whole value of G10 is that a number a GM reads off a grid is one they could have chosen
// themselves, so these tests are about the SHAPE of the answers — every step on the 1/2/5 ladder,
// every ring a whole multiple of its step — rather than about particular values.
import { describe, it, expect } from 'vitest';
import {
  niceStepBelow, nextNiceStep, prevNiceStep, niceStep, niceSeries, gridLevels, formatNice, gridLevelOpacity, GRID_LEVEL_PEAK, CROSSFADE_START } from './niceInterval';

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

// A55 — THE OPACITY SCHEDULE, and the frame loop that drives it. `gridLevels` was right; what popped
// was the OPACITY handed to the two levels: a 0.30 "ghost" peak for the fine level and 0.42 for the
// coarse, so the SAME LINES jumped by 40% the instant the decade turned over and they were rebuilt
// as the dominant level — and the build skipped a level under 2%, which a fresh decade's fine level
// always is, so after every handover nothing faded in at all. Both are pinned here.
describe('the level opacity is ONE law and it is continuous across the handover', () => {
  it('fine(t = 1) equals coarse(t = 0) exactly — the surviving lines do not jump', () => {
    expect(gridLevelOpacity('fine', 1)).toBeCloseTo(gridLevelOpacity('coarse', 0), 12);
    expect(gridLevelOpacity('coarse', 0)).toBe(GRID_LEVEL_PEAK);
    expect(gridLevelOpacity('fine', 0)).toBe(0);
    expect(gridLevelOpacity('coarse', 1)).toBe(0);
  });
  it('the fine level is ABSENT for the first part of the decade and the coarse holds full strength there', () => {
    for (const t of [0, 0.2, 0.4, CROSSFADE_START]) { expect(gridLevelOpacity('fine', t)).toBe(0); expect(gridLevelOpacity('coarse', t)).toBe(GRID_LEVEL_PEAK); }
    expect(gridLevelOpacity('fine', 0.8)).toBeGreaterThan(0.15);
    expect(gridLevelOpacity('fine', 0.8)).toBeLessThan(GRID_LEVEL_PEAK);
    // The two always sum to the peak: the surviving lines (drawn by both levels) never dim mid-fade.
    for (let i = 0; i <= 20; i++) { const t = i / 20; expect(gridLevelOpacity('fine', t) + gridLevelOpacity('coarse', t)).toBeCloseTo(GRID_LEVEL_PEAK, 9); }
  });
  it('monotone: the fine rises and the coarse falls across the decade, and the dial is clamped', () => {
    let f = -1, c = 2;
    for (let i = 0; i <= 100; i++) { const t = i / 100; const nf = gridLevelOpacity('fine', t), nc = gridLevelOpacity('coarse', t); expect(nf).toBeGreaterThanOrEqual(f); expect(nc).toBeLessThanOrEqual(c); f = nf; c = nc; }
    expect(gridLevelOpacity('fine', 7)).toBe(GRID_LEVEL_PEAK);
    expect(gridLevelOpacity('coarse', -3)).toBe(GRID_LEVEL_PEAK);
  });

  // THE FRAME LOOP: the per-frame sequence the scene runs — read the levels, rebuild on a decade
  // change, else slide the opacities — walked across three decades of zoom. Every step asserts that
  // the brightness of every grid STEP on screen (keyed by its spacing, which is what the eye sees)
  // changed by no more than a frame's worth. That is the whole of "it should fade, not pop".
  it("the frame loop: zooming through three decades never moves any step's opacity by more than a frame", () => {
    type Built = { coarse: number; mats: { step: number; level: 'coarse' | 'fine'; opacity: number }[] };
    let built: Built | null = null;
    const rebuild = (lv: { coarse: number; fine: number; t: number }): Built => ({
      coarse: lv.coarse,
      // BOTH levels always, whatever their opacity right now — the fix.
      mats: [{ step: lv.coarse, level: 'coarse', opacity: gridLevelOpacity('coarse', lv.t) }, { step: lv.fine, level: 'fine', opacity: gridLevelOpacity('fine', lv.t) }]
    });
    const frame = (extent: number) => {
      const lv = gridLevels(extent, 6)!;
      if (!built || lv.coarse !== built.coarse) { built = rebuild(lv); return; }
      for (const m of built.mats) m.opacity = gridLevelOpacity(m.level, lv.t);
    };
    const seen = (b: Built) => { const o = new Map<number, number>(); for (const m of b.mats) o.set(m.step, Math.max(o.get(m.step) ?? 0, m.opacity)); return o; };
    let prev: Map<number, number> | null = null;
    let maxJump = 0, handovers = 0, lastCoarse = 0;
    for (let i = 0; i <= 1500; i++) {
      frame(100 * Math.pow(0.995, i));   // zooming IN, a fraction of a percent a frame, three decades
      const now = seen(built!);
      if (built!.coarse !== lastCoarse) { if (lastCoarse) handovers++; lastCoarse = built!.coarse; }
      if (prev) for (const [step, op] of now) { const was = prev.get(step) ?? 0; maxJump = Math.max(maxJump, Math.abs(op - was)); }
      prev = now;
    }
    expect(handovers).toBeGreaterThanOrEqual(2);
    expect(maxJump).toBeLessThan(0.006);   // ~ a frame's slide at this zoom rate; the old schedule jumped 0.12
    // ...and zooming OUT, the other way through the same decades.
    built = null; prev = null; maxJump = 0;
    for (let i = 0; i <= 1500; i++) {
      frame(0.1 * Math.pow(1 / 0.995, i));
      const now = seen(built!);
      if (prev) for (const [step, op] of now) { const was = prev.get(step) ?? 0; maxJump = Math.max(maxJump, Math.abs(op - was)); }
      prev = now;
    }
    expect(maxJump).toBeLessThan(0.006);
  });
  it('...and the OLD schedule is what popped (the regression this pins): 0.30 ghost to 0.42 dominant at the handover', () => {
    const oldFine = (t: number) => 0.30 * t, oldCoarse = (t: number) => 0.42 * (1 - t);
    expect(Math.abs(oldFine(1) - oldCoarse(0))).toBeCloseTo(0.12, 9);
  });
});
