import assert from "node:assert/strict";
import test from "node:test";

import { adaptAppV2Grouped } from "../src/lib/nearby/app-v2-adapter";
import { parseNearbySearchParams } from "../src/lib/nearby/parse-nearby-search-params";
import {
  createNearbySearchContext,
  parseNearbySearchContext,
} from "../src/lib/nearby/search-context";
import { stripLocationDataFromMetric } from "../src/lib/analytics/sanitize-url";
import { isShelterReportType, shelterReportTypes } from "../src/lib/reporting/shelter-report";

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

test("nearby search context validates coordinates and expires tab-local searches", () => {
  const now = Date.UTC(2026, 7, 16, 12);
  const context = createNearbySearchContext(
    { latitude: 55.67, longitude: 12.56, label: "  Testvej 1  " },
    now,
  );

  assert.deepEqual(context, {
    version: 1,
    latitude: 55.67,
    longitude: 12.56,
    label: "Testvej 1",
    createdAt: now,
  });
  assert.deepEqual(parseNearbySearchContext(context, now + 1_000), context);
  assert.deepEqual(parseNearbySearchContext(context, now + 59 * 60 * 1_000), context);
  assert.equal(parseNearbySearchContext(context, now + 61 * 60 * 1_000), null);
  assert.equal(createNearbySearchContext({ latitude: 91, longitude: 12.56 }, now), null);
});

test("analytics URLs omit address, coordinates and all other query data", () => {
  assert.deepEqual(
    stripLocationDataFromMetric({
      url: "/shelters/nearby?lat=55.67&lng=12.56&q=Testvej%201",
      name: "pageview",
    }),
    { url: "/shelters/nearby", name: "pageview" },
  );
  assert.equal(
    stripLocationDataFromMetric({ url: "https://findbeskyttelsesrum.dk/om-data#filter" }).url,
    "/om-data",
  );
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

test("public report categories are explicit and reject arbitrary values", () => {
  assert.deepEqual(shelterReportTypes.map(({ value }) => value), [
    "incorrect_address",
    "building_missing",
    "not_a_shelter",
    "unavailable",
    "incorrect_capacity",
    "duplicate_record",
    "other",
  ]);
  assert.equal(isShelterReportType("incorrect_capacity"), true);
  assert.equal(isShelterReportType("resolved"), false);
  assert.equal(isShelterReportType(null), false);
});
