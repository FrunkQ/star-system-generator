import '@testing-library/jest-dom';
import { vi } from 'vitest';

// jsdom doesn't implement matchMedia; components that query it would throw in tests.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
	window.matchMedia = (query: string) =>
		({
			matches: false,
			media: query,
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false
		}) as unknown as MediaQueryList;
}

// jsdom doesn't implement ResizeObserver; the canvas visualizer creates one on mount.
if (typeof globalThis.ResizeObserver === 'undefined') {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

// jsdom sets no origin for Node's fetch, so a ROOT-RELATIVE url — the only kind app code uses for a
// static asset — throws `TypeError: Invalid URL` instead of rejecting. E1 blamed the four page.spec
// failures on this; it was not the cause (see E3), but it is real, and it filled the suite's stderr
// with a stack for every mount. There is no server under test, so answer a plain 404: that is the
// truth, it is what callers already handle, and it never opens a socket. A test that wants a body
// back mocks the module or fetch itself, as several already do.
if (typeof globalThis.fetch === 'function') {
	const realFetch = globalThis.fetch;
	globalThis.fetch = ((input: any, init?: any) => {
		const url = typeof input === 'string' ? input : input?.url;
		if (typeof url === 'string' && url.startsWith('/')) {
			return Promise.resolve(new Response(null, { status: 404, statusText: 'Not Found (no server under test)' }));
		}
		return realFetch(input, init);
	}) as typeof globalThis.fetch;
}

// jsdom's canvas has no 2D context (no native backend). Provide a no-op,
// chainable stub so canvas-drawing components (SystemVisualizer) can mount.
if (typeof HTMLCanvasElement !== 'undefined') {
	const gradientStub = { addColorStop: () => {} };
	const ctxStub = new Proxy(
		{},
		{
			get: (_t, prop) => {
				if (prop === 'canvas') return undefined;
				if (prop === 'measureText') return () => ({ width: 0 });
				if (prop === 'getImageData')
					return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
				// A REAL-SIZED buffer, because every procedural texture in this app paints pixel by pixel
				// into one (planetTexture, the star photosphere, the aurora curtains, the jet beam) and a
				// stub that returns nothing turns each of them into a throw the moment a test builds a
				// body. Zero-filled and never read back for its content — the tests that use it assert
				// what was BUILT, not what it looks like.
				if (prop === 'createImageData')
					return (w: number, h: number) => {
						const width = Math.max(1, Math.round(Number(w) || 1));
						const height = Math.max(1, Math.round(Number(h) || 1));
						return { data: new Uint8ClampedArray(width * height * 4), width, height, colorSpace: 'srgb' };
					};
				if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern')
					return () => gradientStub;
				if (prop === 'getContextAttributes') return () => ({});
				// Canvas state props read back as numbers/strings in some code paths.
				return () => {};
			}
		}
	);
	HTMLCanvasElement.prototype.getContext = vi.fn(() => ctxStub) as unknown as HTMLCanvasElement['getContext'];
}
