import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { fakeCanvas } from './glTestCanvas';

/**
 * C20 job 3: GIVE THE CONTEXT BACK, AND PROVE IT ACROSS TWENTY CYCLES.
 *
 * `dispose()` frees three's own objects; it does NOT hand back the WebGL context, which lingers
 * until collection. Browsers cap live contexts (Chromium around 16) and silently kill the OLDEST
 * when the cap is reached - so a GM cycling the holo, the size comparison, the gallery and a model
 * viewer accumulates contexts until the browser starts reaping views they are still looking at.
 * All six teardowns called `dispose()` and not one called `forceContextLoss()`.
 *
 * WHAT THIS CAN AND CANNOT SEE. The browser's own live-context count is not observable from a page,
 * so it is not asserted here or anywhere - what is asserted is the count of contexts THIS APP is
 * still holding, which is the number we are responsible for and the one that was climbing. Whether
 * Chromium's own tally then falls is the browser's side of the contract and is eyes-only.
 */

const forceContextLoss = vi.fn();
const dispose = vi.fn();

vi.mock('three', () => ({
	WebGLRenderer: class {
		constructor(public params: any) {}
		setPixelRatio() {}
		dispose = dispose;
		forceContextLoss = forceContextLoss;
	}
}));

const SURFACES = ['holo', 'comparison', 'gallery', 'filtered', 'starmap', 'model'];

async function fresh() {
	vi.resetModules();
	const factory = await import('./glRenderer');
	const notice = await import('./renderNotice');
	return { factory, notice };
}

beforeEach(() => {
	dispose.mockClear();
	forceContextLoss.mockClear();
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((kind: string) =>
		kind === 'webgl2' || kind === 'webgl' ? ({ getExtension: () => null } as any) : null
	);
});
afterEach(() => vi.restoreAllMocks());

describe('a closed 3D view hands its context back (C20)', () => {
	it('releases with dispose AND forceContextLoss, in that order', async () => {
		const { factory } = await fresh();
		const order: string[] = [];
		dispose.mockImplementation(() => order.push('dispose'));
		forceContextLoss.mockImplementation(() => order.push('forceContextLoss'));
		const r = factory.createGlRenderer({ canvas: fakeCanvas(), surface: 'holo' });
		factory.releaseGlRenderer(r);
		// The ORDER is load-bearing: forceContextLoss destroys the context, and three cannot free its
		// GPU objects through a context that no longer exists.
		expect(order).toEqual(['dispose', 'forceContextLoss']);
	});

	it('TWENTY open/close cycles on every surface leave the live count flat', async () => {
		const { factory } = await fresh();
		expect(factory.liveGlRendererCount()).toBe(0);
		for (const surface of SURFACES) {
			for (let i = 0; i < 20; i++) {
				const r = factory.createGlRenderer({ canvas: fakeCanvas(), surface });
				factory.releaseGlRenderer(r);
			}
			// Checked after EVERY surface, not just at the end, so a failure names which one leaks.
			expect(factory.liveGlRendererCount(), `after 20 cycles of ${surface}`).toBe(0);
		}
		expect(forceContextLoss).toHaveBeenCalledTimes(SURFACES.length * 20);
		expect(factory.liveGlSurfaces()).toEqual([]);
	});

	it('counts the ones still open, so the gate can name what leaked', async () => {
		const { factory } = await fresh();
		const kept = SURFACES.map((surface) => factory.createGlRenderer({ canvas: fakeCanvas(), surface }));
		expect(factory.liveGlRendererCount()).toBe(6);
		expect(factory.liveGlSurfaces()).toEqual(SURFACES);
		kept.forEach((r) => factory.releaseGlRenderer(r));
		expect(factory.liveGlRendererCount()).toBe(0);
	});

	it('releasing twice is harmless and does not double-dispose', async () => {
		// A teardown that runs on both an explicit close and a component destroy is normal.
		const { factory } = await fresh();
		const r = factory.createGlRenderer({ canvas: fakeCanvas(), surface: 'holo' });
		factory.releaseGlRenderer(r);
		factory.releaseGlRenderer(r);
		expect(dispose).toHaveBeenCalledTimes(1);
		expect(forceContextLoss).toHaveBeenCalledTimes(1);
		expect(factory.liveGlRendererCount()).toBe(0);
	});

	it('a context the browser already reaped still tears down cleanly', async () => {
		// forceContextLoss throws on an already-lost context. Failing the teardown over it would
		// strand the rest of the cleanup for a context that is gone either way.
		const { factory } = await fresh();
		forceContextLoss.mockImplementation(() => {
			throw new Error('context already lost');
		});
		const r = factory.createGlRenderer({ canvas: fakeCanvas(), surface: 'holo' });
		expect(() => factory.releaseGlRenderer(r)).not.toThrow();
		expect(factory.liveGlRendererCount()).toBe(0);
	});

	it('takes its listeners off the canvas, so a released surface cannot still be talking', async () => {
		const { factory } = await fresh();
		const canvas = fakeCanvas();
		const r = factory.createGlRenderer({ canvas, surface: 'holo' });
		expect(canvas.count()).toBe(2); // lost + restored
		factory.releaseGlRenderer(r);
		expect(canvas.count()).toBe(0);
	});
});

describe('a reaped context says so instead of going quietly dead (C20)', () => {
	it('every surface gets a handler, not just the holo', async () => {
		const { factory, notice } = await fresh();
		for (const surface of SURFACES) {
			notice.setRenderNotice(null);
			const canvas = fakeCanvas();
			const r = factory.createGlRenderer({ canvas, surface });
			canvas.fire('webglcontextlost');
			expect(get(notice.renderNotice), surface).toMatch(/took this view's graphics back/i);
			expect(factory.glContextEvents(r).lost, surface).toBe(1);
			factory.releaseGlRenderer(r);
		}
	});

	it('calls preventDefault, which is what PERMITS the browser to restore it', async () => {
		const { factory } = await fresh();
		const canvas = fakeCanvas();
		factory.createGlRenderer({ canvas, surface: 'holo' });
		const preventDefault = vi.fn();
		canvas.fire('webglcontextlost', { preventDefault });
		expect(preventDefault).toHaveBeenCalled();
	});

	it('the sentence says what to do, not just what broke', async () => {
		const { factory, notice } = await fresh();
		const canvas = fakeCanvas();
		factory.createGlRenderer({ canvas, surface: 'comparison' });
		canvas.fire('webglcontextlost');
		const msg = get(notice.renderNotice)!;
		expect(msg).toMatch(/too many/i);
		expect(msg).toMatch(/reloading|closing/i);
	});

	it('counts a restore, and lets a surface that can rebuild hear about both', async () => {
		const { factory } = await fresh();
		const canvas = fakeCanvas();
		const onContextLost = vi.fn();
		const onContextRestored = vi.fn();
		const r = factory.createGlRenderer({ canvas, surface: 'holo', onContextLost, onContextRestored });
		canvas.fire('webglcontextlost');
		canvas.fire('webglcontextrestored');
		expect(factory.glContextEvents(r)).toEqual({ lost: 1, restored: 1 });
		expect(onContextLost).toHaveBeenCalledTimes(1);
		expect(onContextRestored).toHaveBeenCalledTimes(1);
	});
});
