import assert from "node:assert/strict";
import test from "node:test";

import {
  countryMapGridCell,
  countryMapViewportContains,
  createBufferedCountryMapViewport,
  quantizeCountryMapViewport,
} from "../src/lib/maps/country-map-viewport";
import {
  denmarkGeographicBounds,
  isWithinDenmarkMapBounds,
} from "../src/lib/maps/denmark-bounds";

test("country map requests use a quantized buffer around the visible viewport", () => {
  const visible = {
    north: 57.71234,
    south: 54.42123,
    east: 13.02123,
    west: 7.93212,
    zoom: 7,
  };

  const requested = createBufferedCountryMapViewport(visible);

  assert.equal(requested.zoom, 7);
  assert.ok(requested.north > visible.north);
  assert.ok(requested.south < visible.south);
  assert.ok(requested.east > visible.east);
  assert.ok(requested.west < visible.west);
  assert.equal(Number((requested.north / 0.2).toFixed(8)) % 1, 0);
  assert.equal(countryMapViewportContains(requested, visible), true);
});

test("nearby viewports snap to the same grid-aligned request (PERF-02)", () => {
  const first = createBufferedCountryMapViewport({ north: 55.7, south: 55.65, east: 12.6, west: 12.52, zoom: 14 });
  const second = createBufferedCountryMapViewport({ north: 55.701, south: 55.652, east: 12.603, west: 12.523, zoom: 14 });

  assert.deepEqual(second, first);
  assert.deepEqual(quantizeCountryMapViewport(first), first);
});

test("grid cells are whole multiples of the server step at every zoom", () => {
  for (let zoom = 5; zoom <= 18; zoom += 1) {
    const cell = countryMapGridCell(zoom);
    const probe = { north: 55 + cell.latitude, south: 55, east: 10 + cell.longitude, west: 10, zoom };
    assert.deepEqual(quantizeCountryMapViewport(probe), probe, `zoom ${zoom}`);
    assert.ok(cell.longitude >= cell.latitude, `zoom ${zoom}`);
  }
});

test("grid-aligned requests always cover the visible viewport and survive server quantization", () => {
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  for (let zoom = 6; zoom <= 18; zoom += 1) {
    for (let index = 0; index < 200; index += 1) {
      const latitude = 54 + random() * 4;
      const longitude = 8 + random() * 7.3;
      const height = (180 / 2 ** zoom) * (0.5 + random() * 2);
      const width = (360 / 2 ** zoom) * (1 + random() * 5);
      const visible = {
        north: latitude + height / 2,
        south: latitude - height / 2,
        east: longitude + width / 2,
        west: longitude - width / 2,
        zoom,
      };
      const requested = createBufferedCountryMapViewport(visible);
      assert.equal(countryMapViewportContains(requested, visible), true);
      assert.deepEqual(quantizeCountryMapViewport(requested), requested);
    }
  }
});

test("small pans reuse the buffered request while zoom changes do not", () => {
  const requested = createBufferedCountryMapViewport({
    north: 57,
    south: 55,
    east: 12,
    west: 9,
    zoom: 8,
  });

  assert.equal(countryMapViewportContains(requested, {
    north: 56.9,
    south: 55.1,
    east: 11.9,
    west: 9.1,
    zoom: 8,
  }), true);
  assert.equal(countryMapViewportContains(requested, {
    north: 56.9,
    south: 55.1,
    east: 11.9,
    west: 9.1,
    zoom: 9,
  }), false);
});

test("buffered country map coordinates stay within valid world bounds", () => {
  const requested = createBufferedCountryMapViewport({
    north: 89.99,
    south: -89.99,
    east: 179.99,
    west: -179.99,
    zoom: 6,
  });

  assert.deepEqual(requested, {
    north: 90,
    south: -90,
    east: 180,
    west: -180,
    zoom: 6,
  });
});

test("server-side country map quantization is deterministic and outward", () => {
  const input = {
    north: 57.71234,
    south: 54.42123,
    east: 13.02123,
    west: 7.93212,
    zoom: 7,
  };
  const quantized = quantizeCountryMapViewport(input);

  assert.deepEqual(quantized, {
    north: 57.8,
    south: 54.4,
    east: 13.2,
    west: 7.8,
    zoom: 7,
  });
  assert.deepEqual(quantizeCountryMapViewport(quantized), quantized);
});

test("the national bounds include eastern Bornholm", () => {
  assert.equal(isWithinDenmarkMapBounds(55.14, 15.15), true);
  assert.ok(denmarkGeographicBounds.east >= 15.3);
});

test("only successful, revision-matched map responses are shared by the CDN", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../src/app/api/country-shelters/route.ts", import.meta.url), "utf8");

  assert.match(route, /"Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=60"/);
  assert.equal(route.match(/sharedCacheHeaders\(currentRevision\.cacheKey\)/g)?.length, 1);
  assert.match(route, /status: 409, headers: noStoreHeaders\(currentRevision\.cacheKey\)/);
  assert.match(route, /status: 400, headers: noStoreHeaders\(\)/);
  assert.match(route, /status: 502, headers: noStoreHeaders\(\)/);
});
