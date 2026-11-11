import assert from "node:assert/strict";
import test from "node:test";

import { offlineCopyStorageKey, saveOfflineCopy } from "../src/lib/offline-copy";
import { nearbyTileUrls } from "../src/lib/nearby/tiles";

/** Runs saveOfflineCopy against a fake browser and returns the URLs it asked the worker to save. */
async function savedUrls(stored: unknown, options: Parameters<typeof saveOfflineCopy>[0]) {
  const storage = new Map<string, string>();
  if (stored) storage.set(offlineCopyStorageKey, JSON.stringify(stored));
  let urls: string[] = [];
  const worker = {
    postMessage(message: { urls: string[] }, ports: Array<{ postMessage?: unknown }>) {
      urls = message.urls;
      // The page listens on port1; the fake answers through the channel below.
      (globalThis as { __lastReply?: () => void }).__lastReply?.();
      void ports;
    },
  };
  class FakeChannel {
    port1: { onmessage: ((event: { data: unknown }) => void) | null } = { onmessage: null };
    port2 = {};
    constructor() {
      (globalThis as { __lastReply?: () => void }).__lastReply = () => this.port1.onmessage?.({ data: { saved: 5, failed: 0 } });
    }
  }
  const fakeWindow = {
    location: { pathname: "/", href: "https://findbeskyttelsesrum.dk/" },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    },
    caches: {},
    dispatchEvent: () => true,
    setTimeout,
    clearTimeout,
  };
  const globals = globalThis as Record<string, unknown>;
  const original = { window: globals.window, navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"), MessageChannel: globals.MessageChannel, Event: globals.Event };
  Object.assign(fakeWindow, { caches: {}, performance: { getEntriesByType: () => [] } });
  globals.window = { ...fakeWindow, caches: {} };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      serviceWorker: {
        register: async () => undefined,
        ready: Promise.resolve({ active: worker }),
      },
    },
  });
  globals.MessageChannel = FakeChannel;
  globals.performance = { getEntriesByType: () => [] };
  try {
    await saveOfflineCopy(options);
  } finally {
    globals.window = original.window;
    globals.MessageChannel = original.MessageChannel;
    if (original.navigator) Object.defineProperty(globalThis, "navigator", original.navigator);
    else delete globals.navigator;
  }
  return urls;
}

const previous = {
  version: 1,
  savedAt: "2026-11-01T10:00:00.000Z",
  search: { label: "Rådhuspladsen 1", latitude: 55.6761, longitude: 12.5683 },
};

test("updating from the front page keeps the tiles of the previously saved search", async () => {
  const urls = await savedUrls(previous, {});
  for (const url of nearbyTileUrls(previous.search.latitude, previous.search.longitude)) {
    assert.ok(urls.includes(url), `${url} must be saved again`);
  }
});

test("a save with its own tiles does not add the previous search's tiles", async () => {
  const own = nearbyTileUrls(57.0, 10.0);
  const urls = await savedUrls(previous, { extraUrls: own, search: { label: "Aalborg", latitude: 57.0, longitude: 10.0 } });
  for (const url of nearbyTileUrls(previous.search.latitude, previous.search.longitude)) {
    if (!own.includes(url)) assert.ok(!urls.includes(url), `${url} belongs to the old search`);
  }
});
