// R-20 / G98 (Stream AA job 1): the Explorers list inside the load screens.
//
// What is gated here is what a GM would see go wrong: ten maps from one page, a click that hands up
// the map it says, an honest line instead of an empty box when the hub cannot be reached, the order
// and page controls asking the hub for what they say, and a slow answer never overwriting a newer
// one. The route-level half - that the click actually OPENS the map through the one door - is in
// `routes/page.spec.ts`, because the door is instance scope in the route.
//
// NEVER THE LIVE HUB: `fetch` is stubbed with a synthesised page in the measured shape, and
// `src/setup.ts` rejects any hub request a spec forgets to stub.
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import HubMapPanel from './HubMapPanel.svelte';
import LoadSourceModal from './LoadSourceModal.svelte';
import { hubListEntry, hubListPage, listFetch } from '$lib/hub/hubMapListFixtures';
import type { HubMapSummary } from '$lib/hub/hubMapList';

afterEach(() => {
	vi.unstubAllGlobals();
});

function serve(reply: Parameters<typeof listFetch>[0]) {
	const double = listFetch(reply);
	vi.stubGlobal('fetch', double.impl);
	return double;
}

describe('the list renders what the hub sent', () => {
	it('shows ten maps from one page, with covers, blurbs and counts', async () => {
		const { calls } = serve(() => ({ json: hubListPage(10) }));
		const { findAllByRole, getByText, container } = render(HubMapPanel);
		const cards = await findAllByRole('button', { name: /Synthetic Map \d+/ });
		expect(cards).toHaveLength(10);
		// ABSOLUTE: the one request the panel made on mount, spelt out.
		expect(calls.map((c) => c.url)).toEqual([
			'https://explorers.starsystemx.com/api/maps?kind=starmap&sort=detailed&limit=10&page=1'
		]);
		expect(container.querySelectorAll('img.hub-map-cover')).toHaveLength(10);
		expect(getByText('An invented campaign, number 2.')).toBeTruthy();
		// Map 2: 3 systems, 20 bodies, no constructs; starred 2, 2 comments, 6 downloads.
		expect(getByText('3 systems · 20 bodies')).toBeTruthy();
		expect(getByText('starred 2 · 2 comments · 6 downloads')).toBeTruthy();
		// A full page may have another behind it.
		expect((getByText('Next') as HTMLButtonElement).disabled).toBe(false);
	});

	it('names who made each map, and says before the click when Explorers found a problem', async () => {
		// Hub 0.61.2: `creator` on every map, and the `needs-a-fix` pill (D-88/D-89). The hub's rule is
		// "last, not hidden", so the card SHOWS such a map and says it may not open.
		serve(() => ({
			json: hubListPage(0, {
				maps: [
					hubListEntry(1),
					hubListEntry(2, { creator: null, auto_tags: ['needs-a-fix', 'campaign'] })
				]
			})
		}));
		const { findByRole, getByText, queryAllByText } = render(HubMapPanel);
		const healthy = await findByRole('button', { name: /Synthetic Map 1/ });
		const broken = await findByRole('button', { name: /Synthetic Map 2/ });
		expect(getByText('by Synthetic Cartographer 1')).toBeTruthy();
		expect(broken.textContent).not.toContain('by ');
		const warnings = queryAllByText('Explorers found a problem in this file, so it may not open.');
		expect(warnings).toHaveLength(1);
		expect(broken.contains(warnings[0])).toBe(true);
		expect(healthy.textContent).not.toContain('may not open');
	});

	it('hands up the map that was clicked, and fetches nothing itself', async () => {
		const { calls } = serve(() => ({ json: hubListPage(10) }));
		const opened: HubMapSummary[] = [];
		const { findByRole } = render(HubMapPanel, { events: { open: (e: CustomEvent<HubMapSummary>) => opened.push(e.detail) } });
		await fireEvent.click(await findByRole('button', { name: /Synthetic Map 7/ }));
		expect(opened.map((m) => m.downloadUrl)).toEqual(['https://explorers.starsystemx.com/api/download/synthetic-map-7']);
		// Opening is the route's one door. The panel's only request is still the list.
		expect(calls).toHaveLength(1);
	});
});

describe('the list asked for single systems (R-18, the wizard)', () => {
	it('asks for systems, and does not print a system count that is always zero for one', async () => {
		// MEASURED on the live hub: a single system's `system_count` is 0. "0 systems" on a system is
		// a true number published as a lie.
		const { calls } = serve(() => ({
			json: hubListPage(0, { maps: [hubListEntry(4, { kind: 'system', system_count: 0, body_count: 17, construct_count: 0 })] })
		}));
		const { findByRole, getByText, queryByText } = render(HubMapPanel, { props: { kind: 'system' } });
		await findByRole('button', { name: /Synthetic Map 4/ });
		expect(calls[0].url).toBe('https://explorers.starsystemx.com/api/maps?kind=system&sort=detailed&limit=10&page=1');
		expect(getByText('17 bodies')).toBeTruthy();
		expect(queryByText(/0 systems/)).toBeNull();
	});
});

describe('a list that could not be fetched says so', () => {
	it('shows the offline line, and a way to try again, when fetch rejects', async () => {
		const { calls } = serve(() => ({ throws: true }));
		const { findByRole, queryAllByRole, getByRole } = render(HubMapPanel);
		const alert = await findByRole('alert');
		expect(alert.textContent).toMatch(/Could not reach Explorers/);
		expect(queryAllByRole('listitem')).toHaveLength(0);
		await fireEvent.click(getByRole('button', { name: 'Try again' }));
		await waitFor(() => expect(calls).toHaveLength(2));
	});

	it('is offline, not blank, when a spec forgets to stub - the live hub is never reached from a test', async () => {
		// No `serve` here: `src/setup.ts` refuses every hub host, so this is what an unmocked
		// render of either load screen shows.
		const { findByRole } = render(HubMapPanel);
		expect((await findByRole('alert')).textContent).toMatch(/Could not reach Explorers/);
	});
});

describe('the controls ask the hub for what they say', () => {
	it('re-asks from page one in the chosen order, and pages forward', async () => {
		// The double ECHOES the page it was asked for, as the hub does. A double that always answered
		// "page 1" let the panel believe it was back on page one after Next, and hid a new order
		// that kept the old page - this test passed with that fault present until it did this.
		const { calls } = serve((url) => ({
			json: hubListPage(10, { page: Number(new URL(url).searchParams.get('page')) })
		}));
		const { findAllByRole, getByRole, getByText } = render(HubMapPanel);
		await findAllByRole('button', { name: /Synthetic Map/ });
		await fireEvent.click(getByText('Next'));
		await waitFor(() => expect(calls).toHaveLength(2));
		expect(calls[1].url).toContain('&page=2');
		await findAllByRole('button', { name: /Synthetic Map/ });
		await fireEvent.change(getByRole('combobox'), { target: { value: 'discussed' } });
		await waitFor(() => expect(calls).toHaveLength(3));
		expect(calls[2].url).toBe('https://explorers.starsystemx.com/api/maps?kind=starmap&sort=discussed&limit=10&page=1');
	});

	it('starts on the starter tag when asked, and says plainly when there are none yet', async () => {
		const { calls } = serve((url) => ({ json: url.includes('tag=') ? hubListPage(0) : hubListPage(2) }));
		const { findByText, getByRole, findAllByRole } = render(HubMapPanel, { props: { startWithStarters: true } });
		expect(await findByText('No starter maps on Explorers yet.')).toBeTruthy();
		expect(calls[0].url).toBe('https://explorers.starsystemx.com/api/maps?kind=starmap&sort=detailed&limit=10&page=1&tag=default');
		await fireEvent.click(getByRole('button', { name: 'Show all shared maps' }));
		expect(await findAllByRole('button', { name: /Synthetic Map/ })).toHaveLength(2);
		expect(calls[1].url).not.toContain('tag=');
	});

	it('never lets a slower, older answer replace a newer one', async () => {
		// The first request (sort=detailed) is held open until the second (sort=new) has answered.
		let releaseFirst: () => void = () => {};
		const held = new Promise<void>((r) => (releaseFirst = r));
		const double = listFetch((url) =>
			url.includes('sort=new')
				? { json: hubListPage(0, { maps: [hubListEntry(1, { title: 'The newer answer' })] }) }
				: { json: hubListPage(0, { maps: [hubListEntry(2, { title: 'The stale answer' })] }) }
		);
		vi.stubGlobal('fetch', (async (url: string, init?: RequestInit) => {
			if (!String(url).includes('sort=new')) await held;
			return double.impl(url, init);
		}) as unknown as typeof fetch);
		const { getByRole, findByRole, queryByRole } = render(HubMapPanel);
		await fireEvent.change(getByRole('combobox'), { target: { value: 'new' } });
		await findByRole('button', { name: /The newer answer/ });
		releaseFirst();
		await new Promise((r) => setTimeout(r, 20));
		expect(queryByRole('button', { name: /The stale answer/ })).toBeNull();
		expect(queryByRole('button', { name: /The newer answer/ })).toBeTruthy();
	});
});

describe('Load Starmap lists Explorers maps; Load System does not yet', () => {
	it('sends a picked campaign up by its address', async () => {
		serve(() => ({ json: hubListPage(3) }));
		const seen: string[] = [];
		const { findByRole } = render(LoadSourceModal, {
			props: { kind: 'campaign' },
			events: { openFromExplorers: (e: CustomEvent<string>) => seen.push(e.detail) }
		});
		await fireEvent.click(await findByRole('button', { name: /Synthetic Map 3/ }));
		expect(seen).toEqual(['https://explorers.starsystemx.com/api/download/synthetic-map-3']);
	});

	it('keeps the plain library link for a system, which the list cannot open (R-18)', async () => {
		const { calls } = serve(() => ({ json: hubListPage(3) }));
		const { queryByRole, getByRole } = render(LoadSourceModal, { props: { kind: 'system' } });
		expect(getByRole('link', { name: /browse shared maps/i })).toBeTruthy();
		expect(queryByRole('region', { name: 'Maps shared on Explorers' })).toBeNull();
		expect(calls).toHaveLength(0);
	});
});
