import assert from "node:assert/strict";
import test from "node:test";

import {
  countryMapViewportContains,
  createBufferedCountryMapViewport,
} from "../src/lib/maps/country-map-viewport";

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
