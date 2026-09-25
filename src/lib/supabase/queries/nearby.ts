import { createAppV2PublicClient } from "@/lib/app-v2-public";
import { normalizePublicApplicationLabel } from "@/lib/public-labels";
import { getAppV2PublicCountryShelterMarkersInBounds } from "./country-map";
import type { AppV2CountryShelterMarkerBounds } from "./country-map";
import { getBoolean, getInteger, getNullableString, getNumber, getString, isRecord, parseJsonArray } from "./shared";
import type { AppV2ImportState, AppV2MunicipalitySummary, AppV2NearbyEligibilityMode } from "./shared";

export type AppV2NearbyShelter = {
  id: string;
  slug: string;
  name: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  latitude: number;
  longitude: number;
  capacity: number;
  distanceMeters: number;
  sourceApplicationCode: string | null;
  sourceApplicationCodeNearbyEligible: boolean | null;
  municipality: AppV2MunicipalitySummary;
};

export type AppV2GroupedNearbyShelter = {
  groupKey: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  shelterCount: number;
  totalCapacity: number;
  representativeShelter: AppV2NearbyShelter;
  shelters: AppV2NearbyShelter[];
  municipality: AppV2MunicipalitySummary;
  applicationCodeLabel: string | null;
  applicationCodeLabels: string[];
};

export type AppV2NearbyDiagnostics = {
  readModel?: string;
  radiusMeters: number;
  limit: number;
  candidateLimit: number;
  importStates: AppV2ImportState[];
  eligibilityMode?: AppV2NearbyEligibilityMode;
  minimumCapacity?: number;
  sourceApplicationCodeSemantics?: "available" | "unpopulated" | "not_requested";
  sourceApplicationCodeRuleSource?: string;
  sourceApplicationCodeRows?: number;
  sourceApplicationCodeEligibleRows?: number;
  sourceApplicationCodeUnknownRows?: number;
  filteredByEligibility?: number;
  eligibleRows?: number;
  candidateRowsRead: number;
  excludedByAppV2Exclusions: number;
  candidatesWithCoordinates: number;
  candidatesWithinRadius: number;
  returnedRows: number;
  distanceStrategy?: string;
  spatialIndex?: boolean;
  groupedAppV2Shape?: boolean;
  groupingKey?: string;
  sourceReturnedRows?: number;
  groupedRows?: number;
};

export type AppV2NearbySheltersResult = {
  rows: AppV2NearbyShelter[];
  diagnostics: AppV2NearbyDiagnostics;
};

export type AppV2GroupedNearbySheltersResult = {
  rows: AppV2GroupedNearbyShelter[];
  diagnostics: AppV2NearbyDiagnostics;
};

export type AppV2NearbySheltersOptions = {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  limit?: number;
  candidateLimit?: number;
  importStates?: AppV2ImportState[];
};

type AppV2NearbyRpcPayload = {
  results: unknown;
  diagnostics: unknown;
};

const defaultNearbyRadiusMeters = 50_000;
const defaultNearbyLimit = 10;
const defaultNearbyCandidateLimit = 500;
const defaultNearbyImportStates: AppV2ImportState[] = ["active"];
const defaultNearbyEligibilityMode: AppV2NearbyEligibilityMode = "source_application_code_v1";
const nearbyMinimumCapacity = 40;
const sourceApplicationCodeRuleSource = "app_v2.application_code_eligibility";
const allowedImportStates: AppV2ImportState[] = ["active", "missing_from_source", "suppressed"];

function assertValidCoordinate(input: AppV2NearbySheltersOptions) {
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) {
    throw new Error("Nearby app_v2 query requires latitude between -90 and 90.");
  }

  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    throw new Error("Nearby app_v2 query requires longitude between -180 and 180.");
  }
}

function getNearbyImportStates(input: AppV2NearbySheltersOptions) {
  const importStates = Array.from(new Set(input.importStates ?? defaultNearbyImportStates));

  if (importStates.length === 0) {
    throw new Error("Nearby app_v2 query requires at least one import state.");
  }

  const invalidStates = importStates.filter((state) => !allowedImportStates.includes(state));

  if (invalidStates.length > 0) {
    throw new Error(`Nearby app_v2 query received unsupported import states: ${invalidStates.join(", ")}.`);
  }

  return importStates;
}

function normalizeNearbyRpcRow(value: unknown): AppV2NearbyShelter {
  if (!isRecord(value)) {
    throw new Error("app_v2 nearby RPC returned an invalid result row.");
  }

  const latitude = getNumber(value.latitude, "latitude");
  const longitude = getNumber(value.longitude, "longitude");

  return {
    id: getString(value.id, "id"),
    slug: getString(value.slug, "slug"),
    name: getString(value.name, "name"),
    addressLine1: getString(value.address_line1, "address_line1"),
    postalCode: getString(value.postal_code, "postal_code"),
    city: getString(value.city, "city"),
    latitude,
    longitude,
    capacity: getInteger(value.capacity, "capacity"),
    distanceMeters: getNumber(value.distance_meters, "distance_meters"),
    sourceApplicationCode: getNullableString(value.source_application_code, "source_application_code"),
    sourceApplicationCodeNearbyEligible:
      value.source_application_code_nearby_eligible === undefined || value.source_application_code_nearby_eligible === null
        ? null
        : getBoolean(value.source_application_code_nearby_eligible, "source_application_code_nearby_eligible"),
    municipality: {
      id: getString(value.municipality_id, "municipality_id"),
      code: getNullableString(value.municipality_code, "municipality_code"),
      slug: getString(value.municipality_slug, "municipality_slug"),
      name: getString(value.municipality_name, "municipality_name"),
      regionName: getNullableString(value.municipality_region_name, "municipality_region_name"),
      activeShelterCount: 0,
      activeShelterTotalCapacity: 0,
    },
  };
}

function normalizeNearbyDiagnostics(value: unknown): AppV2NearbyDiagnostics {
  if (!isRecord(value)) {
    throw new Error("app_v2 nearby RPC returned invalid diagnostics.");
  }

  const rawImportStates = parseJsonArray(value.importStates, "diagnostics.importStates");

  return {
    readModel: getNullableString(value.readModel, "diagnostics.readModel") ?? undefined,
    radiusMeters: getInteger(value.radiusMeters, "diagnostics.radiusMeters"),
    limit: getInteger(value.limit, "diagnostics.limit"),
    candidateLimit: getInteger(value.candidateLimit, "diagnostics.candidateLimit"),
    importStates: rawImportStates.map((state) => getString(state, "diagnostics.importStates")) as AppV2ImportState[],
    eligibilityMode:
      value.eligibilityMode === undefined
        ? undefined
        : (getString(value.eligibilityMode, "diagnostics.eligibilityMode") as AppV2NearbyEligibilityMode),
    minimumCapacity:
      value.minimumCapacity === undefined
        ? undefined
        : getInteger(value.minimumCapacity, "diagnostics.minimumCapacity"),
    sourceApplicationCodeSemantics:
      value.sourceApplicationCodeSemantics === undefined
        ? undefined
        : (getString(
            value.sourceApplicationCodeSemantics,
            "diagnostics.sourceApplicationCodeSemantics",
          ) as "available" | "unpopulated" | "not_requested"),
    sourceApplicationCodeRuleSource:
      value.sourceApplicationCodeRuleSource === undefined
        ? undefined
        : getString(value.sourceApplicationCodeRuleSource, "diagnostics.sourceApplicationCodeRuleSource"),
    sourceApplicationCodeRows:
      value.sourceApplicationCodeRows === undefined
        ? undefined
        : getInteger(value.sourceApplicationCodeRows, "diagnostics.sourceApplicationCodeRows"),
    sourceApplicationCodeEligibleRows:
      value.sourceApplicationCodeEligibleRows === undefined
        ? undefined
        : getInteger(value.sourceApplicationCodeEligibleRows, "diagnostics.sourceApplicationCodeEligibleRows"),
    sourceApplicationCodeUnknownRows:
      value.sourceApplicationCodeUnknownRows === undefined
        ? undefined
        : getInteger(value.sourceApplicationCodeUnknownRows, "diagnostics.sourceApplicationCodeUnknownRows"),
    filteredByEligibility:
      value.filteredByEligibility === undefined
        ? undefined
        : getInteger(value.filteredByEligibility, "diagnostics.filteredByEligibility"),
    eligibleRows:
      value.eligibleRows === undefined ? undefined : getInteger(value.eligibleRows, "diagnostics.eligibleRows"),
    candidateRowsRead: getInteger(value.candidateRowsRead, "diagnostics.candidateRowsRead"),
    excludedByAppV2Exclusions: getInteger(
      value.excludedByAppV2Exclusions,
      "diagnostics.excludedByAppV2Exclusions",
    ),
    candidatesWithCoordinates: getInteger(value.candidatesWithCoordinates, "diagnostics.candidatesWithCoordinates"),
    candidatesWithinRadius: getInteger(value.candidatesWithinRadius, "diagnostics.candidatesWithinRadius"),
    returnedRows: getInteger(value.returnedRows, "diagnostics.returnedRows"),
    distanceStrategy: getNullableString(value.distanceStrategy, "diagnostics.distanceStrategy") ?? undefined,
    spatialIndex:
      value.spatialIndex === undefined ? undefined : getBoolean(value.spatialIndex, "diagnostics.spatialIndex"),
    groupedAppV2Shape:
      value.groupedAppV2Shape === undefined
        ? undefined
        : getBoolean(value.groupedAppV2Shape, "diagnostics.groupedAppV2Shape"),
  };
}

/** Source-application-code eligibility (capacity + eligible code), matching DB view rules. */
function applySourceApplicationCodeNearbyEligibility(rows: AppV2NearbyShelter[]) {
  const capacityEligibleRows = rows.filter((row) => row.capacity >= nearbyMinimumCapacity);
  const sourceApplicationCodeRows = rows.filter((row) => row.sourceApplicationCode).length;
  const eligibleRows = capacityEligibleRows.filter((row) => row.sourceApplicationCodeNearbyEligible === true);
  const sourceApplicationCodeUnknownRows = capacityEligibleRows.filter(
    (row) => !row.sourceApplicationCode || row.sourceApplicationCodeNearbyEligible === null,
  ).length;

  return {
    rows: eligibleRows,
    minimumCapacity: nearbyMinimumCapacity,
    filteredByEligibility: rows.length - eligibleRows.length,
    sourceApplicationCodeRows,
    sourceApplicationCodeEligibleRows: eligibleRows.length,
    sourceApplicationCodeUnknownRows,
    sourceApplicationCodeSemantics: sourceApplicationCodeRows > 0 ? ("available" as const) : ("unpopulated" as const),
  };
}

function normalizeNearbyAddressPart(value: string) {
  return value.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
}

function getNearbyGroupKey(row: AppV2NearbyShelter) {
  return [row.addressLine1, row.postalCode, row.city].map(normalizeNearbyAddressPart).join(" ");
}

function groupNearbyRows(
  rows: AppV2NearbyShelter[],
  limit: number,
  labelByCode: Map<string, string>,
): AppV2GroupedNearbyShelter[] {
  const groups = new Map<string, AppV2NearbyShelter[]>();

  for (const row of rows) {
    const key = getNearbyGroupKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return Array.from(groups.entries())
    .map(([groupKey, groupRows]) => {
      const sortedRows = [...groupRows].sort((a, b) => a.distanceMeters - b.distanceMeters || a.slug.localeCompare(b.slug));
      const representativeShelter = sortedRows[0];

      if (!representativeShelter) {
        throw new Error("app_v2 nearby grouping received an empty group.");
      }

      const applicationCodeLabels = Array.from(new Set(
        sortedRows
          .map((row) => row.sourceApplicationCode ? (labelByCode.get(row.sourceApplicationCode) ?? null) : null)
          .filter((label): label is string => Boolean(label)),
      )).sort((a, b) => a.localeCompare(b, "da-DK"));

      return {
        groupKey,
        addressLine1: representativeShelter.addressLine1,
        postalCode: representativeShelter.postalCode,
        city: representativeShelter.city,
        latitude: representativeShelter.latitude,
        longitude: representativeShelter.longitude,
        distanceMeters: representativeShelter.distanceMeters,
        shelterCount: sortedRows.length,
        totalCapacity: sortedRows.reduce((sum, row) => sum + row.capacity, 0),
        representativeShelter,
        shelters: sortedRows,
        municipality: representativeShelter.municipality,
        applicationCodeLabel: applicationCodeLabels.length > 1
          ? "Flere registrerede bygningsanvendelser"
          : (applicationCodeLabels[0] ?? null),
        applicationCodeLabels,
      };
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters || a.groupKey.localeCompare(b.groupKey))
    .slice(0, limit);
}

async function getAppV2NearbySheltersWithDiagnostics(
  options: AppV2NearbySheltersOptions,
): Promise<AppV2NearbySheltersResult> {
  assertValidCoordinate(options);

  const supabase = createAppV2PublicClient();
  const radiusMeters = options.radiusMeters ?? defaultNearbyRadiusMeters;
  const limit = options.limit ?? defaultNearbyLimit;
  const candidateLimit = options.candidateLimit ?? defaultNearbyCandidateLimit;
  const importStates = getNearbyImportStates(options);
  const eligibilityMode = defaultNearbyEligibilityMode;

  if (importStates.length !== 1 || importStates[0] !== "active") {
    throw new Error("Public nearby app_v2 reads support only the active import state.");
  }

  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
    throw new Error("Nearby app_v2 query requires a positive radiusMeters value.");
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("Nearby app_v2 query requires a positive integer limit.");
  }

  if (!Number.isInteger(candidateLimit) || candidateLimit <= 0) {
    throw new Error("Nearby app_v2 query requires a positive integer candidateLimit.");
  }

  if (candidateLimit < limit) {
    throw new Error("Nearby app_v2 query requires candidateLimit to be greater than or equal to limit.");
  }

  const rpcLimit = candidateLimit;
  const { data, error } = await supabase.rpc("get_nearby_shelters_public_v2", {
    p_lat: options.latitude,
    p_lng: options.longitude,
    p_radius_meters: radiusMeters,
    p_limit: rpcLimit,
    p_candidate_limit: candidateLimit,
  });

  if (error) {
    throw new Error("Could not load app_v2 nearby shelters through database RPC.");
  }

  const payload = Array.isArray(data) ? (data[0] as AppV2NearbyRpcPayload | undefined) : undefined;

  if (!payload) {
    throw new Error("app_v2 nearby database RPC did not return a payload.");
  }

  const sourceRows = parseJsonArray(payload.results, "results").map(normalizeNearbyRpcRow);
  const eligibility = applySourceApplicationCodeNearbyEligibility(sourceRows);
  const rows = eligibility.rows.slice(0, limit);
  const baseDiagnostics = normalizeNearbyDiagnostics(payload.diagnostics);
  return {
    rows,
    diagnostics: {
      ...baseDiagnostics,
      limit,
      returnedRows: rows.length,
      eligibilityMode,
      minimumCapacity: eligibility.minimumCapacity ?? undefined,
      sourceApplicationCodeSemantics: eligibility.sourceApplicationCodeSemantics,
      sourceApplicationCodeRuleSource,
      sourceApplicationCodeRows: eligibility.sourceApplicationCodeRows,
      sourceApplicationCodeEligibleRows: eligibility.sourceApplicationCodeEligibleRows,
      sourceApplicationCodeUnknownRows: eligibility.sourceApplicationCodeUnknownRows,
      filteredByEligibility: eligibility.filteredByEligibility,
      eligibleRows: eligibility.rows.length,
      sourceReturnedRows: sourceRows.length,
    },
  };
}

export async function getAppV2GroupedNearbySheltersWithDiagnostics(
  options: AppV2NearbySheltersOptions,
): Promise<AppV2GroupedNearbySheltersResult> {
  const groupLimit = options.limit ?? defaultNearbyLimit;
  const rowFetchLimit = options.candidateLimit ?? defaultNearbyCandidateLimit;

  if (!Number.isInteger(groupLimit) || groupLimit <= 0) {
    throw new Error("Grouped nearby app_v2 query requires a positive integer limit.");
  }

  if (!Number.isInteger(rowFetchLimit) || rowFetchLimit <= 0) {
    throw new Error("Grouped nearby app_v2 query requires a positive integer candidateLimit.");
  }

  if (rowFetchLimit < groupLimit) {
    throw new Error("Grouped nearby app_v2 query requires candidateLimit to be greater than or equal to limit.");
  }

  const rowResult = await getAppV2NearbySheltersWithDiagnostics({
    ...options,
    limit: rowFetchLimit,
    candidateLimit: rowFetchLimit,
  });

  // Fetch labels for all unique application codes in one DB round-trip
  const uniqueCodes = Array.from(
    new Set(rowResult.rows.map((r) => r.sourceApplicationCode).filter((c): c is string => c !== null)),
  );
  const labelByCode = new Map<string, string>();
  if (uniqueCodes.length > 0) {
    const labelClient = createAppV2PublicClient();
    const { data: labelRows, error: labelError } = await labelClient
      .from("application_code_public")
      .select("application_code, label")
      .in("application_code", uniqueCodes);
    if (labelError) {
      throw new Error(`Could not load app_v2 nearby application code labels: ${labelError.message}`);
    }
    for (const row of (labelRows ?? []) as Array<{ application_code: string; label: string | null }>) {
      if (row.label) labelByCode.set(row.application_code, normalizePublicApplicationLabel(row.label));
    }
  }

  const groupedRows = groupNearbyRows(rowResult.rows, groupLimit, labelByCode);

  return {
    rows: groupedRows,
    diagnostics: {
      ...rowResult.diagnostics,
      limit: groupLimit,
      returnedRows: groupedRows.length,
      groupedAppV2Shape: true,
      groupingKey: "address_line1 + postal_code + city",
      sourceReturnedRows: rowResult.diagnostics.sourceReturnedRows ?? rowResult.rows.length,
      eligibleRows: rowResult.rows.length,
      groupedRows: groupedRows.length,
    },
  };
}

/**
 * Public registrations inside one nearby tile plus the building-use labels
 * they reference (ARCH-01). Uses the same public view as the national map,
 * which is the source of get_nearby_shelters_public_v2.
 */
export async function getAppV2PublicNearbyTile(bounds: AppV2CountryShelterMarkerBounds) {
  const { markers } = await getAppV2PublicCountryShelterMarkersInBounds(bounds);
  const uniqueCodes = Array.from(
    new Set(markers.map((marker) => marker.sourceApplicationCode).filter((code): code is string => code !== null)),
  );
  const labels: Record<string, string> = {};

  if (uniqueCodes.length > 0) {
    const { data, error } = await createAppV2PublicClient()
      .from("application_code_public")
      .select("application_code, label")
      .in("application_code", uniqueCodes);
    if (error) {
      throw new Error(`Could not load app_v2 nearby tile labels: ${error.message}`);
    }
    for (const row of (data ?? []) as Array<{ application_code: string; label: string | null }>) {
      if (row.label) labels[row.application_code] = normalizePublicApplicationLabel(row.label);
    }
  }

  return { markers, labels };
}
