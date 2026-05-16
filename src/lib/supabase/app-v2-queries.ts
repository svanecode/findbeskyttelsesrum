import { getMunicipalitySlugCandidates, normalizeMunicipalityDisplay } from "@/lib/municipalities/metadata";
import { createAppV2PublicClient } from "@/lib/app-v2-public";
import { createAppV2AdminClient } from "@/lib/supabase/app-v2";

export type AppV2ShelterStatus = "active" | "temporarily_closed" | "under_review";
export type AppV2ImportState = "active" | "missing_from_source" | "suppressed";
export type AppV2NearbyEligibilityMode = "legacy_capacity_v1" | "source_application_code_v1" | "none";
type AppV2ImportRunStatus = "running" | "succeeded" | "failed";

type MunicipalityRow = {
  id: string;
  code: string | null;
  slug: string;
  name: string;
  description: string | null;
  region_name: string | null;
};

type ShelterRow = {
  id: string;
  municipality_id: string;
  slug: string;
  name: string;
  address_line1: string;
  postal_code: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  capacity: number;
  status: AppV2ShelterStatus;
  accessibility_notes: string | null;
  summary: string;
  source_summary: string;
  import_state: AppV2ImportState;
  last_seen_at: string | null;
  last_imported_at: string | null;
  canonical_source_name: string | null;
  canonical_source_reference: string | null;
  source_application_code: string | null;
};

type ImportRunRow = {
  id: string;
  source_name: string;
  source_url: string | null;
  status: AppV2ImportRunStatus;
  records_seen: number;
  records_upserted: number;
  started_at: string;
  finished_at: string | null;
  error_summary: string | null;
  pages_fetched: number;
  last_successful_page: number | null;
  last_successful_cursor: string | null;
  resumed_from_import_run_id: string | null;
  missing_transitions_applied: boolean;
  missing_transitions_skipped_reason: string | null;
};

export type AppV2MunicipalitySummary = {
  id: string;
  code: string | null;
  slug: string;
  name: string;
  regionName: string | null;
  activeShelterCount: number;
  activeShelterTotalCapacity: number;
};

export type AppV2MunicipalityDetail = AppV2MunicipalitySummary & {
  description: string | null;
};

export type AppV2MunicipalityShelterStats = {
  activeShelterCount: number;
  totalCapacity: number;
  postalAreaCount: number;
  largestCapacity: number | null;
  latestSeenAt: string | null;
  postalAreas: Array<{
    postalCode: string;
    city: string;
    activeShelterCount: number;
    totalCapacity: number;
  }>;
};

export type AppV2ShelterDetail = {
  id: string;
  slug: string;
  name: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  capacity: number;
  status: AppV2ShelterStatus;
  sourceApplicationCode: string | null;
  accessibilityNotes: string | null;
  summary: string;
  sourceSummary: string;
  importState: AppV2ImportState;
  lastSeenAt: string | null;
  lastImportedAt: string | null;
  canonicalSourceName: string | null;
  canonicalSourceReference: string | null;
  municipality: AppV2MunicipalityDetail;
};

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
  status: AppV2ShelterStatus;
  importState: AppV2ImportState;
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
  statuses: AppV2ShelterStatus[];
  importStates: AppV2ImportState[];
  applicationCodeLabel: string | null;
};

export type AppV2NearbyDiagnostics = {
  readModel?: string;
  radiusMeters: number;
  limit: number;
  candidateLimit: number;
  importStates: AppV2ImportState[];
  eligibilityMode?: AppV2NearbyEligibilityMode;
  minimumCapacity?: number;
  legacyAnvendelseSemantics?: "unresolved" | "modeled_by_source_application_code";
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
  groupedLegacyShape?: boolean;
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

export type AppV2ImportRunSummary = {
  id: string;
  sourceName: string;
  sourceUrl: string | null;
  status: AppV2ImportRunStatus;
  recordsSeen: number;
  recordsUpserted: number;
  startedAt: string;
  finishedAt: string | null;
  errorSummary: string | null;
  pagesFetched: number;
  lastSuccessfulPage: number | null;
  lastSuccessfulCursor: string | null;
  resumedFromImportRunId: string | null;
  missingTransitionsApplied: boolean;
  missingTransitionsSkippedReason: string | null;
};

type ShelterCountOptions = {
  includeMissing?: boolean;
};

export type AppV2NearbySheltersOptions = {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  limit?: number;
  candidateLimit?: number;
  importStates?: AppV2ImportState[];
};

export type AppV2NearbyEligibilitySummary = {
  mode: AppV2NearbyEligibilityMode;
  minimumCapacity: number | null;
  legacyCapacityThreshold: boolean;
  sourceApplicationCodeRequired: boolean;
  sourceApplicationCodeSemantics: "available" | "unpopulated" | "not_requested";
  legacyAnvendelseSemantics: "unresolved" | "modeled_by_source_application_code";
  note: string;
};

type AppV2NearbyRpcPayload = {
  results: unknown;
  diagnostics: unknown;
};

const shelterCapacityPageSize = 1000;
const municipalityStatsPageSize = 1000;
const defaultNearbyRadiusMeters = 50_000;
const defaultNearbyLimit = 10;
const defaultNearbyCandidateLimit = 500;
const defaultNearbyImportStates: AppV2ImportState[] = ["active"];
const defaultNearbyEligibilityMode: AppV2NearbyEligibilityMode = "source_application_code_v1";
const legacyNearbyMinimumCapacity = 40;
const sourceApplicationCodeRuleSource = "app_v2.application_code_eligibility";
const sourceApplicationCodeLookupChunkSize = 100;
const allowedImportStates: AppV2ImportState[] = ["active", "missing_from_source", "suppressed"];

function normalizeMunicipality(
  row: MunicipalityRow,
  stats: { activeShelterCount: number; activeShelterTotalCapacity: number },
): AppV2MunicipalityDetail {
  const display = normalizeMunicipalityDisplay({
    id: row.id,
    slug: row.slug,
    name: row.name,
  });

  return {
    id: row.id,
    code: row.code,
    slug: display.slug,
    name: display.name,
    description: row.description,
    regionName: row.region_name,
    activeShelterCount: stats.activeShelterCount,
    activeShelterTotalCapacity: stats.activeShelterTotalCapacity,
  };
}

function normalizeImportRun(row: ImportRunRow): AppV2ImportRunSummary {
  return {
    id: row.id,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    status: row.status,
    recordsSeen: row.records_seen,
    recordsUpserted: row.records_upserted,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorSummary: row.error_summary,
    pagesFetched: row.pages_fetched,
    lastSuccessfulPage: row.last_successful_page,
    lastSuccessfulCursor: row.last_successful_cursor,
    resumedFromImportRunId: row.resumed_from_import_run_id,
    missingTransitionsApplied: row.missing_transitions_applied,
    missingTransitionsSkippedReason: row.missing_transitions_skipped_reason,
  };
}

function normalizeShelter(row: ShelterRow, municipality: AppV2MunicipalityDetail): AppV2ShelterDetail {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    addressLine1: row.address_line1,
    postalCode: row.postal_code,
    city: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
    capacity: row.capacity,
    status: row.status,
    sourceApplicationCode: row.source_application_code,
    accessibilityNotes: row.accessibility_notes,
    summary: row.summary,
    sourceSummary: row.source_summary,
    importState: row.import_state,
    lastSeenAt: row.last_seen_at,
    lastImportedAt: row.last_imported_at,
    canonicalSourceName: row.canonical_source_name,
    canonicalSourceReference: row.canonical_source_reference,
    municipality,
  };
}

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

export function getAppV2NearbyEligibilitySummary(
  mode: AppV2NearbyEligibilityMode = defaultNearbyEligibilityMode,
): AppV2NearbyEligibilitySummary {
  if (mode === "none") {
    return {
      mode,
      minimumCapacity: null,
      legacyCapacityThreshold: false,
      sourceApplicationCodeRequired: false,
      sourceApplicationCodeSemantics: "not_requested",
      legacyAnvendelseSemantics: "unresolved",
      note: "No app_v2 nearby eligibility filtering is applied beyond import_state, coordinates, radius, and active app_v2 exclusions.",
    };
  }

  if (mode === "source_application_code_v1") {
    return {
      mode,
      minimumCapacity: legacyNearbyMinimumCapacity,
      legacyCapacityThreshold: true,
      sourceApplicationCodeRequired: true,
      sourceApplicationCodeSemantics: "available",
      legacyAnvendelseSemantics: "modeled_by_source_application_code",
      note: "Applies capacity >= 40 and requires a source-backed application code that app_v2.application_code_eligibility marks as nearby eligible. Rows without source_application_code are excluded in this mode.",
    };
  }

  return {
    mode,
    minimumCapacity: legacyNearbyMinimumCapacity,
    legacyCapacityThreshold: true,
    sourceApplicationCodeRequired: false,
    sourceApplicationCodeSemantics: "not_requested",
    legacyAnvendelseSemantics: "unresolved",
    note: "Applies the legacy nearby capacity threshold of capacity >= 40 before grouping. Legacy anvendelseskoder.skal_med is not modeled yet.",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown, fieldName: string) {
  if (typeof value !== "string") {
    throw new Error(`app_v2 nearby RPC returned invalid ${fieldName}.`);
  }

  return value;
}

function getNullableString(value: unknown, fieldName: string) {
  if (value === null || value === undefined) {
    return null;
  }

  return getString(value, fieldName);
}

function getNumber(value: unknown, fieldName: string) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  if (!Number.isFinite(numberValue)) {
    throw new Error(`app_v2 nearby RPC returned invalid ${fieldName}.`);
  }

  return numberValue;
}

function getInteger(value: unknown, fieldName: string) {
  const numberValue = getNumber(value, fieldName);

  if (!Number.isInteger(numberValue)) {
    throw new Error(`app_v2 nearby RPC returned invalid ${fieldName}.`);
  }

  return numberValue;
}

function getBoolean(value: unknown, fieldName: string) {
  if (typeof value !== "boolean") {
    throw new Error(`app_v2 nearby RPC returned invalid ${fieldName}.`);
  }

  return value;
}

function parseJsonArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new Error(`app_v2 nearby RPC returned invalid ${fieldName}.`);
  }

  return value;
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
    status: getString(value.status, "status") as AppV2ShelterStatus,
    importState: getString(value.import_state, "import_state") as AppV2ImportState,
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
    legacyAnvendelseSemantics:
      value.legacyAnvendelseSemantics === undefined
        ? undefined
        : (getString(
            value.legacyAnvendelseSemantics,
            "diagnostics.legacyAnvendelseSemantics",
          ) as "unresolved" | "modeled_by_source_application_code"),
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
    groupedLegacyShape:
      value.groupedLegacyShape === undefined
        ? undefined
        : getBoolean(value.groupedLegacyShape, "diagnostics.groupedLegacyShape"),
  };
}

async function attachSourceApplicationCodeEligibility(rows: AppV2NearbyShelter[]) {
  if (rows.length === 0) {
    return rows;
  }

  const supabase = createAppV2AdminClient();
  const ids = rows.map((row) => row.id);
  const shelterRows: Array<{ id: string; source_application_code: string | null }> = [];

  for (let index = 0; index < ids.length; index += sourceApplicationCodeLookupChunkSize) {
    const chunk = ids.slice(index, index + sourceApplicationCodeLookupChunkSize);
    const { data, error } = await supabase.from("shelters").select("id, source_application_code").in("id", chunk);

    if (error) {
      throw new Error(`Could not load app_v2 source application codes for nearby eligibility: ${error.message}`);
    }

    shelterRows.push(...((data ?? []) as Array<{ id: string; source_application_code: string | null }>));
  }

  const sourceCodeById = new Map(
    shelterRows.map((row) => [row.id, row.source_application_code]),
  );
  const sourceCodes = Array.from(new Set(Array.from(sourceCodeById.values()).filter((code): code is string => Boolean(code))));
  const eligibilityByCode = new Map<string, boolean>();

  if (sourceCodes.length > 0) {
    const { data: eligibilityRows, error: eligibilityError } = await supabase
      .from("application_code_eligibility")
      .select("application_code, is_nearby_eligible")
      .eq("source_name", "datafordeler-bbr-dar")
      .in("application_code", sourceCodes);

    if (eligibilityError) {
      throw new Error(`Could not load app_v2 application-code nearby eligibility rules: ${eligibilityError.message}`);
    }

    for (const row of (eligibilityRows ?? []) as Array<{ application_code: string; is_nearby_eligible: boolean }>) {
      eligibilityByCode.set(row.application_code, row.is_nearby_eligible);
    }
  }

  return rows.map((row) => {
    const sourceApplicationCode = sourceCodeById.get(row.id) ?? null;

    return {
      ...row,
      sourceApplicationCode,
      sourceApplicationCodeNearbyEligible: sourceApplicationCode
        ? eligibilityByCode.get(sourceApplicationCode) ?? null
        : null,
    };
  });
}

/** Source-application-code eligibility (capacity + eligible code), matching DB view rules. */
function applySourceApplicationCodeNearbyEligibility(rows: AppV2NearbyShelter[]) {
  const capacityEligibleRows = rows.filter((row) => row.capacity >= legacyNearbyMinimumCapacity);
  const sourceApplicationCodeRows = rows.filter((row) => row.sourceApplicationCode).length;
  const eligibleRows = capacityEligibleRows.filter((row) => row.sourceApplicationCodeNearbyEligible === true);
  const sourceApplicationCodeUnknownRows = capacityEligibleRows.filter(
    (row) => !row.sourceApplicationCode || row.sourceApplicationCodeNearbyEligible === null,
  ).length;

  return {
    rows: eligibleRows,
    minimumCapacity: legacyNearbyMinimumCapacity,
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

function uniqueValues<TValue extends string>(values: TValue[]) {
  return Array.from(new Set(values)).sort();
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

      const dominantCode = representativeShelter.sourceApplicationCode;

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
        statuses: uniqueValues(sortedRows.map((row) => row.status)),
        importStates: uniqueValues(sortedRows.map((row) => row.importState)),
        applicationCodeLabel: dominantCode ? (labelByCode.get(dominantCode) ?? null) : null,
      };
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters || a.groupKey.localeCompare(b.groupKey))
    .slice(0, limit);
}

type PublicShelterMunicipalityAggregate = {
  activeShelterCount: number;
  totalCapacity: number;
};

async function getPublicShelterAggregatesByMunicipalityId(): Promise<
  Map<string, PublicShelterMunicipalityAggregate>
> {
  const supabase = createAppV2PublicClient();
  const aggregates = new Map<string, PublicShelterMunicipalityAggregate>();
  let from = 0;

  while (true) {
    const to = from + municipalityStatsPageSize - 1;
    const { data, error } = await supabase
      .from("shelter_public")
      .select("municipality_id, capacity")
      .range(from, to);

    if (error) {
      throw new Error(`Could not load app_v2 public shelter aggregates: ${error.message}`);
    }

    const rows = (data ?? []) as Array<{ municipality_id: string; capacity: number | null }>;

    for (const row of rows) {
      const current = aggregates.get(row.municipality_id) ?? {
        activeShelterCount: 0,
        totalCapacity: 0,
      };
      current.activeShelterCount += 1;
      current.totalCapacity += row.capacity ?? 0;
      aggregates.set(row.municipality_id, current);
    }

    if (rows.length < municipalityStatsPageSize) {
      break;
    }

    from += municipalityStatsPageSize;
  }

  return aggregates;
}

function getPublicShelterStatsForMunicipality(
  aggregates: Map<string, PublicShelterMunicipalityAggregate>,
  municipalityId: string,
) {
  const stats = aggregates.get(municipalityId);
  return {
    activeShelterCount: stats?.activeShelterCount ?? 0,
    activeShelterTotalCapacity: stats?.totalCapacity ?? 0,
  };
}

async function getActiveShelterCountByMunicipalityId(municipalityId: string) {
  const supabase = createAppV2PublicClient();
  const { count, error } = await supabase
    .from("shelter_public")
    .select("id", { count: "exact", head: true })
    .eq("municipality_id", municipalityId);

  if (error) {
    console.warn(
      `Could not count public app_v2 shelters for municipality "${municipalityId}": ${error.message}`,
    );
    return 0;
  }

  return count ?? 0;
}

export async function getAppV2ShelterCount(options: ShelterCountOptions = {}) {
  const supabase = createAppV2AdminClient();
  const query = supabase.from("shelters").select("id", { count: "exact", head: true });
  const scopedQuery = options.includeMissing ? query : query.eq("import_state", "active");
  const { count, error } = await scopedQuery;

  if (error) {
    console.warn(`Could not count app_v2 shelters: ${error.message}`);
    return 0;
  }

  return count ?? 0;
}

export async function getAppV2TotalShelterCapacity() {
  const supabase = createAppV2AdminClient();
  let totalCapacity = 0;
  let from = 0;

  while (true) {
    const to = from + shelterCapacityPageSize - 1;
    const { data, error } = await supabase
      .from("shelters")
      .select("capacity")
      .eq("import_state", "active")
      .range(from, to);

    if (error) {
      throw new Error("Could not load app_v2 shelter capacity.");
    }

    const rows = (data ?? []) as Array<{ capacity: number | null }>;

    for (const row of rows) {
      totalCapacity += row.capacity ?? 0;
    }

    if (rows.length < shelterCapacityPageSize) {
      break;
    }

    from += shelterCapacityPageSize;
  }

  return totalCapacity;
}

export async function getLatestAppV2ImportRun(sourceName?: string) {
  const supabase = createAppV2AdminClient();
  let query = supabase
    .from("import_runs")
    .select(
      "id, source_name, source_url, status, records_seen, records_upserted, started_at, finished_at, error_summary, pages_fetched, last_successful_page, last_successful_cursor, resumed_from_import_run_id, missing_transitions_applied, missing_transitions_skipped_reason",
    )
    .order("started_at", { ascending: false })
    .limit(1);

  if (sourceName) {
    query = query.eq("source_name", sourceName);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error("Could not load latest app_v2 import run.");
  }

  return data ? normalizeImportRun(data as ImportRunRow) : null;
}

async function getAppV2NearbySheltersWithDiagnostics(
  options: AppV2NearbySheltersOptions,
): Promise<AppV2NearbySheltersResult> {
  assertValidCoordinate(options);

  const supabase = createAppV2AdminClient();
  const radiusMeters = options.radiusMeters ?? defaultNearbyRadiusMeters;
  const limit = options.limit ?? defaultNearbyLimit;
  const candidateLimit = options.candidateLimit ?? defaultNearbyCandidateLimit;
  const importStates = getNearbyImportStates(options);
  const eligibilityMode = defaultNearbyEligibilityMode;

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
  const { data, error } = await supabase.rpc("get_nearby_shelters", {
    p_lat: options.latitude,
    p_lng: options.longitude,
    p_radius_meters: radiusMeters,
    p_limit: rpcLimit,
    p_candidate_limit: candidateLimit,
    p_import_states: importStates,
  });

  if (error) {
    throw new Error("Could not load app_v2 nearby shelters through database RPC.");
  }

  const payload = Array.isArray(data) ? (data[0] as AppV2NearbyRpcPayload | undefined) : undefined;

  if (!payload) {
    throw new Error("app_v2 nearby database RPC did not return a payload.");
  }

  const sourceRows = parseJsonArray(payload.results, "results").map(normalizeNearbyRpcRow);
  const sourceRowsWithEligibility = await attachSourceApplicationCodeEligibility(sourceRows);
  const eligibility = applySourceApplicationCodeNearbyEligibility(sourceRowsWithEligibility);
  const rows = eligibility.rows.slice(0, limit);
  const baseDiagnostics = normalizeNearbyDiagnostics(payload.diagnostics);
  const eligibilitySummary = getAppV2NearbyEligibilitySummary(eligibilityMode);

  return {
    rows,
    diagnostics: {
      ...baseDiagnostics,
      limit,
      returnedRows: rows.length,
      eligibilityMode,
      minimumCapacity: eligibility.minimumCapacity ?? undefined,
      legacyAnvendelseSemantics: eligibilitySummary.legacyAnvendelseSemantics,
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
    const labelClient = createAppV2AdminClient();
    const { data: labelRows } = await labelClient
      .from("application_code_eligibility")
      .select("application_code, label")
      .eq("source_name", "datafordeler-bbr-dar")
      .in("application_code", uniqueCodes);
    for (const row of (labelRows ?? []) as Array<{ application_code: string; label: string | null }>) {
      if (row.label) labelByCode.set(row.application_code, row.label);
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
      groupedLegacyShape: false,
      groupingKey: "address_line1 + postal_code + city",
      sourceReturnedRows: rowResult.diagnostics.sourceReturnedRows ?? rowResult.rows.length,
      eligibleRows: rowResult.rows.length,
      groupedRows: groupedRows.length,
    },
  };
}

export async function getAppV2MunicipalitySummaries() {
  const supabase = createAppV2AdminClient();
  const { data, error } = await supabase
    .from("municipalities")
    .select("id, code, slug, name, description, region_name")
    .order("name", { ascending: true });

  if (error) {
    throw new Error("Could not load app_v2 municipalities.");
  }

  const rows = (data ?? []) as MunicipalityRow[];
  const aggregates = await getPublicShelterAggregatesByMunicipalityId();

  return rows.map((row) => normalizeMunicipality(row, getPublicShelterStatsForMunicipality(aggregates, row.id)));
}

export async function getAppV2MunicipalitySlugs() {
  const supabase = createAppV2AdminClient();
  const { data, error } = await supabase
    .from("municipalities")
    .select("id, code, slug, name, description, region_name")
    .order("name", { ascending: true });

  if (error) {
    throw new Error("Could not load app_v2 municipality slugs.");
  }

  const rows = (data ?? []) as MunicipalityRow[];

  return rows.map((row) =>
    normalizeMunicipality(row, { activeShelterCount: 0, activeShelterTotalCapacity: 0 }).slug,
  );
}

const sitemapShelterPageSize = 1000;

export type AppV2CountryShelterMarker = {
  slug: string;
  name: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  capacity: number;
  sourceApplicationCode: string | null;
  latitude: number;
  longitude: number;
};

type CountryShelterMarkerRow = {
  id: string;
  slug: string;
  name: string;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  capacity: number | string | null;
  source_application_code: string | null;
  canonical_source_name: string | null;
  canonical_source_reference: string | null;
};

function normalizeCountryShelterMarker(row: CountryShelterMarkerRow): AppV2CountryShelterMarker | null {
  const latitude = row.latitude === null || row.latitude === undefined ? Number.NaN : Number(row.latitude);
  const longitude = row.longitude === null || row.longitude === undefined ? Number.NaN : Number(row.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const capacityValue =
    row.capacity === null || row.capacity === undefined ? Number.NaN : Number(row.capacity);
  const capacity = Number.isFinite(capacityValue) ? Math.trunc(capacityValue) : 0;

  const addressLine1 = (row.address_line1 ?? "").trim();
  const postalCode = (row.postal_code ?? "").trim();
  const city = (row.city ?? "").trim();

  return {
    slug: row.slug,
    name: row.name,
    addressLine1,
    postalCode,
    city,
    capacity,
    sourceApplicationCode: row.source_application_code,
    latitude,
    longitude,
  };
}

/**
 * Paginated read of public map markers (national map / sanity), from `country_marker_public`.
 */
export async function getAppV2CountryShelterMarkers(): Promise<AppV2CountryShelterMarker[]> {
  const supabase = createAppV2PublicClient();
  const out: AppV2CountryShelterMarker[] = [];
  let from = 0;

  while (true) {
    const to = from + sitemapShelterPageSize - 1;
    const { data, error } = await supabase
      .from("country_marker_public")
      .select(
        "id, slug, name, address_line1, postal_code, city, latitude, longitude, capacity, source_application_code, canonical_source_name, canonical_source_reference",
      )
      .order("slug", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Could not load app_v2 country shelter markers: ${error.message}`);
    }

    const rows = (data ?? []) as CountryShelterMarkerRow[];

    for (const row of rows) {
      const normalized = normalizeCountryShelterMarker(row);
      if (normalized) out.push(normalized);
    }

    if (rows.length < sitemapShelterPageSize) {
      break;
    }

    from += sitemapShelterPageSize;
  }

  return out;
}

/** Same as {@link getAppV2CountryShelterMarkers} (`country_marker_public`). */
export async function getAppV2PublicCountryShelterMarkers(): Promise<AppV2CountryShelterMarker[]> {
  return getAppV2CountryShelterMarkers();
}

export type AppV2SitemapShelterRow = {
  slug: string;
  lastModified: Date;
};

/**
 * Public sitemap rows from `sitemap_shelter_public` (same rules as map markers / nearby public model).
 */
export async function getAppV2PublicSitemapShelters(): Promise<AppV2SitemapShelterRow[]> {
  const supabase = createAppV2PublicClient();
  const out: AppV2SitemapShelterRow[] = [];
  let from = 0;

  while (true) {
    const to = from + sitemapShelterPageSize - 1;
    const { data, error } = await supabase
      .from("sitemap_shelter_public")
      .select("slug, last_modified")
      .order("slug", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Could not load app_v2 shelters for public sitemap: ${error.message}`);
    }

    const rows = (data ?? []) as Array<{ slug: string; last_modified: string | null }>;

    for (const row of rows) {
      out.push({
        slug: row.slug,
        lastModified: row.last_modified ? new Date(row.last_modified) : new Date(),
      });
    }

    if (rows.length < sitemapShelterPageSize) break;
    from += sitemapShelterPageSize;
  }

  return out;
}

export async function getAppV2MunicipalityBySlug(slug: string) {
  const supabase = createAppV2AdminClient();
  const slugCandidates = getMunicipalitySlugCandidates(slug);
  const { data, error } = await supabase
    .from("municipalities")
    .select("id, code, slug, name, description, region_name")
    .in("slug", slugCandidates)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load app_v2 municipality "${slug}".`);
  }

  if (!data) {
    return null;
  }

  const row = data as MunicipalityRow;
  const stats = await getAppV2PublicMunicipalityShelterStats(row.id);

  return normalizeMunicipality(row, {
    activeShelterCount: stats.activeShelterCount,
    activeShelterTotalCapacity: stats.totalCapacity,
  });
}

type MunicipalityShelterStatsRow = {
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  capacity: number | null;
  last_seen_at: string | null;
};

export async function getAppV2PublicMunicipalityShelterStats(
  municipalityId: string,
): Promise<AppV2MunicipalityShelterStats> {
  const supabase = createAppV2PublicClient();
  const postalAreas = new Map<
    string,
    {
      postalCode: string;
      city: string;
      activeShelterCount: number;
      totalCapacity: number;
    }
  >();
  let activeShelterCount = 0;
  let totalCapacity = 0;
  let largestCapacity: number | null = null;
  let latestSeenAt: string | null = null;
  let from = 0;

  while (true) {
    const to = from + municipalityStatsPageSize - 1;
    const { data, error } = await supabase
      .from("shelter_public")
      .select("address_line1, postal_code, city, capacity, last_seen_at")
      .eq("municipality_id", municipalityId)
      .range(from, to);

    if (error) {
      throw new Error(`Could not load app_v2 municipality shelter stats for "${municipalityId}".`);
    }

    const rows = (data ?? []) as MunicipalityShelterStatsRow[];

    for (const row of rows) {
      const capacity = row.capacity ?? 0;
      const postalCode = (row.postal_code ?? "").trim();
      const city = (row.city ?? "").trim();

      activeShelterCount += 1;
      totalCapacity += capacity;
      largestCapacity = largestCapacity === null ? capacity : Math.max(largestCapacity, capacity);

      if (row.last_seen_at && (!latestSeenAt || row.last_seen_at > latestSeenAt)) {
        latestSeenAt = row.last_seen_at;
      }

      const postalKey = `${postalCode}|${city}`;
      const postalArea = postalAreas.get(postalKey) ?? {
        postalCode,
        city,
        activeShelterCount: 0,
        totalCapacity: 0,
      };

      postalArea.activeShelterCount += 1;
      postalArea.totalCapacity += capacity;
      postalAreas.set(postalKey, postalArea);
    }

    if (rows.length < municipalityStatsPageSize) {
      break;
    }

    from += municipalityStatsPageSize;
  }

  return {
    activeShelterCount,
    totalCapacity,
    postalAreaCount: postalAreas.size,
    largestCapacity,
    latestSeenAt,
    postalAreas: Array.from(postalAreas.values())
      .sort(
        (a, b) =>
          b.activeShelterCount - a.activeShelterCount ||
          b.totalCapacity - a.totalCapacity ||
          a.postalCode.localeCompare(b.postalCode, "da-DK") ||
          a.city.localeCompare(b.city, "da-DK"),
      )
      .slice(0, 4),
  };
}

// ─── Municipality shelter list + grouping (Sprint 5) ────────────────────────

export type AppV2MunicipalityShelter = {
  id: string;
  slug: string;
  name: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  capacity: number;
  status: AppV2ShelterStatus;
  sourceApplicationCode: string | null;
  applicationCodeLabel: string | null;
};

export type AppV2MunicipalityShelterGroup = {
  groupKey: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  shelterCount: number;
  totalCapacity: number;
  slugs: string[];
  primarySlug: string;
  applicationCodeLabel: string | null;
};

type MunicipalityShelterRow = {
  id: string;
  slug: string;
  name: string;
  address_line1: string;
  postal_code: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  capacity: number;
  status: AppV2ShelterStatus;
  source_application_code: string | null;
  canonical_source_name?: string | null;
  canonical_source_reference?: string | null;
};

export async function getAppV2PublicMunicipalityShelters(
  municipalityId: string,
): Promise<AppV2MunicipalityShelter[]> {
  const pub = createAppV2PublicClient();
  const pageSize = 1000;
  const allRows: MunicipalityShelterRow[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await pub
      .from("shelter_public")
      .select(
        "id, slug, name, address_line1, postal_code, city, latitude, longitude, capacity, status, source_application_code, canonical_source_name, canonical_source_reference",
      )
      .eq("municipality_id", municipalityId)
      .order("address_line1", { ascending: true })
      .order("postal_code", { ascending: true })
      .order("capacity", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(
        `Could not load app_v2 municipality shelters for "${municipalityId}": ${error.message}`,
      );
    }

    const rows = (data ?? []) as MunicipalityShelterRow[];
    allRows.push(...rows);

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  const uniqueCodes = Array.from(
    new Set(allRows.map((r) => r.source_application_code).filter((c): c is string => c !== null)),
  );
  const labelByCode = new Map<string, string>();
  if (uniqueCodes.length > 0) {
    const admin = createAppV2AdminClient();
    const { data: labelRows, error: labelError } = await admin
      .from("application_code_eligibility")
      .select("application_code, label")
      .eq("source_name", "datafordeler-bbr-dar")
      .in("application_code", uniqueCodes);
    if (labelError) {
      throw new Error(`Could not load app_v2 application code labels: ${labelError.message}`);
    }
    for (const row of (labelRows ?? []) as Array<{ application_code: string; label: string | null }>) {
      if (row.label) labelByCode.set(row.application_code, row.label);
    }
  }

  return allRows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    addressLine1: row.address_line1,
    postalCode: row.postal_code,
    city: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
    capacity: row.capacity,
    status: row.status,
    sourceApplicationCode: row.source_application_code,
    applicationCodeLabel: row.source_application_code ? (labelByCode.get(row.source_application_code) ?? null) : null,
  }));
}

export function groupMunicipalityShelters(
  shelters: AppV2MunicipalityShelter[],
): AppV2MunicipalityShelterGroup[] {
  const groups = new Map<string, AppV2MunicipalityShelter[]>();

  for (const shelter of shelters) {
    const key =
      shelter.addressLine1.toLowerCase().trim() + "|" + shelter.postalCode.trim();
    groups.set(key, [...(groups.get(key) ?? []), shelter]);
  }

  return Array.from(groups.entries())
    .map(([groupKey, groupShelters]) => {
      // Primary shelter = highest capacity (already sorted desc from query)
      const primary = [...groupShelters].sort((a, b) => b.capacity - a.capacity)[0]!;

      // Most frequent applicationCodeLabel
      const labelCounts = new Map<string, number>();
      for (const s of groupShelters) {
        if (s.applicationCodeLabel) {
          labelCounts.set(
            s.applicationCodeLabel,
            (labelCounts.get(s.applicationCodeLabel) ?? 0) + 1,
          );
        }
      }
      let dominantLabel: string | null = null;
      let maxCount = 0;
      Array.from(labelCounts.entries()).forEach(([label, count]) => {
        if (count > maxCount) {
          dominantLabel = label;
          maxCount = count;
        }
      });

      return {
        groupKey,
        addressLine1: primary.addressLine1,
        postalCode: primary.postalCode,
        city: primary.city,
        latitude: primary.latitude,
        longitude: primary.longitude,
        shelterCount: groupShelters.length,
        totalCapacity: groupShelters.reduce((sum, s) => sum + s.capacity, 0),
        slugs: groupShelters.map((s) => s.slug),
        primarySlug: primary.slug,
        applicationCodeLabel: dominantLabel,
      };
    })
    .sort((a, b) =>
      a.addressLine1.localeCompare(b.addressLine1, "da-DK") ||
      a.postalCode.localeCompare(b.postalCode),
    );
}

// ─────────────────────────────────────────────────────────────────────────────

export async function getAppV2ShelterBySlug(slug: string) {
  const supabase = createAppV2AdminClient();
  const { data: shelterData, error: shelterError } = await supabase
    .from("shelters")
    .select(
      "id, municipality_id, slug, name, address_line1, postal_code, city, latitude, longitude, capacity, status, accessibility_notes, summary, source_summary, import_state, last_seen_at, last_imported_at, canonical_source_name, canonical_source_reference, source_application_code",
    )
    .eq("slug", slug)
    .eq("import_state", "active")
    .maybeSingle();

  if (shelterError) {
    throw new Error(`Could not load app_v2 shelter "${slug}".`);
  }

  if (!shelterData) {
    return null;
  }

  const shelter = shelterData as ShelterRow;
  const { data: municipalityData, error: municipalityError } = await supabase
    .from("municipalities")
    .select("id, code, slug, name, description, region_name")
    .eq("id", shelter.municipality_id)
    .single();

  if (municipalityError || !municipalityData) {
    throw new Error(`Could not load app_v2 municipality for shelter "${slug}".`);
  }

  const stats = await getAppV2PublicMunicipalityShelterStats(shelter.municipality_id);
  const municipality = normalizeMunicipality(municipalityData as MunicipalityRow, {
    activeShelterCount: stats.activeShelterCount,
    activeShelterTotalCapacity: stats.totalCapacity,
  });

  return normalizeShelter(shelter, municipality);
}

export async function getAppV2PublicShelterBySlug(slug: string) {
  const pub = createAppV2PublicClient();
  const { data: shelterData, error: shelterError } = await pub
    .from("shelter_public")
    .select(
      "id, municipality_id, slug, name, address_line1, postal_code, city, latitude, longitude, capacity, status, accessibility_notes, summary, source_summary, import_state, last_seen_at, last_imported_at, canonical_source_name, canonical_source_reference, source_application_code",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (shelterError) {
    throw new Error(`Could not load public app_v2 shelter "${slug}": ${shelterError.message}`);
  }

  if (!shelterData) {
    return null;
  }

  const shelter = shelterData as ShelterRow;
  const admin = createAppV2AdminClient();
  const { data: municipalityData, error: municipalityError } = await admin
    .from("municipalities")
    .select("id, code, slug, name, description, region_name")
    .eq("id", shelter.municipality_id)
    .single();

  if (municipalityError || !municipalityData) {
    throw new Error(`Could not load app_v2 municipality for shelter "${slug}".`);
  }

  const stats = await getAppV2PublicMunicipalityShelterStats(shelter.municipality_id);
  const municipality = normalizeMunicipality(municipalityData as MunicipalityRow, {
    activeShelterCount: stats.activeShelterCount,
    activeShelterTotalCapacity: stats.totalCapacity,
  });

  return normalizeShelter(shelter, municipality);
}
