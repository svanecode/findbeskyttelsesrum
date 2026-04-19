import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import {
  getAppV2NearbyEligibilitySummary,
  getAppV2GroupedNearbySheltersWithDiagnostics,
  type AppV2NearbyEligibilityMode,
  type AppV2GroupedNearbyShelter,
} from "@/lib/supabase/app-v2-queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const defaultRadiusMeters = 50_000;
const defaultLimit = 10;
const defaultCandidateLimit = 500;
const maxRadiusMeters = 100_000;
const maxLimit = 50;
const maxCandidateLimit = 2_000;
const apiContract = "app_v2_nearby_grouped_v1";
const apiSource = "app_v2";
const activeImportStates = ["active"] as const;
const parameterDefaults = {
  radiusMeters: defaultRadiusMeters,
  limit: defaultLimit,
  candidateLimit: defaultCandidateLimit,
};
const parameterBounds = {
  radiusMeters: {
    min: 1,
    max: maxRadiusMeters,
  },
  limit: {
    min: 1,
    max: maxLimit,
  },
  candidateLimit: {
    min: 1,
    max: maxCandidateLimit,
  },
};
const capabilities = {
  nativeAppV2Shape: true,
  groupedAppV2Shape: true,
  groupedLegacyShape: false,
  legacyCapacityThreshold: true,
  legacyAnvendelseSemantics: false,
  sourceApplicationCodeEligibility: true,
  fullLegacyExclusionsParity: false,
  databaseSideDistanceOrdering: true,
  postgisSpatialIndex: false,
};
const grouping = {
  key: "address_line1 + postal_code + city",
  shelterCount: "number of app_v2 shelter rows in the deterministic address group",
  totalCapacity: "sum of app_v2 capacity values in the group",
  representative: "nearest row in the group by app_v2 distance ordering",
};
const exclusionMode = {
  importStates: activeImportStates,
  appV2ShelterExclusions:
    "active shelter_id, canonical source identity, and exact app_v2 address/postal matches",
  legacyExcludedShelters: "not read by this API",
};
const limitations = [
  "Groups app_v2 shelter rows by exact address_line1, postal_code, and city after deterministic normalization.",
  "Defaults to the legacy nearby capacity threshold of capacity >= 40 before grouping.",
  "Supports explicit source-backed application-code eligibility through eligibility=source-application-code.",
  "Does not include legacy anvendelse/type display semantics.",
  "Does not mirror legacy public.excluded_shelters bygning_id or split-address matching.",
  "Uses database-side bounding-box filtering and Haversine distance ordering, not a PostGIS spatial index.",
  "Not wired to the live /shelters/nearby UI.",
];

type ValidationResult =
  | {
      ok: true;
      value: {
        latitude: number;
        longitude: number;
        radiusMeters: number;
        limit: number;
        candidateLimit: number;
        eligibilityMode: AppV2NearbyEligibilityMode;
      };
    }
  | {
      ok: false;
      errors: string[];
    };

function parseNumber(value: string | null) {
  if (value === null || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: string | null) {
  const parsed = parseNumber(value);

  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function parseEligibilityMode(value: string | null) {
  if (value === null || value.trim() === "" || value === "legacy-capacity") {
    return "legacy_capacity_v1" satisfies AppV2NearbyEligibilityMode;
  }

  if (value === "source-application-code") {
    return "source_application_code_v1" satisfies AppV2NearbyEligibilityMode;
  }

  if (value === "none") {
    return "none" satisfies AppV2NearbyEligibilityMode;
  }

  return null;
}

function validateNearbyRequest(searchParams: URLSearchParams): ValidationResult {
  const errors: string[] = [];
  const latitude = parseNumber(searchParams.get("lat"));
  const longitude = parseNumber(searchParams.get("lng"));
  const radiusMeters = parseInteger(searchParams.get("radius")) ?? defaultRadiusMeters;
  const limit = parseInteger(searchParams.get("limit")) ?? defaultLimit;
  const candidateLimit = parseInteger(searchParams.get("candidateLimit")) ?? defaultCandidateLimit;
  const eligibilityMode = parseEligibilityMode(searchParams.get("eligibility"));

  if (latitude === null) {
    errors.push("lat is required and must be a finite number.");
  } else if (latitude < -90 || latitude > 90) {
    errors.push("lat must be between -90 and 90.");
  }

  if (longitude === null) {
    errors.push("lng is required and must be a finite number.");
  } else if (longitude < -180 || longitude > 180) {
    errors.push("lng must be between -180 and 180.");
  }

  if (searchParams.has("radius") && parseInteger(searchParams.get("radius")) === null) {
    errors.push("radius must be a positive integer number of meters.");
  } else if (radiusMeters <= 0 || radiusMeters > maxRadiusMeters) {
    errors.push(`radius must be between 1 and ${maxRadiusMeters} meters.`);
  }

  if (searchParams.has("limit") && parseInteger(searchParams.get("limit")) === null) {
    errors.push("limit must be a positive integer.");
  } else if (limit <= 0 || limit > maxLimit) {
    errors.push(`limit must be between 1 and ${maxLimit}.`);
  }

  if (searchParams.has("candidateLimit") && parseInteger(searchParams.get("candidateLimit")) === null) {
    errors.push("candidateLimit must be a positive integer.");
  } else if (candidateLimit <= 0 || candidateLimit > maxCandidateLimit) {
    errors.push(`candidateLimit must be between 1 and ${maxCandidateLimit}.`);
  }

  if (candidateLimit < limit) {
    errors.push("candidateLimit must be greater than or equal to limit.");
  }

  if (eligibilityMode === null) {
    errors.push('eligibility must be "legacy-capacity", "source-application-code", or "none".');
  }

  if (errors.length > 0 || latitude === null || longitude === null || eligibilityMode === null) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      latitude,
      longitude,
      radiusMeters,
      limit,
      candidateLimit,
      eligibilityMode,
    },
  };
}

function toApiGroup(row: AppV2GroupedNearbyShelter) {
  return {
    groupKey: row.groupKey,
    address: {
      line1: row.addressLine1,
      postalCode: row.postalCode,
      city: row.city,
    },
    coordinates: {
      latitude: row.latitude,
      longitude: row.longitude,
    },
    distanceMeters: row.distanceMeters,
    shelterCount: row.shelterCount,
    totalCapacity: row.totalCapacity,
    statuses: row.statuses,
    importStates: row.importStates,
    municipality: {
      id: row.municipality.id,
      slug: row.municipality.slug,
      name: row.municipality.name,
      code: row.municipality.code,
    },
    representativeShelter: {
      id: row.representativeShelter.id,
      slug: row.representativeShelter.slug,
      name: row.representativeShelter.name,
      capacity: row.representativeShelter.capacity,
      status: row.representativeShelter.status,
      importState: row.representativeShelter.importState,
    },
    shelterIds: row.shelters.map((shelter) => shelter.id),
    shelterSlugs: row.shelters.map((shelter) => shelter.slug),
  };
}

function getRequestId() {
  return randomUUID();
}

function errorResponse(input: {
  status: number;
  code: string;
  message: string;
  requestId: string;
  details?: string[];
}) {
  return NextResponse.json(
    {
      error: {
        code: input.code,
        message: input.message,
        ...(input.details ? { details: input.details } : {}),
      },
      meta: {
        requestId: input.requestId,
        contract: apiContract,
        source: apiSource,
      },
    },
    { status: input.status },
  );
}

function isMissingAppV2EnvError(error: unknown) {
  return error instanceof Error && error.message.includes("Missing server Supabase write environment variables");
}

export async function GET(request: NextRequest) {
  const requestId = getRequestId();
  const validation = validateNearbyRequest(request.nextUrl.searchParams);

  if (!validation.ok) {
    return errorResponse({
      status: 400,
      code: "invalid_grouped_nearby_query",
      message: "Invalid grouped app_v2 nearby query parameters.",
      requestId,
      details: validation.errors,
    });
  }

  try {
    const result = await getAppV2GroupedNearbySheltersWithDiagnostics({
      latitude: validation.value.latitude,
      longitude: validation.value.longitude,
      radiusMeters: validation.value.radiusMeters,
      limit: validation.value.limit,
      candidateLimit: validation.value.candidateLimit,
      importStates: [...activeImportStates],
      eligibilityMode: validation.value.eligibilityMode,
    });
    const eligibility = getAppV2NearbyEligibilitySummary(validation.value.eligibilityMode);

    return NextResponse.json({
      results: result.rows.map(toApiGroup),
      meta: {
        requestId,
        contract: apiContract,
        source: apiSource,
        resultCount: result.rows.length,
        query: validation.value,
        defaults: parameterDefaults,
        bounds: parameterBounds,
        capabilities,
        grouping,
        eligibility,
        exclusionMode,
        diagnostics: result.diagnostics,
        limitations,
      },
    });
  } catch (error) {
    if (isMissingAppV2EnvError(error)) {
      return errorResponse({
        status: 503,
        code: "app_v2_unavailable",
        message: "The grouped app_v2 nearby API is not available in this environment.",
        requestId,
        details: ["Required server-side Supabase app_v2 environment variables are missing."],
      });
    }

    console.error("Failed to read grouped app_v2 nearby shelters:", error);

    return errorResponse({
      status: 502,
      code: "app_v2_grouped_nearby_read_failed",
      message: "Could not read grouped app_v2 nearby shelters.",
      requestId,
    });
  }
}
