// A40: the Info-text-size control runs to 250%, so the document engine has to survive it.
//
// Two things are asserted, and the FIRST is the one A32 was about: the control's whole travel must
// reach the page. A clamp below the control's maximum means the top of the slider moves the panel's
// CSS chrome and nothing inside the document, which reads as a broken control rather than a capped one.
import { describe, it, expect } from 'vitest';
import { renderDocument } from './renderDocument';
import type { DocBlock, DocTheme } from './blocks';

function ctx2d(w: number, h: number): CanvasRenderingContext2D {
  // jsdom has no canvas backend, so stub the surface renderDocument actually touches. Text metrics
  // are the only measurement it takes, and a proportional-to-scale width is enough to detect
  // overflow: what is under test is whether the engine SCALES, not how a real font rasterises.
  let font = '10px sans-serif';
  const api: any = {
    canvas: { width: w, height: h },
    get font() { return font; },
    set font(v: string) { font = v; },
    measureText: (t: string) => {
      const px = parseFloat(font) || 10;
      return { width: t.length * px * 0.5, actualBoundingBoxAscent: px * 0.8, actualBoundingBoxDescent: px * 0.2 };
    },
    save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, rect() {},
    arc() {}, ellipse() {}, fill() {}, stroke() {}, clip() {}, fillRect() {}, strokeRect() {},
    clearRect() {}, fillText() {}, strokeText() {}, translate() {}, rotate() {}, scale() {},
    setTransform() {}, drawImage() {}, createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }), setLineDash() {}, quadraticCurveTo() {},
    bezierCurveTo() {}, roundRect() {}, arcTo() {}
  };
  return api as CanvasRenderingContext2D;
}

const blocks: DocBlock[] = [
  { kind: 'heading', text: 'Epsilon Eridani III' } as any,
  { kind: 'paragraph', text: 'A cold ocean world under a thin nitrogen sky, tidally quiet and far from its star.' } as any,
  { kind: 'kv', rows: [{ label: 'Radiation hazard', value: 'background' }, { label: 'Ascent cost', value: 'moderate' }] } as any
];
const theme = (fontScale: number): DocTheme => ({ font: 'sans-serif', accent: '#6aa0ff', fontScale } as any);

function measure(fontScale: number) {
  const W = 420, H = 900;
  const res = renderDocument(ctx2d(W, H), blocks, theme(fontScale), { x: 10, y: 10, w: W - 20, maxY: H, scrollY: 0 });
  return { contentH: res.contentH, width: W - 20 };
}

describe('document font scale', () => {
  // THE A32 CHECK, and it has to be taken AT the old ceiling to mean anything. Comparing 2.5 against
  // 1.6 passes even when the engine clamps at 1.8, because 1.8 is still larger than 1.6 — the first
  // version of this test did exactly that and caught nothing. Comparing against 1.8 is the assertion:
  // with a clamp at 1.8 the two are IDENTICAL, and only an engine that accepts the control's full
  // range separates them.
  it('lets the whole of the control range reach the page', () => {
    const atOldCeiling = measure(1.8).contentH;
    const atMax = measure(2.5).contentH;
    expect(atMax, 'the document stopped growing at 180% — something between the control and the page is re-clamping it')
      .toBeGreaterThan(atOldCeiling);
  });

  it('scales monotonically across the range', () => {
    const hs = [0.8, 1.0, 1.6, 2.0, 2.5].map((f) => measure(f).contentH);
    for (let i = 1; i < hs.length; i++) {
      expect(hs[i], `content shrank going from step ${i - 1} to ${i}: ${hs.join(', ')}`).toBeGreaterThanOrEqual(hs[i - 1]);
    }
  });

  it('produces a finite, sane layout at the new maximum', () => {
    const { contentH } = measure(2.5);
    expect(Number.isFinite(contentH)).toBe(true);
    expect(contentH).toBeGreaterThan(0);
    expect(contentH, 'a 250% document should not run to absurd height on three blocks').toBeLessThan(20000);
  });
});
