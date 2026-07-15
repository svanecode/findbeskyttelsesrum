import assert from "node:assert/strict";
import test from "node:test";

import { adaptAppV2Grouped } from "../src/lib/nearby/app-v2-adapter";
import {
  getAppV2NearbyAddressKey,
  getLegacyNearbyAddressKey,
  normalizeNearbyAddressText,
} from "../src/lib/nearby/address-normalization";
import { parseNearbySearchParams } from "../src/lib/nearby/parse-nearby-search-params";

test("nearby coordinates reject missing, non-finite and out-of-range input", () => {
  assert.deepEqual(parseNearbySearchParams({}), { kind: "missing" });
  assert.deepEqual(parseNearbySearchParams({ lat: "NaN", lng: "12" }), { kind: "invalid" });
  assert.deepEqual(parseNearbySearchParams({ lat: "91", lng: "12" }), { kind: "invalid" });
  assert.deepEqual(parseNearbySearchParams({ lat: "55.67", lng: "12.56" }), {
    kind: "ok",
    lat: "55.67",
    lng: "12.56",
  });
});

test("legacy and app_v2 addresses normalize to the same deterministic key", () => {
  const legacy = getLegacyNearbyAddressKey({
    vejnavn: "Rådhuspladsen",
    husnummer: "1",
    postnummer: "1550",
  });
  const appV2 = getAppV2NearbyAddressKey({ addressLine1: " Rådhuspladsen  1, ", postalCode: "1550" });

  assert.equal(legacy, appV2);
  assert.equal(normalizeNearbyAddressText("  A,  B "), "a b");
});

test("grouped API rows preserve aggregate capacity and every detail link without exposing review status", () => {
  const [result] = adaptAppV2Grouped([
    {
      groupKey: "test-1",
      address: { line1: "Testvej 4", postalCode: "1000", city: "København K" },
      coordinates: { latitude: 55.67, longitude: 12.56 },
      distanceMeters: 1250,
      shelterCount: 2,
      totalCapacity: 80,
      applicationCodeLabel: "Sikringsrum",
      municipality: { id: "m1", code: "0101", name: "København", slug: "koebenhavn" },
      representativeShelter: { slug: "testvej-4", capacity: 30 },
      shelters: [
        { id: "s1", slug: "testvej-4", name: "Testvej 4, rum 1", capacity: 30 },
        { id: "s2", slug: "testvej-4-b", name: "Testvej 4, rum 2", capacity: 50 },
      ],
    },
  ]);

  assert.equal(result?.distance, 1.25);
  assert.equal(result?.total_capacity, 80);
  assert.equal(result?.representativeSlug, "testvej-4");
  assert.deepEqual(result?.registrations?.map(({ slug, capacity }) => ({ slug, capacity })), [
    { slug: "testvej-4", capacity: 30 },
    { slug: "testvej-4-b", capacity: 50 },
  ]);
  assert.equal("statuses" in (result ?? {}), false);
});
