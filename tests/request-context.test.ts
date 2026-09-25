import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { getClientAddress, isSameOriginRequest } from "../src/lib/http/request-context";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server") as typeof import("next/server");

function request(headers: Record<string, string>) {
  return new NextRequest("https://findbeskyttelsesrum.dk/api/test", { method: "POST", headers });
}

test("the platform-set Vercel address wins over client-controllable headers", () => {
  assert.equal(
    getClientAddress(request({
      "x-vercel-forwarded-for": "203.0.113.7",
      "x-forwarded-for": "198.51.100.1, 10.0.0.1",
      "x-real-ip": "192.0.2.9",
    })),
    "203.0.113.7",
  );
  assert.equal(getClientAddress(request({ "x-forwarded-for": " 198.51.100.1 , 10.0.0.1" })), "198.51.100.1");
  assert.equal(getClientAddress(request({ "x-real-ip": "192.0.2.9" })), "192.0.2.9");
  assert.equal(getClientAddress(request({})), null);
});

test("a present Origin must match the host", () => {
  assert.equal(isSameOriginRequest(request({})), true);
  assert.equal(isSameOriginRequest(request({ origin: "https://findbeskyttelsesrum.dk" })), true);
  assert.equal(isSameOriginRequest(request({ origin: "https://evil.example" })), false);
  assert.equal(isSameOriginRequest(request({ origin: "null" })), false);
});
