import { normalizeMunicipalityDisplay } from "@/lib/municipalities/metadata";

export type AppV2ShelterStatus = "active" | "temporarily_closed" | "under_review";
export type AppV2ImportState = "active" | "missing_from_source" | "suppressed";
export type AppV2NearbyEligibilityMode = "source_application_code_v1" | "none";
type AppV2ImportRunStatus = "running" | "succeeded" | "failed";

export type MunicipalitySummaryRow = {
  municipality_id: string;
  code: string | null;
  slug: string;
  name: string;
  description: string | null;
  region_name: string | null;
  public_registration_count: number | string | null;
  public_capacity: number | string | null;
  mapped_registration_count: number | string | null;
  mapped_capacity: number | string | null;
  latest_public_import_at: string | null;
};

export type ShelterRow = {
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

export type PublicShelterRow = {
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
  accessibility_notes: string | null;
  summary: string;
  source_summary: string;
  last_seen_at: string | null;
  last_imported_at: string | null;
  source_application_code: string | null;
};

export type ImportRunRow = {
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

export type AppV2PublicShelterDetail = Omit<
  AppV2ShelterDetail,
  "status" | "importState" | "canonicalSourceName" | "canonicalSourceReference"
>;

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

export function normalizeMunicipality(
  row: MunicipalitySummaryRow,
): AppV2MunicipalityDetail {
  const display = normalizeMunicipalityDisplay({
    id: row.municipality_id,
    slug: row.slug,
    name: row.name,
  });

  return {
    id: row.municipality_id,
    code: row.code,
    slug: display.slug,
    name: display.name,
    description: row.description,
    regionName: row.region_name,
    activeShelterCount: normalizePublicStat(row.public_registration_count),
    activeShelterTotalCapacity: normalizePublicStat(row.public_capacity),
  };
}

export function normalizeImportRun(row: ImportRunRow): AppV2ImportRunSummary {
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

export function normalizeShelter(row: ShelterRow, municipality: AppV2MunicipalityDetail): AppV2ShelterDetail {
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

export function normalizePublicShelter(
  row: PublicShelterRow,
  municipality: AppV2MunicipalityDetail,
): AppV2PublicShelterDetail {
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
    sourceApplicationCode: row.source_application_code,
    accessibilityNotes: row.accessibility_notes,
    summary: row.summary,
    sourceSummary: row.source_summary,
    lastSeenAt: row.last_seen_at,
    lastImportedAt: row.last_imported_at,
    municipality,
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getString(value: unknown, fieldName: string) {
  if (typeof value !== "string") {
    throw new Error(`app_v2 nearby RPC returned invalid ${fieldName}.`);
  }

  return value;
}

export function getNullableString(value: unknown, fieldName: string) {
  if (value === null || value === undefined) {
    return null;
  }

  return getString(value, fieldName);
}

export function getNumber(value: unknown, fieldName: string) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  if (!Number.isFinite(numberValue)) {
    throw new Error(`app_v2 nearby RPC returned invalid ${fieldName}.`);
  }

  return numberValue;
}

export function getInteger(value: unknown, fieldName: string) {
  const numberValue = getNumber(value, fieldName);

  if (!Number.isInteger(numberValue)) {
    throw new Error(`app_v2 nearby RPC returned invalid ${fieldName}.`);
  }

  return numberValue;
}

export function getBoolean(value: unknown, fieldName: string) {
  if (typeof value !== "boolean") {
    throw new Error(`app_v2 nearby RPC returned invalid ${fieldName}.`);
  }

  return value;
}

export function parseJsonArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new Error(`app_v2 nearby RPC returned invalid ${fieldName}.`);
  }

  return value;
}

export function normalizePublicStat(value: number | string | null) {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) && numericValue >= 0 ? Math.trunc(numericValue) : 0;
}

export const sitemapShelterPageSize = 1000;
