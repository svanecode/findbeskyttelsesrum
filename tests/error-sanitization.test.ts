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
    "Fejl ved Vesterbrogade 3, 1620 København V; lat=55.6761 lng:12.5683; par 55.6761, 12.5683; https://findbeskyttelsesrum.dk/naer-dig?lat=55.67&lng=12.56#kort",
  );

  assert.doesNotMatch(value, /Vesterbrogade 3/);
  assert.doesNotMatch(value, /55\.6761/);
  assert.doesNotMatch(value, /12\.5683/);
  assert.doesNotMatch(value, /\?lat=/);
  assert.match(value, /\[address redacted\]/);
  assert.match(value, /\[coordinates redacted\]|\[location redacted\]/);
  assert.match(value, /https:\/\/findbeskyttelsesrum\.dk\/naer-dig/);
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

test("window errors without a script URL from the site are filtered as browser noise", () => {
  const base = { url: "https://findbeskyttelsesrum.dk/kort", timestamp: new Date(now).toISOString() };

  assert.equal(parseAndSanitizeClientErrorReport({
    ...base,
    message: "Script error.",
    context: { filename: "", lineno: 0, colno: 0, type: "window-error" },
  }, now), null);
  assert.equal(parseAndSanitizeClientErrorReport({
    ...base,
    message: "Maximum call stack size exceeded.",
    context: { filename: "undefined", lineno: 203, colno: 363, type: "window-error" },
  }, now), null);
  assert.equal(parseAndSanitizeClientErrorReport({
    ...base,
    message: "Script error.",
    context: { type: "window-error" },
  }, now), null);
  assert.equal(parseAndSanitizeClientErrorReport({
    ...base,
    message: "Script error.",
  }, now), null);

  assert.ok(parseAndSanitizeClientErrorReport({
    ...base,
    message: "Cannot read properties of undefined",
    context: { filename: "https://findbeskyttelsesrum.dk/_next/static/chunks/app.js", lineno: 1, colno: 9, type: "window-error" },
  }, now));
  assert.ok(parseAndSanitizeClientErrorReport({
    ...base,
    message: "Unhandled promise rejection: TypeError: Load failed",
    context: { type: "unhandledrejection" },
  }, now));
  assert.ok(parseAndSanitizeClientErrorReport({
    ...base,
    message: "Adressevælger search failed with status 500",
    context: { component: "useErrorHandler" },
  }, now));
});

test("reports whose stack only has browser-extension frames are filtered, whatever the type", () => {
  const base = { url: "https://findbeskyttelsesrum.dk/", timestamp: new Date(now).toISOString() };
  const message = "Cannot read properties of undefined (reading 'M_ID')";

  assert.equal(parseAndSanitizeClientErrorReport({
    ...base,
    message,
    stack: [
      "TypeError: Cannot read properties of undefined (reading 'M_ID')",
      "    at e (chrome-extension://abcdefghijklmnopabcdefghijklmnop/executors/200.js:1:2345)",
      "    at chrome-extension://abcdefghijklmnopabcdefghijklmnop/executors/200.js:1:6789",
    ].join("\n"),
    context: { type: "unhandledrejection" },
  }, now), null);

  for (const scheme of ["moz-extension", "safari-web-extension", "safari-extension"]) {
    assert.equal(parseAndSanitizeClientErrorReport({
      ...base,
      message,
      stack: `TypeError: x\n    at f (${scheme}://0000-1111/content.js:3:4)`,
    }, now), null, scheme);
  }

  // Firefox/Safari style frames (function@url)
  assert.equal(parseAndSanitizeClientErrorReport({
    ...base,
    message,
    stack: "f@moz-extension://0000-1111/content.js:3:4\ng@moz-extension://0000-1111/content.js:5:6",
    context: { type: "window-error", filename: "https://findbeskyttelsesrum.dk/_next/app.js" },
  }, now), null);
});

test("a stack with at least one frame from the site itself is still reported", () => {
  const base = { url: "https://findbeskyttelsesrum.dk/", timestamp: new Date(now).toISOString() };

  assert.ok(parseAndSanitizeClientErrorReport({
    ...base,
    message: "Cannot read properties of undefined",
    stack: [
      "TypeError: Cannot read properties of undefined",
      "    at e (chrome-extension://abcdefghijklmnopabcdefghijklmnop/executors/200.js:1:2345)",
      "    at t (https://findbeskyttelsesrum.dk/_next/static/chunks/app.js:1:99)",
    ].join("\n"),
    context: { type: "unhandledrejection" },
  }, now));
  assert.ok(parseAndSanitizeClientErrorReport({
    ...base,
    message: "Boom",
    stack: "Error: Boom\n    at <anonymous>",
    context: { type: "unhandledrejection" },
  }, now));
  assert.ok(parseAndSanitizeClientErrorReport({ ...base, message: "Boom" }, now));
});
