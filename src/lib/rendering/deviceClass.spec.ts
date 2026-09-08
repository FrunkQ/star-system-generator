import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { fakeCanvas } from './glTestCanvas';

/**
 * C20 job 4: THE MACHINE'S OWN NUMBER FINALLY DECIDES SOMETHING - and only one thing.
 *
 * `navigator.deviceMemory` has been collected for diagnostics since the memory investigation and
 * decided nothing; it went into a report a human read afterwards. What is pinned here is not just
 * that it now defaults a small device to low power, but the two things that make that safe: it goes
 * through the SWITCH THE GM CONTROLS rather than a second hidden mode, and A PERSON'S ANSWER BEATS
 * IT in both directions.
 */

vi.mock('three', () => ({
	WebGLRenderer: class {
		constructor(public params: any) {}
		setPixelRatio() {}
		dispose() {}
		forceContextLoss() {}
	}
}));

/** Say what the browser reports, including "nothing" - which is what Firefox and Safari report. */
function deviceReports(gb: number | undefined) {
	Object.defineProperty(navigator, 'deviceMemory', { value: gb, configurable: true });
}

async function fresh() {
	vi.resetModules();
	const store = await import('$lib/lowPowerStore');
	const device = await import('./deviceClass');
	const factory = await import('./glRenderer');
	const notice = await import('./renderNotice');
	const probe = await import('./glSoftwareProbe');
	probe.resetRenderPathForTests();
	return { store, device, factory, notice };
}

beforeEach(() => {
	try {
		localStorage.clear();
	} catch {
		/* not every environment has one */
	}
	// A machine with a real GPU, so nothing but deviceMemory is talking in these tests.
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((kind: string) =>
		kind === 'webgl2' || kind === 'webgl' ? ({ getExtension: () => null } as any) : null
	);
});
afterEach(() => {
	vi.restoreAllMocks();
	Object.defineProperty(navigator, 'deviceMemory', { value: undefined, configurable: true });
});

describe('reading the machine (C20)', () => {
	it('calls 2 GB and below small, and 4 GB and up not', async () => {
		const { device } = await fresh();
		// The rungs are powers of two by specification: 0.25, 0.5, 1, 2, 4, 8.
		for (const gb of [0.25, 0.5, 1, 2]) {
			deviceReports(gb);
			expect(device.isSmallDevice(), `${gb} GB`).toBe(true);
		}
		// FOUR IS THE DELIBERATE LINE: an ordinary working laptop, and a great many people have one.
		for (const gb of [4, 8]) {
			deviceReports(gb);
			expect(device.isSmallDevice(), `${gb} GB`).toBe(false);
		}
	});

	it('has NO OPINION when the browser will not say - it does not guess "small"', async () => {
		const { device } = await fresh();
		deviceReports(undefined); // Firefox, Safari
		expect(device.isSmallDevice()).toBeNull();
		expect(device.deviceMemoryGB()).toBeNull();
	});

	it('one threshold, named, in one place', async () => {
		const { device } = await fresh();
		expect(device.SMALL_DEVICE_GB).toBe(2);
	});
});

describe('a small device defaults to low power, through the GM switch (C20)', () => {
	const canvas = fakeCanvas();

	it('turns low power on when a 3D view opens on a 1 GB device', async () => {
		deviceReports(1);
		const { store, factory } = await fresh();
		expect(get(store.lowPower)).toBe(false); // nothing has looked yet
		factory.createGlRenderer({ canvas, surface: 'holo' });
		expect(get(store.lowPower)).toBe(true);
	});

	it('leaves an ordinary laptop alone', async () => {
		deviceReports(8);
		const { store, factory } = await fresh();
		factory.createGlRenderer({ canvas, surface: 'holo' });
		expect(get(store.lowPower)).toBe(false);
	});

	it('leaves a browser that says nothing alone', async () => {
		deviceReports(undefined);
		const { store, factory } = await fresh();
		factory.createGlRenderer({ canvas, surface: 'holo' });
		expect(get(store.lowPower)).toBe(false);
	});

	it('says nothing on screen about it - there is no action for the reader to take', async () => {
		// Unlike the software-rasteriser message, which names one (close tabs, fresh window). The
		// state is not hidden: the Low power checkbox reads the composed answer and shows as ticked.
		deviceReports(1);
		const { factory, notice } = await fresh();
		factory.createGlRenderer({ canvas, surface: 'holo' });
		expect(get(notice.renderNotice)).toBeNull();
	});

	it('is the SAME switch, not a second one: the checkbox can turn it straight back off', async () => {
		deviceReports(1);
		const { store, factory } = await fresh();
		factory.createGlRenderer({ canvas, surface: 'holo' });
		expect(get(store.lowPower)).toBe(true);
		store.lowPower.set(false); // the GM unticks the box
		expect(get(store.lowPower)).toBe(false);
	});
});

describe('the machine never overrules a person (C20)', () => {
	const canvas = fakeCanvas();

	it('a GM who chose OFF keeps it off on a 1 GB device', async () => {
		localStorage.setItem('sse-low-power', '0'); // an explicit no
		deviceReports(1);
		const { store, factory } = await fresh();
		factory.createGlRenderer({ canvas, surface: 'holo' });
		expect(get(store.lowPower)).toBe(false);
	});

	it('a GM who chose ON keeps it on with 8 GB', async () => {
		localStorage.setItem('sse-low-power', '1');
		deviceReports(8);
		const { store, factory } = await fresh();
		factory.createGlRenderer({ canvas, surface: 'holo' });
		expect(get(store.lowPower)).toBe(true);
	});

	it('a later proposal cannot undo a person who has since decided', async () => {
		deviceReports(1);
		const { store, factory, device } = await fresh();
		factory.createGlRenderer({ canvas, surface: 'holo' });
		expect(get(store.lowPower)).toBe(true);
		store.lowPower.set(false);
		device.proposeLowPowerForSmallDevice(); // the machine says its piece again
		expect(get(store.lowPower)).toBe(false); // and it does not get the last word
	});

	it('records WHY, so a diagnostic can say what decided it', async () => {
		deviceReports(1);
		const { store, factory } = await fresh();
		factory.createGlRenderer({ canvas, surface: 'holo' });
		expect(get(store.lowPowerAuto)?.reason).toMatch(/1 GB/);
	});
});
