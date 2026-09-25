import assert from "node:assert/strict";
import test from "node:test";

import {
  guaranteedCoverageMeters,
  haversineMeters,
  isNearbyTilePayload,
  nearbyTileContract,
  parseTileKey,
  rankNearbyGroupsFromTiles,
  surroundingTileKeys,
  tileKeyFor,
  type NearbyTilePayload,
  type NearbyTileRow,
} from "../src/lib/nearby/tiles";

const origin = { latitude: 55.6761, longitude: 12.5683 };

function tile(rows: NearbyTileRow[], labels: Record<string, string> = {}, revision = "rev:1"): NearbyTilePayload {
  return { contract: nearbyTileContract, tile: tileKeyFor(origin.latitude, origin.longitude), revision, labels, rows };
}

function row(slug: string, address: string, latitude: number, longitude: number, capacity = 100, code: string | null = "320"): NearbyTileRow {
  return [slug, address, "1550", "København V", latitude, longitude, capacity, code];
}

test("tile keys, bounds and the surrounding 3x3 block line up", () => {
  const key = tileKeyFor(origin.latitude, origin.longitude);
  assert.equal(key, "222_31");
  const parsed = parseTileKey(key);
  assert.deepEqual(parsed?.bounds, { south: 55.5, north: 55.75, west: 12.4, east: 12.8 });
  const keys = surroundingTileKeys(origin.latitude, origin.longitude);
  assert.equal(keys.length, 9);
  assert.ok(keys.includes("221_30") && keys.includes("223_32") && keys.includes(key));
});

test("tile keys outside the Denmark box or malformed are rejected", () => {
  for (const key of ["", "1_2_3", "abc", "222_31;drop", "0_0", "400_31", "222_-5", "99999_1"]) {
    assert.equal(parseTileKey(key), null, key);
  }
});

test("coverage is the distance to the nearest edge of the 3x3 block", () => {
  const coverage = guaranteedCoverageMeters(origin.latitude, origin.longitude);
  // The block spans 55.25-56.0 N, 12.0-13.2 E; the nearest edge is north (0.3239 deg).
  assert.ok(coverage > 20_000 && coverage < 37_000, String(coverage));
  const edgeDistance = haversineMeters(origin.latitude, origin.longitude, 56.0, origin.longitude);
  assert.ok(coverage <= edgeDistance + 1);
});

test("haversine matches a known distance", () => {
  // Rådhuspladsen to a point about 0.87 km north.
  const meters = haversineMeters(55.6756, 12.5696, 55.6833, 12.5717);
  assert.ok(Math.abs(meters - 866) < 30, String(meters));
});

test("ranking groups by address, orders by distance and sums capacity", () => {
  const rows: NearbyTileRow[] = [
    row("b", "Rådhuspladsen 1", 55.6762, 12.5684, 120, "320"),
    row("a", "Rådhuspladsen 1", 55.6762, 12.5684, 30, "510"),
    ...Array.from({ length: 12 }, (_, index) => row(`z${index}`, `Testvej ${index + 2}`, 55.677 + index * 0.001, 12.5683)),
  ];
  const groups = rankNearbyGroupsFromTiles([tile(rows, { "320": "Kontor", "510": "Bolig" })], origin, {
    limit: 10,
    radiusMeters: 50_000,
  });

  assert.ok(groups);
  assert.equal(groups.length, 10);
  assert.equal(groups[0]!.address.line1, "Rådhuspladsen 1");
  assert.equal(groups[0]!.shelterCount, 2);
  assert.equal(groups[0]!.totalCapacity, 150);
  assert.equal(groups[0]!.representativeShelter.slug, "a", "equal distance ties break on slug");
  assert.deepEqual(groups[0]!.applicationCodeLabels, ["Bolig", "Kontor"]);
  assert.equal(groups[0]!.applicationCodeLabel, "Flere registrerede bygningsanvendelser");
  for (let index = 1; index < groups.length; index += 1) {
    assert.ok(groups[index - 1]!.distanceMeters <= groups[index]!.distanceMeters);
  }
});

test("duplicate rows from overlapping tile edges are counted once", () => {
  const shared = row("dup", "Kantvej 1", 55.677, 12.569);
  const many = Array.from({ length: 10 }, (_, index) => row(`n${index}`, `Nærvej ${index}`, 55.6765 + index * 0.0005, 12.5683));
  const groups = rankNearbyGroupsFromTiles([tile([shared, ...many]), tile([shared])], origin, { limit: 11, radiusMeters: 50_000 });
  assert.ok(groups);
  assert.equal(groups.filter((group) => group.address.line1 === "Kantvej 1")[0]?.shelterCount, 1);
});

test("too few results inside the loaded block fall back to the server", () => {
  const groups = rankNearbyGroupsFromTiles([tile([row("only", "Ensomvej 1", 55.68, 12.57)])], origin, {
    limit: 10,
    radiusMeters: 50_000,
  });
  assert.equal(groups, null);
});

test("a small search radius fully inside the block is exact even with few results", () => {
  const groups = rankNearbyGroupsFromTiles([tile([row("only", "Ensomvej 1", 55.68, 12.57)])], origin, {
    limit: 10,
    radiusMeters: 5_000,
  });
  assert.equal(groups?.length, 1);
});

test("tile payload validation rejects malformed data", () => {
  const key = tileKeyFor(origin.latitude, origin.longitude);
  assert.equal(isNearbyTilePayload(tile([row("a", "A 1", 55.6, 12.5)]), key), true);
  assert.equal(isNearbyTilePayload({ ...tile([]), tile: "1_1" }, key), false);
  assert.equal(isNearbyTilePayload({ ...tile([]), contract: "other" }, key), false);
  assert.equal(isNearbyTilePayload({ ...tile([]), rows: [["a", "A", "1", "B", "x", 1, 1, null]] }, key), false);
  assert.equal(isNearbyTilePayload(null, key), false);
});
