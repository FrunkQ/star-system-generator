// The tag pill has TWO implementations that cannot share code — CSS for the panel chips, TypeScript
// for the canvas and SVG markers, because neither of those can read a stylesheet. That is a
// duplication the codebase cannot remove, so it is one the tests have to pin: these specs fail the
// moment the tokens and the module stop describing the same shape.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  TAG_PILL_BASE,
  TAG_PILL_RATIO,
  tagPillMetrics,
  tagPillWidth,
  tagPillSvg,
  tagPillText,
  measureTagPillText,
  TAG_PILL_AVG_GLYPH
} from './tagPill';

// Vitest runs from the project root, and import.meta.url is not a file URL under jsdom.
const tokensCss = readFileSync(resolve(process.cwd(), 'src/lib/styles/tokens.css'), 'utf-8');

/** Pull a token's declared value, following one level of var() indirection through the same file. */
function token(name: string): string {
  const direct = new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(tokensCss);
  if (!direct) throw new Error(`token ${name} is not declared in tokens.css`);
  const value = direct[1].trim().replace(/\s*\/\*.*$/, '').trim();
  const indirect = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value);
  return indirect ? token(indirect[1]) : value;
}
const px = (name: string) => parseFloat(token(name));

describe('the tag pill is ONE shape — tokens and module agree', () => {
  it('the CSS chip geometry is exactly the module base', () => {
    expect(px('--tag-pill-radius')).toBe(TAG_PILL_BASE.radius);
    expect(px('--tag-pill-pad-x')).toBe(TAG_PILL_BASE.padX);
    expect(px('--tag-pill-pad-y')).toBe(TAG_PILL_BASE.padY);
    expect(px('--tag-pill-gap')).toBe(TAG_PILL_BASE.gap);
  });

  it('the base font size is the rem token resolved at a 16px root', () => {
    const declared = token('--tag-pill-font-size');
    expect(declared.endsWith('rem')).toBe(true);
    expect(parseFloat(declared) * 16).toBeCloseTo(TAG_PILL_BASE.fontPx, 6);
  });

  it('metrics at the base font size reproduce the CSS chip exactly', () => {
    const m = tagPillMetrics(TAG_PILL_BASE.fontPx);
    expect(m.padX).toBeCloseTo(TAG_PILL_BASE.padX, 6);
    expect(m.padY).toBeCloseTo(TAG_PILL_BASE.padY, 6);
    expect(m.radius).toBeCloseTo(TAG_PILL_BASE.radius, 6);
  });
});

describe('a marker is the chip at another size, not another shape', () => {
  it('every dimension scales with the font, so proportions are invariant', () => {
    const big = tagPillMetrics(12.8);
    const small = tagPillMetrics(6.4);
    expect(small.padX).toBeCloseTo(big.padX / 2, 6);
    expect(small.padY).toBeCloseTo(big.padY / 2, 6);
    expect(small.radius).toBeCloseTo(big.radius / 2, 6);
    expect(small.height).toBeCloseTo(big.height / 2, 6);
    expect(small.rowStep).toBeCloseTo(big.rowStep / 2, 6);
  });

  it('the ratios are derived from the base, not restated beside it', () => {
    expect(TAG_PILL_RATIO.padX * TAG_PILL_BASE.fontPx).toBeCloseTo(TAG_PILL_BASE.padX, 6);
    expect(TAG_PILL_RATIO.radius * TAG_PILL_BASE.fontPx).toBeCloseTo(TAG_PILL_BASE.radius, 6);
  });

  it('the two marker sizes actually used are both the same shape', () => {
    const orrery = tagPillMetrics(9);   // SystemVisualizer
    const starmap = tagPillMetrics(6);  // Starmap
    const aspect = (m: { padX: number; height: number }) => m.padX / m.height;
    expect(aspect(orrery)).toBeCloseTo(aspect(starmap), 6);
  });
});

describe('pill width follows the TEXT, not the character count', () => {
  const m = tagPillMetrics(6);

  it('width is the measured text plus symmetric padding', () => {
    const text = 'Refuelling';
    expect(tagPillWidth(text, m)).toBeCloseTo(measureTagPillText(text, m) + m.padX * 2, 6);
  });

  // The starmap used to size its rect as `label.length * 3.6 + 6`. With a real measurement these two
  // equal-length strings must differ; under the old rule they were identical to the pixel.
  it('two labels of equal length but different width do not get the same pill', () => {
    const ctx = {
      font: '',
      measureText: (s: string) => ({ width: [...s].reduce((n, c) => n + (c === 'i' ? 1 : 6), 0) })
    } as unknown as CanvasRenderingContext2D;
    const wide = tagPillWidth('WWWWW', m, ctx);
    const narrow = tagPillWidth('iiiii', m, ctx);
    expect(wide).toBeGreaterThan(narrow);
  });

  it('falls back to an estimate when there is nothing to measure with', () => {
    // jsdom supplies a STUB 2D context that measures everything as zero — which is the fallback path
    // in the environment this suite runs in, and the reason the zero check below exists.
    const w = measureTagPillText('abcd', m);
    expect(w).toBeCloseTo(4 * m.fontPx * TAG_PILL_AVG_GLYPH, 6);
  });

  // A stub context is not an absent one, and a pill sized off it would be bare padding with the text
  // spilling out of both ends. Pinned explicitly so it survives whatever jsdom does next.
  it('treats a zero-width answer for real text as no measurement at all', () => {
    const stub = { font: '', measureText: () => ({ width: 0 }) } as unknown as CanvasRenderingContext2D;
    expect(measureTagPillText('Refuelling', m, stub)).toBeCloseTo(
      'Refuelling'.length * m.fontPx * TAG_PILL_AVG_GLYPH,
      6
    );
    expect(tagPillWidth('Refuelling', m, stub)).toBeGreaterThan(m.padX * 2);
  });

  it('an empty string legitimately measures zero', () => {
    const ok = { font: '', measureText: () => ({ width: 0 }) } as unknown as CanvasRenderingContext2D;
    expect(measureTagPillText('', m, ok)).toBe(0);
  });
});

describe('placement', () => {
  const m = tagPillMetrics(6);

  it('svg geometry centres the pill on the y it is given', () => {
    const p = tagPillSvg('Ceres', 0, 20, m);
    expect(p.y + p.height / 2).toBeCloseTo(20, 6);
    expect(p.textY).toBe(20);          // dominant-baseline: middle
    expect(p.textX).toBeCloseTo(p.x + m.padX, 6);
    expect(p.rx).toBeCloseTo(m.radius, 6);
  });

  it('stacked pills clear each other', () => {
    expect(m.rowStep).toBeGreaterThan(m.height);
  });
});

describe('what a marker prints', () => {
  const mk = (style: string) => ({ style, label: 'Trade Union', monogram: 'TU' });

  it('the monogram shapes carry initials and the rest carry the label', () => {
    expect(tagPillText(mk('pin'))).toBe('TU');
    expect(tagPillText(mk('flag'))).toBe('TU');
    expect(tagPillText(mk('label'))).toBe('Trade Union');
    expect(tagPillText(mk('both'))).toBe('Trade Union');
  });
});
