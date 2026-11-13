// "WHY ARE STARS FADED IN THE STARMAP?" (a user, on Discord.)
//
// A tag highlight fades every system that carries none of it to 22% - a filter with no control of
// its own, driven by a selection that is PERSISTED and was probably made in another panel. The key
// in the corner only appeared when something MATCHED, so a selection nothing on the map carries
// dimmed the whole map and said nothing. The key is now also the note: what is highlighted, how
// many systems that has faded, a Clear, and an X that hides the note but not the highlight.
//
// GM starmap only: the players' starmap draws the badges and does not fade.
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Starmap from './Starmap.svelte';
import { liveOverrides } from '$lib/player/liveOverrides';
import type { Starmap as StarmapType, RulePack } from '$lib/types';

const star = (id: string) => ({ id, parentId: null, kind: 'body', roleHint: 'star', classes: ['star/G2V'], tags: [] });
const world = (id: string, parentId: string, tags: string[]) =>
	({ id, parentId, kind: 'body', roleHint: 'planet', name: id, tags: tags.map((key) => ({ key })) });
const sys = (id: string, x: number, nodes: any[]) => ({ id, name: id, position: { x, y: 100 }, system: { id, name: id, nodes } });

// Five systems. Two have a refuelling stop (on a WORLD, never the star - the roll-up is the point),
// one has a faction and nothing else.
const map = (): StarmapType => ({
	id: 'hl-map', name: 'Highlight map', distanceUnit: 'pc', unitIsPrefix: false, routes: [],
	systems: [
		sys('Alpha', 100, [star('a'), world('a1', 'a', ['frontier/refuelling'])]),
		sys('Beta', 200, [star('b'), world('b1', 'b', ['frontier/refuelling', 'faction/red-syndicate'])]),
		sys('Gamma', 300, [star('c'), world('c1', 'c', ['faction/red-syndicate'])]),
		sys('Delta', 400, [star('d')]),
		sys('Epsilon', 500, [star('e'), world('e1', 'e', [])])
	]
} as unknown as StarmapType);

const mount = () => render(Starmap, { props: { starmap: map(), rulePack: {} as RulePack } });
const select = async (...refs: string[]) => { liveOverrides.update((o) => ({ ...o, mapHighlights: refs.map((ref) => ({ ref })), highlightsMuted: false })); await tick(); };
const dimmed = (c: HTMLElement) => c.querySelectorAll('g[role="button"].hl-dim').length;
const note = (c: HTMLElement) => c.querySelector('.hl-key.hl-note') as HTMLElement | null;

beforeEach(() => liveOverrides.update((o) => ({ ...o, mapHighlights: [], highlightsMuted: false })));
afterEach(() => liveOverrides.update((o) => ({ ...o, mapHighlights: [], highlightsMuted: false })));

describe('the starmap says when a highlight is fading systems', () => {
	it('with nothing highlighted there is no fade and no note', async () => {
		const { container } = mount();
		await tick();
		expect(dimmed(container)).toBe(0);
		expect(container.querySelector('.hl-key')).toBeNull();
	});

	it('names what is highlighted and counts the faded systems - the same number the map dims', async () => {
		const { container } = mount();
		await select('frontier/refuelling');
		const n = note(container)!;
		expect(n, 'the note').not.toBeNull();
		expect(n.querySelector('.hl-key-head')!.textContent).toMatch(/Highlighting:/);
		expect(n.querySelector('.hl-key-names')!.textContent).toMatch(/refuelling/i);
		// ABSOLUTE: Gamma, Delta and Epsilon carry no refuelling stop. Three, by reading the fixture.
		expect(n.querySelector('.hl-key-count')!.textContent!.trim()).toBe('3 systems faded.');
		expect(dimmed(container)).toBe(3);
	});

	it('a selection NOTHING carries fades every system - and now says so (it used to say nothing)', async () => {
		const { container } = mount();
		await select('frontier/jump-gate');
		expect(dimmed(container)).toBe(5);
		const n = note(container)!;
		expect(n, 'a fully faded map must explain itself').not.toBeNull();
		expect(n.querySelector('.hl-key-count')!.textContent).toMatch(/Nothing on this map carries it, so all 5 systems are faded\./);
		expect(n.querySelector('.hl-key-names')!.textContent!.trim().length).toBeGreaterThan(0);
	});

	it('Clear clears the highlight: the store is emptied, the fade lifts and the note goes', async () => {
		const { container } = mount();
		await select('frontier/refuelling', 'faction');
		expect(dimmed(container)).toBe(2); // Delta and Epsilon carry neither
		expect(note(container)!.querySelector('.hl-key-count')!.textContent!.trim()).toBe('2 systems faded.');

		await fireEvent.click(note(container)!.querySelector('.hl-key-clear') as HTMLButtonElement);
		await tick();
		expect(get(liveOverrides).mapHighlights).toEqual([]);
		expect(dimmed(container)).toBe(0);
		expect(container.querySelector('.hl-key')).toBeNull();
	});

	it('the X hides the NOTE and leaves the highlight on; a different selection brings the note back', async () => {
		const { container } = mount();
		await select('frontier/refuelling');
		await fireEvent.click(note(container)!.querySelector('.hl-key-x') as HTMLButtonElement);
		await tick();
		expect(note(container)).toBeNull();
		expect(get(liveOverrides).mapHighlights).toEqual([{ ref: 'frontier/refuelling' }]);
		expect(dimmed(container)).toBe(3);
		// The plain key (the colour legend) is what is left, as it always was.
		expect(container.querySelector('.hl-key .hl-key-head')!.textContent).toBe('Highlighted');
		expect(container.querySelector('.hl-key-clear')).toBeNull();

		await select('faction');
		expect(note(container), 'a new selection is a new question').not.toBeNull();
		expect(note(container)!.querySelector('.hl-key-count')!.textContent!.trim()).toBe('3 systems faded.');
	});

	it('a MUTED selection fades nothing, so there is nothing to explain', async () => {
		const { container } = mount();
		await select('frontier/refuelling');
		liveOverrides.update((o) => ({ ...o, highlightsMuted: true }));
		await tick();
		expect(dimmed(container)).toBe(0);
		expect(container.querySelector('.hl-key')).toBeNull();
	});

	it('when every system carries it, the note says that instead of a count of zero', async () => {
		const { container } = render(Starmap, { props: { rulePack: {} as RulePack, starmap: ({ ...map(), systems: map().systems.slice(0, 2) }) as StarmapType } });
		await select('frontier/refuelling');
		expect(dimmed(container)).toBe(0);
		expect(note(container)!.querySelector('.hl-key-count')!.textContent!.trim()).toBe('Every system carries it.');
	});
});
