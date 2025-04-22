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

// List of static assets to cache first
const STATIC_ASSETS = [
  '/_next/static/css/',
  '/_next/static/media/',
  '/_next/static/chunks/',
  '/_next/image/',
  '/images/',
  '/favicons/',
];

// Install event - skip caching during install
self.addEventListener('install', (event) => {
  // Skip waiting to activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches and take control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && name !== STATIC_CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      }),
      // Take control of all clients immediately
      self.clients.claim(),
    ])
  );
});

// Helper function to check if URL is a static asset
const isStaticAsset = (url) => {
  return STATIC_ASSETS.some(path => url.pathname.startsWith(path));
};

// Helper function to check if URL should never be cached
const shouldNeverCache = (url) => {
  return NO_CACHE_URLS.some(path => url.pathname.startsWith(path)) ||
    url.pathname.endsWith('.js') ||
    url.pathname.startsWith('/api/');
};

// Cache first strategy for static assets
const cacheFirst = async (request) => {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // If both cache and network fail, return a fallback response
    return new Response('', {
      status: 404,
      statusText: 'Not Found',
    });
  }
};

// Network first strategy for dynamic content
const networkFirst = async (request) => {
  try {
    const response = await fetch(request);
    if (response.ok) {
      return response;
    }
    throw new Error('Network response was not ok');
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    // If both network and cache fail, return a fallback response
    return new Response('', {
      status: 404,
      statusText: 'Not Found',
    });
  }
};

// Fetch event - handle requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Never cache HTML, JS, or API requests
  if (shouldNeverCache(url)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Use cache first for static assets
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Use network first for everything else
  event.respondWith(networkFirst(event.request));
});

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
}); 