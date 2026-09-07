// B131: a MACHINE write (the clock stamping a ship in flight, up to sixty a second) must cost the
// recorder nothing. Before this, every silent emission rebuilt the shadow - a strip-and-deep-clone of
// the whole system - so a transit with the clock running paid a clone per frame for the whole flight.
// Tested against the REAL store, processor and pack, like systemUndo.spec.ts, with the clone COUNTED.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { get } from 'svelte/store';

vi.mock('$lib/system/importFixup', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/system/importFixup')>();
	return { ...actual, stripSystemForExport: vi.fn(actual.stripSystemForExport) };
});

import { systemStore } from '$lib/stores';
import { systemProcessor } from '$lib/core/SystemProcessor';
import { loadStarterPack } from '$lib/import/realsky/testPack';
import { fixUpImportedSystem, stripSystemForExport } from '$lib/system/importFixup';
import { attachSystemUndo, silentSystemWrite, undo, undoStatus } from './systemUndo';
import type { CelestialBody, System } from '$lib/types';

const pack = loadStarterPack();
const strip = vi.mocked(stripSystemForExport);

function freshSol(): System {
	const raw = JSON.parse(fs.readFileSync(path.resolve('static/examples/Sol_2030-System.json'), 'utf-8')) as System;
	return systemProcessor.process(fixUpImportedSystem(raw, pack), pack);
}

/** What the clock does to a ship in flight: a fresh node with a new stamp, a fresh system, silently. */
function clockStamp(i: number) {
	silentSystemWrite(() => {
		const sys = get(systemStore)!;
		systemStore.set({
			...sys,
			nodes: sys.nodes.map((n) => (n.name === 'Earth' ? ({ ...n, vector_epoch_ms: 1_000 + i } as any) : n))
		});
	});
}

/** What a GM edit does: mutate in place, process, set a fresh object (SystemView.handleBodyUpdate). */
function authoredEdit(mutate: (sys: System) => void) {
	const sys = get(systemStore)!;
	mutate(sys);
	systemStore.set({ ...systemProcessor.process({ ...sys, nodes: sys.nodes }, pack) });
}

let detach: () => void;

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
	systemStore.set(freshSol());
	detach = attachSystemUndo(() => pack);
	strip.mockClear();
});

afterEach(() => {
	detach();
	vi.useRealTimers();
});

describe('B131: a machine write per frame costs the recorder nothing', () => {
	it('a thousand silent emissions strip-and-clone the system ZERO times', () => {
		for (let i = 0; i < 1000; i++) clockStamp(i);
		expect(strip).toHaveBeenCalledTimes(0);
		expect(get(undoStatus).canUndo).toBe(false);
	});

	it('the "before" of the next authored edit is the state the clock left, rebuilt once and only then', () => {
		for (let i = 0; i < 50; i++) clockStamp(i);
		expect(strip).toHaveBeenCalledTimes(0);
		authoredEdit((sys) => {
			(sys.nodes.find((n) => n.name === 'Earth') as CelestialBody).name = 'Terra';
		});
		vi.advanceTimersByTime(300);
		expect(get(undoStatus).canUndo).toBe(true);
		undo();
		const earth = get(systemStore)!.nodes.find((n) => n.name === 'Earth');
		expect(earth, 'the edit is undone against the state the clock left, not a stale shadow').toBeTruthy();
		expect(get(systemStore)!.nodes.some((n) => n.name === 'Terra')).toBe(false);
	});
});
