// THE PASTE INDICATOR ON THE UNDO PILL. Owner, 2026-09-06: *"The paste at the top button should not
// be needed should it? what is being pasted is on the long right click. That can stay as an
// indicator of what is in paste just now - perhaps make it a lower part of the undo/redo modal.
// compact and contained and useful"*, and *"have a little paste icon and a description eg:
// Planet+7, Moon"*.
//
// The system view is a CANVAS, so the copy gesture that fills this cannot be driven headlessly
// ([[E7]]) - but the pill is DOM, and E7's own rule is that a declarative surface IS verifiable.
// So the gesture is the owner's thirty-second check and the RENDERING is pinned here.
import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import { readable } from 'svelte/store';
import UndoPill from './UndoPill.svelte';
import { describeClipCompact } from '$lib/io/hubClip';
import type { UndoStatus } from '$lib/undo/systemUndo';

const nothingToUndo = readable<UndoStatus>({ canUndo: false, canRedo: false } as UndoStatus);
const somethingToUndo = readable<UndoStatus>({ canUndo: true, canRedo: false } as UndoStatus);
const noop = () => {};
const base = { undo: noop, redo: noop };

const clip = (compact: string, from: 'app' | 'clipboard' = 'app') => ({ compact, label: 'Planet Earth', from });

describe('the pill says what is in hand', () => {
	it('SHOWS ITSELF for a clip alone, with nothing to undo', () => {
		// The moment the indicator exists for: a GM has copied on the map library's site and come
		// back, and has made no edit here at all. Before this the pill rendered nothing without a
		// history, so the indicator would have been invisible exactly then.
		const { container, getByText } = render(UndoPill, {
			props: { ...base, status: nothingToUndo, clip: clip('Planet+7') }
		});
		expect(container.querySelector('.undo-pill'), 'the pill must render').toBeTruthy();
		expect(getByText('Planet+7')).toBeTruthy();
	});

	it('stays away when there is neither a history nor a clip', () => {
		const { container } = render(UndoPill, { props: { ...base, status: nothingToUndo, clip: null } });
		expect(container.querySelector('.undo-pill')).toBeNull();
	});

	it('shows the undo buttons without a clip, and adds the row when one arrives', () => {
		const without = render(UndoPill, { props: { ...base, status: somethingToUndo, clip: null } });
		expect(without.container.querySelector('.undo-pill')).toBeTruthy();
		expect(without.container.querySelector('.up-clip'), 'no clip, no second row').toBeNull();
		without.unmount();

		const with_ = render(UndoPill, { props: { ...base, status: somethingToUndo, clip: clip('Moon') } });
		expect(with_.container.querySelector('.up-clip')).toBeTruthy();
		expect(with_.getByText('Moon')).toBeTruthy();
	});

	it('carries a paste icon beside the words', () => {
		const { container } = render(UndoPill, {
			props: { ...base, status: nothingToUndo, clip: clip('Ship') }
		});
		expect(container.querySelector('.up-clip svg'), 'the little paste icon').toBeTruthy();
	});

	it('tells the GM what to DO with it, since the indicator is not a button', () => {
		// The Paste button was removed because the right-click already knows where it is going. That
		// makes the tooltip the only place the gesture is named, so it is asserted.
		const { container } = render(UndoPill, {
			props: { ...base, status: nothingToUndo, clip: clip('Planet+7', 'clipboard') }
		});
		const title = container.querySelector('.up-clip')?.getAttribute('title') ?? '';
		expect(title).toContain('right-click');
		expect(title, 'and where it came from, when it came from outside').toContain('map library');
		expect(container.querySelector('.up-clip button'), 'an indicator, not a button').toBeNull();
	});

	it('flashes only when told to, which is only for a clip from outside', () => {
		const quiet = render(UndoPill, {
			props: { ...base, status: nothingToUndo, clip: clip('Planet+7', 'app'), clipPulse: false }
		});
		expect(quiet.container.querySelector('.up-clip.pulse'), 'a copy made here is not news').toBeNull();
		quiet.unmount();

		const loud = render(UndoPill, {
			props: { ...base, status: nothingToUndo, clip: clip('Planet+7', 'clipboard'), clipPulse: true }
		});
		expect(loud.container.querySelector('.up-clip.pulse')).toBeTruthy();
	});
});

describe('the compact label is the shape the owner asked for', () => {
	const clipOf = (root: any, extra: number) => ({
		sseClip: 1,
		root: 'r',
		nodes: [root, ...Array.from({ length: extra }, (_, i) => ({ id: `k${i}`, name: `k${i}` }))]
	}) as any;

	it('writes "Planet+7" and "Moon" exactly', () => {
		// ABSOLUTE, and it is his own example: the kind, then how many more came with it, and nothing
		// else. The NAME is deliberately absent - it would resize the chrome on every copy.
		expect(describeClipCompact(clipOf({ id: 'r', name: 'Earth', kind: 'body', roleHint: 'planet' }, 7))).toBe('Planet+7');
		expect(describeClipCompact(clipOf({ id: 'r', name: 'Luna', kind: 'body', roleHint: 'moon' }, 0))).toBe('Moon');
	});

	it('calls a star with worlds under it a System, as the long label does', () => {
		expect(describeClipCompact(clipOf({ id: 'r', name: 'Sol', kind: 'body', roleHint: 'star' }, 41))).toBe('System+41');
		expect(describeClipCompact(clipOf({ id: 'r', name: 'Sol', kind: 'body', roleHint: 'star' }, 0))).toBe('Star');
	});
});
