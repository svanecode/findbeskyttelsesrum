import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260713201259_harden_public_reads_and_nearby_rpc.sql",
  import.meta.url,
);

test("security migration closes exclusion RPC and bounds anonymous nearby work", async () => {
  const sql = (await readFile(migrationUrl, "utf8")).toLowerCase();

  assert.match(
    sql,
    /revoke all on function public\.list_excluded_shelters\(\) from public, anon, authenticated/,
  );
  assert.match(sql, /grant execute on function public\.list_excluded_shelters\(\) to service_role/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /from app_v2\.shelter_public/);
  assert.match(sql, /p_candidate_limit > 500/);
});
