const CACHE_NAME = 'app-cache-v1';
const STATIC_CACHE_NAME = 'static-cache-v1';

// List of URLs to never cache
const NO_CACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/service-worker.js',
  '/_next/data/',
  '/_next/static/chunks/pages/',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/_next/static/css/',
        '/_next/static/media/',
        '/_next/static/chunks/',
      ]);
    })
  );
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all([
        // Clean up old caches
        ...cacheNames
          .filter((name) => name !== CACHE_NAME && name !== STATIC_CACHE_NAME)
          .map((name) => caches.delete(name)),
        // Take control of all clients
        self.clients.claim(),
      ]);
    })
  );
});

// Fetch event - handle requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache HTML, JS, or API requests
  if (
    NO_CACHE_URLS.some(path => url.pathname.startsWith(path)) ||
    url.pathname.endsWith('.js') ||
    url.pathname.startsWith('/api/') ||
    event.request.method !== 'GET'
  ) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Clone the response because it can only be used once
          const responseToCache = response.clone();
          
          // Update the cache with the fresh response
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
          
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // Cache static assets
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
    return;
  }

  // For all other requests, try network first
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone the response because it can only be used once
        const responseToCache = response.clone();

        // Cache the response if it's not an error
        if (response.status === 200) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }

        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
}); 