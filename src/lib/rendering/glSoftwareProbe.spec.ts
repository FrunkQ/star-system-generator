import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { fakeCanvas } from './glTestCanvas';

/**
 * C20 job 2: NOTICE WHEN THE BROWSER SAYS NO, AND KEEP RUNNING.
 *
 * A software rasteriser cannot be produced under vitest and a real GPU cannot be asserted there
 * either, so what is pinned here is the DECISION CHAIN: given each answer the browser can give,
 * what do we conclude, what do we turn on, and what do we say. `getContext` is stubbed to give each
 * answer in turn, which is the only part of this that a browser would do differently.
 *
 * The one thing NOT pinned here is that a loaded Edge actually refuses - that needs the owner's own
 * machine and is on the eyeball list.
 */

// three is stubbed so the factory can be exercised without a real context.
vi.mock('three', () => ({
	WebGLRenderer: class {
		constructor(public params: any) {}
		setPixelRatio() {}
	}
}));

type Answer = 'grant' | 'refuse-strict' | 'refuse-all';

/** Stand in for a browser giving one of the three answers it can give. */
function browserThatWill(answer: Answer) {
	const lost = { loseContext: vi.fn() };
	const ctx = { getExtension: vi.fn(() => lost) };
	const calls: WebGLContextAttributes[] = [];
	const spy = vi
		.spyOn(HTMLCanvasElement.prototype, 'getContext')
		.mockImplementation((kind: string, attrs?: any) => {
			if (kind !== 'webgl2' && kind !== 'webgl') return null;
			calls.push(attrs);
			if (answer === 'refuse-all') return null;
			if (answer === 'refuse-strict' && attrs?.failIfMajorPerformanceCaveat) return null;
			return ctx as any;
		});
	return { calls, lost, spy };
}

async function fresh() {
	vi.resetModules();
	const probe = await import('./glSoftwareProbe');
	const store = await import('$lib/lowPowerStore');
	const factory = await import('./glRenderer');
	const notice = await import('./renderNotice');
	probe.resetRenderPathForTests();
	return { probe, store, factory, notice };
}

beforeEach(() => {
	try {
		localStorage.clear();
	} catch {
		/* not every environment has one */
	}
});
afterEach(() => vi.restoreAllMocks());

describe('what this machine draws with (C20)', () => {
	it('a granted strict context means a real GPU, and the probe is handed straight back', async () => {
		const { lost } = browserThatWill('grant');
		const { probe } = await fresh();
		expect(probe.renderPath()).toBe('gpu');
		expect(lost.loseContext).toHaveBeenCalled(); // never keep one of the browser's few contexts
	});

	it('a refusal that becomes a grant without the condition IS the software rasteriser', async () => {
		const { calls } = browserThatWill('refuse-strict');
		const { probe } = await fresh();
		expect(probe.renderPath()).toBe('software');
		// The whole measurement rests on this flag being asked exactly once, first.
		expect(calls[0].failIfMajorPerformanceCaveat).toBe(true);
		expect(calls.some((c) => !c.failIfMajorPerformanceCaveat)).toBe(true);
	});

	it('probes the same context we actually build, or it is measuring something else', async () => {
		const { calls } = browserThatWill('grant');
		const { probe } = await fresh();
		probe.renderPath();
		expect(calls[0].powerPreference).toBe('high-performance');
	});

	it('a refusal both ways is no WebGL at all, which is a different sentence', async () => {
		browserThatWill('refuse-all');
		const { probe } = await fresh();
		expect(probe.renderPath()).toBe('none');
	});

	it('a browser that throws is given the benefit of the doubt', async () => {
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
			throw new Error('context creation exploded');
		});
		const { probe } = await fresh();
		// A machine we cannot ask about is assumed to be a normal one - the same rule lowPowerStore
		// already states, because the cost of being wrong is telling someone their good machine is bad.
		expect(probe.renderPath()).toBe('gpu');
	});

	it('asks once and remembers - asking again would worsen the very shortage it detects', async () => {
		const { spy } = browserThatWill('grant');
		const { probe } = await fresh();
		probe.renderPath();
		const afterFirst = spy.mock.calls.length;
		probe.renderPath();
		probe.renderPath();
		expect(spy.mock.calls.length).toBe(afterFirst);
	});

	it('says what happened AND what to do about it', async () => {
		const { probe } = await fresh();
		const software = probe.renderPathNotice('software')!;
		expect(software).toMatch(/processor/i); // what happened
		expect(software).toMatch(/low power/i); // what we did
		expect(software).toMatch(/fresh browser window/i); // what they can do
		expect(probe.renderPathNotice('none')).toMatch(/cannot draw 3D/i);
		expect(probe.renderPathNotice('gpu')).toBeNull(); // a working machine is told nothing
	});
});

describe('a refusal steers, it does not stop (C20)', () => {
	const canvas = fakeCanvas();   // the factory now attaches context-loss listeners to it

	it('on software: low power comes on, the sentence is published, and the view is STILL BUILT', async () => {
		browserThatWill('refuse-strict');
		const { probe, store, factory, notice } = await fresh();
		const renderer = factory.createGlRenderer({ canvas, surface: 'holo' });
		expect(renderer).toBeTruthy(); // steer, don't stop: a slow holo beats no holo
		expect(get(store.lowPower)).toBe(true);
		expect(get(notice.renderNotice)).toMatch(/processor/i);
	});

	it('on a good machine: nothing is turned on and nothing is said', async () => {
		browserThatWill('grant');
		const { probe, store, factory, notice } = await fresh();
		factory.createGlRenderer({ canvas, surface: 'holo' });
		expect(get(store.lowPower)).toBe(false);
		expect(get(notice.renderNotice)).toBeNull();
	});

	it('with no WebGL at all it says so, but does not pretend low power is the answer', async () => {
		browserThatWill('refuse-all');
		const { probe, store, factory, notice } = await fresh();
		factory.createGlRenderer({ canvas, surface: 'holo' });
		expect(get(notice.renderNotice)).toMatch(/cannot draw 3D/i);
		expect(get(store.lowPower)).toBe(false); // fewer clouds does not conjure a GPU
	});

	it('asks once however many surfaces are opened', async () => {
		const { spy } = browserThatWill('refuse-strict');
		const { factory } = await fresh();
		factory.createGlRenderer({ canvas, surface: 'holo' });
		const afterFirst = spy.mock.calls.length;
		for (const surface of ['comparison', 'gallery', 'starmap', 'model', 'filtered'])
			factory.createGlRenderer({ canvas, surface });
		expect(spy.mock.calls.length).toBe(afterFirst);
	});
});

describe('the machine never overrules a person (C20, G69 two facts)', () => {
	const canvas = fakeCanvas();   // the factory now attaches context-loss listeners to it

	it('a GM who turned low power OFF keeps it off on a software rasteriser', async () => {
		localStorage.setItem('sse-low-power', '0'); // an explicit no, not an absence
		browserThatWill('refuse-strict');
		const { probe, store, factory, notice } = await fresh();
		factory.createGlRenderer({ canvas, surface: 'holo' });
		expect(get(store.lowPower)).toBe(false); // their answer stands
		expect(get(notice.renderNotice)).toMatch(/processor/i); // and they are still told why
	});

	it('a GM who turned it ON keeps it on when the machine has no complaint', async () => {
		localStorage.setItem('sse-low-power', '1');
		browserThatWill('grant');
		const { store, factory } = await fresh();
		factory.createGlRenderer({ canvas, surface: 'holo' });
		expect(get(store.lowPower)).toBe(true);
	});

	it('a person choosing AFTERWARDS takes the machine out of play, both ways', async () => {
		browserThatWill('refuse-strict');
		const { store, factory } = await fresh();
		factory.createGlRenderer({ canvas, surface: 'holo' });
		expect(get(store.lowPower)).toBe(true); // the machine's doing
		store.lowPower.set(false); // ...the GM disagrees
		expect(get(store.lowPower)).toBe(false);
		// and it must STAY disagreed - a later proposal cannot undo a person
		store.proposeLowPower(true, 'measured again');
		expect(get(store.lowPower)).toBe(false);
	});

	it('writing through the switch records an explicit choice, so it survives a reload', async () => {
		browserThatWill('grant');
		const { store } = await fresh();
		store.lowPower.set(false);
		// The absent key used to mean "off". It now means "nobody has said", so an explicit off has to
		// be written down or the next probe would quietly overrule it.
		expect(localStorage.getItem('sse-low-power')).toBe('0');
		store.lowPower.set(true);
		expect(localStorage.getItem('sse-low-power')).toBe('1');
	});

	it('an absence still means nobody has said, so a good machine draws everything', async () => {
		browserThatWill('grant');
		const { store } = await fresh();
		expect(get(store.lowPowerChoice)).toBe('auto');
		expect(get(store.lowPower)).toBe(false);
	});
});
