// Bump this on release so the activate handler purges stale precached assets (e.g. an old app
// shell that pinned outdated CSS on a device). Runtime fetches are network-first, but the precached
// "/" shell needs a version change to refresh.
// A68 note: this had said v2.0.148 for ~750 versions — the precached "/" shell was never purged,
// and the layout's "new version available" prompt only fires when THIS FILE's bytes change, so it
// had been dead since then. Until the bump rides the release recipe automatically, bump it on any
// push that changes what the offline shell needs.
const STATIC_CACHE = 'sse-static-v3.1.78';
const RUNTIME_CACHE = 'sse-runtime-v3.1.78';

const PRECACHE_URLS = [
  '/',
  '/manifest.webmanifest',
  '/robots.txt',
  '/images/ui/SSE-Icon480x480.png',
  '/pwa/icon-192.png',
  '/pwa/icon-512.png'
];

// B3: INSTALL DOES NOT SKIP WAITING. It used to (`.then(() => self.skipWaiting())` on the end of the
// precache), which took over every open page the moment a new version finished installing - so the
// app's "Reload now to update?" prompt reloaded the page whichever button was pressed, in the middle
// of whatever the GM was doing. A new worker now WAITS until the page says the GM agreed (the
// SKIP_WAITING message below), or until every tab of the app has closed. A first install is not
// affected: with no older worker to wait for, it activates straight away by itself.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Keep API traffic live.
  if (url.pathname.startsWith('/api/')) return;

  // Only manage same-origin requests.
  if (url.origin !== self.location.origin) return;

  // Network-first to avoid stale UI when online; cache remains offline fallback.
  event.respondWith(
    (async () => {
      const runtimeCache = await caches.open(RUNTIME_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) {
          runtimeCache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        const cached = await runtimeCache.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const shell = await caches.match('/');
          if (shell) return shell;
        }
        throw err;
      }
    })()
  );
});
