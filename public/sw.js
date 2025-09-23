const CACHE_VERSION = 'v8';
const CACHE_NAME = `app-cache-${CACHE_VERSION}`;
const STATIC_CACHE_NAME = CACHE_NAME; // unify naming (fix undefined reference)
const IS_DEV = false; // flip to true locally if debugging

// Simplified cache strategy - less aggressive

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
// We no longer try to manually cache Next hashed assets; the CDN + immutable headers handle them.
// Keep a minimal list for public runtime assets that may not be hashed.
const STATIC_ASSETS = [
  /\/images\//,
  /\/favicons\//,
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

// Helper to check if a URL matches any pattern
const matchesPattern = (url, patterns) => {
  return patterns.some(pattern => pattern.test(url));
};

// Helper to get cache key with version
const getCacheKey = (url) => {
  const urlObj = new URL(url);
  const version = urlObj.searchParams.get('v');
  return version ? `${urlObj.pathname}?v=${version}` : urlObj.pathname;
};

// Install event - minimal caching
self.addEventListener('install', (event) => {
  // Skip waiting to activate immediately
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Only cache essential offline assets
      const urlsToCache = [
        '/favicon.ico',
        '/site.webmanifest',
      ];

      return Promise.allSettled(
        urlsToCache.map(url =>
          cache.add(url).catch(err => {
            log('Failed to cache:', url, err);
            return null;
          })
        )
      );
    }).catch(err => {
      log('Cache installation failed:', err);
    })
  );
});

// Activate event
self.addEventListener('activate', (event) => {
  // Claim clients immediately
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      }),
      // Claim all clients
      self.clients.claim()
    ])
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip DAWA API requests entirely - let them go through normally
  if (url.hostname.includes('dawa.aws.dk') || 
      url.hostname.includes('api.dataforsyningen.dk') ||
      url.hostname.includes('aws.dk') ||
      url.pathname.includes('/autocomplete')) {
    return;
  }

  // Skip service worker registration requests
  if (url.pathname.includes('sw.js') || url.pathname.includes('service-worker')) {
    return;
  }

  // Skip all external API requests
  if (!url.origin.startsWith(self.location.origin)) {
    return;
  }

  // Handle static public assets (cache-first)
  if (matchesPattern(url.pathname, STATIC_ASSETS)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(STATIC_CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Handle dynamic routes with network-first strategy
  if (matchesPattern(url.pathname, DYNAMIC_ROUTES)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
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

  // For everything else rely on network (no opaque stale data) with fallback to cache if previously stored.
  event.respondWith(
    fetch(event.request)
      .then(res => {
        return res; // don't cache by default
      })
      .catch(() => caches.match(event.request))
  );
});

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    log('Received skip waiting message');
    self.skipWaiting();
  }
});

// Handle errors
self.addEventListener('error', (event) => {
  log('Service worker error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  log('Service worker unhandled rejection:', event.reason);
}); 