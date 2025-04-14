const CACHE_NAME = 'beskyttelsesrum-v1';
const urlsToCache = [
  '/',
  '/site.webmanifest',
  '/favicons/favicon.ico',
  '/favicons/favicon-16x16.png',
  '/favicons/favicon-32x32.png',
  '/favicons/apple-touch-icon.png',
  '/favicons/android-chrome-192x192.png',
  '/favicons/android-chrome-512x512.png',
  '/favicons/maskable-icon.png',
  '/favicons/safari-pinned-tab.svg'
];

// Domains to skip caching
const SKIP_CACHE_DOMAINS = [
  'cookiebot.com',
  'consent.cookiebot.com',
  'consentcdn.cookiebot.com',
  'googleapis.com',
  'gstatic.com',
  'maps.googleapis.com',
  'google.com',
  'tile.openstreetmap.org',
  'openstreetmap.org',
  'basemaps.cartocdn.com',
  'leafletjs.com',
  'unpkg.com',
  'a.tile.openstreetmap.org',
  'b.tile.openstreetmap.org',
  'c.tile.openstreetmap.org',
  'maps.gstatic.com',
  'vercel-scripts.com',
  'vercel-insights.com',
  'vercel.com',
  'supabase.co'
];

// Domains that need no-cors mode
const NO_CORS_DOMAINS = [
  'cookiebot.com',
  'consent.cookiebot.com',
  'consentcdn.cookiebot.com'
];

// Domains that need special handling
const SPECIAL_HANDLING_DOMAINS = {
  'maps.googleapis.com': {
    mode: 'cors',
    credentials: 'omit',
    headers: {
      'Accept': '*/*'
    }
  }
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Bypass Service Worker for all external resources
  if (SKIP_CACHE_DOMAINS.some(domain => url.hostname.includes(domain))) {
    // For Cookiebot domains, ensure no-cors mode
    if (NO_CORS_DOMAINS.some(domain => url.hostname.includes(domain))) {
      return fetch(event.request, {
        mode: 'no-cors',
        credentials: 'include'
      });
    }
    return fetch(event.request);
  }

  // Bypass Service Worker for Next.js static files and API routes
  if (url.pathname.startsWith('/_next/') || url.pathname.startsWith('/api/')) {
    return fetch(event.request);
  }

  // For local requests, try cache first
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
}); 