import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import {
  getAppV2GroupedNearbySheltersWithDiagnostics,
  getAppV2NearbyEligibilitySummary,
  type AppV2GroupedNearbyShelter,
} from "@/lib/supabase/app-v2-queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LegacyNearbyShelter = {
  id: string;
  bygning_id: string | null;
  kommunekode: string | null;
  total_capacity: number | null;
  address: string | null;
  postnummer: string | null;
  vejnavn: string | null;
  husnummer: string | null;
  location: {
    type: string;
    coordinates: number[];
  } | null;
  anvendelse: string | null;
  distance: number | null;
  shelter_count: number | null;
};

type ValidationResult =
  | {
      ok: true;
      value: {
        latitude: number;
        longitude: number;
        radiusMeters: number;
        limit: number;
        candidateLimit: number;
      };
    }
  | {
      ok: false;
      errors: string[];
    };

const defaultRadiusMeters = 50_000;
const defaultLimit = 10;
const defaultCandidateLimit = 500;
const maxRadiusMeters = 100_000;
const maxLimit = 50;
const maxCandidateLimit = 2_000;
const apiContract = "app_v2_nearby_shadow_compare_v1";
const apiSource = "legacy_plus_app_v2";
const activeImportStates = ["active"] as const;
const eligibility = getAppV2NearbyEligibilitySummary();
const limitations = [
  "Shadow compare is opt-in only and requires shadow=1.",
  "Legacy remains the user-visible nearby source.",
  "app_v2 comparison uses grouped app_v2 output, not a full legacy-compatible shape.",
  "app_v2 applies capacity >= 40 but does not model legacy anvendelseskoder.skal_med.",
  "This route is read-only and does not write telemetry or database state.",
];

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

function validateNearbyRequest(searchParams: URLSearchParams): ValidationResult {
  const errors: string[] = [];
  const latitude = parseNumber(searchParams.get("lat"));
  const longitude = parseNumber(searchParams.get("lng"));
  const radiusMeters = parseInteger(searchParams.get("radius")) ?? defaultRadiusMeters;
  const limit = parseInteger(searchParams.get("limit")) ?? defaultLimit;
  const candidateLimit = parseInteger(searchParams.get("candidateLimit")) ?? defaultCandidateLimit;

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

  if (errors.length > 0 || latitude === null || longitude === null) {
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
    },
  };
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeAddressKey(value: string | null | undefined) {
  return normalizeText(value)
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLegacyAddressKey(row: LegacyNearbyShelter) {
  return normalizeAddressKey(
    row.address || [row.vejnavn, row.husnummer, row.postnummer].filter(Boolean).join(" "),
  );
}

function getAppV2AddressKey(row: AppV2GroupedNearbyShelter) {
  return normalizeAddressKey([row.addressLine1, row.postalCode, row.city].filter(Boolean).join(" "));
}

function summarizeRankOverlap(legacyRows: LegacyNearbyShelter[], appV2Rows: AppV2GroupedNearbyShelter[]) {
  const legacyRanks = new Map<string, number>();
  const appV2Ranks = new Map<string, number>();

  legacyRows.forEach((row, index) => {
    const key = getLegacyAddressKey(row);

    if (key && !legacyRanks.has(key)) {
      legacyRanks.set(key, index + 1);
    }
  });

  appV2Rows.forEach((row, index) => {
    const key = getAppV2AddressKey(row);

    if (key && !appV2Ranks.has(key)) {
      appV2Ranks.set(key, index + 1);
    }
  });

  const shared = Array.from(legacyRanks.entries())
    .flatMap(([key, legacyRank]) => {
      const appV2Rank = appV2Ranks.get(key);

      return appV2Rank
        ? [
            {
              key,
              legacyRank,
              appV2Rank,
              delta: appV2Rank - legacyRank,
            },
          ]
        : [];
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.legacyRank - b.legacyRank);

  return {
    shared,
    exactRankMatches: shared.filter((entry) => entry.delta === 0).length,
    averageAbsRankDelta:
      shared.length === 0 ? 0 : shared.reduce((sum, entry) => sum + Math.abs(entry.delta), 0) / shared.length,
    maxAbsRankDelta: shared.reduce((max, entry) => Math.max(max, Math.abs(entry.delta)), 0),
  };
}

function toLegacyResult(row: LegacyNearbyShelter, index: number) {
  const address = row.address || [row.vejnavn, row.husnummer].filter(Boolean).join(" ") || null;

  return {
    rank: index + 1,
    addressKey: getLegacyAddressKey(row),
    id: row.id,
    address,
    postalCode: row.postnummer,
    municipalityCode: row.kommunekode,
    distanceMeters: row.distance,
    shelterCount: row.shelter_count,
    totalCapacity: row.total_capacity,
    anvendelse: row.anvendelse,
  };
}

function toAppV2Result(row: AppV2GroupedNearbyShelter, index: number) {
  return {
    rank: index + 1,
    addressKey: getAppV2AddressKey(row),
    groupKey: row.groupKey,
    address: {
      line1: row.addressLine1,
      postalCode: row.postalCode,
      city: row.city,
    },
    distanceMeters: row.distanceMeters,
    shelterCount: row.shelterCount,
    totalCapacity: row.totalCapacity,
    municipality: {
      slug: row.municipality.slug,
      name: row.municipality.name,
      code: row.municipality.code,
    },
    representativeShelter: {
      id: row.representativeShelter.id,
      slug: row.representativeShelter.slug,
      capacity: row.representativeShelter.capacity,
      status: row.representativeShelter.status,
      importState: row.representativeShelter.importState,
    },
  };
}

async function readLegacyNearbyShelters(input: {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}): Promise<{ rpcName: string; rows: LegacyNearbyShelter[] }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    throw new Error("Missing public Supabase environment variables for legacy nearby shadow read.");
  }

  const supabase = createClient(url, anonKey, {
    auth: {
      persistSession: false,
    },
    db: {
      schema: "public",
    },
  });
  const shouldUseV3 = process.env.NEXT_PUBLIC_USE_SHELTERS_V3 !== "false";
  let rpcName = shouldUseV3 ? "get_nearby_shelters_v3" : "get_nearby_shelters_v2";
  let response = shouldUseV3
    ? await supabase.rpc("get_nearby_shelters_v3", {
        p_lat: input.latitude,
        p_lng: input.longitude,
        p_radius_meters: input.radiusMeters,
      })
    : await supabase.rpc("get_nearby_shelters_v2", {
        p_lat: input.latitude,
        p_lng: input.longitude,
      });

  if (response.error && shouldUseV3) {
    rpcName = "get_nearby_shelters_v2";
    response = await supabase.rpc("get_nearby_shelters_v2", {
      p_lat: input.latitude,
      p_lng: input.longitude,
    });
  }

  if (response.error) {
    throw new Error(`Could not read legacy nearby shelters through ${rpcName}: ${response.error.message}`);
  }

  return {
    rpcName,
    rows: (response.data ?? []) as LegacyNearbyShelter[],
  };
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
  const requestId = randomUUID();

  if (request.nextUrl.searchParams.get("shadow") !== "1") {
    return errorResponse({
      status: 404,
      code: "shadow_not_enabled",
      message: "Nearby shadow compare is opt-in only. Add shadow=1 to run the read-only comparison.",
      requestId,
    });
  }

  const validation = validateNearbyRequest(request.nextUrl.searchParams);

  if (!validation.ok) {
    return errorResponse({
      status: 400,
      code: "invalid_nearby_shadow_query",
      message: "Invalid nearby shadow query parameters.",
      requestId,
      details: validation.errors,
    });
  }

  try {
    const [legacyResult, appV2Result] = await Promise.all([
      readLegacyNearbyShelters(validation.value),
      getAppV2GroupedNearbySheltersWithDiagnostics({
        latitude: validation.value.latitude,
        longitude: validation.value.longitude,
        radiusMeters: validation.value.radiusMeters,
        limit: validation.value.limit,
        candidateLimit: validation.value.candidateLimit,
        importStates: [...activeImportStates],
      }),
    ]);

    const legacyAddressKeys = new Set(legacyResult.rows.map(getLegacyAddressKey).filter(Boolean));
    const appV2AddressKeys = new Set(appV2Result.rows.map(getAppV2AddressKey).filter(Boolean));
    const sharedAddressKeys = Array.from(legacyAddressKeys).filter((key) => appV2AddressKeys.has(key));
    const legacyOnlyAddressKeys = Array.from(legacyAddressKeys).filter((key) => !appV2AddressKeys.has(key));
    const appV2OnlyAddressKeys = Array.from(appV2AddressKeys).filter((key) => !legacyAddressKeys.has(key));
    const rankOverlap = summarizeRankOverlap(legacyResult.rows, appV2Result.rows);

    return NextResponse.json({
      meta: {
        requestId,
        contract: apiContract,
        source: apiSource,
        mode: "shadow_compare",
        userVisibleSource: "legacy",
        appV2Source: "grouped_app_v2",
        query: validation.value,
        legacy: {
          rpcName: legacyResult.rpcName,
          resultCount: legacyResult.rows.length,
        },
        appV2: {
          resultCount: appV2Result.rows.length,
          eligibility,
          diagnostics: appV2Result.diagnostics,
        },
        limitations,
      },
      comparison: {
        sharedAddressCount: sharedAddressKeys.length,
        legacyOnlyAddressCount: legacyOnlyAddressKeys.length,
        appV2OnlyAddressCount: appV2OnlyAddressKeys.length,
        sharedAddressKeys,
        legacyOnlyAddressKeys,
        appV2OnlyAddressKeys,
        rankOverlap,
        knownSemanticGaps: {
          legacyAnvendelseSkalMed: "unresolved",
          note: "app_v2 shadow comparison applies capacity >= 40 but does not model legacy anvendelseskoder.skal_med.",
        },
      },
      legacyResults: legacyResult.rows.map(toLegacyResult),
      appV2Results: appV2Result.rows.map(toAppV2Result),
    });
  } catch (error) {
    if (isMissingAppV2EnvError(error)) {
      return errorResponse({
        status: 503,
        code: "app_v2_unavailable",
        message: "The app_v2 side of nearby shadow compare is not available in this environment.",
        requestId,
        details: ["Required server-side Supabase app_v2 environment variables are missing."],
      });
    }

    console.error("Failed to run nearby shadow compare:", error);

    return errorResponse({
      status: 502,
      code: "nearby_shadow_compare_failed",
      message: "Could not run nearby shadow comparison.",
      requestId,
    });
  }
}
