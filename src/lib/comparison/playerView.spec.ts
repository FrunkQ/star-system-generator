import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/svelte';
import SizeComparisonView from '$lib/components/SizeComparisonView.svelte';
import { itemsForSystem } from './items';
import { tick } from 'svelte';
import derived from '../../../tests/output/solar-system-derived.json';

// G68 — the size comparison as a PLAYER system view. The difference between the two tiers is CHROME,
// not capability: the strip, the scale, the ruler, the drag and the selection are identical, and
// what a player does not get is the set of controls that are the GM's decision to make.
//
// This is a component test rather than a law test because the rules ARE about what is on screen.

const items = itemsForSystem(derived as any);

// jsdom lays nothing out, so the stage reports 0x0 and the view would (correctly, RENDER-S30) refuse
// to take that as a size. Give it one, or every assertion below is vacuously true against an empty
// strip — which is exactly how the first cut of this file passed while proving nothing.
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () {
    return { width: 900, height: 700, top: 0, left: 0, right: 900, bottom: 700, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
});

const mount = (props: Record<string, unknown>) =>
  render(SizeComparisonView, { props: { items, scope: 'system', mapId: 'sol', ...props } });

/** The names on the strip, in the order they are laid out. Non-empty, or the test proves nothing. */
function stripNames(container: HTMLElement): string[] {
  const names = [...container.querySelectorAll('.label .name')].map((n) => n.textContent?.trim() ?? '');
  expect(names.length).toBeGreaterThan(2);   // never assert against an empty strip
  return names;
}

describe('the size comparison at the player tier', () => {
  it('offers a GM the order pills, the close button and the hide control', () => {
    const { container } = mount({ playerChrome: false, selectedId: items[0].id });
    expect(container.querySelector('.order-pills')).toBeTruthy();
    expect(container.querySelector('.close')).toBeTruthy();
    expect([...container.querySelectorAll('.pill')].some((b) => /Hide/.test(b.textContent ?? ''))).toBe(true);
  });

  it('offers a PLAYER none of them — they are the GM’s decisions, and they live in the preset', () => {
    const { container } = mount({ playerChrome: true, selectedId: items[0].id });
    expect(container.querySelector('.order-pills')).toBeNull();
    // No close button: at the player tier this view IS the system stage, so there is nothing behind
    // it to go back to and a close would leave a blank screen.
    expect(container.querySelector('.close')).toBeNull();
    expect([...container.querySelectorAll('.pill')].some((b) => /Hide/.test(b.textContent ?? ''))).toBe(false);
  });

  it('still shows the strip, the labels and the ruler to a player — the view is not cut down', () => {
    const { container } = mount({ playerChrome: true });
    expect(container.querySelector('.stage')).toBeTruthy();
    expect(container.querySelector('.ruler')).toBeTruthy();
    expect(container.querySelector('canvas')).toBeTruthy();
    expect(container.querySelector('h2')?.textContent).toContain('Size comparison');
  });

  it('keeps your place when the WINDOW changes size — a resize is not a new view', async () => {
    // The opening view is re-armed on a change of CAST (a different map, a different order, a body
    // hidden), never on a change of SIZE: the focus is an index and the scale is derived from it, so
    // both survive a resize by construction. Carrying the viewport in the arming signature meant
    // every resize re-opened the view on its median — and selecting a body with a longer name
    // reflows the header by a pixel, so it fired on a CLICK.
    const { container } = mount({ selectedId: items[0].id });
    await tick();
    const before = stripNames(container);
    // A one-pixel reflow, which is all it took.
    Element.prototype.getBoundingClientRect = function () {
      return { width: 900, height: 699, top: 0, left: 0, right: 900, bottom: 699, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
    window.dispatchEvent(new Event('resize'));
    await tick();
    expect(stripNames(container)).toEqual(before);
  });

  it('takes the ORDER from the preset when one is imposed, and ignores what was remembered', () => {
    // The GM's own remembered order is per-map localStorage; a player's page is the GM's arrangement,
    // so `forcedOrder` wins outright rather than seeding a value the player could then change.
    localStorage.setItem('sse.sizeComparison.hidden.system.sol.order', 'mass');
    const { container } = mount({ playerChrome: true, forcedOrder: 'name' });
    const names = stripNames(container);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    localStorage.clear();
  });

  it('never inherits the GM’s hidden set — what one person stopped looking at is not the map', () => {
    // Venus sits right beside Earth in the opening view, so it is on screen in both mounts and its
    // presence is a real answer rather than an accident of where the strip happens to be scrolled.
    const venus = items.find((i) => i.name === 'Venus')!;
    localStorage.setItem('sse.sizeComparison.hidden.system.sol', JSON.stringify([venus.id]));
    expect(stripNames(mount({ playerChrome: true }).container)).toContain('Venus');
    expect(stripNames(mount({ playerChrome: false }).container)).not.toContain('Venus');
    localStorage.clear();
  });
});
