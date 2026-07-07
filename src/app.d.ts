// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

// Injected at build time by vite.config.ts `define`.
declare const __BUILD_INFO__: { version: string; commit: string; time: string };

// Vite `?raw` imports (bundled docs rendered in help modals). Typed here so svelte-check/tsc don't need
// vite/client to be in scope for these to resolve to a string.
declare module '*.md?raw' {
	const content: string;
	export default content;
}

export {};
