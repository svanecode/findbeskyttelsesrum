import assert from "node:assert/strict";
import test from "node:test";

import { readBoundedRequestText } from "../src/lib/http/read-bounded-request-text";

function chunkedRequest(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Request("https://example.test/api", {
    method: "POST",
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

test("bounded request reader accepts a chunked body within the limit", async () => {
  const result = await readBoundedRequestText(chunkedRequest(["{\"lat\":", "55.6}"]), 32);

  assert.deepEqual(result, {
    ok: true,
    text: '{"lat":55.6}',
    byteLength: 12,
  });
});

test("bounded request reader stops chunked bodies above the limit", async () => {
  const result = await readBoundedRequestText(chunkedRequest(["1234", "5678"]), 7);

  assert.deepEqual(result, { ok: false, reason: "too_large" });
});

test("bounded request reader rejects an oversized declared content length without reading", async () => {
  const result = await readBoundedRequestText(
    new Request("https://example.test/api", {
      method: "POST",
      headers: { "content-length": "100" },
      body: "{}",
    }),
    16,
  );

  assert.deepEqual(result, { ok: false, reason: "too_large" });
});
