import assert from "node:assert/strict";
import test from "node:test";

import type { unstable_cache } from "next/cache";

import { loadServerModule } from "./support/load-server-module";

type RevisionCacheModule = typeof import("../src/lib/supabase/queries/public-data-cache");

async function loadRevisionCacheModule() {
  return loadServerModule<RevisionCacheModule>(new URL("../src/lib/supabase/queries/public-data-cache.ts", import.meta.url), {
    "next/cache": { unstable_cache: fakeCache().cache },
    "./publication": { getAppV2PublicDataRevision: async () => ({ cacheKey: "unused" }) },
  });
}

/** A data cache that remembers results by key parts and arguments, and never stores a failed read. */
function fakeCache() {
  const entries = new Map<string, unknown>();
  const keys: string[][] = [];
  const cache = ((read: (...args: unknown[]) => Promise<unknown>, keyParts: string[] = []) => {
    keys.push(keyParts);
    return async (...args: unknown[]) => {
      const key = JSON.stringify([keyParts, args]);
      if (entries.has(key)) return entries.get(key);
      const result = await read(...args);
      entries.set(key, result);
      return result;
    };
  }) as unknown as typeof unstable_cache;
  return { cache, keys };
}

function setup(options: { enabled?: boolean } = {}) {
  const fake = fakeCache();
  const state = { revision: "rev-1", calls: 0 };
  return { fake, state, load: async () => {
    const { createRevisionCache } = await loadRevisionCacheModule();
    return createRevisionCache({
      cache: fake.cache,
      readRevisionKey: async () => state.revision,
      enabled: () => options.enabled ?? true,
    });
  } };
}

test("the same revision reads the database once for two reads", async () => {
  const { state, load } = setup();
  const { cachedPerRevision } = await load();
  const read = cachedPerRevision("example", async (slug: string) => {
    state.calls += 1;
    return `row for ${slug}`;
  });

  assert.equal(await read("a"), "row for a");
  assert.equal(await read("a"), "row for a");
  assert.equal(state.calls, 1);
});

test("a new revision reads the database again, and the key carries the revision", async () => {
  const { fake, state, load } = setup();
  const { cachedPerRevision } = await load();
  const read = cachedPerRevision("example", async (slug: string) => {
    state.calls += 1;
    return `${state.revision}:${slug}`;
  });

  assert.equal(await read("a"), "rev-1:a");
  state.revision = "rev-2";
  assert.equal(await read("a"), "rev-2:a");
  assert.equal(state.calls, 2);
  assert.ok(fake.keys.some((key) => key.includes("rev-1") && key.includes("example")));
  assert.ok(fake.keys.some((key) => key.includes("rev-2") && key.includes("example")));
});

test("a read that throws is not cached", async () => {
  const { state, load } = setup();
  const { cachedPerRevision } = await load();
  const read = cachedPerRevision("example", async () => {
    state.calls += 1;
    if (state.calls === 1) throw new Error("database unavailable");
    return "row";
  });

  await assert.rejects(read(), /database unavailable/);
  assert.equal(await read(), "row");
  assert.equal(state.calls, 2);
});

test("without the Next.js data cache every read goes to the database", async () => {
  const { fake, state, load } = setup({ enabled: false });
  const { cachedPerRevision, readForRevision } = await load();
  const read = cachedPerRevision("example", async () => {
    state.calls += 1;
    return "row";
  });

  await read();
  await read();
  await readForRevision("other", "rev-1", "k", async () => {
    state.calls += 1;
    return "row";
  });
  assert.equal(state.calls, 3);
  assert.equal(fake.keys.length, 0);
});

test("readForRevision keys entries by the revision the caller read", async () => {
  const { fake, state, load } = setup();
  const { readForRevision } = await load();
  const read = () => readForRevision("tile", state.revision, "x1", async () => {
    state.calls += 1;
    return state.revision;
  });

  assert.equal(await read(), "rev-1");
  assert.equal(await read(), "rev-1");
  state.revision = "rev-2";
  assert.equal(await read(), "rev-2");
  assert.equal(state.calls, 2);
  assert.ok(fake.keys.some((key) => key.includes("rev-2") && key.includes("x1")));
});
