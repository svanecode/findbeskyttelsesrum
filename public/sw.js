// DISABLED SERVICE WORKER - DO NOT CACHE ANYTHING
// This service worker is intentionally minimal to prevent any caching issues
// All caching is handled by HTTP headers and HardCacheBuster component

// Immediately activate and skip waiting
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Clean up ALL caches on activation
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Do not intercept any fetch requests - let them go directly to network
self.addEventListener('fetch', (event) => {
  // Pass through - no caching
  return;
}); 