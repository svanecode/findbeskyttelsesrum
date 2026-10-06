import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { closestInBox } from "../src/lib/nearby/related";

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

test("the detail page passes its position to the related registrations", async () => {
  const page = await readFile(new URL("../src/app/beskyttelsesrum/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /getAppV2PublicRelatedShelters\(\{[^}]*latitude: shelter\.latitude,\s*longitude: shelter\.longitude/s);
});
