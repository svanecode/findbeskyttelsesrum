import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import test from "node:test";
import type { NextRequest, NextResponse } from "next/server";

import { readBoundedRequestText } from "../src/lib/http/read-bounded-request-text";
import { isShelterReportType } from "../src/lib/reporting/shelter-report";
import * as pagination from "../src/lib/moderation/pagination";
import { loadServerModule } from "./support/load-server-module";

(globalThis as unknown as { AsyncLocalStorage: typeof AsyncLocalStorage }).AsyncLocalStorage = AsyncLocalStorage;
const require = createRequire(import.meta.url);
const nextServer = require("next/server") as typeof import("next/server");

test("readiness observes an outage after a healthy response and recovers on the next successful read", async (t) => {
  t.mock.method(console, "error", () => undefined);
  const nextCache = require("next/cache") as Record<string, unknown>;
  const { workAsyncStorage } = require("next/dist/server/app-render/work-async-storage.external.js") as {
    workAsyncStorage: AsyncLocalStorage<unknown>;
  };
  let cachedValue: unknown;
  const workStore = {
    forceDynamic: true,
    isStaticGeneration: false,
    pendingRevalidates: {} as Record<string, Promise<unknown>>,
    incrementalCache: {
      generateSimpleCacheKey: async (key: string) => key,
      generateCacheKey: async (key: string) => key,
      get: async () => cachedValue ? { isStale: true, value: cachedValue } : null,
      set: async (_key: string, value: unknown) => { cachedValue = value; },
    },
  };
  let unavailable = false;
  let reads = 0;
  const route = await loadServerModule<{ GET: () => Promise<Response> }>(
    new URL("../src/app/api/health/route.ts", import.meta.url),
    {
      "next/cache": nextCache,
      "@/lib/supabase/app-v2-queries": {
        getAppV2PublicDataStats: async () => {
          reads += 1;
          if (unavailable) throw new Error("simulated database outage");
          return { publicRegistrations: 1000, latestPublicImportAt: new Date().toISOString() };
        },
        getAppV2CurrentDatasetPublication: async () => ({ publicationId: "publication", isConsistent: true }),
        getAppV2PublicDataRevision: async () => ({ publicationId: "publication", cacheKey: "publication:1" }),
      },
      "@/lib/operations/operational-health": {
        getOperationalHealth: async () => ({ heartbeatFound: true, status: "ok", isFresh: true }),
      },
    },
  );
  const oldEnvironment = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "preview";
  try {
    await workAsyncStorage.run(workStore, async () => {
      assert.equal((await route.GET()).status, 200);
      await Promise.all(Object.values(workStore.pendingRevalidates));
      workStore.pendingRevalidates = {};
      unavailable = true;
      const failed = await route.GET();
      await Promise.all(Object.values(workStore.pendingRevalidates));
      assert.equal(failed.status, 503, "a warmed cache must not conceal a failed dependency read");
      assert.deepEqual((await failed.json()).database, { reachable: false });
      assert.equal(failed.headers.get("Cache-Control"), "private, no-store");
      unavailable = false;
      const recovered = await route.GET();
      assert.equal(recovered.status, 200);
      assert.match(recovered.headers.get("Cache-Control") ?? "", /s-maxage=30, must-revalidate/);
      assert.equal(reads, 3);
    });
  } finally {
    if (oldEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = oldEnvironment;
  }
});

test("a late heartbeat warns, while a missing or day-old heartbeat degrades readiness", async () => {
  const nextCache = require("next/cache") as Record<string, unknown>;
  let operationalHealth: Record<string, unknown> = {};
  const route = await loadServerModule<{ GET: () => Promise<Response> }>(
    new URL("../src/app/api/health/route.ts", import.meta.url),
    {
      "next/cache": nextCache,
      "@/lib/supabase/app-v2-queries": {
        getAppV2PublicDataStats: async () => ({
          publicRegistrations: 1000,
          latestPublicImportAt: new Date().toISOString(),
        }),
        getAppV2CurrentDatasetPublication: async () => ({ publicationId: "publication", isConsistent: true }),
        getAppV2PublicDataRevision: async () => ({ publicationId: "publication", cacheKey: "publication:1" }),
      },
      "@/lib/operations/operational-health": {
        getOperationalHealth: async () => operationalHealth,
      },
    },
  );
  const oldEnvironment = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "preview";
  try {
    operationalHealth = { heartbeatFound: true, status: "ok", isFresh: true, ageMinutes: 20 };
    const fresh = await route.GET();
    assert.equal(fresh.status, 200);
    assert.equal((await fresh.json()).warnings, undefined);

    operationalHealth = { heartbeatFound: true, status: "ok", isFresh: false, ageMinutes: 600 };
    const late = await route.GET();
    const lateBody = await late.json();
    assert.equal(late.status, 200, "GitHub cron delays must not report the site as down");
    assert.equal(lateBody.status, "ok");
    assert.deepEqual(lateBody.warnings, ["trusted_operational_heartbeat_is_late"]);

    operationalHealth = { heartbeatFound: true, status: "ok", isFresh: false, ageMinutes: 1_500 };
    const stale = await route.GET();
    assert.equal(stale.status, 503);
    assert.deepEqual((await stale.json()).degradationReasons, ["trusted_operational_heartbeat_is_stale"]);

    operationalHealth = { heartbeatFound: true, status: "ok", isFresh: false, ageMinutes: null };
    assert.equal((await route.GET()).status, 503, "an unknown heartbeat age must not be treated as late");

    operationalHealth = { heartbeatFound: false, status: null, isFresh: false, ageMinutes: null };
    assert.equal((await route.GET()).status, 503);

    operationalHealth = { heartbeatFound: true, status: "error", isFresh: true, ageMinutes: 5 };
    assert.equal((await route.GET()).status, 503);
  } finally {
    if (oldEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = oldEnvironment;
  }
});

test("report validation rejects JSON primitives before any database operation", async () => {
  let databaseCalls = 0;
  const route = await loadServerModule<{ POST: (request: NextRequest) => Promise<NextResponse> }>(
    new URL("../src/app/api/app-v2/shelter-reports/route.ts", import.meta.url),
    {
      "next/server": nextServer,
      "@/lib/http/read-bounded-request-text": { readBoundedRequestText },
      "@/lib/reporting/shelter-report": { isShelterReportType },
      "@/lib/rate-limit": { rateLimit: () => true },
      "@/lib/distributed-rate-limit": { consumeDistributedRateLimit: () => { databaseCalls += 1; throw new Error("unexpected limiter call"); } },
      "@/lib/supabase/app-v2": { createAppV2AdminClient: () => { databaseCalls += 1; throw new Error("unexpected database call"); } },
    },
  );
  for (const body of ["null", "[]", "true", "123", '"text"']) {
    const response = await route.POST(new nextServer.NextRequest("https://example.invalid/api/app-v2/shelter-reports", {
      method: "POST", headers: { "Content-Type": "application/json" }, body,
    }));
    assert.equal(response.status, 400, body);
    assert.equal(typeof (await response.json()).error, "string");
  }
  assert.equal(databaseCalls, 0);
});

test("successful moderation and rollback invalidate cached public detail and list routes", async () => {
  for (const action of ["moderate", "rollback"] as const) {
    const invalidated: Array<[string, string | undefined]> = [];
    const revalidatePath = (path: string, type?: string) => { invalidated.push([path, type]); };
    const invalidation = await loadServerModule<{ revalidatePublicData: () => void }>(
      new URL("../src/lib/moderation/revalidate-public-data.ts", import.meta.url),
      { "next/cache": { revalidatePath } },
    );
    const dependencies = {
      "next/cache": { revalidatePath },
      "next/navigation": { redirect: (path: string) => { throw new Error(`redirect:${path}`); } },
      "@/lib/moderation/auth": {
        requireModerator: async () => ({ profile: { role: "owner" }, supabase: { schema: () => ({ rpc: async () => ({ error: null }) }) } }),
      },
      "@/lib/moderation/revalidate-public-data": invalidation,
      "@/lib/moderation/pagination": pagination,
      "@/lib/moderation/reports": { reportStatuses: ["open", "reviewing", "resolved", "rejected"] },
    };
    const file = action === "moderate" ? "actions.ts" : "drift/actions.ts";
    const actions = await loadServerModule<Record<string, (form: FormData) => Promise<void>>>(
      new URL(`../src/app/admin/${file}`, import.meta.url), dependencies,
    );
    const form = new FormData();
    form.set("reportId", "94000000-0000-4000-8000-000000000003");
    form.set("publicationId", "94000000-0000-4000-8000-000000000003");
    form.set("action", "exclude");
    form.set("confirmation", "GENDAN");
    await assert.rejects(actions[action === "moderate" ? "moderateReportAction" : "rollbackPublicationAction"](form), /redirect:/);
    for (const path of ["/beskyttelsesrum/[slug]", "/kommune/[slug]", "/kommune/[slug]/side/[page]"]) {
      assert.ok(invalidated.some(([value, type]) => value === path && type === "page"), `${action}: ${path}`);
    }
    for (const path of ["/", "/kommune", "/kort", "/om-data", "/sitemap.xml"]) {
      assert.ok(invalidated.some(([value]) => value === path), `${action}: ${path}`);
    }
  }
});
