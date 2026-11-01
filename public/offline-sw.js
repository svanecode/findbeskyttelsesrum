/*
 * Offline fallback for Find Beskyttelsesrum (OFFLINE-01).
 *
 * Purpose: a visitor who chose "Gem til brug uden net" still sees the site
 * on a congested or dead network, with results computed from public tiles
 * saved earlier. The page registers this worker only after that choice
 * (src/lib/offline-copy.ts) and sends it the URLs to save. Rules, in order
 * of importance:
 *
 * 1. Never make the online site worse. Pages and tiles are network-first; the
 *    cache is only used when the network fails or is too slow.
 * 2. Only three kinds of same-origin GET are touched: page navigations,
 *    hashed /_next/static assets and /api/app-v2/nearby/tiles/*. Everything
 *    else (other APIs, admin, auth, third parties) is left to the browser.
 * 3. What the visitor saved stays saved. The URLs from "Gem til brug uden
 *    net" go in their own cache, which is never trimmed and only replaced by
 *    the next save; ordinary browsing fills the other, size-capped caches.
 * 4. Nothing personal is stored here: pages are public HTML, tiles are public
 *    registration data for a ~28 km area. A saved search lives in the page's
 *    localStorage, which the visitor can delete with the copy.
 *
 * Recovery: to remove this worker from all browsers, replace this file with
 * a version whose activate handler deletes the caches and calls
 * self.registration.unregister() (see git history of public/sw.js).
 */

const version = "offline-v1";
const pageCache = `${version}-pages`;
const staticCache = `${version}-static`;
const tileCache = `${version}-tiles`;
// Everything the last "save-offline-copy" message stored. Never trimmed.
const savedCache = `${version}-saved`;
const cachedAtHeader = "X-Offline-Cached-At";

const precachedPages = ["/", "/naer-dig", "/om-data", "/privatliv"];
const networkTimeoutMs = 6000;
// Server trouble the saved copy should cover; other statuses (e.g. 404) pass through.
const transientStatuses = new Set([429, 500, 502, 503, 504]);
const maximumEntries = { [pageCache]: 20, [staticCache]: 300, [tileCache]: 45 };

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
      const current = new Set([pageCache, staticCache, tileCache, savedCache]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !current.has(key)).map((key) => caches.delete(key)));
      // Workers before the saved cache kept a visitor's copy in the ordinary
      // caches, where browsing could trim it. Carry it over once.
      if (!keys.includes(savedCache)) await seedSavedCache().catch(() => undefined);
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

/*
 * "Gem til brug uden net": the page sends the URLs to save (pages, the
 * site's static files, nearby tiles) and gets back how many were saved.
 * Script and style files that a saved page references are saved too.
 */
self.addEventListener("message", (event) => {
  const data = event.data;
  const port = event.ports && event.ports[0];
  if (!data || data.type !== "save-offline-copy" || !Array.isArray(data.urls) || !port) return;
  event.waitUntil(
    saveUrls(data.urls).then(
      (result) => port.postMessage(result),
      () => port.postMessage({ saved: 0, failed: data.urls.length }),
    ),
  );
});

async function seedSavedCache() {
  const saved = await caches.open(savedCache);
  for (const name of [pageCache, staticCache, tileCache]) {
    const cache = await caches.open(name);
    for (const key of await cache.keys()) {
      const response = await cache.match(key);
      if (response) await saved.put(key, response);
    }
  }
}

/** Which cache, and under which key, a same-origin URL belongs in; null for anything else. */
function cacheTarget(url) {
  if (url.origin !== self.location.origin) return null;
  if (url.pathname.startsWith("/_next/static/")) return { cacheName: staticCache, key: url.pathname + url.search };
  if (url.pathname.startsWith("/api/app-v2/nearby/tiles/") && !url.search) return { cacheName: tileCache, key: url.pathname };
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin") || url.pathname.startsWith("/auth")) return null;
  return { cacheName: pageCache, key: pageKey(url), isPage: true };
}

const staticReferencePattern = /\/_next\/static\/[^"'\s)\\]+\.(?:js|css|woff2)/g;

async function saveUrls(urls) {
  let saved = 0;
  let failed = 0;
  const queue = urls.slice(0, 300);
  const seen = new Set();
  const savedKeys = new Set();
  while (queue.length > 0) {
    const raw = queue.shift();
    let url;
    try {
      url = new URL(raw, self.location.origin);
    } catch {
      failed += 1;
      continue;
    }
    const target = cacheTarget(url);
    if (!target || seen.has(target.key)) continue;
    seen.add(target.key);
    try {
      const response = await fetch(url.href, { cache: target.isPage ? "no-store" : "default", credentials: "same-origin" });
      if (!response.ok) {
        failed += 1;
        continue;
      }
      if (target.isPage) {
        const html = await response.clone().text();
        for (const match of html.match(staticReferencePattern) || []) {
          if (queue.length < 300) queue.push(match);
        }
      }
      const cache = await caches.open(savedCache);
      await cache.put(target.key, stamp(response));
      savedKeys.add(target.key);
      saved += 1;
    } catch {
      failed += 1;
    }
  }
  // The new copy replaces the previous one. A save where nothing could be
  // fetched (offline, say) keeps the previous copy rather than leave none.
  if (saved > 0) {
    const cache = await caches.open(savedCache);
    for (const key of await cache.keys()) {
      if (!savedKeys.has(keyId(key))) await cache.delete(key);
    }
  }
  return { saved, failed };
}

/** The path and query a cache key stands for, whether it is a Request or a string. */
function keyId(key) {
  const url = new URL(typeof key === "string" ? key : key.url, self.location.origin);
  return url.pathname + url.search;
}

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

/** Saving is best effort: a full or blocked cache must never cost the visitor the response. */
async function save(cache, cacheName, key, response) {
  try {
    await cache.put(key, response);
    await trim(cacheName);
  } catch {
    // Quota exceeded, private mode or an evicted cache; the network response still stands.
  }
}

/** The visitor's saved copy, consulted after the ordinary cache. */
async function matchSaved(key) {
  try {
    const cache = await caches.open(savedCache);
    return await cache.match(key);
  } catch {
    return undefined;
  }
}

async function networkFirst(request, cacheName, key) {
  const cache = await caches.open(cacheName);
  const network = fetch(request).then(async (response) => {
    if (response.ok) await save(cache, cacheName, key, stamp(response));
    return response;
  });

  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), networkTimeoutMs));
  let transientFailure = null;
  try {
    const winner = await Promise.race([network, timeout]);
    if (winner && !transientStatuses.has(winner.status)) return winner;
    transientFailure = winner;
  } catch {
    // Network failed; fall through to the cache.
  }

  const cached = (await cache.match(key)) ?? (await matchSaved(key));
  if (cached) {
    // Keep a slow network request running so the cache refreshes.
    network.catch(() => undefined);
    return cached;
  }
  // Nothing cached: return the server's error, or wait for the network after all.
  return transientFailure ?? network;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = (await cache.match(request)) ?? (await matchSaved(request));
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await save(cache, cacheName, request, response.clone());
  return response;
}
