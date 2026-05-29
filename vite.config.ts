import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	// Vitest must resolve Svelte's *browser* build so component tests can mount();
	// SvelteKit's Vite plugin doesn't add this condition for Vitest by default.
	resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		globals: true,
		environment: 'jsdom',
		setupFiles: ['src/setup.ts'],
	}
});