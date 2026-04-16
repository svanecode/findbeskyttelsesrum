import { writeFile } from "node:fs/promises";

import { DatafordelerOfficialSourceAdapter } from "@/lib/importer/adapters/datafordeler-official-adapter";
import { FixtureOfficialSourceAdapter } from "@/lib/importer/adapters/fixture-adapter";
import { fixtureSnapshotNames } from "@/lib/importer/fixtures/shelter-fixtures";
import { runOfficialImporter } from "@/lib/importer/service";
import { getSupabaseWriteEnv } from "@/lib/supabase/env";

function getMode() {
  return process.argv[2] ?? "fixture";
}

function isDryRun() {
  return process.argv.includes("--dry-run");
}

function shouldResumeLatest() {
  return process.argv.includes("--resume-latest");
}

function hasWriteConfirmation() {
  return process.argv.includes("--write");
}

function hasFixtureWriteTargetConfirmation() {
  return process.env.IMPORTER_WRITE_TARGET?.trim() === "app_v2_fixture";
}

function getSupabaseTargetHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}

function validateFixtureWritePreflight() {
  if (!hasFixtureWriteTargetConfirmation()) {
    throw new Error(
      "Fixture writes require IMPORTER_WRITE_TARGET=app_v2_fixture in addition to --write. This prevents accidental writes to an unintended Supabase project.",
    );
  }

  const { url } = getSupabaseWriteEnv();

  console.log(`[importer] fixture write preflight schema=app_v2 targetHost=${getSupabaseTargetHost(url)}`);
}

function getMaxPages() {
  const flagIndex = process.argv.findIndex((value) => value === "--max-pages");

  if (flagIndex === -1) {
    return undefined;
  }

  const raw = process.argv[flagIndex + 1];
  const parsed = Number(raw);

  if (!raw || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("--max-pages must be followed by a positive integer.");
  }

  return parsed;
}

function getFixtureSnapshotName() {
  const snapshotName = process.argv[3] ?? "baseline";

  if (!fixtureSnapshotNames.includes(snapshotName)) {
    throw new Error(`Unknown fixture snapshot "${snapshotName}". Available snapshots: ${fixtureSnapshotNames.join(", ")}.`);
  }

  return snapshotName;
}

async function writeSummaryFileIfConfigured(summary: unknown) {
  const summaryPath = process.env.IMPORTER_SUMMARY_PATH;

  if (!summaryPath) {
    return;
  }

  try {
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown summary-file write error.";
    console.warn(`[importer] warning could_not_write_summary_file: ${message}`);
  }
}

async function main() {
  const mode = getMode();

  if (mode !== "fixture" && mode !== "datafordeler") {
    throw new Error(`Unsupported importer mode "${mode}". Supported modes: fixture, datafordeler.`);
  }

  const dryRun = isDryRun();
  const resumeLatest = shouldResumeLatest();
  const writeConfirmed = hasWriteConfirmation();
  const maxPages = getMaxPages();

  if (mode === "datafordeler" && !dryRun) {
    throw new Error("Datafordeler writes are not enabled in this phase. Use --dry-run for live-source validation.");
  }

  if (dryRun && resumeLatest) {
    throw new Error("--resume-latest requires database access and cannot be combined with --dry-run.");
  }

  if (!dryRun && !writeConfirmed) {
    throw new Error("Fixture writes require --write. Use --dry-run for safe validation without Supabase writes.");
  }

  if (mode === "fixture" && !dryRun) {
    validateFixtureWritePreflight();
  }

  const adapter =
    mode === "datafordeler" ? new DatafordelerOfficialSourceAdapter() : new FixtureOfficialSourceAdapter();
  const snapshotName = mode === "datafordeler" ? "live" : getFixtureSnapshotName();

  console.log(
    `[importer] mode=${mode} source=${adapter.sourceName} snapshot=${snapshotName} dryRun=${dryRun} maxPages=${maxPages ?? "none"} resumeLatest=${resumeLatest}`,
  );
  const summary = await runOfficialImporter({
    adapter,
    snapshot: {
      name: snapshotName,
      maxPages,
    },
    dryRun,
    resumeLatest,
  });

  console.log(
    `[importer] summary recordsSeen=${summary.recordsSeen} inserted=${summary.inserted} updated=${summary.updated} unchanged=${summary.unchanged} restored=${summary.restored} missing=${summary.missing} warnings=${summary.warningsCount} pagesFetched=${summary.pagesFetched} resumedFrom=${summary.resumedFromImportRunId ?? "none"}`,
  );
  console.log(
    `[importer] fetchStats fetched=${summary.fetchStats.fetchedRecords} capacityAccepted=${summary.fetchStats.acceptedAfterCapacityFilter} normalized=${summary.fetchStats.normalizedRecords} skipped=${summary.fetchStats.skippedRecords} missingOrNonPositiveCapacity=${summary.fetchStats.missingOrNonPositiveCapacityCount} missingAddress=${summary.fetchStats.missingAddressCount} missingMunicipality=${summary.fetchStats.missingMunicipalityCount} acceptedWithCoordinates=${summary.fetchStats.acceptedWithCoordinatesCount} acceptedWithoutCoordinates=${summary.fetchStats.acceptedWithoutCoordinatesCount} missingCoordinates=${summary.fetchStats.missingCoordinatesCount} coordinateParseFailures=${summary.fetchStats.coordinateParseFailureCount} darBatchSize=${summary.fetchStats.darBatchSizeUsed} darFailedBatches=${summary.fetchStats.darFailedBatchCount} darFailureSkips=${summary.fetchStats.acceptedRecordsSkippedDueToDarFailure}`,
  );
  console.log(
    `[importer] lifecycle missingTransitionsApplied=${summary.missingTransitionsApplied} missingTransitionsSkippedReason=${summary.missingTransitionsSkippedReason ?? "none"} lastSuccessfulPage=${summary.lastSuccessfulPage} lastSuccessfulCursor=${summary.lastSuccessfulCursor ?? "none"}`,
  );

  if (summary.fetchStats.skipReasonCounts.length > 0) {
    console.log(
      `[importer] topSkipReasons ${summary.fetchStats.skipReasonCounts
        .slice(0, 5)
        .map((reason) => `${reason.code}=${reason.count}`)
        .join(" ")}`,
    );
  }

  for (const warning of summary.warningExamples) {
    console.warn(`[importer] warning ${warning}`);
  }

  await writeSummaryFileIfConfigured(summary);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown importer error.";

  console.error(`[importer] failed: ${message}`);
  process.exit(1);
});
