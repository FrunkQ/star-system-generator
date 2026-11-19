// WHERE A MAP COMES FROM — the load chooser, and the screen it was taken OFF.
//
// Owner, 2026-09-06: *"This is not the place for the site import - its ugly and people are not
// joining from here. Remove. Instead take over the Load StarMap and Load System Map modals with a
// file or sharing site option where it takes them to where the other explorers are sharing - or the
// load file appropriately file type filtered."*
//
// Two of the three things asserted here are SOURCE pins rather than behaviour, and both are for the
// same reason the R-17 one-door gate exists: what would go wrong later is somebody putting the
// sharing route back on the welcome screen, or adding a third place that classifies bytes — and
// neither of those breaks a behavioural test of the code as it stands today.
//
// GATE DISCIPLINE (PHY-34): the file filters are written out LITERALLY here rather than read from
// `FILE_ACCEPT`, because a test that builds its expectation from the constant it is checking cannot
// see the constant being wrong — and a wrong filter is invisible until a GM cannot see their own
// file in the picker.
import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import LoadSourceModal, { FILE_ACCEPT } from './LoadSourceModal.svelte';
import SisterFileModal from './SisterFileModal.svelte';
import { HUB } from '$lib/hub/hubConfig';

const source = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const WELCOME = source('src/lib/components/NewStarmapModal.svelte');
const ROUTE = source('src/routes/+page.svelte');
const SYSTEM_VIEW = source('src/lib/components/SystemView.svelte');

describe('the file filters live in one place, beside the words that describe them', () => {
	it('are exactly these, and a campaign is not offered the simulator formats', () => {
		// ABSOLUTE. A campaign picker filtered for `.ubox` would show a GM a file that the campaign
		// door cannot open — `adapterForFile` routes those through the converter, which is a SYSTEM
		// path only.
		expect(FILE_ACCEPT.campaign).toBe('application/json,.json,.zip');
		expect(FILE_ACCEPT.system).toBe('application/json,.json,.zip,.ubox,.sc,.pak');
	});

	it('are used by both hidden inputs rather than re-typed', () => {
		expect(ROUTE, 'the campaign picker must read FILE_ACCEPT').toContain('accept={FILE_ACCEPT.campaign}');
		expect(SYSTEM_VIEW, 'the system picker must read FILE_ACCEPT').toContain('accept={FILE_ACCEPT.system}');
		// The literals they replaced must not creep back in beside them.
		expect(ROUTE).not.toContain('accept=".json,.zip"');
		expect(SYSTEM_VIEW).not.toContain('accept="application/json,.json,.zip,.ubox,.sc,.pak"');
	});
});

describe('the chooser offers the three ways in, browse first', () => {
	it('sends people to the library as a real link, in a new tab, safely', () => {
		const { getByRole } = render(LoadSourceModal, { props: { kind: 'campaign' } });
		const browse = getByRole('link', { name: /browse shared maps/i }) as HTMLAnchorElement;
		expect(browse.getAttribute('href')).toBe(HUB.browseUrl);
		expect(browse.getAttribute('target')).toBe('_blank');
		// `noopener` is not decoration: without it the new tab can reach back through `window.opener`.
		expect(browse.getAttribute('rel')).toContain('noopener');
	});

	it('asks the parent for the file picker rather than owning one', async () => {
		// The hidden input lives with the code that handles its change event; this screen only says
		// "they chose a file", so there is one file pipeline rather than one per screen.
		const asked = vi.fn();
		const { getByRole } = render(LoadSourceModal, { props: { kind: 'system' }, events: { file: asked } });
		await fireEvent.click(getByRole('button', { name: /load from a file/i }));
		expect(asked).toHaveBeenCalledTimes(1);
	});

	it('says which world it acts on, because the two are genuinely different', () => {
		const campaign = render(LoadSourceModal, { props: { kind: 'campaign' } });
		expect(campaign.getByText(/one campaign at a time/i)).toBeTruthy();
		campaign.unmount();
		const system = render(LoadSourceModal, { props: { kind: 'system' } });
		expect(system.getByText(/not the whole campaign/i)).toBeTruthy();
	});
});

describe('the paste field only fires on something that names a map', () => {
	it('stays disabled for text that is not a shared-map reference', async () => {
		const { getByRole } = render(LoadSourceModal, { props: { kind: 'campaign' } });
		const open = getByRole('button', { name: 'Open' }) as HTMLButtonElement;
		expect(open.disabled, 'empty').toBe(true);
		await fireEvent.input(getByRole('textbox'), { target: { value: 'hello there' } });
		expect(open.disabled, 'prose').toBe(true);
	});

	it('hands the parent a validated map code, not the raw text', async () => {
		// It reduces whatever was pasted through `parseHubReference` — the SAME parser the `?hub=`
		// URL path uses — so a link out of a chat app and a bare code reach the parent identically.
		const seen: string[] = [];
		const { getByRole } = render(LoadSourceModal, {
			props: { kind: 'campaign' },
			events: { openHub: (e: CustomEvent<string>) => seen.push(e.detail) }
		});
		await fireEvent.input(getByRole('textbox'), {
			target: { value: 'https://starsystemx.com/?hub=local-neighbourhood&utm_source=discord' }
		});
		await fireEvent.click(getByRole('button', { name: 'Open' }));
		expect(seen).toEqual(['local-neighbourhood']);
	});
});

describe('the welcome screen carries no PASTE route - but it does list Explorers maps now', () => {
	it('has no paste field, no parser and no openHub event', () => {
		// Owner, 2026-09-06: "This is not the place for the site import". Nobody arrives at the app
		// already holding a map code — they arrive by clicking a link, which the `?hub=` / `?open=`
		// funnel handles with no screen at all. Pinned in the source because putting it back would
		// be a one-line regression that no behavioural test of the load chooser would notice.
		expect(WELCOME).not.toContain('parseHubReference');
		expect(WELCOME).not.toContain('openHub');
		expect(WELCOME).not.toContain('hub-open');
		expect(ROUTE, 'the dead handler must go with the feature').not.toContain('on:openHub={(e) => openHubBySlug(e.detail)}\r\n        ');
	});

	it('lists the starter maps from Explorers, and hands up an address rather than a code', () => {
		// Owner, 2026-09-11 - a LATER decision, and a different thing from the paste field above:
		// "the load/new map modals are going to link to those available on the Explorers site RATHER
		// than default ones shipped". A list is not a code somebody has to be holding; it is the
		// examples, hosted somewhere else. So the screen gets the list and still gets no parser.
		expect(WELCOME).toContain('<HubMapPanel startWithStarters on:open={openListed} />');
		expect(WELCOME).toContain("dispatch('openFromExplorers', event.detail.downloadUrl)");
	});

	it('still offers its own plain file route, which is not the same thing', () => {
		// The welcome screen keeps "Upload a starmap file" as a FILE picker. Routing it through the
		// chooser would put the sharing option straight back onto the screen it was taken off.
		expect(WELCOME).toContain("dispatch('upload')");
		expect(ROUTE).toContain('on:upload={handleUploadStarmap}');
	});
});

describe('a system has one door, whichever way its bytes arrived', () => {
	it('classifies and opens in exactly one function', () => {
		// Same rule as R-17's `openHubBytes` one level up. A second place that classified bytes and
		// wrote the system store would be a second answer to "is this loadable?".
		expect((SYSTEM_VIEW.match(/async function openSystemBytes\s*\(/g) ?? []).length).toBe(1);
		expect((SYSTEM_VIEW.match(/classifySaveFile\(/g) ?? []).length, 'one classification site').toBe(1);
	});

	it('gets those bytes two ways, and neither opens anything itself', () => {
		const body = (signature: string) => {
			const at = SYSTEM_VIEW.indexOf(signature);
			expect(at, `SystemView no longer contains \`${signature}\``).toBeGreaterThan(-1);
			const eol = SYSTEM_VIEW.indexOf('\n', at);
			let i = SYSTEM_VIEW.lastIndexOf('{', eol);
			const start = i;
			let depth = 0;
			for (; i < SYSTEM_VIEW.length; i++) {
				if (SYSTEM_VIEW[i] === '{') depth++;
				else if (SYSTEM_VIEW[i] === '}' && --depth === 0) return SYSTEM_VIEW.slice(start, i + 1);
			}
			throw new Error('unbalanced braces');
		};
		const fromFile = body('async function handleUploadJson(event: Event)');
		const fromHub = body('async function openSystemFromHub(slug: string)');
		expect(fromFile).toContain('openSystemBytes(');
		expect(fromHub).toContain('openSystemBytes(');
		expect(fromHub).toContain('fetchHubMap(');
		for (const forbidden of ['classifySaveFile', 'systemStore.set', 'sisterStarmap =']) {
			expect(fromHub, `openSystemFromHub must not ${forbidden}`).not.toContain(forbidden);
		}
	});

	it('raises the chooser from the rail rather than the picker', () => {
		expect(SYSTEM_VIEW).toContain('on:uploadsystem={() => { railOpen = false; showLoadSystemSource = true; }}');
		expect(ROUTE).toContain('on:open={() => (showLoadStarmapSource = true)}');
		expect(ROUTE).toContain('on:upload={() => (showLoadStarmapSource = true)}');
	});
});

describe('a save that arrived by link is not called a file', () => {
	// FOUND BY LOOKING, not by reasoning: the first cut passed the KIND where the NAME goes, and the
	// live screen read "shared map is a saved campaign". A name and a kind are two different things
	// and this is what it costs to conflate them.
	it('names the campaign and calls the thing what it actually was', () => {
		const { getByText, container } = render(SisterFileModal, {
			props: { fileKind: 'starmap', context: 'system', fileName: 'Local Neighbourhood', subject: 'shared map' }
		});
		expect(getByText(/That shared map is a whole campaign/i)).toBeTruthy();
		expect(container.textContent).toContain('Local Neighbourhood is a saved');
		expect(container.textContent, 'a link is not a file').not.toContain('That file is a whole campaign');
	});

	it('still says "file" when it really was one', () => {
		// The default is unchanged, so every existing caller reads exactly as it did.
		const { getByText } = render(SisterFileModal, {
			props: { fileKind: 'starmap', context: 'system', fileName: 'map.json' }
		});
		expect(getByText(/That file is a whole campaign/i)).toBeTruthy();
	});

	it('lets the shared-map path fall back to the campaign’s own name', () => {
		// The hub caller has no filename to give, so `openSystemBytes` uses the campaign's own name.
		// Pinned in the source because the alternative — a generic word in the name slot — is exactly
		// the defect this describes, and it renders as a sentence nobody would write on purpose.
		expect(SYSTEM_VIEW).toContain("await openSystemBytes(result.bytes, { kind: 'shared map' })");
		expect(SYSTEM_VIEW).toContain("name: source.name || String(classified.doc?.name ?? 'That map')");
	});
});
