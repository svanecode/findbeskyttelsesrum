import { getMunicipalitySlugCandidates, normalizeMunicipalityDisplay } from "@/lib/municipalities/metadata";
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
};

export type AppV2MunicipalityDetail = AppV2MunicipalitySummary & {
  description: string | null;
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
  eligibilityMode?: AppV2NearbyEligibilityMode;
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
const defaultNearbyRadiusMeters = 50_000;
const defaultNearbyLimit = 10;
const defaultNearbyCandidateLimit = 500;
const defaultNearbyImportStates: AppV2ImportState[] = ["active"];
const defaultNearbyEligibilityMode: AppV2NearbyEligibilityMode = "legacy_capacity_v1";
const legacyNearbyMinimumCapacity = 40;
const sourceApplicationCodeRuleSource = "app_v2.application_code_eligibility";
const sourceApplicationCodeLookupChunkSize = 100;
const allowedImportStates: AppV2ImportState[] = ["active", "missing_from_source", "suppressed"];

function createAppV2ReadClient() {
  return createAppV2AdminClient();
}

function normalizeMunicipality(row: MunicipalityRow, activeShelterCount: number): AppV2MunicipalityDetail {
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
    activeShelterCount,
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

function getNearbyEligibilityMode(input: AppV2NearbySheltersOptions) {
  const mode = input.eligibilityMode ?? defaultNearbyEligibilityMode;

  if (mode !== "legacy_capacity_v1" && mode !== "source_application_code_v1" && mode !== "none") {
    throw new Error(`Nearby app_v2 query received unsupported eligibility mode: ${String(mode)}.`);
  }

  return mode;
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

  const supabase = createAppV2ReadClient();
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

function applyNearbyEligibility(rows: AppV2NearbyShelter[], mode: AppV2NearbyEligibilityMode) {
  if (mode === "none") {
    return {
      rows,
      minimumCapacity: null,
      filteredByEligibility: 0,
      sourceApplicationCodeRows: rows.filter((row) => row.sourceApplicationCode).length,
      sourceApplicationCodeEligibleRows: 0,
      sourceApplicationCodeUnknownRows: 0,
      sourceApplicationCodeSemantics: "not_requested" as const,
    };
  }

  const capacityEligibleRows = rows.filter((row) => row.capacity >= legacyNearbyMinimumCapacity);
  const sourceApplicationCodeRows = rows.filter((row) => row.sourceApplicationCode).length;

  if (mode === "source_application_code_v1") {
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

  return {
    rows: capacityEligibleRows,
    minimumCapacity: legacyNearbyMinimumCapacity,
    filteredByEligibility: rows.length - capacityEligibleRows.length,
    sourceApplicationCodeRows,
    sourceApplicationCodeEligibleRows: 0,
    sourceApplicationCodeUnknownRows: 0,
    sourceApplicationCodeSemantics: "not_requested" as const,
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

function groupNearbyRows(rows: AppV2NearbyShelter[], limit: number): AppV2GroupedNearbyShelter[] {
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
      };
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters || a.groupKey.localeCompare(b.groupKey))
    .slice(0, limit);
}

async function getActiveShelterCountByMunicipalityId(municipalityId: string) {
  const supabase = createAppV2ReadClient();
  const { count, error } = await supabase
    .from("shelters")
    .select("id", { count: "exact", head: true })
    .eq("municipality_id", municipalityId)
    .eq("import_state", "active");

  if (error) {
    throw new Error(`Could not count active app_v2 shelters for municipality "${municipalityId}".`);
  }

  return count ?? 0;
}

export async function getAppV2ShelterCount(options: ShelterCountOptions = {}) {
  const supabase = createAppV2ReadClient();
  const query = supabase.from("shelters").select("id", { count: "exact", head: true });
  const scopedQuery = options.includeMissing ? query : query.eq("import_state", "active");
  const { count, error } = await scopedQuery;

  if (error) {
    throw new Error("Could not count app_v2 shelters.");
  }

  return count ?? 0;
}

export async function getAppV2TotalShelterCapacity() {
  const supabase = createAppV2ReadClient();
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
  const supabase = createAppV2ReadClient();
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

export async function getAppV2NearbySheltersWithDiagnostics(
  options: AppV2NearbySheltersOptions,
): Promise<AppV2NearbySheltersResult> {
  assertValidCoordinate(options);

  const supabase = createAppV2ReadClient();
  const radiusMeters = options.radiusMeters ?? defaultNearbyRadiusMeters;
  const limit = options.limit ?? defaultNearbyLimit;
  const candidateLimit = options.candidateLimit ?? defaultNearbyCandidateLimit;
  const importStates = getNearbyImportStates(options);
  const eligibilityMode = getNearbyEligibilityMode(options);

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

  const rpcLimit = eligibilityMode === "none" ? limit : candidateLimit;
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
  const sourceRowsWithEligibility =
    eligibilityMode === "source_application_code_v1"
      ? await attachSourceApplicationCodeEligibility(sourceRows)
      : sourceRows;
  const eligibility = applyNearbyEligibility(sourceRowsWithEligibility, eligibilityMode);
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
      sourceApplicationCodeRuleSource:
        eligibilityMode === "source_application_code_v1" ? sourceApplicationCodeRuleSource : undefined,
      sourceApplicationCodeRows: eligibility.sourceApplicationCodeRows,
      sourceApplicationCodeEligibleRows: eligibility.sourceApplicationCodeEligibleRows,
      sourceApplicationCodeUnknownRows: eligibility.sourceApplicationCodeUnknownRows,
      filteredByEligibility: eligibility.filteredByEligibility,
      eligibleRows: eligibility.rows.length,
      sourceReturnedRows: sourceRows.length,
    },
  };
}

export async function getAppV2NearbyShelters(options: AppV2NearbySheltersOptions): Promise<AppV2NearbyShelter[]> {
  const result = await getAppV2NearbySheltersWithDiagnostics(options);

  return result.rows;
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
  const groupedRows = groupNearbyRows(rowResult.rows, groupLimit);

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

export async function getAppV2GroupedNearbyShelters(
  options: AppV2NearbySheltersOptions,
): Promise<AppV2GroupedNearbyShelter[]> {
  const result = await getAppV2GroupedNearbySheltersWithDiagnostics(options);

  return result.rows;
}

export async function getAppV2MunicipalitySummaries() {
  const supabase = createAppV2ReadClient();
  const { data, error } = await supabase
    .from("municipalities")
    .select("id, code, slug, name, description, region_name")
    .order("name", { ascending: true });

  if (error) {
    throw new Error("Could not load app_v2 municipalities.");
  }

  const rows = (data ?? []) as MunicipalityRow[];

  return Promise.all(
    rows.map(async (row) => {
      const activeShelterCount = await getActiveShelterCountByMunicipalityId(row.id);
      return normalizeMunicipality(row, activeShelterCount);
    }),
  );
}

export async function getAppV2MunicipalitySlugs() {
  const supabase = createAppV2ReadClient();
  const { data, error } = await supabase
    .from("municipalities")
    .select("id, code, slug, name, description, region_name")
    .order("name", { ascending: true });

  if (error) {
    throw new Error("Could not load app_v2 municipality slugs.");
  }

  const rows = (data ?? []) as MunicipalityRow[];

  return rows.map((row) => normalizeMunicipality(row, 0).slug);
}

export async function getAppV2MunicipalityBySlug(slug: string) {
  const supabase = createAppV2ReadClient();
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
  const activeShelterCount = await getActiveShelterCountByMunicipalityId(row.id);

  return normalizeMunicipality(row, activeShelterCount);
}

export async function getAppV2ShelterBySlug(slug: string) {
  const supabase = createAppV2ReadClient();
  const { data: shelterData, error: shelterError } = await supabase
    .from("shelters")
    .select(
      "id, municipality_id, slug, name, address_line1, postal_code, city, latitude, longitude, capacity, status, accessibility_notes, summary, source_summary, import_state, last_seen_at, last_imported_at, canonical_source_name, canonical_source_reference",
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

  const activeShelterCount = await getActiveShelterCountByMunicipalityId(shelter.municipality_id);
  const municipality = normalizeMunicipality(municipalityData as MunicipalityRow, activeShelterCount);

  return normalizeShelter(shelter, municipality);
}
