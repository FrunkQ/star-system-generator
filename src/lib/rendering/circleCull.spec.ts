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

	it('culls the Hill bubbles, which were never culled at all', () => {
		// The zone overlay next door has skipped an off-screen circle since it was written and these
		// did not, so every bubble in a fifty-body system reached the canvas regardless.
		expect(src).toContain('const showFill = !h.isStar && !$lowPower && discVisible(sx, sy, sr, width, height, margin);');
		expect(src).toContain('const showLine = ringVisible(sx, sy, sr, width, height, margin);');
		expect(src).toContain('if (!showFill && !showLine) continue;');
		// The context is world-transformed, so the test has to be done in the screen space it lands in.
		expect(src).toContain('const sx = width / 2 + (pos.x - renderPan.x) * zoom;');
		expect(src).toContain('const sr = r * zoom;');
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
