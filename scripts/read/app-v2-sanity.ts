import "dotenv/config";

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

  // Hard-fail only on broad sanity failures.
  const hardFailures: string[] = [];
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

