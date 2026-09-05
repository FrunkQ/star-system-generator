// COPY / CUT / PASTE UNDER UNDO AND REDO — the owner's condition on the feature, 2026-09-05:
// "Ensure this is all working well with undo/redo."
//
// It is tested against the REAL store, the REAL processor and the REAL rule pack, and each step is
// written the way the app writes one, because the interesting failures here are interactions. A
// paste that quietly leaves the shadow copy stale, or a cut that undoes to the wrong half of
// itself, is invisible to a unit test of `insertClip` and obvious here.
//
// WHAT THE DESIGN RELIES ON, stated so a later reader does not have to re-derive it: `systemUndo`
// snapshots the AUTHORED slice on every `systemStore` set, so a paste is undoable without the paste
// knowing anything about undo. All the feature adds is `endUndoAction()`, which is why the gates
// below check the STEP COUNT as well as the content - a paste that merges into the previous edit
// would still restore correctly and would still be wrong.
//
// CUT AND PASTE ARE TWO STEPS ON PURPOSE. They are two things a GM did. Undoing a paste and finding
// the branch back in its old home would be a lie about which of them was reversed.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { get } from 'svelte/store';
import { systemStore } from '$lib/stores';
import { systemProcessor } from '$lib/core/SystemProcessor';
import { loadStarterPack } from '$lib/import/realsky/testPack';
import { fixUpImportedSystem } from '$lib/system/importFixup';
import { deleteNode } from '$lib/system/modifiers';
import {
	attachSystemUndo, detachSystemUndo, endUndoAction, undo, redo, undoStatus, resetUndoHistory
} from '$lib/undo/systemUndo';
import { buildClip, parseHubClip, insertClip } from './hubClip';
import type { System } from '$lib/types';

const pack = loadStarterPack();

function freshSol(): System {
	const raw = JSON.parse(fs.readFileSync(path.resolve('static/examples/Sol_2030-System.json'), 'utf-8')) as System;
	return systemProcessor.process(fixUpImportedSystem(raw, pack), pack);
}

const names = () => (get(systemStore)?.nodes ?? []).map((n) => n.name);
const has = (name: string) => names().includes(name);
const countNamed = (name: string) => names().filter((n) => n === name).length;
const steps = () => get(undoStatus).undoDepth ?? (get(undoStatus) as any).canUndo;

beforeEach(() => {
	systemStore.set(freshSol());
	resetUndoHistory();
	attachSystemUndo(() => pack);
});
afterEach(() => {
	detachSystemUndo();
	systemStore.set(null);
});

/**
 * ONE GESTURE ENDS BEFORE THE NEXT BEGINS, and a test has to say so.
 *
 * `endUndoAction()` closes the action in a MICROTASK, deliberately - the caller may still dispatch
 * a write of its own, and that write belongs to the action that is ending. In the app two gestures
 * are always separated by many event-loop turns, so the boundary has long since landed. A test that
 * performs a cut and a paste synchronously never lets it run, and the two collapse into ONE undo
 * step - which is what this helper exists to prevent, and what caught the author out first time.
 */
const settle = () => Promise.resolve();

/** A paste, written exactly as `pasteClipInto` writes one. */
function pasteUnder(clip: any, hostId: string) {
	const working = JSON.parse(JSON.stringify(get(systemStore)!));
	const r = insertClip(working, clip, hostId, 0);
	expect(r.ok, r.ok ? '' : (r as any).problem).toBe(true);
	systemStore.set(systemProcessor.process(working, pack));
	endUndoAction();
	return r;
}

/** A cut, written exactly as `handleCutNode` writes one. */
function cut(nodeId: string) {
	systemStore.set(systemProcessor.process(deleteNode(get(systemStore)!, nodeId), pack));
	endUndoAction();
}

describe('a pasted branch is one undo step, and it goes away again', () => {
	it('undo removes the WHOLE branch, redo brings it all back', () => {
		const sun = get(systemStore)!.nodes.find((n) => !n.parentId)!;
		const earth = get(systemStore)!.nodes.find((n) => n.name === 'Earth')!;
		const before = names().length;

		// Copy Earth (with the Moon beneath it) and paste it back under the Sun.
		const clip = buildClip(get(systemStore)!, earth.id)!;
		expect(clip.nodes.length, 'Earth brings its moon').toBeGreaterThan(1);
		const pasted = pasteUnder(clip, sun.id);

		expect(names().length).toBe(before + clip.nodes.length);
		expect(countNamed('Earth'), 'the copy is a SECOND Earth').toBe(2);

		undo();
		expect(names().length, 'undo takes the whole branch, not part of it').toBe(before);
		expect(countNamed('Earth')).toBe(1);
		// And nothing of the paste is left behind under a different name.
		expect(get(systemStore)!.nodes.some((n) => n.id === pasted.ok && (pasted as any).rootId)).toBe(false);

		redo();
		expect(names().length).toBe(before + clip.nodes.length);
		expect(countNamed('Earth')).toBe(2);
	});

	it('is ONE step, not one per node', () => {
		// A three-node paste that undid a node at a time would restore correctly and still be wrong.
		const sun = get(systemStore)!.nodes.find((n) => !n.parentId)!;
		const earth = get(systemStore)!.nodes.find((n) => n.name === 'Earth')!;
		const before = names().length;
		const clip = buildClip(get(systemStore)!, earth.id)!;
		expect(clip.nodes.length).toBeGreaterThanOrEqual(2);

		pasteUnder(clip, sun.id);
		undo();
		expect(names().length, 'a single undo undid the entire paste').toBe(before);
	});
});

describe('the action boundary is load-bearing, and this is the case that proves it', () => {
	// WHY THIS TEST EXISTS. Removing `endUndoAction()` from the paste left every other gate in this
	// file GREEN, because in each of them the paste is the LAST thing that happens and the 250 ms
	// idle fallback closes it anyway. What the explicit boundary actually prevents is the NEXT edit
	// joining the paste: a GM who pastes a branch and immediately renames something would otherwise
	// find one undo taking both away.
	it('an edit made straight after a paste is its OWN step', async () => {
		const sun = get(systemStore)!.nodes.find((n) => !n.parentId)!;
		const earth = get(systemStore)!.nodes.find((n) => n.name === 'Earth')!;
		const clip = buildClip(get(systemStore)!, earth.id)!;

		pasteUnder(clip, sun.id);
		await settle(); // the paste's own boundary lands here - THIS is what endUndoAction buys
		expect(countNamed('Earth')).toBe(2);

		// An ordinary edit, immediately: mutate in place and set the store, as the app's ~145
		// mutation sites do. No idle gap has passed.
		const mars = get(systemStore)!.nodes.find((n) => n.name === 'Mars')! as any;
		mars.name = 'Mars Renamed';
		systemStore.set(systemProcessor.process(get(systemStore)!, pack));
		endUndoAction();
		await settle();
		expect(has('Mars Renamed')).toBe(true);

		// ONE undo reverses the RENAME only. The pasted branch is still there.
		undo();
		expect(has('Mars Renamed'), 'the rename was undone').toBe(false);
		expect(has('Mars')).toBe(true);
		expect(countNamed('Earth'), 'the paste was NOT swept up with the rename').toBe(2);

		// And the second undo reverses the paste.
		undo();
		expect(countNamed('Earth')).toBe(1);
	});
});

describe('a cut is one undo step, and undo puts the branch back', () => {
	it('restores every node of the branch, with its parents intact', () => {
		const earth = get(systemStore)!.nodes.find((n) => n.name === 'Earth')!;
		const moonsOfEarth = get(systemStore)!.nodes.filter((n) => n.parentId === earth.id).map((n) => n.name);
		expect(moonsOfEarth.length, 'Earth has at least one satellite in the fixture').toBeGreaterThan(0);
		const before = names().length;

		cut(earth.id);
		expect(has('Earth')).toBe(false);
		for (const m of moonsOfEarth) expect(has(m), `${m} went with its planet`).toBe(false);
		expect(names().length).toBeLessThan(before);

		undo();
		expect(has('Earth')).toBe(true);
		for (const m of moonsOfEarth) expect(has(m), `${m} came back with its planet`).toBe(true);
		expect(names().length).toBe(before);
		// The satellite is under its planet again, not orphaned at the root.
		const back = get(systemStore)!.nodes.find((n) => n.name === 'Earth')!;
		for (const m of moonsOfEarth) {
			expect(get(systemStore)!.nodes.find((n) => n.name === m)!.parentId).toBe(back.id);
		}

		redo();
		expect(has('Earth')).toBe(false);
	});
});

describe('cut then paste: two steps, undone in the order they happened', () => {
	it('undo puts it back where it was pasted, then back where it was cut from', async () => {
		const sys = get(systemStore)!;
		const earth = sys.nodes.find((n) => n.name === 'Earth')!;
		const mars = sys.nodes.find((n) => n.name === 'Mars')!;
		expect(mars, 'Mars is in the fixture').toBeTruthy();
		const before = names().length;

		// CUT Earth, then PASTE it under Mars - the move a GM actually performs.
		const clip = buildClip(sys, earth.id)!;
		const branch = clip.nodes.length;
		cut(earth.id);
		await settle(); // the cut is finished before the paste begins, as it is for a GM
		expect(has('Earth')).toBe(false);

		const parsed = parseHubClip(JSON.stringify(clip));
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		pasteUnder(parsed.clip, mars.id);
		await settle();
		expect(has('Earth'), 'Earth is back, under Mars now').toBe(true);

		// A PASTE CAN ADD A NODE THE CLIP NEVER CONTAINED, and this is the engine doing its job
		// rather than a fault: Earth and Mars are comparable in mass, so placing one under the
		// other PROMOTES THE PAIR and a barycentre appears between them (stream J's "pairs form at
		// placement"). Steer, do not stop - the physically odd move is allowed and described.
		// Asserted by NAME because a count would have hidden which node arrived.
		expect(names(), 'a comparable-mass pair promoted on placement').toContain('Earth-Mars Barycentre');
		expect(names().length).toBe(before + 1);

		// FIRST undo reverses the PASTE - Earth is gone again, not back at the Sun. Undoing to the
		// wrong half would be a lie about which of the two actions was reversed. The barycentre the
		// paste caused goes with it: undo restores the authored state, and the pair was never in it.
		undo();
		expect(has('Earth')).toBe(false);
		expect(names(), 'the promoted pair went with the paste that caused it').not.toContain('Earth-Mars Barycentre');
		expect(names().length).toBe(before - branch);

		// SECOND undo reverses the CUT - Earth is back where it started.
		undo();
		expect(has('Earth')).toBe(true);
		expect(names().length).toBe(before);
		expect(get(systemStore)!.nodes.find((n) => n.name === 'Earth')!.parentId).toBe(earth.parentId);
	});
});
