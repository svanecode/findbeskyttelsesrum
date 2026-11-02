import assert from "node:assert/strict";
import test from "node:test";

import { fetchNearbyFromTiles } from "../src/lib/nearby/fetch-nearby-from-tiles";
import {
  nearbyTileContract,
  rankNearbyGroupsFromTiles,
  surroundingTileKeys,
  type NearbyTilePayload,
  type NearbyTileRow,
} from "../src/lib/nearby/tiles";

const origin = { latitude: 55.6761, longitude: 12.5683 };
const keys = surroundingTileKeys(origin.latitude, origin.longitude);
const options = { limit: 10, radiusMeters: 5_000 };

function row(slug: string, address: string, latitude: number, longitude: number): NearbyTileRow {
  return [slug, address, "1550", "København V", latitude, longitude, 100, "320"];
}

// Saved before and after a publication: the centre tile is newer than the rest.
function savedTiles(): NearbyTilePayload[] {
  return keys.map((key, index) => ({
    contract: nearbyTileContract,
    tile: key,
    revision: index === 4 ? "p:8" : "p:7",
    labels: { "320": "Bolig" },
    rows: index === 4
      ? [row("a", "Rådhuspladsen 1", 55.6762, 12.5684), row("b", "Vesterbrogade 2", 55.6745, 12.5640), row("c", "Rådhuspladsen 1", 55.6763, 12.5685)]
      : index === 1
        ? [row("d", "Nørre Voldgade 3", 55.6800, 12.5700)]
        : [],
  }));
}

function offlineFetch(tiles: NearbyTilePayload[], cachedAt: (key: string) => string | null) {
  const requested: string[] = [];
  const fetchImpl = async (input: string) => {
    requested.push(input);
    const match = /\/tiles\/([^/]+)$/.exec(input);
    if (!match) throw new TypeError("Failed to fetch");
    const tile = tiles.find((candidate) => candidate.tile === match[1])!;
    const headers = new Headers({ "Content-Type": "application/json" });
    const stamp = cachedAt(tile.tile);
    if (stamp) headers.set("X-Offline-Cached-At", stamp);
    return new Response(JSON.stringify(tile), { status: 200, headers });
  };
  return { fetchImpl, requested };
}

test("saved tiles from two revisions still give a result when the newer revision cannot be fetched", async () => {
  const tiles = savedTiles();
  const { fetchImpl, requested } = offlineFetch(tiles, (key) => (key === keys[0] ? "2026-10-01T08:00:00.000Z" : "2026-10-02T08:00:00.000Z"));

  const result = await fetchNearbyFromTiles(origin.latitude, origin.longitude, { ...options, fetch: fetchImpl });

  assert.ok(requested.some((url) => url.endsWith("/8")), "the newer revision is tried first");
  assert.notEqual(result, null);
  assert.equal(result!.savedAt, "2026-10-01T08:00:00.000Z", "the oldest saved time is shown");
  assert.deepEqual(result!.groups, rankNearbyGroupsFromTiles(tiles, origin, options));
  assert.deepEqual(result!.groups.map((group) => group.representativeShelter.slug), ["a", "b", "d"]);
});

test("live tiles that stay mixed after a failed refresh still fall back to the server", async () => {
  const { fetchImpl } = offlineFetch(savedTiles(), () => null);
  // The page treats a rejection like null and asks the server instead.
  await assert.rejects(fetchNearbyFromTiles(origin.latitude, origin.longitude, { ...options, fetch: fetchImpl }));
});

test("matching revisions are ranked without a refresh", async () => {
  const tiles = savedTiles().map((tile) => ({ ...tile, revision: "p:8" }));
  const { fetchImpl, requested } = offlineFetch(tiles, () => null);
  const result = await fetchNearbyFromTiles(origin.latitude, origin.longitude, { ...options, fetch: fetchImpl });
  assert.equal(requested.length, 9);
  assert.equal(result?.savedAt, null);
  assert.deepEqual(result?.groups, rankNearbyGroupsFromTiles(tiles, origin, options));
});
