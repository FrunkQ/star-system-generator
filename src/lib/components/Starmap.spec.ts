// src/lib/components/Starmap.spec.ts
import { render, fireEvent } from '@testing-library/svelte';
import Starmap from './Starmap.svelte';
import type { Starmap as StarmapType, RulePack } from '$lib/types';
import { vi } from 'vitest';
import { tick } from 'svelte';

// Starmap uses createEventDispatcher (Svelte legacy). Under Svelte 5 the
// instance `$on` API is gone; listen via @testing-library/svelte's `events`
// mount option, which forwards to Svelte.mount({ events }).

const mockStarmap: StarmapType = {
  id: 'test-starmap',
  name: 'Test Starmap',
  distanceUnit: 'J',
  unitIsPrefix: true,
  systems: [
    { id: 'sys1', name: 'System 1', position: { x: 100, y: 100 }, system: { id: 'sys1', name: 'System 1', nodes: [{ id: 'star1', parentId: null, kind: 'body', roleHint: 'star', classes: ['star/G2V'] }] } as any },
    { id: 'sys2', name: 'System 2', position: { x: 200, y: 200 }, system: { id: 'sys2', name: 'System 2', nodes: [{ id: 'star2', parentId: null, kind: 'body', roleHint: 'star', classes: ['star/M5V'] }] } as any },
  ],
  routes: [
    { id: 'route1', sourceSystemId: 'sys1', targetSystemId: 'sys2', distance: 5, unit: 'J' },
  ],
} as unknown as StarmapType;

const emptyRulePack = {} as RulePack;

const renderStarmap = (events: Record<string, (e: Event) => void> = {}) =>
  render(Starmap, { props: { starmap: mockStarmap, rulePack: emptyRulePack }, events });

// The clickable star is the <g role="button">; the visible name label is a
// sibling <text> outside it, so we must target the group to drive handlers.
// Groups render in `systems` order, so index 0 === sys1.
const starGroup = (container: HTMLElement, index = 0) =>
  container.querySelectorAll('g[role="button"]')[index] as SVGGElement;

describe('Starmap.svelte', () => {
  it('renders the starmap with systems and routes', () => {
    const { getByText } = renderStarmap();

    expect(getByText('Test Starmap')).toBeInTheDocument();
    expect(getByText('System 1')).toBeInTheDocument();
    expect(getByText('System 2')).toBeInTheDocument();
    // Route label: unitIsPrefix => `${distanceUnit}${distance.toFixed(2)}`
    expect(getByText('J5.00')).toBeInTheDocument();
  });

  it('dispatches a systemclick event when a star is clicked', async () => {
    const systemclick = vi.fn();
    const { container } = renderStarmap({ systemclick });

    await fireEvent.click(starGroup(container));

    expect(systemclick).toHaveBeenCalledWith(expect.objectContaining({ detail: 'sys1' }));
  });

  it('dispatches a systemzoom event when a star is double-clicked', async () => {
    const systemzoom = vi.fn();
    const { container } = renderStarmap({ systemzoom });

    await fireEvent.dblClick(starGroup(container));

    expect(systemzoom).toHaveBeenCalledWith(expect.objectContaining({ detail: 'sys1' }));
  });

  it('shows a context menu when a star is right-clicked', async () => {
    const { container, queryByText, getByText } = renderStarmap();

    expect(queryByText('Rename System…')).not.toBeInTheDocument();

    await fireEvent.contextMenu(starGroup(container));

    expect(getByText('Rename System…')).toBeInTheDocument();
    expect(getByText('Delete System')).toBeInTheDocument();
    expect(queryByText('Zoom to System')).not.toBeInTheDocument(); // removed — unnecessary
  });

  it('dispatches a deletesystem event from the context menu', async () => {
    const deletesystem = vi.fn();
    const { container, getByText } = renderStarmap({ deletesystem });

    await fireEvent.contextMenu(starGroup(container));
    await fireEvent.click(getByText('Delete System'));

    expect(deletesystem).toHaveBeenCalledWith(expect.objectContaining({ detail: 'sys1' }));
  });
});

// A17. The measure tool lost DEPTH at the pick, not in the maths: `measurePick` took only x and y, so
// `posZ` read both ends as the reference plane and the 3D branch returned the planar answer however the
// campaign was configured. That is invisible to a unit test of `systemSeparation` — the module was always
// right — so this drives the REAL path: turn the ruler on, tap two stars, read the label.
//
// Geometry chosen so both answers are exact: 40 apart in plan, 9 apart in depth, hence 41 in 3D.
describe('Starmap.svelte — measure tool depth (A17)', () => {
  const depthMap = (ignoreZ: boolean): StarmapType => ({
    id: 'depth-map',
    name: 'Depth Map',
    distanceUnit: 'ly',
    unitIsPrefix: false,
    mapMode: 'scaled',
    scale: { unit: 'ly', pixelsPerUnit: 1, showScaleBar: true },
    ignoreZForDistances: ignoreZ,
    systems: [
      { id: 'a', name: 'Above', position: { x: 0, y: 0, z: 4.5 }, system: { id: 'a', name: 'Above', nodes: [{ id: 'sa', parentId: null, kind: 'body', roleHint: 'star', classes: ['star/G2V'] }] } as any },
      { id: 'b', name: 'Below', position: { x: 40, y: 0, z: -4.5 }, system: { id: 'b', name: 'Below', nodes: [{ id: 'sb', parentId: null, kind: 'body', roleHint: 'star', classes: ['star/M5V'] }] } as any },
    ],
    routes: [],
  } as unknown as StarmapType);

  const measureBoth = async (ignoreZ: boolean) => {
    const { container } = render(Starmap, { props: { starmap: depthMap(ignoreZ), rulePack: emptyRulePack } });
    // jsdom reports no container size, so AppShell settles into its compact layout and the rail starts
    // behind the menu button. Open it to reach the ruler.
    const openMenu = [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Open menu') as HTMLButtonElement | undefined;
    if (openMenu) await fireEvent.click(openMenu);
    const ruler = container.querySelector('button[title^="Measure"]') as HTMLButtonElement;
    expect(ruler).toBeTruthy(); // the ruler is only offered on a SCALED map
    await fireEvent.click(ruler);
    await fireEvent.click(starGroup(container, 0));
    await fireEvent.click(starGroup(container, 1));
    return container.querySelector('.measure-label')?.textContent?.trim();
  };

  it('reports the 3D separation when the campaign counts depth', async () => {
    // 40 in plan + 9 of depth = 41. Before the fix this read 40: the depth never reached the endpoint.
    expect(await measureBoth(false)).toBe('41 ly');
  });

  it('reports the planar separation when the campaign ignores depth', async () => {
    expect(await measureBoth(true)).toBe('40 ly');
  });
});

// A82 — THE HOVER SUMMARY, and the two rules that are easy to lose in a refactor: the card is
// MOUSE-ONLY (there is no hover on a touch screen, and a card that appeared on tap would cover
// the star the tap was aimed at), and it goes away again. The counts themselves are gated in
// `starmap/systemSummary.spec.ts`; this is only about the pointer.
describe('A82 — the hover summary', () => {
  // The shell decides desktop-vs-phone from a `(min-width: 900px) and (pointer: fine)` query,
  // and the suite's jsdom stub answers `false` to everything - so every other test in this file
  // runs in PHONE mode, where the card is deliberately not offered. Say desktop for these three.
  const realMM = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({
      matches: true, media: q, onchange: null,
      addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
      dispatchEvent: () => false
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => { window.matchMedia = realMM; });

  const enter = (el: Element, pointerType: string) =>
    el.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, pointerType, clientX: 40, clientY: 40 }));

  it('shows the system’s summary when a MOUSE hovers a star', async () => {
    const { container } = renderStarmap();
    expect(container.querySelector('.star-summary')).toBeNull();
    enter(starGroup(container, 0), 'mouse');
    await tick();
    const card = container.querySelector('.star-summary');
    expect(card).toBeTruthy();
    expect(card!.textContent).toContain('System 1');
    expect(card!.textContent).toMatch(/G2V/);
  });

  it('shows NOTHING on a touch pointer', async () => {
    const { container } = renderStarmap();
    enter(starGroup(container, 0), 'touch');
    await tick();
    expect(container.querySelector('.star-summary')).toBeNull();
  });

  it('goes away on leave, and on a press — a tooltip over a context menu is noise', async () => {
    const { container } = renderStarmap();
    const g = starGroup(container, 0);
    enter(g, 'mouse');
    await tick();
    expect(container.querySelector('.star-summary')).toBeTruthy();
    g.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true, pointerType: 'mouse' }));
    await tick();
    expect(container.querySelector('.star-summary')).toBeNull();

    enter(g, 'mouse');
    await tick();
    g.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
    await tick();
    expect(container.querySelector('.star-summary')).toBeNull();
  });
});
