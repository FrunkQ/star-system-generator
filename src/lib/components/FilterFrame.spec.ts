// AN OVERLAY IMAGE UNDER A CRT PRESET WASHED THE WHOLE SCREEN IN PHOSPHOR (Discord, reported twice).
//
// `FilterFrame` is the CSS approximation of a look filter, and three of its four layers are
// WHOLE-FRAME: a solid tint under `mix-blend-mode: color`, a scanline sheet and a vignette. Around
// an opaque surface that is the design. Around a preset's overlay graphic it is a fault twice over:
// the graphic is mostly transparent and sits in `.overlay-wrap`, which has a z-index and is
// therefore its own stacking context - so the tint has nothing beneath it to colour, the blend
// degenerates to plain source-over, and a film of solid phosphor covers the stage the real shader
// has already filtered. No test mounted the frame, so nothing could say which layers it paints.
//
// The frame is mounted here in both modes, the tint maths is pinned as numbers, and the two files
// that mount an overlay graphic are read for the flag - the same source-reading seam
// `comparison/picking.spec.ts` uses for mounts that cannot be rendered in jsdom.
import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import FilterFrame from './FilterFrame.svelte';
import { cssFilterApprox, graphicTintMatrix } from '$lib/player/cssFilterApprox';

const CRT = { phosphor: '#4dff88', tint: 0.8, scanlineIntensity: 0.4, vignetteAmount: 0.5, brightness: 1.85, contrast: 0.85 };

/** The content's inline style, with the space jsdom puts after each colon taken back out. */
const styleOf = (container: HTMLElement) => ((container.querySelector('.content') as HTMLElement).getAttribute('style') ?? '').replace(/:\s+/g, ':');

describe('FilterFrame around a transparent overlay graphic', () => {
  it('paints NO whole-frame layer: no tint sheet, no scanline sheet, no vignette', () => {
    const { container } = render(FilterFrame, { props: { filterId: 'crt', params: CRT, active: true, graphic: true } });
    // Absolute, not a ratio: one of these elements is the whole fault.
    expect(container.querySelectorAll('.tint').length).toBe(0);
    expect(container.querySelectorAll('.scan').length).toBe(0);
    expect(container.querySelectorAll('.vig').length).toBe(0);
  });

  it('still tints the graphic itself, per pixel, through a colour matrix on the content', () => {
    const { container } = render(FilterFrame, { props: { filterId: 'crt', params: CRT, active: true, graphic: true } });
    const filter = container.querySelector('filter');
    expect(filter, 'an SVG filter is defined for the tint').not.toBeNull();
    const id = filter!.getAttribute('id')!;
    const style = styleOf(container);
    expect(style).toContain(`url(#${id})`);
    expect(style).toContain('brightness(1.85)');
    const values = container.querySelector('feColorMatrix')!.getAttribute('values')!.split(' ').map(Number);
    expect(values).toHaveLength(20);
    // The alpha row is the identity: a transparent pixel of the overlay stays transparent, which is
    // the property the solid tint sheet did not have.
    expect(values.slice(15)).toEqual([0, 0, 0, 1, 0]);
  });

  it('gives two frames two filter ids, because an SVG filter is found by document-wide id', () => {
    const a = render(FilterFrame, { props: { filterId: 'crt', params: CRT, active: true, graphic: true } });
    const b = render(FilterFrame, { props: { filterId: 'crt', params: CRT, active: true, graphic: true } });
    const ida = a.container.querySelector('filter')!.getAttribute('id');
    const idb = b.container.querySelector('filter')!.getAttribute('id');
    expect(ida).not.toBe(idb);
  });

  it('is a plain pass-through when the filter is off', () => {
    const { container } = render(FilterFrame, { props: { filterId: 'crt', params: CRT, active: false, graphic: true } });
    expect(container.querySelector('filter')).toBeNull();
    expect(styleOf(container)).toContain('filter:none');
  });

  it('leaves the SURFACE frame exactly as it was: all three sheets, no matrix', () => {
    const { container } = render(FilterFrame, { props: { filterId: 'crt', params: CRT, active: true } });
    expect(container.querySelectorAll('.tint').length).toBe(1);
    expect(container.querySelectorAll('.scan').length).toBe(1);
    expect(container.querySelectorAll('.vig').length).toBe(1);
    expect(container.querySelector('filter')).toBeNull();
    const fx = cssFilterApprox('crt', CRT);
    expect(styleOf(container)).toContain(`filter:${fx.containerFilter}`);
  });
});

describe('graphicTintMatrix is the `color` blend, per pixel', () => {
  const apply = (m: number[], rgb: number[]) => [0, 1, 2].map((r) => m[r * 5] * rgb[0] + m[r * 5 + 1] * rgb[1] + m[r * 5 + 2] * rgb[2] + m[r * 5 + 4]);
  const lum = (c: number[]) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

  it('is the identity at zero strength', () => {
    expect(graphicTintMatrix('#4dff88', 0)).toEqual([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
  });

  it('at full strength keeps the pixel’s luminosity and takes the phosphor’s hue', () => {
    const m = graphicTintMatrix('#4dff88', 1);
    for (const px of [[0.5, 0.5, 0.5], [0.9, 0.2, 0.1], [0.1, 0.3, 0.8]]) {
      const out = apply(m, px);
      expect(lum(out)).toBeCloseTo(lum(px), 10);
      // Green phosphor: green is the strongest channel and red the weakest, whatever went in.
      expect(out[1]).toBeGreaterThan(out[2]);
      expect(out[2]).toBeGreaterThan(out[0]);
    }
  });

  it('never writes alpha, at any strength or colour', () => {
    for (const k of [0, 0.36, 0.44, 1]) for (const hex of ['#4dff88', '#ffb000', '#ffffff']) {
      expect(graphicTintMatrix(hex, k).slice(15)).toEqual([0, 0, 0, 1, 0]);
      // and no colour row reads alpha either (column 4 of each row)
      const m = graphicTintMatrix(hex, k);
      expect([m[3], m[8], m[13]]).toEqual([0, 0, 0]);
    }
  });
});

describe('every overlay graphic is mounted as a graphic', () => {
  const files = {
    'the player view': 'src/routes/catalogue/+page.svelte',
    'the preset editor preview': 'src/lib/components/PlayerPresetEditor.svelte'
  };
  for (const [which, path] of Object.entries(files)) {
    it(`${which} never wraps a GraphicLayer in a whole-frame FilterFrame`, () => {
      const src = readFileSync(path, 'utf8');
      const mounts = [...src.matchAll(/<FilterFrame\b([^>]*)>\s*<GraphicLayer\b/g)];
      // Three in each file today (starmap strip, holo fallback / generic preview, system strip).
      expect(mounts.length, `${which} mounts overlay graphics`).toBeGreaterThanOrEqual(1);
      for (const m of mounts) expect(m[1], `${which}: ${m[0].slice(0, 60)}`).toMatch(/\bgraphic\b/);
    });
  }
});
