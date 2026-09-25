import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

type FetchHandler = (event: { request: Request; respondWith: (value: Promise<Response>) => void }) => void;

/** Runs public/offline-sw.js with in-memory caches and a controllable network. */
async function loadWorker(network: (request: Request) => Promise<Response>, options: { instantTimeout?: boolean } = {}) {
  const source = await readFile(new URL("../public/offline-sw.js", import.meta.url), "utf8");
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (input: Request | string) => (typeof input === "string" ? new URL(input, "https://findbeskyttelsesrum.dk").pathname : new URL(input.url).pathname);
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        async match(input: Request | string) {
          return store.get(keyOf(input))?.clone();
        },
        async put(input: Request | string, response: Response) {
          store.set(keyOf(input), response);
        },
        async keys() {
          return Array.from(store.keys());
        },
        async delete(key: string) {
          return store.delete(key);
        },
      };
    },
    async keys() {
      return Array.from(stores.keys());
    },
    async delete(name: string) {
      return stores.delete(name);
    },
  };
  const handlers: Record<string, FetchHandler> = {};
  const self = {
    location: new URL("https://findbeskyttelsesrum.dk/offline-sw.js"),
    addEventListener: (type: string, handler: FetchHandler) => {
      handlers[type] = handler;
    },
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };
  vm.runInNewContext(source, {
    self,
    caches,
    fetch: (input: Request | string) => network(typeof input === "string" ? new Request(new URL(input, self.location)) : input),
    URL,
    Headers,
    Response,
    Promise,
    Date,
    setTimeout: options.instantTimeout ? (callback: () => void) => setTimeout(callback, 0) : setTimeout,
  });

  async function dispatch(url: string, init: RequestInit & { mode?: RequestMode } = {}) {
    const { mode, ...requestInit } = init;
    const request = new Request(url, requestInit);
    if (mode === "navigate") Object.defineProperty(request, "mode", { value: "navigate" });
    let responded: Promise<Response> | null = null;
    handlers.fetch!({ request, respondWith: (value) => { responded = value; } });
    return responded ? await (responded as Promise<Response>) : null;
  }

  return { dispatch, stores };
}

const page = (body: string) => new Response(body, { status: 200, headers: { "Content-Type": "text/html" } });

test("online navigations come from the network and are saved with a timestamp", async () => {
  const worker = await loadWorker(async () => page("fresh"));
  const response = await worker.dispatch("https://findbeskyttelsesrum.dk/shelters/nearby?x=1", { mode: "navigate" });
  assert.equal(await response?.text(), "fresh");
  assert.equal(response?.headers.get("X-Offline-Cached-At"), null, "live responses are not marked as saved");
  const saved = worker.stores.get("offline-v1-pages")?.get("/shelters/nearby");
  assert.ok(saved?.headers.get("X-Offline-Cached-At"));
});

test("offline navigations and tiles fall back to the saved copy", async () => {
  let online = true;
  const worker = await loadWorker(async (request) => {
    if (!online) throw new TypeError("Failed to fetch");
    return request.url.includes("/tiles/") ? Response.json({ contract: "nearby-tile-v1" }) : page("saved page");
  });
  await worker.dispatch("https://findbeskyttelsesrum.dk/", { mode: "navigate" });
  await worker.dispatch("https://findbeskyttelsesrum.dk/api/app-v2/nearby/tiles/222_31");

  online = false;
  const pageResponse = await worker.dispatch("https://findbeskyttelsesrum.dk/", { mode: "navigate" });
  assert.equal(await pageResponse?.text(), "saved page");
  const tile = await worker.dispatch("https://findbeskyttelsesrum.dk/api/app-v2/nearby/tiles/222_31");
  assert.ok(tile?.headers.get("X-Offline-Cached-At"), "the page can tell the tile is saved data");
});

test("a slow network is abandoned for the saved copy", async () => {
  let slow = false;
  const worker = await loadWorker(
    async () => (slow ? new Promise<Response>(() => undefined) : page("saved")),
    { instantTimeout: true },
  );
  await worker.dispatch("https://findbeskyttelsesrum.dk/om-data", { mode: "navigate" });
  slow = true;
  const response = await worker.dispatch("https://findbeskyttelsesrum.dk/om-data", { mode: "navigate" });
  assert.equal(await response?.text(), "saved");
});

test("offline without a saved copy fails like the plain network", async () => {
  const worker = await loadWorker(async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(worker.dispatch("https://findbeskyttelsesrum.dk/kort", { mode: "navigate" }));
});

test("private, dynamic and third-party requests are never touched", async () => {
  const worker = await loadWorker(async () => page("network"));
  for (const [url, init] of [
    ["https://findbeskyttelsesrum.dk/admin", { mode: "navigate" as RequestMode }],
    ["https://findbeskyttelsesrum.dk/auth/callback?code=x", { mode: "navigate" as RequestMode }],
    ["https://findbeskyttelsesrum.dk/api/app-v2/nearby/grouped", { method: "POST", body: "{}" }],
    ["https://findbeskyttelsesrum.dk/api/health", {}],
    ["https://findbeskyttelsesrum.dk/api/app-v2/nearby/tiles/222_31?nonce=1", {}],
    ["https://adressevaelger.dk/husnumre/soeg?tekst=a", {}],
    ["https://tile.openstreetmap.org/1/1/1.png", {}],
  ] as const) {
    assert.equal(await worker.dispatch(url, init), null, url);
  }
});

test("hashed static assets are served from the cache once saved", async () => {
  let calls = 0;
  const worker = await loadWorker(async () => {
    calls += 1;
    return new Response("js", { status: 200 });
  });
  await worker.dispatch("https://findbeskyttelsesrum.dk/_next/static/chunks/app.js");
  await worker.dispatch("https://findbeskyttelsesrum.dk/_next/static/chunks/app.js");
  assert.equal(calls, 1);
});
