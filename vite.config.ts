import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Build stamp baked in at build/dev-server-start time. commit + time change on
// every build, so a cached/PWA copy shows stale values — handy during dev.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
let commit = 'nogit';
try {
	commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
		.toString()
		.trim();
} catch {
	/* git unavailable (e.g. some CI) — leave 'nogit' */
}
const __BUILD_INFO__ = JSON.stringify({ version: pkg.version, commit, time: new Date().toISOString() });

export default defineConfig({
	plugins: [sveltekit()],
	define: { __BUILD_INFO__ },
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