// ASKING FOR THE CLIPBOARD ON A GESTURE — the fix for "never being offered a paste when i have a
// paste buffer from the sharing site" (owner, 2026-09-06).
//
// THE BUG THIS REPLACES, because it is worth not re-deriving: the only read was a SILENT one, gated
// on the permission already being `granted`. Chrome's default is `prompt` and nothing moves it to
// `granted` except a read the user allows; Firefox has no such permission and throws. So the gate
// was false for every user forever, the clipboard was never looked at, and — since the undo pill
// shows itself for a clip OR an edit — a GM with neither saw an empty screen and two features that
// looked broken for one reason.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { get } from 'svelte/store';
import { detectedClip, readClipboardOnGesture, clipboardCanBeAsked, clipboardHint, noteClipText } from './clipDetect';
import { clipBuffer, clearClip, putClip } from './clipBuffer';

const CLIP = JSON.stringify({
	sseClip: 1,
	root: 'r',
	nodes: [{ id: 'r', name: 'Vega', kind: 'body', roleHint: 'star', parentId: null, massKg: 2e30 }]
});

function withClipboard(readText: () => Promise<string>) {
	Object.defineProperty(globalThis.navigator, 'clipboard', {
		value: { readText, writeText: async () => {} },
		configurable: true
	});
}

beforeEach(() => {
	clearClip();
});

describe('a gesture read reaches the clipboard the silent one never could', () => {
	it('finds a clip and offers it', async () => {
		withClipboard(async () => CLIP);
		await readClipboardOnGesture();
		expect(get(detectedClip)?.compact).toBe('Star');
		expect(get(detectedClip)?.from).toBe('clipboard');
	});

	it('leaves the app’s OWN copy alone rather than going looking', async () => {
		// The in-app buffer is certain and needs no permission; asking the browser over the top of it
		// would raise a dialogue to learn something already known.
		const asked = vi.fn(async () => CLIP);
		withClipboard(asked);
		putClip(JSON.parse(CLIP), 'Vega');
		await readClipboardOnGesture();
		expect(asked, 'must not touch the clipboard when our own buffer is full').not.toHaveBeenCalled();
	});

	it('says nothing for ordinary text', async () => {
		withClipboard(async () => 'just some notes I copied');
		await readClipboardOnGesture();
		expect(get(detectedClip)).toBeNull();
	});
});

describe('a refusal is remembered, so a right-click never nags', () => {
	it('stops asking after the first refusal', async () => {
		// A GM who dismisses the prompt must not meet it again on the next right-click. A control that
		// raised a dialogue every time would be worse than the one that never asked.
		const asked = vi.fn(async () => { throw new DOMException('denied', 'NotAllowedError'); });
		withClipboard(asked);
		expect(clipboardCanBeAsked()).toBe(true);
		await readClipboardOnGesture();
		expect(asked).toHaveBeenCalledTimes(1);
		expect(clipboardCanBeAsked(), 'and it knows not to try again').toBe(false);
		await readClipboardOnGesture();
		await readClipboardOnGesture();
		expect(asked, 'still once').toHaveBeenCalledTimes(1);
	});
});

describe('the order that makes a gesture read legal, pinned in the source', () => {
	const src = readFileSync(join(process.cwd(), 'src/lib/io/clipDetect.ts'), 'utf8');

	it('calls readText BEFORE any await', () => {
		// A browser grants a gesture "transient activation" that an intervening `await` can spend, so
		// checking the permission first - which is exactly what the SILENT path does - would lose the
		// thing that makes the read allowed. This cannot be observed in jsdom, which has no notion of
		// activation, so it is pinned here: a future edit that moves a permission check above the
		// read would look harmless and would silently break the feature in a real browser.
		const fn = src.slice(src.indexOf('export async function readClipboardOnGesture'));
		const body = fn.slice(0, fn.indexOf('\n}'));
		const firstAwait = body.indexOf('await ');
		const theRead = body.indexOf('navigator.clipboard.readText()');
		expect(theRead, 'the read must be there at all').toBeGreaterThan(-1);
		expect(firstAwait, 'the FIRST await in this function must be the read itself')
			.toBe(body.indexOf('await navigator.clipboard.readText()'));
		// And it consults no permission at all: before the read that would spend the activation, and
		// after it there is nothing left to decide - the read has already told us the answer.
		expect(body, 'a permission check has no place in the gesture path').not.toContain('permissions');
	});

	it('is called from a menu opening, in both views', () => {
		// A menu is a GM asking what the options are - which is the gesture the original caution ruled
		// IN. Idle mousing still never asks, which is what it ruled out.
		const sys = readFileSync(join(process.cwd(), 'src/lib/components/SystemView.svelte'), 'utf8');
		const map = readFileSync(join(process.cwd(), 'src/lib/components/Starmap.svelte'), 'utf8');
		expect(sys).toContain('readClipboardOnGesture()');
		expect((map.match(/readClipboardOnGesture\(\)/g) ?? []).length, 'a star AND empty space').toBeGreaterThanOrEqual(2);
	});
});

describe('when the app cannot look, it says so instead of showing nothing', () => {
	// FIREFOX IS THE CASE. It has no `clipboard-read` permission at all, so no gesture will ever get
	// the clipboard - and without this a GM who copied a system on the map library's site would see
	// no paste option anywhere, and nothing to tell them Ctrl+V is the way in. A Chrome user who
	// refused the prompt lands in the same place.
	//
	// A FRESH MODULE PER TEST, because `gestureReadRefused` is module state by design - one refusal
	// must silence the asking for the whole session. That is right for the app and poison for a test
	// file, where the refusal test above would otherwise decide the answers down here.
	const fresh = async () => {
		vi.resetModules();
		return await import('./clipDetect');
	};

	it('offers the Ctrl+V hint when the clipboard cannot be asked at all', async () => {
		Object.defineProperty(globalThis.navigator, 'clipboard', { value: undefined, configurable: true });
		const m = await fresh();
		expect(m.clipboardCanBeAsked()).toBe(false);
		expect(m.clipboardHint()).toMatch(/ctrl\+v/i);
	});

	it('stays quiet while the browser CAN still be asked - the right-click will do it', async () => {
		withClipboard(async () => '');
		const m = await fresh();
		expect(m.clipboardCanBeAsked()).toBe(true);
		expect(m.clipboardHint(), 'no hint needed: the next right-click asks').toBeNull();
	});

	it('stays quiet once something is in hand, whichever way it arrived', async () => {
		Object.defineProperty(globalThis.navigator, 'clipboard', { value: undefined, configurable: true });
		const m = await fresh();
		m.noteClipText(CLIP);
		expect(m.clipboardHint(), 'Ctrl+V worked; stop telling them to press it').toBeNull();
	});
});
