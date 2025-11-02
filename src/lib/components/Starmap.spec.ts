// src/lib/components/Starmap.spec.ts
import { render, fireEvent } from '@testing-library/svelte';
import Starmap from './Starmap.svelte';
import type { Starmap as StarmapType } from '$lib/types';
import { vi } from 'vitest';
import { onMount, onDestroy } from 'svelte';

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
  systems: [
    { id: 'sys1', name: 'System 1', position: { x: 100, y: 100 }, system: { id: 'sys1', name: 'System 1', nodes: [{ id: 'star1', parentId: null, kind: 'body', roleHint: 'star', classes: ['star/G2V'] }] } as any },
    { id: 'sys2', name: 'System 2', position: { x: 200, y: 200 }, system: { id: 'sys2', name: 'System 2', nodes: [{ id: 'star2', parentId: null, kind: 'body', roleHint: 'star', classes: ['star/M5V'] }] } as any },
  ],
  routes: [
    { id: 'route1', sourceSystemId: 'sys1', targetSystemId: 'sys2', distance: 5, unit: 'J' },
  ],
};

describe('Starmap.svelte', () => {
  it('renders the starmap with systems and routes', () => {
    const { getByText } = render(Starmap, { starmap: mockStarmap, rulePacks: [] });

    expect(getByText('Test Starmap')).toBeInTheDocument();
    expect(getByText('System 1')).toBeInTheDocument();
    expect(getByText('System 2')).toBeInTheDocument();
    expect(getByText('J5')).toBeInTheDocument();
  });

  it('dispatches a systemclick event when a star is clicked', async () => {
    const { getByText, component } = render(Starmap, { starmap: mockStarmap, rulePacks: [] });
    const dispatch = vi.fn();
    component.$on('systemclick', dispatch);

    const star = getByText('System 1');
    await fireEvent.click(star);

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ detail: 'sys1' }));
  });

  it('dispatches a systemzoom event when a star is double-clicked', async () => {
    const { getByText, component } = render(Starmap, { starmap: mockStarmap, rulePacks: [] });
    const dispatch = vi.fn();
    component.$on('systemzoom', dispatch);

    const star = getByText('System 1');
    await fireEvent.dblClick(star);

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ detail: 'sys1' }));
  });

  it('shows a context menu when a star is right-clicked', async () => {
    const { getByText, queryByText } = render(Starmap, { starmap: mockStarmap, rulePacks: [] });

    expect(queryByText('Zoom In')).not.toBeInTheDocument();

    const star = getByText('System 1');
    await fireEvent.contextMenu(star);

    expect(getByText('Zoom In')).toBeInTheDocument();
    expect(getByText('Link System')).toBeInTheDocument();
    expect(getByText('Delete System')).toBeInTheDocument();
  });

  it('dispatches a toggleaddsystemmode event when the "Add System" button is clicked', async () => {
    const { getByText, component } = render(Starmap, { starmap: mockStarmap, rulePacks: [] });
    const dispatch = vi.fn();
    component.$on('toggleaddsystemmode', dispatch);

    const addButton = getByText('Add System');
    await fireEvent.click(addButton);

    expect(dispatch).toHaveBeenCalled();
  });
});