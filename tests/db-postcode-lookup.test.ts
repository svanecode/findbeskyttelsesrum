import assert from "node:assert/strict";
import test from "node:test";

import { loadServerModule } from "./support/load-server-module";

type SheltersModule = {
  resolveReadableShelterSlug: (slug: string) => Promise<{ stableSlug: string; canonicalSlug: string } | null>;
  resolveAppV2PublicShelter: (slug: string) => Promise<unknown>;
};

type RpcError = { code?: string; message: string } | null;
type RpcResult = { data: unknown; error: RpcError };

const missingFunction: RpcResult = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
const registrationRow = { id: "00000000-0000-4000-8000-000000000001", slug: "registrering-00000000000040008000000000000001", address_line1: "Ryesgade 18", postal_code: "8000", city: "Aarhus C", capacity: 120 };

async function load(rpcResults: Record<string, RpcResult>, calls: string[]) {
  const unused = () => { throw new Error("unused in this test"); };
  const rpc = (name: string) => {
    calls.push(`rpc:${name}`);
    const result = rpcResults[name] ?? { data: [], error: null };
    return {
      range: () => Promise.resolve(result),
      maybeSingle: () => Promise.resolve(result),
    };
  };
  const view = {
    select: () => view,
    eq: () => view,
    order: () => view,
    range: () => {
      calls.push("view:shelter_public_v2");
      return Promise.resolve({ data: [registrationRow], error: null });
    },
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return loadServerModule<SheltersModule>(new URL("../src/lib/supabase/queries/shelters.ts", import.meta.url), {
    "@/lib/app-v2-public": { createAppV2PublicClient: () => ({ rpc, from: () => view }) },
    "@/lib/supabase/app-v2": { createAppV2AdminClient: unused },
    "@/lib/supabase/env": { SupabaseConfigurationError: class extends Error {} },
    "@/lib/supabase/public-rpc-errors": await import("../src/lib/supabase/public-rpc-errors"),
    "@/lib/nearby/related": await import("../src/lib/nearby/related"),
    "@/lib/supabase/read-all-pages": await import("../src/lib/supabase/read-all-pages"),
    react: { cache: <T>(fn: T) => fn },
    "@/lib/shelter-public-url": await import("../src/lib/shelter-public-url"),
    "./municipalities": { getAppV2MunicipalitySummaries: async () => [] },
    "./nearby": { getCachedAppV2PublicNearbyTile: unused },
    "./plain-path-owner-rows": await import("../src/lib/supabase/queries/plain-path-owner-rows"),
    "./public-data-cache": { cachedPerRevision: <T>(_name: string, read: T) => read },
    "./shared": { normalizeMunicipality: unused, normalizePublicShelter: unused, normalizeShelter: unused, sitemapShelterPageSize: 1000 },
  });
}

test("registrations in a postcode come from the postcode function, not the view", async () => {
  const calls: string[] = [];
  const shelters = await load({
    public_shelters_in_postcode_v1: { data: [registrationRow], error: null },
    public_plain_path_owner_ids_v1: { data: [registrationRow.id], error: null },
  }, calls);
  const result = await shelters.resolveReadableShelterSlug("ryesgade-18-8000-aarhus-c");
  assert.deepEqual(result, { stableSlug: registrationRow.slug, canonicalSlug: "ryesgade-18-8000-aarhus-c" });
  assert.ok(calls.includes("rpc:public_shelters_in_postcode_v1"));
  assert.ok(!calls.includes("view:shelter_public_v2"), "the view is not scanned");
});

test("before the migration the postcode lookup falls back to the view", async () => {
  const calls: string[] = [];
  const shelters = await load({
    public_shelters_in_postcode_v1: missingFunction,
    public_plain_path_owner_ids_v1: { data: [registrationRow.id], error: null },
  }, calls);
  const result = await shelters.resolveReadableShelterSlug("ryesgade-18-8000-aarhus-c");
  assert.deepEqual(result, { stableSlug: registrationRow.slug, canonicalSlug: "ryesgade-18-8000-aarhus-c" });
  assert.ok(calls.includes("view:shelter_public_v2"));
});

test("another error from the postcode function is thrown with its message, not hidden by the fallback", async () => {
  const shelters = await load({
    public_shelters_in_postcode_v1: { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } },
  }, []);
  await assert.rejects(
    shelters.resolveReadableShelterSlug("ryesgade-18-8000-aarhus-c"),
    /Could not load public app_v2 shelters in 8000: canceling statement due to statement timeout/,
  );
});

test("a missing plain path owner function is an error, not 'no owners'", async () => {
  const shelters = await load({
    public_shelters_in_postcode_v1: { data: [registrationRow], error: null },
    public_plain_path_owner_ids_v1: missingFunction,
  }, []);
  await assert.rejects(
    shelters.resolveReadableShelterSlug("ryesgade-18-8000-aarhus-c"),
    /Could not read owners of plain readable paths: Could not find the function/,
  );
});

test("a failed slug alias lookup says why", async () => {
  const shelters = await load({
    resolve_public_shelter_slug_alias_v1: { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } },
  }, []);
  await assert.rejects(
    shelters.resolveAppV2PublicShelter("gammelt-slug"),
    /Could not resolve public app_v2 shelter alias "gammelt-slug": canceling statement due to statement timeout/,
  );
});

test("the November 2026 review migrations follow the function conventions", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const names = (await readdir(dir)).filter((name) => /^20261110120[0-3]00_.*\.sql$/.test(name)).sort();
  assert.equal(names.length, 4);
  for (const name of names) {
    const sql = await readFile(new URL(name, dir), "utf8");
    const functions = sql.match(/create or replace function app_v2\.\w+/g) ?? [];
    for (const created of functions) {
      const fn = created.replace("create or replace function ", "");
      assert.match(sql, new RegExp(`revoke all on function ${fn.replace(".", "\\.")}\\(`), `${name}: ${fn} is revoked from public`);
      assert.match(sql, new RegExp(`grant execute on function ${fn.replace(".", "\\.")}\\(`), `${name}: ${fn} has an explicit grant`);
    }
    const definitions = sql.match(/security definer/g)?.length ?? 0;
    const pinned = sql.match(/set search_path = ''/g)?.length ?? 0;
    assert.ok(pinned >= definitions, `${name}: every security definer function pins search_path`);
  }
});
