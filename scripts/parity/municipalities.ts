import "dotenv/config";

import { createClient } from "@supabase/supabase-js";

import { normalizeMunicipalityDisplay } from "@/lib/municipalities/metadata";

type LegacyMunicipalityRow = {
  kode: string;
  slug: string;
  navn: string;
};

type AppV2MunicipalityRow = {
  id: string;
  code: string | null;
  slug: string;
  name: string;
};

type NormalizedAppV2MunicipalityRow = AppV2MunicipalityRow & {
  normalizedSlug: string;
  normalizedName: string;
};

type SupabaseParityEnv =
  | {
      ok: true;
      url: string;
      anonKey: string;
      secretKey: string;
    }
  | {
      ok: false;
      missing: string[];
    };

const sampleLimit = 20;

function getSupabaseEnv(): SupabaseParityEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!url || !anonKey || !secretKey) {
    const missing = [
      ["NEXT_PUBLIC_SUPABASE_URL", url],
      ["NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey],
      ["SUPABASE_SECRET_KEY", secretKey],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name as string);

    return { ok: false, missing };
  }

  return { ok: true, url, anonKey, secretKey };
}

function formatRows<T>(rows: T[], formatter: (row: T) => string) {
  if (rows.length === 0) {
    return ["  none"];
  }

  return rows.slice(0, sampleLimit).map((row) => `  - ${formatter(row)}`);
}

function printSection<T>(title: string, rows: T[], formatter: (row: T) => string) {
  console.log(`${title}: ${rows.length}`);

  for (const line of formatRows(rows, formatter)) {
    console.log(line);
  }

  if (rows.length > sampleLimit) {
    console.log(`  ... ${rows.length - sampleLimit} more`);
  }
}

async function readLegacyMunicipalities(url: string, anonKey: string) {
  const supabase = createClient(url, anonKey, {
    auth: {
      persistSession: false,
    },
    db: {
      schema: "public",
    },
  });

  const { data, error } = await supabase.from("kommunekoder").select("kode, slug, navn").order("kode");

  if (error) {
    throw new Error(`Could not read legacy public.kommunekoder: ${error.message}`);
  }

  return (data ?? []) as LegacyMunicipalityRow[];
}

async function readAppV2Municipalities(url: string, secretKey: string) {
  const supabase = createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: "app_v2",
    },
  });

  const { data, error } = await supabase.from("municipalities").select("id, code, slug, name").order("code");

  if (error) {
    throw new Error(`Could not read app_v2.municipalities: ${error.message}`);
  }

  return (data ?? []) as AppV2MunicipalityRow[];
}

function normalizeAppV2Rows(rows: AppV2MunicipalityRow[]): NormalizedAppV2MunicipalityRow[] {
  return rows.map((row) => {
    const display = normalizeMunicipalityDisplay({
      id: row.id,
      slug: row.slug,
      name: row.name,
    });

    return {
      ...row,
      normalizedSlug: display.slug,
      normalizedName: display.name,
    };
  });
}

async function main() {
  const env = getSupabaseEnv();

  console.log("[parity:municipalities] read-only legacy/app_v2 municipality parity check");

  if (!env.ok) {
    console.log(`[parity:municipalities] skipped: missing env vars: ${env.missing.join(", ")}`);
    console.log("[parity:municipalities] no database reads were attempted.");
    return;
  }

  const [legacyRows, appV2Rows] = await Promise.all([
    readLegacyMunicipalities(env.url, env.anonKey),
    readAppV2Municipalities(env.url, env.secretKey),
  ]);

  const normalizedAppV2Rows = normalizeAppV2Rows(appV2Rows);
  const legacyByCode = new Map(legacyRows.map((row) => [row.kode, row]));
  const appV2RowsWithCode = normalizedAppV2Rows.filter((row) => row.code);
  const appV2ByCode = new Map(appV2RowsWithCode.map((row) => [row.code, row]));

  const appV2RowsMissingCode = normalizedAppV2Rows.filter((row) => !row.code);
  const missingInAppV2 = legacyRows.filter((row) => !appV2ByCode.has(row.kode));
  const missingInLegacy = appV2RowsWithCode.filter((row) => row.code && !legacyByCode.has(row.code));
  const slugMismatches = appV2RowsWithCode
    .map((row) => {
      const legacy = row.code ? legacyByCode.get(row.code) : undefined;

      return legacy && legacy.slug !== row.normalizedSlug
        ? {
            code: row.code,
            legacySlug: legacy.slug,
            appV2Slug: row.slug,
            normalizedSlug: row.normalizedSlug,
          }
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  const nameMismatches = appV2RowsWithCode
    .map((row) => {
      const legacy = row.code ? legacyByCode.get(row.code) : undefined;

      return legacy && legacy.navn !== row.normalizedName
        ? {
            code: row.code,
            legacyName: legacy.navn,
            appV2Name: row.name,
            normalizedName: row.normalizedName,
          }
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  console.log(`[parity:municipalities] legacy rows: ${legacyRows.length}`);
  console.log(`[parity:municipalities] app_v2 rows: ${appV2Rows.length}`);
  console.log(`[parity:municipalities] app_v2 rows with code: ${appV2RowsWithCode.length}`);
  console.log("");

  printSection(
    "app_v2 rows missing code",
    appV2RowsMissingCode,
    (row) => `id=${row.id} slug=${row.slug} name=${row.name}`,
  );
  console.log("");
  printSection(
    "legacy rows missing in app_v2 by code",
    missingInAppV2,
    (row) => `kode=${row.kode} slug=${row.slug} navn=${row.navn}`,
  );
  console.log("");
  printSection(
    "app_v2 rows missing in legacy by code",
    missingInLegacy,
    (row) => `code=${row.code} slug=${row.slug} name=${row.name}`,
  );
  console.log("");
  printSection(
    "slug mismatches after app_v2 normalization",
    slugMismatches,
    (row) =>
      `code=${row.code} legacy=${row.legacySlug} app_v2=${row.appV2Slug} normalized=${row.normalizedSlug}`,
  );
  console.log("");
  printSection(
    "name mismatches after app_v2 normalization",
    nameMismatches,
    (row) =>
      `code=${row.code} legacy=${row.legacyName} app_v2=${row.appV2Name} normalized=${row.normalizedName}`,
  );

  const issueCount =
    appV2RowsMissingCode.length +
    missingInAppV2.length +
    missingInLegacy.length +
    slugMismatches.length +
    nameMismatches.length;

  console.log("");
  console.log(`[parity:municipalities] result: ${issueCount === 0 ? "ok" : `${issueCount} issue(s) found`}`);

  if (issueCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown municipality parity error.";

  console.error(`[parity:municipalities] failed: ${message}`);
  process.exit(1);
});
