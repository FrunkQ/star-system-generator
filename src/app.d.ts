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

export {};
