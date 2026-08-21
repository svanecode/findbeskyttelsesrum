import {
  getAppV2CurrentDatasetPublication,
  getAppV2PublicDataStats,
} from "@/lib/supabase/app-v2-queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const defaultMaximumDataAgeHours = 48;
const defaultMinimumPublicRegistrations = 500;

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function validDate(value: string | null) {
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
}

function healthResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET() {
  const checkedAt = new Date().toISOString();
  const maximumDataAgeHours = positiveNumber(
    process.env.HEALTH_MAX_DATA_AGE_HOURS,
    defaultMaximumDataAgeHours,
  );
  const minimumPublicRegistrations = positiveNumber(
    process.env.HEALTH_MIN_PUBLIC_REGISTRATIONS,
    defaultMinimumPublicRegistrations,
  );
  const application = {
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    builtAt: process.env.SITE_BUILD_TIMESTAMP ?? null,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
  };

  try {
    const [stats, publication] = await Promise.all([
      getAppV2PublicDataStats(),
      getAppV2CurrentDatasetPublication(),
    ]);
    const shelterCount = stats.publicRegistrations;
    const latestImportedAt = stats.latestPublicImportAt;
    const latestImportTime = validDate(latestImportedAt);
    const dataAgeHours = latestImportTime === null
      ? null
      : Math.round(((Date.now() - latestImportTime) / 3_600_000) * 10) / 10;
    const degradationReasons: string[] = [];

    if (shelterCount < minimumPublicRegistrations) {
      degradationReasons.push("public_record_count_below_safety_floor");
    }
    if (dataAgeHours === null || dataAgeHours > maximumDataAgeHours) {
      degradationReasons.push("public_data_is_stale");
    }
    if (!publication) {
      degradationReasons.push("current_publication_missing");
    } else if (!publication.isConsistent) {
      degradationReasons.push("publication_import_link_is_inconsistent");
    }
    if (application.environment === "production") {
      if (!application.gitSha) degradationReasons.push("production_git_sha_missing");
      if (!application.deploymentId) degradationReasons.push("production_deployment_id_missing");
      if (validDate(application.builtAt) === null) degradationReasons.push("production_build_time_missing");
    }

    const status = degradationReasons.length > 0 ? "degraded" : "ok";
    const body = {
      status,
      checkedAt,
      ...(degradationReasons.length > 0 ? { degradationReasons } : {}),
      application,
      dataset: {
        publicationId: publication?.publicationId ?? null,
        importRunId: publication?.importRunId ?? null,
        publishedAt: publication?.publishedAt ?? null,
        latestImportedAt,
        recordCount: shelterCount,
        sourceRecordCount: publication?.sourceRecordCount ?? null,
        dataAgeHours,
        maximumDataAgeHours,
        isConsistent: publication?.isConsistent ?? false,
      },
      database: {
        reachable: true,
        shelterCount,
        latestImportedAt,
        dataAgeHours,
      },
    };

    return healthResponse(body, status === "ok" ? 200 : 503);
  } catch (error) {
    console.error("[health] Public database check failed:", error instanceof Error ? error.name : "unknown");
    return healthResponse(
      {
        status: "error",
        checkedAt,
        application,
        database: { reachable: false },
      },
      503,
    );
  }
}
