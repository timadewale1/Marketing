/* Service worker with basic runtime caching for same-origin assets. */
const CACHE_NAME = 'bt-static-v1';
const OFFLINE_URL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL]))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// runtime cache name for fetched assets
const RUNTIME = 'bt-runtime-v1'

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Network-first for navigations
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    )
    return
  }

  // Only handle same-origin GET requests (images, icons, static)
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return
  }

  event.respondWith(
    caches.open(RUNTIME).then(async (cache) => {
      try {
        const response = await fetch(request)
        // clone and store in runtime cache for offline use
        try { cache.put(request, response.clone()) } catch (e) { /* ignore cache failures */ }
        return response
      } catch (err) {
        // network failed — try cache
        const cached = await cache.match(request)
        if (cached) return cached
        // fallback to general cache
        return caches.match(OFFLINE_URL)
      }
    })
  )
})
