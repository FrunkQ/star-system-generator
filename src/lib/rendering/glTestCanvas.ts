// A CANVAS STAND-IN FOR THE RENDERER TESTS. Test-only: nothing in the app imports this, and vitest
// collects `*.spec.ts` only, so it is never a test itself and never reaches a bundle.
//
// It exists because THREE specs need the same fake and writing it three times is the fault this
// whole stream is about. `createGlRenderer` attaches context-loss listeners to whatever canvas it is
// given, so a bare `{}` is no longer enough - and a real jsdom canvas is both slow and unable to
// report what was attached to it, which is exactly what the release gate has to check.

export interface FakeCanvas {
	listeners: Map<string, Set<(e: any) => void>>;
	/** How many listeners are attached right now. Zero after a release, or something is still talking. */
	count(): number;
	addEventListener(type: string, fn: any): void;
	removeEventListener(type: string, fn: any): void;
	/** Deliver an event, the way a browser reaping a context would. */
	fire(type: string, e?: any): void;
}

export function fakeCanvas(): FakeCanvas & HTMLCanvasElement {
	const listeners = new Map<string, Set<(e: any) => void>>();
	return {
		listeners,
		count: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
		addEventListener(type: string, fn: any) {
			if (!listeners.has(type)) listeners.set(type, new Set());
			listeners.get(type)!.add(fn);
		},
		removeEventListener(type: string, fn: any) {
			listeners.get(type)?.delete(fn);
		},
		fire(type: string, e: any = { preventDefault() {} }) {
			for (const fn of listeners.get(type) ?? []) fn(e);
		}
	} as any;
}
