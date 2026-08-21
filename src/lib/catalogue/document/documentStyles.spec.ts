import { describe, it, expect } from 'vitest';
import { documentStyleBase, DOCUMENT_STYLES, makeDocTheme } from './documentStyles';

describe('documentStyleBase', () => {
  it('gives each style a distinct look (font + background + list glyphs)', () => {
    const guide = documentStyleBase('guide');
    const report = documentStyleBase('report');
    const terminal = documentStyleBase('terminal');
    const brochure = documentStyleBase('brochure');

    // Report is light paper; the others are dark / warm.
    expect(report.colors.bg).toBe('#f6f5f1');
    expect(guide.colors.bg).not.toBe(report.colors.bg);

    // Terminal is monospace + terminal-log lines; report is numbered; guide/brochure bulleted.
    expect(terminal.font).toMatch(/mono/i);
    expect(terminal.listStyle).toBe('terminal-log');
    expect(report.listStyle).toBe('numbered-dossier');
    expect(guide.listStyle).toBe('illustrated-bullets');
    expect(brochure.font).toMatch(/serif/i);
  });

  it('falls back to the Guide look for an unknown/absent style', () => {
    expect(documentStyleBase(undefined)).toEqual(documentStyleBase('guide'));
  });

  // The picker's ORDER is the order of use. Greyscale leads because it is the one a GM picks on
  // purpose — it is the base a tinting filter needs — then the four originals, then the genre palettes.
  it('leads the picker with greyscale, then the originals, then the genre palettes', () => {
    const vals = DOCUMENT_STYLES.map((s) => s.value);
    expect(vals[0]).toBe('greyscale');
    expect(vals.slice(1, 5)).toEqual(['guide', 'report', 'brochure', 'terminal']);
    expect(vals).toContain('amber');
    expect(new Set(vals).size).toBe(vals.length); // no duplicates
  });

  // Every option in the picker must actually resolve, or a GM picks a look and gets the Guide.
  it('gives every picker option a palette of its own', () => {
    const guide = JSON.stringify(documentStyleBase('guide').colors);
    for (const s of DOCUMENT_STYLES) {
      const base = documentStyleBase(s.value);
      expect(Object.keys(base.colors).length).toBeGreaterThan(0);
      if (s.value !== 'guide') expect(JSON.stringify(base.colors)).not.toBe(guide);
    }
  });

  // Picking greyscale IS asking for monochrome — one lever, not a palette plus a checkbox to match.
  it('turns the theme monochrome when the greyscale colouration is picked', () => {
    const t = makeDocTheme({ font: 'x', mono: false, accent: '#123456', documentStyle: 'greyscale' });
    expect(t.mono).toBe(true);
    expect(makeDocTheme({ font: 'x', mono: false, accent: '#123456', documentStyle: 'guide' }).mono).toBe(false);
  });
});
