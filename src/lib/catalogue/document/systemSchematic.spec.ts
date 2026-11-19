// "THE TEXT OVER THE PLANETS GETS CUT OFF BY THE TOP OF THE WINDOW" (Discord, 10-22, the system
// document view).
//
// A planet's name is written at 45 degrees, rising up and to the right of its marker, and the
// diagram's box was sized for the orbital lines and never for the names: one fixed row per star with
// 35 px above the line. A name longer than about seven characters rises further than that. On the
// first row it left the block and the window cut it off; on a later row it was written across the
// star above; and the outermost planet's ran off the right-hand edge.
//
// The existing gate (`renderDocument.spec.ts`) uses a context whose transforms are no-ops, so it
// could see THAT a name was drawn and never WHERE. This one carries the transform, so every string
// is checked against the rectangle the document reserved for the diagram.
import { describe, it, expect } from 'vitest';
import { drawSystemSchematic, schematicHeight, schematicExtent, schematicLabelMeasure } from './systemSchematic';
import { hudCardTheme } from './cardBlocks';
import type { HudCard } from '../infoCard';

const theme = hudCardTheme({
  panelW: 320, title: 't', sub: 'planet', facts: [], description: '', accent: '#8ed0ff', font: 'serif', fontScale: 1, mono: false
} as HudCard);

interface Drawn { text: string; x0: number; y0: number; x1: number; y1: number }

/** A 2D context that carries its transform, and records the view-space box of every string drawn. */
function trackingCtx() {
  type M = [number, number, number, number, number, number]; // a b c d e f
  let m: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  let fontPx = 10;
  const drawn: Drawn[] = [];
  const mul = (n: M) => { const [a, b, c, d, e, f] = m; m = [a * n[0] + c * n[1], b * n[0] + d * n[1], a * n[2] + c * n[3], b * n[2] + d * n[3], a * n[4] + c * n[5] + e, b * n[4] + d * n[5] + f]; };
  const at = (x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] as const;
  const ctx: any = {
    drawn,
    set font(v: string) { const r = /(\d+(?:\.\d+)?)px/.exec(v); if (r) fontPx = parseFloat(r[1]); },
    get font() { return `${fontPx}px serif`; },
    textAlign: 'left', textBaseline: 'alphabetic', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    // A proportional-ish width: 0.55 em a character, which is about what a 10 px sans measures.
    measureText: (t: string) => ({ width: t.length * fontPx * 0.55 }),
    save() { stack.push([...m] as M); }, restore() { m = stack.pop() ?? m; },
    translate(x: number, y: number) { mul([1, 0, 0, 1, x, y]); },
    scale(x: number, y: number) { mul([x, 0, 0, y, 0, 0]); },
    rotate(r: number) { mul([Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]); },
    fillText(text: string, x: number, y: number) {
      const w = text.length * fontPx * 0.55;
      const lx0 = ctx.textAlign === 'center' ? x - w / 2 : x;
      // The glyph box: an ascent of 0.8 em above the baseline, a descent of 0.25 em below it.
      const pts = [at(lx0, y - fontPx * 0.8), at(lx0 + w, y - fontPx * 0.8), at(lx0, y + fontPx * 0.25), at(lx0 + w, y + fontPx * 0.25)];
      drawn.push({ text, x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) });
    },
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {}, arcTo() {}, closePath() {}, fillRect() {}
  };
  return ctx;
}

const planet = (id: string, name: string, a: number, host = 'star') =>
  ({ id, name, kind: 'body', roleHint: 'planet', parentId: host, massKg: 6e24, orbit: { hostId: host, elements: { a_AU: a } } });
const star = (id: string, name: string) => ({ id, name, kind: 'body', roleHint: 'star', parentId: null, massKg: 2e30 });

const LONG: any = { id: 's', name: 'Long names', nodes: [
  star('star', 'Proxima Centauri'),
  planet('b', 'Proxima Centauri b', 0.05),
  planet('c', 'Gliese 667 Cc', 0.4),
  planet('d', 'A Very Long Name For The Outermost World', 30)
] };
const SHORT: any = { id: 's', name: 'Short names', nodes: [star('star', 'Sol'), planet('io', 'Io', 1), planet('ra', 'Ra', 5)] };
const BINARY: any = { id: 's', name: 'Two stars', nodes: [
  star('a', 'Alpha'), planet('a1', 'Alpha Prime Outpost', 1, 'a'), planet('a2', 'Ab', 3, 'a'),
  star('b', 'Beta'), planet('b1', 'Beta Secundus Station', 1, 'b'), planet('b2', 'Bb', 3, 'b')
] };

/** Draw the diagram the way `renderDocument` does: reserve the natural height at this width, then draw into it. */
function drawAt(system: any, x: number, y: number, w: number) {
  const ctx = trackingCtx();
  const h = schematicHeight(system, w, { measure: schematicLabelMeasure(ctx, theme) });
  drawSystemSchematic(ctx, { system, x, y, w, h, theme });
  return { drawn: ctx.drawn as Drawn[], rect: { x0: x, y0: y, x1: x + w, y1: y + h }, h };
}

describe('the system diagram contains its own planet names', () => {
  for (const [what, system] of [['long names', LONG], ['two stars', BINARY], ['short names', SHORT]] as const) {
    it(`draws every string inside the rectangle the document reserved (${what})`, () => {
      const { drawn, rect } = drawAt(system, 40, 60, 900);
      expect(drawn.length).toBeGreaterThan(2);
      for (const d of drawn) {
        // ABSOLUTE: not one pixel of any name above the block's top edge. That edge is the window's.
        expect(d.y0, `"${d.text}" above the top`).toBeGreaterThanOrEqual(rect.y0);
        expect(d.x1, `"${d.text}" past the right edge`).toBeLessThanOrEqual(rect.x1);
        expect(d.x0, `"${d.text}" past the left edge`).toBeGreaterThanOrEqual(rect.x0);
        expect(d.y1, `"${d.text}" below the bottom`).toBeLessThanOrEqual(rect.y1);
      }
    });
  }

  it('keeps a second star’s planet names off the first star’s row', () => {
    const { drawn } = drawAt(BINARY, 0, 0, 900);
    const of = (t: string) => drawn.find((d) => d.text === t)!;
    // Everything the first row writes UNDER its line (the star's own name is the lowest of it) is
    // clear of the name that rises highest out of the second row.
    expect(of('Beta Secundus Station').y0).toBeGreaterThanOrEqual(of('Alpha').y1);
  });

  it('gives a system whose names already fitted exactly the old box: 600 wide, 88 a star', () => {
    const ctx = trackingCtx();
    const ext = schematicExtent(SHORT, { measure: schematicLabelMeasure(ctx, theme) });
    expect(ext.virtW).toBe(600);
    expect(ext.virtH).toBe(88);
    expect(ext.headroom).toEqual([0]);
    expect(schematicHeight(SHORT, 1200, { measure: schematicLabelMeasure(ctx, theme) })).toBe(176);
  });

  it('reserves nothing for names that are not drawn (the starmap strip)', () => {
    const ext = schematicExtent(LONG, { labels: false });
    expect(ext.virtW).toBe(600);
    expect(ext.virtH).toBe(88);
  });

  it('the reserved height and the drawn height are one answer', () => {
    // If the document measured one way and the drawer another, the diagram would be scaled to fit a
    // box that is not its own and sit off-centre in it. Width-fitted means it fills the width exactly.
    const { drawn, rect } = drawAt(LONG, 0, 0, 900);
    const starName = drawn.find((d) => d.text === 'Proxima Centauri')!;
    const ctx = trackingCtx();
    const ext = schematicExtent(LONG, { measure: schematicLabelMeasure(ctx, theme) });
    const scale = 900 / ext.virtW;
    // A star's name is centred under the star at virtual x 42, or starts 2 px in from the edge when
    // it is wider than that allows - as this one is. Either way its position is a fixed number of
    // VIRTUAL px, so it lands where the extent's own scale says and nowhere else.
    expect(starName.x0).toBeCloseTo(rect.x0 + 2 * scale, 6);
  });
});
