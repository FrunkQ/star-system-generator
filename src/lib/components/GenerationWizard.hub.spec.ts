// R-18 (Stream AA job 3): A SINGLE SYSTEM FROM EXPLORERS, THROUGH THE WIZARD'S DOOR.
//
// The hub cannot hand out a one-click link for a single system (`?open=` refuses one), so the wizard
// lists them and places the chosen one where the GM clicked. What a GM would see go wrong, and what is
// asserted: the list asks for SYSTEMS; the click fetches exactly the listed address with no
// credentials; a system comes out of the `generate` event processed and named; it carries the
// cartographer's credit and its origin tag, as a pasted system does; a failed fetch says why and
// places nothing.
//
// NEVER THE LIVE HUB: `fetch` is a double answering with a synthesised list entry and a synthesised
// one-star system. The real rule pack is read from disk so the wizard renders as it does in the app.
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import GenerationWizard from './GenerationWizard.svelte';
import { hubListEntry, hubListPage, listFetch } from '$lib/hub/hubMapListFixtures';
import type { ContentCredit, RulePack, System } from '$lib/types';

function deepMerge(t: any, s: any): any {
	if (typeof t !== 'object' || t === null || Array.isArray(t)) return s;
	const out = { ...t };
	for (const k of Object.keys(s || {})) out[k] = k in out ? deepMerge(out[k], s[k]) : s[k];
	return out;
}
function pack(): RulePack {
	const base = path.resolve('static/rulepacks/starter-sf');
	let p: any = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8'));
	for (const f of ['stars.json', 'planets.json', 'generation.json', 'orbital_constants.json', 'classification.json', 'atmospheres.json', 'liquids.json']) {
		const fp = path.join(base, f);
		if (fs.existsSync(fp)) p = deepMerge(p, JSON.parse(fs.readFileSync(fp, 'utf-8')));
	}
	return p as RulePack;
}

const DOWNLOAD = 'https://explorers.starsystemx.com/api/download/synthetic-map-1';
const PAGE = 'https://explorers.starsystemx.com/s/synthetic-map-1';

/** A one-star system as a single-system save carries it: authored inputs only. */
const savedSystem = {
	id: 'tau-ceti-system',
	name: 'Tau Ceti',
	seed: 'tau-ceti',
	epochT0: 0,
	age_Gyr: 5.8,
	nodes: [
		{ id: 'tau-ceti-a', name: 'Tau Ceti', kind: 'body', roleHint: 'star', parentId: null, massKg: 1.56e30, radiusKm: 553000, temperatureK: 5344, classes: ['star/G'] }
	]
};

function serve(download: () => { status?: number; json?: unknown; throws?: boolean }) {
	const double = listFetch((url) =>
		url.includes('/api/maps?')
			? { json: hubListPage(0, { maps: [hubListEntry(1, { kind: 'system', system_count: 0, title: 'Tau Ceti (shared)', creator: { name: 'Frunk', url: null } })] }) }
			: url === DOWNLOAD
				? download()
				: { status: 404 }
	);
	vi.stubGlobal('fetch', double.impl);
	return double;
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('the wizard lists single systems from Explorers', () => {
	it('asks the hub for systems, starting on the starter tag', async () => {
		const { calls } = serve(() => ({ json: savedSystem }));
		render(GenerationWizard, { props: { rulePack: pack(), exampleSystems: [] } });
		await waitFor(() => expect(calls.length).toBeGreaterThan(0));
		expect(calls[0].url).toBe('https://explorers.starsystemx.com/api/maps?kind=system&sort=detailed&limit=10&page=1&tag=default');
	});
});

describe('a system picked there is placed as a pasted system is', () => {
	async function pick(download: () => { status?: number; json?: unknown; throws?: boolean }) {
		const double = serve(download);
		const generated: { system: System; credit?: ContentCredit }[] = [];
		const alerts = vi.spyOn(window, 'alert').mockImplementation(() => {});
		const view = render(GenerationWizard, {
			props: { rulePack: pack(), exampleSystems: [] },
			events: { generate: (e: CustomEvent<{ system: System; credit?: ContentCredit }>) => generated.push(e.detail) }
		});
		// The starter tag answers with the one entry the double serves for every list request.
		await fireEvent.click(await view.findByRole('button', { name: /Tau Ceti \(shared\)/ }, { timeout: 8000 }));
		return { double, generated, alerts };
	}

	it('fetches the listed address with no credentials and hands up a processed, credited system', async () => {
		const { double, generated, alerts } = await pick(() => ({ json: savedSystem }));
		await waitFor(() => expect(generated).toHaveLength(1), { timeout: 8000 });
		expect(alerts).not.toHaveBeenCalled();

		const download = double.calls.find((c) => c.url === DOWNLOAD);
		expect(download?.init?.credentials).toBe('omit');

		const { system, credit } = generated[0];
		expect(system.name).toBe('Tau Ceti');
		expect(system.nodes.map((n) => n.id)).toContain('tau-ceti-a');
		// R-16's two credits, as a paste earns them.
		const star = system.nodes.find((n) => n.id === 'tau-ceti-a') as any;
		expect((star.tags ?? []).find((t: any) => t.ns === 'origin' && t.key === 'hub')?.value).toBe(PAGE);
		expect(credit).toMatchObject({ title: 'Tau Ceti (shared)', creator: 'Frunk', url: PAGE });
		expect(credit?.nodeIds).toContain('tau-ceti-a');
	});

	it('says why and places nothing when the download fails', async () => {
		const { generated, alerts } = await pick(() => ({ status: 404 }));
		await waitFor(() => expect(alerts).toHaveBeenCalledTimes(1), { timeout: 8000 });
		expect(String(alerts.mock.calls[0][0])).toMatch(/no longer exists/);
		expect(generated).toHaveLength(0);
	});

	it('says what the file is when it is not a save, and places nothing', async () => {
		const { generated, alerts } = await pick(() => ({ json: { hello: 'world' } }));
		await waitFor(() => expect(alerts).toHaveBeenCalledTimes(1), { timeout: 8000 });
		expect(String(alerts.mock.calls[0][0])).toMatch(/not a Star System Explorer save/);
		expect(generated).toHaveLength(0);
	});
});
