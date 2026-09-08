import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { discVisible, ringVisible } from './circleCull';

// Owner, 2026-09-07: "the Zones are all full of transparencies and dashed lines (probably drawn off
// screen)". Half right - the zones already skipped a circle whose bounding box missed the view - and
// the half he was wrong about is the one that mattered: a circle that swallows the viewport whole.

const W = 800, H = 600;

describe('a ring and a disc are not visible under the same conditions', () => {
	it('agrees with the old bounding-box test for an ordinary circle', () => {
		expect(discVisible(400, 300, 100, W, H)).toBe(true);      // on screen
		expect(ringVisible(400, 300, 100, W, H)).toBe(true);
		expect(discVisible(-500, 300, 100, W, H)).toBe(false);    // off to the left
		expect(ringVisible(-500, 300, 100, W, H)).toBe(false);
		expect(discVisible(400, 300, 0, W, H)).toBe(false);       // nothing to draw
		expect(ringVisible(400, 300, -5, W, H)).toBe(false);
	});

	it('KEEPS a huge disc and DROPS its ring, which is the whole point', () => {
		// A circle centred on screen with a radius past every corner: it fills every pixel, and its
		// boundary is somewhere out beyond the corners where nobody can see it.
		const huge = 100_000;
		expect(discVisible(400, 300, huge, W, H)).toBe(true);
		expect(ringVisible(400, 300, huge, W, H)).toBe(false);
		// ...and that is the case this view is FULL of: a zone or a Hill limit at AU scale, deep in.
		expect(ringVisible(400, 300, 1e9, W, H)).toBe(false);
	});

	it('still draws a ring that passes through the view, however big the circle', () => {
		// The saving must never eat a line that is actually on screen. A circle centred far off to the
		// left, whose right-hand edge crosses the middle of the view, has to draw.
		expect(ringVisible(-9600, 300, 10_000, W, H)).toBe(true);
		// And one whose boundary sits exactly on the far corner draws too: the comparison is `>`, so
		// the cheap failure (a wasted frame) is preferred to the expensive one (a missing line).
		const farCorner = Math.hypot(800, 600);
		expect(ringVisible(0, 0, farCorner, W, H)).toBe(false);
		expect(ringVisible(0, 0, farCorner - 0.001, W, H)).toBe(true);
	});

	it('honours the margin on both, so a line is not clipped at the very edge', () => {
		expect(discVisible(-105, 300, 100, W, H, 0)).toBe(false);
		expect(discVisible(-105, 300, 100, W, H, 20)).toBe(true);
		// A bigger margin means a bigger viewport to swallow, so a ring stays visible longer.
		const r = Math.hypot(400, 300) + 5;
		expect(ringVisible(400, 300, r, W, H, 0)).toBe(false);
		expect(ringVisible(400, 300, r, W, H, 50)).toBe(true);
	});
});

// The canvas view cannot be rendered in a unit test, so its wiring is read out of the source.
describe('the system map uses it for zones AND Hill spheres', () => {
	const src = readFileSync('src/lib/components/SystemVisualizer.svelte', 'utf8');

	it('tests a zone LINE as a ring and a zone BAND as a disc', () => {
		expect(src).toContain('discVisible(cx, cy, r, width, height, margin)');
		expect(src).toContain('if (!ringVisible(cx, cy, radiusPx, width, height, margin)) return;');
	});

	it('does NOT reach into drawSystem for a `margin` that is not there', () => {
		// [[B145]]. The Hill-sphere cull shipped in v3.0.378 and was reverted the next day: it passed a
		// `margin` that exists only as a local of two OTHER functions, so `drawSystem` threw on the
		// first bubble of every frame and the whole 2D view - orbit lines and all - died with it. The
		// build was green, because esbuild strips types without checking them (RENDER-S46).
		//
		// The cull is sound and is welcome back. It must bring a margin of ITS OWN, and it must be
		// checked with `npx svelte-check --threshold error` on this file, which named the fault in one
		// line. This gate holds the shape of the mistake rather than the absence of the feature.
		const NEXT_FN = '  function ';
		const bodyOf = (name: string) => {
			const at = src.indexOf('function ' + name + '(');
			expect(at, name).toBeGreaterThan(-1);
			const next = src.indexOf(NEXT_FN, at + 10);
			return src.slice(at, next > at ? next : undefined);
		};
		expect(bodyOf('drawSystem')).not.toContain(', margin)');
		// And the two functions that DO own a margin still declare it above their own uses.
		for (const fn of ['drawStellarZonesOverlay', 'drawScaleBar']) {
			const scope = bodyOf(fn);
			if (!scope.includes(', margin)')) continue;
			expect(scope.indexOf('margin = '), fn).toBeGreaterThan(-1);
			expect(scope.indexOf('margin = '), fn).toBeLessThan(scope.indexOf(', margin)'));
		}
	});

	it('drops the translucent WASH on low power and keeps the LINE', () => {
		// The fill is the expensive half by fill rate; the line carries the information - where the
		// boundary is - so the reading survives on a weak machine and the shading does not.
		const at = src.indexOf('const drawZoneBand =');
		expect(at).toBeGreaterThan(-1);
		expect(src.slice(at, at + 900)).toContain('if ($lowPower) return;');
		// ...and the zone LINE is not gated, or low power would remove the answer with the decoration.
		const line = src.indexOf('const drawZoneLine =');
		expect(src.slice(line, line + 700)).not.toContain('$lowPower');
	});
});
