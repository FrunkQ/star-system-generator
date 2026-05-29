// src/lib/components/Starmap.spec.ts
import { render, fireEvent } from '@testing-library/svelte';
import Starmap from './Starmap.svelte';
import type { Starmap as StarmapType, RulePack } from '$lib/types';
import { vi } from 'vitest';

// Starmap uses createEventDispatcher (Svelte legacy). Under Svelte 5 the
// instance `$on` API is gone; listen via @testing-library/svelte's `events`
// mount option, which forwards to Svelte.mount({ events }).

vi.mock('@panzoom/panzoom', () => ({
  __esModule: true,
  default: vi.fn(() => ({
    destroy: vi.fn(),
    getTransform: vi.fn(() => ({ x: 0, y: 0, scale: 1 })),
    zoomWithWheel: vi.fn(),
  })),
}));

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

    expect(queryByText('Zoom to System')).not.toBeInTheDocument();

    await fireEvent.contextMenu(starGroup(container));

    expect(getByText('Zoom to System')).toBeInTheDocument();
    expect(getByText('Delete System')).toBeInTheDocument();
  });

  it('dispatches a deletesystem event from the context menu', async () => {
    const deletesystem = vi.fn();
    const { container, getByText } = renderStarmap({ deletesystem });

    await fireEvent.contextMenu(starGroup(container));
    await fireEvent.click(getByText('Delete System'));

    expect(deletesystem).toHaveBeenCalledWith(expect.objectContaining({ detail: 'sys1' }));
  });
});
