import assert from "node:assert/strict";
import test from "node:test";

import { rankRelatedFromTileMarkers, relatedTilesAround, type RelatedTileMarker } from "../src/lib/nearby/related";
import { guaranteedCoverageMeters, haversineMeters, parseTileKey, tileKeyFor } from "../src/lib/nearby/tiles";
import { loadServerModule } from "./support/load-server-module";

const origin = { latitude: 55.6761, longitude: 12.5683 };

function marker(slug: string, latitudeOffset: number, longitudeOffset = 0, overrides: Partial<RelatedTileMarker> = {}): RelatedTileMarker {
  return {
    slug,
    addressLine1: `${slug} vej 1`,
    postalCode: "1550",
    city: "København V",
    capacity: 100,
    latitude: origin.latitude + latitudeOffset,
    longitude: origin.longitude + longitudeOffset,
    ...overrides,
  };
}

test("the nearest registrations come first and the registration itself is left out", () => {
  const markers = [
    marker("far", 0.1),
    marker("self", 0),
    marker("near", 0.001),
    marker("middle", 0.01),
  ];
  const ranked = rankRelatedFromTileMarkers(markers, origin, "self", 3, 20_000);
  assert.deepEqual(ranked.map((row) => row.slug), ["near", "middle", "far"]);
  assert.deepEqual(ranked[0], {
    id: "near",
    slug: "near",
    address_line1: "near vej 1",
    postal_code: "1550",
    city: "København V",
    capacity: 100,
  });
});

test("equal distances are ordered by slug, as in the database ranking", () => {
  const markers = [marker("b", 0.01), marker("a", 0.01), marker("c", 0.01)];
  assert.deepEqual(rankRelatedFromTileMarkers(markers, origin, "self", 3, 20_000).map((row) => row.slug), ["a", "b", "c"]);
});

test("a registration on a tile edge, read from two tiles, counts once", () => {
  const edge = marker("edge", 0.002);
  const ranked = rankRelatedFromTileMarkers([edge, edge, marker("other", 0.02)], origin, "self", 3, 20_000);
  assert.deepEqual(ranked.map((row) => row.slug), ["edge", "other"]);
});

test("registrations beyond the radius are not related", () => {
  // 0.25 degrees of latitude is about 27.8 km.
  const ranked = rankRelatedFromTileMarkers([marker("near", 0.05), marker("outside", 0.25)], origin, "self", 3, 20_000);
  assert.deepEqual(ranked.map((row) => row.slug), ["near"]);
  assert.deepEqual(rankRelatedFromTileMarkers([marker("outside", 0.25)], origin, "self", 3, 20_000), []);
});

test("the search never reaches past what the loaded tiles are guaranteed to cover", () => {
  const coverage = guaranteedCoverageMeters(origin.latitude, origin.longitude);
  assert.ok(coverage > 20_000, "a 3x3 block always covers the 20 km related radius");
  const inside = marker("inside", (coverage - 500) / 111_195);
  const beyond = marker("beyond", (coverage + 500) / 111_195);
  const ranked = rankRelatedFromTileMarkers([inside, beyond], origin, "self", 3, 1_000_000);
  assert.deepEqual(ranked.map((row) => row.slug), ["inside"]);
});

test("the limit is applied after ranking and an empty tile gives an empty list", () => {
  const markers = Array.from({ length: 10 }, (_, index) => marker(`m${String(index).padStart(2, "0")}`, 0.001 * (10 - index)));
  assert.deepEqual(rankRelatedFromTileMarkers(markers, origin, "self", 2, 20_000).map((row) => row.slug), ["m09", "m08"]);
  assert.deepEqual(rankRelatedFromTileMarkers([], origin, "self", 3, 20_000), []);
  assert.deepEqual(rankRelatedFromTileMarkers(markers, origin, "self", 0, 20_000), []);
});

test("the ranking equals sorting every registration by Haversine distance", () => {
  let seed = 7;
  const random = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648);
  const markers = Array.from({ length: 300 }, (_, index) => marker(`r${index}`, (random() - 0.5) * 0.4, (random() - 0.5) * 0.6));
  const expected = markers
    .map((item) => ({ slug: item.slug, distance: haversineMeters(origin.latitude, origin.longitude, item.latitude, item.longitude) }))
    .filter((item) => item.distance <= 20_000)
    .sort((a, b) => a.distance - b.distance || a.slug.localeCompare(b.slug, "da-DK"))
    .slice(0, 6)
    .map((item) => item.slug);
  assert.ok(expected.length > 0);
  assert.deepEqual(rankRelatedFromTileMarkers(markers, origin, "none", 6, 20_000).map((row) => row.slug), expected);
});

test("a registration is related to the tile it sits in and the eight around it", () => {
  const tiles = relatedTilesAround(origin.latitude, origin.longitude);
  assert.equal(tiles.length, 9);
  assert.ok(tiles.some((tile) => tile.key === tileKeyFor(origin.latitude, origin.longitude)));
  for (const tile of tiles) assert.deepEqual(parseTileKey(tile.key)?.bounds, tile.bounds);
  // Outside the served grid there is nothing to read.
  assert.deepEqual(relatedTilesAround(10, 0), []);
});

type SheltersModule = {
  getAppV2PublicRelatedShelters: (input: {
    shelterId: string;
    slug: string;
    municipalityId: string;
    postalCode: string;
    latitude?: number | null;
    longitude?: number | null;
    limit?: number;
  }) => Promise<Array<{ id: string; slug: string; addressLine1: string; postalCode: string; city: string; capacity: number }>>;
};

async function loadShelters(tileMarkers: RelatedTileMarker[], counters: { tileReads: string[]; clientUses: number }) {
  const unused = () => { throw new Error("unused in this test"); };
  const fallbackRow = { id: "fb-1", slug: "registrering-fb1", address_line1: "Fallbackvej 1", postal_code: "1550", city: "København V", capacity: 80 };
  const query = {
    select: () => query,
    eq: () => query,
    neq: () => query,
    order: () => query,
    limit: () => Promise.resolve({ data: [fallbackRow], error: null }),
  };
  return loadServerModule<SheltersModule>(new URL("../src/lib/supabase/queries/shelters.ts", import.meta.url), {
    "@/lib/app-v2-public": { createAppV2PublicClient: () => { counters.clientUses += 1; return { from: () => query }; } },
    "@/lib/supabase/app-v2": { createAppV2AdminClient: unused },
    "@/lib/supabase/env": { SupabaseConfigurationError: class extends Error {} },
    "@/lib/supabase/public-rpc-errors": { isMissingPublicRpcError: () => false },
    "@/lib/nearby/related": await import("../src/lib/nearby/related"),
    "@/lib/supabase/read-all-pages": { postgrestMaxRows: 1000, readAllPages: unused },
    react: { cache: <T>(fn: T) => fn },
    "@/lib/shelter-public-url": await import("../src/lib/shelter-public-url"),
    "./municipalities": { getAppV2MunicipalitySummaries: unused },
    "./nearby": {
      getCachedAppV2PublicNearbyTile: async (key: string) => {
        counters.tileReads.push(key);
        return { markers: tileMarkers, labels: {} };
      },
    },
    "./plain-path-owner-rows": { parsePlainPathOwnerRows: () => [] },
    "./public-data-cache": { cachedPerRevision: <T>(_name: string, read: T) => read },
    "./shared": { normalizeMunicipality: unused, normalizePublicShelter: unused, normalizeShelter: unused, sitemapShelterPageSize: 1000 },
  });
}

test("related registrations come from the cached tiles without any database call", async () => {
  const counters = { tileReads: [] as string[], clientUses: 0 };
  const shelters = await loadShelters(
    [marker("registrering-self", 0), marker("registrering-b", 0.02), marker("registrering-a", 0.01), marker("registrering-c", 0.03)],
    counters,
  );
  const related = await shelters.getAppV2PublicRelatedShelters({
    shelterId: "id-self",
    slug: "registrering-self",
    municipalityId: "m",
    postalCode: "1550",
    latitude: origin.latitude,
    longitude: origin.longitude,
    limit: 2,
  });
  assert.deepEqual(related.map((row) => row.slug), ["registrering-a", "registrering-b"]);
  assert.equal(related[0]?.addressLine1, "registrering-a vej 1");
  assert.equal(new Set(counters.tileReads).size, 9, "the tile and its eight neighbours are read");
  assert.equal(counters.clientUses, 0, "the database client is never created");
});

test("without coordinates or nearby registrations the postcode and municipality fallback is used", async () => {
  const withoutCoordinates = { tileReads: [] as string[], clientUses: 0 };
  const first = await (await loadShelters([marker("x", 0.01)], withoutCoordinates)).getAppV2PublicRelatedShelters({
    shelterId: "id-self", slug: "registrering-self", municipalityId: "m", postalCode: "1550", latitude: null, longitude: null,
  });
  assert.deepEqual(first.map((row) => row.slug), ["registrering-fb1"]);
  assert.equal(withoutCoordinates.tileReads.length, 0);

  const nothingNearby = { tileReads: [] as string[], clientUses: 0 };
  const second = await (await loadShelters([marker("registrering-self", 0)], nothingNearby)).getAppV2PublicRelatedShelters({
    shelterId: "id-self", slug: "registrering-self", municipalityId: "m", postalCode: "1550", latitude: origin.latitude, longitude: origin.longitude,
  });
  assert.deepEqual(second.map((row) => row.slug), ["registrering-fb1"]);
  assert.equal(nothingNearby.tileReads.length, 9);
});
