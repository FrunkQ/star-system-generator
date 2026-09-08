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
		// scripts/ is included for the starmap build kit's reproducibility test,
		// which has to live next to the generator it guards (D4d).
		include: ['src/**/*.{test,spec}.{js,ts}', 'scripts/**/*.{test,spec}.{js,mjs,ts}'],
		globals: true,
		environment: 'jsdom',
		setupFiles: ['src/setup.ts'],
		// A REAL BUDGET, BECAUSE THE DEFAULT 5 s HAD STOPPED MEASURING THE CODE (2026-09-08).
		//
		// The suite is 387 files and several sessions build in parallel worktrees on this machine. A
		// full run was failing two or three tests every time WITH A DIFFERENT SET EACH RUN, always
		// with "Test timed out in 5000 ms", and every one of them passed on its own in well under a
		// second. Nothing was wrong with any of them: whichever tests happened to be scheduled during
		// a busy patch lost the race.
		//
		// That is worse than a slow suite - it is a suite whose verdict is not about the code, and
		// the house rule is that the suite is green before a push. Chasing it per test (which is how
		// this started, on `tagPresentation.spec.ts`) is whack-a-mole on a symptom: the tests are not
		// the thing that changed, the load is. So the budget is set once, here, generously.
		//
		// HOW BIG: measured, not guessed. The source-walking gates - `tagPresentation.spec.ts` and
		// C20's `glRendererSites.spec.ts` - run in about 1.5 s on an idle machine. With several
		// sessions building at once (90% CPU and memory, owner's report the day this was set) the
		// same single walk was measured at 29 s. Thirty was still not enough. Two minutes is.
		//
		// It weakens NO assertion. A test that genuinely hangs still fails, two minutes later.
		testTimeout: 120_000,
		hookTimeout: 120_000,
	}
});