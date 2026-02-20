const STATIC_CACHE = 'sse-static-v1.8.4';
const RUNTIME_CACHE = 'sse-runtime-v1.8.4';

const PRECACHE_URLS = [
  '/',
  '/manifest.webmanifest',
  '/robots.txt',
  '/images/ui/SSE-Icon480x480.png',
  '/pwa/icon-192.png',
  '/pwa/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
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
