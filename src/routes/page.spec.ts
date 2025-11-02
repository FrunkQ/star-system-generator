// src/routes/page.spec.ts
import { render, fireEvent } from '@testing-library/svelte';
import Page from './+page.svelte';
import { starmapStore } from '$lib/starmapStore';
import { systemStore } from '$lib/stores';
import type { Starmap } from '$lib/types';
import { vi } from 'vitest';

// Mock the rulepack loader
vi.mock('$lib/rulepack-loader', () => ({
  fetchAndLoadRulePack: vi.fn(() => Promise.resolve({ id: 'test-pack', name: 'Test Pack', distributions: { star_types: { entries: [] } } })),
}));

// Mock the api
vi.mock('$lib/api', () => ({
  generateSystem: vi.fn(() => ({ id: 'new-system', name: 'New System', nodes: [] })),
}));

describe('+page.svelte', () => {
  beforeEach(() => {
    starmapStore.set(null);
    systemStore.set(null);
    localStorage.clear();
  });

  it('shows the new starmap modal when no starmap is in local storage', () => {
    const { getByText } = render(Page);
    expect(getByText('New Starmap')).toBeInTheDocument();
  });

  it('creates a new starmap when the form is submitted', async () => {
    const { getByText, component } = render(Page);
    const createButton = getByText('Create');
    await fireEvent.click(createButton);
    expect(getByText('My Starmap')).toBeInTheDocument();
  });

  it('loads a starmap from local storage', () => {
    const mockStarmap: Starmap = {
      id: 'test-starmap',
      name: 'Test Starmap',
      systems: [],
      routes: [],
    };
    localStorage.setItem('stargen_saved_starmap', JSON.stringify(mockStarmap));
    const { getByText } = render(Page);
    expect(getByText('Test Starmap')).toBeInTheDocument();
  });

  it('switches to the system view when a star is clicked', async () => {
    const mockStarmap: Starmap = {
      id: 'test-starmap',
      name: 'Test Starmap',
      systems: [{ id: 'sys1', name: 'System 1', position: { x: 100, y: 100 }, system: { id: 'sys1', name: 'System 1', nodes: [] } as any }],
      routes: [],
    };
    starmapStore.set(mockStarmap);
    const { getByText, component } = render(Page);
    const star = getByText('System 1');
    await fireEvent.click(star);
    expect(getByText('Back to Starmap')).toBeInTheDocument();
  });
});
