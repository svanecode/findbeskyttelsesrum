import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260713201259_harden_public_reads_and_nearby_rpc.sql",
  import.meta.url,
);
const publicRegistrationMigrationUrl = new URL(
  "../supabase/migrations/20260816194738_public_registration_read_model.sql",
  import.meta.url,
);
const publicReportsMigrationUrl = new URL(
  "../supabase/migrations/20260816202756_sprint_2_public_shelter_reports.sql",
  import.meta.url,
);
const legacyPrivilegedFunctionsMigrationUrl = new URL(
  "../supabase/migrations/20260819184526_harden_legacy_privileged_functions.sql",
  import.meta.url,
);
const remainingLegacyFunctionsMigrationUrl = new URL(
  "../supabase/migrations/20260819184711_harden_remaining_legacy_function_access.sql",
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

test("public registration read model separates publication from internal status", async () => {
  const sql = (await readFile(publicRegistrationMigrationUrl, "utf8")).toLowerCase();

  assert.match(sql, /add column if not exists publication_state/);
  assert.match(sql, /publication_state = 'published'/);
  assert.match(sql, /view app_v2\.shelter_public_v2/);
  assert.match(sql, /with \(security_barrier = true\)/);
  assert.doesNotMatch(sql, /select\s+s\.\*/);
  assert.match(sql, /revoke all on table app_v2\.shelter_public_v2 from public/);
  assert.match(sql, /security invoker/);

  const publicResultShape = sql.slice(
    sql.indexOf("jsonb_agg(jsonb_build_object"),
    sql.indexOf("jsonb_build_object(\n      'readmodel'"),
  );
  assert.doesNotMatch(publicResultShape, /'status'/);
  assert.doesNotMatch(publicResultShape, /'import_state'/);
});

test("public reports enter a private moderation queue with an audit event", async () => {
  const sql = (await readFile(publicReportsMigrationUrl, "utf8")).toLowerCase();

  assert.match(sql, /create or replace function app_v2\.submit_public_shelter_report/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /from app_v2\.shelter_public_v2/);
  assert.match(sql, /insert into app_v2\.shelter_reports/);
  assert.match(sql, /insert into app_v2\.audit_events/);
  assert.match(sql, /'public_report_submitted'/);
  assert.match(sql, /revoke all on table app_v2\.shelter_reports from public, anon, authenticated/);
  assert.match(sql, /revoke all on table app_v2\.audit_events from public, anon, authenticated/);
  assert.match(sql, /grant execute on function app_v2\.submit_public_shelter_report\(uuid, text, text, text\)\s+to service_role/);
  assert.doesNotMatch(sql, /grant execute[^;]+to anon/);
  assert.doesNotMatch(sql, /grant execute[^;]+to authenticated/);
});

test("legacy security-definer functions are closed to public API roles", async () => {
  const sql = (await readFile(legacyPrivilegedFunctionsMigrationUrl, "utf8")).toLowerCase();

  assert.match(sql, /alter function public\.get_total_shelter_capacity\(\)[\s\S]+set search_path/);
  assert.match(
    sql,
    /revoke all on function public\.get_total_shelter_capacity\(\)[\s\S]+from public, anon, authenticated/,
  );
  assert.match(
    sql,
    /revoke all on function public\.set_user_columns\(\)[\s\S]+from public, anon, authenticated, service_role/,
  );
  assert.match(
    sql,
    /revoke all on function public\.update_shelter_location\([\s\S]+from public, anon, authenticated/,
  );
});

test("remaining legacy helpers use pinned schemas and explicit role allowlists", async () => {
  const sql = (await readFile(remainingLegacyFunctionsMigrationUrl, "utf8")).toLowerCase();

  assert.doesNotMatch(sql, /security definer/);
  assert.match(
    sql,
    /alter function public\.get_nearby_shelters_v3\([\s\S]+set search_path = pg_catalog, public, extensions, pg_temp/,
  );
  assert.match(
    sql,
    /revoke all on function public\.add_excluded_shelter\([\s\S]+from public, anon, authenticated/,
  );
  assert.match(
    sql,
    /grant execute on function public\.add_excluded_shelter\([\s\S]+to service_role/,
  );
  assert.match(
    sql,
    /grant execute on function public\.get_nearby_shelters_v3\([\s\S]+to anon, authenticated, service_role/,
  );
});
