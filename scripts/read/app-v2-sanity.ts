import "dotenv/config";

import { createAppV2PublicClient } from "@/lib/app-v2-public";
import {
  getAppV2CountryShelterMarkers,
  getAppV2MunicipalitySummaries,
  getAppV2ShelterCount,
  getAppV2TotalShelterCapacity,
  getLatestAppV2ImportRun,
} from "@/lib/supabase/app-v2-queries";
import { createAppV2AdminClient } from "@/lib/supabase/app-v2";

type SanityEnv =
  | { ok: true }
  | {
      ok: false;
      missing: string[];
    };

function getEnv(): SanityEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!url || !secretKey) {
    const missing = [
      ["NEXT_PUBLIC_SUPABASE_URL", url],
      ["SUPABASE_SECRET_KEY", secretKey],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name as string);

    return { ok: false, missing };
  }

  return { ok: true };
}

function formatInt(value: number) {
  return value.toLocaleString("da-DK");
}

function warnIfMaterialDeviation(label: string, value: number, anchor: number, toleranceRatio: number) {
  if (!Number.isFinite(value)) return;
  const lower = anchor * (1 - toleranceRatio);
  const upper = anchor * (1 + toleranceRatio);
  if (value < lower || value > upper) {
    console.log(
      `[warn] ${label}: observed ${formatInt(value)} vs anchor ~${formatInt(anchor)} (outside ±${Math.round(
        toleranceRatio * 100,
      )}%)`,
    );
  }
}

function getPublicEnv(): SanityEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    const missing = [
      ["NEXT_PUBLIC_SUPABASE_URL", url],
      ["NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name as string);

    return { ok: false, missing };
  }

  return { ok: true };
}

/**
 * PostgREST checks: anon must not read base tables; public views must exist and return sample rows.
 */
async function assertAnonPublicReadModel(): Promise<string[]> {
  const env = getPublicEnv();
  if (!env.ok) {
    console.log(
      `[read:app-v2-sanity] skipping anon/view contract checks (missing): ${env.missing.join(", ")}`,
    );
    return [];
  }

  const failures: string[] = [];
  const pub = createAppV2PublicClient();

  const leaked = await pub.from("shelters").select("id").limit(1);
  if (!leaked.error) {
    failures.push(
      "Anon could select app_v2.shelters without error (expected REVOKE — is migration 013 applied?)",
    );
  }

  const shelterSample = await pub
    .from("shelter_public")
    .select("slug, municipality_id, capacity, source_application_code")
    .limit(5);

  if (shelterSample.error) {
    failures.push(`shelter_public: ${shelterSample.error.message}`);
  } else if (!shelterSample.data?.length) {
    failures.push("shelter_public: expected ≥1 row");
  } else {
    const bad = shelterSample.data.find(
      (row) =>
        !row.slug ||
        !row.municipality_id ||
        row.capacity === null ||
        row.capacity === undefined ||
        !row.source_application_code,
    );
    if (bad) {
      failures.push("shelter_public: row missing slug, municipality_id, capacity, or source_application_code");
    }
  }

  const markerSample = await pub
    .from("country_marker_public")
    .select("slug, latitude, longitude, capacity")
    .limit(5);

  if (markerSample.error) {
    failures.push(`country_marker_public: ${markerSample.error.message}`);
  } else if (!markerSample.data?.length) {
    failures.push("country_marker_public: expected ≥1 row");
  } else {
    const bad = markerSample.data.find(
      (row) =>
        !row.slug ||
        row.latitude === null ||
        row.latitude === undefined ||
        row.longitude === null ||
        row.longitude === undefined,
    );
    if (bad) {
      failures.push("country_marker_public: row missing slug or coordinates");
    }
  }

  const sitemapSample = await pub.from("sitemap_shelter_public").select("slug").limit(5);

  if (sitemapSample.error) {
    failures.push(`sitemap_shelter_public: ${sitemapSample.error.message}`);
  } else if (!sitemapSample.data?.length) {
    failures.push("sitemap_shelter_public: expected ≥1 row");
  } else {
    const bad = sitemapSample.data.find((row) => !row.slug);
    if (bad) {
      failures.push("sitemap_shelter_public: row missing slug");
    }
  }

  const muniSample = await pub.from("municipality_public").select("id, slug, name").limit(5);

  if (muniSample.error) {
    failures.push(`municipality_public: ${muniSample.error.message}`);
  } else if (!muniSample.data?.length) {
    failures.push("municipality_public: expected ≥1 row");
  } else {
    const bad = muniSample.data.find((row) => !row.id || !row.slug || !row.name);
    if (bad) {
      failures.push("municipality_public: row missing id, slug, or name");
    }
  }

  return failures;
}

async function readOptionalCounts() {
  const supabase = createAppV2AdminClient();

  const [exclusions, eligibility] = await Promise.all([
    supabase.from("shelter_exclusions").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("application_code_eligibility").select("id", { count: "exact", head: true }),
  ]);

  const shelterExclusionsActive =
    exclusions.error ? null : (exclusions.count ?? null);
  const applicationCodeEligibilityRows =
    eligibility.error ? null : (eligibility.count ?? null);

  return { shelterExclusionsActive, applicationCodeEligibilityRows };
}

async function main() {
  console.log("app_v2 sanity check");
  console.log("");

  const env = getEnv();
  if (!env.ok) {
    console.log(`[read:app-v2-sanity] missing env vars: ${env.missing.join(", ")}`);
    console.log("[read:app-v2-sanity] no database reads were attempted.");
    process.exit(1);
  }

  const municipalities = await getAppV2MunicipalitySummaries();
  const municipalityCount = municipalities.length;
  const activeMunicipalityCount = municipalities.filter((m) => m.activeShelterCount > 0).length;

  const [activeShelters, totalCapacity, markers, latestImportRun] = await Promise.all([
    getAppV2ShelterCount(),
    getAppV2TotalShelterCapacity(),
    getAppV2CountryShelterMarkers(),
    getLatestAppV2ImportRun(),
  ]);

  const sheltersWithCoordinates = markers.length;
  const countryMarkerCount = markers.length;

  const optional = await readOptionalCounts().catch(() => ({
    shelterExclusionsActive: null,
    applicationCodeEligibilityRows: null,
  }));

  console.log(`Active shelters: ${formatInt(activeShelters)}`);
  console.log(`Total capacity: ${formatInt(totalCapacity)}`);
  console.log(`Municipalities: ${formatInt(municipalityCount)}`);
  console.log(`Active municipalities: ${formatInt(activeMunicipalityCount)}`);
  console.log(`Shelters with coordinates: ${formatInt(sheltersWithCoordinates)}`);
  console.log(`Country marker count: ${formatInt(countryMarkerCount)}`);
  console.log(
    `Latest import: ${
      latestImportRun
        ? `${latestImportRun.status}${latestImportRun.finishedAt ? ` at ${latestImportRun.finishedAt}` : ""}`
        : "missing"
    }`,
  );
  console.log(`Shelter exclusions (active): ${optional.shelterExclusionsActive ?? "n/a"}`);
  console.log(`Application code eligibility rows: ${optional.applicationCodeEligibilityRows ?? "n/a"}`);
  console.log("");

  const publicReadFailures = await assertAnonPublicReadModel();
  if (publicReadFailures.length > 0) {
    console.log("[read:app-v2-sanity] public read-model checks:");
    for (const msg of publicReadFailures) {
      console.log(`- ${msg}`);
    }
    console.log("");
  }

  // Hard-fail only on broad sanity failures.
  const hardFailures: string[] = [...publicReadFailures];
  if (activeShelters <= 0) hardFailures.push("Active shelters is 0");
  if (totalCapacity <= 0) hardFailures.push("Total capacity is 0");
  if (municipalityCount <= 0) hardFailures.push("Municipalities is 0");
  if (countryMarkerCount <= 0) hardFailures.push("Country marker count is 0");
  if (latestImportRun && latestImportRun.status === "failed") hardFailures.push("Latest import status is failed");
  if (!latestImportRun) hardFailures.push("Latest import run is missing");

  // Warning-only anchors (do not fail on drift).
  warnIfMaterialDeviation("Total capacity", totalCapacity, 3_417_530, 0.15);
  warnIfMaterialDeviation("Country marker count", countryMarkerCount, 23_694, 0.15);

  if (hardFailures.length > 0) {
    console.log("");
    console.log(`Result: FAIL (${hardFailures.length} hard failure(s))`);
    for (const failure of hardFailures) {
      console.log(`- ${failure}`);
    }
    process.exit(2);
  }

  console.log("Result: PASS");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown app_v2 sanity error.";
  console.error(`[read:app-v2-sanity] failed: ${message}`);
  process.exit(1);
});

