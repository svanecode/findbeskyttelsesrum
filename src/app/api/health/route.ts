import {
  getAppV2CurrentDatasetPublication,
  getAppV2PublicDataRevision,
  getAppV2PublicDataStats,
} from "@/lib/supabase/app-v2-queries";
import { getOperationalHealth } from "@/lib/operations/operational-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const defaultMaximumDataAgeHours = 48;
const defaultMinimumPublicRegistrations = 500;
// GitHub runs scheduled workflows best-effort and often hours late, so a late
// heartbeat is a warning. Only a heartbeat older than the hard limit (or a
// missing/failed one) means the monitoring chain itself is broken.
const defaultMaximumOperationalAgeMinutes = 480;
const defaultOperationalHardLimitMinutes = 1_440;
const healthDependencyCacheSeconds = 30;

async function readHealthDependencies(maximumOperationalAgeMinutes: number) {
  // Readiness must observe failed reads. A stale-while-revalidate data cache
  // would retain the last healthy result indefinitely when a refresh fails.
  const [stats, publication, dataRevision, operationalHealth] = await Promise.all([
    getAppV2PublicDataStats(),
    getAppV2CurrentDatasetPublication(),
    getAppV2PublicDataRevision(),
    getOperationalHealth(maximumOperationalAgeMinutes),
  ]);

  return { stats, publication, dataRevision, operationalHealth };
}

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
      "Cache-Control": status === 200
        ? `public, max-age=0, s-maxage=${healthDependencyCacheSeconds}, must-revalidate`
        : "private, no-store",
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
  const maximumOperationalAgeMinutes = positiveNumber(
    process.env.HEALTH_MAX_OPERATION_AGE_MINUTES,
    defaultMaximumOperationalAgeMinutes,
  );
  const operationalHardLimitMinutes = Math.max(
    maximumOperationalAgeMinutes,
    positiveNumber(process.env.HEALTH_MAX_OPERATION_HARD_AGE_MINUTES, defaultOperationalHardLimitMinutes),
  );
  const application = {
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    builtAt: process.env.SITE_BUILD_TIMESTAMP ?? null,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
  };

  try {
    const { stats, publication, dataRevision, operationalHealth } = await readHealthDependencies(
      maximumOperationalAgeMinutes,
    );
    const shelterCount = stats.publicRegistrations;
    const latestImportedAt = stats.latestPublicImportAt;
    const latestImportTime = validDate(latestImportedAt);
    const dataAgeHours = latestImportTime === null
      ? null
      : Math.round(((Date.now() - latestImportTime) / 3_600_000) * 10) / 10;
    const degradationReasons: string[] = [];
    const warnings: string[] = [];

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
    if (dataRevision.publicationId !== (publication?.publicationId ?? null)) {
      degradationReasons.push("public_revision_publication_mismatch");
    }
    if (!operationalHealth.heartbeatFound) {
      degradationReasons.push("trusted_operational_heartbeat_missing");
    } else {
      if (operationalHealth.status !== "ok") {
        degradationReasons.push("trusted_operational_heartbeat_not_ok");
      }
      if (!operationalHealth.isFresh) {
        const ageMinutes = operationalHealth.ageMinutes;
        if (typeof ageMinutes === "number" && ageMinutes <= operationalHardLimitMinutes) {
          warnings.push("trusted_operational_heartbeat_is_late");
        } else {
          degradationReasons.push("trusted_operational_heartbeat_is_stale");
        }
      }
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
      ...(warnings.length > 0 ? { warnings } : {}),
      application,
      dataset: {
        publicationId: publication?.publicationId ?? null,
        revision: dataRevision.cacheKey,
        revisionChangedAt: dataRevision.changedAt,
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
      operations: { ...operationalHealth, hardLimitMinutes: operationalHardLimitMinutes },
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
