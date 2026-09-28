import "dotenv/config";

import { writeFile } from "node:fs/promises";

import { createClient } from "@supabase/supabase-js";

/**
 * Writes the live BBR usage-code allowlist as a migration, so the public
 * eligibility rule is reviewable in git and a fresh database reproduces it.
 * The original seed only copied a legacy table that exists in production.
 *
 *   npm run export:application-codes -- supabase/migrations/<timestamp>_seed_application_code_eligibility.sql
 */

type EligibilityRow = {
  source_name: string;
  application_code: string;
  label: string | null;
  is_nearby_eligible: boolean;
  rule_source: string;
  notes: string | null;
};

function sqlText(value: string | null) {
  return value === null ? "null" : `'${value.replaceAll("'", "''")}'`;
}

async function main() {
  const outputPath = process.argv[2];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!outputPath) throw new Error("Usage: export:application-codes -- <migration path>");
  if (!url || !secretKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY environment variables.");

  const supabase = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "app_v2" },
  });
  const { data, error } = await supabase
    .from("application_code_eligibility")
    .select("source_name, application_code, label, is_nearby_eligible, rule_source, notes")
    .order("source_name")
    .order("application_code");
  if (error) throw new Error(`Could not read app_v2.application_code_eligibility: ${error.message}`);

  const rows = (data ?? []) as EligibilityRow[];
  if (rows.length === 0) throw new Error("The allowlist is empty; refusing to write an empty seed.");

  const values = rows.map((row) => `  (${[
    sqlText(row.source_name),
    sqlText(row.application_code),
    sqlText(row.label),
    row.is_nearby_eligible ? "true" : "false",
    sqlText(row.rule_source),
    sqlText(row.notes),
  ].join(", ")})`);

  const migration = `-- BBR usage-code allowlist exported from production on ${new Date().toISOString().slice(0, 10)}.
-- Before this, the rule existed only in the database: the original seed copied
-- public.anvendelseskoder, which a fresh database does not have. Existing rows
-- are left untouched, so applying this to production changes nothing.
insert into app_v2.application_code_eligibility (
  source_name, application_code, label, is_nearby_eligible, rule_source, notes
) values
${values.join(",\n")}
on conflict (source_name, application_code) do nothing;
`;
  await writeFile(outputPath, migration, "utf8");
  console.log(`[export:application-codes] wrote ${rows.length} rows (${rows.filter((row) => row.is_nearby_eligible).length} eligible) to ${outputPath}`);
}

main().catch((error) => {
  console.error(`[export:application-codes] failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exit(1);
});
