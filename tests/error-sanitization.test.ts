import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAndSanitizeClientErrorReport,
  redactPotentialLocationData,
  stripUrlQuery,
} from "../src/lib/errors/sanitize-client-error";

const now = Date.UTC(2026, 7, 22, 12);

test("client error reports reject identifiers and unknown top-level fields", () => {
  const base = {
    message: "Kortet fejlede",
    url: "https://findbeskyttelsesrum.dk/kort",
    timestamp: new Date(now).toISOString(),
  };

  assert.equal(parseAndSanitizeClientErrorReport({ ...base, userId: "person-1" }, now), null);
  assert.equal(parseAndSanitizeClientErrorReport({ ...base, userAgent: "full browser" }, now), null);
  assert.equal(parseAndSanitizeClientErrorReport({ ...base, address: "Testvej 1" }, now), null);
  assert.equal(parseAndSanitizeClientErrorReport({ ...base, timestamp: new Date(now - 25 * 60 * 60_000).toISOString() }, now), null);
});

test("location clues and embedded URL parameters are redacted from free text", () => {
  const value = redactPotentialLocationData(
    "Fejl ved Vesterbrogade 3, 1620 København V; lat=55.6761 lng:12.5683; par 55.6761, 12.5683; https://findbeskyttelsesrum.dk/shelters/nearby?lat=55.67&lng=12.56#kort",
  );

  assert.doesNotMatch(value, /Vesterbrogade 3/);
  assert.doesNotMatch(value, /55\.6761/);
  assert.doesNotMatch(value, /12\.5683/);
  assert.doesNotMatch(value, /\?lat=/);
  assert.match(value, /\[address redacted\]/);
  assert.match(value, /\[coordinates redacted\]|\[location redacted\]/);
  assert.match(value, /https:\/\/findbeskyttelsesrum\.dk\/shelters\/nearby/);
  assert.equal(stripUrlQuery("/kort?lat=55#valgt"), "/kort");
});

test("structured context keeps only a bounded fixed allowlist", () => {
  const parsed = parseAndSanitizeClientErrorReport({
    message: "Fejl på https://findbeskyttelsesrum.dk/kort?adresse=Testvej",
    stack: Array.from({ length: 30 }, (_, index) => `frame ${index} at 55.6761, 12.5683`).join("\n"),
    url: "https://findbeskyttelsesrum.dk/kort?adresse=Testvej#valgt",
    timestamp: new Date(now).toISOString(),
    context: {
      component: "CountryMap",
      filename: "https://findbeskyttelsesrum.dk/_next/chunk.js?request=private",
      lineno: 42,
      address: "Vesterbrogade 3",
      nested: { latitude: 55.6761, note: "Vesterbrogade 3, 1620 København V" },
    },
  }, now);

  assert.ok(parsed);
  assert.equal(parsed.url, "https://findbeskyttelsesrum.dk/kort");
  assert.doesNotMatch(parsed.message, /\?adresse=/);
  assert.deepEqual(parsed.context, {
    component: "CountryMap",
    filename: "https://findbeskyttelsesrum.dk/_next/chunk.js",
    lineno: 42,
  });
  assert.equal(parsed.stack?.split("\n").length, 20);
  assert.doesNotMatch(parsed.stack ?? "", /55\.6761|12\.5683/);
});
