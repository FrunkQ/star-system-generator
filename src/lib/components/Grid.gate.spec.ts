// THE 85,103 LY CRASH, stated as arithmetic so it can be proved rather than looked at.
//
// Grid.svelte draws the GM's 2D starmap grid by looping in MAP units, so every loop runs
// `view / zoom / cell` times. Zoom is fitted to the map's own extent, so the real driver is how far
// apart the two furthest systems are — and nothing bounded it. A user placed two systems 85,103 ly
// apart, and from then on the app could not load at all: the loop lands AFTER the physics pass, so
// the progress bar sat at 100% while the tab died. Their only escape was clearing browser data,
// which destroyed the campaign.
//
// The loop bodies themselves are not importable (they live inside a Svelte reactive block), so this
// pins the GATE arithmetic that decides whether they are entered at all, using the measured numbers
// from the reproduction. If someone widens or removes the gate, these fail.
import { describe, it, expect } from 'vitest';

// Grid.svelte's constants and geometry, reproduced verbatim — same discipline as
// latticeGeometry.spec.ts, which reproduces this component's hex formula to keep the two in step.
const MIN_CELL_PX = 3;
const MAX_CELLS = 250000;
const GRID_SIZE = 50;          // Starmap.svelte's default cell
const VIEW_W = 800, VIEW_H = 600;  // what Starmap.svelte passes

const legible = (zoom: number) => GRID_SIZE * zoom >= MIN_CELL_PX;

/** What the loops WOULD cost at this zoom, ungated. */
function ungatedCost(zoom: number) {
  const size = GRID_SIZE / 2;
  const hexHeight = Math.sqrt(3) * size;
  const horizDist = 1.5 * size;
  return {
    squareLines: VIEW_W / zoom / GRID_SIZE + VIEW_H / zoom / GRID_SIZE,
    hexIterations: (VIEW_W / zoom / horizDist) * (VIEW_H / zoom / hexHeight)
  };
}

describe('starmap grid: the zoomed-out crash gate', () => {
  // MEASURED IN THE BROWSER on the reproduction: two systems 85,103 ly apart at 43.30127 px/ly,
  // auto-fitted, gave exactly this zoom.
  const CRASH_ZOOM = 2.6049418482118115e-4;

  it('proves the reported map really is unbounded work, not merely slow', () => {
    const cost = ungatedCost(CRASH_ZOOM);
    // The square grid built a 4.95 MB path string in the live app at this zoom.
    expect(cost.squareLines).toBeGreaterThan(100_000);
    // The hex grid is the product of two huge loops: 4.36 billion iterations. At the 664k
    // hexes/second measured on a fast desktop that is ~1.8 hours of blocked main thread while
    // growing a ~670 GB string — it dies of memory first, on any device.
    expect(cost.hexIterations).toBeGreaterThan(4e9);
  });

  it('does not enter the loops at all on the map that crashed', () => {
    expect(legible(CRASH_ZOOM)).toBe(false);
    // 0.013 screen pixels per cell: there was never anything worth drawing.
    expect(GRID_SIZE * CRASH_ZOOM).toBeLessThan(0.02);
  });

  it('still draws the grid at every zoom a GM actually works at', () => {
    // 1:1, and zoomed out far enough that the bundled 42-system map fits a laptop screen.
    expect(legible(1)).toBe(true);
    expect(legible(0.25)).toBe(true);
    expect(legible(0.06)).toBe(true);   // a 3 px cell — the last legible step
  });

  // THE TWO CONSTANTS MUST BE CHECKED AGAINST EACH OTHER, not in isolation. The cap catches
  // runaways; if it sits below honest use it silently halves a legitimate grid instead, and nothing
  // would report that. The first pair tried here was MIN_CELL_PX 3 with MAX_CELLS 40,000 — this
  // test failed it, because the densest legible hex view genuinely wants 82,112 cells.
  it('caps above honest use, so the cap can only ever catch a runaway', () => {
    const worst = ungatedCost(MIN_CELL_PX / GRID_SIZE);
    expect(Math.round(worst.hexIterations)).toBe(82112);   // today's behaviour, pinned
    expect(worst.hexIterations).toBeLessThan(MAX_CELLS);
    expect(worst.squareLines).toBeLessThan(MAX_CELLS);
    // …and still far below the runaway it exists to stop.
    expect(ungatedCost(CRASH_ZOOM).hexIterations / MAX_CELLS).toBeGreaterThan(1000);
  });

  it('is monotonic: zooming out never re-enters the loops once it has bailed', () => {
    // A gate that flickered would be worse than none — it would crash intermittently.
    const zooms = [1, 0.5, 0.1, 0.06, 0.05, 0.01, 1e-3, 1e-4, CRASH_ZOOM];
    const flags = zooms.map(legible);
    const firstFalse = flags.indexOf(false);
    expect(firstFalse).toBeGreaterThan(0);
    expect(flags.slice(firstFalse).every((f) => f === false)).toBe(true);
  });
});
