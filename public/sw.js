const CACHE_VERSION = 'v5';
const CACHE_NAME = `app-cache-${CACHE_VERSION}`;
const STATIC_CACHE_NAME = `static-cache-${CACHE_VERSION}`;
const IS_DEV = false; // Service workers run in production context

// Get deployment ID from environment or use timestamp
const DEPLOYMENT_ID = self.location.search.includes('dpl=') ? 
  self.location.search.match(/dpl=([^&]+)/)?.[1] || Date.now() : 
  Date.now();

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

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      // Add files one by one to handle failures gracefully
      const urlsToCache = [
        '/',
        '/index.html',
        '/manifest.json',
        '/favicon.ico',
      ];
      
      return Promise.allSettled(
        urlsToCache.map(url => 
          cache.add(url).catch(err => {
            log('Failed to cache:', url, err);
            return null; // Continue with other files
          })
        )
      );
    }).catch(err => {
      log('Cache installation failed:', err);
      // Don't fail the service worker installation
    })
  );
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== STATIC_CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
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

  // Handle static assets
  if (matchesPattern(url.pathname, STATIC_ASSETS)) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request).then((response) => {
          const responseToCache = response.clone();
          caches.open(STATIC_CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
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

  // Handle other requests with cache-first strategy
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((response) => {
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      });
    })
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