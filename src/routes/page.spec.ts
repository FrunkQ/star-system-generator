// src/routes/page.spec.ts
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import Page from './+page.svelte';
import { starmapStore } from '$lib/starmapStore';
import { systemStore } from '$lib/stores';
import { hasSavedStarmap, loadSavedStarmap, saveStarmap, savePreUpgradeStarmap } from '$lib/starmapStorage';
import { settleBeforeReload } from '$lib/util/beforeReload';
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
  savePreUpgradeStarmap: vi.fn(() => Promise.resolve(true)),
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
    vi.mocked(saveStarmap).mockReset().mockResolvedValue(undefined);
    vi.mocked(savePreUpgradeStarmap).mockReset().mockResolvedValue(true);
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

  // B4: "I can't delete the randomly generated solar system that spawns in after you delete all your
  // data." The owner: "I will kill that initial star spawn. It's legacy." Three things follow from
  // that and all three are pinned: an empty start IS empty, an empty map says how to begin, and the
  // last system on a map can be deleted and stays deleted (which is what a reload reads back).
  it('"Start empty" starts empty: no system is generated, and the map says how to add the first (B4)', async () => {
    const { generateSystem } = await import('$lib/api');
    vi.mocked(generateSystem).mockClear();
    localStorage.setItem('sse_welcome_v3_1_seen', '1'); // the hint waits for the first-run welcome to go
    const { findByText, getByText, container } = renderPage();
    await findByText('Start empty');
    await fireEvent.click(getByText('Create Vast Nothingness'));
    await findByText('My Starmap');
    expect(get(starmapStore)?.systems).toEqual([]);
    expect(container.querySelectorAll('g[role="button"]'), 'no star on the map').toHaveLength(0);
    expect(generateSystem).not.toHaveBeenCalled();
    expect(await findByText(/This map is empty\. Right-click \(or press and hold\) anywhere on it and choose "Add System Here"/)).toBeInTheDocument();
    // What the browser keeps is the empty map, so a reload does not conjure a system either.
    await waitFor(() => expect((vi.mocked(saveStarmap).mock.calls.at(-1)?.[0] as Starmap)?.systems).toEqual([]));
  });

  it('the last system on a map can be deleted, stays deleted, and the map then says how to add one (B4)', async () => {
    const mockStarmap = {
      id: 'test-starmap', name: 'Test Starmap', routes: [],
      systems: [{ id: 'only', name: 'The Only System', position: { x: 100, y: 100 }, system: { id: 'only', name: 'The Only System', seed: 's', nodes: [] } as any }],
    } as unknown as Starmap;
    vi.mocked(hasSavedStarmap).mockResolvedValue(true);
    vi.mocked(loadSavedStarmap).mockResolvedValue(mockStarmap);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    localStorage.setItem('sse_welcome_v3_1_seen', '1');
    try {
      const { container, findByText, queryByText } = renderPage();
      await findByText('Test Starmap', {}, { timeout: 8000 });
      expect(queryByText(/This map is empty/), 'a map with a system in it needs no hint').toBeNull();

      await fireEvent.contextMenu(container.querySelector('g[role="button"]') as SVGGElement);
      await fireEvent.click(await findByText('Delete System'));

      await waitFor(() => expect(get(starmapStore)?.systems).toEqual([]));
      await waitFor(() => expect(container.querySelectorAll('g[role="button"]')).toHaveLength(0));
      expect(await findByText(/This map is empty/)).toBeInTheDocument();
      // And it is the EMPTY map that was written, so it does not come back on a reload.
      await waitFor(() => expect((vi.mocked(saveStarmap).mock.calls.at(-1)?.[0] as Starmap)?.systems).toEqual([]));
    } finally {
      confirm.mockRestore();
    }
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
    // WAIT FOR THE APP TO FINISH LOADING, not for one second. This test is about NAVIGATION — does
    // clicking a star enter that system — and the default 1s findByText timeout made the SETUP the
    // thing that failed: observed timing out with the physics overlay still in the DOM, while passing
    // every time in isolation. The assertions below are unchanged.
    // HONEST SCOPE: this removes ONE source of noise, not the only one. This suite goes intermittently
    // red under machine contention (several long-lived dev servers in the shared worktrees), and when
    // it does the casualties are scattered across unrelated files — broadcastContract, axialTilt,
    // generateFromConfig, systemUndo — none of which a timeout here can help. Do not read a red run
    // as a regression without checking WHICH tests failed and whether they repeat.
    await findByText('Test Starmap', {}, { timeout: 8000 });

    // The clickable star is the <g role="button">, not the sibling name label.
    const star = container.querySelector('g[role="button"]') as SVGGElement;
    await fireEvent.click(star);

    // Clicking a star enters that system: systemStore is set and the Starmap
    // view (its heading) is replaced. (The back button has no stable label;
    // SystemView is the god component 01.7 will split.)
    await waitFor(() => expect(get(systemStore)?.id).toBe('sys1'));
    expect(queryByText('Test Starmap')).not.toBeInTheDocument();
  });

  // B2: THE SAFE-MODE SCREEN MUST NOT APPEAR FOR A LOAD THAT WAS MERELY INTERRUPTED. The law and its
  // corner cases are pinned in `lib/loadGuard.spec.ts`; these two prove the ROUTE obeys it, because a
  // correct module the page does not use fixes nothing.
  it('a reload part way through loading the saved campaign does not bring up safe mode next time (B2)', async () => {
    const mockStarmap = { id: 'test-starmap', name: 'Test Starmap', systems: [], routes: [] } as Starmap;
    vi.mocked(hasSavedStarmap).mockResolvedValue(true);
    vi.mocked(loadSavedStarmap).mockReturnValue(new Promise(() => {})); // this load is still running...
    // Let the pages earlier tests mounted finish first: a load's "painted" clear is two animation
    // frames behind it, and one landing here would remove the very stamp this test is watching.
    await new Promise((r) => setTimeout(r, 120));
    localStorage.clear();
    const first = renderPage();
    await waitFor(() => expect(localStorage.getItem('sse-load-guard')).toBe('reading browser storage'), { timeout: 8000 });
    window.dispatchEvent(new Event('pagehide')); // ...when the page is reloaded
    expect(localStorage.getItem('sse-load-guard')).toBeNull();
    first.unmount();

    vi.mocked(loadSavedStarmap).mockResolvedValue(mockStarmap);
    const second = renderPage();
    expect(await second.findByText('Test Starmap', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(second.queryByText("The last load didn't finish")).toBeNull();
  });

  it('a load that stopped without the page going anywhere still brings up safe mode', async () => {
    const mockStarmap = { id: 'test-starmap', name: 'Test Starmap', systems: [], routes: [] } as Starmap;
    vi.mocked(hasSavedStarmap).mockResolvedValue(true);
    vi.mocked(loadSavedStarmap).mockResolvedValue(mockStarmap);
    localStorage.setItem('sse-load-guard', 'physics: Sol'); // left by a visit that hung or was killed
    const { findByText, queryByText } = renderPage();
    expect(await findByText("The last load didn't finish", {}, { timeout: 8000 })).toBeInTheDocument();
    expect(await findByText('physics: Sol')).toBeInTheDocument();
    expect(queryByText('Test Starmap'), 'it must not auto-load into the same hang').toBeNull();
  });

  // B-1: THE THREE THINGS THE ROUTE OWES A GM WHOSE PAGE IS ABOUT TO RELOAD. The storage law itself is
  // pinned in `lib/starmapStorage.spec.ts`; these are the route's half.
  it('says so when the campaign could not be saved, and stops saying so once it can be (B-1)', async () => {
    const mockStarmap = { id: 'test-starmap', name: 'Test Starmap', systems: [], routes: [] } as Starmap;
    vi.mocked(hasSavedStarmap).mockResolvedValue(true);
    vi.mocked(loadSavedStarmap).mockResolvedValue(mockStarmap);
    vi.mocked(saveStarmap).mockRejectedValue(new Error('QuotaExceededError'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { findByText, queryByText } = renderPage();
      expect(await findByText(/could not be saved in this browser, so a reload would lose them/, {}, { timeout: 8000 })).toBeInTheDocument();

      // Storage recovers; the next change is written; the warning is no longer true and goes.
      vi.mocked(saveStarmap).mockResolvedValue(undefined);
      starmapStore.update((m) => (m ? { ...m, name: 'Test Starmap, edited' } : m));
      await waitFor(() => expect(queryByText(/could not be saved in this browser/)).toBeNull(), { timeout: 8000 });
    } finally {
      errors.mockRestore();
    }
  });

  it('a reload the app performs waits for the campaign to be written (B-1)', async () => {
    const mockStarmap = { id: 'test-starmap', name: 'Test Starmap', systems: [], routes: [] } as Starmap;
    vi.mocked(hasSavedStarmap).mockResolvedValue(true);
    vi.mocked(loadSavedStarmap).mockResolvedValue(mockStarmap);
    // A slow disk: the write is still going when the reload is decided on.
    let finishWrite: () => void = () => {};
    let written = false;
    const { findByText } = renderPage();
    await findByText('Test Starmap', {}, { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 50)); // let the load's own autosaves drain
    vi.mocked(saveStarmap).mockImplementation(() => new Promise<void>((resolve) => { finishWrite = () => { written = true; resolve(); }; }));
    starmapStore.update((m) => (m ? { ...m, name: 'Test Starmap, one more planet' } : m));
    await findByText('Test Starmap, one more planet');

    let mayReload = false;
    const settled = settleBeforeReload().then(() => { mayReload = true; });
    await new Promise((r) => setTimeout(r, 30));
    expect(mayReload, 'the reload must not go ahead with the write still in flight').toBe(false);
    finishWrite();
    await settled;
    expect(written && mayReload).toBe(true);
    const last = vi.mocked(saveStarmap).mock.calls.at(-1)?.[0] as Starmap;
    expect(last.name).toBe('Test Starmap, one more planet');
  });

  it('"Start without loading it" keeps the campaign it did not load, one step back, before anything overwrites it (B-1)', async () => {
    const stored = { id: 'the-campaign', name: 'Six Months Of Work', systems: [], routes: [] } as Starmap;
    vi.mocked(hasSavedStarmap).mockResolvedValue(true);
    vi.mocked(loadSavedStarmap).mockResolvedValue(stored);
    localStorage.setItem('sse-load-guard', 'physics: Sol');
    const order: string[] = [];
    vi.mocked(savePreUpgradeStarmap).mockImplementation(async (m) => { order.push(`kept:${m.name}`); return true; });
    vi.mocked(saveStarmap).mockImplementation(async (m) => { order.push(`wrote:${m.name}`); });

    const { findByText, getByText } = renderPage();
    await fireEvent.click(await findByText('Start without loading it', {}, { timeout: 8000 }));
    expect(order, 'nothing is copied or written until something is about to replace it').toEqual([]);
    await fireEvent.click(await findByText('Create Vast Nothingness'));
    await findByText('My Starmap');

    await waitFor(() => expect(order.some((o) => o.startsWith('wrote:'))).toBe(true), { timeout: 8000 });
    expect(order[0]).toBe('kept:Six Months Of Work');
    expect(order[1]).toBe('wrote:My Starmap');
    expect(order.filter((o) => o.startsWith('kept:')), 'kept once, not on every autosave').toHaveLength(1);
    expect(getByText(/"Six Months Of Work" was not loaded and has been kept/)).toBeInTheDocument();
  });

  // R-20 / G98 (Stream AA job 1): A MAP PICKED FROM THE EXPLORERS LIST OPENS THROUGH THE ONE DOOR.
  // The panel only hands up an address; what matters is that the ROUTE then fetches exactly that
  // address, classifies the bytes, validates them and puts THAT campaign in the store - which is
  // `openStarmapPayload`, reached the way `?open=` reaches it. The fetch is a double answering with a
  // synthesised list and a minimal campaign; the live hub is never reached (`src/setup.ts`).
  it('opens a map picked from the Explorers list on the New Starmap screen', async () => {
    const { listFetch, hubListPage } = await import('$lib/hub/hubMapListFixtures');
    const campaign = { id: 'hub-picked', name: 'Picked From Explorers', distanceUnit: 'ly', systems: [], routes: [] };
    const double = listFetch((url) =>
      url.includes('/api/maps?')
        ? { json: hubListPage(3) }
        : url === 'https://explorers.starsystemx.com/api/download/synthetic-map-2'
          ? { json: campaign }
          : { status: 404 }
    );
    vi.stubGlobal('fetch', double.impl);
    try {
      const { findByRole, findByText } = renderPage();
      await fireEvent.click(await findByRole('button', { name: /Synthetic Map 2/ }, { timeout: 8000 }));
      await waitFor(() => expect(get(starmapStore)?.id).toBe('hub-picked'), { timeout: 8000 });
      expect(get(starmapStore)?.name).toBe('Picked From Explorers');
      expect(await findByText(/Opened "Picked From Explorers" from the shared map library/)).toBeInTheDocument();
      // The address fetched is the one the list named, with no credentials - the `?open=` path's own rules.
      const download = double.calls.find((c) => c.url.includes('/api/download/'));
      expect(download?.url).toBe('https://explorers.starsystemx.com/api/download/synthetic-map-2');
      expect(download?.init?.credentials).toBe('omit');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // R-18 (Stream AA job 3): AN "ADD SYSTEM TO SSE" LINK. The owner, 2026-09-11: a link may bring a
  // single system "but you pick the spot". So the link must NOT refuse it (the old R-17 answer) and
  // must NOT place it: the campaign is untouched and a banner says how to choose where it goes.
  it('holds a single system from a link for the GM to place, and changes nothing yet', async () => {
    const { listFetch } = await import('$lib/hub/hubMapListFixtures');
    const link = 'https://explorers.starsystemx.com/api/download/tau-ceti';
    const tau = { id: 'tau-ceti', name: 'Tau Ceti', nodes: [{ id: 'tau-a', name: 'Tau Ceti', kind: 'body', roleHint: 'star', parentId: null }] };
    const double = listFetch((url) => (url === link ? { json: tau } : { status: 404 }));
    vi.stubGlobal('fetch', double.impl);
    const mockStarmap = { id: 'mine', name: 'My Own Campaign', distanceUnit: 'ly', systems: [], routes: [] } as unknown as Starmap;
    vi.mocked(hasSavedStarmap).mockResolvedValue(true);
    vi.mocked(loadSavedStarmap).mockResolvedValue(mockStarmap);
    window.history.replaceState({}, '', '/?open=' + encodeURIComponent(link));
    try {
      const { findByText, queryByText } = renderPage();
      expect(await findByText(/Tau Ceti from Explorers is ready to add\./, {}, { timeout: 8000 })).toBeInTheDocument();
      expect(queryByText(/points at a single system rather than a campaign/)).toBeNull();
      expect(get(starmapStore)?.id).toBe('mine');
      expect(get(starmapStore)?.systems).toHaveLength(0);
      expect(window.location.search, 'the link is taken off the address bar').toBe('');
    } finally {
      vi.unstubAllGlobals();
      window.history.replaceState({}, '', '/');
    }
  });
});
