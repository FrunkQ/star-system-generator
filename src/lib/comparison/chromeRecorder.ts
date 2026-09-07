// src/lib/comparison/chromeRecorder.ts
// A RECORDING 2D CONTEXT, for gating what the strip's chrome actually draws.
//
// The chrome moved out of the DOM and into a canvas (B126), which took the component tests' one
// instrument with it: there is no `.label .name` to query any more. This is the replacement, and it
// is a better one — it sees the exact string, at the exact coordinates, with the font and colour
// that were set when it was drawn, which the DOM never told us.
//
// TEST-ONLY, and it lives in `src/lib` rather than beside one spec because TWO specs need it: the
// pure drawing gate (`stripChrome.spec.ts`) and the component gate (`playerView.spec.ts`), which
// installs it over `HTMLCanvasElement.prototype.getContext` so a mounted view records itself.
import type { ChromeCtx } from './stripChrome';

export interface DrawnText {
  text: string;
  x: number;
  y: number;
  font: string;
  fillStyle: string;
  textAlign: string;
  textBaseline: string;
}

export interface DrawnArc {
  x: number;
  y: number;
  r: number;
  strokeStyle: string;
  /** True when the path was stroked, false when it was filled — a ruler arc against a dot. */
  stroked: boolean;
}

export interface ChromeRecorder extends ChromeCtx {
  texts: DrawnText[];
  arcs: DrawnArc[];
  clears: number;
  /** Every string drawn, in draw order. The usual shorthand. */
  strings(): string[];
  reset(): void;
  /** Also accepts the transform the view sets before drawing; recorded but not applied. */
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
}

/**
 * A recorder. `measureText` returns a plausible width (six pixels a character) because the chrome
 * does not currently lay anything out by measurement — if it ever does, this is the number to make
 * honest rather than the place to discover it was zero.
 */
export function makeChromeRecorder(): ChromeRecorder {
  const pending: DrawnArc[] = [];
  const rec: ChromeRecorder = {
    texts: [], arcs: [], clears: 0,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '', textAlign: 'start',
    textBaseline: 'alphabetic', globalAlpha: 1,
    save() {}, restore() {},
    beginPath() { pending.length = 0; },
    closePath() {},
    moveTo() {}, lineTo() {},
    arc(x, y, r) { pending.push({ x, y, r, strokeStyle: rec.strokeStyle, stroked: false }); },
    fill() { for (const a of pending) rec.arcs.push({ ...a, stroked: false }); pending.length = 0; },
    stroke() { for (const a of pending) rec.arcs.push({ ...a, strokeStyle: rec.strokeStyle, stroked: true }); pending.length = 0; },
    fillText(text, x, y) {
      rec.texts.push({
        text, x, y, font: rec.font, fillStyle: rec.fillStyle,
        textAlign: rec.textAlign, textBaseline: rec.textBaseline
      });
    },
    measureText(text: string) { return { width: text.length * 6 }; },
    clearRect() { rec.clears++; },
    setLineDash() {},
    setTransform() {},
    strings() { return rec.texts.map((t) => t.text); },
    reset() { rec.texts.length = 0; rec.arcs.length = 0; rec.clears = 0; pending.length = 0; }
  };
  return rec;
}
