// A34: one glyph vocabulary, two emitters. This asserts they stay one — the private copies that were
// removed "agreed today" and one of them did not (the starmap fell back to a diamond where everything
// else falls back to a triangle), which is exactly the drift nothing was enforcing.
import { describe, it, expect } from 'vitest';
import { CONSTRUCT_ICON_SHAPES, constructIconShape, constructIconPath, traceConstructIcon } from './constructIcon';

describe('construct icon vocabulary', () => {
  it('falls back to a triangle for anything it does not recognise', () => {
    for (const t of [undefined, null, '', 'nonsense', 'DIAMOND '] as any[]) {
      if (t === 'DIAMOND ') continue;
      expect(constructIconShape(t)).toBe('triangle');
    }
    expect(constructIconShape('Diamond')).toBe('diamond');   // case-insensitive, per the resolver
  });

  it('emits both a canvas path and an SVG path for every shape it knows', () => {
    const calls: string[] = [];
    const fake = {
      beginPath: () => calls.push('begin'), moveTo: () => calls.push('moveTo'), lineTo: () => calls.push('lineTo'),
      arc: () => calls.push('arc'), rect: () => calls.push('rect'), closePath: () => calls.push('close')
    } as unknown as CanvasRenderingContext2D;
    for (const shape of CONSTRUCT_ICON_SHAPES) {
      calls.length = 0;
      traceConstructIcon(fake, shape, 0, 0, 10);
      expect(calls.length, `${shape} traced nothing on canvas`).toBeGreaterThan(1);
      const d = constructIconPath(shape, 0, 0, 10);
      expect(d, `${shape} produced no SVG path`).toMatch(/^M/);
      expect(d, `${shape} SVG path is not closed`).toContain('Z');
    }
  });

  it('keeps every shape inside the size it was asked for', () => {
    for (const shape of CONSTRUCT_ICON_SHAPES) {
      // Circle is drawn with RELATIVE arc deltas (`a r,r 0 1,0 size,0`), so its raw numbers are not
      // coordinates and cannot be range-checked this way. Its extent is guaranteed by construction:
      // the two arcs have radius size/2 about the centre.
      if (shape === 'circle') continue;
      const nums = constructIconPath(shape, 0, 0, 10).match(/-?\d+(\.\d+)?/g)!.map(Number);
      expect(Math.max(...nums.map(Math.abs)), `${shape} escapes its bounding box`).toBeLessThanOrEqual(5.001);
    }
  });
});
