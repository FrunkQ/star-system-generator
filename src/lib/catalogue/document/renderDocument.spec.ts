import { describe, it, expect } from 'vitest';
import { renderDocument } from './renderDocument';
import { hudCardToBlocks, hudCardTheme } from './cardBlocks';
import type { DocBlock } from './blocks';
import type { HudCard } from '../infoCard';

// A minimal recording 2D context — enough for the engine to measure + "draw" without a real canvas.
// measureText fakes a monospace-ish width from the current font size so wrap()/ellipsise() behave
// deterministically. Every fillText is captured so a test can assert what the engine emitted.
function mockCtx() {
  const texts: { text: string; x: number; y: number }[] = [];
  const strokes: string[] = [];
  let fontPx = 13;
  const ctx: any = {
    _texts: texts,
    _strokes: strokes,
    set font(v: string) { const m = /(\d+(?:\.\d+)?)px/.exec(v); if (m) fontPx = parseFloat(m[1]); },
    get font() { return `${fontPx}px sans`; },
    textAlign: 'left', textBaseline: 'alphabetic', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    measureText: (t: string) => ({ width: t.length * fontPx * 0.5 }),
    fillText: (text: string, x: number, y: number) => { texts.push({ text, x, y }); },
    fillRect() {}, strokeRect() { strokes.push('rect'); },
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() { strokes.push('line'); }, arc() {},
    drawImage() {}, save() {}, restore() {}, clip() {}, closePath() {}, arcTo() {}, scale() {}
  };
  return ctx;
}

const card: HudCard = {
  panelW: 320, title: 'Testworld', sub: 'planet',
  facts: [
    { label: 'Mass', value: '1.00 M⊕' },
    { label: 'Gravity', value: '1.00 g' },
    { label: 'Temperature', value: '15 °C' }
  ],
  description: 'A temperate rocky world with a thin nitrogen atmosphere and liquid water at the surface.',
  accent: '#8ed0ff', font: 'serif', fontScale: 1, mono: false
};

const layout = { x: 20, y: 20, w: 320, maxY: 600 };

describe('renderDocument (WS2 engine)', () => {
  it('re-renders the info card content through the block model', () => {
    const ctx = mockCtx();
    const blocks = hudCardToBlocks(card);
    const res = renderDocument(ctx, blocks, hudCardTheme(card), layout);

    const drawn = ctx._texts.map((t: any) => t.text).join('\n');
    // Title, role strap, every fact label + value, and description words all made it to the canvas.
    expect(drawn).toContain('Testworld');
    expect(drawn).toContain('PLANET'); // sub is uppercased
    for (const f of card.facts) {
      expect(drawn).toContain(f.label);
      expect(drawn).toContain(f.value);
    }
    expect(drawn).toContain('temperate'); // a word from the wrapped description
    expect(res.contentH).toBeGreaterThan(0);
  });

  it('reports hit regions for id-bearing blocks and list items', () => {
    const ctx = mockCtx();
    const blocks: DocBlock[] = [
      { kind: 'heading', level: 1, text: 'Sol', id: 'star-sol' },
      { kind: 'list', items: [
        { id: 'earth', text: 'Earth' },
        { id: 'mars', text: 'Mars', selected: true }
      ] }
    ];
    const res = renderDocument(ctx, blocks, hudCardTheme(card), layout);
    const ids = res.regions.map((r) => r.id);
    expect(ids).toEqual(['star-sol', 'earth', 'mars']);
    // Regions are ordered top-to-bottom and non-overlapping.
    for (let i = 1; i < res.regions.length; i++) {
      expect(res.regions[i].y0).toBeGreaterThanOrEqual(res.regions[i - 1].y0);
    }
  });

  it('wraps a long text block into multiple lines (taller content)', () => {
    const ctx = mockCtx();
    const short = renderDocument(ctx, [{ kind: 'text', text: 'short' }], hudCardTheme(card), layout);
    const ctx2 = mockCtx();
    const longText = Array(40).fill('word').join(' ');
    const long = renderDocument(ctx2, [{ kind: 'text', text: longText }], hudCardTheme(card), layout);
    expect(long.contentH).toBeGreaterThan(short.contentH);
    expect(ctx2._texts.length).toBeGreaterThan(1); // multiple wrapped lines drawn
  });

  it('draws a placeholder for the schematic block (Phase 2 fills it)', () => {
    const ctx = mockCtx();
    renderDocument(ctx, [{ kind: 'schematic', system: {} }], hudCardTheme(card), layout);
    expect(ctx._strokes).toContain('rect');
    expect(ctx._texts.map((t: any) => t.text).join('')).toContain('schematic');
  });
});
