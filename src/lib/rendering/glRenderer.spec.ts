import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * C20: WHAT WE ACTUALLY ASK THE BROWSER FOR.
 *
 * A real GPU cannot be asserted under vitest - there is no context to get, and nothing observable in
 * jsdom changes when a page is handed the discrete chip instead of the integrated one. So this pins
 * the DECISION rather than its effect: three.js is stubbed, and the test reads the parameter object
 * the app hands the constructor. That is exactly the thing that was missing at all six sites, and it
 * is the thing a future edit would drop silently.
 *
 * The companion `glRendererSites.spec.ts` stops anyone reaching past the factory; this one stops the
 * factory itself quietly asking for less.
 */

const constructed: any[] = [];
const pixelRatios: number[] = [];

vi.mock('three', () => ({
	WebGLRenderer: class {
		constructor(params: any) {
			constructed.push(params);
		}
		setPixelRatio(r: number) {
			pixelRatios.push(r);
		}
	}
}));

const canvas = {} as HTMLCanvasElement;

// Imported ONCE at module scope rather than inside each test. Resolving and transforming this module
// (and the store and probe it now pulls in) costs seconds on a cold worker, which was enough to blow
// the first test's 5 s budget and then leak its renderer into the next test's count.
const { createGlRenderer } = await import('./glRenderer');
const make = (opts: any) => createGlRenderer({ canvas, ...opts });

beforeEach(() => {
	constructed.length = 0;
	pixelRatios.length = 0;
	// THE FACTORY NOW PROBES THE RENDER PATH before it builds anything (C20 job 2), and jsdom's own
	// `getContext` is both slow enough to blow a 5 s test budget and undefined in its answer. Stub it
	// to a plain grant so THIS file tests the construction arguments and nothing else; the probe's own
	// decisions are pinned in `glSoftwareProbe.spec.ts`, where the answers are varied on purpose.
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((kind: string) =>
		kind === 'webgl2' || kind === 'webgl' ? ({ getExtension: () => null } as any) : null
	);
});

afterEach(() => vi.restoreAllMocks());

describe('the renderer factory asks for what we need (C20)', () => {
	it("asks for the high-performance GPU - the request none of the six sites ever made", async () => {
		make({ surface: 'holo' });
		expect(constructed).toHaveLength(1);
		expect(constructed[0].powerPreference).toBe('high-performance');
	});

	it('asks for it on EVERY surface, not just the holo', async () => {
		for (const surface of ['holo', 'comparison', 'gallery', 'filtered', 'starmap', 'model']) {
			make({ surface });
		}
		expect(constructed).toHaveLength(6);
		expect(constructed.map((c) => c.powerPreference)).toEqual(Array(6).fill('high-performance'));
	});

	it('does NOT ask for a low-power GPU when the machine says it is struggling', async () => {
		// Reads backwards until you see it: low power means "this machine is short of fill rate", and
		// the answer to that is the BEST chip it has. Low power saves by doing less work, not by
		// asking for a worse GPU - and the flag cannot be changed after the context exists anyway.
		make({ surface: 'holo', lowPower: true });
		expect(constructed[0].powerPreference).toBe('high-performance');
	});

	it('does not set failIfMajorPerformanceCaveat on a real surface', async () => {
		// A refused context here would THROW and take the view with it. The refusal has to be learned
		// on a throwaway probe instead, so that we can say so and carry on (steer, don't stop).
		make({ surface: 'holo' });
		expect(constructed[0].failIfMajorPerformanceCaveat).toBeUndefined();
	});

	it("carries each surface's own genuine differences through", async () => {
		make({ surface: 'comparison', antialias: true, alpha: false });
		expect(constructed[0]).toMatchObject({ antialias: true, alpha: false, preserveDrawingBuffer: false });
		constructed.length = 0;
		make({ surface: 'holo', antialias: true, alpha: true, preserveDrawingBuffer: true });
		expect(constructed[0]).toMatchObject({ antialias: true, alpha: true, preserveDrawingBuffer: true });
	});

	it('never turns preserveDrawingBuffer on by default - it costs memory on every surface that has it', async () => {
		make({ surface: 'starmap' });
		expect(constructed[0].preserveDrawingBuffer).toBe(false);
	});

	it('caps the pixel ratio through the one shared law, and drops it to 1 on low power', async () => {
		// Four of the six sites open-coded this cap in four different orderings and only one guarded
		// `typeof window`. One law now, and it is the biggest single lever in the app (G83).
		//
		// THE RETINA STUB IS THE WHOLE TEST. jsdom reports a devicePixelRatio of 1, where low power and
		// full power give the same answer - so without this the assertion passes with the lever removed,
		// which it was seen to do. A panel that costs something is the only place the two differ.
		const prev = window.devicePixelRatio;
		Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
		try {
			make({ surface: 'holo' });
			expect(pixelRatios).toEqual([2]);
			pixelRatios.length = 0;
			make({ surface: 'holo', lowPower: true });
			expect(pixelRatios).toEqual([1]);
		} finally {
			Object.defineProperty(window, 'devicePixelRatio', { value: prev, configurable: true });
		}
	});
});
