import { describe, it, expect } from 'vitest';
import { documentStyleBase, DOCUMENT_STYLES } from './documentStyles';

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

  it('exposes exactly the four picker options', () => {
    expect(DOCUMENT_STYLES.map((s) => s.value)).toEqual(['guide', 'report', 'brochure', 'terminal']);
  });
});
