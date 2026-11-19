// G99: THE COPY BUTTON ITSELF - shown on a definition a GM made and on nothing shipped, and a click puts
// a rules clip in the one copy buffer AND on the system clipboard, in the text a paste reads.
import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';
import fs from 'fs';
import path from 'path';
import CopyDefinitionButton from './CopyDefinitionButton.svelte';
import { clipBuffer, clearClip } from '$lib/io/clipBuffer';
import { parseHubClip, isRulesOnlyClip } from '$lib/io/hubClip';
import type { RulePack } from '$lib/types';

function deepMerge(t: any, s: any): any {
	if (typeof t !== 'object' || t === null || Array.isArray(t)) return s;
	const out = { ...t };
	for (const k of Object.keys(s || {})) out[k] = k in out ? deepMerge(out[k], s[k]) : s[k];
	return out;
}
function shippedPack(): RulePack {
	const base = path.resolve('static/rulepacks/starter-sf');
	const read = (f: string) => JSON.parse(fs.readFileSync(path.join(base, f), 'utf-8'));
	let p: any = read('main.json');
	for (const f of p.imports ?? []) p = deepMerge(p, read(f.replace('./', '')));
	p.engineDefinitions = read('engine-definitions.json');
	p.fuelDefinitions = read('fuel-definitions.json');
	return p as RulePack;
}
const pack = shippedPack();
const UNOBTAINIUM = { name: 'unobtainium', label: 'Liquid Unobtainium', meltK: 20, boilK: 90, colorHex: '#7fd4c1' };

afterEach(() => {
	clearClip();
	vi.unstubAllGlobals();
});

describe('CopyDefinitionButton', () => {
	it('is offered on a liquid the GM made, and puts a rules clip down that a paste reads', async () => {
		const written: string[] = [];
		vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: async (t: string) => { written.push(t); } } });
		const { getByRole } = render(CopyDefinitionButton, {
			props: { section: 'liquids', id: 'unobtainium', definition: UNOBTAINIUM, pack, campaignName: 'Contract Reach' }
		});
		const button = getByRole('button', { name: 'Copy unobtainium' });
		await fireEvent.click(button);

		const entry = get(clipBuffer);
		expect(entry?.label).toBe('Rules (a liquid)');
		expect(isRulesOnlyClip(entry!.clip)).toBe(true);
		expect(entry!.clip.source).toEqual({ title: 'Contract Reach' });

		// The SYSTEM clipboard got the same clip as text, which is what another tab or campaign pastes.
		expect(written).toHaveLength(1);
		const parsed = parseHubClip(written[0]);
		expect(parsed.ok && (parsed as any).clip.rulePackOverrides).toEqual({ liquids: [UNOBTAINIUM] });
		expect(button.textContent).toBe('Copied');
	});

	it('is not offered on a shipped definition - every campaign already has it', () => {
		const { queryByRole } = render(CopyDefinitionButton, {
			props: { section: 'liquids', id: 'water', definition: { name: 'water', boilK: 373 }, pack }
		});
		expect(queryByRole('button')).toBeNull();
	});

	it('finds what a copied engine burns in the editor’s own unsaved list first', async () => {
		const draftFuel = { id: 'fuel-new-slush', name: 'New Slush', density_kg_per_m3: 150 };
		const { getByRole } = render(CopyDefinitionButton, {
			props: {
				section: 'engineDefinitions', id: 'engine-new', pack,
				definition: { id: 'engine-new', name: 'New Drive', fuel_type_id: 'fuel-new-slush' },
				overrides: undefined,
				draft: (s: string, id: string) => (s === 'fuelDefinitions' && id === 'fuel-new-slush' ? draftFuel : undefined)
			}
		});
		await fireEvent.click(getByRole('button', { name: 'Copy engine-new' }));
		expect(get(clipBuffer)?.clip.rulePackOverrides?.fuelDefinitions).toEqual([draftFuel]);
	});
});
