const CACHE_VERSION = 'v2';
const CACHE_NAME = `app-cache-${CACHE_VERSION}`;
const STATIC_CACHE_NAME = `static-cache-${CACHE_VERSION}`;
const IS_DEV = process.env.NODE_ENV === 'development';

// List of patterns for URLs to never cache
const NO_CACHE_PATTERNS = [
  /^\/$/,
  /\/index\.html$/,
  /\/manifest\.json$/,
  /\/service-worker\.js$/,
  /\/_next\/data\//,
  /\/_next\/static\/chunks\/pages\//,
  /maps\.gstatic\.com/,
  /maps\.googleapis\.com/,
  /fonts\.googleapis\.com/,
  /fonts\.gstatic\.com/,
  /\.googleapis\.com/,
  /\.gstatic\.com/
];

// List of static assets to cache first
const STATIC_ASSETS = [
  /\/_next\/static\/css\//,
  /\/_next\/static\/media\//,
  /\/_next\/static\/chunks\//,
  /\/_next\/image\//,
  /\/images\//,
  /\/favicons\//
];

// List of dynamic routes that should use network-first strategy
const DYNAMIC_ROUTES = [
  /\/_next\/data\/.*\.json$/,  // Next.js page data
  /\/api\/.*/,                 // API routes
  /\/shelters\/.*/,           // Dynamic shelter routes
];

// Development logging helper
const log = (...args) => {
  if (IS_DEV) {
    console.log('[SW]', ...args);
  }
};

// Install event - skip caching during install
self.addEventListener('install', (event) => {
  log('Installing service worker version:', CACHE_VERSION);
  // Skip waiting to activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches and take control
self.addEventListener('activate', (event) => {
  log('Activating service worker version:', CACHE_VERSION);
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        const deletions = cacheNames
          .filter((name) => !name.includes(CACHE_VERSION))
          .map((name) => {
            log('Deleting old cache:', name);
            return caches.delete(name);
          });
        return Promise.all(deletions);
      }),
      // Take control of all clients immediately
      self.clients.claim(),
    ])
  );
});

// Helper function to check if URL is a static asset
const isStaticAsset = (url) => {
  return STATIC_ASSETS.some(pattern => pattern.test(url.pathname));
};

// Helper function to check if URL is a dynamic route
const isDynamicRoute = (url) => {
  return DYNAMIC_ROUTES.some(pattern => pattern.test(url.pathname));
};

// Helper function to check if URL should never be cached
const shouldNeverCache = (url) => {
  return NO_CACHE_PATTERNS.some(pattern => pattern.test(url.href)) ||
    url.pathname.endsWith('.js') ||
    url.pathname.startsWith('/api/');
};

// Cache first strategy for static assets
const cacheFirst = async (request) => {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      log('Cache hit:', request.url);
      return cachedResponse;
    }

    log('Cache miss, fetching:', request.url);
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    log('Cache first strategy failed:', error);
    return new Response('', {
      status: 404,
      statusText: 'Not Found',
    });
  }
};

// Network first strategy for dynamic content
const networkFirst = async (request) => {
  try {
    log('Network first attempt:', request.url);
    const response = await fetch(request);
    if (response.ok) {
      return response;
    }
    throw new Error('Network response was not ok');
  } catch (error) {
    log('Network first failed, trying cache:', request.url);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response('', {
      status: 404,
      statusText: 'Not Found',
    });
  }
};

// Fetch event - handle requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  log('Fetching:', url.href);

  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Never cache HTML, JS, API requests, or external resources
  if (shouldNeverCache(url)) {
    log('Skipping cache for:', url.href);
    event.respondWith(
      fetch(event.request)
        .catch(() => new Response('', {
          status: 503,
          statusText: 'Service Unavailable',
        }))
    );
    return;
  }

  // Use network first for dynamic routes
  if (isDynamicRoute(url)) {
    log('Using network first for dynamic route:', url.href);
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Use cache first for static assets
  if (isStaticAsset(url)) {
    log('Using cache first for static asset:', url.href);
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Use network first for everything else
  log('Using network first for:', url.href);
  event.respondWith(networkFirst(event.request));
});

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    log('Received skip waiting message');
    self.skipWaiting();
  }
}); 