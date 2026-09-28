import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { loadServerModule } from "./support/load-server-module";

const require = createRequire(import.meta.url);
const nextServer = require("next/server") as typeof import("next/server");

type TileRoute = {
  GET: (request: unknown, context: { params: Promise<{ tile: string; revision?: string[] }> }) => Promise<Response>;
};

async function loadRoute(revisions: string[], counters = { tileReads: 0 }) {
  let revisionReads = 0;
  return loadServerModule<TileRoute>(new URL("../src/app/api/app-v2/nearby/tiles/[tile]/[[...revision]]/route.ts", import.meta.url), {
    "next/server": nextServer,
    "@/lib/rate-limit": { rateLimit: () => true },
    "@/lib/nearby/tiles": await import("../src/lib/nearby/tiles"),
    "@/lib/supabase/app-v2-queries": {
      getAppV2PublicDataRevision: async () => ({ cacheKey: revisions[Math.min(revisionReads++, revisions.length - 1)] }),
      getAppV2PublicNearbyTile: async () => {
        counters.tileReads += 1;
        return {
          markers: [{ slug: "registrering-a", addressLine1: "Testvej 1", postalCode: "1550", city: "København V", latitude: 55.6, longitude: 12.5, capacity: 100, sourceApplicationCode: "320" }],
          labels: { "320": "Kontor" },
        };
      },
    },
  });
}

function get(route: TileRoute, url: string, tile: string, revision?: string[]) {
  return route.GET(new nextServer.NextRequest(url), { params: Promise.resolve({ tile, revision }) });
}

test("a stable tile is CDN-cacheable and carries the revision", async () => {
  const route = await loadRoute(["publication-a:1", "publication-a:1"]);
  const response = await get(route, "https://findbeskyttelsesrum.dk/api/app-v2/nearby/tiles/222_31", "222_31");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Cache-Control") ?? "", /s-maxage=300/);
  const body = await response.json();
  assert.equal(body.revision, "publication-a:1");
  assert.deepEqual(body.rows[0], ["registrering-a", "Testvej 1", "1550", "København V", 55.6, 12.5, 100, "320"]);
});

test("query strings are rejected before any database read, so the cache cannot be busted", async () => {
  const counters = { tileReads: 0 };
  const route = await loadRoute(["publication-a:1"], counters);
  const response = await get(route, "https://findbeskyttelsesrum.dk/api/app-v2/nearby/tiles/222_31?nonce=1", "222_31");
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(counters.tileReads, 0);
});

test("a revision change while the tile is built is never cached", async () => {
  const route = await loadRoute(["publication-a:1", "publication-b:2"]);
  const response = await get(route, "https://findbeskyttelsesrum.dk/api/app-v2/nearby/tiles/222_31", "222_31");
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});

test("tile keys outside the grid are rejected", async () => {
  const route = await loadRoute(["publication-a:1"]);
  const response = await get(route, "https://findbeskyttelsesrum.dk/api/app-v2/nearby/tiles/0_0", "0_0");
  assert.equal(response.status, 400);
});

test("a tile pinned to the current revision is served with a long CDN lifetime", async () => {
  const route = await loadRoute(["publication-b:2", "publication-b:2"]);
  const response = await get(route, "https://findbeskyttelsesrum.dk/api/app-v2/nearby/tiles/222_31/2", "222_31", ["2"]);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Cache-Control") ?? "", /s-maxage=86400/);
  assert.equal((await response.json()).revision, "publication-b:2");
});

test("a tile pinned to another revision is refused before the tile is read", async () => {
  const counters = { tileReads: 0 };
  const route = await loadRoute(["publication-b:2"], counters);
  const response = await get(route, "https://findbeskyttelsesrum.dk/api/app-v2/nearby/tiles/222_31/1", "222_31", ["1"]);
  assert.equal(response.status, 409);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal((await response.json()).currentRevision, 2);
  assert.equal(counters.tileReads, 0);
});

test("malformed revision segments are rejected", async () => {
  const route = await loadRoute(["publication-b:2"]);
  for (const revision of [["0"], ["abc"], ["2", "3"], ["publication-b:2"], ["01"]]) {
    const response = await get(route, "https://findbeskyttelsesrum.dk/api/app-v2/nearby/tiles/222_31/x", "222_31", revision);
    assert.equal(response.status, 400, revision.join("/"));
  }
});
