import assert from "node:assert/strict";
import { test } from "node:test";

import { pickRelatedFromNearby } from "../src/lib/nearby/related";

const row = (id: string, address_line1: string) => ({
  id,
  slug: `${id}-slug`,
  address_line1,
  postal_code: "8000",
  city: "Aarhus C",
  capacity: 50,
  distance_meters: 10,
});

test("related registrations keep the database's distance order and leave out the registration itself", () => {
  const results = [row("self", "Her 1"), row("a", "Nær 1"), row("b", "Mellem 1"), row("c", "Fjern 1")];
  assert.deepEqual(pickRelatedFromNearby(results, "self", 3).map((item) => item.address_line1), ["Nær 1", "Mellem 1", "Fjern 1"]);
  assert.deepEqual(pickRelatedFromNearby(results, "x", 3).map((item) => item.id), ["self", "a", "b"]);
});

test("an empty or malformed result gives no related registrations, so the page falls back", () => {
  assert.deepEqual(pickRelatedFromNearby([], "self", 3), []);
  assert.deepEqual(pickRelatedFromNearby(null, "self", 3), []);
  assert.deepEqual(pickRelatedFromNearby([{ id: "a" }], "self", 3), []);
});
