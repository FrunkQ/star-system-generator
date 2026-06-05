<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { injectAnalytics } from '@vercel/analytics/sveltekit';
	import '$lib/styles/tokens.css';
	import '$lib/styles/paletteStore'; // applies any saved palette overrides to :root app-wide
	import '$lib/styles/touch-overrides.css';

	let { children } = $props();
	let swUpdateInterval: ReturnType<typeof setInterval> | undefined;

	// Vercel Web Analytics — anonymous visitor counts (user community OK'd tracking #s).
	// No-ops in dev / off Vercel. Requires Analytics enabled in the Vercel project too.
	injectAnalytics();

	// DEV BUILD STAMP — shown ONLY on beta (and local dev), never on production, so
	// a stale cached / PWA copy is obvious during testing. commit + time are baked
	// in at build time and change every build.
	const build = __BUILD_INFO__;
	const builtAt = new Date(build.time).toLocaleString();
	const showBuildStamp =
		browser &&
		(/(^|\.)beta\.starsystemx\.com$/i.test(window.location.hostname) ||
			window.location.hostname === 'localhost' ||
			window.location.hostname === '127.0.0.1');
	let dismissed = $state(false);

	onMount(() => {
		if (!('serviceWorker' in navigator)) return;
		const isProd = import.meta.env.PROD;
		const disableSw = window.location.search.includes('no-sw=1');

		// Keep local/dev/testing sessions free of stale SW caches.
		if (!isProd || disableSw) {
			navigator.serviceWorker.getRegistrations().then((regs) => {
				regs.forEach((r) => r.unregister());
			});
			if ('caches' in window) {
				caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
			}
			return;
		}

		let refreshing = false;
		navigator.serviceWorker.addEventListener('controllerchange', () => {
			if (refreshing) return;
			refreshing = true;
			window.location.reload();
		});

		navigator.serviceWorker
			.register('/sw.js')
			.then((registration) => {
				registration.update();

				registration.addEventListener('updatefound', () => {
					const nextWorker = registration.installing;
					if (!nextWorker) return;

					nextWorker.addEventListener('statechange', () => {
						if (nextWorker.state === 'installed' && navigator.serviceWorker.controller) {
							const applyUpdate = window.confirm(
								'A new version is available. Reload now to update?'
							);
							if (applyUpdate) {
								nextWorker.postMessage({ type: 'SKIP_WAITING' });
							}
						}
					});
				});

				// Poll for updates roughly hourly while app is open.
				swUpdateInterval = setInterval(() => registration.update(), 60 * 60 * 1000);
			})
			.catch((err) => console.error('Service worker registration failed:', err));
	});

	onDestroy(() => {
		if (swUpdateInterval) clearInterval(swUpdateInterval);
	});
</script>

<svelte:head>
	<link rel="icon" type="image/png" sizes="480x480" href="/images/ui/SSE-Icon480x480.png" />
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#1a1a1a" />
	<meta name="mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
	<meta name="apple-mobile-web-app-title" content="Star System Explorer" />
	<link rel="apple-touch-icon" href="/images/ui/SSE-Icon480x480.png" />
</svelte:head>

{@render children?.()}

{#if showBuildStamp && !dismissed}
	<button
		class="build-stamp"
		title="Build stamp — click to dismiss. commit {build.commit}, built {build.time}"
		onclick={() => (dismissed = true)}
	>
		BUILD v{build.version} · {build.commit} · {builtAt}
	</button>
{/if}

<style>
  /* Base styles retokenized onto the design tokens (src/lib/styles/tokens.css) so the
     whole app shares one dark baseline + accent. Per-component styles still override
     these and are being swept onto var(--token) wave by wave. */
  :global(body) {
    background-color: var(--bg-app);
    color: var(--text);
    font-family: var(--font-ui);
    margin: 0;
    padding: 0;
  }

  :global(button) {
    background-color: var(--bg-control);
    color: var(--text);
    padding: 8px 15px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 1em;
    transition: background-color 0.2s ease;
  }

  :global(button:hover) {
    background-color: var(--bg-control-hover);
  }

  :global(button:disabled) {
    background-color: var(--bg-panel);
    cursor: not-allowed;
    color: var(--text-faint);
  }

  :global(input[type="text"]),
  :global(input[type="number"]),
  :global(input[type="password"]),
  :global(select),
  :global(textarea) {
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 1em;
    background-color: var(--bg-control);
    color: var(--text);
  }

  :global(a) {
    color: var(--link);
    text-decoration: none;
  }

  :global(a:hover) {
    text-decoration: underline;
  }

  :global(.error) {
    color: var(--status-bad);
    font-weight: bold;
  }

  /* Shared component utilities — components can adopt these and delete their own copies
     during the sweep. */
  :global(.btn-primary) {
    background-color: var(--accent);
    color: var(--on-accent);
    border: none;
  }
  :global(.btn-primary:hover) {
    background-color: var(--accent-hover);
  }
  :global(.btn-danger) {
    background-color: var(--status-bad);
    color: #fff;
    border: none;
  }
  :global(.modal-overlay) {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  :global(.modal-card) {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    color: var(--text);
    padding: var(--space-4);
    max-width: 90vw;
    max-height: 90vh;
    overflow: auto;
  }

  /* TEMPORARY dev build stamp */
  .build-stamp {
    position: fixed;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 99999;
    font: 600 12px/1 ui-monospace, 'Cascadia Code', monospace;
    color: #1a1300;
    background: #ffd24d;
    border: 1px solid #b8860b;
    border-radius: 999px;
    padding: 6px 14px;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
    letter-spacing: 0.3px;
    white-space: nowrap;
  }
  .build-stamp:hover {
    background: #ffe085;
  }
</style>
