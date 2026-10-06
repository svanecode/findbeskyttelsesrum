import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { haversineMeters } from "../src/lib/nearby/tiles";
import { boxAround, closestInBox } from "../src/lib/nearby/related";

const here = { latitude: 56.1500, longitude: 10.2000 };
const row = (address_line1: string, latitude: number | null, longitude: number | null) => ({ address_line1, latitude, longitude });

test("other registrations in the area are sorted by distance", () => {
  const rows = [
    row("Fjern 1", 56.1530, 10.2000),
    row("Nær 1", 56.1505, 10.2000),
    row("Uden position 1", null, null),
    row("Mellem 1", 56.1515, 10.2000),
  ];
  assert.deepEqual(
    closestInBox(rows, here.latitude, here.longitude, 0.005, 3)?.map((item) => item.address_line1),
    ["Nær 1", "Mellem 1", "Fjern 1"],
  );
});

test("too few rows near the point ask for a wider box", () => {
  // The corner of the box is further away than a row just outside it could be.
  const rows = [row("Nær 1", 56.1505, 10.2000), row("Hjørne 1", 56.1549, 10.2089)];
  assert.equal(closestInBox(rows, here.latitude, here.longitude, 0.005, 2), null);
  assert.equal(closestInBox(rows, here.latitude, here.longitude, 0.005, 0)?.length, 2);
});

test("the box reaches as far east and west as north and south, also in northern Denmark", () => {
  for (const latitude of [54.8, 56.15, 57.75]) {
    const box = boxAround(latitude, 10, 0.03);
    const northSouth = haversineMeters(latitude, 10, box.north, 10);
    const eastWest = haversineMeters(latitude, 10, latitude, box.east);
    assert.ok(eastWest >= northSouth * 0.999, `${latitude}: ${eastWest} m east, ${northSouth} m north`);
    // The circle the distance check trusts fits inside the box.
    assert.ok(northSouth >= 0.03 * 111_000 * 0.999);
  }
});

test("the related registrations read every row in a box, not just the first 1000", async () => {
  const query = await readFile(new URL("../src/lib/supabase/queries/shelters.ts", import.meta.url), "utf8");
  const related = query.slice(query.indexOf("export async function getAppV2PublicRelatedShelters"));
  assert.match(related.slice(0, related.indexOf("const [samePostalResult")), /readAllPages</);
  assert.doesNotMatch(related.slice(0, related.indexOf("const [samePostalResult")), /\.limit\(/);
});

test("the detail page passes its position to the related registrations", async () => {
  const page = await readFile(new URL("../src/app/beskyttelsesrum/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /getAppV2PublicRelatedShelters\(\{[^}]*latitude: shelter\.latitude,\s*longitude: shelter\.longitude/s);
});
