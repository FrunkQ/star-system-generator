import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { warpUv, NO_WARP } from '$lib/holo/filters/warpPick';
import {
  layoutStrip, slotAt, sortItems, scaleForFocus, focusCentrePx, focusIndexOf, OPENING_SHARE,
  type ComparisonItem
} from './layout';

// PICKING THROUGH THE FILTER (B126). The strip's chrome is drawn INTO the rendered surface now, so a
// distorting preset moves the picture — and a tap has to be mapped through the same warp the shader
// applies before it can be hit-tested, or it lands where the picture used to be.

const body = (name: string, radiusKm: number, role: string): ComparisonItem =>
  ({ id: name.toLowerCase(), name, diameterKm: radiusKm * 2, role });

const SOL: ComparisonItem[] = [
  body('Jupiter', 69911, 'planet'),
  body('Earth', 6371, 'planet'),
  body('Venus', 6051.8, 'planet'),
  body('Mars', 3389.5, 'planet')
];

const VW = 1200, VH = 800;

/** The view's own arrangement, focused on `id`. */
function view(id: string) {
  const seq = sortItems(SOL, 'size');
  const f = focusIndexOf(seq, id);
  const scale = scaleForFocus(seq, f, Math.min(VW, VH), OPENING_SHARE);
  const layout = layoutStrip(SOL, scale, { axis: 'x' });
  return { layout, scrollPx: focusCentrePx(layout, seq, f) - VW / 2 };
}

/**
 * The view's pointer path, in one place: client point -> screen uv (y-UP) -> the shader's forward
 * warp -> view px -> strip coordinates -> `slotAt`. Written out here rather than imported because
 * the component owns it; if the two ever disagree this gate is the thing that says so.
 */
function pickAt(px: number, py: number, warp: Parameters<typeof warpUv>[2], v = view('earth')) {
  const su = px / VW;
  const sv = 1 - py / VH;
  const [u, vv] = warpUv(su, sv, warp);
  const sx = u * VW, sy = (1 - vv) * VH;
  return slotAt(v.layout, sx + v.scrollPx, sy - VH / 2)?.name ?? null;
}

describe('size comparison — a tap lands on what the eye sees', () => {
  it('hits the object under the finger when nothing is distorting', () => {
    const v = view('earth');
    const earth = v.layout.slots.find((s) => s.name === 'Earth')!;
    // The focused body is dead centre, by the focus law.
    expect(pickAt(VW / 2, VH / 2, NO_WARP, v)).toBe('Earth');
    // Its neighbour, at its own centre.
    const venus = v.layout.slots.find((s) => s.name === 'Venus')!;
    expect(pickAt(venus.centrePx - v.scrollPx, VH / 2, NO_WARP, v)).toBe('Venus');
    // And empty sky is empty sky, rather than the nearest thing.
    expect(pickAt(VW / 2, VH / 2 - earth.spanPx, NO_WARP, v)).toBe(null);
  });

  it('is an EXACT identity with the filter off — a GM tap must not move by an epsilon', () => {
    for (const [su, sv] of [[0.1, 0.9], [0.5, 0.5], [0.83, 0.24]] as const) {
      expect(warpUv(su, sv, NO_WARP)).toEqual([su, sv]);
    }
  });

  it('follows the picture under a barrel warp instead of staying where the DOM would be', () => {
    // A ROW OF EQUAL WORLDS, so the gate is about the pick path rather than about Sol: the barrel
    // displacement grows with the square of the distance from the centre, so the body that proves it
    // is one near the EDGE. Nine 60 px worlds, 120 px apart, focused on the middle one.
    const row = { axis: 'x' as const, lengthPx: 1200, crossReachPx: 0, slots: Array.from({ length: 9 }, (_, i) => ({
      id: `w${i}`, name: `W${i}`, diameterPx: 60, spanPx: 60, reachPx: 60, ringInnerPx: 0, ringOuterPx: 0,
      centrePx: 120 * i + 60, crossPx: 0, depth: 0, belowFloor: false, labelSide: 'start' as const
    })) };
    const scrollPx = row.slots[4].centrePx - VW / 2;
    const at = (px: number, w: Parameters<typeof warpUv>[2]) => {
      const [u, vv] = warpUv(px / VW, 1 - (VH / 2) / VH, w);
      return slotAt(row, u * VW + scrollPx, (1 - vv) * VH - VH / 2)?.name ?? null;
    };
    const warp = { warp: 0.6, roll: 0, skew: 0, time: 0 };
    const target = row.slots[8];                       // the far edge, where the warp actually bites
    const drawnU = (target.centrePx - scrollPx) / VW;
    // Where the eye SEES it: asked of the forward map by bisection, because the shader owns that map
    // and a second closed form of it here would be the very fault this file is about.
    const seenPx = solveScreenFor(drawnU, warp) * VW;
    // The two readings of that ONE screen point differ by more than the world is wide, so a hit test
    // that skipped the warp would be looking at a different part of the strip.
    expect(Math.abs(seenPx - drawnU * VW)).toBeGreaterThan(target.spanPx);
    expect(at(seenPx, warp)).toBe('W8');
    expect(at(seenPx, NO_WARP)).not.toBe('W8');
    // ...and with the filter off the drawn place is the seen place, exactly.
    expect(at(drawnU * VW, NO_WARP)).toBe('W8');
  });

  it('carries the picture ROLL, so a tap mid-roll lands on the row the eye is looking at', () => {
    // The roll wraps, which is why it is a fract rather than an add: at time 2 with roll 0.25 the
    // picture has gone round half a screen and come back.
    const rolled = warpUv(0.5, 0.5, { warp: 0, roll: 0.25, skew: 0, time: 2 });
    expect(rolled[0]).toBeCloseTo(0.5, 9);
    expect(rolled[1]).toBeCloseTo(0, 9);
    expect(warpUv(0.5, 0.5, { warp: 0, roll: 0.25, skew: 0, time: 4 })[1]).toBeCloseTo(0.5, 9);
  });
});

/**
 * Where on screen a source point `u` APPEARS under a barrel warp — the inverse of what `warpUv` does,
 * found by bisection because the forward map is what the shader owns and nobody should write a second
 * closed form of it here.
 */
function solveScreenFor(targetU: number, warp: Parameters<typeof warpUv>[2]): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (warpUv(mid, 0.5, warp)[0] < targetU) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// THE PREVIEW MUST NOT DESCRIBE A VIEW THAT DOES NOT EXIST. That is exactly what B126 recorded: the
// live branch shipped with no filter while the editor's preview wrapped its copy in one, so the
// preview showed a CRT the player would never see. A source check rather than a render, because what
// went wrong was the WIRING of two call sites, and only reading both can catch that.
describe('size comparison — the live mount and the preview agree', () => {
  const files = {
    live: 'src/routes/catalogue/+page.svelte',
    preview: 'src/lib/components/PlayerPresetEditor.svelte'
  };

  it('offers the size comparison on BOTH stages, and mounts it on both', () => {
    // Owner, 2026-09-06: "This may work on player view - but we have not enabled that under starmap
    // as an option - we really should!" The strip was a SYSTEM view only; the starmap could show it
    // to a GM and never to a player.
    const editor = readFileSync(files.preview, 'utf8');
    // Both selects offer it...
    const systemSel = editor.slice(editor.indexOf('bind:value={draft.systemView}'));
    const starmapSel = editor.slice(editor.indexOf('bind:value={draft.starmapView}'));
    expect(systemSel.slice(0, 400)).toContain('value="sizecompare"');
    expect(starmapSel.slice(0, 400)).toContain('value="sizecompare"');
    // ...and BOTH stages actually mount the view, or the option is a promise the app does not keep.
    const live = readFileSync(files.live, 'utf8');
    expect(live).toContain('itemsForStarmap');
    expect(live).toContain("starmapView === 'sizecompare'");
    expect((live.match(/<SizeComparisonView/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((editor.match(/<SizeComparisonView/g) || []).length).toBeGreaterThanOrEqual(2);
    // AND THE STARMAP MOUNT DISPATCHES NOTHING ([[B125]]): `handleSystemClick` ENTERS a system, so a
    // tap wired outward would throw a player out of the view they are reading.
    const smAt = live.indexOf("starmapView === 'sizecompare'");
    const smTag = live.slice(live.indexOf('<SizeComparisonView', smAt), live.indexOf('/>', live.indexOf('<SizeComparisonView', smAt)));
    expect(smTag).not.toContain('on:select');
    expect(smTag).toContain('scope="starmap"');
  });

  it('passes the preset’s REAL filter at both mounts, and wraps neither in the CSS approximation', () => {
    for (const [which, path] of Object.entries(files)) {
      const src = readFileSync(path, 'utf8');
      const at = src.indexOf('<SizeComparisonView');
      expect(at, `${which} mounts the view`).toBeGreaterThan(-1);
      const tag = src.slice(at, src.indexOf('/>', at));
      expect(tag, `${which} passes a filter`).toContain('filterId=');
      expect(tag, `${which} passes the ruler switch`).toContain('showRuler=');
      // No `FilterFrame` opened in the run-up to the mount: the view runs the real shader itself, and
      // the approximation over the top would tint the picture twice and still not warp the text.
      expect(src.slice(Math.max(0, at - 600), at), `${which} does not wrap it`).not.toContain('<FilterFrame');
    }
  });
});

// THE STRIP HAS TO ASK FOR THE WHITE CORE, and no unit test can watch it do so: `comparisonScene`
// needs a WebGL context to build anything. The seam is one line, it is the whole of the owner's
// "why do stars look so DULL on this?", and a silent deletion would put the pastel discs straight
// back - so it is read out of the SOURCE, the same way the two mount sites are above.
describe('the size comparison asks for a star that reads as a light source', () => {
  const scene = readFileSync('src/lib/holo/comparisonScene.ts', 'utf8');

  it('turns the corona off and pays for it with the rim AND the burnt-out core', () => {
    // Corona off is the measuring view's promise (RENDER-S53); the other two are what stop that
    // promise from making a star look like paint.
    expect(scene).toMatch(/starDecorations:\s*false/);
    expect(scene).toMatch(/starRim:\s*true/);
    expect(scene).toMatch(/starCore:\s*starCoreWhiteFor\(/);
  });

  it('reads the core from the star\u2019s own COLOUR, so two stars on one strip differ', () => {
    // Not a constant: a flat number would whiten a red dwarf as hard as Vega, which is the fault
    // upside down. `slot.colorHex` is the per-star source.
    expect(scene).toMatch(/starCore:\s*starCoreWhiteFor\(slot\.colorHex,\s*slot\.node\?\.temperatureK\)/);
  });
});
