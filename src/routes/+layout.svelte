<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
	let swUpdateInterval: ReturnType<typeof setInterval> | undefined;

	onMount(() => {
		if (!('serviceWorker' in navigator)) return;

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
	<link rel="icon" href={favicon} />
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#1a1a1a" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
	<meta name="apple-mobile-web-app-title" content="Star System Explorer" />
	<link rel="apple-touch-icon" href="/images/ui/SSE-Image.png" />
</svelte:head>

{@render children?.()}

<style>
  :global(body) {
    background-color: #333;
    color: #eee;
    font-family: 'Arial', sans-serif;
    margin: 0;
    padding: 0;
  }

  :global(button) {
    background-color: #555;
    color: #eee;
    padding: 8px 15px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1em;
    transition: background-color 0.2s ease;
  }

  :global(button:hover) {
    background-color: #777;
  }

  :global(button:disabled) {
    background-color: #444;
    cursor: not-allowed;
    color: #888;
  }

  :global(input[type="text"]),
  :global(input[type="number"]),
  :global(input[type="password"]),
  :global(select),
  :global(textarea) {
    padding: 8px;
    border: 1px solid #555;
    border-radius: 4px;
    font-size: 1em;
    background-color: #444;
    color: #eee;
  }

  :global(a) {
    color: #88ccff;
    text-decoration: none;
  }

  :global(a:hover) {
    text-decoration: underline;
  }

  :global(.error) {
    color: #ff8888;
    font-weight: bold;
  }
</style>
