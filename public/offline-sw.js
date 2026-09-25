/*
 * Offline fallback for Find Beskyttelsesrum (OFFLINE-01).
 *
 * Purpose: a returning visitor on a congested or dead network still sees the
 * site and, via "Brug min placering", results computed from public tiles
 * they loaded earlier. Rules, in order of importance:
 *
 * 1. Never make the online site worse. Pages and tiles are network-first; the
 *    cache is only used when the network fails or is too slow.
 * 2. Only three kinds of same-origin GET are touched: page navigations,
 *    hashed /_next/static assets and /api/app-v2/nearby/tiles/*. Everything
 *    else (other APIs, admin, auth, third parties) is left to the browser.
 * 3. Nothing personal is stored: pages are public HTML, tiles are public
 *    registration data for a ~28 km area. The search position stays in the
 *    tab's sessionStorage as before.
 *
 * Recovery: to remove this worker from all browsers, replace this file with
 * a version whose activate handler deletes the caches and calls
 * self.registration.unregister() (see git history of public/sw.js).
 */

const version = "offline-v1";
const pageCache = `${version}-pages`;
const staticCache = `${version}-static`;
const tileCache = `${version}-tiles`;
const cachedAtHeader = "X-Offline-Cached-At";

const precachedPages = ["/", "/shelters/nearby", "/om-data", "/privatliv"];
const networkTimeoutMs = 6000;
const maximumEntries = { [pageCache]: 20, [staticCache]: 200, [tileCache]: 45 };

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(pageCache);
      // Best effort: a failed page must not block installation.
      await Promise.all(precachedPages.map(async (path) => {
        try {
          const response = await fetch(path, { cache: "no-store" });
          if (response.ok) await cache.put(path, stamp(response));
        } catch {
          // Offline during install; the page is cached on the next visit.
        }
      }));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const current = new Set([pageCache, staticCache, tileCache]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !current.has(key)).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/auth")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, pageCache, pageKey(url)));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, staticCache));
    return;
  }
  if (url.pathname.startsWith("/api/app-v2/nearby/tiles/") && !url.search) {
    event.respondWith(networkFirst(request, tileCache, url.pathname));
  }
});

/** Navigations are cached per path without query or hash. */
function pageKey(url) {
  return url.pathname;
}

/** Copies the response and records when it was cached. */
function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set(cachedAtHeader, new Date().toISOString());
  return new Response(response.clone().body, { status: response.status, statusText: response.statusText, headers });
}

async function trim(cacheName) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const excess = keys.length - maximumEntries[cacheName];
  // Cache keys come back in insertion order; drop the oldest.
  for (let index = 0; index < excess; index += 1) await cache.delete(keys[index]);
}

async function networkFirst(request, cacheName, key) {
  const cache = await caches.open(cacheName);
  const network = fetch(request).then(async (response) => {
    if (response.ok) {
      await cache.put(key, stamp(response));
      await trim(cacheName);
    }
    return response;
  });

  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), networkTimeoutMs));
  try {
    const winner = await Promise.race([network, timeout]);
    if (winner) return winner;
  } catch {
    // Network failed; fall through to the cache.
  }

  const cached = await cache.match(key);
  if (cached) {
    // Keep the slow network request running so the cache refreshes.
    network.catch(() => undefined);
    return cached;
  }
  // Nothing cached: wait for the network after all, and let it fail visibly.
  return network;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await trim(cacheName);
  }
  return response;
}
