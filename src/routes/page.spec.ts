// src/routes/page.spec.ts
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import Page from './+page.svelte';
import { starmapStore } from '$lib/starmapStore';
import { systemStore } from '$lib/stores';
import { hasSavedStarmap, loadSavedStarmap } from '$lib/starmapStorage';
import type { Starmap } from '$lib/types';
import { vi, beforeEach, describe, it, expect } from 'vitest';

// SvelteKit's page store + shallow-routing aren't wired up under Vitest.
// Provide a minimal writable `page` store whose `state` is updated by
// pushState/replaceState, so `$: currentSystemId = $page.state.systemId` works.
const skit = vi.hoisted(() => {
  let value: any = {
    url: new URL('http://localhost/'),
    params: {},
    route: { id: '/' },
    status: 200,
    error: null,
    data: {},
    form: null,
    state: {} as Record<string, unknown>,
  };
  const subs = new Set<(v: any) => void>();
  const notify = () => subs.forEach((fn) => fn(value));
  return {
    page: {
      subscribe(fn: (v: any) => void) {
        subs.add(fn);
        fn(value);
        return () => subs.delete(fn);
      },
    },
    setState(state: Record<string, unknown>) {
      value = { ...value, state };
      notify();
    },
    reset() {
      value = { ...value, state: {} };
      notify();
    },
  };
});

vi.mock('$app/stores', () => ({ page: skit.page }));
vi.mock('$app/navigation', () => ({
  pushState: (_url: string, state: Record<string, unknown>) => skit.setState(state),
  replaceState: (_url: string, state: Record<string, unknown>) => skit.setState(state),
  goto: vi.fn(() => Promise.resolve()),
  beforeNavigate: vi.fn(),
  afterNavigate: vi.fn(),
  onNavigate: vi.fn(),
  invalidate: vi.fn(() => Promise.resolve()),
  invalidateAll: vi.fn(() => Promise.resolve()),
}));

// Mock the rulepack loader
vi.mock('$lib/rulepack-loader', () => ({
  fetchAndLoadRulePack: vi.fn(() =>
    Promise.resolve({ id: 'test-pack', name: 'Test Pack', distributions: { star_types: { entries: [] } } })
  ),
}));

// Mock the api: keep all real exports (SystemView pulls in many), override generateSystem.
vi.mock('$lib/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  generateSystem: vi.fn(() => ({ id: 'new-system', name: 'New System', nodes: [] })),
}));

// jsdom has no IndexedDB; mock the storage layer so onMount resolves deterministically.
//
// E3: KEEP THE REAL EXPORTS AND OVERRIDE ONLY WHAT THE TESTS DRIVE. This used to be a bare object
// listing four exports, and when `loadPreUpgradeStarmap` was added to the module at v2.1.274-beta the
// mock did not grow with it — so `refreshPreUpgradeSnapshot` threw on mount and all four tests failed
// for the next ~118 versions. Nobody noticed, because the suite was never green and so said nothing.
// `importOriginal` makes that class of failure impossible: a new export arrives already present, and
// the pre-upgrade helpers degrade to null/false without IndexedDB by their own design. Same shape as
// the `$lib/api` mock above, for the same reason.
vi.mock('$lib/starmapStorage', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  hasSavedStarmap: vi.fn(() => Promise.resolve(false)),
  loadSavedStarmap: vi.fn(() => Promise.resolve(null)),
  migrateLegacyStarmapToIndexedDb: vi.fn(() => Promise.resolve()),
  saveStarmap: vi.fn(() => Promise.resolve()),
}));

// +page.svelte destructures `exampleSystems` from its SvelteKit `data` prop.
const mockData = { exampleSystems: [] };
const renderPage = () => render(Page, { props: { data: mockData } });

describe('+page.svelte', () => {
  beforeEach(() => {
    starmapStore.set(null);
    systemStore.set(null);
    localStorage.clear();
    skit.reset();
    vi.mocked(hasSavedStarmap).mockResolvedValue(false);
    vi.mocked(loadSavedStarmap).mockResolvedValue(null);
  });

  // E3: these two used to look for a 'Create a New Starmap' heading. It has not existed since the
  // New Starmap screen was reorganised into three ways in (v2.1.403) — so anchor on the section
  // headings, which ARE the screen's meaning, rather than on a title that was only ever decoration.
  it('shows the new-starmap modal when no starmap is saved', async () => {
    const { findByText, getByText } = renderPage();
    expect(await findByText('Start from an example')).toBeInTheDocument();
    expect(getByText('Bring in a map')).toBeInTheDocument();
    expect(getByText('Start empty')).toBeInTheDocument();
  });

  it('creates a new starmap when the form is submitted', async () => {
    const { findByText, getByText } = renderPage();
    await findByText('Start empty');
    await fireEvent.click(getByText('Create Vast Nothingness'));
    // The new starmap (default name "My Starmap") renders its title.
    expect(await findByText('My Starmap')).toBeInTheDocument();
  });

  it('loads and renders a saved starmap on mount', async () => {
    const mockStarmap = { id: 'test-starmap', name: 'Test Starmap', systems: [], routes: [] } as Starmap;
    vi.mocked(hasSavedStarmap).mockResolvedValue(true);
    vi.mocked(loadSavedStarmap).mockResolvedValue(mockStarmap);
    const { findByText } = renderPage();
    expect(await findByText('Test Starmap')).toBeInTheDocument();
  });

  it('switches to the system view when a star is clicked', async () => {
    const mockStarmap = {
      id: 'test-starmap',
      name: 'Test Starmap',
      systems: [
        { id: 'sys1', name: 'System 1', position: { x: 100, y: 100 }, system: { id: 'sys1', name: 'System 1', seed: 'test-seed', nodes: [] } as any },
      ],
      routes: [],
    } as Starmap;
    vi.mocked(hasSavedStarmap).mockResolvedValue(true);
    vi.mocked(loadSavedStarmap).mockResolvedValue(mockStarmap);
    const { container, findByText, queryByText } = renderPage();
    await findByText('Test Starmap');

    // The clickable star is the <g role="button">, not the sibling name label.
    const star = container.querySelector('g[role="button"]') as SVGGElement;
    await fireEvent.click(star);

    // Clicking a star enters that system: systemStore is set and the Starmap
    // view (its heading) is replaced. (The back button has no stable label;
    // SystemView is the god component 01.7 will split.)
    await waitFor(() => expect(get(systemStore)?.id).toBe('sys1'));
    expect(queryByText('Test Starmap')).not.toBeInTheDocument();
  });
});
